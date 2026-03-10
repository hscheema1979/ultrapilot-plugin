/**
 * Malicious Code Scanner Agent Handler
 *
 * Scans code for security issues:
 * - Detects common vulnerabilities
 * - Finds potential backdoors
 * - Identifies suspicious patterns
 * - Checks for secrets
 */

import { GitHubClient, PullRequest } from '../../github/client.js';
import { skillExecutor } from './skill-executor.js';

export interface SecurityScanResult {
  prNumber: number;
  findings: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    file: string;
    line?: number;
    description: string;
    recommendation: string;
  }[];
  overallRisk: 'minimal' | 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Malicious Code Scanner Agent Handler
 */
export class MaliciousCodeScannerHandler {
  private github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Scan pull request for malicious code
   */
  async scanPullRequest(pr: PullRequest, files: any[]): Promise<SecurityScanResult> {
    console.log(`[MaliciousCodeScanner] Scanning PR #${pr.number} for security issues`);

    const findings: SecurityScanResult['findings'] = [];

    // 1. Scan each file
    for (const file of files) {
      const fileFindings = await this.scanFile(file);
      findings.push(...fileFindings);
    }

    // 2. Assess overall risk
    const overallRisk = this.assessOverallRisk(findings);

    // 3. Generate scan report
    const report = this.generateScanReport(pr, findings, overallRisk);

    // 4. If critical findings, block merge
    if (findings.some(f => f.severity === 'critical')) {
      await this.blockPR(pr, findings);
    }

    // 5. Post report as comment
    await this.github.postComment(pr.number, report);

    return {
      prNumber: pr.number,
      findings,
      overallRisk
    };
  }

  /**
   * Scan file for security issues
   */
  private async scanFile(file: any): Promise<SecurityScanResult['findings']> {
    const findings: SecurityScanResult['findings'] = [];
    const content = file.patch || '';
    const filename = file.filename.toLowerCase();

    // Check for secrets
    const secretPatterns = [
      { pattern: /password\s*[:=]\s*['"][^'"]+['"]/i, type: 'Hardcoded password', severity: 'critical' },
      { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, type: 'Hardcoded API key', severity: 'critical' },
      { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/i, type: 'Hardcoded secret', severity: 'critical' },
      { pattern: /token\s*[:=]\s*['"][^'"]+['"]/i, type: 'Hardcoded token', severity: 'high' },
      { pattern: /private[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, type: 'Hardcoded private key', severity: 'critical' }
    ];

    for (const { pattern, type, severity } of secretPatterns) {
      if (pattern.test(content)) {
        findings.push({
          severity: severity as any,
          type,
          file: file.filename,
          description: `Potential secret detected: ${type}`,
          recommendation: 'Remove hardcoded credentials and use environment variables or secret management'
        });
      }
    }

    // Check for eval usage (code injection risk)
    if (content.includes('eval(')) {
      findings.push({
        severity: 'high',
        type: 'Code injection risk',
        file: file.filename,
        description: 'Use of eval() function detected',
        recommendation: 'Avoid eval() - use safer alternatives like JSON.parse() or dedicated parsers'
      });
    }

    // Check for SQL injection patterns
    if (content.includes('SELECT') && content.includes('+') && content.toLowerCase().includes('from')) {
      findings.push({
        severity: 'high',
        type: 'SQL injection risk',
        file: file.filename,
        description: 'Potential SQL injection via string concatenation',
        recommendation: 'Use parameterized queries or prepared statements'
      });
    }

    // Check for command injection
    if (content.includes('exec(') || content.includes('spawn(') || content.includes('system(')) {
      findings.push({
        severity: 'medium',
        type: 'Command injection risk',
        file: file.filename,
        description: 'Possible command injection via shell execution',
        recommendation: 'Validate and sanitize all inputs passed to shell commands'
      });
    }

    // Check for weak crypto
    const weakCrypto = ['md5', 'sha1', 'des', 'rc4'];
    for (const algo of weakCrypto) {
      if (content.toLowerCase().includes(algo)) {
        findings.push({
          severity: 'medium',
          type: 'Weak cryptography',
          file: file.filename,
          description: `Usage of weak ${algo.toUpperCase()} algorithm`,
          recommendation: 'Use stronger alternatives like SHA-256 or AES-256'
        });
      }
    }

    // Check for suspicious network requests
    if (content.includes('http://') && !content.includes('localhost')) {
      findings.push({
        severity: 'low',
        type: 'Insecure HTTP',
        file: file.filename,
        description: 'Unencrypted HTTP request detected',
        recommendation: 'Use HTTPS for all network communications'
      });
    }

    // Use AI for advanced detection
    const aiFindings = await this.scanWithAI(file);
    findings.push(...aiFindings);

    return findings;
  }

  /**
   * Use AI to detect sophisticated issues
   */
  private async scanWithAI(file: any): Promise<SecurityScanResult['findings']> {
    const prompt = `
Scan this code for sophisticated security issues beyond basic pattern matching:
- Logic vulnerabilities
- Race conditions
- Authorization bypasses
- Data leakage
- Backdoors

File: ${file.filename}
Diff:
${(file.patch || '').substring(0, 1500)}

Return findings in format:
SEVERITY|type|description|recommendation
`;

    const result = await skillExecutor.executeSkill('malicious-code-scanner', {
      github: {
        owner: 'repository',
        repo: 'name'
      },
      params: { file: file.filename }
    });

    const findings: SecurityScanResult['findings'] = [];

    if (result.success && result.output) {
      const lines = result.output.split('\n').filter(line => line.includes('|'));

      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 4) {
          findings.push({
            severity: parts[0].trim().toLowerCase() as any,
            type: parts[1].trim(),
            file: file.filename,
            description: parts[2].trim(),
            recommendation: parts[3].trim()
          });
        }
      }
    }

