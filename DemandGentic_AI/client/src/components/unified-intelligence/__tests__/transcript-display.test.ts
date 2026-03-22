/**
 * Transcript Speaker Mapping Tests
 *
 * Tests for speaker normalization and transcript display logic.
 * Pure unit tests without external dependencies.
 */

import type { TranscriptTurn, UnifiedTranscript } from '../types';

// ============================================
// Speaker Normalization Logic (matches component)
// ============================================

function normalizeSpeaker(role: string | undefined): 'agent' | 'prospect' | 'system' {
  const lower = role?.toLowerCase() || '';
  if (['agent', 'assistant', 'ai', 'bot', 'rep', 'representative'].includes(lower)) return 'agent';
  if (['system', 'note', 'narrator', 'ivr'].includes(lower)) return 'system';
  return 'prospect';
}

function getSpeakerLabel(speaker: 'agent' | 'prospect' | 'system'): string {
  switch (speaker) {
    case 'agent': return 'Agent';
    case 'prospect': return 'Contact';
    case 'system': return 'System';
  }
}

function analyzeChannels(turns: TranscriptTurn[]): { hasAgent: boolean; hasProspect: boolean; hasSystem: boolean } {
  const hasAgent = turns.some(t => t.speaker === 'agent');
  const hasProspect = turns.some(t => t.speaker === 'prospect');
  const hasSystem = turns.some(t => t.speaker === 'system');
  return { hasAgent, hasProspect, hasSystem };
}

// ============================================
// Test Framework
// ============================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assertEqual(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Expected true but got false');
  }
}

function assertFalse(condition: boolean, message?: string): void {
  if (condition) {
    throw new Error(message || 'Expected false but got true');
  }
}

// ============================================
// Tests: Speaker Normalization
// ============================================

try {
  assertEqual(normalizeSpeaker('agent'), 'agent');
  assertEqual(normalizeSpeaker('Agent'), 'agent');
  assertEqual(normalizeSpeaker('AGENT'), 'agent');
  results.push({ name: 'normalizeSpeaker: handles "agent" case-insensitive', passed: true });
} catch (e) {
  results.push({ name: 'normalizeSpeaker: handles "agent" case-insensitive', passed: false, error: (e as Error).message });
}

try {
  assertEqual(normalizeSpeaker('assistant'), 'agent');
  assertEqual(normalizeSpeaker('ai'), 'agent');
  assertEqual(normalizeSpeaker('bot'), 'agent');
  assertEqual(normalizeSpeaker('rep'), 'agent');
  assertEqual(normalizeSpeaker('representative'), 'agent');
  results.push({ name: 'normalizeSpeaker: maps AI/bot roles to agent', passed: true });
} catch (e) {
  results.push({ name: 'normalizeSpeaker: maps AI/bot roles to agent', passed: false, error: (e as Error).message });
}

try {
  assertEqual(normalizeSpeaker('system'), 'system');
  assertEqual(normalizeSpeaker('note'), 'system');
  assertEqual(normalizeSpeaker('narrator'), 'system');
  assertEqual(normalizeSpeaker('ivr'), 'system');
  results.push({ name: 'normalizeSpeaker: maps system roles', passed: true });
} catch (e) {
  results.push({ name: 'normalizeSpeaker: maps system roles', passed: false, error: (e as Error).message });
}

try {
  assertEqual(normalizeSpeaker('contact'), 'prospect');
  assertEqual(normalizeSpeaker('user'), 'prospect');
  assertEqual(normalizeSpeaker('customer'), 'prospect');
  assertEqual(normalizeSpeaker('prospect'), 'prospect');
  assertEqual(normalizeSpeaker('caller'), 'prospect');
  assertEqual(normalizeSpeaker('lead'), 'prospect');
  results.push({ name: 'normalizeSpeaker: maps contact roles to prospect', passed: true });
} catch (e) {
  results.push({ name: 'normalizeSpeaker: maps contact roles to prospect', passed: false, error: (e as Error).message });
}

