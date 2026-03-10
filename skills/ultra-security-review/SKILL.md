---
name: ultra-security-review
description: Comprehensive security review of code changes. Identifies vulnerabilities, validates authn/authz, checks for security anti-patterns. Adapted from everything-claude-code v1.4.1.
---

# Ultra Security Review

## Trigger Keywords
- "ultra security review", "security review", "vulnerability scan"
- "check security", "security audit", "OWASP review"
- "auth check", "authorization review", "input validation"
- "secrets scan", "dependency audit", "security check"

## Description
Comprehensive security review covering OWASP Top 10, authentication/authorization, input validation, secrets detection, and dependency security. Provides detailed vulnerability analysis with severity ratings and remediation guidance.

## Review Areas

### 1. OWASP Top 10 Coverage
- **A01:2021 – Broken Access Control**
  - Authorization bypasses
  - Privilege escalation risks
  - Missing authentication on sensitive endpoints
  - CORS misconfigurations

- **A02:2021 – Cryptographic Failures**
  - Hardcoded secrets (API keys, passwords, tokens)
  - Weak encryption algorithms
  - Insecure random number generation
  - Sensitive data in logs

- **A03:2021 – Injection**
  - SQL injection vulnerabilities
  - NoSQL injection
  - Command injection
  - LDAP injection
  - XPath injection

- **A04:2021 – Insecure Design**
  - Missing rate limiting
  - Insecure direct object references (IDOR)
  - Mass assignment vulnerabilities
  - Missing business logic validation

- **A05:2021 – Security Misconfiguration**
  - Debug mode enabled in production
  - Default credentials not changed
  - Directory listing enabled
  - Verbose error messages
  - Missing security headers

- **A06:2021 – Vulnerable and Outdated Components**
  - Outdated dependencies with known CVEs
  - Unmaintained libraries
  - Missing dependency updates

- **A07:2021 – Identification and Authentication Failures**
  - Weak password policies
  - Session fixation
  - Missing multi-factor authentication
  - Credential stuffing vulnerabilities
  - JWT validation issues

- **A08:2021 – Software and Data Integrity Failures**
  - Insecure deserialization
  - Code injection via auto-updates
  - CI/CD pipeline vulnerabilities

- **A09:2021 – Security Logging and Monitoring Failures**
  - Insufficient logging
  - Missing audit trails
  - No intrusion detection

- **A10:2021 – Server-Side Request Forgery (SSRF)**
  - User-controlled URLs in requests
  - Internal network access
  - Cloud metadata endpoint access

### 2. Authentication & Authorization
- Password hashing (bcrypt, Argon2, scrypt)
- JWT validation and signing
- Session management
- OAuth/OpenID Connect flows
- API key handling
- Multi-factor authentication
- Password reset flows
- Account lockout mechanisms

### 3. Input Validation
- SQL injection prevention (parameterized queries, ORM)
- XSS prevention (output encoding, CSP)
- CSRF token validation
- File upload validation
- Path traversal prevention
- Command injection prevention
- Type validation
- Length checks
- Format validation (email, phone, etc.)

### 4. Secrets Detection
- Hardcoded API keys
- Database credentials
- JWT secrets
- Private keys
- OAuth tokens
- AWS/Google Cloud/Azure credentials
- Third-party service keys
- Certificates

### 5. Dependency Security
- Vulnerable dependencies (CVE scanning)
- Outdated packages
- Transitive dependencies
- License compliance
- Supply chain risks

## Severity Levels

### Critical (Fix Immediately)
- Remote code execution (RCE)
- SQL injection in production code
- Authentication bypass
- Hardcoded production secrets
- SSRF to internal systems
- Deserialization attacks

### High (Fix Within 24 Hours)
- XSS in authenticated pages
- CSRF on sensitive actions
- IDOR on sensitive data
- Privilege escalation
- Weak encryption
- Missing authentication on sensitive endpoints
- Outdated dependencies with critical CVEs

### Medium (Fix Within 1 Week)
- Information disclosure
- Security misconfigurations
- Missing rate limiting
- Weak password policies
- Insufficient logging
- Outdated dependencies with high CVEs

### Low (Fix Within 1 Month)
- Missing security headers
- Verbose error messages
- Cookie security flags
- Outdated dependencies with medium/low CVEs
- Minor configuration improvements

## Output Format

```markdown
# Ultra Security Review

## Scope
- Files Reviewed: [list of files]
- Language/Framework: [e.g., TypeScript/Node.js, Python/Django]
- Review Date: [timestamp]

## Summary
- Critical Issues: X
- High Issues: Y
- Medium Issues: Z
- Low Issues: W

**Overall Risk Level:** CRITICAL / HIGH / MEDIUM / LOW

## Critical Issues

### 1. [Issue Title]
**Category:** [OWASP category, e.g., A03:2021 - Injection]
**Severity:** CRITICAL
**Location:** `path/to/file.ts:123`
**Exploitability:** Remote/Local, Authenticated/Unauthenticated
**Blast Radius:** [What an attacker can do]

**Issue:** [Detailed description]

**Vulnerable Code:**
```language
// Show the vulnerable code
```

**Remediation:**
```language
// Show the secure fix
```

**References:** [CWE, OWASP links]

## High Issues
[Same format as above]

## Medium Issues
[Same format as above]

## Low Issues
[Same format as above]

## Security Checklist
- [ ] No hardcoded secrets detected
- [ ] Input validation verified on all endpoints
- [ ] SQL injection prevention checked
- [ ] XSS prevention verified
- [ ] CSRF protection implemented
- [ ] Authentication/authorization verified
- [ ] Dependency audit completed
- [ ] Security headers configured
- [ ] Session management secure
- [ ] Error handling doesn't leak information

## Dependency Audit
```bash
[npm/pip/cargo/govulncheck] audit output
```

**Action Required:** [List updates needed]

## Recommendations
1. [Priority fix recommendations]
2. [Security best practices to adopt]
3. [Monitoring/logging improvements]
4. [Security testing recommendations]

## Approval Status
❌ **REJECTED** - Critical/High issues must be fixed
⚠️ **CONDITIONAL** - Medium issues should be addressed
✅ **APPROVED** - Only low issues or none found
```

