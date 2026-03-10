/**
 * Unified GitHub Authentication Service
 *
 * Automatically selects between:
 * 1. Personal Access Token (PAT) - for development
 * 2. GitHub App - for production
 *
 * Priority:
 * - If GITHUB_TOKEN is set → use PAT
 * - If GITHUB_APP_ID is set → use GitHub App
 */

import { Octokit } from 'octokit';
import { GitHubAppAuthManager } from './github-app-auth';
import { GitHubPATAuthManager } from './github-pat-auth';

/**
 * Authentication type
 */
export type AuthType = 'pat' | 'app';

/**
 * Unified auth manager interface
 */
export interface IGitHubAuthManager {
  getToken(): Promise<string>;
  getOctokit(): Promise<Octokit>;
  testConnection(): Promise<boolean>;
  getRepository(): string;
  close(): Promise<void>;
}

/**
 * Unified GitHub Authentication Manager
 *
 * Detects and uses the appropriate auth method:
 * - GITHUB_TOKEN env var → PAT auth
 * - GITHUB_APP_ID env var → GitHub App auth
 */
export class GitHubAuthManager {
  private manager: IGitHubAuthManager;
  private authType: AuthType;

  constructor(manager: IGitHubAuthManager, authType: AuthType) {
    this.manager = manager;
    this.authType = authType;
  }

  /**
   * Auto-detect and create auth manager from environment
   */
  static fromEnv(repository?: string): GitHubAuthManager {
    const hasToken = !!process.env.GITHUB_TOKEN;
    const hasApp = !!(
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_INSTALLATION_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY_PATH
    );

    if (hasToken) {
      // Prefer PAT for development
      return new GitHubAuthManager(
        GitHubPATAuthManager.fromEnv(repository),
        'pat'
      );
    } else if (hasApp) {
      // Use GitHub App for production
      return new GitHubAuthManager(
        GitHubAppAuthManager.fromEnv(repository),
        'app'
      );
    } else {
      throw new Error(
        'No GitHub credentials configured.\n' +
        'Option 1 (Development): Set GITHUB_TOKEN env var\n' +
        '  1. Go to https://github.com/settings/tokens\n' +
        '  2. Generate new token (classic)\n' +
        '  3. Select scopes: repo\n' +
        '  4. export GITHUB_TOKEN=your_token_here\n\n' +
        'Option 2 (Production): Set up GitHub App\n' +
        '  See .github/GITHUB_APP_SETUP.md'
      );
    }
  }

  /**
   * Get authentication token
   */
  async getToken(): Promise<string> {
    return this.manager.getToken();
  }

  /**
   * Get installation token (alias for compatibility with GitHubService)
   */
  async getInstallationToken(_installationId?: number): Promise<string> {
    return this.manager.getToken();
  }

  /**
   * Get authenticated Octokit instance
   */
  async getOctokit(): Promise<Octokit> {
    return this.manager.getOctokit();
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    return this.manager.testConnection();
  }

  /**
   * Get repository
   */
  getRepository(): string {
    return this.manager.getRepository();
  }

  /**
   * Get auth type (for debugging/logging)
   */
  getAuthType(): AuthType {
    return this.authType;
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    return this.manager.close();
  }

  /**
   * Check if using PAT or GitHub App
   */
  isPATAuth(): boolean {
    return this.authType === 'pat';
  }

  isGitHubAppAuth(): boolean {
    return this.authType === 'app';
  }
}

/**
 * Singleton instance
 */
let authManagerInstance: GitHubAuthManager | null = null;

/**
 * Get or create singleton auth manager
 */
export function getAuthManager(repository?: string): GitHubAuthManager {
  if (!authManagerInstance) {
    authManagerInstance = GitHubAuthManager.fromEnv(repository);
  }
  return authManagerInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetAuthManager(): void {
  authManagerInstance = null;
}

/**
 * Quick setup helper
 */
export async function setupGitHubAuth(repository?: string): Promise<GitHubAuthManager> {
  const auth = GitHubAuthManager.fromEnv(repository);
  const isConnected = await auth.testConnection();

  if (!isConnected) {
    throw new Error('GitHub connection test failed. Check your credentials.');
  }

  console.log(`✅ GitHub auth configured (${auth.getAuthType()})`);
  console.log(`📂 Repository: ${auth.getRepository()}`);

  return auth;
}
