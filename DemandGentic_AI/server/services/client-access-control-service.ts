/**
 * Client Access Control Service
 * 
 * Manages client-scoped capability grants with:
 * - Per-feature permission checking (default-deny)
 * - Campaign/project-scoped grants with optional expiry
 * - Full audit trail of every grant/revoke/modify action
 * - Bulk preset application
 */

import { db } from '../db';
import {
  clientPermissionGrants,
  clientAccessAuditLog,
  clientFeatureAccess,
  clientAccounts,
  clientCampaignAccess,
  campaigns,
  verificationCampaigns,
  users,
} from '@shared/schema';
import { eq, and, desc, sql, inArray, isNull, or, count, gt } from 'drizzle-orm';

// ==================== Types ====================

export type ClientFeatureFlag =
  | 'accounts_contacts' | 'bulk_upload' | 'pipeline_view' | 'segments_lists' | 'lead_forms'
  | 'campaign_creation' | 'campaign_reports' | 'campaign_queue_view' | 'campaign_email_builder'
  | 'campaign_test_mode' | 'campaign_planner'
  | 'qualified_leads_view' | 'all_leads_view' | 'lead_export' | 'ai_scores_view'
  | 'call_recordings_playback' | 'call_recordings_download' | 'transcripts_view'
  | 'ai_studio_dashboard' | 'ai_studio_org_intelligence' | 'ai_studio_account_intelligence'
  | 'ai_studio_preview_studio' | 'ai_studio_voice_training' | 'ai_studio_campaign_manager'
  | 'creative_studio'
  | 'disposition_overview' | 'disposition_conversation_quality' | 'disposition_showcase_calls'
  | 'disposition_reanalysis' | 'disposition_potential_leads'
  | 'analytics_dashboard' | 'engagement_analytics' | 'call_reports' | 'reports_export'
  | 'billing_invoices' | 'billing_cost_tracking'
  | 'voice_simulation' | 'email_simulation' | 'simulations_unified'
  | 'email_templates' | 'call_flows' | 'voice_selection'
  | 'email_connect' | 'email_inbox'
  | 'work_orders' | 'calendar_booking' | 'api_access' | 'webhook_notifications'
  | 'journey_pipeline' | 'organization_intelligence';

export type ClientPermissionScope = 'all' | 'campaign' | 'project' | 'date_range';

export interface GrantFeatureInput {
  clientAccountId: string;
  feature: ClientFeatureFlag;
  scopeType?: ClientPermissionScope;
  scopeValue?: { campaignIds?: string[]; projectIds?: string[]; dateRange?: { from: string; to: string } };
  config?: Record;
  expiresAt?: Date;
  notes?: string;
  grantedBy: string;
}

export interface RevokeFeatureInput {
  grantId: string;
  revokedBy: string;
  reason?: string;
}

/** Category groupings for the admin UI */
export const FEATURE_CATEGORIES: Record = {
  crm_pipeline: {
    label: 'CRM & Pipeline',
    features: ['accounts_contacts', 'bulk_upload', 'pipeline_view', 'segments_lists', 'lead_forms'],
  },
  campaigns: {
    label: 'Campaigns & Execution',
    features: ['campaign_creation', 'campaign_reports', 'campaign_queue_view', 'campaign_email_builder', 'campaign_test_mode', 'campaign_planner'],
  },
  leads_data: {
    label: 'Leads & Data Access',
    features: ['qualified_leads_view', 'all_leads_view', 'lead_export', 'ai_scores_view'],
  },
  recordings: {
    label: 'Recordings & Transcripts',
    features: ['call_recordings_playback', 'call_recordings_download', 'transcripts_view'],
  },
  ai_intelligence: {
    label: 'AI & Intelligence',
    features: ['ai_studio_dashboard', 'ai_studio_org_intelligence', 'ai_studio_account_intelligence', 'ai_studio_preview_studio', 'ai_studio_voice_training', 'ai_studio_campaign_manager', 'creative_studio'],
  },
  disposition: {
    label: 'Disposition Intelligence',
    features: ['disposition_overview', 'disposition_conversation_quality', 'disposition_showcase_calls', 'disposition_reanalysis', 'disposition_potential_leads'],
  },
  analytics: {
    label: 'Analytics & Reports',
    features: ['analytics_dashboard', 'engagement_analytics', 'call_reports', 'reports_export'],
  },
  billing: {
    label: 'Billing & Finance',
    features: ['billing_invoices', 'billing_cost_tracking'],
  },
  simulations: {
    label: 'Simulations',
    features: ['voice_simulation', 'email_simulation', 'simulations_unified'],
  },
  email_access: {
    label: 'Email Access',
    features: ['email_connect', 'email_inbox'],
  },
  communication: {
    label: 'Communication & Templates',
    features: ['email_templates', 'call_flows', 'voice_selection'],
  },
  advanced: {
    label: 'Advanced & Integration',
    features: ['work_orders', 'calendar_booking', 'api_access', 'webhook_notifications', 'journey_pipeline', 'organization_intelligence'],
  },
};

