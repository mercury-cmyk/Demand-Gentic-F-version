/**
 * Number Pool Integration Helper
 * 
 * Integrates the number pool router with existing call initiation code.
 * Provides a drop-in replacement for the legacy TELNYX_FROM_NUMBER approach.
 * 
 * Priority order for number selection:
 * 1. Agent's assigned phone number (if set)
 * 2. Number pool routing (if enabled)
 * 3. Legacy TELNYX_FROM_NUMBER fallback
 * 
 * Usage:
 * 1. Replace direct TELNYX_FROM_NUMBER usage with getCallerIdForCall()
 * 2. After call completes, call handleCallCompleted() to update metrics
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { virtualAgents } from "@shared/schema";
import {
  selectNumber,
  releaseNumber,
  recordCallOutcome,
  isNumberPoolEnabled,
  type NumberSelectionRequest,
  type NumberSelectionResult,
  type CallOutcome,
} from './number-pool';
import {
  updateReputationAfterCall,
  checkCooldownTriggers,
  triggerCooldown,
  getNumberByE164,
} from './number-pool';

// ==================== TYPES ====================

export interface NumberPoolConfig {
  enabled: boolean;
  maxCallsPerNumber?: number;
  rotationStrategy?: 'round_robin' | 'reputation_based' | 'region_match';
  cooldownHours?: number;
}

export interface CallerIdRequest {
  campaignId: string;
  virtualAgentId?: string;
  prospectNumber: string;
  prospectRegion?: string;
  prospectTimezone?: string;
  /** Campaign-level number pool configuration */
  numberPoolConfig?: NumberPoolConfig;
  /** Optional call type label for metrics (e.g., ai_calls_initiate, preview_phone_test) */
  callType?: string;
  /** Call engine override — filters numbers by Telnyx connection. Auto-detected from DB if omitted. */
  callEngine?: 'texml' | 'sip';
}

export interface CallerIdResult {
  callerId: string;
  numberId: string | null;
  decisionId: string | null;
  jitterDelayMs: number;
  selectionReason: string;
  isPoolNumber: boolean;
}

export interface CallCompletionData {
  numberId: string | null;
  callSessionId?: string;
  dialerAttemptId?: string;
  answered: boolean;
  durationSec: number;
  disposition: string;
  failed: boolean;
  failureReason?: string;
  prospectNumber: string;
  campaignId?: string;
  sipCode?: number;
  sipReason?: string;
}

// ==================== METRICS ====================

type CallerIdMetricSnapshot = {
  total: number;
  pool: number;
  legacy: number;
  byReason: Record;
  lastLogAt: number;
};

const CALLER_ID_METRICS = new Map();
const CALLER_ID_METRIC_LOG_EVERY = Number(process.env.NUMBER_POOL_METRIC_LOG_EVERY || 50);
const CALLER_ID_METRIC_LOG_INTERVAL_MS = Number(process.env.NUMBER_POOL_METRIC_LOG_INTERVAL_MS || 60000);

function trackCallerIdMetric(callType: string, result: CallerIdResult): void {
  const key = callType || 'unknown';
  const snapshot = CALLER_ID_METRICS.get(key) || {
    total: 0,
    pool: 0,
    legacy: 0,
    byReason: {},
    lastLogAt: 0,
  };

  snapshot.total += 1;
  if (result.isPoolNumber) {
    snapshot.pool += 1;
  } else {
    snapshot.legacy += 1;
  }

  const reasonKey = result.selectionReason || 'unknown';
  snapshot.byReason[reasonKey] = (snapshot.byReason[reasonKey] || 0) + 1;

  const now = Date.now();
  const shouldLogByCount = CALLER_ID_METRIC_LOG_EVERY > 0 && snapshot.total % CALLER_ID_METRIC_LOG_EVERY === 0;
  const shouldLogByTime = now - snapshot.lastLogAt >= CALLER_ID_METRIC_LOG_INTERVAL_MS;

  if (shouldLogByCount || shouldLogByTime) {
    snapshot.lastLogAt = now;
    const topReasons = Object.entries(snapshot.byReason)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => `${reason}:${count}`)
      .join(', ');

    console.log(
      `[NumberPoolMetrics] ${key} total=${snapshot.total} pool=${snapshot.pool} legacy=${snapshot.legacy} reasons=[${topReasons}]`
    );
  }

  CALLER_ID_METRICS.set(key, snapshot);
}

// ==================== MAIN FUNCTIONS ====================

/**
 * Get caller ID for an outbound call.
 * 
 * Priority order:
 * 1. Agent's assigned phone number (virtualAgents.assignedPhoneNumberId)
 * 2. Number pool routing (if enabled)
 * 3. Legacy TELNYX_FROM_NUMBER fallback
 * 
 * @example
 * const { callerId, numberId, jitterDelayMs } = await getCallerIdForCall({
 *   campaignId: session.campaignId,
 *   virtualAgentId: session.virtualAgentId,
 *   prospectNumber: contact.phoneNumber,
 * });
 * 
 * // Apply jitter delay before initiating call
 * if (jitterDelayMs > 0) {
 *   await sleep(jitterDelayMs);
 * }
 * 
 * // Use callerId in Telnyx API call
 * // Store numberId for later metrics update
 */
