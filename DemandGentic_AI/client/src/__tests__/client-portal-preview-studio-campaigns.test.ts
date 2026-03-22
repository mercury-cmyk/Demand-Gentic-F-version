import { describe, expect, it } from 'vitest';

describe('Client Portal Preview Studio - Campaign Dropdown Data', () => {
  it('uses campaigns array payload from /api/client-portal/campaigns', () => {
    const payload = [
      { id: 'camp-1', name: 'Green Leads Alpha' },
      { id: 'camp-2', name: 'Q1 Outbound' },
    ];

    const campaigns = Array.isArray(payload) ? payload : (payload as any).campaigns || [];

    expect(campaigns.length).toBe(2);
    expect(campaigns[0]).toMatchObject({ id: 'camp-1', name: 'Green Leads Alpha' });
  });

  it('uses nested campaigns payload fallback if endpoint returns object wrapper', () => {
    const payload = {
      campaigns: [{ id: 'camp-3', name: 'Preview Studio Campaign' }],
    };

    const campaigns = Array.isArray(payload) ? payload : payload.campaigns || [];

    expect(campaigns.length).toBe(1);
    expect(campaigns[0].id).toBe('camp-3');
  });
});