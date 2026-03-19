/**
 * Engagement Trigger Service
 *
 * Account-based cross-channel engagement automation.
 * Rule: call engagement → email follow-up | email engagement → call follow-up
 *
 * Integrates with the unified pipeline for lead journey tracking.
 */

import { db } from '../db';
import {
  accountEngagementTriggers,
  accounts,
  contacts,
  campaigns,
  dialerCallAttempts,
  leads,
  callFollowupEmails,
  dealActivities,
  pipelineAccounts,
  type AccountEngagementTrigger,
  type InsertAccountEngagementTrigger,
} from '@shared/schema';
import { eq, and, desc, sql, or, inArray, isNotNull, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const LOG_PREFIX = '[EngagementTrigger]';

// ==================== TYPES ====================

export interface EngagementEvent {
  accountId: string;
  contactId: string;
  campaignId?: string;
  pipelineId?: string;
  channel: 'call' | 'email';
  entityId: string; // call_attempt_id or email_message_id
  engagedAt: Date;
  metadata?: {
    disposition?: string;
    callDuration?: number;
    emailOpened?: boolean;
    emailClicked?: boolean;
    transcript?: string;
  };
}

export interface TriggerResult {
  triggerId: string;
  targetChannel: 'call' | 'email';
  status: 'pending' | 'scheduled';
  scheduledAt?: Date;
}

export interface PipelineLeadView {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  accountName: string | null;
  accountId: string | null;
  campaignName: string | null;
  campaignId: string | null;
  aiScore: string | null;
  disposition: string | null;
  lastEngagementChannel: 'call' | 'email' | null;
  lastEngagementAt: string | null;
  nextAction: 'call' | 'email' | null;
  triggerStatus: string | null;
  triggerId: string | null;
  createdAt: string | null;
}

// ==================== CORE TRIGGER LOGIC ====================

/**
 * Process an engagement event and create the cross-channel trigger.
 * Call → Email follow-up | Email → Call follow-up.
 */
export async function processEngagementEvent(event: EngagementEvent): Promise<TriggerResult | null> {
  const targetChannel = event.channel === 'call' ? 'email' : 'call';

  console.log(`${LOG_PREFIX} Processing ${event.channel} engagement for account=${event.accountId}, contact=${event.contactId} → trigger ${targetChannel}`);

  // Build trigger payload based on target channel
  const triggerPayload = buildTriggerPayload(event, targetChannel);

  // Default delay: 30 min for email after call, 2 hours for call after email
  const delayMinutes = triggerPayload.delayMinutes ?? (targetChannel === 'email' ? 30 : 120);
  const scheduledAt = new Date(Date.now() + delayMinutes * 60_000);

  const triggerId = uuidv4();

  const [trigger] = await db.insert(accountEngagementTriggers).values({
    id: triggerId,
    accountId: event.accountId,
    contactId: event.contactId,
    campaignId: event.campaignId || null,
    pipelineId: event.pipelineId || null,
    sourceChannel: event.channel,
    sourceEntityId: event.entityId,
    sourceEngagedAt: event.engagedAt,
    targetChannel,
    status: 'scheduled',
    scheduledAt,
    triggerPayload,
  }).returning();

  console.log(`${LOG_PREFIX} Created trigger ${triggerId}: ${event.channel}→${targetChannel}, scheduled for ${scheduledAt.toISOString()}`);

  return {
    triggerId: trigger.id,
    targetChannel,
    status: 'scheduled',
    scheduledAt,
  };
}

/**
 * Build contextual trigger payload based on the source engagement.
 */
function buildTriggerPayload(
  event: EngagementEvent,
  targetChannel: 'call' | 'email'
): NonNullable<InsertAccountEngagementTrigger['triggerPayload']> {
  if (targetChannel === 'email') {
    // After a call → send follow-up email
    return {
      priority: event.metadata?.disposition === 'qualified_lead' ? 'high' : 'normal',
      delayMinutes: event.metadata?.disposition === 'callback_requested' ? 15 : 30,
      callScript: undefined,
      callObjective: undefined,
      emailSubject: undefined, // Will be AI-generated at execution time
      emailBody: undefined,
    };
  }

  // After email engagement → schedule call
  return {
    priority: event.metadata?.emailClicked ? 'high' : 'normal',
    delayMinutes: event.metadata?.emailClicked ? 60 : 120,
    callObjective: event.metadata?.emailClicked
      ? 'Follow up on clicked email content — high intent signal'
      : 'Re-engage after email open — warm contact',
    callScript: undefined,
    emailSubject: undefined,
    emailBody: undefined,
  };
}

// ==================== PIPELINE QUALIFIED LEADS ====================

/**
 * Get qualified leads for the client pipeline view with engagement trigger context.
 */
export async function getPipelineQualifiedLeads(options: {
  campaignId?: string;
  accountId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ leads: PipelineLeadView[]; total: number }> {
  const page = options.page ?? 1;
  const pageSize = Math.min(options.pageSize ?? 25, 200);
  const offset = (page - 1) * pageSize;

  // Build filters for qualified leads
  const filters = [
    inArray(leads.qaStatus, ['approved', 'published']),
    eq(leads.submittedToClient, true),
    isNotNull(leads.contactId),
  ];

  if (options.campaignId) {
    filters.push(eq(leads.campaignId, options.campaignId));
  }

  // Fetch leads with latest trigger info
  const leadsResult = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      contactEmail: leads.contactEmail,
      accountName: sql<string | null>`COALESCE(${accounts.name}, ${leads.accountName})`.as('account_name_resolved'),
      accountId: leads.accountId,
      campaignId: leads.campaignId,
      campaignName: campaigns.name,
      aiScore: leads.aiScore,
      disposition: leads.disposition,
      createdAt: leads.createdAt,
      // Latest trigger info via lateral subquery
      lastTriggerId: accountEngagementTriggers.id,
      lastTriggerSourceChannel: accountEngagementTriggers.sourceChannel,
      lastTriggerTargetChannel: accountEngagementTriggers.targetChannel,
      lastTriggerStatus: accountEngagementTriggers.status,
      lastTriggerSourceEngagedAt: accountEngagementTriggers.sourceEngagedAt,
    })
    .from(leads)
    .leftJoin(accounts, eq(leads.accountId, accounts.id))
    .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .leftJoin(
      accountEngagementTriggers,
      and(
        eq(leads.contactId, accountEngagementTriggers.contactId),
        eq(leads.campaignId, accountEngagementTriggers.campaignId),
      ),
    )
    .where(and(...filters))
    .orderBy(desc(leads.approvedAt))
    .limit(pageSize)
    .offset(offset);

  // Count total
  const [countResult] = await db
    .select({ total: count() })
    .from(leads)
    .where(and(...filters));

  const mappedLeads: PipelineLeadView[] = leadsResult.map((row) => ({
    id: row.id,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    accountName: row.accountName,
    accountId: row.accountId,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    aiScore: row.aiScore,
    disposition: row.disposition,
    lastEngagementChannel: row.lastTriggerSourceChannel,
    lastEngagementAt: row.lastTriggerSourceEngagedAt?.toISOString() ?? null,
    nextAction: row.lastTriggerTargetChannel,
    triggerStatus: row.lastTriggerStatus,
    triggerId: row.lastTriggerId,
    createdAt: row.createdAt?.toISOString() ?? null,
  }));

  return {
    leads: mappedLeads,
    total: countResult?.total ?? 0,
  };
}