export async function getCallerIdForCall(
  request: CallerIdRequest
): Promise {
  const callType = request.callType || 'unknown';
  const recordAndReturn = (result: CallerIdResult): CallerIdResult => {
    trackCallerIdMetric(callType, result);
    return result;
  };
  // Check if campaign explicitly disabled number pool rotation
  const campaignPoolConfig = request.numberPoolConfig;
  if (campaignPoolConfig && campaignPoolConfig.enabled === false) {
    console.log(`[NumberPoolIntegration] Campaign has disabled number pool rotation`);
    return recordAndReturn(useLegacyCallerId('campaign_pool_disabled'));
  }

  // PRIORITY 1: Check for agent-assigned phone number
  if (request.virtualAgentId) {
    const agentNumber = await getAgentAssignedNumber(request.virtualAgentId);
    if (agentNumber) {
      console.log(`[NumberPoolIntegration] Using agent-assigned number ${agentNumber.e164} for agent ${request.virtualAgentId}`);
      return recordAndReturn({
        callerId: agentNumber.e164,
        numberId: agentNumber.numberId,
        decisionId: null,
        jitterDelayMs: calculateAgentJitter(agentNumber.numberId),
        selectionReason: 'agent_assigned',
        isPoolNumber: true,
      });
    }
  }

  // PRIORITY 2: Check if number pool is enabled (system-wide)
  if (!isNumberPoolEnabled()) {
    return recordAndReturn(useLegacyCallerId('pool_disabled'));
  }

  try {
    const selection = await selectNumber({
      campaignId: request.campaignId,
      virtualAgentId: request.virtualAgentId,
      prospectNumber: request.prospectNumber,
      prospectRegion: request.prospectRegion,
      prospectTimezone: request.prospectTimezone,
      callEngine: request.callEngine,
    });

    // If we got a pool number
    if (selection.numberId) {
      console.log(`[NumberPoolIntegration] Selected pool number ${selection.numberE164} for ${request.prospectNumber}`);

      return recordAndReturn({
        callerId: selection.numberE164,
        numberId: selection.numberId,
        decisionId: selection.decisionId,
        jitterDelayMs: selection.jitterDelayMs,
        selectionReason: selection.selectionReason,
        isPoolNumber: true,
      });
    }

    // Router returned fallback number
    return recordAndReturn({
      callerId: selection.numberE164,
      numberId: null,
      decisionId: null,
      jitterDelayMs: 0,
      selectionReason: selection.selectionReason,
      isPoolNumber: false,
    });
  } catch (error: any) {
    // Propagate typed errors so the orchestrator can re-queue / pause properly.
    // Never swallow these into a legacy fallback — it bypasses concurrent-call protection.
    if (error?.name === 'NoAvailableNumberError' || error?.name === 'AllNumbersAtHourlyLimitError') {
      console.warn(`[NumberPoolIntegration] Propagating ${error.name} to caller for re-queue/pause`);
      throw error;
    }
    console.error('[NumberPoolIntegration] Selection error:', error);
    if (isNumberPoolEnabled()) {
      // Pool is enabled — don't fall back to untracked legacy number
      throw error;
    }
    return recordAndReturn(useLegacyCallerId('selection_error'));
  }
}

/**
 * Handle call completion - update metrics and check cooldown triggers.
 * 
 * Call this after a call ends (regardless of outcome) to:
 * - Update number usage counters
 * - Record metrics for reputation scoring
 * - Release the number for reuse
 * - Check and trigger cooldowns if thresholds exceeded
 * 
 * @example
 * // In call cleanup handler:
 * await handleCallCompleted({
 *   numberId: session.callerNumberId, // From getCallerIdForCall
 *   callSessionId: session.sessionId,
 *   answered: session.wasAnswered,
 *   durationSec: session.callDuration,
 *   disposition: session.disposition,
 *   failed: session.failed,
 *   prospectNumber: session.toNumber,
 *   campaignId: session.campaignId,
 * });
 */
