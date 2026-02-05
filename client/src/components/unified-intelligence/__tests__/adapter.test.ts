/**
 * Normalization Adapter Tests
 *
 * Tests for the adapter logic that transforms various data sources
 * into the unified conversation detail format.
 */

import type {
  UnifiedConversationDetail,
  UnifiedContact,
  UnifiedCampaign,
  UnifiedRecording,
  UnifiedTranscript,
  UnifiedCallAnalysis,
  UnifiedQualityAnalysis,
  TranscriptTurn,
  DetectedIssue,
  QualityRecommendation,
} from '../types';

// ============================================
// Adapter Functions (matches page logic)
// ============================================

interface RawConversation {
  id: string;
  source: string;
  contactName?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  campaignId?: string;
  campaignName?: string;
  isTestCall?: boolean;
  type?: string;
  agentType?: string;
  agentName?: string;
  createdAt: string;
  duration?: number;
  status?: string;
  result?: string;
  disposition?: string;
  hasRecording?: boolean;
  recordingUrl?: string;
  recordingStatus?: string;
  transcriptText?: string;
  transcriptTurns?: Array<{ role: string; text: string; timestamp?: number }>;
  hasTranscript?: boolean;
  analysis?: {
    summary?: string;
    overallScore?: number;
    testResult?: string;
    performanceMetrics?: Record<string, boolean | number | string>;
    conversationStates?: string[];
    issues?: Array<{ severity: string; code: string; type?: string; description: string; recommendation?: string }>;
    qualityDimensions?: Record<string, number>;
    recommendations?: Array<{ area: string; text: string; category?: string; priority?: string }>;
  };
}

function normalizeSpeaker(role: string): 'agent' | 'prospect' | 'system' {
  const lower = role?.toLowerCase() || '';
  if (['agent', 'assistant', 'ai', 'bot'].includes(lower)) return 'agent';
  if (['system', 'note'].includes(lower)) return 'system';
  return 'prospect';
}

function adaptToUnified(raw: RawConversation): UnifiedConversationDetail {
  const contact: UnifiedContact = {
    name: raw.contactName || 'Unknown',
    company: raw.companyName || 'Unknown Company',
    phone: raw.phone,
    email: raw.email,
  };

  const campaign: UnifiedCampaign = {
    id: raw.campaignId,
    name: raw.campaignName || 'Unknown Campaign',
  };

  const recording: UnifiedRecording = {
    available: raw.hasRecording ?? false,
    status: raw.recordingStatus as UnifiedRecording['status'] || 'none',
    url: raw.recordingUrl,
  };

  const turns: TranscriptTurn[] = (raw.transcriptTurns || []).map(t => ({
    speaker: normalizeSpeaker(t.role),
    text: t.text,
    timestamp: t.timestamp ? String(t.timestamp) : undefined,
  }));

  const transcript: UnifiedTranscript = {
    available: raw.hasTranscript ?? turns.length > 0,
    isFull: true,
    rawText: raw.transcriptText,
    turns,
  };

  const detectedIssues: DetectedIssue[] = (raw.analysis?.issues || []).map(i => ({
    severity: i.severity as 'high' | 'medium' | 'low',
    code: i.code || i.type || 'unknown',
    type: i.type,
    description: i.description,
    recommendation: i.recommendation,
  }));

  const callAnalysis: UnifiedCallAnalysis = {
    summaryText: raw.analysis?.summary,
    testResult: raw.analysis?.testResult as 'success' | 'needs_improvement' | 'failed' | undefined,
    metrics: raw.analysis?.performanceMetrics || {},
    conversationStates: raw.analysis?.conversationStates || [],
    detectedIssues,
  };

  const recommendations: QualityRecommendation[] = (raw.analysis?.recommendations || []).map(r => ({
    area: r.area,
    text: r.text,
    category: r.category,
    priority: r.priority as 'high' | 'medium' | 'low' | undefined,
  }));

  const qualityAnalysis: UnifiedQualityAnalysis = {
    score: raw.analysis?.overallScore,
    subscores: raw.analysis?.qualityDimensions || {},
    recommendations,
  };

  return {
    id: raw.id,
    source: raw.source as 'call_session' | 'test_call' | 'dialer_attempt',
    contact,
    campaign,
    type: raw.isTestCall ? 'test' : 'production',
    interactionType: (raw.type as 'call' | 'email') || 'call',
    agentType: (raw.agentType as 'ai' | 'human') || 'ai',
    agentName: raw.agentName,
    createdAt: raw.createdAt,
    durationSec: raw.duration,
    status: raw.status || 'unknown',
    result: raw.result,
    disposition: raw.disposition,
    recording,
    transcript,
    callAnalysis,
    qualityAnalysis,
  };
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

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Expected true but got false');
  }
}

function assertLength(arr: unknown[], expected: number, message?: string): void {
  if (arr.length !== expected) {
    throw new Error(message || `Expected length ${expected} but got ${arr.length}`);
  }
}

// ============================================
// Tests: Basic Adapter
// ============================================

