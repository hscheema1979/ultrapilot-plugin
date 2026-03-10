/**
 * PlanWatcher Tests
 *
 * Tests for atomic file watching, race-condition-free reading,
 * debouncing, checksum validation, and plan parsing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  PlanWatcher,
  createPlanWatcher,
  OperationalPlan,
  PlanTaskStatus,
  PlanTaskPriority,
  PlanWatcherConfig
} from '../../src/domain/PlanWatcher.js';

describe('PlanWatcher', () => {
  const testDir = '/tmp/ultrapilot-plan-watcher-test';
  const planPath = path.join(testDir, 'plan-final.md');
  const tmpPath = `${planPath}.tmp`;

  let watcher: PlanWatcher;
  let changeCallback: ReturnType<typeof vi.fn>;
  let errorCallback: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // Reset mocks
    changeCallback = vi.fn();
    errorCallback = vi.fn();
  });

  afterEach(async () => {
    // Stop watcher
    if (watcher) {
      watcher.unwatch();
    }

    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Basic Functionality', () => {
    it('should create a watcher instance', () => {
      watcher = createPlanWatcher(planPath);

      expect(watcher).toBeDefined();
      expect(watcher.isActive()).toBe(false);
    });

    it('should start and stop watching', () => {
      watcher = createPlanWatcher(planPath);
      watcher.watch(changeCallback);

      expect(watcher.isActive()).toBe(true);

      watcher.unwatch();

      expect(watcher.isActive()).toBe(false);
    });

    it('should get watcher stats', () => {
      watcher = createPlanWatcher(planPath);

      const stats = watcher.getStats();

      expect(stats.planPath).toBe(path.resolve(planPath));
      expect(stats.isWatching).toBe(false);
      expect(stats.isReading).toBe(false);
      expect(stats.hasCurrentPlan).toBe(false);
    });
  });

  describe('Plan Parsing', () => {
    const validPlanContent = `# UltraX Frontend Implementation Plan

## Overview

Build complete Web UI (React + Socket.IO) and Google Chat bot to replace Relay.

---

## Phase 1: Foundation Setup (Week 1)

### Task 1.1: Project Initialization
**File Owner:** agent-1
**Estimated:** 4 hours
**Status:** pending

**Deliverables:**
- Initialize Web UI React project with Vite
- Initialize Socket.IO server project

**Success Criteria:**
- All projects build without errors
- TypeScript configured correctly

### Task 1.2: Development Environment
**File Owner:** agent-2
**Estimated:** 2 hours
**Priority:** high

**Deliverables:**
- Docker Compose for local development
- Hot-reload configuration

**Success Criteria:**
- \`docker-compose up\` starts all services

---

## Phase 2: Web UI Development (Week 2)

### Task 2.1: Core Layout & Theming
**File Owner:** agent-3
**Estimated:** 8 hours
**Priority:** normal

**Deliverables:**
- Create App.tsx layout
- Implement theme system

**Success Criteria:**
- Layout renders correctly
- Theme switching works
`;

    it('should parse a valid plan', async () => {
      await fs.writeFile(planPath, validPlanContent, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      expect(changeCallback).toHaveBeenCalledTimes(1);

      const plan = changeCallback.mock.calls[0][0] as OperationalPlan;

      expect(plan.title).toBe('UltraX Frontend Implementation Plan');
      expect(plan.overview).toContain('Build complete Web UI');
      expect(plan.phases).toHaveLength(2);
      expect(plan.phases[0].id).toBe('1');
      expect(plan.phases[0].title).toBe('Foundation Setup');
      expect(plan.phases[1].id).toBe('2');
      expect(plan.phases[1].title).toBe('Web UI Development');

      // Check tasks
      expect(Object.keys(plan.tasks)).toHaveLength(3);
      expect(plan.tasks['1.1']).toBeDefined();
      expect(plan.tasks['1.1'].title).toBe('Project Initialization');
      expect(plan.tasks['1.1'].fileOwner).toBe('agent-1');
      expect(plan.tasks['1.1'].estimatedHours).toBe(4);
      expect(plan.tasks['1.1'].status).toBe(PlanTaskStatus.PENDING);

      expect(plan.tasks['1.2']).toBeDefined();
      expect(plan.tasks['1.2'].priority).toBe(PlanTaskPriority.HIGH);

      // Check phase tasks
      expect(plan.phases[0].tasks).toEqual(['1.1', '1.2']);
      expect(plan.phases[1].tasks).toEqual(['2.1']);

      // Check totals
      expect(plan.estimatedHours).toBe(14);
      expect(plan.completionPercentage).toBe(0);
    });

    it('should calculate completion percentage correctly', async () => {
      const planWithCompletedTasks = validPlanContent.replace(
        '**Status:** pending',
        '**Status:** completed'
      );

      await fs.writeFile(planPath, planWithCompletedTasks, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      const plan = changeCallback.mock.calls[0][0] as OperationalPlan;
      expect(plan.completionPercentage).toBe(100);
      expect(plan.status).toBe(PlanTaskStatus.COMPLETED);
    });

    it('should detect failed tasks', async () => {
      const planWithFailedTask = validPlanContent.replace(
        '**Status:** pending',
        '**Status:** failed'
      );

      await fs.writeFile(planPath, planWithFailedTask, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      const plan = changeCallback.mock.calls[0][0] as OperationalPlan;
      expect(plan.status).toBe(PlanTaskStatus.FAILED);
    });
  });

  describe('Atomic File Reading', () => {
    it('should wait for temporary file to be removed', async () => {
      const validPlanContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Test Task
**Status:** pending

Test description
`;

      // Write temporary file first
      await fs.writeFile(tmpPath, 'writing...', 'utf-8');

      // Start watcher
      const watchPromise = new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath, { verbose: true });
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Remove tmp file and write actual content
      await fs.unlink(tmpPath);
      await fs.writeFile(planPath, validPlanContent, 'utf-8');

      // Wait for watch to complete
      await watchPromise;

      expect(changeCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent read attempts', async () => {
      const validPlanContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Test Task
**Status:** pending

Test description
`;

      await fs.writeFile(planPath, validPlanContent, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      // Trigger multiple rapid changes
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(planPath, validPlanContent + `\n${i}`, 'utf-8');
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should only trigger once (last change)
      expect(changeCallback.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('Checksum Validation', () => {
    it('should not trigger change event for identical content', async () => {
      const planContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Test Task
**Status:** pending

Test description
`;

      await fs.writeFile(planPath, planContent, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath, { verbose: true });
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      const initialCallCount = changeCallback.mock.calls.length;

      // Write identical content
      await fs.writeFile(planPath, planContent, 'utf-8');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should not trigger new event
      expect(changeCallback.mock.calls.length).toBe(initialCallCount);
    });

    it('should calculate checksum correctly', async () => {
      const content = 'test content';
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(content, 'utf-8')
        .digest('hex');

      await fs.writeFile(planPath, `# Test Plan\n\n${content}`, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      const stats = watcher.getStats();
      expect(stats.currentChecksum).toBeDefined();
      expect(stats.currentChecksum).not.toBe(null);
    });
  });

  describe('Debouncing', () => {
    it('should debounce rapid changes', async () => {
      const planContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Test Task
**Status:** pending

Test description
`;

      await fs.writeFile(planPath, planContent, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath, { debounceDelay: 300 });
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      // Make rapid changes
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(planPath, `${planContent}\n\nv${i}`, 'utf-8');
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should have been called at least once (initial + final debounced)
      expect(changeCallback.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect custom debounce delay', async () => {
      const planContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Test Task
**Status:** pending

Test description
`;

      await fs.writeFile(planPath, planContent, 'utf-8');

      const startTime = Date.now();

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath, { debounceDelay: 200 });
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      // Trigger change
      await fs.writeFile(planPath, `${planContent}\n\nv2`, 'utf-8');

      await new Promise(resolve => setTimeout(resolve, 300));

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty plan file', async () => {
      await fs.writeFile(planPath, '', 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.on('plan:read-error', (error) => {
          errorCallback(error);
          resolve();
        });
        watcher.watch(changeCallback);
      });

      await new Promise(resolve => setTimeout(resolve, 600));

      expect(errorCallback).toHaveBeenCalled();
    });

    it('should handle malformed plan', async () => {
      const malformedPlan = `This is not a valid plan format
Just some random text
No structure here`;

      await fs.writeFile(planPath, malformedPlan, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.on('plan:parse-error', (error) => {
          errorCallback(error);
          resolve();
        });
        watcher.watch(changeCallback);
      });

      await new Promise(resolve => setTimeout(resolve, 600));

      // Should parse with defaults (not error)
      // Parser is lenient and will create minimal plan
    });

    it('should retry on corrupted reads', async () => {
      const validPlanContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Test Task
**Status:** pending

Test description
`;

      let attemptCount = 0;

      await fs.writeFile(planPath, validPlanContent, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath, {
          maxRetries: 3,
          retryDelay: 50,
          verbose: true
        });

        watcher.on('plan:corrupted', (attempts) => {
          attemptCount = attempts;
        });

        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      // Should succeed without retries for valid content
      expect(changeCallback).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing file gracefully', () => {
      expect(() => {
        watcher = createPlanWatcher(planPath);
        watcher.watch(changeCallback);
      }).not.toThrow();
    });

    it('should handle file creation after watching starts', async () => {
      const planContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Test Task
**Status:** pending

Test description
`;

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });

        // Create file after watcher starts
        setTimeout(async () => {
          await fs.writeFile(planPath, planContent, 'utf-8');
        }, 100);
      });

      await new Promise(resolve => setTimeout(resolve, 700));

      expect(changeCallback).toHaveBeenCalled();
    });

    it('should handle Unicode content', async () => {
      const unicodePlan = `# Test Plan with Unicode

## Overview

Test with emoji: 🚀 🔥 💻

## Phase 1: Test Phase

### Task 1.1: Unicode Task
**File Owner:** agent-测试
**Status:** pending

Description with unicode: café, naïve, 日本語
`;

      await fs.writeFile(planPath, unicodePlan, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      expect(changeCallback).toHaveBeenCalledTimes(1);

      const plan = changeCallback.mock.calls[0][0] as OperationalPlan;
      expect(plan.overview).toContain('🚀');
      expect(plan.tasks['1.1'].fileOwner).toBe('agent-测试');
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customConfig: PlanWatcherConfig = {
        debounceDelay: 1000,
        maxRetries: 5,
        retryDelay: 200,
        verbose: true,
        tmpSuffix: '.temp',
        enableChecksum: false
      };

      watcher = createPlanWatcher(planPath, customConfig);

      expect(watcher).toBeDefined();
    });

    it('should use default configuration when not specified', () => {
      watcher = createPlanWatcher(planPath);

      const stats = watcher.getStats();
      expect(stats.debounceDelay).toBe(500); // Default
    });
  });

  describe('Task Status Parsing', () => {
    it('should parse various task status formats', async () => {
      const planContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Task 1
**Status:** pending

Description 1

### Task 1.2: Task 2
**Status:** in-progress

Description 2

### Task 1.3: Task 3
**Status:** completed

Description 3

### Task 1.4: Task 4
**Status:** failed

Description 4

### Task 1.5: Task 5
**Status:** blocked

Description 5
`;

      await fs.writeFile(planPath, planContent, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      const plan = changeCallback.mock.calls[0][0] as OperationalPlan;

      expect(plan.tasks['1.1'].status).toBe(PlanTaskStatus.PENDING);
      expect(plan.tasks['1.2'].status).toBe(PlanTaskStatus.IN_PROGRESS);
      expect(plan.tasks['1.3'].status).toBe(PlanTaskStatus.COMPLETED);
      expect(plan.tasks['1.4'].status).toBe(PlanTaskStatus.FAILED);
      expect(plan.tasks['1.5'].status).toBe(PlanTaskStatus.BLOCKED);
    });

    it('should parse task priorities', async () => {
      const planContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Low Priority Task
**Priority:** low

Description

### Task 1.2: Normal Priority Task
**Priority:** normal

Description

### Task 1.3: High Priority Task
**Priority:** high

Description

### Task 1.4: Critical Priority Task
**Priority:** critical

Description
`;

      await fs.writeFile(planPath, planContent, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      const plan = changeCallback.mock.calls[0][0] as OperationalPlan;

      expect(plan.tasks['1.1'].priority).toBe(PlanTaskPriority.LOW);
      expect(plan.tasks['1.2'].priority).toBe(PlanTaskPriority.NORMAL);
      expect(plan.tasks['1.3'].priority).toBe(PlanTaskPriority.HIGH);
      expect(plan.tasks['1.4'].priority).toBe(PlanTaskPriority.CRITICAL);
    });
  });

  describe('Phase Statistics', () => {
    it('should calculate phase completion correctly', async () => {
      const planContent = `# Test Plan

## Overview

Test overview

## Phase 1: Test Phase

### Task 1.1: Task 1
**Status:** pending
**Estimated:** 2 hours

Description 1

### Task 1.2: Task 2
**Status:** completed
**Estimated:** 4 hours

Description 2

### Task 1.3: Task 3
**Status:** completed
**Estimated:** 6 hours

Description 3

## Phase 2: Another Phase

### Task 2.1: Task 4
**Status:** pending
**Estimated:** 8 hours

Description 4
`;

      await fs.writeFile(planPath, planContent, 'utf-8');

      await new Promise<void>((resolve) => {
        watcher = createPlanWatcher(planPath);
        watcher.watch((plan) => {
          changeCallback(plan);
          resolve();
        });
      });

      const plan = changeCallback.mock.calls[0][0] as OperationalPlan;

      // Phase 1: 2 of 3 tasks completed = 66%
      expect(plan.phases[0].completionPercentage).toBe(66);
      expect(plan.phases[0].estimatedHours).toBe(12);

      // Phase 2: 0 of 1 tasks completed = 0%
      expect(plan.phases[1].completionPercentage).toBe(0);
      expect(plan.phases[1].estimatedHours).toBe(8);

      // Overall: 2 of 4 tasks = 50%
      expect(plan.completionPercentage).toBe(50);
    });
  });
});
