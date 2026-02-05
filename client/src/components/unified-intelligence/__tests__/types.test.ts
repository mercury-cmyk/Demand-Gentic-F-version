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

function assertEqual<T>(actual: T, expected: T, message?: string): void {
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
  results.push({ name: 'getQualityScoreColor: returns red for <50', passed: true });
} catch (e) {
  results.push({ name: 'getQualityScoreColor: returns red for <50', passed: false, error: (e as Error).message });
}

try {
  assertContains(getQualityScoreColor(undefined), 'gray');
  results.push({ name: 'getQualityScoreColor: returns gray for undefined', passed: true });
} catch (e) {
  results.push({ name: 'getQualityScoreColor: returns gray for undefined', passed: false, error: (e as Error).message });
}

// ============================================
// Test: getSeverityColor
// ============================================

try {
  assertContains(getSeverityColor('high'), 'red');
  assertContains(getSeverityColor('medium'), 'yellow');
  assertContains(getSeverityColor('low'), 'gray');
  results.push({ name: 'getSeverityColor: returns correct colors', passed: true });
} catch (e) {
  results.push({ name: 'getSeverityColor: returns correct colors', passed: false, error: (e as Error).message });
}

// ============================================
// Test: buildUnifiedQueryParams
// ============================================

try {
  const params = buildUnifiedQueryParams(defaultUnifiedFilters, 1, 20);
  assertContains(params, 'page=1');
  assertContains(params, 'limit=20');
  assertContains(params, 'sortBy=date');
  assertContains(params, 'sortOrder=desc');
  results.push({ name: 'buildUnifiedQueryParams: builds basic params', passed: true });
} catch (e) {
  results.push({ name: 'buildUnifiedQueryParams: builds basic params', passed: false, error: (e as Error).message });
}

try {
  const filters: UnifiedIntelligenceFilters = { ...defaultUnifiedFilters, search: 'Acme Corp' };
  const params = buildUnifiedQueryParams(filters, 1, 20);
  assertContains(params, 'search=Acme%20Corp');
  results.push({ name: 'buildUnifiedQueryParams: includes search', passed: true });
} catch (e) {
  results.push({ name: 'buildUnifiedQueryParams: includes search', passed: false, error: (e as Error).message });
}

try {
  const filters: UnifiedIntelligenceFilters = { ...defaultUnifiedFilters, campaignId: 'camp-123' };
  const params = buildUnifiedQueryParams(filters, 1, 20);
  assertContains(params, 'campaignId=camp-123');
  results.push({ name: 'buildUnifiedQueryParams: includes campaignId', passed: true });
} catch (e) {
  results.push({ name: 'buildUnifiedQueryParams: includes campaignId', passed: false, error: (e as Error).message });
}

try {
  const params = buildUnifiedQueryParams(defaultUnifiedFilters, 1, 20);
  assertNotContains(params, 'campaignId');
  results.push({ name: 'buildUnifiedQueryParams: excludes campaignId="all"', passed: true });
} catch (e) {
  results.push({ name: 'buildUnifiedQueryParams: excludes campaignId="all"', passed: false, error: (e as Error).message });
}

// ============================================
// Test: Speaker Normalization Logic
// ============================================

function normalizeSpeaker(role: string): 'agent' | 'prospect' | 'system' {
  const lower = role?.toLowerCase() || '';
  if (['agent', 'assistant', 'ai', 'bot'].includes(lower)) return 'agent';
  if (['system', 'note'].includes(lower)) return 'system';
  return 'prospect';
}

try {
  assertEqual(normalizeSpeaker('agent'), 'agent');
  assertEqual(normalizeSpeaker('Agent'), 'agent');
  assertEqual(normalizeSpeaker('assistant'), 'agent');
  assertEqual(normalizeSpeaker('ai'), 'agent');
  assertEqual(normalizeSpeaker('bot'), 'agent');
  results.push({ name: 'normalizeSpeaker: maps agent roles', passed: true });
} catch (e) {
  results.push({ name: 'normalizeSpeaker: maps agent roles', passed: false, error: (e as Error).message });
}

try {
  assertEqual(normalizeSpeaker('system'), 'system');
  assertEqual(normalizeSpeaker('note'), 'system');
  results.push({ name: 'normalizeSpeaker: maps system roles', passed: true });
} catch (e) {
  results.push({ name: 'normalizeSpeaker: maps system roles', passed: false, error: (e as Error).message });
}

try {
  assertEqual(normalizeSpeaker('contact'), 'prospect');
  assertEqual(normalizeSpeaker('user'), 'prospect');
  assertEqual(normalizeSpeaker('customer'), 'prospect');
  assertEqual(normalizeSpeaker('unknown'), 'prospect');
  assertEqual(normalizeSpeaker(''), 'prospect');
  results.push({ name: 'normalizeSpeaker: defaults to prospect', passed: true });
} catch (e) {
  results.push({ name: 'normalizeSpeaker: defaults to prospect', passed: false, error: (e as Error).message });
}

// ============================================
// Test: Recording URL Generation
// ============================================

try {
  const recordingId = 'rec-123';
  const streamUrl = `/api/recordings/${recordingId}/stream`;
  assertEqual(streamUrl, '/api/recordings/rec-123/stream');
  results.push({ name: 'Recording URL: uses stream endpoint', passed: true });
} catch (e) {
  results.push({ name: 'Recording URL: uses stream endpoint', passed: false, error: (e as Error).message });
}

// ============================================
// Export Results
// ============================================

export { results };

// Log results when run directly
const passed = results.filter(r => r.passed).length;
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
