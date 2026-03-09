import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({
  db: {},
}));

vi.mock('@shared/schema', () => ({
  callSessions: {},
  campaignTestCalls: {},
  dialerCallAttempts: {},
  leads: {},
}));

import {
  buildCampaignTestCallUpdate,
  extractCampaignTestCallId,
} from '../sip/sip-post-call-handler';

describe('sip-post-call-handler helpers', () => {
  it('extracts campaign test call ids from SIP attempt ids', () => {
    expect(extractCampaignTestCallId('test-attempt-test-call-123')).toBe('test-call-123');
    expect(extractCampaignTestCallId('attempt-123')).toBeNull();
    expect(extractCampaignTestCallId('')).toBeNull();
    expect(extractCampaignTestCallId(null)).toBeNull();
  });

  it('builds the campaign test call payload expected by the quick-action UI', () => {
    const update = buildCampaignTestCallUpdate({
      callSessionId: 'session-123',
      disposition: 'not_interested',
      callDurationSeconds: 84,
      plainTranscript: 'Agent: Hello\nContact: No thanks',
      turnTranscript: [
        { speaker: 'agent', text: 'Hello', timestamp: 1_710_000_000_000 },
        { speaker: 'contact', text: 'No thanks' },
        { speaker: 'agent', text: '   ' },
      ],
      qualityAnalysis: {
        summary: 'Prospect declined after the opening.',
        issues: [
          {
            type: 'Performance Gap',
            severity: 'medium',
            description: 'The opener did not establish relevance quickly enough.',
            recommendation: 'Tighten the first 10 seconds around value.',
          },
        ],
        promptUpdates: [
          {
            category: 'opening',
            change: 'Lead with the specific campaign value proposition.',
            rationale: 'This should reduce early dismissals.',
            priority: 'high',
          },
        ],
      },
    });

    expect(update).toMatchObject({
      callSessionId: 'session-123',
      status: 'completed',
      durationSeconds: 84,
      disposition: 'not_interested',
      fullTranscript: 'Agent: Hello\nContact: No thanks',
      callSummary: 'Prospect declined after the opening.',
      detectedIssues: [
        {
          type: 'Performance Gap',
          severity: 'medium',
          description: 'The opener did not establish relevance quickly enough.',
          suggestion: 'Tighten the first 10 seconds around value.',
        },
      ],
      promptImprovementSuggestions: [
        {
          category: 'opening',
          currentBehavior: '',
          suggestedChange: 'Lead with the specific campaign value proposition.',
          expectedImprovement: 'This should reduce early dismissals.',
          priority: 'high',
        },
      ],
      transcriptTurns: [
        {
          role: 'agent',
          text: 'Hello',
          timestamp: new Date(1_710_000_000_000).toISOString(),
        },
        {
          role: 'contact',
          text: 'No thanks',
        },
      ],
    });

    expect(update.endedAt).toBeInstanceOf(Date);
    expect(update.updatedAt).toBeInstanceOf(Date);
  });
});
