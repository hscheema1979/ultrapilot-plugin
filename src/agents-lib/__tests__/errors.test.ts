/**
 * Error Handling System - Verification Tests
 *
 * This file contains comprehensive tests to verify the error handling system.
 * Run with: ts-node src/wshobson/__tests__/errors.test.ts
 */

import {
  ErrorCode,
  ErrorSeverity,
  ErrorCategory,
  DelegationError,
  ErrorRetryStrategy,
  ErrorTelemetry,
} from '../errors.js';

// Test utilities
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

// Color output for better readability
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;

// Test suite
async function runTests() {
  console.log(cyan('\n=== Error Handling System Verification Tests ===\n'));

  let passed = 0;
  let failed = 0;

  // Test 1: DelegationError creation
  try {
    console.log('Test 1: Creating DelegationError instances...');

    const timeoutError = DelegationError.timeout('Agent timed out', 'data-analyst', 'trace-123');
    assertEqual(timeoutError.code, ErrorCode.TIMEOUT_ERROR, 'Timeout error code');
    assertEqual(timeoutError.retryable, true, 'Timeout is retryable');
    assertEqual(timeoutError.severity, ErrorSeverity.MEDIUM, 'Timeout severity');
    assertEqual(timeoutError.category, ErrorCategory.TIMEOUT, 'Timeout category');
    assertEqual(timeoutError.agentName, 'data-analyst', 'Agent name');
    assertEqual(timeoutError.traceId, 'trace-123', 'Trace ID');

    const validationError = DelegationError.validation('Invalid task', { field: 'task' });
    assertEqual(validationError.code, ErrorCode.VALIDATION_ERROR, 'Validation error code');
    assertEqual(validationError.retryable, false, 'Validation is not retryable');
    assertEqual(validationError.severity, ErrorSeverity.LOW, 'Validation severity');
    assertEqual(validationError.category, ErrorCategory.VALIDATION, 'Validation category');

    const cancelledError = DelegationError.cancelled('business-analyst');
    assertEqual(cancelledError.code, ErrorCode.CANCELLED_ERROR, 'Cancelled error code');
    assertEqual(cancelledError.retryable, false, 'Cancelled is not retryable');

    const retryableError = DelegationError.retryable('Network issue', 2000, 'api-agent');
    assertEqual(retryableError.code, ErrorCode.RETRYABLE_ERROR, 'Retryable error code');
    assertEqual(retryableError.retryable, true, 'Retryable is retryable');
    assertEqual(retryableError.retryDelay, 2000, 'Retry delay');

    const fatalError = DelegationError.fatal('System crashed');
    assertEqual(fatalError.code, ErrorCode.FATAL_ERROR, 'Fatal error code');
    assertEqual(fatalError.severity, ErrorSeverity.CRITICAL, 'Fatal severity');
    assertEqual(fatalError.retryable, false, 'Fatal is not retryable');

    console.log(green('✓ Test 1 passed: DelegationError creation\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 1 failed: ${error}\n`));
    failed++;
  }

  // Test 2: DelegationError serialization
  try {
    console.log('Test 2: Testing DelegationError serialization...');

    const error = new DelegationError({
      code: ErrorCode.TIMEOUT_ERROR,
      message: 'Test error',
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.TIMEOUT,
      details: { timeout: 30000 },
      retryable: true,
      retryDelay: 5000,
      agentName: 'test-agent',
      traceId: 'trace-456',
    });

    const json = error.toJSON();
    assertEqual(json.code, ErrorCode.TIMEOUT_ERROR, 'JSON code');
    assertEqual(json.message, 'Test error', 'JSON message');
    assertEqual(json.severity, ErrorSeverity.HIGH, 'JSON severity');
    assertEqual(json.retryable, true, 'JSON retryable');
    assertEqual(json.agentName, 'test-agent', 'JSON agentName');

    console.log(green('✓ Test 2 passed: DelegationError serialization\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 2 failed: ${error}\n`));
    failed++;
  }

  // Test 3: ErrorRetryStrategy - isRetryable
  try {
    console.log('Test 3: Testing ErrorRetryStrategy.isRetryable...');

    const strategy = new ErrorRetryStrategy();

    const timeoutError = DelegationError.timeout('Timeout');
    assert(strategy.isRetryable(timeoutError), 'Timeout is retryable');

    const validationError = DelegationError.validation('Invalid');
    assert(!strategy.isRetryable(validationError), 'Validation is not retryable');

    const fatalError = DelegationError.fatal('Crash');
    assert(!strategy.isRetryable(fatalError), 'Fatal is not retryable');

    // Test with generic Error
    const networkError = new Error('ECONNREFUSED');
    assert(strategy.isRetryable(networkError), 'Network error is retryable');

    const genericError = new Error('Something went wrong');
    assert(!strategy.isRetryable(genericError), 'Generic error is not retryable');

    console.log(green('✓ Test 3 passed: ErrorRetryStrategy.isRetryable\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 3 failed: ${error}\n`));
    failed++;
  }

  // Test 4: ErrorRetryStrategy - exponential backoff
  try {
    console.log('Test 4: Testing exponential backoff calculation...');

    const strategy = new ErrorRetryStrategy({
      baseDelay: 1000,
      maxDelay: 60000,
      exponentialBackoff: true,
      backoffMultiplier: 2,
    });

    const delay1 = strategy.calculateBackoff(1);
    const delay2 = strategy.calculateBackoff(2);
    const delay3 = strategy.calculateBackoff(3);
    const delay4 = strategy.calculateBackoff(4);
    const delay5 = strategy.calculateBackoff(5);

    // Check exponential growth (allowing for jitter)
    console.log(`  Delays: ${delay1}ms, ${delay2}ms, ${delay3}ms, ${delay4}ms, ${delay5}ms`);

    assert(delay1 >= 900 && delay1 <= 1100, 'Delay 1 should be ~1000ms');
    assert(delay2 >= 1800 && delay2 <= 2200, 'Delay 2 should be ~2000ms');
    assert(delay3 >= 3600 && delay3 <= 4400, 'Delay 3 should be ~4000ms');
    assert(delay4 >= 7200 && delay4 <= 8800, 'Delay 4 should be ~8000ms');
    assert(delay5 >= 14400 && delay5 <= 17600, 'Delay 5 should be ~16000ms');

    // Test max delay cap
    const delay10 = strategy.calculateBackoff(10);
    assert(delay10 <= 60000, 'Delay should be capped at maxDelay');

    console.log(green('✓ Test 4 passed: Exponential backoff calculation\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 4 failed: ${error}\n`));
    failed++;
  }

  // Test 5: ErrorRetryStrategy - shouldRetry
  try {
    console.log('Test 5: Testing shouldRetry logic...');

    const strategy = new ErrorRetryStrategy({ maxAttempts: 3 });

    const timeoutError = DelegationError.timeout('Timeout');

    assert(strategy.shouldRetryAfter(timeoutError, 1), 'Should retry on attempt 1');
    assert(strategy.shouldRetryAfter(timeoutError, 2), 'Should retry on attempt 2');
    assert(strategy.shouldRetryAfter(timeoutError, 3), 'Should retry on attempt 3');
    assert(!strategy.shouldRetryAfter(timeoutError, 4), 'Should NOT retry on attempt 4');

    const validationError = DelegationError.validation('Invalid');
    assert(!strategy.shouldRetryAfter(validationError, 1), 'Should NOT retry validation error');

    console.log(green('✓ Test 5 passed: shouldRetry logic\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 5 failed: ${error}\n`));
    failed++;
  }

  // Test 6: ErrorRetryStrategy - custom retry delay
  try {
    console.log('Test 6: Testing custom retry delay from error...');

    const strategy = new ErrorRetryStrategy();

    const customError = new DelegationError({
      code: ErrorCode.RETRYABLE_ERROR,
      message: 'Custom error with specific delay',
      retryable: true,
      retryDelay: 7000,
    });

    const delay = strategy.getRetryDelay(1, customError);
    console.log(`  Custom delay: ${delay}ms`);

    assert(delay >= 6300 && delay <= 7700, 'Should use error\'s retryDelay with jitter');

    console.log(green('✓ Test 6 passed: Custom retry delay\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 6 failed: ${error}\n`));
    failed++;
  }

  // Test 7: ErrorTelemetry - error tracking
  try {
    console.log('Test 7: Testing ErrorTelemetry error tracking...');

    const telemetry = new ErrorTelemetry();

    const error1 = DelegationError.timeout('Timeout 1', 'agent-1');
    const error2 = DelegationError.validation('Validation error', { agent: 'agent-2' });
    const error3 = DelegationError.retryable('Network error', 2000, 'agent-1');

    telemetry.recordError(error1);
    telemetry.recordError(error2);
    telemetry.recordError(error3);

    const stats = telemetry.getStats();
    assertEqual(stats.totalErrors, 3, 'Total errors count');

    assertEqual(stats.errorsByCode[ErrorCode.TIMEOUT_ERROR], 1, 'Timeout errors');
    assertEqual(stats.errorsByCode[ErrorCode.VALIDATION_ERROR], 1, 'Validation errors');
    assertEqual(stats.errorsByCode[ErrorCode.RETRYABLE_ERROR], 1, 'Retryable errors');

    assertEqual(stats.errorsByAgent['agent-1'], 2, 'Agent-1 errors');
    assertEqual(stats.errorsByAgent['agent-2'], 1, 'Agent-2 errors');

    console.log(green('✓ Test 7 passed: ErrorTelemetry tracking\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 7 failed: ${error}\n`));
    failed++;
  }

  // Test 8: ErrorTelemetry - error rate
  try {
    console.log('Test 8: Testing ErrorTelemetry error rate calculation...');

    const telemetry = new ErrorTelemetry({ errorRateWindow: 10000 });

    // Record multiple errors
    for (let i = 0; i < 10; i++) {
      telemetry.recordError(DelegationError.retryable(`Error ${i}`));
    }

    const errorRate = telemetry.getErrorRate();
    console.log(`  Error rate: ${errorRate.toFixed(2)} errors/min`);

    assert(errorRate > 0, 'Error rate should be positive');
    assert(telemetry.isErrorRateHigh(5), 'Error rate should be high (> 5)');

    const topCodes = telemetry.getTopErrorCodes(3);
    assertEqual(topCodes.length, 1, 'Top error codes count');
    assertEqual(topCodes[0].code, ErrorCode.RETRYABLE_ERROR, 'Top error code');

    console.log(green('✓ Test 8 passed: ErrorTelemetry error rate\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 8 failed: ${error}\n`));
    failed++;
  }

  // Test 9: ErrorTelemetry - reset
  try {
    console.log('Test 9: Testing ErrorTelemetry reset...');

    const telemetry = new ErrorTelemetry();

    telemetry.recordError(DelegationError.timeout('Test'));
    assertEqual(telemetry.getStats().totalErrors, 1, 'Errors before reset');

    telemetry.reset();
    assertEqual(telemetry.getStats().totalErrors, 0, 'Errors after reset');
    assertEqual(telemetry.getErrorRate(), 0, 'Error rate after reset');

    console.log(green('✓ Test 9 passed: ErrorTelemetry reset\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 9 failed: ${error}\n`));
    failed++;
  }

  // Test 10: Integration test - full workflow
  try {
    console.log('Test 10: Integration test - full error handling workflow...');

    const telemetry = new ErrorTelemetry();
    const strategy = new ErrorRetryStrategy({ maxAttempts: 5 });

    let attempts = 0;
    let success = false;

    while (attempts < strategy.getMaxAttempts()) {
      attempts++;

      // Simulate an error
      const error = DelegationError.retryable('Transient network failure', 1000, 'test-agent');
      telemetry.recordError(error);

      if (!strategy.shouldRetryAfter(error, attempts)) {
        break;
      }

      // Simulate success on 3rd attempt
      if (attempts === 3) {
        success = true;
        break;
      }

      const delay = strategy.getRetryDelay(attempts, error);
      console.log(`  Attempt ${attempts}: Waiting ${delay}ms before retry...`);
    }

    assert(success, 'Should succeed on 3rd attempt');
    assertEqual(attempts, 3, 'Should make 3 attempts');

    const stats = telemetry.getStats();
    assertEqual(stats.totalErrors, 2, 'Should record 2 errors (before success)');

    console.log(green('✓ Test 10 passed: Integration workflow\n'));
    passed++;
  } catch (error) {
    console.log(red(`✗ Test 10 failed: ${error}\n`));
    failed++;
  }

  // Summary
  console.log(cyan('=== Test Summary ==='));
  console.log(`Total tests: ${passed + failed}`);
  console.log(green(`Passed: ${passed}`));
  if (failed > 0) {
    console.log(red(`Failed: ${failed}`));
  }
  console.log();

  if (failed === 0) {
    console.log(green('✓ All tests passed!\n'));
    process.exit(0);
  } else {
    console.log(red('✗ Some tests failed!\n'));
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error(red(`\n✗ Test suite failed with error: ${error}\n`));
  process.exit(1);
});
