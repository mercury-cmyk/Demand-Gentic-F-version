/**
 * Bulk Disposition Reanalyzer Service
 *
 * Analyzes historical calls across all disposition types, re-evaluates them
 * using transcript analysis + campaign-specific criteria, and re-routes
 * leads/contacts to the correct disposition:
 *
 *   - qualified_lead  → QA queue (create lead if missing)
 *   - not_interested   → Removed from campaign
 *   - voicemail/no_answer → Retry schedule
 *   - needs_review     → Human review queue
 *   - answering_machine → Voicemail (retry schedule)
 *
 * Supports dry-run mode (preview changes), single-call and batch operations.
 */

import { db } from "../db";
import {
  callSessions,
  dialerCallAttempts,
  campaigns,
  campaignQueue,
  leads,
  contacts,
  accounts,
  activityLog,
  qcWorkQueue,
  type CanonicalDisposition,
} from "@shared/schema";
import { eq, and, sql, gte, lte, isNotNull, inArray, desc } from "drizzle-orm";
import {
  loadCampaignQualificationContext,
  determineSmartDisposition,
  type DispositionAnalysisResult,
  type CampaignQualificationContext,
} from "./smart-disposition-analyzer";
import { processDisposition, type DispositionCallData } from "./disposition-engine";

const LOG_PREFIX = "[BulkDispositionReanalyzer]";

// ==================== TYPES ====================

export interface ReanalysisFilter {
  campaignId?: string;
  dispositions?: string[];           // Filter by current disposition types
  dateFrom?: string;                 // ISO date string
  dateTo?: string;                   // ISO date string
  minDurationSec?: number;           // Only calls longer than N seconds
  maxDurationSec?: number;           // Only calls shorter than N seconds
  hasTranscript?: boolean;           // Only calls with transcripts
  hasRecording?: boolean;            // Only calls with recordings
  limit?: number;                    // Max calls to process (default 100)
  offset?: number;
}

export interface ReanalysisCallDetail {
  callSessionId: string;
  callAttemptId: string | null;
  contactId: string | null;
  contactName: string;
  companyName: string;
  campaignId: string;
  campaignName: string;
  phoneDialed: string;
  durationSec: number;
  currentDisposition: string;
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  shouldOverride: boolean;
  transcriptPreview: string;
  recordingUrl: string | null;
  callDate: string;
  hasLead: boolean;
  leadId: string | null;
  actionTaken: string | null;
}

export interface ReanalysisSummary {
  totalAnalyzed: number;
  totalShouldChange: number;
  totalChanged: number;
  totalErrors: number;
  dryRun: boolean;
  breakdown: {
    currentDisposition: string;
    suggestedDisposition: string;
    count: number;
  }[];
  calls: ReanalysisCallDetail[];
  actionsSummary: {
    newLeadsCreated: number;
    leadsRemovedFromCampaign: number;
    movedToQA: number;
    movedToNeedsReview: number;
    retriesScheduled: number;
  };
}

export interface SingleCallReanalysis {
  callSessionId: string;
  callAttemptId: string | null;
  currentDisposition: string;
  analysis: DispositionAnalysisResult;
  contactInfo: {
    name: string;
    company: string;
    phone: string;
  };
  campaignInfo: {
    id: string;
    name: string;
  };
  transcript: any;
  recordingUrl: string | null;
  durationSec: number;
  callDate: string;
  hasExistingLead: boolean;
  existingLeadId: string | null;
}

// ==================== SINGLE CALL ANALYSIS ====================

/**
 * Analyze a single call session and return detailed disposition recommendation
 */
