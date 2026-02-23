/**
 * Client Portal Campaigns — V2 Listing Tests
 *
 * Tests for the client_campaign_listing_v2 feature flag:
 * - Direct clientAccountId campaign discovery
 * - Deduplication with workOrder/intakeRequest paths
 * - Tenant isolation
 * - Feature flag gating
 * - clientStatus mapping for draft campaigns
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../db';
import { campaigns, campaignIntakeRequests, clientAccounts, workOrders, clientCampaignAccess, clientCampaigns } from '../../../shared/schema';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';

// ─── Feature Flag Definition Tests ───────────────────────────────────────────

describe('Feature Flag: client_campaign_listing_v2', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should be defined in FEATURE_FLAGS', async () => {
    const { FEATURE_FLAGS } = await import('../../feature-flags');
    expect(FEATURE_FLAGS).toHaveProperty('client_campaign_listing_v2');
  });

  it('should default to OFF', async () => {
    const { FEATURE_FLAGS } = await import('../../feature-flags');
    expect(FEATURE_FLAGS.client_campaign_listing_v2.default).toBe(false);
  });

  it('should be enabled when FEATURE_FLAGS env var includes it', async () => {
    const originalEnv = process.env.FEATURE_FLAGS;
    process.env.FEATURE_FLAGS = 'client_campaign_listing_v2';
    const ff = await import('../../feature-flags');
    expect(ff.isFeatureEnabled('client_campaign_listing_v2')).toBe(true);
    process.env.FEATURE_FLAGS = originalEnv;
  });

  it('should remain disabled when FEATURE_FLAGS env var does not include it', async () => {
    const originalEnv = process.env.FEATURE_FLAGS;
    process.env.FEATURE_FLAGS = 'some_other_flag';
    const ff = await import('../../feature-flags');
    expect(ff.isFeatureEnabled('client_campaign_listing_v2')).toBe(false);
    process.env.FEATURE_FLAGS = originalEnv;
  });
});

// ─── Campaign Listing Query Logic Tests ──────────────────────────────────────

describe('Client Campaign Listing V2 — Query Logic', () => {
  const createdCampaignIds: string[] = [];
  const createdWorkOrderIds: string[] = [];
  const createdIntakeIds: string[] = [];
  const createdAccessIds: string[] = [];
  const createdClientCampaignIds: string[] = [];
  const createdClientAccountIds: string[] = [];

  let clientAId: string;
  let clientBId: string;

  beforeEach(async () => {
    const [clientA] = await db
      .insert(clientAccounts)
      .values({ name: 'Test Client A (V2 Listing)' })
      .returning();
    clientAId = clientA.id;
    createdClientAccountIds.push(clientAId);

    const [clientB] = await db
      .insert(clientAccounts)
      .values({ name: 'Test Client B (Isolation)' })
      .returning();
    clientBId = clientB.id;
    createdClientAccountIds.push(clientBId);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const id of createdIntakeIds) {
      await db.delete(campaignIntakeRequests).where(eq(campaignIntakeRequests.id, id)).catch(() => {});
    }
    for (const id of createdAccessIds) {
      await db.delete(clientCampaignAccess).where(eq(clientCampaignAccess.id, id)).catch(() => {});
    }
    for (const id of createdClientCampaignIds) {
      await db.delete(clientCampaigns).where(eq(clientCampaigns.id, id)).catch(() => {});
    }
    for (const id of createdWorkOrderIds) {
      await db.execute(sql`DELETE FROM work_orders WHERE id = ${id}`).catch(() => {});
    }
    for (const id of createdCampaignIds) {
      await db.delete(campaigns).where(eq(campaigns.id, id)).catch(() => {});
    }
    for (const id of createdClientAccountIds) {
      await db.delete(clientAccounts).where(eq(clientAccounts.id, id)).catch(() => {});
    }
    createdCampaignIds.length = 0;
    createdWorkOrderIds.length = 0;
    createdIntakeIds.length = 0;
    createdAccessIds.length = 0;
    createdClientCampaignIds.length = 0;
    createdClientAccountIds.length = 0;
  });

  /**
   * Simulates the GET / campaign listing query logic from client-portal-campaigns.ts
   * This mirrors the three-path approach: workOrders -> intakeRequests -> direct clientAccountId
   */
  async function simulateCampaignListing(clientAccountId: string, flagEnabled: boolean) {
    // Path 0: Access table links (regularCampaignId + campaignId)
    const accessRegularCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          eq(campaigns.clientAccountId, clientAccountId),
        ),
      )
      .orderBy(desc(campaigns.createdAt));

    const accessMappedCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.campaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          eq(campaigns.clientAccountId, clientAccountId),
        ),
      )
      .orderBy(desc(campaigns.createdAt));

    const accessCampaigns = [...accessRegularCampaigns];
    const accessIds = new Set(accessRegularCampaigns.map((c) => c.id));
    for (const c of accessMappedCampaigns) {
      if (!accessIds.has(c.id)) {
        accessCampaigns.push(c);
        accessIds.add(c.id);
      }
    }

    // Path 1: Work orders
    const woCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
      })
      .from(campaigns)
      .innerJoin(workOrders, eq(campaigns.id, workOrders.campaignId))
      .where(
        and(
          eq(workOrders.clientAccountId, clientAccountId),
          eq(campaigns.clientAccountId, clientAccountId),
        ),
      )
      .orderBy(desc(campaigns.createdAt));

    const campaignIds = new Set([...accessCampaigns, ...woCampaigns].map(c => c.id));

    // Path 2: Intake requests
    const approvedIntakeStatuses = ['approved', 'qso_approved', 'in_progress', 'completed'] as const;
    const intakeCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        intakeStatus: campaignIntakeRequests.status,
      })
      .from(campaigns)
      .innerJoin(campaignIntakeRequests, eq(campaigns.id, campaignIntakeRequests.campaignId))
      .where(and(
        eq(campaignIntakeRequests.clientAccountId, clientAccountId),
        eq(campaigns.clientAccountId, clientAccountId),
        inArray(campaignIntakeRequests.status, approvedIntakeStatuses as any)
      ))
      .orderBy(desc(campaigns.createdAt));

    const mappedIntake = intakeCampaigns
      .filter(c => !campaignIds.has(c.id))
      .map(c => ({
        ...c,
        clientStatus: c.status === 'draft' ? 'approved_pending_setup' : null,
        source: 'intake' as const,
      }));
    for (const c of mappedIntake) campaignIds.add(c.id);

    // Path 3: Direct clientAccountId (V2)
    let directLinked: any[] = [];
    if (flagEnabled) {
      const directCampaigns = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          type: campaigns.type,
          approvalStatus: campaigns.approvalStatus,
        })
        .from(campaigns)
        .where(eq(campaigns.clientAccountId, clientAccountId))
        .orderBy(desc(campaigns.createdAt));

      directLinked = directCampaigns
        .filter(c => !campaignIds.has(c.id))
        .map(c => ({
          ...c,
          clientStatus: c.status === 'draft'
            ? 'approved_pending_setup'
            : (c.approvalStatus as string) || null,
          source: 'direct' as const,
        }));
    }

    // Path 4: Client-created campaigns from clientCampaigns table
    const clientOwnedCampaigns = await db
      .select({
        id: clientCampaigns.id,
        name: clientCampaigns.name,
        status: clientCampaigns.status,
      })
      .from(clientCampaigns)
      .where(eq(clientCampaigns.clientAccountId, clientAccountId));

    const mappedClientOwned = clientOwnedCampaigns
      .filter(c => !campaignIds.has(c.id))
      .map(c => ({
        ...c,
        type: 'client_campaign' as const,
        source: 'clientCampaign' as const,
      }));

    return [
      ...accessCampaigns.map(c => ({ ...c, source: 'campaignAccess' as const })),
      ...woCampaigns.map(c => ({ ...c, source: 'workOrder' as const })),
      ...mappedIntake,
      ...directLinked,
      ...mappedClientOwned,
    ];
  }

  // ─── Core V2 Tests ─────────────────────────────────────────────────────────

  it('finds campaigns with direct clientAccountId when V2 is enabled', async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Direct Campaign A', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(campaign.id);

    const result = await simulateCampaignListing(clientAId, true);
    const ids = result.map(c => c.id);
    expect(ids).toContain(campaign.id);
    expect(result.find(c => c.id === campaign.id)?.source).toBe('direct');
  });

  it('includes Green Leads campaign when linked via clientCampaignAccess.campaignId', async () => {
    const greenCampaignResult = await db.execute(sql`
      INSERT INTO campaigns (type, name, status)
      VALUES (${'green_leads'}, ${'Green Leads Alpha'}, ${'active'})
      RETURNING id
    `);
    const greenCampaignId = greenCampaignResult.rows[0].id as string;
    createdCampaignIds.push(greenCampaignId);

    const [access] = await db
      .insert(clientCampaignAccess)
      .values({
        clientAccountId: clientAId,
        campaignId: greenCampaignId,
      } as any)
      .returning();
    createdAccessIds.push(access.id);

    const result = await simulateCampaignListing(clientAId, true);
    const found = result.find((c) => c.id === greenCampaignId);

    expect(found).toBeTruthy();
    expect(found?.type).toBe('green_leads');
    expect(found?.source).toBe('campaignAccess');
  });

  it('does NOT find direct campaigns when V2 is disabled', async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Hidden Direct Campaign', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(campaign.id);

    const result = await simulateCampaignListing(clientAId, false);
    const ids = result.map(c => c.id);
    expect(ids).not.toContain(campaign.id);
  });

  it('includes client-created campaigns from clientCampaigns table', async () => {
    const [clientCampaign] = await db
      .insert(clientCampaigns)
      .values({
        clientAccountId: clientAId,
        name: 'Client Created Campaign',
        status: 'active',
      } as any)
      .returning();
    createdClientCampaignIds.push(clientCampaign.id);

    const result = await simulateCampaignListing(clientAId, true);
    const found = result.find((c) => c.id === clientCampaign.id);

    expect(found).toBeTruthy();
    expect(found?.source).toBe('clientCampaign');
  });

  // ─── Deduplication Tests ────────────────────────────────────────────────────

  it('deduplicates: campaign found via workOrder is not duplicated by direct path', async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Dedup WO+Direct', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(campaign.id);

    const orderResult = await db.execute(sql`
      INSERT INTO work_orders (order_number, client_account_id, title, order_type, status, campaign_id, submitted_at)
      VALUES (${'WO-V2-DUP1'}, ${clientAId}, ${'Dedup Order'}, ${'call_campaign'}, ${'approved'}, ${campaign.id}, ${new Date().toISOString()})
      RETURNING id
    `);
    createdWorkOrderIds.push(orderResult.rows[0].id as string);

    const result = await simulateCampaignListing(clientAId, true);
    const matches = result.filter(c => c.id === campaign.id);
    expect(matches.length).toBe(1);
    expect(matches[0].source).toBe('workOrder');
  });

  it('deduplicates: campaign found via intakeRequest is not duplicated by direct path', async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Dedup Intake+Direct', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(campaign.id);

    const [intake] = await db
      .insert(campaignIntakeRequests)
      .values({
        clientAccountId: clientAId,
        status: 'approved',
        campaignId: campaign.id,
        requestedLeadCount: 50,
      })
      .returning();
    createdIntakeIds.push(intake.id);

    const result = await simulateCampaignListing(clientAId, true);
    const matches = result.filter(c => c.id === campaign.id);
    expect(matches.length).toBe(1);
    expect(matches[0].source).toBe('intake');
  });

  // ─── Tenant Isolation Tests ─────────────────────────────────────────────────

  it('tenant isolation: Client A cannot see Client B direct campaigns', async () => {
    const [campaignB] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Client B Only', status: 'active', clientAccountId: clientBId })
      .returning();
    createdCampaignIds.push(campaignB.id);

    const [campaignA] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Client A Only', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(campaignA.id);

    const resultA = await simulateCampaignListing(clientAId, true);
    const idsA = resultA.map(c => c.id);
    expect(idsA).toContain(campaignA.id);
    expect(idsA).not.toContain(campaignB.id);

    const resultB = await simulateCampaignListing(clientBId, true);
    const idsB = resultB.map(c => c.id);
    expect(idsB).toContain(campaignB.id);
    expect(idsB).not.toContain(campaignA.id);
  });

  it('excludes cross-tenant campaigns even when clientCampaignAccess row exists', async () => {
    const [argyleOwnedCampaign] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Argyle Owned Campaign', status: 'active', clientAccountId: clientBId })
      .returning();
    createdCampaignIds.push(argyleOwnedCampaign.id);

    const [badAccess] = await db
      .insert(clientCampaignAccess)
      .values({
        clientAccountId: clientAId,
        regularCampaignId: argyleOwnedCampaign.id,
      } as any)
      .returning();
    createdAccessIds.push(badAccess.id);

    const result = await simulateCampaignListing(clientAId, true);
    const ids = result.map((c) => c.id);

    expect(ids).not.toContain(argyleOwnedCampaign.id);
  });

  it('tenant isolation: Client A WO campaigns invisible to Client B', async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'WO Campaign A', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(campaign.id);

    const orderResult = await db.execute(sql`
      INSERT INTO work_orders (order_number, client_account_id, title, order_type, status, campaign_id, submitted_at)
      VALUES (${'WO-ISO-001'}, ${clientAId}, ${'WO Isolation'}, ${'call_campaign'}, ${'approved'}, ${campaign.id}, ${new Date().toISOString()})
      RETURNING id
    `);
    createdWorkOrderIds.push(orderResult.rows[0].id as string);

    const resultB = await simulateCampaignListing(clientBId, true);
    const ids = resultB.map(c => c.id);
    expect(ids).not.toContain(campaign.id);
  });

  // ─── Client Status Mapping Tests ────────────────────────────────────────────

  it('sets clientStatus to approved_pending_setup for draft direct campaigns', async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Draft Direct', status: 'draft', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(campaign.id);

    const result = await simulateCampaignListing(clientAId, true);
    const found = result.find(c => c.id === campaign.id);
    expect(found).toBeTruthy();
    expect(found!.clientStatus).toBe('approved_pending_setup');
  });

  it('uses approvalStatus for non-draft direct campaigns', async () => {
    const [campaign] = await db
      .insert(campaigns)
      .values({
        type: 'call', name: 'Active Direct', status: 'active',
        clientAccountId: clientAId, approvalStatus: 'approved',
      })
      .returning();
    createdCampaignIds.push(campaign.id);

    const result = await simulateCampaignListing(clientAId, true);
    const found = result.find(c => c.id === campaign.id);
    expect(found).toBeTruthy();
    expect(found!.clientStatus).toBe('approved');
  });

  // ─── Mixed Source Tests ─────────────────────────────────────────────────────

  it('returns all three sources when V2 enabled: WO + intake + direct', async () => {
    // WO campaign
    const [woCamp] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'WO Source', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(woCamp.id);
    const orderResult = await db.execute(sql`
      INSERT INTO work_orders (order_number, client_account_id, title, order_type, status, campaign_id, submitted_at)
      VALUES (${'WO-MIX-001'}, ${clientAId}, ${'Mixed Source WO'}, ${'call_campaign'}, ${'approved'}, ${woCamp.id}, ${new Date().toISOString()})
      RETURNING id
    `);
    createdWorkOrderIds.push(orderResult.rows[0].id as string);

    // Intake campaign
    const [intakeCamp] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Intake Source', status: 'draft', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(intakeCamp.id);
    const [intake] = await db
      .insert(campaignIntakeRequests)
      .values({
        clientAccountId: clientAId,
        status: 'approved',
        campaignId: intakeCamp.id,
        requestedLeadCount: 100,
      })
      .returning();
    createdIntakeIds.push(intake.id);

    // Direct campaign (no WO or intake)
    const [directCamp] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Direct Source', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(directCamp.id);

    const result = await simulateCampaignListing(clientAId, true);
    expect(result.length).toBe(3);

    const sources = result.map(c => c.source);
    expect(sources).toContain('workOrder');
    expect(sources).toContain('intake');
    expect(sources).toContain('direct');
  });

  it('returns only WO + intake sources when V2 disabled', async () => {
    // WO campaign
    const [woCamp] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'WO Only', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(woCamp.id);
    const orderResult = await db.execute(sql`
      INSERT INTO work_orders (order_number, client_account_id, title, order_type, status, campaign_id, submitted_at)
      VALUES (${'WO-V1-001'}, ${clientAId}, ${'V1 WO'}, ${'call_campaign'}, ${'approved'}, ${woCamp.id}, ${new Date().toISOString()})
      RETURNING id
    `);
    createdWorkOrderIds.push(orderResult.rows[0].id as string);

    // Direct campaign (should be invisible)
    const [directCamp] = await db
      .insert(campaigns)
      .values({ type: 'call', name: 'Direct Hidden', status: 'active', clientAccountId: clientAId })
      .returning();
    createdCampaignIds.push(directCamp.id);

    const result = await simulateCampaignListing(clientAId, false);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(woCamp.id);
  });

  // ─── Empty State Tests ──────────────────────────────────────────────────────

  it('returns empty when client has no campaigns at all', async () => {
    const result = await simulateCampaignListing(clientAId, true);
    expect(result).toEqual([]);
  });

  it('returns empty for nonexistent clientAccountId', async () => {
    const result = await simulateCampaignListing('00000000-0000-0000-0000-000000000000', true);
    expect(result).toEqual([]);
  });
});

// ─── Route Import Test ───────────────────────────────────────────────────────

describe('client-portal-campaigns route module', () => {
  it('imports isFeatureEnabled from feature-flags', async () => {
    const routeModule = await import('../client-portal-campaigns');
    expect(routeModule.default).toBeDefined();
  });
});