    return findings;
  }

  /**
   * Assess overall risk level
   */
  private assessOverallRisk(findings: SecurityScanResult['findings']): SecurityScanResult['overallRisk'] {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    if (criticalCount > 0) {
      return 'critical';
    }

    if (highCount > 2) {
      return 'high';
    }

    if (highCount > 0 || findings.filter(f => f.severity === 'medium').length > 3) {
      return 'medium';
    }

    if (findings.length > 0) {
      return 'low';
    }

    return 'minimal';
  }

  /**
   * Block PR if critical findings
   */
  private async blockPR(pr: PullRequest, findings: SecurityScanResult['findings']): Promise<void> {
    console.log(`[MaliciousCodeScanner] Blocking PR #${pr.number} due to critical security findings`);

    // Add blocking label
    await this.github.addLabels(pr.number, ['security-block']);

    // Update PR status (in real implementation)
    console.log(`[MaliciousCodeScanner] PR #${pr.number} blocked pending security review`);
  }

  /**
   * Generate scan report
   */
  private generateScanReport(pr: PullRequest, findings: SecurityScanResult['findings'], risk: string): string {
    let report = `## 🔒 Security Scan Report\n\n`;
    report += `**PR**: #${pr.number} - ${pr.title}\n`;
    report += `**Overall Risk**: ${this.getRiskEmoji(risk)} ${risk.toUpperCase()}\n`;
    report += `**Findings**: ${findings.length}\n\n`;

    if (findings.length === 0) {
      report += `### ✅ Clear\n\n`;
      report += `No security issues detected. This PR looks safe to merge.\n`;
    } else {
      report += `### Security Findings\n\n`;

      // Group by severity
      const bySeverity = {
        critical: findings.filter(f => f.severity === 'critical'),
        high: findings.filter(f => f.severity === 'high'),
        medium: findings.filter(f => f.severity === 'medium'),
        low: findings.filter(f => f.severity === 'low')
      };

      for (const [severity, items] of Object.entries(bySeverity)) {
        if (items.length > 0) {
          const emoji = this.getSeverityEmoji(severity);
          report += `#### ${emoji} ${severity.toUpperCase()} (${items.length})\n\n`;

          for (const item of items) {
            report += `**${item.type}** in \`${item.file}\`\n`;
            report += `- **Description**: ${item.description}\n`;
            report += `- **Recommendation**: ${item.recommendation}\n\n`;
          }
        }
      }

      if (risk === 'critical' || risk === 'high') {
        report += `### 🚨 Action Required\n\n`;
        report += `This PR has **${risk}** security findings. Please address these issues before merging.\n`;
      }
    }

    report += `\n---\n\n`;
    report += `*🔒 Scanned by Ultrapilot Malicious Code Scanner*`;

    return report;
  }

  /**
   * Get risk emoji
   */
  private getRiskEmoji(risk: string): string {
    const emojis: Record<string, string> = {
      'minimal': '🟢',
      'low': '🟡',
      'medium': '🟠',
      'high': '🔴',
      'critical': '🚨'
    };

    return emojis[risk] || '⚪';
  }

  /**
   * Get severity emoji
   */
  private getSeverityEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      'critical': '🚨',
      'high': '🔴',
      'medium': '🟠',
      'low': '🟡'
    };

    return emojis[severity] || '⚪';
  }
}
