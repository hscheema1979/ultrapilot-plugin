#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * Suggests manual compaction at logical intervals.
 * Cross-platform (Windows, macOS, Linux)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const PLATFORM = os.platform();
const TMP_DIR = os.tmpdir();

async function main() {
  // Track tool call count
  const sessionId = (process.env.CLAUDE_SESSION_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const counterFile = path.join(TMP_DIR, `claude-tool-count-${sessionId}`);
  const rawThreshold = parseInt(process.env.COMPACT_THRESHOLD || '50', 10);
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 10000
    ? rawThreshold
    : 50;

  let count = 1;

  // Read existing count or start at 1
  try {
    if (fs.existsSync(counterFile)) {
      const parsed = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
      count = (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000000)
        ? parsed + 1
        : 1;
    }
  } catch (e) {
    count = 1;
  }

  // Write new count
  try {
    fs.writeFileSync(counterFile, String(count));
  } catch (e) {
    // Ignore write errors
  }

  // Suggest compact after threshold tool calls
  if (count === threshold) {
    console.error(`[UltraPilot Hook] ${threshold} tool calls reached - consider /compact if transitioning phases`);
  }

  // Suggest at regular intervals after threshold
  if (count > threshold && (count - threshold) % 25 === 0) {
    console.error(`[UltraPilot Hook] ${count} tool calls - good checkpoint for /compact if context is stale`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[UltraPilot Hook] Compact suggester error:', err.message);
  process.exit(0);
});