## Standards Enforced

### Authentication Standards
- Passwords MUST be hashed with bcrypt/Argon2/scrypt (work factor ≥ 12)
- JWTs MUST be validated (signature, expiration, issuer)
- Sessions MUST use secure, HttpOnly, SameSite cookies
- MFA MUST be available for sensitive operations
- Password reset tokens MUST expire within 1 hour

### Authorization Standards
- Every endpoint MUST verify user permissions
- Use principle of least privilege
- No security through obscurity
- Validate ownership on all resource access

### Input Validation Standards
- All user input MUST be validated
- Use parameterized queries for DB access
- Output encoding MUST be context-aware
- File uploads MUST validate type, size, content
- Whitelist approach over blacklist

### Cryptography Standards
- Use vetted libraries (no home-grown crypto)
- TLS 1.2+ for all network communication
- Use AES-GCM or ChaCha20-Poly1305 for encryption
- Random generation MUST use cryptographically secure RNG
- Key rotation MUST be supported

### Dependency Standards
- Weekly dependency updates recommended
- Critical CVE patches within 24 hours
- High CVE patches within 1 week
- Monitor transitive dependencies
- Use lock files (package-lock.json, poetry.lock)

## Usage

```bash
# Review all changes
/ultra-security-review

# Review specific files
/ultra-security-review src/api/auth.ts

# Review git diff
/ultra-security-review --diff HEAD~1

# Scan for secrets only
/ultra-security-review --secrets

# Dependency audit only
/ultra-security-review --dependencies

# Full audit with remediation
/ultra-security-review --full
```

## Examples

### Critical: SQL Injection

**Vulnerable Code:**
```python
# BAD: String concatenation
def get_user(user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"
    return cursor.execute(query)
```

**Secure Code:**
```python
# GOOD: Parameterized query
def get_user(user_id):
    query = "SELECT * FROM users WHERE id = %s"
    return cursor.execute(query, (user_id,))
```

**Finding:**
- **Category:** A03:2021 - Injection
- **Severity:** CRITICAL
- **Exploitability:** Remote, unauthenticated via API
- **Blast Radius:** Full database access, data breach

### High: XSS Vulnerability

**Vulnerable Code:**
```javascript
// BAD: Unescaped output
function renderComment(comment) {
  return `<div>${comment.text}</div>`;
}
```

**Secure Code:**
```javascript
// GOOD: Escaped output
import { escape } from 'validator';

function renderComment(comment) {
  return `<div>${escape(comment.text)}</div>`;
}
```

### Medium: Hardcoded Secrets

**Vulnerable Code:**
```typescript
// BAD: Hardcoded secret
const API_KEY = "sk_live_1234567890abcdef";
```

**Secure Code:**
```typescript
// GOOD: Environment variable
const API_KEY = process.env.API_KEY!;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}
```

### Low: Missing Security Headers

**Current:**
```nginx
# Missing headers
server {
    listen 443 ssl;
    # ...
}
```

**Recommended:**
```nginx
# Security headers added
server {
    listen 443 ssl;

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'" always;
    add_header Referrer-Policy "no-referrer" always;
}
```

## Tools and Commands

### Secrets Scanning
```bash
# Scan for common secret patterns
grep -r -i "api[_-]?key\|password\|secret\|token" --include="*.ts" --include="*.js" --include="*.py"

# Scan git history
git log -p --all -S "password" -- "*.ts" "*.js" "*.py"

# Use trufflehog (if available)
trufflehog git .
```

### Dependency Auditing
```bash
# Node.js
npm audit
npm audit fix

# Python
pip-audit
safety check

# Rust
cargo audit

# Go
govulncheck ./...

# Java
mvn org.owasp:dependency-check-maven:check
```

### Static Analysis
```bash
# TypeScript
npm run lint
npx eslint . --ext .ts

# Python
bandit -r .
pylint src/

# Security-focused
semgrep --config=security
```

## Integration

Routes to `ultra-security-reviewer` agent with model="sonnet" for standard reviews or model="opus" for complex systems.

Works with:
- `ultra-quality-reviewer` agent for performance/complexity analysis
- `ultra-code-reviewer` agent for comprehensive code review
- `verifier` agent for validation of security fixes

## Approval Criteria

**Automatic Approval:**
- No critical or high issues
- No hardcoded secrets in current code
- All dependencies up-to-date (no critical/high CVEs)
- Input validation on all user inputs
- Authentication/authorization properly implemented

**Conditional Approval:**
- Medium issues present with documented remediation plan
- Low issues only
- Dependencies need updates (no critical CVEs)

**Automatic Rejection:**
- Any critical issue
- Any high issue
- Hardcoded production secrets
- Missing authentication on sensitive endpoints
- SQL injection or other injection vulnerabilities
- No dependency audit performed

## Attribution

Adapted from everything-claude-code v1.4.1 by Affaan Mustafa (MIT License).
Based on OWASP Top 10 2021 and security best practices.
