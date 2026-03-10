/**
 * Authentication & Signature Verification Middleware
 *
 * Security middleware for GitHub webhook signature verification
 */

import * as crypto from 'crypto';

/**
 * Verify GitHub webhook signature
 *
 * @param payload - Raw request body
 * @param signature - X-Hub-Signature-256 header value
 * @param secret - Webhook secret
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // Extract signature hash
  const signatureParts = signature.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
    console.error(`[Auth] Invalid signature format`);
    return false;
  }

  const providedHash = signatureParts[1];

  // Compute expected hash
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedHash = hmac.digest('hex');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedHash, 'utf8'),
    Buffer.from(providedHash, 'utf8')
  );
}

/**
 * Express middleware for signature verification
 */
export function webhookSignatureAuth(webhookSecret: string) {
  return (req: any, res: any, next: any) => {
    const signature = req.headers['x-hub-signature-256'];

    if (!signature) {
      console.warn(`[Auth] Missing signature header`);
      return res.status(401).json({ error: 'Missing signature' });
    }

    const isValid = verifyWebhookSignature(
      req.body,
      signature,
      webhookSecret
    );

    if (!isValid) {
      console.warn(`[Auth] Invalid signature`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Signature is valid, proceed
    next();
  };
}

/**
 * Validate GitHub App installation
 */
export function validateGitHubAppInstallation(req: any, res: any, next: any) {
  const installationId = req.body?.installation?.id;

  if (!installationId) {
    console.warn(`[Auth] Missing installation ID`);
    return res.status(400).json({ error: 'Missing installation ID' });
  }

  // Store installation ID for later use
  req.installationId = installationId;

  next();
}

/**
 * Rate limiting middleware (basic implementation)
 */
export function rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: any, res: any, next: any) => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    // Clean up old entries
    for (const [k, v] of requests.entries()) {
      if (now > v.resetTime) {
        requests.delete(k);
      }
    }

    // Get or create rate limit entry
    let entry = requests.get(key);

    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      requests.set(key, entry);
    }

    // Check limit
    if (entry.count >= maxRequests) {
      const resetTime = new Date(entry.resetTime).toISOString();
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', resetTime);
      return res.status(429).json({ error: 'Too many requests' });
    }

    // Increment counter
    entry.count++;

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

    next();
  };
}