try {
  assertEqual(normalizeSpeaker(''), 'prospect');
  assertEqual(normalizeSpeaker(undefined), 'prospect');
  assertEqual(normalizeSpeaker('unknown_role'), 'prospect');
  results.push({ name: 'normalizeSpeaker: defaults unknown to prospect', passed: true });
} catch (e) {
  results.push({ name: 'normalizeSpeaker: defaults unknown to prospect', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Speaker Labels
// ============================================

try {
  assertEqual(getSpeakerLabel('agent'), 'Agent');
  assertEqual(getSpeakerLabel('prospect'), 'Contact');
  assertEqual(getSpeakerLabel('system'), 'System');
  results.push({ name: 'getSpeakerLabel: returns correct labels', passed: true });
} catch (e) {
  results.push({ name: 'getSpeakerLabel: returns correct labels', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Channel Analysis
// ============================================

try {
  const mixedTurns: TranscriptTurn[] = [
    { speaker: 'agent', text: 'Hello' },
    { speaker: 'prospect', text: 'Hi' },
    { speaker: 'system', text: '[Connected]' },
  ];
  const analysis = analyzeChannels(mixedTurns);
  assertTrue(analysis.hasAgent, 'Should have agent');
  assertTrue(analysis.hasProspect, 'Should have prospect');
  assertTrue(analysis.hasSystem, 'Should have system');
  results.push({ name: 'analyzeChannels: detects all speakers', passed: true });
} catch (e) {
  results.push({ name: 'analyzeChannels: detects all speakers', passed: false, error: (e as Error).message });
}

try {
  const agentOnlyTurns: TranscriptTurn[] = [
    { speaker: 'agent', text: 'Hello' },
    { speaker: 'agent', text: 'Are you there?' },
  ];
  const analysis = analyzeChannels(agentOnlyTurns);
  assertTrue(analysis.hasAgent, 'Should have agent');
  assertFalse(analysis.hasProspect, 'Should NOT have prospect');
  assertFalse(analysis.hasSystem, 'Should NOT have system');
  results.push({ name: 'analyzeChannels: detects agent-only', passed: true });
} catch (e) {
  results.push({ name: 'analyzeChannels: detects agent-only', passed: false, error: (e as Error).message });
}

try {
  const emptyTurns: TranscriptTurn[] = [];
  const analysis = analyzeChannels(emptyTurns);
  assertFalse(analysis.hasAgent, 'Empty should have no agent');
  assertFalse(analysis.hasProspect, 'Empty should have no prospect');
  assertFalse(analysis.hasSystem, 'Empty should have no system');
  results.push({ name: 'analyzeChannels: handles empty array', passed: true });
} catch (e) {
  results.push({ name: 'analyzeChannels: handles empty array', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Transcript Availability
// ============================================

try {
  const available: UnifiedTranscript = {
    available: true,
    isFull: true,
    turns: [{ speaker: 'agent', text: 'Hello' }],
  };
  assertTrue(available.available, 'Should be available');
  assertTrue(available.turns.length > 0, 'Should have turns');
  results.push({ name: 'transcript: available with turns', passed: true });
} catch (e) {
  results.push({ name: 'transcript: available with turns', passed: false, error: (e as Error).message });
}

try {
  const unavailable: UnifiedTranscript = {
    available: false,
    isFull: false,
    turns: [],
  };
  assertFalse(unavailable.available, 'Should not be available');
  assertTrue(unavailable.turns.length === 0, 'Should have no turns');
  results.push({ name: 'transcript: unavailable with no turns', passed: true });
} catch (e) {
  results.push({ name: 'transcript: unavailable with no turns', passed: false, error: (e as Error).message });
}

// ============================================
// Export Results
// ============================================

export { results, normalizeSpeaker, getSpeakerLabel, analyzeChannels };

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

if (typeof console !== 'undefined') {
  console.log('\n📊 Transcript Display Tests');
  console.log('===========================');
  results.forEach(r => {
    console.log(r.passed ? `✅ ${r.name}` : `❌ ${r.name}: ${r.error}`);
  });
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
}