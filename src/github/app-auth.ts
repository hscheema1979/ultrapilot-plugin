/**
 * GitHub App Authentication
 *
 * JWT-based authentication for GitHub Apps
 * Features:
 * - JWT generation
 * - Installation token management
 * - Token caching and refresh
 */

import { App } from 'octokit';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs/promises';

export interface GitHubAppAuthConfig {
  appId: string;
  privateKey: string;
  installationId?: string;
}

/**
 * GitHub App Authentication Manager
 */
export class GitHubAppAuthManager {
  private config: GitHubAppAuthConfig;
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: GitHubAppAuthConfig) {
    // Validate configuration
    if (!config.appId) {
      throw new Error('GitHub App ID is required');
    }

    if (!config.privateKey) {
      throw new Error('GitHub App private key is required');
    }

    this.config = config;
  }

  /**
   * Generate JWT for GitHub App authentication
   */
  generateJWT(): string {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iat: now,
      exp: now + (10 * 60), // 10 minutes max
      iss: this.config.appId
    };

    return jwt.sign(payload, this.config.privateKey, { algorithm: 'RS256' });
  }

  /**
   * Get installation access token
   */
  async getInstallationToken(installationId?: string): Promise<string> {
    const targetInstallationId = installationId || this.config.installationId;

    if (!targetInstallationId) {
      throw new Error('Installation ID is required to get installation token');
    }

    // Check if cached token is still valid
    if (this.cachedToken && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }

    // Get new token
    const token = await this.fetchInstallationToken(targetInstallationId);

    // Cache token (expires 5 minutes early to be safe)
    this.cachedToken = token;
    this.tokenExpiry = Date.now() + (55 * 60 * 1000); // 55 minutes

    return token;
  }

  /**
   * Fetch installation token from GitHub
   */
  private async fetchInstallationToken(installationId: number): Promise<string> {
    const appJwt = this.generateJWT();

    const app = new App({
      appId: this.config.appId,
      privateKey: this.config.privateKey
    });

    const { data } = await app.octokit.request(
      'POST /app/installations/{installation_id}/access_tokens',
      {
        installation_id: installationId,
        headers: {
          authorization: `Bearer ${appJwt}`
        }
      }
    );

    return data.token;
  }

  /**
   * Create authenticated Octokit instance for installation
   */
  async getOctokit(installationId?: string): Promise<any> {
    const token = await this.getInstallationToken(installationId);

    const { Octokit } = await import('octokit');

    return new Octokit({
      auth: token
    });
  }

  /**
   * Get installation ID for a repository
   */
  async getInstallationId(owner: string, repo: string): Promise<number> {
    const appJwt = this.generateJWT();

    const app = new App({
      appId: this.config.appId,
      privateKey: this.config.privateKey
    });

    const { data } = await app.octokit.request(
      'GET /repos/{owner}/{repo}/installation',
      {
        owner,
        repo,
        headers: {
          authorization: `Bearer ${appJwt}`
        }
      }
    );

    return data.id;
  }

  /**
   * Clear cached token
   */
  clearCache(): void {
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }

  /**
   * Load private key from file
   */
  static async loadPrivateKey(path: string): Promise<string> {
    const content = await fs.readFile(path, 'utf-8');
    return content;
  }
}

/**
 * Global app auth instance (initialized on first use)
 */
let globalAppAuth: GitHubAppAuthManager | null = null;

/**
 * Get or create global GitHub App auth instance
 */
export function getGitHubAppAuth(): GitHubAppAuthManager {
  if (!globalAppAuth) {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_PRIVATE_KEY;

    if (!appId || !privateKey) {
      throw new Error('GITHUB_APP_ID and GITHUB_PRIVATE_KEY environment variables are required');
    }

    globalAppAuth = new GitHubAppAuthManager({
      appId,
      privateKey
    });
  }

  return globalAppAuth;
}

/**
 * Reset global app auth (useful for testing)
 */
export function resetGitHubAppAuth(): void {
  globalAppAuth = null;
}