export async function analyzeSingleCall(callSessionId: string): Promise<SingleCallReanalysis | null> {
  console.log(`${LOG_PREFIX} Analyzing single call: ${callSessionId}`);

  // Fetch full call data with joins
  const [session] = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
      recordingUrl: callSessions.recordingUrl,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      startedAt: callSessions.startedAt,
      toNumberE164: callSessions.toNumberE164,
    })
    .from(callSessions)
    .where(eq(callSessions.id, callSessionId))
    .limit(1);

  if (!session) {
    console.warn(`${LOG_PREFIX} Call session ${callSessionId} not found`);
    return null;
  }

  // Get call attempt data
  const attempts = await db
    .select({
      id: dialerCallAttempts.id,
      disposition: dialerCallAttempts.disposition,
      phoneDialed: dialerCallAttempts.phoneDialed,
      callDurationSeconds: dialerCallAttempts.callDurationSeconds,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.callSessionId, callSessionId))
    .limit(1);

  const attempt = attempts[0] || null;

  // Get contact & account info
  let contactName = "Unknown";
  let companyName = "Unknown";
  if (session.contactId) {
    const [contactInfo] = await db
      .select({
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        companyName: accounts.name,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.id, session.contactId))
      .limit(1);

    if (contactInfo) {
      contactName = contactInfo.fullName ||
        [contactInfo.firstName, contactInfo.lastName].filter(Boolean).join(" ") ||
        "Unknown";
      companyName = contactInfo.companyName || "Unknown";
    }
  }

  // Get campaign info
  let campaignName = "Unknown";
  if (session.campaignId) {
    const [camp] = await db
      .select({ name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, session.campaignId))
      .limit(1);
    campaignName = camp?.name || "Unknown";
  }

  // Check for existing lead
  let existingLeadId: string | null = null;
  if (attempt) {
    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.callAttemptId, attempt.id))
      .limit(1);
    existingLeadId = existingLead?.id || null;
  }

  // Load campaign context and run smart analysis
  let analysis: DispositionAnalysisResult;
  if (session.campaignId) {
    const context = await loadCampaignQualificationContext(session.campaignId);
    if (context) {
      analysis = determineSmartDisposition(
        session.aiDisposition,
        session.aiTranscript,
        context,
        session.durationSec || 0
      );
    } else {
      analysis = buildDefaultAnalysis(session.aiDisposition, session.aiTranscript, session.durationSec || 0);
    }
  } else {
    analysis = buildDefaultAnalysis(session.aiDisposition, session.aiTranscript, session.durationSec || 0);
  }

  return {
    callSessionId: session.id,
    callAttemptId: attempt?.id || null,
    currentDisposition: session.aiDisposition || "unknown",
    analysis,
    contactInfo: {
      name: contactName,
      company: companyName,
      phone: session.toNumberE164,
    },
    campaignInfo: {
      id: session.campaignId || "",
      name: campaignName,
    },
    transcript: session.aiTranscript,
    recordingUrl: session.recordingUrl,
    durationSec: session.durationSec || 0,
    callDate: session.startedAt?.toISOString() || "",
    hasExistingLead: !!existingLeadId,
    existingLeadId,
  };
}

// ==================== BATCH REANALYSIS ====================

/**
 * Analyze a batch of calls and optionally apply disposition changes
 */
