/**
 * GitHub App Authentication Service
 *
 * Provides secure authentication using GitHub Apps instead of Personal Access Tokens.
 * Benefits:
 * - Tokens expire after 1 hour (auto-rotation, better security)
 * - Granular permissions (read/write only what's needed)
 * - Per-installation rate limits (5000 requests/hour per installation)
 * - Better security audit trail
 * - No personal token exposure
 */

import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration for GitHub App authentication
 */
export interface GitHubAppConfig {
  appId: number;
  privateKey: string;
  installationId: number;
}

/**
 * Authentication result with token and metadata
 */
export interface AuthResult {
  token: string;
  expiresAt: Date;
  repository: string;
}

/**
 * GitHub App authentication manager with token caching
 */
export class GitHubAppAuthManager {
  private config: GitHubAppConfig;
  private cachedToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private repository: string;

  constructor(config: GitHubAppConfig, repository: string = 'hscheema1979/ultra-workspace') {
    this.config = config;
    this.repository = repository;
  }

  /**
   * Load GitHub App configuration from environment variables
   */
  static fromEnv(repository?: string): GitHubAppAuthManager {
    const appId = process.env.GITHUB_APP_ID;
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
    const privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

    if (!appId || !installationId || !privateKeyPath) {
      throw new Error(
        'Missing required environment variables: GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY_PATH'
      );
    }

    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`Private key file not found: ${privateKeyPath}`);
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');

    return new GitHubAppAuthManager(
      {
        appId: parseInt(appId, 10),
        installationId: parseInt(installationId, 10),
        privateKey,
      },
      repository
    );
  }

  /**
   * Get authentication token with caching
   * Tokens expire after 1 hour, so we cache and refresh as needed
   */
  async getToken(): Promise<string> {
    // Return cached token if still valid
    if (this.cachedToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.cachedToken;
    }

    // Get fresh token
    try {
      const auth = createAppAuth({
        appId: this.config.appId,
        privateKey: this.config.privateKey,
        installationId: this.config.installationId,
      });

      const authentication = await auth({ type: 'installation' });

      if (!authentication.token) {
        throw new Error('Failed to obtain authentication token');
      }

      // Cache token (expire 5 minutes early to be safe)
      this.cachedToken = authentication.token;
      this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000); // 55 minutes

      return authentication.token;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`GitHub App authentication failed: ${error.message}`);
      }
      throw new Error('GitHub App authentication failed: Unknown error');
    }
  }

  /**
   * Get authenticated Octokit instance
   */
  async getOctokit(): Promise<Octokit> {
    const token = await this.getToken();
    return new Octokit({
      auth: token,
    });
  }

  /**
   * Test authentication by making a simple API call
   */
  async testConnection(): Promise<boolean> {
    try {
      const octokit = await this.getOctokit();
      const { data } = await octokit.rest.repos.get({
        owner: this.repository.split('/')[0],
        repo: this.repository.split('/')[1],
      });
      return data.full_name === this.repository;
    } catch (error) {
      console.error('GitHub App connection test failed:', error);
      return false;
    }
  }

  /**
   * Clear cached token (force refresh on next request)
   */
  clearCache(): void {
    this.cachedToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get repository information
   */
  getRepository(): string {
    return this.repository;
  }

  /**
   * Get installation token (alias for getToken for compatibility with GitHubService)
   */
  async getInstallationToken(installationId?: number): Promise<string> {
    // If installationId is provided and different from current, update config
    if (installationId && installationId !== this.config.installationId) {
      this.config.installationId = installationId;
      this.clearCache();
    }
    return this.getToken();
  }

  /**
   * Check if token needs rotation
   */
  shouldRotateToken(): boolean {
    if (!this.tokenExpiry) return true;
    // Rotate if expires in less than 5 minutes
    return this.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000;
  }

  /**
   * Close connection and clear cache
   */
  async close(): Promise<void> {
    this.clearCache();
  }
}

/**
 * Standalone function to create GitHub App authentication
 */
export async function createGitHubAppAuth(
  config: GitHubAppConfig,
  repository: string = 'hscheema1979/ultra-workspace'
): Promise<string> {
  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: config.installationId,
  });

  const { token } = await auth({ type: 'installation' });
  return token;
}

/**
 * Create Octokit instance with GitHub App authentication
 */
export async function createGitHubAppOctokit(
  config: GitHubAppConfig
): Promise<Octokit> {
  const token = await createGitHubAppAuth(config);
  return new Octokit({ auth: token });
}

/**
 * Error handler for authentication failures
 */
export class GitHubAppAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'GitHubAppAuthError';
  }
}

/**
 * Validate GitHub App configuration
 */
export function validateGitHubAppConfig(config: GitHubAppConfig): void {
  if (!config.appId || typeof config.appId !== 'number') {
    throw new GitHubAppAuthError(
      'Invalid App ID: must be a number',
      'INVALID_APP_ID'
    );
  }

  if (!config.privateKey || typeof config.privateKey !== 'string') {
    throw new GitHubAppAuthError(
      'Invalid private key: must be a string',
      'INVALID_PRIVATE_KEY'
    );
  }

  // Check if private key is valid PEM format
  if (
    !config.privateKey.includes('-----BEGIN RSA PRIVATE KEY-----') ||
    !config.privateKey.includes('-----END RSA PRIVATE KEY-----')
  ) {
    throw new GitHubAppAuthError(
      'Invalid private key format: must be PEM format',
      'INVALID_PRIVATE_KEY_FORMAT'
    );
  }

  if (!config.installationId || typeof config.installationId !== 'number') {
    throw new GitHubAppAuthError(
      'Invalid Installation ID: must be a number',
      'INVALID_INSTALLATION_ID'
    );
  }
}

/**
 * Singleton instance for easy access
 */
let authManagerInstance: GitHubAppAuthManager | null = null;

/**
 * Get or create singleton auth manager instance
 */
export function getAuthManager(repository?: string): GitHubAppAuthManager {
  if (!authManagerInstance) {
    authManagerInstance = GitHubAppAuthManager.fromEnv(repository);
  }
  return authManagerInstance;
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetAuthManager(): void {
  authManagerInstance = null;
}

/**
 * Example usage:
 *
 * ```typescript
 * // Using singleton
 * const authManager = getAuthManager();
 * const token = await authManager.getToken();
 * const octokit = await authManager.getOctokit();
 *
 * // Using standalone function
 * const token = await createGitHubAppAuth({
 *   appId: 123456,
 *   privateKey: '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',
 *   installationId: 789012,
 * });
 *
 * // Testing connection
 * const isConnected = await authManager.testConnection();
 * console.log('GitHub App connection:', isConnected ? 'SUCCESS' : 'FAILED');
 * ```
 */
