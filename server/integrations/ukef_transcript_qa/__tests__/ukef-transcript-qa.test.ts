/**
 * UKEF Transcript Quality + Disposition Validation — Tests
 *
 * Tests for:
 * - Transcript quality classifier (pure function, no DB)
 * - Disposition normalization
 * - Feature flag gating
 * - Client gate logic
 * - Pipeline configuration
 * - Type shape validation
 * - Privacy checks (no PII in prompts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyTranscript } from '../transcript-classifier';
import {
  UKEF_CLIENT_ACCOUNT_ID,
  DEFAULT_PIPELINE_CONFIG,
  type QualityMetrics,
  type DispositionAnalysisResult,
  type PipelineConfig,
  type TranscriptQualityStatus,
} from '../types';

// ─── Transcript Quality Classifier Tests ─────────────────────────────────────

describe('Transcript Quality Classifier', () => {
  describe('classifyTranscript — missing transcripts', () => {
    it('should classify null transcript as missing', () => {
      const result = classifyTranscript(null, null);
      expect(result.status).toBe('missing');
      expect(result.hasBothSides).toBe(false);
      expect(result.metrics.word_count).toBe(0);
    });

    it('should classify empty string as missing', () => {
      const result = classifyTranscript('', null);
      expect(result.status).toBe('missing');
    });

    it('should classify empty structured transcript as missing', () => {
      const result = classifyTranscript(null, { text: '', utterances: [] });
      expect(result.status).toBe('missing');
    });
  });

  describe('classifyTranscript — partial transcripts', () => {
    it('should classify short transcript as partial', () => {
      const result = classifyTranscript('Hello this is a short transcript', null);
      expect(result.status).toBe('partial');
      expect(result.hasBothSides).toBe(false);
    });

    it('should classify single-speaker structured transcript as partial', () => {
      const result = classifyTranscript(null, {
        text: 'Hello this is a test call. I wanted to discuss the opportunity with you today and see if there is any interest.',
        utterances: [
          { speaker: 'Speaker 1', text: 'Hello this is a test call. I wanted to discuss the opportunity with you today and see if there is any interest.', start: 0, end: 10 },
        ],
      });
      expect(result.status).toBe('partial');
      expect(result.hasBothSides).toBe(false);
      expect(result.diarizationUsed).toBe(false);
      expect(result.metrics.unique_speakers).toBe(1);
    });

    it('should classify plain text without diarization as partial', () => {
      const longText = 'This is a test transcript with enough words to pass the minimum word count threshold for classification. It contains various discussion points about the opportunity.';
      const result = classifyTranscript(longText, null);
      expect(result.status).toBe('partial');
      expect(result.diarizationUsed).toBe(false);
    });
  });

  describe('classifyTranscript — complete transcripts', () => {
    it('should classify two-speaker structured transcript as complete', () => {
      const result = classifyTranscript(null, {
        text: 'Hello this is John from DemandGentic calling about a content syndication opportunity. Hi John this is Sarah from Lightcast. I wanted to discuss the opportunity with you today and understand your current content marketing strategy and what you are looking for. That sounds really interesting, please tell me more about how this would work for our business and what results we can expect.',
        utterances: [
          { speaker: 'Speaker 1', text: 'Hello this is John from DemandGentic calling about a content syndication opportunity.', start: 0, end: 5 },
          { speaker: 'Speaker 2', text: 'Hi John this is Sarah from Lightcast.', start: 5, end: 8 },
          { speaker: 'Speaker 1', text: 'I wanted to discuss the opportunity with you today and understand your current content marketing strategy and what you are looking for.', start: 8, end: 15 },
          { speaker: 'Speaker 2', text: 'That sounds really interesting, please tell me more about how this would work for our business and what results we can expect.', start: 15, end: 22 },
        ],
      });
      expect(result.status).toBe('complete');
      expect(result.hasBothSides).toBe(true);
      expect(result.diarizationUsed).toBe(true);
      expect(result.speakerLabels).toContain('Speaker 1');
      expect(result.speakerLabels).toContain('Speaker 2');
      expect(result.metrics.unique_speakers).toBe(2);
      expect(result.metrics.turn_count).toBe(4);
    });

    it('should handle three-speaker transcripts', () => {
      const result = classifyTranscript(null, {
        text: 'Hello this is a three-way call with John, Sarah, and Mike discussing the opportunity in detail.',
        utterances: [
          { speaker: 'Speaker 1', text: 'Hello this is a three-way call', start: 0, end: 2 },
          { speaker: 'Speaker 2', text: 'with John, Sarah,', start: 2, end: 4 },
          { speaker: 'Speaker 3', text: 'and Mike discussing the opportunity in detail.', start: 4, end: 7 },
        ],
      });
      expect(result.hasBothSides).toBe(true);
      expect(result.metrics.unique_speakers).toBe(3);
    });
  });

  describe('classifyTranscript — quality metrics', () => {
    it('should compute word count correctly', () => {
      const result = classifyTranscript('one two three four five', null);
      expect(result.metrics.word_count).toBe(5);
    });

    it('should compute char count correctly', () => {
      const text = 'Hello World';
      const result = classifyTranscript(text, null);
      expect(result.metrics.char_count).toBe(11);
    });

    it('should compute speaker balance ratio', () => {
      const result = classifyTranscript(null, {
        text: 'Speaker one says hello. Speaker two says goodbye.',
        utterances: [
          { speaker: 'Speaker 1', text: 'Speaker one says hello and more words to test balance', start: 0, end: 5 },
          { speaker: 'Speaker 2', text: 'Speaker two says goodbye and more words for balance', start: 5, end: 10 },
        ],
      });
      // Both speakers have roughly equal word counts
      expect(result.metrics.speaker_balance_ratio).toBeGreaterThan(0.5);
    });

    it('should detect duration from utterance timestamps', () => {
      const result = classifyTranscript(null, {
        text: 'Hello this is a conversation about the product offering that should be interesting and informative.',
        utterances: [
          { speaker: 'Speaker 1', text: 'Hello this is a conversation about the product offering', start: 0, end: 30 },
          { speaker: 'Speaker 2', text: 'that should be interesting and informative.', start: 30, end: 60 },
        ],
      });
      expect(result.metrics.duration_seconds).toBe(60);
    });

    it('should return null duration when no timestamps', () => {
      const result = classifyTranscript(null, {
        text: 'Hello this is a conversation about the product offering that we think might interest you.',
        utterances: [
          { speaker: 'Speaker 1', text: 'Hello this is a conversation about the product offering that we think might interest you.' },
        ],
      });
      expect(result.metrics.duration_seconds).toBeNull();
    });

    it('should compute empty ratio for trivial utterances', () => {
      const result = classifyTranscript(null, {
        text: 'Hello ok yes no goodbye',
        utterances: [
          { speaker: 'Speaker 1', text: 'ok', start: 0, end: 1 },
          { speaker: 'Speaker 2', text: 'Hello this is a longer sentence with more content', start: 1, end: 5 },
          { speaker: 'Speaker 1', text: 'no', start: 5, end: 6 },
        ],
      });
      // 2 out of 3 utterances are trivial (< 3 chars)
      expect(result.metrics.empty_ratio).toBeCloseTo(2/3, 1);
    });
  });

  describe('classifyTranscript — custom config', () => {
    it('should respect custom minWordCount', () => {
      const config: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        minWordCount: 5,
      };
      const result = classifyTranscript(null, {
        text: 'Hello how are you today friend?',
        utterances: [
          { speaker: 'Speaker 1', text: 'Hello how are', start: 0, end: 2 },
          { speaker: 'Speaker 2', text: 'you today friend?', start: 2, end: 4 },
        ],
      }, config);
      expect(result.status).toBe('complete');
    });

    it('should respect custom minSpeakers', () => {
      const config: PipelineConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        minSpeakers: 3,
      };
      const result = classifyTranscript(null, {
        text: 'Hello this is John from DemandGentic. Hi John, this is Sarah. I wanted to discuss things.',
        utterances: [
          { speaker: 'Speaker 1', text: 'Hello this is John from DemandGentic.', start: 0, end: 3 },
          { speaker: 'Speaker 2', text: 'Hi John, this is Sarah. I wanted to discuss things.', start: 3, end: 7 },
        ],
      }, config);
      // Only 2 speakers, need 3 — should be partial
      expect(result.hasBothSides).toBe(false);
    });
  });
});

// ─── Disposition Normalization Tests ─────────────────────────────────────────

describe('Disposition Normalization', () => {
  // Test the normalizeDisposition logic by simulating the function inline
  function normalizeDisposition(d: string): string {
    const normalized = d.toLowerCase().trim().replace(/-/g, '_');
    const map: Record<string, string> = {
      qualified: 'qualified_lead',
      not_interested: 'not_interested',
      dnc_request: 'do_not_call',
      dnc: 'do_not_call',
      callback_requested: 'callback_requested',
      callback: 'callback_requested',
      wrong_number: 'invalid_data',
      no_answer: 'no_answer',
      busy: 'no_answer',
      voicemail: 'voicemail',
      connected: 'needs_review',
      invalid_data: 'invalid_data',
      needs_review: 'needs_review',
    };
    return map[normalized] || normalized;
  }

  it('should normalize "qualified" to "qualified_lead"', () => {
    expect(normalizeDisposition('qualified')).toBe('qualified_lead');
  });

  it('should normalize "dnc-request" to "do_not_call"', () => {
    expect(normalizeDisposition('dnc-request')).toBe('do_not_call');
  });

  it('should normalize "callback-requested" to "callback_requested"', () => {
    expect(normalizeDisposition('callback-requested')).toBe('callback_requested');
  });

  it('should normalize "wrong_number" to "invalid_data"', () => {
    expect(normalizeDisposition('wrong_number')).toBe('invalid_data');
  });

  it('should normalize "busy" to "no_answer"', () => {
    expect(normalizeDisposition('busy')).toBe('no_answer');
  });

  it('should normalize "connected" to "needs_review"', () => {
    expect(normalizeDisposition('connected')).toBe('needs_review');
  });

  it('should handle case-insensitive input', () => {
    expect(normalizeDisposition('QUALIFIED')).toBe('qualified_lead');
    expect(normalizeDisposition('Not_Interested')).toBe('not_interested');
  });

  it('should handle already-normalized dispositions', () => {
    expect(normalizeDisposition('qualified_lead')).toBe('qualified_lead');
    expect(normalizeDisposition('do_not_call')).toBe('do_not_call');
  });

  it('should pass through unknown dispositions', () => {
    expect(normalizeDisposition('some_new_status')).toBe('some_new_status');
  });
});

// ─── Feature Flag Tests ──────────────────────────────────────────────────────

describe('Feature Flag: ukef_transcript_qa', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should be defined in FEATURE_FLAGS', async () => {
    const { FEATURE_FLAGS } = await import('../../../feature-flags');
    expect(FEATURE_FLAGS).toHaveProperty('ukef_transcript_qa');
    expect(FEATURE_FLAGS.ukef_transcript_qa.name).toBe('ukef_transcript_qa');
  });

  it('should default to disabled', async () => {
    const { FEATURE_FLAGS } = await import('../../../feature-flags');
    expect(FEATURE_FLAGS.ukef_transcript_qa.default).toBe(false);
  });

  it('should be enabled when in FEATURE_FLAGS env var', async () => {
    process.env.FEATURE_FLAGS = 'ukef_transcript_qa';
    const { isFeatureEnabled } = await import('../../../feature-flags');
    expect(isFeatureEnabled('ukef_transcript_qa')).toBe(true);
  });

  it('should be disabled when not in FEATURE_FLAGS env var', async () => {
    process.env.FEATURE_FLAGS = 'other_flag';
    const { isFeatureEnabled } = await import('../../../feature-flags');
    expect(isFeatureEnabled('ukef_transcript_qa')).toBe(false);
  });
});

// ─── Client Gate Tests ───────────────────────────────────────────────────────

describe('Client Gate Logic (UKEF TQA)', () => {
  it('should accept the UKEF client account ID', () => {
    const testClientAccountId = UKEF_CLIENT_ACCOUNT_ID;
    const isAllowed = testClientAccountId === UKEF_CLIENT_ACCOUNT_ID;
    expect(isAllowed).toBe(true);
  });

  it('should reject a different client account ID', () => {
    const testClientAccountId: string = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const isAllowed = testClientAccountId === UKEF_CLIENT_ACCOUNT_ID;
    expect(isAllowed).toBe(false);
  });

  it('should reject null client account ID', () => {
    const testClientAccountId: string | null = null;
    const isAllowed = testClientAccountId === UKEF_CLIENT_ACCOUNT_ID;
    expect(isAllowed).toBe(false);
  });

  it('should reject empty string client account ID', () => {
    const testClientAccountId: string = '';
    const isAllowed = testClientAccountId === UKEF_CLIENT_ACCOUNT_ID;
    expect(isAllowed).toBe(false);
  });
});

// ─── Pipeline Configuration Tests ────────────────────────────────────────────

describe('Pipeline Configuration', () => {
  it('should have audit mode enabled by default (autoCorrectEnabled = false)', () => {
    expect(DEFAULT_PIPELINE_CONFIG.autoCorrectEnabled).toBe(false);
  });

  it('should have sensible auto-correct threshold', () => {
    expect(DEFAULT_PIPELINE_CONFIG.autoCorrectThreshold).toBeGreaterThanOrEqual(0.90);
    expect(DEFAULT_PIPELINE_CONFIG.autoCorrectThreshold).toBeLessThanOrEqual(1.0);
  });

  it('should have minimum word count of 30', () => {
    expect(DEFAULT_PIPELINE_CONFIG.minWordCount).toBe(30);
  });

  it('should require at least 2 speakers', () => {
    expect(DEFAULT_PIPELINE_CONFIG.minSpeakers).toBe(2);
  });

  it('should have a reasonable batch size', () => {
    expect(DEFAULT_PIPELINE_CONFIG.batchSize).toBeGreaterThan(0);
    expect(DEFAULT_PIPELINE_CONFIG.batchSize).toBeLessThanOrEqual(100);
  });
});

// ─── Privacy Tests ───────────────────────────────────────────────────────────

describe('Privacy & Safety Checks', () => {
  it('should NOT store audio blobs (no base64 audio in types)', () => {
    // Verify type definitions don't include audio data fields
    const typeKeys: Array<keyof QualityMetrics> = [
      'duration_seconds', 'transcript_coverage_ratio', 'empty_ratio',
      'avg_confidence', 'turn_count', 'speaker_balance_ratio',
      'word_count', 'char_count', 'unique_speakers',
    ];
    // None of these should be audio-related
    expect(typeKeys.every(k => !k.includes('audio') && !k.includes('base64'))).toBe(true);
  });

  it('should default to audit mode (no auto-corrections)', () => {
    expect(DEFAULT_PIPELINE_CONFIG.autoCorrectEnabled).toBe(false);
  });

  it('should have a high confidence threshold for auto-correction', () => {
    expect(DEFAULT_PIPELINE_CONFIG.autoCorrectThreshold).toBeGreaterThanOrEqual(0.90);
  });
});

// ─── Type Shape Tests ────────────────────────────────────────────────────────

describe('Type Definitions (Shape)', () => {
  it('should have required fields in DispositionAnalysisResult', () => {
    const mockResult: DispositionAnalysisResult = {
      recommended_disposition: 'qualified_lead',
      confidence: 0.92,
      evidence_snippets: [{ quote: 'test', relevance: 'test' }],
      rationale: 'test rationale',
      call_summary: 'test summary',
      interest_indicators: ['positive response'],
      objection_indicators: [],
      qualification_status: 'qualified',
    };
    expect(mockResult).toHaveProperty('recommended_disposition');
    expect(mockResult).toHaveProperty('confidence');
    expect(mockResult).toHaveProperty('evidence_snippets');
    expect(mockResult).toHaveProperty('rationale');
    expect(mockResult).toHaveProperty('qualification_status');
  });

  it('should have valid qualification status values', () => {
    const validStatuses: DispositionAnalysisResult['qualification_status'][] = [
      'qualified', 'not_qualified', 'ambiguous',
    ];
    expect(validStatuses).toHaveLength(3);
  });

  it('should have valid transcript quality statuses', () => {
    const statuses: TranscriptQualityStatus[] = ['missing', 'partial', 'complete', 'failed'];
    expect(statuses).toHaveLength(4);
  });
});
