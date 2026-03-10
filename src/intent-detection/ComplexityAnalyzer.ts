/**
 * Complexity Analyzer - Task Complexity Assessment
 *
 * Analyzes task complexity based on word count, technical terms,
 * domain complexity, and other factors to estimate steps and duration.
 */

import { ComplexityAnalysis, IntentDetectionConfig } from './types.js';

export class ComplexityAnalyzer {
  private config: IntentDetectionConfig;

  constructor(config: IntentDetectionConfig) {
    this.config = config;
  }

  /**
   * Analyze complexity of input
   */
  analyze(input: string): ComplexityAnalysis {
    const words = input.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const technicalTerms = this.findTechnicalTerms(words);
    const complexDomains = this.findComplexDomains(input.toLowerCase());

    // Calculate base scores
    const wordCountScore = this.calculateWordCountScore(words.length);
    const technicalTermsScore = this.calculateTechnicalTermsScore(technicalTerms.length);
    const domainComplexityScore = this.calculateDomainComplexityScore(complexDomains);

    // Calculate multipliers
    const phaseMultiplier = this.detectPhaseIndicators(input) ? 1.3 : 1.0;
    const coordinationMultiplier = this.detectCoordinationNeeds(input) ? 1.2 : 1.0;
    const verificationMultiplier = this.detectVerificationNeeds(input) ? 1.15 : 1.0;

    // Calculate total score
    const baseScore = wordCountScore + technicalTermsScore + domainComplexityScore;
    const totalMultiplier = phaseMultiplier * coordinationMultiplier * verificationMultiplier;
    const score = Math.round(baseScore * totalMultiplier);

    // Estimate steps and duration
    const estimatedSteps = this.estimateSteps(score, words.length);
    const estimatedDuration = this.estimateDuration(estimatedSteps, score);

    return {
      score,
      estimatedSteps,
      estimatedDuration,
      breakdown: {
        wordCount: wordCountScore,
        technicalTerms: technicalTermsScore,
        domainComplexity: domainComplexityScore,
        multipliers: {
          phases: phaseMultiplier,
          coordination: coordinationMultiplier,
          verification: verificationMultiplier
        }
      },
      technicalTerms,
      complexDomains
    };
  }

  /**
   * Calculate word count contribution to complexity (0-20 points)
   */
  private calculateWordCountScore(wordCount: number): number {
    // More words = more complexity, but with diminishing returns
    if (wordCount <= 5) return 2;
    if (wordCount <= 10) return 5;
    if (wordCount <= 20) return 10;
    if (wordCount <= 40) return 15;
    return 20; // Max for word count
  }

  /**
   * Calculate technical terms contribution to complexity (0-20 points)
   */
  private calculateTechnicalTermsScore(termCount: number): number {
    // Each technical term adds complexity
    return Math.min(termCount * 3, 20);
  }

  /**
   * Calculate domain complexity contribution (0-15 points)
   */
  private calculateDomainComplexityScore(domains: string[]): number {
    // Complex domains add significant complexity
    return Math.min(domains.length * 5, 15);
  }

  /**
   * Find technical terms in input
   */
  private findTechnicalTerms(words: string[]): string[] {
    return this.config.technicalTerms.filter(term => {
      const termWords = term.split(' ');
      if (termWords.length === 1) {
        return words.includes(term);
      } else {
        // Multi-word terms
        return words.join(' ').includes(term);
      }
    });
  }

  /**
   * Find complex domains in input
   */
  private findComplexDomains(input: string): string[] {
    return this.config.complexDomains.filter(domain => {
      return input.includes(domain);
    });
  }

  /**
   * Detect if task involves multiple phases
   */
  private detectPhaseIndicators(input: string): boolean {
    const phaseIndicators = [
      'then', 'after that', 'next', 'finally', 'also',
      'and then', 'followed by', 'subsequently',
      'design and implement', 'plan and build',
      'from scratch', 'end to end'
    ];
    return phaseIndicators.some(indicator => input.toLowerCase().includes(indicator));
  }

  /**
   * Detect if task requires coordination
   */
  private detectCoordinationNeeds(input: string): boolean {
    const coordinationIndicators = [
      'integrate', 'connect', 'combine', 'merge',
      'multiple', 'several', 'various', 'together',
      'api', 'microservice', 'distributed'
    ];
    return coordinationIndicators.some(indicator => input.toLowerCase().includes(indicator));
  }

  /**
   * Detect if task requires verification
   */
  private detectVerificationNeeds(input: string): boolean {
    const verificationIndicators = [
      'secure', 'security', 'test', 'testing', 'quality',
      'production', 'deploy', 'performance', 'scalable',
      'review', 'audit', 'validate', 'verify'
    ];
    return verificationIndicators.some(indicator => input.toLowerCase().includes(indicator));
  }

  /**
   * Estimate number of steps based on complexity
   */
  private estimateSteps(score: number, wordCount: number): number {
    // Base steps on complexity score
    if (score <= 15) return 1;
    if (score <= 30) return Math.max(2, Math.floor(score / 10));
    if (score <= 60) return Math.max(3, Math.floor(score / 8));
    return Math.max(5, Math.floor(score / 6));
  }

  /**
   * Estimate duration in minutes based on steps and complexity
   */
  private estimateDuration(steps: number, score: number): number {
    // Base: 5 minutes per step for simple tasks
    // More complex tasks take longer per step
    const complexityFactor = Math.max(1, score / 20);
    const baseMinutes = steps * 5;
    return Math.round(baseMinutes * complexityFactor);
  }

  /**
   * Update technical terms and domains
   */
  updateKnowledge(technicalTerms: string[], complexDomains: string[]): void {
    this.config.technicalTerms = Array.from(new Set([...this.config.technicalTerms, ...technicalTerms]));
    this.config.complexDomains = Array.from(new Set([...this.config.complexDomains, ...complexDomains]));
  }
}
