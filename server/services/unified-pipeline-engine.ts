/**
 * Unified Pipeline Engine
 *
 * Core CRUD + lifecycle management for unified account-based pipelines.
 * Handles pipeline creation, account enrollment, dashboard metrics,
 * and account timeline aggregation.
 */

import { db } from "../db";
import {
  unifiedPipelines,
  unifiedPipelineAccounts,
  unifiedPipelineContacts,
  unifiedPipelineActions,
  accounts,
  contacts,
  campaigns,
  users,
} from "@shared/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  sql,
  ilike,
  gte,
  lte,
  isNotNull,
} from "drizzle-orm";
import type {
  PipelineDashboard,
  PipelineFunnelMetrics,
  PipelineAccountDetail,
  PipelineStrategy,
} from "@shared/unified-pipeline-types";
import { UNIFIED_PIPELINE_FUNNEL_STAGES } from "@shared/unified-pipeline-types";

// ─── Pipeline CRUD ───────────────────────────────────────────────────────────

export async function createUnifiedPipeline(params: {
  organizationId: string;
  clientAccountId: string;
  name: string;
  description?: string;
  objective?: string;
  strategy?: PipelineStrategy;
  campaignPlanId?: string;
  createdBy?: string;
}): Promise<{ id: string }> {
  const [pipeline] = await db
    .insert(unifiedPipelines)
    .values({
      organizationId: params.organizationId,
      clientAccountId: params.clientAccountId,
      name: params.name,
      description: params.description,
      objective: params.objective,
      targetAccountCriteria: params.strategy?.targetCriteria ?? null,
      channelStrategy: params.strategy?.channelStrategy ?? null,
      funnelStrategy: params.strategy?.funnelStrategy ?? null,
      campaignPlanId: params.campaignPlanId,
      createdBy: params.createdBy,
      status: 'planning',
    })
    .returning({ id: unifiedPipelines.id });

  return { id: pipeline.id };
}

export async function getUnifiedPipeline(pipelineId: string) {
  const [pipeline] = await db
    .select()
    .from(unifiedPipelines)
    .where(eq(unifiedPipelines.id, pipelineId))
    .limit(1);
  return pipeline || null;
}

export async function listUnifiedPipelines(filters: {
  clientAccountId?: string;
  organizationId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (filters.clientAccountId) {
    conditions.push(eq(unifiedPipelines.clientAccountId, filters.clientAccountId));
  }
  if (filters.organizationId) {
    conditions.push(eq(unifiedPipelines.organizationId, filters.organizationId));
  }
  if (filters.status) {
    conditions.push(eq(unifiedPipelines.status, filters.status as any));
  }

  const rows = await db
    .select()
    .from(unifiedPipelines)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(unifiedPipelines.createdAt))
    .limit(filters.limit || 50)
    .offset(filters.offset || 0);

  return rows;
}

export async function updateUnifiedPipeline(
  pipelineId: string,
  updates: Partial<{
    name: string;
    description: string;
    status: string;
    objective: string;
    targetAccountCriteria: unknown;
    channelStrategy: unknown;
    funnelStrategy: unknown;
  }>
) {
  const [updated] = await db
    .update(unifiedPipelines)
    .set({ ...updates, updatedAt: new Date() } as any)
    .where(eq(unifiedPipelines.id, pipelineId))
    .returning();
  return updated || null;
}

// ─── Campaign Linking ────────────────────────────────────────────────────────

