#!/usr/bin/env node
/**
 * Completeness Check Hook
 *
 * Runs after Edit/Write to verify implementation is complete.
 * Prevents false "100% complete" claims.
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

    // Only check TypeScript/JavaScript files
    if (!/\.(ts|js|tsx|jsx)$/.test(filePath)) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Skip test files
    if (/\.test\.|\.spec\.|\/tests?\//.test(filePath)) {
      process.stdout.write(raw);
      process.exit(0);
      return;
    }

    // Read the file
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for incomplete implementation indicators
      const issues = [];

      // 1. TODO/FIXME comments
      if (/TODO|FIXME|HACK|XXX/i.test(content)) {
        const todos = (content.match(/TODO|FIXME|HACK|XXX/gi) || []).length;
        issues.push(`${todos} TODO/FIXME comment(s)`);
      }

      // 2. Empty function bodies
      const emptyFunctions = content.match(/function\s+\w+\s*\([^)]*\)\s*\{[\s\n]*\}/g) || [];
      if (emptyFunctions.length > 0) {
        issues.push(`${emptyFunctions.length} empty function(s)`);
      }

      // 3. Throw "not implemented" errors
      const notImplemented = (content.match(/throw\s+new\s+Error\(['"][^'"]*not\s+implemented/i) || []).length;
      if (notImplemented > 0) {
        issues.push(`${notImplemented} "not implemented" error(s)`);
      }

      // 4. Commented out code (possible incomplete implementation)
      const commentedCode = content.match(/^[\s]*\/\/[\s]*(?:export|function|const|let|var|class|interface|type)/gm) || [];
      if (commentedCode.length > 5) {
        issues.push(`${commentedCode.length} commented-out declarations (possible incomplete implementation)`);
      }

      // 5. Missing imports (TypeScript)
      if (/\.tsx?$/.test(filePath)) {
        const importUsage = content.match(/import.*from\s+['"](?!\.|\@\/)/g) || [];
        // This is a rough check - actual implementation would parse AST
      }

      if (issues.length > 0) {
        console.error(`[UltraPilot Hook] ⚠️  Completeness check failed for: ${path.basename(filePath)}`);
        issues.forEach(issue => {
          console.error(`[UltraPilot Hook]   - ${issue}`);
        });
        console.error('[UltraPilot Hook] This implementation is INCOMPLETE');
        console.error('[UltraPilot Hook] Do NOT claim "100% complete" or "production ready"');
        console.error('[UltraPilot Hook] Fix these issues before considering implementation complete');
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