export async function handleCallCompleted(
  data: CallCompletionData
): Promise {
  // Skip if no pool number was used
  if (!data.numberId) {
    return;
  }

  try {
    // Record the call outcome
    await recordCallOutcome(data.numberId, {
      callSessionId: data.callSessionId,
      dialerAttemptId: data.dialerAttemptId,
      answered: data.answered,
      durationSec: data.durationSec,
      disposition: data.disposition,
      failed: data.failed,
      failureReason: data.failureReason,
      prospectNumber: data.prospectNumber,
      campaignId: data.campaignId,
    });

    // Update reputation incrementally
    await updateReputationAfterCall(data.numberId, {
      answered: data.answered,
      durationSec: data.durationSec,
      isShortCall: data.durationSec > 0 && data.durationSec  0 && data.durationSec  {
  try {
    const [agent] = await db
      .select({
        assignedPhoneNumberId: virtualAgents.assignedPhoneNumberId,
      })
      .from(virtualAgents)
      .where(eq(virtualAgents.id, virtualAgentId))
      .limit(1);

    if (!agent?.assignedPhoneNumberId) {
      return null;
    }

    // Get the phone number details from telnyx_numbers table
    const { telnyxNumbers } = await import("@shared/number-pool-schema");
    const [number] = await db
      .select({
        id: telnyxNumbers.id,
        phoneNumberE164: telnyxNumbers.phoneNumberE164,
        status: telnyxNumbers.status,
      })
      .from(telnyxNumbers)
      .where(eq(telnyxNumbers.id, agent.assignedPhoneNumberId))
      .limit(1);

    if (!number || number.status !== 'active') {
      console.warn(`[NumberPoolIntegration] Agent ${virtualAgentId} has assigned number ${agent.assignedPhoneNumberId} but it's not active`);
      return null;
    }

    return {
      numberId: number.id,
      e164: number.phoneNumberE164,
    };
  } catch (error) {
    console.error(`[NumberPoolIntegration] Error getting agent assigned number:`, error);
    return null;
  }
}

/**
 * Calculate jitter for agent-assigned numbers — minimal since limits removed.
 */
function calculateAgentJitter(_numberId: string): number {
  // Minimal jitter — the 30s gap is enforced by releaseNumber()
  return 500 + Math.random() * 1000;
}

/**
 * Assign a phone number to an agent
 */
export async function assignNumberToAgent(
  virtualAgentId: string,
  phoneNumberId: string
): Promise {
  await db
    .update(virtualAgents)
    .set({
      assignedPhoneNumberId: phoneNumberId,
      updatedAt: new Date(),
    })
    .where(eq(virtualAgents.id, virtualAgentId));

  console.log(`[NumberPoolIntegration] Assigned number ${phoneNumberId} to agent ${virtualAgentId}`);
}

/**
 * Remove phone number assignment from an agent
 */
export async function unassignNumberFromAgent(
  virtualAgentId: string
): Promise {
  await db
    .update(virtualAgents)
    .set({
      assignedPhoneNumberId: null,
      updatedAt: new Date(),
    })
    .where(eq(virtualAgents.id, virtualAgentId));

  console.log(`[NumberPoolIntegration] Unassigned number from agent ${virtualAgentId}`);
}

/**
 * Get agents with their assigned phone numbers
 */
export async function getAgentsWithNumbers(): Promise {
  const { telnyxNumbers } = await import("@shared/number-pool-schema");
  
  const results = await db
    .select({
      agentId: virtualAgents.id,
      agentName: virtualAgents.name,
      assignedPhoneNumberId: virtualAgents.assignedPhoneNumberId,
      phoneNumberE164: telnyxNumbers.phoneNumberE164,
    })
    .from(virtualAgents)
    .leftJoin(telnyxNumbers, eq(virtualAgents.assignedPhoneNumberId, telnyxNumbers.id))
    .where(eq(virtualAgents.isActive, true));

  return results;
}

/**
 * Sleep utility for jitter delays
 */
export function sleep(ms: number): Promise {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== VOICE DIALER INTEGRATION POINTS ====================

/**
 * Helper to build voice template values with caller ID from pool.
 * Use this as a drop-in for the existing buildVoiceTemplateValues pattern.
 */
export function buildVoiceTemplateValuesWithPoolNumber(params: {
  baseValues: Record;
  contactInfo: any;
  callerId: string;
  calledNumber?: string | null;
  orgName?: string;
}): Record {
  return {
    ...params.baseValues,
    // Standard voice variables
    contactFirstName: params.contactInfo?.firstName || 'there',
    contactLastName: params.contactInfo?.lastName || '',
    contactFullName: [params.contactInfo?.firstName, params.contactInfo?.lastName].filter(Boolean).join(' ') || 'there',
    contactCompany: params.contactInfo?.company || params.contactInfo?.companyName || '',
    contactTitle: params.contactInfo?.title || params.contactInfo?.jobTitle || '',
    contactPhone: params.contactInfo?.phoneNumber || params.calledNumber || '',
    contactEmail: params.contactInfo?.email || '',
    // Caller info (using pool number instead of env var)
    callerId: params.callerId,
    callerNumber: params.callerId,
    // Organization
    orgName: params.orgName || '',
    organizationName: params.orgName || '',
  };
}

// ==================== EXPORTS ====================

export default {
  getCallerIdForCall,
  handleCallCompleted,
  releaseNumberWithoutOutcome,
  assignNumberToAgent,
  unassignNumberFromAgent,
  getAgentsWithNumbers,
  sleep,
  buildVoiceTemplateValuesWithPoolNumber,
};