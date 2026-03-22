/**
 * Feedback Processor Service
 * Processes call outcomes into structured learning records
 * Updates title mapping confidence and triggers score refresh
 */

import { db } from '../../../db';
import {
  callOutcomeLearnings,
  jobTitleMappings,
  contactPredictiveScores,
  contactIntelligence,
  contacts,
  accounts,
} from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import type {
  CallOutcomeLearningInput,
} from '../types';
import { mapTitle } from '../mapping/title-mapping-service';
import { classifyIndustry } from '../mapping/industry-mapping-service';

/**
 * Record a call outcome for learning
 */
export async function recordLearningOutcome(
  input: CallOutcomeLearningInput
): Promise {
  // Enrich with role and industry IDs if not provided
  let contactRoleId = input.contactRoleId;
  let industryId = input.industryId;

  if (!contactRoleId || !industryId) {
    const enrichment = await enrichOutcomeData(input.contactId, input.accountId);
    contactRoleId = contactRoleId || enrichment.roleId;
    industryId = industryId || enrichment.industryId;
  }

  // Insert learning record
  await db.insert(callOutcomeLearnings).values({
    callSessionId: input.callSessionId,
    campaignId: input.campaignId,
    contactId: input.contactId,
    accountId: input.accountId,
    outcomeCode: input.outcomeCode,
    outcomeCategory: input.outcomeCategory,
    outcomeQualityScore: input.outcomeQualityScore?.toFixed(4) || null,
    engagementSignals: input.engagementSignals,
    objectionSignals: input.objectionSignals || {},
    qualificationSignals: input.qualificationSignals || {},
    conversationQualitySignals: input.conversationQualitySignals || {},
    roleSignals: input.roleSignals || {},
    industrySignals: input.industrySignals || {},
    messagingSignals: input.messagingSignals || {},
    contactRoleId,
    industryId,
    problemIds: input.problemIds || [],
    messagingAngleUsed: input.messagingAngleUsed || null,
    approachUsed: input.approachUsed || null,
    valuePropsPresented: input.valuePropsPresented || [],
    adjustmentsApplied: input.adjustmentsApplied || {},
    callDurationSeconds: input.callDurationSeconds || null,
    talkRatio: input.talkRatio?.toFixed(4) || null,
    callTimestamp: input.callTimestamp,
    processedForLearning: false,
  });
}

/**
 * Process a call outcome for SMI learning updates
 * Called after recording to update related SMI data
 */
export async function processCallOutcomeForSMI(
  input: CallOutcomeLearningInput
): Promise {
  // 1. Update title mapping confidence
  if (input.roleSignals?.roleMatchConfidence !== undefined) {
    await updateTitleMappingFromOutcome(
      input.contactId,
      input.roleSignals.roleMatchConfidence,
      input.roleSignals.decisionAuthorityConfirmed
    );
  }

  // 2. Update contact intelligence based on outcome
  await updateContactIntelligenceFromOutcome(input);

  // 3. Mark predictive scores as stale if significant outcome
  if (isSignificantOutcome(input)) {
    await invalidatePredictiveScores(input.contactId, input.campaignId);
  }

  // 4. Mark learning record as processed
  await db
    .update(callOutcomeLearnings)
    .set({
      processedForLearning: true,
      processedAt: new Date(),
    })
    .where(eq(callOutcomeLearnings.callSessionId, input.callSessionId));
}

/**
 * Enrich outcome data with role and industry IDs
 */
async function enrichOutcomeData(
  contactId?: string,
  accountId?: string
): Promise {
  let roleId: number | null = null;
  let industryId: number | null = null;

  // Get contact data
  if (contactId) {
    const contact = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    if (contact.length > 0 && contact[0].jobTitle) {
      const mapping = await mapTitle(contact[0].jobTitle);
      roleId = mapping.normalizedRole?.id || null;
    }
  }

  // Get account data
  if (accountId) {
    const account = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (account.length > 0 && account[0].industryStandardized) {
      const classification = await classifyIndustry({
        rawIndustry: account[0].industryStandardized,
      });
      industryId = classification.industryId || null;
    }
  }

  return { roleId, industryId };
}

/**
 * Update title mapping confidence based on outcome
 */
