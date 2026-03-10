/**
 * UltraPilot Workflow Tracking System - Configuration
 *
 * @version 1.0
 * @date 2026-03-03
 */

import type { WorkflowTrackingConfig } from './types.js';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: WorkflowTrackingConfig = {
  enabled: true,
  dbPath: '.ultra/state/workflows.db',
  samplingRate: 1.0,
  flushInterval: 50,
  maxBufferSize: 100,
  cacheSize: {
    l1: 50,
    l2: 500
  }
};

/**
 * Load configuration from environment
 */
export function loadConfig(): WorkflowTrackingConfig {
  return {
    ...DEFAULT_CONFIG,
    dbPath: process.env.ULTRA_TRACKING_DB_PATH || DEFAULT_CONFIG.dbPath,
    enabled: process.env.ULTRA_TRACKING_ENABLED !== 'false',
    samplingRate: parseFloat(process.env.ULTRA_TRACKING_SAMPLING || '1.0'),
    flushInterval: parseInt(process.env.ULTRA_TRACKING_FLUSH_INTERVAL || '50', 10),
    maxBufferSize: parseInt(process.env.ULTRA_TRACKING_MAX_BUFFER || '100', 10),
    cacheSize: {
      l1: parseInt(process.env.ULTRA_TRACKING_CACHE_L1 || '50', 10),
      l2: parseInt(process.env.ULTRA_TRACKING_CACHE_L2 || '500', 10)
    }
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: WorkflowTrackingConfig): void {
  if (config.samplingRate !== undefined && (config.samplingRate < 0 || config.samplingRate > 1)) {
    throw new Error('samplingRate must be between 0 and 1');
  }

  if (config.flushInterval !== undefined && config.flushInterval < 10) {
    throw new Error('flushInterval must be at least 10ms');
  }

  if (config.maxBufferSize !== undefined && config.maxBufferSize < 10) {
    throw new Error('maxBufferSize must be at least 10');
  }

  if (config.cacheSize?.l1 !== undefined && config.cacheSize.l1 < 0) {
    throw new Error('l1 cache size must be non-negative');
  }

  if (config.cacheSize?.l2 !== undefined && config.cacheSize.l2 < 0) {
    throw new Error('l2 cache size must be non-negative');
  }
}
