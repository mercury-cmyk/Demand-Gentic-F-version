import { describe, it, expect } from 'vitest';
import { UKEF_CLIENT_ACCOUNT_ID } from '../../integrations/ukef_reports/types';
import {
  isUkefCampaignName,
  shouldApplyLightcastUkef2026Cutoff,
} from '../client-portal';

describe('client portal UKEF cutoff helpers', () => {
  it('matches UKEF campaign variants including underscore formats', () => {
    expect(isUkefCampaignName('UKEF_012026')).toBe(true);
    expect(isUkefCampaignName('UK Export Finance - January')).toBe(true);
    expect(isUkefCampaignName('Some Other Campaign')).toBe(false);
  });

  it('applies cutoff only for Lightcast/UKEF and excludes Proton', () => {
    expect(shouldApplyLightcastUkef2026Cutoff(UKEF_CLIENT_ACCOUNT_ID, 'UKEF_012026')).toBe(true);
    expect(shouldApplyLightcastUkef2026Cutoff(UKEF_CLIENT_ACCOUNT_ID, 'Proton Retention')).toBe(false);
    expect(shouldApplyLightcastUkef2026Cutoff('non-ukef-tenant', 'UKEF_012026')).toBe(false);
  });
});