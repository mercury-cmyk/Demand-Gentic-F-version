/**
 * Unified Intelligence Type Tests
 *
 * Pure unit tests for type utilities and logic.
 * These tests use a simple assertion framework that doesn't require external dependencies.
 */

import {
  buildUnifiedQueryParams,
  formatDuration,
  getQualityScoreColor,
  getSeverityColor,
  defaultUnifiedFilters,
  type UnifiedIntelligenceFilters,
} from '../types';

// ============================================
// Simple Test Framework
// ============================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assertEqual(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertContains(str: string, substr: string): void {
  if (!str.includes(substr)) {
    throw new Error(`Expected "${str}" to contain "${substr}"`);
  }
}

function assertNotContains(str: string, substr: string): void {
  if (str.includes(substr)) {
    throw new Error(`Expected "${str}" NOT to contain "${substr}"`);
  }
}

// ============================================
// Test: formatDuration
// ============================================

try {
  assertEqual(formatDuration(0), '0:00');
  assertEqual(formatDuration(30), '0:30');
  assertEqual(formatDuration(60), '1:00');
  assertEqual(formatDuration(90), '1:30');
  assertEqual(formatDuration(125), '2:05');
  assertEqual(formatDuration(3661), '61:01');
  results.push({ name: 'formatDuration: formats seconds to mm:ss', passed: true });
} catch (e) {
  results.push({ name: 'formatDuration: formats seconds to mm:ss', passed: false, error: (e as Error).message });
}

try {
  assertEqual(formatDuration(null), '--:--');
  assertEqual(formatDuration(undefined), '--:--');
  results.push({ name: 'formatDuration: handles null/undefined', passed: true });
} catch (e) {
  results.push({ name: 'formatDuration: handles null/undefined', passed: false, error: (e as Error).message });
}

// ============================================
// Test: getQualityScoreColor
// ============================================

try {
  assertContains(getQualityScoreColor(70), 'green');
  assertContains(getQualityScoreColor(85), 'green');
  assertContains(getQualityScoreColor(100), 'green');
  results.push({ name: 'getQualityScoreColor: returns green for 70+', passed: true });
} catch (e) {
  results.push({ name: 'getQualityScoreColor: returns green for 70+', passed: false, error: (e as Error).message });
}

try {
  assertContains(getQualityScoreColor(50), 'yellow');
  assertContains(getQualityScoreColor(65), 'yellow');
  assertContains(getQualityScoreColor(69), 'yellow');
  results.push({ name: 'getQualityScoreColor: returns yellow for 50-69', passed: true });
} catch (e) {
  results.push({ name: 'getQualityScoreColor: returns yellow for 50-69', passed: false, error: (e as Error).message });
}

try {
  assertContains(getQualityScoreColor(0), 'red');
  assertContains(getQualityScoreColor(25), 'red');
  assertContains(getQualityScoreColor(49), 'red');
  results.push({ name: 'getQualityScoreColor: returns red for  r.passed).length;
const failed = results.filter(r => !r.passed).length;

if (typeof console !== 'undefined') {
  console.log('\n📊 Unified Intelligence Type Tests');
  console.log('=====================================');
  results.forEach(r => {
    if (r.passed) {
      console.log(`✅ ${r.name}`);
    } else {
      console.log(`❌ ${r.name}: ${r.error}`);
    }
  });
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
}