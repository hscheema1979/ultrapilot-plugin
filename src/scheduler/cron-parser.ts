/**
 * Cron Parser Placeholder
 *
 * Simple cron expression validation
 * In production, replace with a full library like 'node-cron'
 */

export function validateCron(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);

  // Standard cron: 5 parts (minute hour day month weekday)
  // With seconds: 6 parts
  if (parts.length !== 5 && parts.length !== 6) {
    return false;
  }

  // Validate each part
  const patterns = [
    /^\*|([0-5]?\d)(\/\d+)?(,[0-5]?\d(\/\d+)?)*$/, // minute/second
    /^\*|([01]?\d|2[0-3])(\/\d+)?(,([01]?\d|2[0-3])(\/\d+)?)*$/, // hour
    /^\*|([1-9]?\d)(\/\d+)?(,([1-9]?\d)(\/\d+)?)*$/, // day
    /^\*|([1-9]|1[0-2])(\/\d+)?(,([1-9]|1[0-2])(\/\d+)?)*$/, // month
    /^\*|([0-6])(\/\d+)?(,([0-6])(\/\d+)?)*$/ // weekday
  ];

  // Skip seconds part if present
  const startIndex = parts.length === 6 ? 1 : 0;

  for (let i = 0; i < 5; i++) {
    if (!patterns[i].test(parts[startIndex + i])) {
      return false;
    }
  }

  return true;
}
