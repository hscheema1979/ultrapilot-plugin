/**
 * Tests for GitHubStateAdapter
 *
 * Tests the YAML frontmatter parsing and serialization logic.
 */

import { describe, it, expect } from 'vitest';
import {
  StateParseError,
  StateVersionConflictError,
  parseStateFromBody,
  serializeStateBody,
  type StateObject,
  type StateType,
} from '../github-state-adapter';

describe('GitHubStateAdapter', () => {
  describe('parseStateFromBody', () => {
    it('should parse valid YAML frontmatter', () => {
      const body = `---
state_id: st_123_abc
type: task_queue
updated_at: 2026-03-04T12:00:00Z
version: 1
data:
  queue_name: intake
  task_count: 5
---
This is human-readable content.`;

      const state = parseStateFromBody(body);

      expect(state.state_id).toBe('st_123_abc');
      expect(state.type).toBe('task_queue');
      // YAML parses ISO dates as Date objects, but we convert them to strings
      expect(state.updated_at).toBe('2026-03-04T12:00:00.000Z');
      expect(state.version).toBe(1);
      expect(state.data.queue_name).toBe('intake');
      expect(state.data.task_count).toBe(5);
    });

    it('should throw StateParseError for missing frontmatter', () => {
      const body = 'This is just plain text without frontmatter.';

      expect(() => parseStateFromBody(body)).toThrow(StateParseError);
    });

    it('should throw StateParseError for missing required fields', () => {
      const body = `---
state_id: st_123_abc
type: task_queue
---
Missing version, updated_at, and data`;

      expect(() => parseStateFromBody(body)).toThrow(StateParseError);
    });

    it('should throw StateParseError for invalid state type', () => {
      const body = `---
state_id: st_123_abc
type: invalid_type
updated_at: 2026-03-04T12:00:00Z
version: 1
data: {}
---
Invalid state type`;

      expect(() => parseStateFromBody(body)).toThrow(StateParseError);
    });
  });

  describe('serializeStateBody', () => {
    it('should serialize state with YAML frontmatter', () => {
      const state: StateObject = {
        state_id: 'st_123_abc',
        type: 'task_queue',
        updated_at: '2026-03-04T12:00:00Z',
        version: 1,
        data: {
          queue_name: 'intake',
          task_count: 5,
        },
      };

      const content = 'This is human-readable content.';
      const body = serializeStateBody(state, content);

      expect(body).toMatch(/^---\n/);
      expect(body).toMatch(/\n---\n/);
      expect(body).toContain('state_id: st_123_abc');
      expect(body).toContain('type: task_queue');
      expect(body).toContain('queue_name: intake');
      expect(body).toContain('This is human-readable content.');
    });

    it('should auto-generate timestamp if missing', () => {
      const state: StateObject = {
        state_id: 'st_123_abc',
        type: 'agent_state',
        updated_at: '', // Empty timestamp
        version: 1,
        data: {
          agent_id: 'agent-1',
          status: 'active',
        },
      };

      const body = serializeStateBody(state, '');

      // Check that timestamp was generated (not just empty string)
      expect(body).toContain('updated_at:');
      expect(body).not.toContain("updated_at: ''");
    });
  });

  describe('round-trip serialization', () => {
    it('should parse and serialize consistently', () => {
      const originalState: StateObject = {
        state_id: 'st_123_abc',
        type: 'migration_progress',
        updated_at: '2026-03-04T12:00:00Z',
        version: 5,
        data: {
          phase: 'execution',
          step: 3,
          total_steps: 10,
          status: 'in_progress',
        },
      };

      const body = serializeStateBody(originalState, 'Migration progress tracking');
      const parsedState = parseStateFromBody(body);

      expect(parsedState.state_id).toBe(originalState.state_id);
      expect(parsedState.type).toBe(originalState.type);
      expect(parsedState.version).toBe(originalState.version);
      expect(parsedState.data.phase).toBe(originalState.data.phase);
      expect(parsedState.data.step).toBe(originalState.data.step);
    });
  });

  describe('state types', () => {
    const validTypes: StateType[] = [
      'task_queue',
      'agent_state',
      'migration_progress',
      'autopilot_state',
      'ralph_state',
      'ultraqa_state',
      'validation_state',
    ];

    it.each(validTypes)('should accept valid state type: %s', (type) => {
      const state: StateObject = {
        state_id: 'st_123',
        type,
        updated_at: '2026-03-04T12:00:00Z',
        version: 1,
        data: {},
      };

      const body = serializeStateBody(state, '');
      const parsed = parseStateFromBody(body);

      expect(parsed.type).toBe(type);
    });
  });
});

describe('StateVersionConflictError', () => {
  it('should store current and expected versions', () => {
    const error = new StateVersionConflictError(
      'Version conflict',
      5,
      3
    );

    expect(error.message).toBe('Version conflict');
    expect(error.currentVersion).toBe(5);
    expect(error.expectedVersion).toBe(3);
    expect(error.name).toBe('StateVersionConflictError');
  });
});

describe('StateParseError', () => {
  it('should store original error', () => {
    const originalError = new Error('YAML parse failed');
    const error = new StateParseError('Failed to parse', originalError);

    expect(error.message).toBe('Failed to parse');
    expect(error.originalError).toBe(originalError);
    expect(error.name).toBe('StateParseError');
  });

  it('should work without original error', () => {
    const error = new StateParseError('Failed to parse');

    expect(error.message).toBe('Failed to parse');
    expect(error.originalError).toBeUndefined();
  });
});
