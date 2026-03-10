/**
 * File Ownership Registry
 *
 * Manages file ownership rules for delegation to prevent conflicts
 * and ensure proper access control between orchestrators and workers.
 *
 * Part of Phase 2: Delegation Interface & Ownership Protocol
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileOwnership } from './types.js';
import { DelegationError, ErrorCode } from './errors.js';

/**
 * Ownership validation result
 */
export interface OwnershipValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Ownership transfer result
 */
export interface OwnershipTransferResult {
  success: boolean;
  transferredPaths: string[];
  errors: string[];
}

/**
 * Ownership conflict detection result
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflicts: Array<{
    path: string;
    currentOwner: string;
    requestedBy: string;
  }>;
}

/**
 * File ownership record
 */
interface OwnershipRecord {
  path: string;
  owner: string; // 'orchestrator' or agent name
  acquiredAt: number;
  transferable: boolean;
}

/**
 * File Ownership Registry
 *
 * Manages file ownership to prevent concurrent edits and ensure
 * proper access control during delegation.
 */
export class FileOwnershipRegistry {
  private ownershipRecords: Map<string, OwnershipRecord> = new Map();
  private locks: Set<string> = new Set();

  /**
   * Validate ownership rules before delegation
   *
   * Checks that:
   * 1. Owned paths exist and are accessible
   * 2. Read-only paths exist and are readable
   * 3. No ownership conflicts exist
   *
   * @param ownership - File ownership rules
   * @returns Promise<OwnershipValidationResult>
   */
  async validateOwnership(ownership: FileOwnership): Promise<OwnershipValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate owned paths
    for (const ownedPath of ownership.ownedPaths) {
      try {
        const stats = await fs.stat(ownedPath);

        if (!stats.isDirectory() && !stats.isFile()) {
          errors.push(`Owned path is neither file nor directory: ${ownedPath}`);
        }

        // Check for conflicts
        const conflict = this.checkConflict(ownedPath, 'orchestrator');
        if (conflict.hasConflict) {
          errors.push(
            `Ownership conflict for ${ownedPath}: currently owned by ${conflict.conflicts[0].currentOwner}`
          );
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          warnings.push(`Owned path does not exist (will be created): ${ownedPath}`);
        } else if (error.code === 'EACCES') {
          errors.push(`Permission denied accessing owned path: ${ownedPath}`);
        } else {
          errors.push(`Error accessing owned path ${ownedPath}: ${error.message}`);
        }
      }
    }

    // Validate read-only paths
    for (const readOnlyPath of ownership.readOnlyPaths) {
      try {
        const stats = await fs.stat(readOnlyPath);

        if (!stats.isDirectory() && !stats.isFile()) {
          errors.push(`Read-only path is neither file nor directory: ${readOnlyPath}`);
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          warnings.push(`Read-only path does not exist: ${readOnlyPath}`);
        } else if (error.code === 'EACCES') {
          errors.push(`Permission denied accessing read-only path: ${readOnlyPath}`);
        } else {
          errors.push(`Error accessing read-only path ${readOnlyPath}: ${error.message}`);
        }
      }
    }

    // Check for overlap between owned and read-only paths
    const overlaps = this.findPathOverlaps(ownership.ownedPaths, ownership.readOnlyPaths);
    if (overlaps.length > 0) {
      warnings.push(
        `Paths appear in both owned and read-only: ${overlaps.join(', ')}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Transfer ownership from orchestrator to worker or vice versa
   *
   * @param ownership - File ownership rules
   * @param newOwner - New owner ('orchestrator' or agent name)
   * @returns Promise<OwnershipTransferResult>
   */
  async transferOwnership(
    ownership: FileOwnership,
    newOwner: string
  ): Promise<OwnershipTransferResult> {
    const transferredPaths: string[] = [];
    const errors: string[] = [];

    for (const ownedPath of ownership.ownedPaths) {
      try {
        // Check if path is currently locked
        if (this.locks.has(ownedPath)) {
          errors.push(`Path is currently locked: ${ownedPath}`);
          continue;
        }

        // Acquire lock
        this.locks.add(ownedPath);

        // Update ownership record
        this.ownershipRecords.set(ownedPath, {
          path: ownedPath,
          owner: newOwner,
          acquiredAt: Date.now(),
          transferable: ownership.transferOnCompletion,
        });

        transferredPaths.push(ownedPath);
      } catch (error: any) {
        errors.push(`Failed to transfer ownership of ${ownedPath}: ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      transferredPaths,
      errors,
    };
  }