/** All feature flags */
export const ALL_FEATURES: ClientFeatureFlag[] = Object.values(FEATURE_CATEGORIES).flatMap(c => c.features);

/** Preset templates for quick apply (admin-editable at runtime) */
export let PRESETS: Record = {
  basic_viewer: {
    label: 'Basic Viewer',
    description: 'Lead reports, campaign reports, billing invoices',
    features: ['qualified_leads_view', 'campaign_reports', 'billing_invoices', 'call_reports'],
  },
  standard_client: {
    label: 'Standard Client',
    description: 'Viewer + recordings, transcripts, analytics, disposition overview',
    features: [
      'qualified_leads_view', 'campaign_reports', 'billing_invoices', 'call_reports',
      'call_recordings_playback', 'transcripts_view', 'analytics_dashboard',
      'engagement_analytics', 'disposition_overview', 'disposition_showcase_calls',
    ],
  },
  active_client: {
    label: 'Active Client',
    description: 'Standard + work orders, campaign creation, CRM, pipeline, simulations',
    features: [
      'qualified_leads_view', 'campaign_reports', 'billing_invoices', 'call_reports',
      'call_recordings_playback', 'transcripts_view', 'analytics_dashboard',
      'engagement_analytics', 'disposition_overview', 'disposition_showcase_calls',
      'work_orders', 'campaign_creation', 'campaign_planner', 'ai_scores_view',
      'accounts_contacts', 'pipeline_view', 'voice_simulation', 'email_simulation',
    ],
  },
  power_client: {
    label: 'Power Client',
    description: 'Active + creative studio, preview studio, exports, email builder, deep disposition',
    features: [
      'qualified_leads_view', 'campaign_reports', 'billing_invoices', 'call_reports',
      'call_recordings_playback', 'call_recordings_download', 'transcripts_view',
      'analytics_dashboard', 'engagement_analytics', 'disposition_overview',
      'disposition_showcase_calls', 'disposition_conversation_quality', 'disposition_potential_leads',
      'work_orders', 'campaign_creation', 'campaign_planner', 'campaign_email_builder',
      'campaign_test_mode', 'ai_scores_view', 'accounts_contacts', 'pipeline_view',
      'voice_simulation', 'email_simulation', 'creative_studio', 'ai_studio_preview_studio',
      'ai_studio_org_intelligence', 'bulk_upload', 'lead_export', 'reports_export',
    ],
  },
  full_access: {
    label: 'Full Access',
    description: 'All platform capabilities enabled',
    features: ALL_FEATURES,
  },
};

/**
 * Update a preset's features, label, or description.
 * Used by admin UI to customize preset cards.
 */
export function updatePreset(
  key: string,
  updates: { label?: string; description?: string; features?: ClientFeatureFlag[] }
): boolean {
  if (!PRESETS[key]) return false;
  if (key === 'full_access' && updates.features) {
    // full_access always maps to ALL_FEATURES — don't allow feature override
    return false;
  }
  if (updates.label) PRESETS[key].label = updates.label;
  if (updates.description) PRESETS[key].description = updates.description;
  if (updates.features) PRESETS[key].features = updates.features;
  return true;
}