async function updateTitleMappingFromOutcome(
  contactId: string,
  roleMatchConfidence: number,
  decisionAuthorityConfirmed?: boolean
): Promise {
  // Get contact's job title
  const contact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (contact.length === 0 || !contact[0].jobTitle) return;

  const normalizedTitle = contact[0].jobTitle.toLowerCase().trim();

  // Find existing mapping
  const mapping = await db
    .select()
    .from(jobTitleMappings)
    .where(eq(jobTitleMappings.rawTitleNormalized, normalizedTitle))
    .limit(1);

  if (mapping.length === 0) return;

  // Adjust confidence based on outcome
  // If role match was confirmed, increase confidence
  // If role match was incorrect, decrease confidence
  const currentConfidence = parseFloat(mapping[0].confidence as string);
  const confidenceAdjustment = roleMatchConfidence > 0.7 ? 0.02 : roleMatchConfidence  {
  if (!input.contactId) return;

  // Get existing intelligence
  const existing = await db
    .select()
    .from(contactIntelligence)
    .where(eq(contactIntelligence.contactId, input.contactId))
    .limit(1);

  if (existing.length === 0) return;

  const updates: Record = {
    updatedAt: new Date(),
  };

  // Update objection history
  if (input.objectionSignals?.objectionType) {
    const currentHistory = (existing[0].objectionHistory as string[]) || [];
    if (!currentHistory.includes(input.objectionSignals.objectionType)) {
      updates.objectionHistory = [...currentHistory, input.objectionSignals.objectionType].slice(-10);
    }
  }

  // Update interest signals
  if (input.engagementSignals.interestLevel > 0.7) {
    const currentSignals = (existing[0].interestSignals as string[]) || [];
    const newSignal = `High interest on ${new Date().toISOString().split('T')[0]}`;
    updates.interestSignals = [...currentSignals, newSignal].slice(-5);
  }

  // Adjust propensity scores based on outcome
  if (input.outcomeCategory === 'positive') {
    const currentEngagement = parseFloat(existing[0].engagementPropensity as string) || 0.5;
    updates.engagementPropensity = Math.min(0.95, currentEngagement + 0.05).toFixed(4);
  } else if (input.outcomeCategory === 'negative') {
    const currentEngagement = parseFloat(existing[0].engagementPropensity as string) || 0.5;
    updates.engagementPropensity = Math.max(0.1, currentEngagement - 0.05).toFixed(4);
  }

  // Update engagement history summary
  const historySummary = (existing[0].engagementHistorySummary as any) || {};
  updates.engagementHistorySummary = {
    ...historySummary,
    totalInteractions: (historySummary.totalInteractions || 0) + 1,
    lastInteractionDate: input.callTimestamp,
    avgEngagementScore: calculateNewAvgEngagement(
      historySummary.avgEngagementScore,
      historySummary.totalInteractions,
      input.engagementSignals.interestLevel
    ),
  };

  await db
    .update(contactIntelligence)
    .set(updates)
    .where(eq(contactIntelligence.contactId, input.contactId));
}

/**
 * Calculate new average engagement score
 */
function calculateNewAvgEngagement(
  currentAvg: number | undefined,
  currentCount: number | undefined,
  newScore: number
): number {
  const avg = currentAvg || 0.5;
  const count = currentCount || 0;
  return (avg * count + newScore) / (count + 1);
}

/**
 * Check if outcome is significant enough to trigger updates
 */
function isSignificantOutcome(input: CallOutcomeLearningInput): boolean {
  // Significant if:
  // - Positive outcome (qualified lead)
  // - Strong negative outcome (DNC, not interested)
  // - High engagement level
  // - Role confirmation

  if (input.outcomeCode === 'qualified_lead') return true;
  if (input.outcomeCode === 'do_not_call') return true;
  if (input.outcomeCode === 'not_interested') return true;
  if (input.engagementSignals.interestLevel > 0.8) return true;
  if (input.engagementSignals.interestLevel  {
  if (!contactId) return;

  const conditions = [eq(contactPredictiveScores.contactId, contactId)];
  if (campaignId) {
    conditions.push(eq(contactPredictiveScores.campaignId, campaignId));
  }

  await db
    .update(contactPredictiveScores)
    .set({ isStale: true, updatedAt: new Date() })
    .where(and(...conditions));
}

/**
 * Batch process unprocessed learning records
 */
export async function batchProcessLearningRecords(limit: number = 100): Promise {
  const unprocessed = await db
    .select()
    .from(callOutcomeLearnings)
    .where(eq(callOutcomeLearnings.processedForLearning, false))
    .limit(limit);

  let processed = 0;

  for (const record of unprocessed) {
    try {
      await processCallOutcomeForSMI({
        callSessionId: record.callSessionId,
        campaignId: record.campaignId || '',
        contactId: record.contactId || '',
        accountId: record.accountId || '',
        outcomeCode: record.outcomeCode,
        outcomeCategory: record.outcomeCategory as any,
        outcomeQualityScore: record.outcomeQualityScore ? parseFloat(record.outcomeQualityScore as string) : undefined,
        engagementSignals: (record.engagementSignals as any) || { sentiment: 'neutral', interestLevel: 0.5, timePressure: 'none', attentiveness: 'medium', questionCount: 0 },
        objectionSignals: (record.objectionSignals as any) || undefined,
        qualificationSignals: (record.qualificationSignals as any) || undefined,
        conversationQualitySignals: (record.conversationQualitySignals as any) || undefined,
        roleSignals: (record.roleSignals as any) || undefined,
        industrySignals: (record.industrySignals as any) || undefined,
        messagingSignals: (record.messagingSignals as any) || undefined,
        contactRoleId: record.contactRoleId || undefined,
        industryId: record.industryId || undefined,
        problemIds: record.problemIds || undefined,
        messagingAngleUsed: record.messagingAngleUsed || undefined,
        approachUsed: (record.approachUsed as any) || undefined,
        valuePropsPresented: record.valuePropsPresented || undefined,
        adjustmentsApplied: (record.adjustmentsApplied as any) || undefined,
        callDurationSeconds: record.callDurationSeconds || undefined,
        talkRatio: record.talkRatio ? parseFloat(record.talkRatio as string) : undefined,
        callTimestamp: record.callTimestamp,
      });
      processed++;
    } catch (error) {
      console.error(`[FeedbackProcessor] Error processing record ${record.id}:`, error);
    }
  }

  return processed;
}

/**
 * Feedback Processor class for dependency injection
 */
export class FeedbackProcessor {
  async recordOutcome(input: CallOutcomeLearningInput): Promise {
    return recordLearningOutcome(input);
  }

  async processForSMI(input: CallOutcomeLearningInput): Promise {
    return processCallOutcomeForSMI(input);
  }

  async batchProcess(limit?: number): Promise {
    return batchProcessLearningRecords(limit);
  }
}