export async function reanalyzeBatch(
  filters: ReanalysisFilter,
  dryRun: boolean = true
): Promise<ReanalysisSummary> {
  const limit = Math.min(filters.limit || 100, 500);
  const offset = filters.offset || 0;

  console.log(`${LOG_PREFIX} Starting batch reanalysis. DryRun=${dryRun}, Limit=${limit}`);
  console.log(`${LOG_PREFIX} Filters: ${JSON.stringify(filters)}`);

  // Build query conditions
  const conditions: any[] = [];

  if (filters.campaignId) {
    conditions.push(eq(callSessions.campaignId, filters.campaignId));
  }

  if (filters.dispositions && filters.dispositions.length > 0) {
    conditions.push(
      sql`${callSessions.aiDisposition} IN (${sql.join(
        filters.dispositions.map((d) => sql`${d}`),
        sql`, `
      )})`
    );
  }

  if (filters.dateFrom) {
    conditions.push(gte(callSessions.startedAt, new Date(filters.dateFrom)));
  }

  if (filters.dateTo) {
    conditions.push(lte(callSessions.startedAt, new Date(filters.dateTo)));
  }

  if (filters.minDurationSec !== undefined) {
    conditions.push(gte(callSessions.durationSec, filters.minDurationSec));
  }

  if (filters.maxDurationSec !== undefined) {
    conditions.push(lte(callSessions.durationSec, filters.maxDurationSec));
  }

  if (filters.hasTranscript !== false) {
    conditions.push(isNotNull(callSessions.aiTranscript));
  }

  if (filters.hasRecording) {
    conditions.push(isNotNull(callSessions.recordingUrl));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : isNotNull(callSessions.aiTranscript);

  // Count total matching
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callSessions)
    .where(whereClause);
  const totalMatching = totalResult?.count || 0;

  console.log(`${LOG_PREFIX} Found ${totalMatching} matching calls. Processing ${limit} from offset ${offset}.`);

  // Fetch calls with full context
  const sessions = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
      recordingUrl: callSessions.recordingUrl,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      startedAt: callSessions.startedAt,
      toNumberE164: callSessions.toNumberE164,
    })
    .from(callSessions)
    .where(whereClause)
    .orderBy(desc(callSessions.startedAt))
    .limit(limit)
    .offset(offset);

  // Pre-load campaign contexts (cache per campaign)
  const campaignContextCache = new Map<string, CampaignQualificationContext | null>();
  const campaignNameCache = new Map<string, string>();

  for (const session of sessions) {
    if (session.campaignId && !campaignContextCache.has(session.campaignId)) {
      const ctx = await loadCampaignQualificationContext(session.campaignId);
      campaignContextCache.set(session.campaignId, ctx);
      campaignNameCache.set(session.campaignId, ctx?.campaignName || "Unknown");
    }
  }

  // Get call attempt IDs for all sessions
  const sessionIds = sessions.map((s) => s.id);
  let attemptMap = new Map<string, { id: string; disposition: string | null; phoneDialed: string; queueItemId: string | null }>();
  if (sessionIds.length > 0) {
    const attempts = await db
      .select({
        callSessionId: dialerCallAttempts.callSessionId,
        id: dialerCallAttempts.id,
        disposition: dialerCallAttempts.disposition,
        phoneDialed: dialerCallAttempts.phoneDialed,
        queueItemId: dialerCallAttempts.queueItemId,
      })
      .from(dialerCallAttempts)
      .where(
        sql`${dialerCallAttempts.callSessionId} IN (${sql.join(
          sessionIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );

    for (const a of attempts) {
      if (a.callSessionId) {
        attemptMap.set(a.callSessionId, {
          id: a.id,
          disposition: a.disposition,
          phoneDialed: a.phoneDialed,
          queueItemId: a.queueItemId,
        });
      }
    }
  }

  // Get existing leads for these call attempts
  const attemptIds = Array.from(attemptMap.values()).map((a) => a.id);
  let leadMap = new Map<string, string>();
  if (attemptIds.length > 0) {
    const existingLeads = await db
      .select({
        id: leads.id,
        callAttemptId: leads.callAttemptId,
      })
      .from(leads)
      .where(
        sql`${leads.callAttemptId} IN (${sql.join(
          attemptIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );

    for (const l of existingLeads) {
      if (l.callAttemptId) {
        leadMap.set(l.callAttemptId, l.id);
      }
    }
  }

  // Get contact info for all sessions
  const contactIds = sessions.map((s) => s.contactId).filter(Boolean) as string[];
  let contactInfoMap = new Map<string, { name: string; company: string }>();
  if (contactIds.length > 0) {
    const contactInfos = await db
      .select({
        id: contacts.id,
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        companyName: accounts.name,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(
        sql`${contacts.id} IN (${sql.join(
          contactIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );

    for (const c of contactInfos) {
      const name = c.fullName ||
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        "Unknown";
      contactInfoMap.set(c.id, { name, company: c.companyName || "Unknown" });
    }
  }

  // Analyze each call
  const summary: ReanalysisSummary = {
    totalAnalyzed: 0,
    totalShouldChange: 0,
    totalChanged: 0,
    totalErrors: 0,
    dryRun,
    breakdown: [],
    calls: [],
    actionsSummary: {
      newLeadsCreated: 0,
      leadsRemovedFromCampaign: 0,
      movedToQA: 0,
      movedToNeedsReview: 0,
      retriesScheduled: 0,
    },
  };

  const breakdownMap = new Map<string, number>();

  for (const session of sessions) {
    try {
      summary.totalAnalyzed++;

      const currentDisp = session.aiDisposition || "unknown";
      const context = session.campaignId
        ? campaignContextCache.get(session.campaignId) || null
        : null;

      // Run smart disposition analysis
      let analysis: DispositionAnalysisResult;
      if (context) {
        analysis = determineSmartDisposition(
          session.aiDisposition,
          session.aiTranscript,
          context,
          session.durationSec || 0
        );
      } else {
        analysis = buildDefaultAnalysis(
          session.aiDisposition,
          session.aiTranscript,
          session.durationSec || 0
        );
      }

      const attempt = attemptMap.get(session.id);
      const contactInfo = session.contactId
        ? contactInfoMap.get(session.contactId) || { name: "Unknown", company: "Unknown" }
        : { name: "Unknown", company: "Unknown" };
      const existingLeadId = attempt ? leadMap.get(attempt.id) || null : null;

      // Build transcript preview (first 300 chars)
      let transcriptPreview = "";
      if (session.aiTranscript) {
        try {
          const parsed = typeof session.aiTranscript === "string"
            ? JSON.parse(session.aiTranscript)
            : session.aiTranscript;
          if (Array.isArray(parsed)) {
            transcriptPreview = parsed
              .map((t: any) => `${t.role}: ${t.message || t.text || ""}`)
              .join(" | ")
              .slice(0, 300);
          } else {
            transcriptPreview = String(session.aiTranscript).slice(0, 300);
          }
        } catch {
          transcriptPreview = String(session.aiTranscript).slice(0, 300);
        }
      }

      const callDetail: ReanalysisCallDetail = {
        callSessionId: session.id,
        callAttemptId: attempt?.id || null,
        contactId: session.contactId,
        contactName: contactInfo.name,
        companyName: contactInfo.company,
        campaignId: session.campaignId || "",
        campaignName: campaignNameCache.get(session.campaignId || "") || "Unknown",
        phoneDialed: attempt?.phoneDialed || session.toNumberE164,
        durationSec: session.durationSec || 0,
        currentDisposition: currentDisp,
        suggestedDisposition: analysis.suggestedDisposition,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        positiveSignals: analysis.positiveSignals,
        negativeSignals: analysis.negativeSignals,
        shouldOverride: analysis.shouldOverride,
        transcriptPreview,
        recordingUrl: session.recordingUrl,
        callDate: session.startedAt?.toISOString() || "",
        hasLead: !!existingLeadId,
        leadId: existingLeadId,
        actionTaken: null,
      };

      if (analysis.shouldOverride && analysis.suggestedDisposition !== currentDisp) {
        summary.totalShouldChange++;
        const key = `${currentDisp} → ${analysis.suggestedDisposition}`;
        breakdownMap.set(key, (breakdownMap.get(key) || 0) + 1);

        if (!dryRun) {
          // Apply the disposition change
          const actionResult = await applyDispositionChange(
            session,
            attempt,
            analysis.suggestedDisposition as CanonicalDisposition,
            existingLeadId,
            currentDisp
          );

          if (actionResult.success) {
            summary.totalChanged++;
            callDetail.actionTaken = actionResult.action;

            // Update action summary
            if (actionResult.action?.includes("lead created")) summary.actionsSummary.newLeadsCreated++;
            if (actionResult.action?.includes("removed")) summary.actionsSummary.leadsRemovedFromCampaign++;
            if (actionResult.action?.includes("QA")) summary.actionsSummary.movedToQA++;
            if (actionResult.action?.includes("needs_review")) summary.actionsSummary.movedToNeedsReview++;
            if (actionResult.action?.includes("retry")) summary.actionsSummary.retriesScheduled++;
          } else {
            summary.totalErrors++;
            callDetail.actionTaken = `ERROR: ${actionResult.error}`;
          }
        }
      }

      summary.calls.push(callDetail);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error analyzing session ${session.id}:`, error);
      summary.totalErrors++;
    }
  }

  // Build breakdown array
  for (const [key, count] of breakdownMap) {
    const [current, suggested] = key.split(" → ");
    summary.breakdown.push({
      currentDisposition: current,
      suggestedDisposition: suggested,
      count,
    });
  }

  // Sort breakdown by count descending
  summary.breakdown.sort((a, b) => b.count - a.count);

  console.log(`${LOG_PREFIX} Batch reanalysis complete:
    Analyzed: ${summary.totalAnalyzed}
    Should change: ${summary.totalShouldChange}
    Changed: ${summary.totalChanged}
    Errors: ${summary.totalErrors}
    DryRun: ${dryRun}`);

  return summary;
}

// ==================== APPLY DISPOSITION CHANGE ====================

/**
 * Apply a single disposition change: update call session, call attempt,
 * campaign queue, and create/remove leads as needed
 */
async function applyDispositionChange(
  session: {
    id: string;
    campaignId: string | null;
    contactId: string | null;
    aiTranscript: string | null;
    recordingUrl: string | null;
    toNumberE164: string;
  },
  attempt: { id: string; disposition: string | null; phoneDialed: string; queueItemId: string | null } | undefined,
  newDisposition: CanonicalDisposition,
  existingLeadId: string | null,
  oldDisposition: string
): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    console.log(`${LOG_PREFIX} Applying: ${session.id} | ${oldDisposition} → ${newDisposition}`);

    // 1. Update call_sessions.ai_disposition
    await db
      .update(callSessions)
      .set({ aiDisposition: newDisposition })
      .where(eq(callSessions.id, session.id));

    // 2. Update dialer_call_attempts.disposition if exists
    if (attempt) {
      await db
        .update(dialerCallAttempts)
        .set({
          disposition: newDisposition,
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, attempt.id));
    }

    // 3. Handle routing based on new disposition
    let action = `Disposition updated: ${oldDisposition} → ${newDisposition}`;

    switch (newDisposition) {
      case "qualified_lead":
        // Create lead if doesn't exist
        if (!existingLeadId && attempt) {
          const newLeadId = await createLeadForReanalysis(session, attempt);
          if (newLeadId) {
            action += ` | New lead created (${newLeadId}) → QA queue (new)`;
          }
        } else if (existingLeadId) {
          // Move existing lead into the standard QA entry point ('new')
          // so it goes through the full QA workflow rather than bypassing it
          await db
            .update(leads)
            .set({ qaStatus: "new", updatedAt: new Date() })
            .where(eq(leads.id, existingLeadId));
          action += ` | Existing lead ${existingLeadId} moved to QA new (pending review)`;
        }

        // Update campaign queue to done/qualified
        if (attempt?.queueItemId) {
          await db
            .update(campaignQueue)
            .set({
              status: "done",
              agentId: null,
              virtualAgentId: null,
              lockExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(eq(campaignQueue.id, attempt.queueItemId));
        }
        break;

      case "not_interested":
        // Remove from campaign queue
        if (attempt?.queueItemId) {
          await db
            .update(campaignQueue)
            .set({
              status: "removed",
              removedReason: "not_interested_reanalysis",
              agentId: null,
              virtualAgentId: null,
              lockExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(eq(campaignQueue.id, attempt.queueItemId));
          action += " | Removed from campaign queue";
        }

        // If there was a lead created mistakenly, mark it rejected
        if (existingLeadId) {
          await db
            .update(leads)
            .set({ qaStatus: "rejected", qaDecision: "Reanalysis: Not interested", updatedAt: new Date() })
            .where(eq(leads.id, existingLeadId));
          action += ` | Lead ${existingLeadId} rejected`;
        }
        break;

      case "needs_review":
        // Keep in queue but flag for human review
        if (attempt?.queueItemId) {
          await db
            .update(campaignQueue)
            .set({
              status: "queued",
              targetAgentType: "human",
              agentId: null,
              virtualAgentId: null,
              lockExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(eq(campaignQueue.id, attempt.queueItemId));
          action += " | Flagged for human review (needs_review)";
        }
        break;

      case "voicemail":
      case "no_answer":
        // Schedule retry if in queue
        if (attempt?.queueItemId) {
          const retryDays = newDisposition === "voicemail" ? 3 : 1;
          const nextAttemptAt = new Date();
          nextAttemptAt.setDate(nextAttemptAt.getDate() + retryDays);

          await db
            .update(campaignQueue)
            .set({
              status: "queued",
              nextAttemptAt,
              agentId: null,
              virtualAgentId: null,
              lockExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(eq(campaignQueue.id, attempt.queueItemId));
          action += ` | Scheduled retry in ${retryDays} days`;
        }
        break;

      default:
        break;
    }

    // 4. Log activity
    try {
      await db.insert(activityLog).values({
        entityType: "call_session",
        entityId: session.id,
        eventType: "disposition_reanalysis" as any,
        payload: {
          oldDisposition,
          newDisposition,
          callSessionId: session.id,
          callAttemptId: attempt?.id,
          campaignId: session.campaignId,
          contactId: session.contactId,
          action,
        },
        createdBy: null,
      });
    } catch (logErr) {
      console.error(`${LOG_PREFIX} Failed to log reanalysis activity:`, logErr);
    }

    return { success: true, action };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Failed to apply disposition change for ${session.id}:`, error);
    return { success: false, error: msg };
  }
}

// ==================== APPLY SINGLE OVERRIDE ====================

/**
 * Manually override a single call's disposition (admin action)
 */
export async function overrideSingleDisposition(
  callSessionId: string,
  newDisposition: CanonicalDisposition,
  overriddenBy: string,
  reason?: string
): Promise<{ success: boolean; action?: string; error?: string }> {
  console.log(`${LOG_PREFIX} Manual override: ${callSessionId} → ${newDisposition} by ${overriddenBy}`);

  // Fetch session
  const [session] = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      aiTranscript: callSessions.aiTranscript,
      recordingUrl: callSessions.recordingUrl,
      toNumberE164: callSessions.toNumberE164,
    })
    .from(callSessions)
    .where(eq(callSessions.id, callSessionId))
    .limit(1);

  if (!session) {
    return { success: false, error: `Call session ${callSessionId} not found` };
  }

  // Get call attempt
  const attempts = await db
    .select({
      id: dialerCallAttempts.id,
      disposition: dialerCallAttempts.disposition,
      phoneDialed: dialerCallAttempts.phoneDialed,
      queueItemId: dialerCallAttempts.queueItemId,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.callSessionId, callSessionId))
    .limit(1);

  const attempt = attempts[0] || undefined;

  // Check for existing lead
  let existingLeadId: string | null = null;
  if (attempt) {
    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.callAttemptId, attempt.id))
      .limit(1);
    existingLeadId = existingLead?.id || null;
  }

  const oldDisposition = session.aiDisposition || "unknown";

  const result = await applyDispositionChange(
    session,
    attempt,
    newDisposition,
    existingLeadId,
    oldDisposition
  );

  // Log the manual override specifically
  if (result.success) {
    try {
      await db.insert(activityLog).values({
        entityType: "call_session",
        entityId: callSessionId,
        eventType: "disposition_manual_override" as any,
        payload: {
          oldDisposition,
          newDisposition,
          overriddenBy,
          reason: reason || "Manual override via bulk reanalyzer",
          action: result.action,
        },
        createdBy: overriddenBy,
      });
    } catch (logErr) {
      console.error(`${LOG_PREFIX} Failed to log manual override:`, logErr);
    }
  }

  return result;
}

// ==================== DISPOSITION STATISTICS ====================

/**
 * Get disposition distribution statistics for a campaign or all campaigns
 */
export async function getDispositionStats(
  campaignId?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{
  total: number;
  distribution: Array<{
    disposition: string;
    count: number;
    percentage: number;
    avgDurationSec: number;
    withTranscript: number;
    withRecording: number;
  }>;
  potentialMisclassifications: number;
}> {
  const conditions: any[] = [];

  if (campaignId) {
    conditions.push(eq(callSessions.campaignId, campaignId));
  }
  if (dateFrom) {
    conditions.push(gte(callSessions.startedAt, new Date(dateFrom)));
  }
  if (dateTo) {
    conditions.push(lte(callSessions.startedAt, new Date(dateTo)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      disposition: callSessions.aiDisposition,
      count: sql<number>`count(*)::int`,
      avgDuration: sql<number>`coalesce(avg(${callSessions.durationSec})::int, 0)`,
      withTranscript: sql<number>`sum(case when ${callSessions.aiTranscript} is not null then 1 else 0 end)::int`,
      withRecording: sql<number>`sum(case when ${callSessions.recordingUrl} is not null then 1 else 0 end)::int`,
    })
    .from(callSessions)
    .where(whereClause)
    .groupBy(callSessions.aiDisposition)
    .orderBy(sql`count(*) desc`);

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  // Estimate potential misclassifications:
  // - not_interested calls with duration > 60s (may have been real conversations)
  // - no_answer calls with transcripts (should have been classified differently)
  const [potentialResult] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(callSessions)
    .where(
      and(
        ...(conditions.length > 0 ? conditions : []),
        sql`(
          (${callSessions.aiDisposition} = 'not_interested' AND ${callSessions.durationSec} > 60)
          OR
          (${callSessions.aiDisposition} = 'no_answer' AND ${callSessions.aiTranscript} IS NOT NULL AND length(${callSessions.aiTranscript}) > 100)
          OR
          (${callSessions.aiDisposition} = 'voicemail' AND ${callSessions.durationSec} > 90)
        )`
      )
    );

  return {
    total,
    distribution: rows.map((r) => ({
      disposition: r.disposition || "unknown",
      count: r.count,
      percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
      avgDurationSec: r.avgDuration,
      withTranscript: r.withTranscript,
      withRecording: r.withRecording,
    })),
    potentialMisclassifications: potentialResult?.count || 0,
  };
}

// ==================== HELPER: CREATE LEAD FROM REANALYSIS ====================

async function createLeadForReanalysis(
  session: {
    id: string;
    campaignId: string | null;
    contactId: string | null;
    aiTranscript: string | null;
    recordingUrl: string | null;
    toNumberE164: string;
  },
  attempt: { id: string; phoneDialed: string }
): Promise<string | null> {
  if (!session.campaignId || !session.contactId) return null;

  // Get contact info
  const [contactInfo] = await db
    .select({
      fullName: contacts.fullName,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      companyName: accounts.name,
    })
    .from(contacts)
    .leftJoin(accounts, eq(contacts.accountId, accounts.id))
    .where(eq(contacts.id, session.contactId))
    .limit(1);

  const contactName = contactInfo?.fullName ||
    [contactInfo?.firstName, contactInfo?.lastName].filter(Boolean).join(" ") ||
    "Unknown";

  try {
    const [newLead] = await db
      .insert(leads)
      .values({
        campaignId: session.campaignId,
        contactId: session.contactId,
        callAttemptId: attempt.id,
        contactName,
        contactEmail: contactInfo?.email || undefined,
        accountName: contactInfo?.companyName || undefined,
        qaStatus: "new",
        qaDecision: "Created via disposition reanalysis override — pending QA review",
        dialedNumber: attempt.phoneDialed,
        recordingUrl: session.recordingUrl,
        transcript: session.aiTranscript || undefined,
        notes: "Source: bulk_disposition_reanalysis",
      })
      .returning({ id: leads.id });

    if (newLead) {
      // Add to QC work queue
      await db.insert(qcWorkQueue).values({
        callSessionId: session.id,
        leadId: newLead.id,
        campaignId: session.campaignId,
        producerType: "ai",
        status: "pending",
        priority: 0,
      });

      console.log(`${LOG_PREFIX} ✅ Lead created: ${newLead.id} for session ${session.id}`);
      return newLead.id;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create lead for session ${session.id}:`, error);
  }

  return null;
}

// ==================== HELPER: DEFAULT ANALYSIS ====================

function buildDefaultAnalysis(
  currentDisposition: string | null,
  transcript: any,
  durationSec: number
): DispositionAnalysisResult {
  // Simple heuristic when no campaign context available
  const transcriptStr = typeof transcript === "string"
    ? transcript.toLowerCase()
    : JSON.stringify(transcript || "").toLowerCase();

  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  const positiveKw = [
    "interested", "tell me more", "send me", "email me", "schedule",
    "meeting", "sounds good", "yes please", "book", "demo", "callback",
  ];
  const negativeKw = [
    "not interested", "don't call", "stop calling", "remove me",
    "no thanks", "do not call", "unsubscribe",
  ];

  for (const kw of positiveKw) {
    if (transcriptStr.includes(kw)) positiveSignals.push(kw);
  }
  for (const kw of negativeKw) {
    if (transcriptStr.includes(kw)) negativeSignals.push(kw);
  }

  let suggestedDisposition: DispositionAnalysisResult["suggestedDisposition"] =
    (currentDisposition as any) || "no_answer";
  let shouldOverride = false;
  let confidence = 0.5;
  let reasoning = "Default analysis (no campaign context)";

  // Voicemail detection
  const vmPatterns = ["leave a message", "after the beep", "voicemail", "answering machine", "mailbox"];
  if (vmPatterns.some((p) => transcriptStr.includes(p))) {
    if (currentDisposition !== "voicemail") {
      suggestedDisposition = "voicemail";
      shouldOverride = true;
      confidence = 0.85;
      reasoning = "Voicemail patterns detected in transcript";
    }
  } else if (positiveSignals.length > 0 && negativeSignals.length === 0 && durationSec >= 30) {
    // Positive signals, no negatives, decent duration
    if (currentDisposition === "no_answer" || currentDisposition === "voicemail") {
      suggestedDisposition = "needs_review";
      shouldOverride = true;
      confidence = 0.7;
      reasoning = `Positive signals (${positiveSignals.join(", ")}) detected — needs human review`;
    }
  } else if (negativeSignals.length > 0 && currentDisposition !== "not_interested") {
    suggestedDisposition = "not_interested";
    shouldOverride = true;
    confidence = 0.8;
    reasoning = `Negative signals detected: ${negativeSignals.join(", ")}`;
  }

  return {
    suggestedDisposition,
    confidence,
    reasoning,
    positiveSignals,
    negativeSignals,
    shouldOverride,
    metSuccessIndicators: [],
    missedIndicators: [],
  };
}