export async function addCampaignToPipeline(
  pipelineId: string,
  campaignId: string
): Promise<{ success: boolean; reason?: string }> {
  const [campaign] = await db
    .select({ id: campaigns.id, unifiedPipelineId: campaigns.unifiedPipelineId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return { success: false, reason: 'campaign_not_found' };
  if (campaign.unifiedPipelineId && campaign.unifiedPipelineId !== pipelineId) {
    return { success: false, reason: 'campaign_already_in_another_pipeline' };
  }

  await db
    .update(campaigns)
    .set({ unifiedPipelineId: pipelineId, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  // Update denormalized count
  const [{ total }] = await db
    .select({ total: count() })
    .from(campaigns)
    .where(eq(campaigns.unifiedPipelineId, pipelineId));

  await db
    .update(unifiedPipelines)
    .set({ totalCampaigns: total, updatedAt: new Date() })
    .where(eq(unifiedPipelines.id, pipelineId));

  return { success: true };
}

export async function getPipelineCampaigns(pipelineId: string) {
  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      status: campaigns.status,
      dialMode: campaigns.dialMode,
      enabledChannels: campaigns.enabledChannels,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(eq(campaigns.unifiedPipelineId, pipelineId))
    .orderBy(desc(campaigns.createdAt));
}

// ─── Account Enrollment ──────────────────────────────────────────────────────

export async function enrollAccountsInPipeline(
  pipelineId: string,
  accountIds: string[],
  enrollmentSource: string = 'import'
): Promise<{ enrolled: number; skipped: number }> {
  if (accountIds.length === 0) return { enrolled: 0, skipped: 0 };

  // Find which accounts are already enrolled
  const existing = await db
    .select({ accountId: unifiedPipelineAccounts.accountId })
    .from(unifiedPipelineAccounts)
    .where(
      and(
        eq(unifiedPipelineAccounts.pipelineId, pipelineId),
        inArray(unifiedPipelineAccounts.accountId, accountIds)
      )
    );

  const existingIds = new Set(existing.map((e) => e.accountId));
  const newAccountIds = accountIds.filter((id) => !existingIds.has(id));

  if (newAccountIds.length === 0) return { enrolled: 0, skipped: accountIds.length };

  // Bulk insert
  await db.insert(unifiedPipelineAccounts).values(
    newAccountIds.map((accountId) => ({
      pipelineId,
      accountId,
      funnelStage: 'target' as const,
      enrollmentSource,
    }))
  );

  // Update denormalized count
  const [{ total }] = await db
    .select({ total: count() })
    .from(unifiedPipelineAccounts)
    .where(eq(unifiedPipelineAccounts.pipelineId, pipelineId));

  await db
    .update(unifiedPipelines)
    .set({ totalAccounts: total, updatedAt: new Date() })
    .where(eq(unifiedPipelines.id, pipelineId));

  return { enrolled: newAccountIds.length, skipped: existingIds.size };
}

// ─── Pipeline Accounts ───────────────────────────────────────────────────────

export async function getPipelineAccounts(
  pipelineId: string,
  filters?: {
    funnelStage?: string;
    assignedAeId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }
) {
  const conditions = [eq(unifiedPipelineAccounts.pipelineId, pipelineId)];

  if (filters?.funnelStage) {
    conditions.push(eq(unifiedPipelineAccounts.funnelStage, filters.funnelStage as any));
  }
  if (filters?.assignedAeId) {
    conditions.push(eq(unifiedPipelineAccounts.assignedAeId, filters.assignedAeId));
  }

  const rows = await db
    .select({
      pipelineAccount: unifiedPipelineAccounts,
      accountName: accounts.name,
      accountIndustry: accounts.industryStandardized,
      accountStaffCount: accounts.staffCount,
    })
    .from(unifiedPipelineAccounts)
    .innerJoin(accounts, eq(unifiedPipelineAccounts.accountId, accounts.id))
    .where(and(...conditions))
    .orderBy(desc(unifiedPipelineAccounts.priorityScore))
    .limit(filters?.limit || 50)
    .offset(filters?.offset || 0);

  // If search filter, apply after join (account name search)
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    return rows.filter((r) => r.accountName.toLowerCase().includes(term));
  }

  return rows;
}

export async function getPipelineAccountDetail(
  pipelineAccountId: string
): Promise<PipelineAccountDetail | null> {
  // Get pipeline account + account info
  const [row] = await db
    .select({
      pa: unifiedPipelineAccounts,
      account: accounts,
    })
    .from(unifiedPipelineAccounts)
    .innerJoin(accounts, eq(unifiedPipelineAccounts.accountId, accounts.id))
    .where(eq(unifiedPipelineAccounts.id, pipelineAccountId))
    .limit(1);

  if (!row) return null;

  // Get assigned AE name
  let aeName: string | undefined;
  if (row.pa.assignedAeId) {
    const [ae] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, row.pa.assignedAeId))
      .limit(1);
    aeName = ae?.fullName || undefined;
  }

  // Get contacts for this pipeline account
  const pipelineContacts = await db
    .select({
      pc: unifiedPipelineContacts,
      contactName: contacts.fullName,
      contactEmail: contacts.email,
      contactTitle: contacts.jobTitle,
    })
    .from(unifiedPipelineContacts)
    .innerJoin(contacts, eq(unifiedPipelineContacts.contactId, contacts.id))
    .where(eq(unifiedPipelineContacts.pipelineAccountId, pipelineAccountId))
    .orderBy(desc(unifiedPipelineContacts.updatedAt));

  // Get action history (timeline)
  const actions = await db
    .select()
    .from(unifiedPipelineActions)
    .where(eq(unifiedPipelineActions.pipelineAccountId, pipelineAccountId))
    .orderBy(desc(unifiedPipelineActions.createdAt))
    .limit(50);

  // Build timeline from actions
  const timeline = actions.map((a) => ({
    type: a.actionType,
    description: a.outcome || a.title || a.actionType,
    contactName: undefined as string | undefined,
    campaignName: undefined as string | undefined,
    occurredAt: (a.completedAt || a.createdAt)?.toISOString() || new Date().toISOString(),
    metadata: a.outcomeDetails as Record<string, unknown> | undefined,
  }));

  // Next scheduled action
  const [nextAction] = await db
    .select()
    .from(unifiedPipelineActions)
    .where(
      and(
        eq(unifiedPipelineActions.pipelineAccountId, pipelineAccountId),
        eq(unifiedPipelineActions.status, 'scheduled')
      )
    )
    .orderBy(asc(unifiedPipelineActions.scheduledAt))
    .limit(1);

  const aiCtx = nextAction?.aiGeneratedContext as Record<string, unknown> | null;

  return {
    account: {
      id: row.account.id,
      name: row.account.name,
      industry: row.account.industryStandardized || undefined,
      employeeCount: row.account.staffCount || undefined,
      funnelStage: row.pa.funnelStage,
      priorityScore: row.pa.priorityScore || 0,
      readinessScore: row.pa.readinessScore || 0,
      engagementScore: row.pa.engagementScore || 0,
      assignedAeName: aeName,
      totalTouchpoints: row.pa.totalTouchpoints || 0,
      lastActivityAt: row.pa.lastActivityAt?.toISOString(),
    },
    contacts: pipelineContacts.map((c) => ({
      id: c.pc.contactId,
      name: c.contactName || 'Unknown',
      email: c.contactEmail || undefined,
      jobTitle: c.contactTitle || undefined,
      role: c.pc.role || undefined,
      engagementLevel: c.pc.engagementLevel || 'none',
      lastContactedAt: c.pc.lastContactedAt?.toISOString(),
      totalAttempts: c.pc.totalAttempts || 0,
      lastDisposition: c.pc.lastDisposition || undefined,
    })),
    timeline,
    nextAction: nextAction
      ? {
          actionType: nextAction.actionType,
          scheduledAt: nextAction.scheduledAt?.toISOString(),
          reasoning: (aiCtx?.reasoning as string) || nextAction.description || undefined,
          suggestedContent: (aiCtx?.suggestedContent as string) || undefined,
        }
      : undefined,
  };
}

export async function updatePipelineAccount(
  pipelineAccountId: string,
  updates: Partial<{
    funnelStage: string;
    assignedAeId: string;
    priorityScore: number;
    lostReason: string;
  }>
) {
  const setValues: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.funnelStage) {
    // Get current stage for tracking
    const [current] = await db
      .select({ funnelStage: unifiedPipelineAccounts.funnelStage })
      .from(unifiedPipelineAccounts)
      .where(eq(unifiedPipelineAccounts.id, pipelineAccountId))
      .limit(1);

    setValues.funnelStage = updates.funnelStage;
    setValues.stageChangedAt = new Date();
    setValues.previousStage = current?.funnelStage;
  }
  if (updates.assignedAeId) {
    setValues.assignedAeId = updates.assignedAeId;
    setValues.assignedAt = new Date();
  }
  if (updates.priorityScore !== undefined) {
    setValues.priorityScore = updates.priorityScore;
  }
  if (updates.lostReason) {
    setValues.lostReason = updates.lostReason;
  }

  const [updated] = await db
    .update(unifiedPipelineAccounts)
    .set(setValues as any)
    .where(eq(unifiedPipelineAccounts.id, pipelineAccountId))
    .returning();

  return updated || null;
}

