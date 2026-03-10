#!/usr/bin/env node
/**
 * Mock Implementation Warning Hook
 *
 * Warns when editing files that have mock implementations.
 * Prevents fake "100% complete" from mock-based tests.
 */

import fs from 'fs';
import path from 'path';

const MAX_STDIN = 1024 * 1024;
let raw = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length < MAX_STDIN) {
    raw += chunk.substring(0, MAX_STDIN - raw.length);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const filePath = input.tool_input?.file_path || '';

    if (!filePath) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Only check source files (not tests)
    const isSourceFile = /\.(ts|js|tsx|jsx)$/.test(filePath) &&
                        !/\.test\./.test(filePath) &&
                        !/\.spec\./.test(filePath) &&
                        !/\/tests?\//.test(filePath) &&
                        !/\/__tests__\//.test(filePath);

    if (!isSourceFile) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Read the file after edit
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for mock implementation patterns
      const mockPatterns = [
        /throw new Error\(['"]\s*(Not implemented|TODO|FIXME)\s*['"]\)/,
        /\/\/\s*(TODO|FIXME|NOT IMPLEMENTED|MOCK).*/i,
        /\bmock.*implementation\b/i,
        /\bplaceholder.*implementation\b/i,
        /function\s+\w+\s*\(\)\s*\{\s*\/\/\s*\}/,
        /const\s+\w+\s*=\s*\(\)\s*=>\s*\{\s*\/\/\s*\}/
      ];

      const hasMock = mockPatterns.some(pattern => pattern.test(content));

      if (hasMock) {
        console.error(`[UltraPilot Hook] ⚠️  Mock implementation detected in: ${filePath}`);
        console.error('[UltraPilot Hook] This file contains incomplete/mock implementations');
        console.error('[UltraPilot Hook] Tests may pass with mocks, but code is NOT production-ready');
        console.error('[UltraPilot Hook] Status should NOT be "100% complete" with mocks');
        console.error('[UltraPilot Hook] Either:');
        console.error('[UltraPilot Hook]   1. Implement the actual functionality, or');
        console.error('[UltraPilot Hook]   2. Clearly document this as INTENTIONAL placeholder');
      }
    } catch (readError) {
      // File doesn't exist yet or can't be read - ignore
    }

  } catch (e) {
    // Ignore parse errors
  }

  process.stdout.write(raw);
  process.exit(0);
});
