/**
 * Execution Configuration
 *
 * Environment variable validation and configuration management
 */

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'ANTHROPIC_API_KEY'
] as const;

/**
 * Optional environment variables
 */
const OPTIONAL_ENV_VARS = [
  'GITHUB_TOKEN',
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_APP_ID',
  'GITHUB_PRIVATE_KEY',
  'PORT',
  'NODE_ENV'
] as const;

/**
 * Configuration interface
 */
export interface ExecutionConfig {
  anthropic: {
    apiKey: string;
    baseURL?: string;
    timeout?: number;
  };
  github?: {
    token?: string;
    webhookSecret?: string;
    appId?: string;
    privateKey?: string;
  };
  server?: {
    port?: number;
    nodeEnv?: string;
  };
}

/**
 * Validate environment variables
 *
 * @throws Error if required variables are missing
 */
export function validateEnvironment(): void {
  const missing: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
      missing.map(v => `  - ${v}`).join('\n') +
      `\n\nPlease set these in your .env file or environment.`
    );
  }

  console.log('[Config] ✓ All required environment variables present');
}

/**
 * Load configuration from environment
 *
 * @returns Configuration object
 */
export function loadConfig(): ExecutionConfig {
  // Validate first
  validateEnvironment();

  const config: ExecutionConfig = {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      baseURL: process.env.ANTHROPIC_BASE_URL,
      timeout: process.env.ANTHROPIC_TIMEOUT ?
        parseInt(process.env.ANTHROPIC_TIMEOUT, 10) : undefined
    }
  };

  // GitHub configuration (optional)
  if (process.env.GITHUB_TOKEN) {
    config.github = {
      ...config.github,
      token: process.env.GITHUB_TOKEN
    };
  }

  if (process.env.GITHUB_WEBHOOK_SECRET) {
    config.github = {
      ...config.github,
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
    };
  }

  if (process.env.GITHUB_APP_ID) {
    config.github = {
      ...config.github,
      appId: process.env.GITHUB_APP_ID
    };
  }

  if (process.env.GITHUB_PRIVATE_KEY) {
    config.github = {
      ...config.github,
      privateKey: process.env.GITHUB_PRIVATE_KEY
    };
  }

  // Server configuration (optional)
  if (process.env.PORT || process.env.NODE_ENV) {
    config.server = {
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
      nodeEnv: process.env.NODE_ENV
    };
  }

  console.log('[Config] ✓ Configuration loaded');

  return config;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get server port with default
 */
export function getServerPort(): number {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (isNaN(port)) {
    console.warn(`[Config] Invalid PORT value, using default: 3000`);
    return 3000;
  }

  return port;
}