// ==================== Core Permission Checking ====================

/**
 * Check if a client has a specific feature enabled.
 * Default-deny: if no grant exists, access is denied.
 * Also checks for expired grants.
 */
export async function checkClientFeature(
  clientAccountId: string,
  feature: ClientFeatureFlag,
  context?: { campaignId?: string; projectId?: string }
): Promise {
  const [grant] = await db
    .select({
      id: clientPermissionGrants.id,
      isEnabled: clientPermissionGrants.isEnabled,
      scopeType: clientPermissionGrants.scopeType,
      scopeValue: clientPermissionGrants.scopeValue,
      expiresAt: clientPermissionGrants.expiresAt,
      revokedAt: clientPermissionGrants.revokedAt,
    })
    .from(clientPermissionGrants)
    .where(
      and(
        eq(clientPermissionGrants.clientAccountId, clientAccountId),
        eq(clientPermissionGrants.feature, feature),
        eq(clientPermissionGrants.isEnabled, true),
        isNull(clientPermissionGrants.revokedAt),
      )
    )
    .limit(1);

  if (!grant) {
    return { allowed: false, reason: `Feature '${feature}' is not granted for this account` };
  }

  // Check expiry
  if (grant.expiresAt && new Date(grant.expiresAt)  0 && !allowedCampaigns.includes(context.campaignId)) {
      return { allowed: false, reason: `Feature '${feature}' not granted for this campaign` };
    }
  }

  if (grant.scopeType === 'project' && context?.projectId && grant.scopeValue) {
    const allowedProjects = (grant.scopeValue as any)?.projectIds || [];
    if (allowedProjects.length > 0 && !allowedProjects.includes(context.projectId)) {
      return { allowed: false, reason: `Feature '${feature}' not granted for this project` };
    }
  }

  return { allowed: true, reason: 'Granted' };
}

// ==================== Permission Management ====================

/**
 * Get all permission grants for a client account
 */
export async function getClientPermissions(clientAccountId: string) {
  const grants = await db
    .select({
      id: clientPermissionGrants.id,
      feature: clientPermissionGrants.feature,
      scopeType: clientPermissionGrants.scopeType,
      scopeValue: clientPermissionGrants.scopeValue,
      isEnabled: clientPermissionGrants.isEnabled,
      config: clientPermissionGrants.config,
      grantedBy: clientPermissionGrants.grantedBy,
      grantedAt: clientPermissionGrants.grantedAt,
      expiresAt: clientPermissionGrants.expiresAt,
      revokedBy: clientPermissionGrants.revokedBy,
      revokedAt: clientPermissionGrants.revokedAt,
      notes: clientPermissionGrants.notes,
    })
    .from(clientPermissionGrants)
    .where(eq(clientPermissionGrants.clientAccountId, clientAccountId))
    .orderBy(clientPermissionGrants.feature);

  return grants;
}

/**
 * Get a summary of a client's access (counts, preset match, etc.)
 */
