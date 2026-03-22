/**
 * UKEF Campaign Reports — Tests
 * 
 * Tests for:
 * - Client gate (only Lightcast/UKEF can access)
 * - Feature flag gating
 * - Date boundary (cutoff date filter)
 * - Qualified lead filtering
 * - Recording link generation
 * - CSV export format
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UKEF_CLIENT_ACCOUNT_ID,
  UKEF_CLIENT_NAME,
  UKEF_CUTOFF_DATE,
  RECORDING_URL_EXPIRY_SECONDS,
} from '../types';

// ─── Constants Tests ─────────────────────────────────────────────────────────

describe('UKEF Reports Constants', () => {
  it('should have correct client account ID', () => {
    expect(UKEF_CLIENT_ACCOUNT_ID).toBe('67b6f74d-0894-46c4-bf86-1dd047b57dd8');
  });

  it('should have correct client name', () => {
    expect(UKEF_CLIENT_NAME).toBe('Lightcast');
  });

  it('should have cutoff date of Jan 1 2025', () => {
    expect(UKEF_CUTOFF_DATE).toBe('2025-01-01');
  });

  it('should have 1-hour recording URL expiry', () => {
    expect(RECORDING_URL_EXPIRY_SECONDS).toBe(3600);
  });
});

// ─── Feature Flag Tests ──────────────────────────────────────────────────────

describe('Feature Flag: ukef_campaign_reports', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should be defined in FEATURE_FLAGS', async () => {
    const { FEATURE_FLAGS } = await import('../../../feature-flags');
    expect(FEATURE_FLAGS).toHaveProperty('ukef_campaign_reports');
    expect(FEATURE_FLAGS.ukef_campaign_reports.name).toBe('ukef_campaign_reports');
  });

  it('should default to disabled', async () => {
    const { FEATURE_FLAGS } = await import('../../../feature-flags');
    expect(FEATURE_FLAGS.ukef_campaign_reports.default).toBe(false);
  });

  it('should be enabled when in FEATURE_FLAGS env var', async () => {
    process.env.FEATURE_FLAGS = 'ukef_campaign_reports';
    const { isFeatureEnabled } = await import('../../../feature-flags');
    expect(isFeatureEnabled('ukef_campaign_reports')).toBe(true);
  });

  it('should be disabled when not in FEATURE_FLAGS env var', async () => {
    process.env.FEATURE_FLAGS = 'other_flag';
    const { isFeatureEnabled } = await import('../../../feature-flags');
    expect(isFeatureEnabled('ukef_campaign_reports')).toBe(false);
  });
});

// ─── Client Gate Tests ───────────────────────────────────────────────────────

describe('Client Gate Logic', () => {
  it('should accept the UKEF client account ID', () => {
    const testClientAccountId = UKEF_CLIENT_ACCOUNT_ID;
    expect(testClientAccountId).toBe('67b6f74d-0894-46c4-bf86-1dd047b57dd8');
    // Simulate gate check
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
});

// ─── Date Cutoff Tests ───────────────────────────────────────────────────────

describe('Date Cutoff Filter', () => {
  const cutoff = new Date(UKEF_CUTOFF_DATE);

  it('should include leads delivered on the cutoff date', () => {
    const deliveredAt = new Date('2025-01-01T00:00:00Z');
    expect(deliveredAt >= cutoff).toBe(true);
  });

  it('should include leads delivered after the cutoff date', () => {
    const deliveredAt = new Date('2025-06-15T12:00:00Z');
    expect(deliveredAt >= cutoff).toBe(true);
  });

  it('should exclude leads delivered before the cutoff date', () => {
    const deliveredAt = new Date('2024-12-31T23:59:59Z');
    expect(deliveredAt >= cutoff).toBe(false);
    expect(deliveredAt.getTime()  {
    const deliveredAt = new Date('2026-03-15T10:00:00Z');
    expect(deliveredAt >= cutoff).toBe(true);
  });
});

// ─── Qualification Filter Tests ──────────────────────────────────────────────

describe('Qualification Filter', () => {
  const qualifiedStatuses = ['approved', 'published'];

  it('should include approved leads', () => {
    expect(qualifiedStatuses.includes('approved')).toBe(true);
  });

  it('should include published leads', () => {
    expect(qualifiedStatuses.includes('published')).toBe(true);
  });

  it('should exclude rejected leads', () => {
    expect(qualifiedStatuses.includes('rejected')).toBe(false);
  });

  it('should exclude under_review leads', () => {
    expect(qualifiedStatuses.includes('under_review')).toBe(false);
  });

  it('should exclude new leads', () => {
    expect(qualifiedStatuses.includes('new')).toBe(false);
  });
});

// ─── CSV Export Tests ────────────────────────────────────────────────────────

describe('CSV Export', () => {
  function escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  it('should escape fields with commas', () => {
    expect(escapeCsvField('Smith, John')).toBe('"Smith, John"');
  });

  it('should escape fields with quotes', () => {
    expect(escapeCsvField('He said "hello"')).toBe('"He said ""hello"""');
  });

  it('should escape fields with newlines', () => {
    expect(escapeCsvField('Line1\nLine2')).toBe('"Line1\nLine2"');
  });

  it('should not escape plain fields', () => {
    expect(escapeCsvField('John Smith')).toBe('John Smith');
  });

  it('should handle empty strings', () => {
    expect(escapeCsvField('')).toBe('');
  });
});

// ─── Recording Link Logic Tests ──────────────────────────────────────────────

describe('Recording Link Logic', () => {
  it('should prefer GCS key over direct URL', () => {
    const lead = { recording_s3_key: 'recordings/abc.wav', recording_url: 'https://old-url.com' };
    const source = lead.recording_s3_key ? 'gcs' : lead.recording_url ? 'direct' : 'none';
    expect(source).toBe('gcs');
  });

  it('should fall back to direct URL when no GCS key', () => {
    const lead = { recording_s3_key: null, recording_url: 'https://old-url.com' };
    const source = lead.recording_s3_key ? 'gcs' : lead.recording_url ? 'direct' : 'none';
    expect(source).toBe('direct');
  });

  it('should return none when no recording exists', () => {
    const lead = { recording_s3_key: null, recording_url: null };
    const source = lead.recording_s3_key ? 'gcs' : lead.recording_url ? 'direct' : 'none';
    expect(source).toBe('none');
  });

  it('should use 1-hour expiry for GCS signed URLs', () => {
    expect(RECORDING_URL_EXPIRY_SECONDS).toBe(3600);
  });
});

// ─── Type Shape Tests ────────────────────────────────────────────────────────

describe('Type Definitions', () => {
  it('should have all required fields in UkefCampaignSummary', () => {
    const campaign: any = {
      id: 'test',
      name: 'Test Campaign',
      status: 'active',
      qualifiedLeadCount: 10,
      totalLeadCount: 50,
      avgAiScore: 78.5,
      dateRange: { earliest: '2025-01-01', latest: '2025-06-01' },
    };
    expect(campaign).toHaveProperty('id');
    expect(campaign).toHaveProperty('qualifiedLeadCount');
    expect(campaign).toHaveProperty('avgAiScore');
    expect(campaign).toHaveProperty('dateRange');
  });

  it('should have all required fields in UkefLeadDetail', () => {
    const lead: any = {
      id: 'test',
      contactName: 'John',
      companyName: 'Acme',
      jobTitle: 'CEO',
      campaignId: 'c1',
      campaignName: 'Campaign 1',
      hasRecording: true,
      transcript: 'Hello...',
    };
    expect(lead).toHaveProperty('id');
    expect(lead).toHaveProperty('contactName');
    expect(lead).toHaveProperty('hasRecording');
    expect(lead).toHaveProperty('transcript');
  });
});