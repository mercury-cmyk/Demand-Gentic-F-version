/**
 * Active Call Tracker
 * 
 * Centralized tracking of active calls to prevent duplicate attempts to the same prospect.
 * Used by both TelnyxAiBridge and SIP dialer paths.
 * 
 * Rules:
 * - Only 1 active call per prospect phone number at a time
 * - Calls are tracked from initiation to completion/error
 * - Automatic cleanup on call end
 */

import { normalizeToE164 } from '../lib/phone-utils';

// ==================== TYPES ====================

interface ActiveCall {
  prospectNumber: string;  // E.164 normalized
  callerNumber: string;    // E.164 normalized (from number)
  callPath: 'telnyx' | 'sip';
  startedAt: Date;
  callId?: string;
  campaignId?: string;
  queueItemId?: string;
}

// ==================== STATE ====================

// Track active calls by prospect number (E.164)
const activeProspectCalls = new Map<string, ActiveCall>();

// Track active caller numbers (from numbers) - 1 call per caller number
const activeCallerNumbers = new Set<string>();

// ==================== PUBLIC API ====================

/**
 * Check if a prospect number is currently being called
 */
export function isProspectBusy(prospectNumber: string): boolean {
  const normalized = normalizeToE164(prospectNumber);
  return activeProspectCalls.has(normalized);
}

/**
 * Check if a caller number (from number) is currently in use
 */
export function isCallerNumberBusy(callerNumber: string): boolean {
  const normalized = normalizeToE164(callerNumber);
  return activeCallerNumbers.has(normalized);
}

/**
 * Acquire a lock for calling a prospect
 * Returns true if lock acquired, false if prospect is already being called
 */
export function acquireProspectLock(params: {
  prospectNumber: string;
  callerNumber: string;
  callPath: 'telnyx' | 'sip';
  callId?: string;
  campaignId?: string;
  queueItemId?: string;
}): { success: boolean; reason?: string } {
  const normalizedProspect = normalizeToE164(params.prospectNumber);
  const normalizedCaller = normalizeToE164(params.callerNumber);

  // Check if prospect is already being called
  if (activeProspectCalls.has(normalizedProspect)) {
    const existing = activeProspectCalls.get(normalizedProspect)!;
    console.log(`[ActiveCallTracker] 🚫 BLOCKED: Prospect ${normalizedProspect} already has active call from ${existing.callerNumber} (${existing.callPath})`);
    return { 
      success: false, 
      reason: `Prospect already has active call (started ${existing.startedAt.toISOString()})` 
    };
  }

  // Check if caller number is already in use (prevents same from-number calling multiple prospects)
  if (activeCallerNumbers.has(normalizedCaller)) {
    console.log(`[ActiveCallTracker] 🚫 BLOCKED: Caller ${normalizedCaller} already has an active call`);
    return { 
      success: false, 
      reason: `Caller number already in use for another call` 
    };
  }

  // Acquire locks
  activeProspectCalls.set(normalizedProspect, {
    prospectNumber: normalizedProspect,
    callerNumber: normalizedCaller,
    callPath: params.callPath,
    startedAt: new Date(),
    callId: params.callId,
    campaignId: params.campaignId,
    queueItemId: params.queueItemId,
  });
  activeCallerNumbers.add(normalizedCaller);

  console.log(`[ActiveCallTracker] 🔒 Locked: prospect=${normalizedProspect}, caller=${normalizedCaller}, path=${params.callPath}`);
  console.log(`[ActiveCallTracker] Active: ${activeProspectCalls.size} prospects, ${activeCallerNumbers.size} callers`);

  return { success: true };
}

/**
 * Release the lock for a prospect call
 * Should be called when call ends (success or failure)
 */
export function releaseProspectLock(prospectNumber: string, reason: string = 'call_ended'): void {
  const normalized = normalizeToE164(prospectNumber);
  const call = activeProspectCalls.get(normalized);

  if (!call) {
    console.log(`[ActiveCallTracker] ⚠️ Tried to release non-existent lock for ${normalized}`);
    return;
  }

  // Release both locks
  activeProspectCalls.delete(normalized);
  activeCallerNumbers.delete(call.callerNumber);

  const durationMs = Date.now() - call.startedAt.getTime();
  console.log(`[ActiveCallTracker] 🔓 Released: prospect=${normalized}, caller=${call.callerNumber}, duration=${Math.round(durationMs/1000)}s, reason=${reason}`);
  console.log(`[ActiveCallTracker] Active: ${activeProspectCalls.size} prospects, ${activeCallerNumbers.size} callers`);
}

/**
 * Release lock by caller number (when we don't have prospect number)
 */
export function releaseCallerLock(callerNumber: string, reason: string = 'call_ended'): void {
  const normalized = normalizeToE164(callerNumber);
  
  // Find and remove the prospect entry that has this caller
  for (const [prospectNum, call] of activeProspectCalls) {
    if (call.callerNumber === normalized) {
      activeProspectCalls.delete(prospectNum);
      activeCallerNumbers.delete(normalized);
      console.log(`[ActiveCallTracker] 🔓 Released by caller: prospect=${prospectNum}, caller=${normalized}, reason=${reason}`);
      console.log(`[ActiveCallTracker] Active: ${activeProspectCalls.size} prospects, ${activeCallerNumbers.size} callers`);
      return;
    }
  }

  // If only caller number was in set (shouldn't happen normally)
  if (activeCallerNumbers.has(normalized)) {
    activeCallerNumbers.delete(normalized);
    console.log(`[ActiveCallTracker] 🔓 Released orphan caller: ${normalized}, reason=${reason}`);
  }
}

/**
 * Get current status of active calls
 */
export function getActiveCallStatus(): {
  activeProspects: number;
  activeCallers: number;
  calls: Array<{
    prospect: string;
    caller: string;
    path: string;
    durationSec: number;
  }>;
} {
  const now = Date.now();
  const calls = Array.from(activeProspectCalls.values()).map(call => ({
    prospect: call.prospectNumber,
    caller: call.callerNumber,
    path: call.callPath,
    durationSec: Math.round((now - call.startedAt.getTime()) / 1000),
  }));

  return {
    activeProspects: activeProspectCalls.size,
    activeCallers: activeCallerNumbers.size,
    calls,
  };
}

/**
 * Force cleanup of stale locks (e.g., after crash recovery)
 * Removes locks older than maxAgeMinutes
 */
export function cleanupStaleLocks(maxAgeMinutes: number = 30): number {
  const cutoff = Date.now() - (maxAgeMinutes * 60 * 1000);
  let cleaned = 0;

  for (const [prospectNum, call] of activeProspectCalls) {
    if (call.startedAt.getTime() < cutoff) {
      activeProspectCalls.delete(prospectNum);
      activeCallerNumbers.delete(call.callerNumber);
      cleaned++;
      console.log(`[ActiveCallTracker] 🧹 Cleaned stale lock: ${prospectNum} (${Math.round((Date.now() - call.startedAt.getTime()) / 60000)}min old)`);
    }
  }

  if (cleaned > 0) {
    console.log(`[ActiveCallTracker] 🧹 Cleaned ${cleaned} stale locks`);
  }

  return cleaned;
}