  /**
   * Release ownership (typically after worker completes)
   *
   * @param ownership - File ownership rules
   * @returns Promise<void>
   */
  async releaseOwnership(ownership: FileOwnership): Promise<void> {
    for (const ownedPath of ownership.ownedPaths) {
      // Remove lock
      this.locks.delete(ownedPath);

      // Remove ownership record if transferable
      const record = this.ownershipRecords.get(ownedPath);
      if (record && record.transferable) {
        this.ownershipRecords.delete(ownedPath);
      } else if (record) {
        // Transfer back to orchestrator
        record.owner = 'orchestrator';
        record.acquiredAt = Date.now();
      }
    }
  }

  /**
   * Check for ownership conflicts
   *
   * @param path - Path to check
   * @param requestedBy - Who is requesting ownership
   * @returns ConflictDetectionResult
   */
  checkConflict(path: string, requestedBy: string): ConflictDetectionResult {
    const conflicts: Array<{
      path: string;
      currentOwner: string;
      requestedBy: string;
    }> = [];

    // Check direct ownership
    const record = this.ownershipRecords.get(path);
    if (record && record.owner !== requestedBy && !record.transferable) {
      conflicts.push({
        path,
        currentOwner: record.owner,
        requestedBy,
      });
    }

    // Check parent/child conflicts
    for (const [ownedPath, ownedRecord] of this.ownershipRecords) {
      if (ownedRecord.owner !== requestedBy && !ownedRecord.transferable) {
        // Check if path is a parent of owned path
        if (path !== ownedPath && ownedPath.startsWith(path + path.sep)) {
          conflicts.push({
            path: ownedPath,
            currentOwner: ownedRecord.owner,
            requestedBy,
          });
        }

        // Check if path is a child of owned path
        if (path !== ownedPath && path.startsWith(ownedPath + path.sep)) {
          conflicts.push({
            path,
            currentOwner: ownedRecord.owner,
            requestedBy,
          });
        }
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Find overlapping paths between two arrays
   *
   * @param paths1 - First array of paths
   * @param paths2 - Second array of paths
   * @returns Array of overlapping paths
   */
  private findPathOverlaps(paths1: string[], paths2: string[]): string[] {
    const overlaps: string[] = [];

    for (const path1 of paths1) {
      for (const path2 of paths2) {
        // Check for exact match
        if (path1 === path2) {
          overlaps.push(path1);
          continue;
        }

        // Check if one is parent of the other
        const normalized1 = path.normalize(path1);
        const normalized2 = path.normalize(path2);

        if (normalized1.startsWith(normalized2 + path.sep) ||
            normalized2.startsWith(normalized1 + path.sep)) {
          overlaps.push(`${path1} <-> ${path2}`);
        }
      }
    }

    return overlaps;
  }

  /**
   * Get current ownership for a path
   *
   * @param path - Path to query
   * @returns Ownership record or undefined
   */
  getOwnership(path: string): OwnershipRecord | undefined {
    return this.ownershipRecords.get(path);
  }

  /**
   * Get all ownership records
   *
   * @returns Array of all ownership records
   */
  getAllOwnership(): OwnershipRecord[] {
    return Array.from(this.ownershipRecords.values());
  }

  /**
   * Clear all ownership records (for testing)
   *
   * @returns void
   */
  clearOwnership(): void {
    this.ownershipRecords.clear();
    this.locks.clear();
  }

  /**
   * Check if a path is currently locked
   *
   * @param path - Path to check
   * @returns true if locked, false otherwise
   */
  isLocked(path: string): boolean {
    return this.locks.has(path);
  }

  /**
   * Get statistics about ownership registry
   *
   * @returns Ownership statistics
   */
  getStats(): {
    totalRecords: number;
    totalLocks: number;
    ownedByOrchestrator: number;
    ownedByAgents: number;
  } {
    let ownedByOrchestrator = 0;
    let ownedByAgents = 0;

    for (const record of this.ownershipRecords.values()) {
      if (record.owner === 'orchestrator') {
        ownedByOrchestrator++;
      } else {
        ownedByAgents++;
      }
    }

    return {
      totalRecords: this.ownershipRecords.size,
      totalLocks: this.locks.size,
      ownedByOrchestrator,
      ownedByAgents,
    };
  }
}