// ─── Pipeline Dashboard ──────────────────────────────────────────────────────

export async function getPipelineDashboard(
  pipelineId: string
): Promise<PipelineDashboard | null> {
  const pipeline = await getUnifiedPipeline(pipelineId);
  if (!pipeline) return null;

  // Stage distribution
  const stageRows = await db
    .select({
      stage: unifiedPipelineAccounts.funnelStage,
      cnt: count(),
    })
    .from(unifiedPipelineAccounts)
    .where(eq(unifiedPipelineAccounts.pipelineId, pipelineId))
    .groupBy(unifiedPipelineAccounts.funnelStage);

  const totalAccounts = stageRows.reduce((sum, r) => sum + r.cnt, 0);

  const stageDistribution = UNIFIED_PIPELINE_FUNNEL_STAGES.map((s) => {
    const row = stageRows.find((r) => r.stage === s.id);
    const cnt = row?.cnt || 0;
    return {
      stageId: s.id,
      stageName: s.name,
      count: cnt,
      percentage: totalAccounts > 0 ? Math.round((cnt / totalAccounts) * 100) : 0,
    };
  });

  const appointmentsSet = stageRows.find((r) => r.stage === 'appointment_set')?.cnt || 0;
  const closedWon = stageRows.find((r) => r.stage === 'closed_won')?.cnt || 0;
  const closedLost = stageRows.find((r) => r.stage === 'closed_lost')?.cnt || 0;
  const activeAccounts = totalAccounts - closedWon - closedLost;
  const conversionRate = totalAccounts > 0
    ? Math.round(((appointmentsSet + closedWon) / totalAccounts) * 100)
    : 0;

  // Campaign metrics
  const pipelineCampaigns = await getPipelineCampaigns(pipelineId);
  const campaignMetrics = pipelineCampaigns.map((c) => ({
    campaignId: c.id,
    campaignName: c.name,
    campaignType: c.type,
    status: c.status,
    contactsReached: 0, // Can be enriched with actual call/email stats
    signalsGenerated: 0,
  }));

  // Recent activity
  const recentActions = await db
    .select({
      action: unifiedPipelineActions,
      accountName: accounts.name,
    })
    .from(unifiedPipelineActions)
    .innerJoin(
      unifiedPipelineAccounts,
      eq(unifiedPipelineActions.pipelineAccountId, unifiedPipelineAccounts.id)
    )
    .innerJoin(accounts, eq(unifiedPipelineAccounts.accountId, accounts.id))
    .where(eq(unifiedPipelineActions.pipelineId, pipelineId))
    .orderBy(desc(unifiedPipelineActions.updatedAt))
    .limit(10);

  return {
    pipeline: {
      id: pipeline.id,
      name: pipeline.name,
      status: pipeline.status,
      objective: pipeline.objective || undefined,
      createdAt: pipeline.createdAt.toISOString(),
    },
    funnel: {
      stageDistribution,
      totalAccounts,
      activeAccounts,
      appointmentsSet,
      closedWon,
      closedLost,
      conversionRate,
    },
    campaigns: campaignMetrics,
    recentActivity: recentActions.map((r) => ({
      type: r.action.actionType,
      accountName: r.accountName,
      description: r.action.outcome || r.action.title || r.action.actionType,
      occurredAt: (r.action.completedAt || r.action.createdAt)?.toISOString() || new Date().toISOString(),
    })),
  };
}

