/**
 * GitHub PAT (Personal Access Token) Authentication Service
 *
 * Simple authentication using Personal Access Token.
 * Best for development and testing.
 *
 * Setup:
 * 1. Go to https://github.com/settings/tokens
 * 2. Generate new token (classic)
 * 3. Select scopes: repo, read:org, read:discussion
 * 4. Set GITHUB_TOKEN env var
 */

import { Octokit } from 'octokit';

/**
 * PAT Authentication Manager
 */
export class GitHubPATAuthManager {
  private token: string;
  private repository: string;

  constructor(token: string, repository: string = 'hscheema1979/ultra-workspace') {
    this.token = token;
    this.repository = repository;
  }

  /**
   * Load from environment variable
   */
  static fromEnv(repository?: string): GitHubPATAuthManager {
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error(
        'Missing GITHUB_TOKEN environment variable. ' +
        'Create a token at https://github.com/settings/tokens'
      );
    }

    return new GitHubPATAuthManager(token, repository);
  }

  /**
   * Get authentication token
   */
  async getToken(): Promise<string> {
    return this.token;
  }

  /**
   * Get authenticated Octokit instance
   */
  async getOctokit(): Promise<Octokit> {
    return new Octokit({
      auth: this.token,
    });
  }

  /**
   * Test connection
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
      console.error('GitHub PAT connection test failed:', error);
      return false;
    }
  }

  /**
   * Get repository
   */
  getRepository(): string {
    return this.repository;
  }

  /**
   * No-op for compatibility (PAT doesn't expire like GitHub App tokens)
   */
  shouldRotateToken(): boolean {
    return false;
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    // Nothing to close for PAT
  }
}

/**
 * Singleton instance
 */
let patAuthManagerInstance: GitHubPATAuthManager | null = null;

/**
 * Get or create singleton PAT auth manager
 */
export function getPATAuthManager(repository?: string): GitHubPATAuthManager {
  if (!patAuthManagerInstance) {
    patAuthManagerInstance = GitHubPATAuthManager.fromEnv(repository);
  }
  return patAuthManagerInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetPATAuthManager(): void {
  patAuthManagerInstance = null;
}