export async function getClientAccessSummary(clientAccountId: string) {
  const grants = await getClientPermissions(clientAccountId);
  const activeGrants = grants.filter(g => g.isEnabled && !g.revokedAt);
  const enabledFeatures = activeGrants.map(g => g.feature);

  // Check which preset matches
  let matchedPreset: string | null = null;
  for (const [key, preset] of Object.entries(PRESETS)) {
    const presetSet = new Set(preset.features);
    const enabledSet = new Set(enabledFeatures);
    if (presetSet.size === enabledSet.size && [...presetSet].every(f => enabledSet.has(f))) {
      matchedPreset = key;
      break;
    }
  }

  // Campaign access count
  const [campaignAccessResult] = await db
    .select({ count: count() })
    .from(clientCampaignAccess)
    .where(eq(clientCampaignAccess.clientAccountId, clientAccountId));

  return {
    totalGrants: grants.length,
    activeGrants: activeGrants.length,
    enabledFeatures,
    matchedPreset,
    campaignAccessCount: Number(campaignAccessResult?.count ?? 0),
    hasExpiringGrants: activeGrants.some(g => g.expiresAt && new Date(g.expiresAt)  | null = null;

  if (existing) {
    previousState = { isEnabled: existing.isEnabled };
    const [updated] = await db
      .update(clientPermissionGrants)
      .set({
        isEnabled: true,
        scopeType: scopeType || 'all',
        scopeValue: scopeValue || null,
        config: config || null,
        expiresAt: expiresAt || null,
        grantedBy,
        grantedAt: new Date(),
        revokedBy: null,
        revokedAt: null,
        notes,
      })
      .where(eq(clientPermissionGrants.id, existing.id))
      .returning({ id: clientPermissionGrants.id });
    grantId = updated.id;
  } else {
    const [created] = await db
      .insert(clientPermissionGrants)
      .values({
        clientAccountId,
        feature,
        scopeType: scopeType || 'all',
        scopeValue: scopeValue || null,
        isEnabled: true,
        config: config || null,
        grantedBy,
        expiresAt: expiresAt || null,
        notes,
      })
      .returning({ id: clientPermissionGrants.id });
    grantId = created.id;
  }

  // Audit log
  await db.insert(clientAccessAuditLog).values({
    clientAccountId,
    action: 'grant',
    feature,
    scopeType: scopeType || 'all',
    scopeValue: scopeValue || null,
    previousState,
    newState: { isEnabled: true, scopeType: scopeType || 'all', expiresAt },
    performedBy: grantedBy,
    notes,
  });

  return grantId;
}

/**
 * Revoke a feature grant
 */
export async function revokeFeature(input: RevokeFeatureInput) {
  const { grantId, revokedBy, reason } = input;

  const [existing] = await db
    .select({
      id: clientPermissionGrants.id,
      clientAccountId: clientPermissionGrants.clientAccountId,
      feature: clientPermissionGrants.feature,
      isEnabled: clientPermissionGrants.isEnabled,
      scopeType: clientPermissionGrants.scopeType,
    })
    .from(clientPermissionGrants)
    .where(eq(clientPermissionGrants.id, grantId))
    .limit(1);

  if (!existing) {
    throw new Error('Grant not found');
  }

  await db
    .update(clientPermissionGrants)
    .set({
      isEnabled: false,
      revokedBy,
      revokedAt: new Date(),
    })
    .where(eq(clientPermissionGrants.id, grantId));

  // Audit log
  await db.insert(clientAccessAuditLog).values({
    clientAccountId: existing.clientAccountId,
    action: 'revoke',
    feature: existing.feature,
    scopeType: existing.scopeType,
    previousState: { isEnabled: existing.isEnabled },
    newState: { isEnabled: false },
    performedBy: revokedBy,
    notes: reason,
  });
}

/**
 * Modify an existing grant (scope, expiry, config)
 */
export async function modifyGrant(
  grantId: string,
  updates: { scopeType?: ClientPermissionScope; scopeValue?: any; config?: any; expiresAt?: Date | null; notes?: string },
  modifiedBy: string
) {
  const [existing] = await db
    .select()
    .from(clientPermissionGrants)
    .where(eq(clientPermissionGrants.id, grantId))
    .limit(1);

  if (!existing) {
    throw new Error('Grant not found');
  }

  const previousState = {
    scopeType: existing.scopeType,
    scopeValue: existing.scopeValue,
    config: existing.config,
    expiresAt: existing.expiresAt,
  };

  const [updated] = await db
    .update(clientPermissionGrants)
    .set({
      ...updates,
      notes: updates.notes ?? existing.notes,
    })
    .where(eq(clientPermissionGrants.id, grantId))
    .returning({ id: clientPermissionGrants.id });

  // Audit log
  await db.insert(clientAccessAuditLog).values({
    clientAccountId: existing.clientAccountId,
    action: 'modify',
    feature: existing.feature,
    scopeType: updates.scopeType || existing.scopeType,
    previousState,
    newState: updates,
    performedBy: modifiedBy,
    notes: updates.notes,
  });

  return updated.id;
}

/**
 * Bulk grant features (for presets)
 */
export async function bulkGrantFeatures(
  clientAccountId: string,
  features: ClientFeatureFlag[],
  grantedBy: string,
  notes?: string
) {
  const grantIds: string[] = [];

  for (const feature of features) {
    const id = await grantFeature({
      clientAccountId,
      feature,
      grantedBy,
      notes: notes || 'Bulk grant',
    });
    grantIds.push(id);
  }

  // Single bulk audit entry
  await db.insert(clientAccessAuditLog).values({
    clientAccountId,
    action: 'bulk_grant',
    previousState: null,
    newState: { features, count: features.length },
    performedBy: grantedBy,
    notes: notes || `Bulk granted ${features.length} features`,
  });

  return grantIds;
}

/**
 * Bulk revoke all features for a client (reset to zero)
 */
export async function bulkRevokeFeatures(
  clientAccountId: string,
  revokedBy: string,
  reason?: string
) {
  const activeGrants = await db
    .select({ id: clientPermissionGrants.id, feature: clientPermissionGrants.feature })
    .from(clientPermissionGrants)
    .where(
      and(
        eq(clientPermissionGrants.clientAccountId, clientAccountId),
        eq(clientPermissionGrants.isEnabled, true),
        isNull(clientPermissionGrants.revokedAt),
      )
    );

  for (const grant of activeGrants) {
    await revokeFeature({ grantId: grant.id, revokedBy, reason });
  }

  await db.insert(clientAccessAuditLog).values({
    clientAccountId,
    action: 'bulk_revoke',
    previousState: { features: activeGrants.map(g => g.feature), count: activeGrants.length },
    newState: { features: [], count: 0 },
    performedBy: revokedBy,
    notes: reason || `Bulk revoked ${activeGrants.length} features`,
  });

  return activeGrants.length;
}

// ==================== Campaign Access ====================

/**
 * Get campaigns with their access status for a client
 */
export async function getClientCampaignAccess(clientAccountId: string) {
  // Get granted campaign IDs
  const grants = await db
    .select({
      campaignId: clientCampaignAccess.campaignId,
      regularCampaignId: clientCampaignAccess.regularCampaignId,
      grantedBy: clientCampaignAccess.grantedBy,
      createdAt: clientCampaignAccess.createdAt,
    })
    .from(clientCampaignAccess)
    .where(eq(clientCampaignAccess.clientAccountId, clientAccountId));

  return grants;
}

/**
 * Get all campaigns for the campaign selector dropdown
 */
export async function getAllCampaignsForSelector() {
  const [regular, verification] = await Promise.all([
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
      })
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt)),
    db
      .select({
        id: verificationCampaigns.id,
        name: verificationCampaigns.name,
      })
      .from(verificationCampaigns)
      .orderBy(desc(verificationCampaigns.createdAt)),
  ]);

  return {
    regular: regular.map(c => ({ ...c, type: 'regular' as const })),
    verification: verification.map(c => ({ ...c, type: 'verification' as const, status: 'active' })),
  };
}