// ─── Account Actions ─────────────────────────────────────────────────────────

export async function createPipelineAction(params: {
  pipelineAccountId: string;
  pipelineId: string;
  contactId?: string;
  actionType: string;
  title?: string;
  description?: string;
  scheduledAt?: Date;
  aiGeneratedContext?: unknown;
  sourceCampaignId?: string;
  createdBy?: string;
}) {
  const [action] = await db
    .insert(unifiedPipelineActions)
    .values({
      pipelineAccountId: params.pipelineAccountId,
      pipelineId: params.pipelineId,
      contactId: params.contactId,
      actionType: params.actionType as any,
      status: 'scheduled',
      title: params.title,
      description: params.description,
      scheduledAt: params.scheduledAt || new Date(),
      aiGeneratedContext: params.aiGeneratedContext as any,
      sourceCampaignId: params.sourceCampaignId,
      createdBy: params.createdBy,
    })
    .returning();

  // Update next action on the pipeline account
  await db
    .update(unifiedPipelineAccounts)
    .set({
      nextActionType: params.actionType,
      nextActionAt: params.scheduledAt || new Date(),
      updatedAt: new Date(),
    })
    .where(eq(unifiedPipelineAccounts.id, params.pipelineAccountId));

  return action;
}

// ─── Pipeline Analytics ──────────────────────────────────────────────────────

export async function getPipelineAnalytics(pipelineId: string) {
  const dashboard = await getPipelineDashboard(pipelineId);
  if (!dashboard) return null;

  // Action stats
  const actionStats = await db
    .select({
      actionType: unifiedPipelineActions.actionType,
      status: unifiedPipelineActions.status,
      cnt: count(),
    })
    .from(unifiedPipelineActions)
    .where(eq(unifiedPipelineActions.pipelineId, pipelineId))
    .groupBy(unifiedPipelineActions.actionType, unifiedPipelineActions.status);

  // Average time in each stage (accounts that have moved past it)
  const stageProgression = await db
    .select({
      previousStage: unifiedPipelineAccounts.previousStage,
      cnt: count(),
    })
    .from(unifiedPipelineAccounts)
    .where(
      and(
        eq(unifiedPipelineAccounts.pipelineId, pipelineId),
        isNotNull(unifiedPipelineAccounts.previousStage)
      )
    )
    .groupBy(unifiedPipelineAccounts.previousStage);

  return {
    ...dashboard,
    actionStats,
    stageProgression,
  };
}