// ==================== TRIGGER MANAGEMENT ====================

/**
 * List engagement triggers with filtering.
 */
export async function listEngagementTriggers(options: {
  accountId?: string;
  contactId?: string;
  campaignId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ triggers: AccountEngagementTrigger[]; total: number }> {
  const page = options.page ?? 1;
  const pageSize = Math.min(options.pageSize ?? 25, 200);
  const offset = (page - 1) * pageSize;

  const filters = [];
  if (options.accountId) filters.push(eq(accountEngagementTriggers.accountId, options.accountId));
  if (options.contactId) filters.push(eq(accountEngagementTriggers.contactId, options.contactId));
  if (options.campaignId) filters.push(eq(accountEngagementTriggers.campaignId, options.campaignId));
  if (options.status) filters.push(eq(accountEngagementTriggers.status, options.status as any));

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const triggers = await db
    .select()
    .from(accountEngagementTriggers)
    .where(whereClause)
    .orderBy(desc(accountEngagementTriggers.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [countResult] = await db
    .select({ total: count() })
    .from(accountEngagementTriggers)
    .where(whereClause);

  return { triggers, total: countResult?.total ?? 0 };
}

/**
 * Cancel a pending/scheduled trigger.
 */
export async function cancelTrigger(triggerId: string): Promise<AccountEngagementTrigger | null> {
  const [updated] = await db
    .update(accountEngagementTriggers)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(and(
      eq(accountEngagementTriggers.id, triggerId),
      inArray(accountEngagementTriggers.status, ['pending', 'scheduled']),
    ))
    .returning();

  return updated || null;
}

/**
 * Manually create a trigger for a specific lead (admin action).
 */
export async function createManualTrigger(params: {
  accountId: string;
  contactId: string;
  campaignId?: string;
  pipelineId?: string;
  targetChannel: 'call' | 'email';
  payload?: InsertAccountEngagementTrigger['triggerPayload'];
  scheduledAt?: Date;
  createdBy?: string;
}): Promise<AccountEngagementTrigger> {
  const sourceChannel = params.targetChannel === 'email' ? 'call' : 'email';

  const [trigger] = await db.insert(accountEngagementTriggers).values({
    id: uuidv4(),
    accountId: params.accountId,
    contactId: params.contactId,
    campaignId: params.campaignId || null,
    pipelineId: params.pipelineId || null,
    sourceChannel,
    sourceEntityId: null,
    sourceEngagedAt: new Date(),
    targetChannel: params.targetChannel,
    status: params.scheduledAt ? 'scheduled' : 'pending',
    scheduledAt: params.scheduledAt || null,
    triggerPayload: params.payload || {},
    createdBy: params.createdBy || null,
  }).returning();

  console.log(`${LOG_PREFIX} Manual trigger created: ${trigger.id} → ${params.targetChannel}`);
  return trigger;
}

/**
 * Get engagement summary stats for a campaign or account.
 */
export async function getEngagementStats(options: {
  campaignId?: string;
  accountId?: string;
}): Promise<{
  totalTriggers: number;
  pending: number;
  scheduled: number;
  completed: number;
  failed: number;
  cancelled: number;
  callToEmail: number;
  emailToCall: number;
}> {
  const filters = [];
  if (options.campaignId) filters.push(eq(accountEngagementTriggers.campaignId, options.campaignId));
  if (options.accountId) filters.push(eq(accountEngagementTriggers.accountId, options.accountId));

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const result = await db
    .select({
      status: accountEngagementTriggers.status,
      sourceChannel: accountEngagementTriggers.sourceChannel,
      count: count(),
    })
    .from(accountEngagementTriggers)
    .where(whereClause)
    .groupBy(accountEngagementTriggers.status, accountEngagementTriggers.sourceChannel);

  const stats = {
    totalTriggers: 0,
    pending: 0,
    scheduled: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    callToEmail: 0,
    emailToCall: 0,
  };

  for (const row of result) {
    const c = Number(row.count);
    stats.totalTriggers += c;
    if (row.status === 'pending') stats.pending += c;
    if (row.status === 'scheduled') stats.scheduled += c;
    if (row.status === 'completed') stats.completed += c;
    if (row.status === 'failed') stats.failed += c;
    if (row.status === 'cancelled') stats.cancelled += c;
    if (row.sourceChannel === 'call') stats.callToEmail += c;
    if (row.sourceChannel === 'email') stats.emailToCall += c;
  }

  return stats;
}

/**
 * Mark a trigger as completed after execution.
 */
export async function completeTrigger(
  triggerId: string,
  resultEntityId: string,
  notes?: string
): Promise<AccountEngagementTrigger | null> {
  const [updated] = await db
    .update(accountEngagementTriggers)
    .set({
      status: 'completed',
      executedAt: new Date(),
      resultEntityId,
      resultNotes: notes || null,
      updatedAt: new Date(),
    })
    .where(eq(accountEngagementTriggers.id, triggerId))
    .returning();

  return updated || null;
}

/**
 * Mark a trigger as failed.
 */
export async function failTrigger(triggerId: string, error: string): Promise<void> {
  await db
    .update(accountEngagementTriggers)
    .set({
      status: 'failed',
      executedAt: new Date(),
      errorMessage: error,
      updatedAt: new Date(),
    })
    .where(eq(accountEngagementTriggers.id, triggerId));
}