/**
 * Grant campaign access to a client
 */
export async function grantCampaignAccess(
  clientAccountId: string,
  campaignId: string,
  campaignType: 'regular' | 'verification',
  grantedBy: string
) {
  const col = campaignType === 'verification' ? 'campaignId' : 'regularCampaignId';
  const filterCol = campaignType === 'verification'
    ? clientCampaignAccess.campaignId
    : clientCampaignAccess.regularCampaignId;

  // Check for existing grant
  const existing = await db
    .select({ id: clientCampaignAccess.id })
    .from(clientCampaignAccess)
    .where(
      and(
        eq(clientCampaignAccess.clientAccountId, clientAccountId),
        eq(filterCol, campaignId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error('Campaign access already granted');
  }

  const values: Record = {
    clientAccountId,
    grantedBy,
  };
  if (campaignType === 'verification') {
    values.campaignId = campaignId;
  } else {
    values.regularCampaignId = campaignId;
  }

  const [row] = await db.insert(clientCampaignAccess).values(values).returning();
  return row;
}

/**
 * Revoke campaign access from a client
 */
export async function revokeCampaignAccess(clientAccountId: string, campaignId: string) {
  const deleted = await db
    .delete(clientCampaignAccess)
    .where(
      and(
        eq(clientCampaignAccess.clientAccountId, clientAccountId),
        or(
          eq(clientCampaignAccess.campaignId, campaignId),
          eq(clientCampaignAccess.regularCampaignId, campaignId)
        )
      )
    )
    .returning();

  if (deleted.length === 0) {
    throw new Error('Campaign access grant not found');
  }
  return deleted[0];
}

// ==================== Audit ====================

/**
 * Get audit log for a client with pagination
 */
export async function getAuditLog(
  clientAccountId: string,
  options: { limit?: number; offset?: number; feature?: string; action?: string } = {}
) {
  const { limit = 50, offset = 0, feature, action } = options;

  const conditions = [eq(clientAccessAuditLog.clientAccountId, clientAccountId)];
  if (feature) {
    conditions.push(eq(clientAccessAuditLog.feature, feature as any));
  }
  if (action) {
    conditions.push(eq(clientAccessAuditLog.action, action as any));
  }

  const entries = await db
    .select({
      id: clientAccessAuditLog.id,
      action: clientAccessAuditLog.action,
      feature: clientAccessAuditLog.feature,
      scopeType: clientAccessAuditLog.scopeType,
      scopeValue: clientAccessAuditLog.scopeValue,
      previousState: clientAccessAuditLog.previousState,
      newState: clientAccessAuditLog.newState,
      performedBy: clientAccessAuditLog.performedBy,
      performedAt: clientAccessAuditLog.performedAt,
      notes: clientAccessAuditLog.notes,
    })
    .from(clientAccessAuditLog)
    .where(and(...conditions))
    .orderBy(desc(clientAccessAuditLog.performedAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [countResult] = await db
    .select({ count: count() })
    .from(clientAccessAuditLog)
    .where(and(...conditions));

  return {
    entries,
    total: Number(countResult?.count ?? 0),
    limit,
    offset,
  };
}

/**
 * Get all client accounts with their access summary for the admin list
 */
export async function listClientsWithAccessSummary(options: { limit?: number; offset?: number; search?: string } = {}) {
  const { limit = 50, offset = 0, search } = options;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        sql`${clientAccounts.name} ILIKE ${`%${search}%`}`,
        sql`${clientAccounts.companyName} ILIKE ${`%${search}%`}`,
      )
    );
  }

  const clients = await db
    .select({
      id: clientAccounts.id,
      name: clientAccounts.name,
      companyName: clientAccounts.companyName,
      contactEmail: clientAccounts.contactEmail,
      isActive: clientAccounts.isActive,
      createdAt: clientAccounts.createdAt,
    })
    .from(clientAccounts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(clientAccounts.name)
    .limit(limit)
    .offset(offset);

  // Enrich with grant counts (fault-tolerant if table doesn't exist yet)
  let enriched;
  try {
    enriched = await Promise.all(
      clients.map(async (client) => {
        const [grantCount] = await db
          .select({ count: count() })
          .from(clientPermissionGrants)
          .where(
            and(
              eq(clientPermissionGrants.clientAccountId, client.id),
              eq(clientPermissionGrants.isEnabled, true),
              isNull(clientPermissionGrants.revokedAt),
            )
          );
        return {
          ...client,
          activeGrantCount: Number(grantCount?.count ?? 0),
        };
      })
    );
  } catch {
    enriched = clients.map((client) => ({ ...client, activeGrantCount: 0 }));
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(clientAccounts)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return {
    clients: enriched,
    total: Number(totalResult?.count ?? 0),
    limit,
    offset,
  };
}