try {
  const raw: RawConversation = {
    id: 'conv-123',
    source: 'call_session',
    contactName: 'John Doe',
    companyName: 'Acme Corp',
    createdAt: '2026-02-04T10:00:00Z',
  };
  
  const unified = adaptToUnified(raw);
  assertEqual(unified.id, 'conv-123');
  assertEqual(unified.source, 'call_session');
  assertEqual(unified.contact.name, 'John Doe');
  assertEqual(unified.contact.company, 'Acme Corp');
  results.push({ name: 'adapter: basic fields mapped correctly', passed: true });
} catch (e) {
  results.push({ name: 'adapter: basic fields mapped correctly', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Type Mapping
// ============================================

try {
  const testCall: RawConversation = {
    id: 'test-1',
    source: 'test_call',
    isTestCall: true,
    createdAt: '2026-02-04T10:00:00Z',
  };
  
  const unified = adaptToUnified(testCall);
  assertEqual(unified.type, 'test');
  results.push({ name: 'adapter: test calls mapped correctly', passed: true });
} catch (e) {
  results.push({ name: 'adapter: test calls mapped correctly', passed: false, error: (e as Error).message });
}

try {
  const prodCall: RawConversation = {
    id: 'prod-1',
    source: 'call_session',
    isTestCall: false,
    createdAt: '2026-02-04T10:00:00Z',
  };
  
  const unified = adaptToUnified(prodCall);
  assertEqual(unified.type, 'production');
  results.push({ name: 'adapter: production calls mapped correctly', passed: true });
} catch (e) {
  results.push({ name: 'adapter: production calls mapped correctly', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Transcript Mapping
// ============================================

try {
  const rawWithTranscript: RawConversation = {
    id: 'trans-1',
    source: 'call_session',
    createdAt: '2026-02-04T10:00:00Z',
    hasTranscript: true,
    transcriptTurns: [
      { role: 'agent', text: 'Hello' },
      { role: 'contact', text: 'Hi there' },
      { role: 'system', text: '[Connected]' },
    ],
  };
  
  const unified = adaptToUnified(rawWithTranscript);
  assertTrue(unified.transcript.available, 'Should be available');
  assertLength(unified.transcript.turns, 3, 'Should have 3 turns');
  assertEqual(unified.transcript.turns[0].speaker, 'agent');
  assertEqual(unified.transcript.turns[1].speaker, 'prospect');
  assertEqual(unified.transcript.turns[2].speaker, 'system');
  results.push({ name: 'adapter: transcript turns normalized', passed: true });
} catch (e) {
  results.push({ name: 'adapter: transcript turns normalized', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Recording Mapping
// ============================================

try {
  const rawWithRecording: RawConversation = {
    id: 'rec-1',
    source: 'call_session',
    createdAt: '2026-02-04T10:00:00Z',
    hasRecording: true,
    recordingUrl: 'https://example.com/recording.mp3',
    recordingStatus: 'stored',
  };
  
  const unified = adaptToUnified(rawWithRecording);
  assertTrue(unified.recording.available, 'Should be available');
  assertEqual(unified.recording.status, 'stored');
  assertEqual(unified.recording.url, 'https://example.com/recording.mp3');
  results.push({ name: 'adapter: recording mapped correctly', passed: true });
} catch (e) {
  results.push({ name: 'adapter: recording mapped correctly', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Analysis Mapping
// ============================================

try {
  const rawWithAnalysis: RawConversation = {
    id: 'analysis-1',
    source: 'call_session',
    createdAt: '2026-02-04T10:00:00Z',
    analysis: {
      summary: 'Good call with qualified lead',
      overallScore: 85,
      testResult: 'success',
      performanceMetrics: {
        identityConfirmed: true,
        pitchDelivered: true,
      },
      conversationStates: ['greeting', 'identity_confirmed', 'pitch'],
      issues: [
        { severity: 'low', code: 'MINOR', description: 'Minor issue', recommendation: 'Fix it' },
      ],
      qualityDimensions: { engagement: 90, clarity: 85 },
      recommendations: [
        { area: 'engagement', text: 'Be more enthusiastic' },
      ],
    },
  };
  
  const unified = adaptToUnified(rawWithAnalysis);
  assertEqual(unified.callAnalysis.summaryText, 'Good call with qualified lead');
  assertEqual(unified.callAnalysis.testResult, 'success');
  assertLength(unified.callAnalysis.conversationStates, 3);
  assertLength(unified.callAnalysis.detectedIssues, 1);
  assertEqual(unified.qualityAnalysis.score, 85);
  assertEqual(unified.qualityAnalysis.subscores.engagement, 90);
  assertLength(unified.qualityAnalysis.recommendations, 1);
  results.push({ name: 'adapter: analysis mapped correctly', passed: true });
} catch (e) {
  results.push({ name: 'adapter: analysis mapped correctly', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Default Values
// ============================================

try {
  const minimal: RawConversation = {
    id: 'min-1',
    source: 'call_session',
    createdAt: '2026-02-04T10:00:00Z',
  };
  
  const unified = adaptToUnified(minimal);
  assertEqual(unified.contact.name, 'Unknown');
  assertEqual(unified.contact.company, 'Unknown Company');
  assertEqual(unified.campaign.name, 'Unknown Campaign');
  assertEqual(unified.recording.available, false);
  assertEqual(unified.transcript.available, false);
  assertEqual(unified.status, 'unknown');
  results.push({ name: 'adapter: uses defaults for missing fields', passed: true });
} catch (e) {
  results.push({ name: 'adapter: uses defaults for missing fields', passed: false, error: (e as Error).message });
}

// ============================================
// Export Results
// ============================================

export { results, adaptToUnified };

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

if (typeof console !== 'undefined') {
  console.log('\n📊 Normalization Adapter Tests');
  console.log('==============================');
  results.forEach(r => {
    console.log(r.passed ? `✅ ${r.name}` : `❌ ${r.name}: ${r.error}`);
  });
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
}
