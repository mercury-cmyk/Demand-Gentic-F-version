/**
 * Telnyx AI Bridge - PSTN to Gemini Live Integration
 *
 * Routes all AI voice calls through Google Gemini Live exclusively.
 * OpenAI Realtime is completely disabled.
 *
 * Architecture:
 * - Telnyx handles PSTN connectivity (inbound/outbound calls)
 * - Gemini Live handles AI conversation (voice understanding + generation)
 * - Telnyx handles transcription via their direct API
 *
 * All calls flow: PSTN -> Telnyx -> Gemini Live -> Telnyx -> PSTN
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import { AiVoiceAgent, AiAgentSettings, CallContext, createAiVoiceAgent } from "./ai-voice-agent";
import { storage } from "../storage";
import { uploadToS3, getPresignedDownloadUrl } from "../lib/storage";
import { preflightVoiceVariableContract, VoiceVariablePreflightError } from "./voice-variable-contract";
import { db } from "../db";
import { dialerCallAttempts, contacts, accounts, leads } from "@shared/schema";
import { eq } from "drizzle-orm";
// Use dynamic import to avoid async module initialization issue with voice-dialer
// import { setAmdResultForSession } from "./voice-dialer";
import { synthesizeSpeechRateLimited } from "./tts-rate-limiter";
import { normalizeToE164, isValidE164 } from "../lib/phone-utils";
import { processDisposition, createFallbackLead } from "./disposition-engine";
import { getGoogleVoiceConfig } from "./voice-constants";
import { handleCallCompleted } from "./number-pool-integration";
import { logger } from "./production-logger";


export interface TelnyxCallEvent {
  event_type: string;
  data: {
    call_control_id: string;
    call_leg_id: string;
    call_session_id: string;
    connection_id: string;
    from: string;
    to: string;
    direction: string;
    state: string;
    media_url?: string;
  };
}

export interface ActiveAiCall {
  callControlId: string;
  callSessionId: string;
  agent: AiVoiceAgent;
  mediaWs: WebSocket | null;
  campaignId: string;
  queueItemId: string;
  callAttemptId?: string;
  dialedNumber?: string;
  fromNumber?: string;
  callerNumberId?: string | null;
  callerNumberDecisionId?: string | null;
  telephonyProviderId?: string | null;
  telephonyProviderType?: string | null;
  telephonyProviderName?: string | null;
  telephonyRoutingMode?: string | null;
  telephonySelectionReason?: string | null;
  telephonyCostPerMinute?: number | null;
  telephonyCostPerCall?: number | null;
  telephonyCurrency?: string | null;
  telephonyApiKey?: string | null;
  startTime: Date;
  disposition?: string;
  isAnswered?: boolean;
  hasEnded?: boolean; // Prevent duplicate hangup processing
  slotReleased?: boolean; // Prevent double semaphore release
  amdResult?: string;
  amdConfidence?: number;
  hasActiveWebSocket?: boolean; // Track if voice-dialer has an active WebSocket connection
  hardStopTimer?: ReturnType<typeof setTimeout> | null;
  enforcedMaxDurationSeconds?: number;
}

const GLOBAL_MAX_CALL_DURATION_SECONDS = 300;
const PRE_ANSWER_MAX_SECONDS = 60;

export interface QueuedCall {
  phoneNumber: string;
  fromNumber: string;
  settings: AiAgentSettings;
  context: CallContext;
  queuedAt: Date;
  resolve: (result: { callId: string; callControlId: string }) => void;
  reject: (error: Error) => void;
}

export interface CallMetrics {
  totalCalls: number;
  fastCalls: number; // Calls under 20 seconds
  avgDuration: number;
  fastCallPercentage: number;
  peakConcurrent: number;
}

// Simple async semaphore for concurrency control
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      next?.();
    } else {
      this.permits++;
    }
  }

  get available(): number {
    return this.permits;
  }

  get queueLength(): number {
    return this.waiting.length;
  }
}

export class TelnyxAiBridge extends EventEmitter {
  private activeCalls: Map<string, ActiveAiCall> = new Map();
  private telnyxApiKey: string;
  private webhookUrl: string;
  
  // Track client_state by call_control_id for AMD webhook lookups
  // AMD webhook fires before WebSocket connection, so we need to track state separately
  private callStateByControlId: Map<string, any> = new Map();
  
  // Concurrency control - global guard to keep outbound channels under Telnyx limits
  private readonly MAX_CONCURRENT_CALLS: number;
  private semaphore: Semaphore;
  private callQueue: QueuedCall[] = [];
  
  // Per-number call tracking - ensures only 1 active call per phone number
  // This prevents calling the same number concurrently (important for call quality and compliance)
  private activePhoneNumbers: Set<string> = new Set();
  
  // Call metrics tracking
  private callDurations: number[] = [];
  private peakConcurrent: number = 0;
  private readonly METRICS_WINDOW = 100; // Keep last 100 calls for metrics
  
  // Carrier failure retry tracking (per Telnyx support Feb 2026)
  // Sub-500ms failures with no media are carrier/routing issues, not codec problems.
  // Track per-destination to avoid infinite retries.
  private carrierFailureCounts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private readonly MAX_CARRIER_RETRIES = 2; // Max retries per destination per hour
  private readonly CARRIER_RETRY_WINDOW_MS = 3600_000; // 1 hour window
  
  // Audio cache for legacy TTS audio files (temporary storage)
  private audioCache: Map<string, { buffer: Buffer; createdAt: number }> = new Map();

  // Periodic cleanup interval reference
  private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.telnyxApiKey = process.env.TELNYX_API_KEY || "";
    this.webhookUrl = (process.env.TELNYX_WEBHOOK_URL || "").trim();

    // Allow overriding via env; enforce minimum of 1 to avoid deadlock
    // Default: 50 concurrent calls (up from 8) to support higher throughput
    const configuredMax = Number(process.env.TELNYX_MAX_CONCURRENT_CALLS || 50);
    this.MAX_CONCURRENT_CALLS = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 50;
    this.semaphore = new Semaphore(this.MAX_CONCURRENT_CALLS);

    // PERIODIC CLEANUP: Prevent memory leaks from stale Map entries
    this._cleanupInterval = setInterval(() => this.cleanupStaleMaps(), 5 * 60 * 1000); // Every 5 minutes

    // CARRIER FAILURE RETRY HANDLER (per Telnyx support Feb 2026)
    // Sub-500ms call failures with no media exchange are carrier/routing issues.
    // These are common for international destinations (UAE, etc.).
    // Strategy: re-queue the item so the orchestrator retries with a different
    // fromNumber or after a short delay, giving carrier routes time to recover.
    this.on("call:carrier_failure", async (event: {
      callId: string;
      durationMs: number;
      destination: string;
      isInternational: boolean;
      fromNumber?: string;
      campaignId?: string;
      queueItemId?: string;
    }) => {
      await this.handleCarrierFailureRetry(event);
    });
  }

  private async telnyxFetch(url: string, init: RequestInit = {}, apiKeyOverride?: string): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${apiKeyOverride || this.telnyxApiKey}`);
    }

    // Note: the standard RequestInit type doesn't include undici's dispatcher; omit for TS compatibility
    return fetch(url, {
      ...init,
      headers,
    });
  }

  private getApiKeyForCall(callControlId?: string | null): string {
    if (!callControlId) {
      return this.telnyxApiKey;
    }

    const activeCall = this.findCallByControlId(callControlId);
    return activeCall?.telephonyApiKey || this.telnyxApiKey;
  }
  
  // Format phone number to E.164 format (required by Telnyx)
  private formatToE164(phoneNumber: string): string {
    const formatted = normalizeToE164(phoneNumber);

    if (!isValidE164(formatted)) {
      console.error(`[TelnyxAiBridge] Invalid E.164 phone after normalization: ${phoneNumber} -> ${formatted}`);
      throw new Error(`invalid_phone_e164:${phoneNumber}`);
    }

    logger.debug(`[TelnyxAiBridge] Formatted phone: ${phoneNumber} -> ${formatted}`);
    return formatted;
  }
  
  // Get client state for a call by control ID (for AMD webhook processing)
  getClientStateByControlId(callControlId: string): any | null {
    return this.callStateByControlId.get(callControlId) || null;
  }
  
  // Get cached audio by ID (for serving to Telnyx)
  getAudio(audioId: string): Buffer | undefined {
    const entry = this.audioCache.get(audioId);
    return entry?.buffer;
  }

  // Cache audio with timestamp for TTL-based cleanup
  setAudio(audioId: string, buffer: Buffer): void {
    this.audioCache.set(audioId, { buffer, createdAt: Date.now() });
  }

  /**
   * Periodic cleanup of stale Map entries to prevent memory leaks.
   * - callStateByControlId: Remove entries for calls no longer in activeCalls
   * - audioCache: Remove entries older than 30 minutes
   * - carrierFailureCounts: Remove entries older than the retry window
   */
  private cleanupStaleMaps(): void {
    const now = Date.now();
    const activeControlIds = new Set<string>();
    for (const call of this.activeCalls.values()) {
      activeControlIds.add(call.callControlId);
    }

    // Clean callStateByControlId - remove entries for ended calls
    let cleanedCallState = 0;
    for (const controlId of this.callStateByControlId.keys()) {
      if (!activeControlIds.has(controlId)) {
        this.callStateByControlId.delete(controlId);
        cleanedCallState++;
      }
    }

    // Clean audioCache - remove entries older than 30 minutes
    let cleanedAudio = 0;
    const AUDIO_TTL_MS = 30 * 60 * 1000;
    for (const [id, entry] of this.audioCache.entries()) {
      if (now - entry.createdAt > AUDIO_TTL_MS) {
        this.audioCache.delete(id);
        cleanedAudio++;
      }
    }

    // Clean carrierFailureCounts - remove entries outside retry window
    let cleanedCarrier = 0;
    for (const [dest, data] of this.carrierFailureCounts.entries()) {
      if (now - data.lastAttempt > this.CARRIER_RETRY_WINDOW_MS) {
        this.carrierFailureCounts.delete(dest);
        cleanedCarrier++;
      }
    }

    if (cleanedCallState > 0 || cleanedAudio > 0 || cleanedCarrier > 0) {
      console.log(`[TelnyxAiBridge] 🧹 Cleanup: removed ${cleanedCallState} stale callState, ${cleanedAudio} expired audio, ${cleanedCarrier} expired carrier entries. Remaining: callState=${this.callStateByControlId.size}, audio=${this.audioCache.size}, carrier=${this.carrierFailureCounts.size}`);
    }
  }

  // Get current metrics
  getMetrics(): CallMetrics {
    const totalCalls = this.callDurations.length;
    const fastCalls = this.callDurations.filter(d => d < 20000).length;
    const avgDuration = totalCalls > 0 
      ? this.callDurations.reduce((a, b) => a + b, 0) / totalCalls 
      : 0;
    
    return {
      totalCalls,
      fastCalls,
      avgDuration: Math.round(avgDuration / 1000), // in seconds
      fastCallPercentage: totalCalls > 0 ? Math.round((fastCalls / totalCalls) * 100) : 0,
      peakConcurrent: this.peakConcurrent,
    };
  }

  // Track call duration for metrics
  private trackCallDuration(durationMs: number): void {
    this.callDurations.push(durationMs);
    // Keep only last N calls
    if (this.callDurations.length > this.METRICS_WINDOW) {
      this.callDurations.shift();
    }
    
    // Log warning if fast call ratio drops below 35%
    const metrics = this.getMetrics();
    if (metrics.totalCalls >= 10 && metrics.fastCallPercentage < 35) {
      console.warn(`[TelnyxAiBridge] ⚠️ Fast call ratio (${metrics.fastCallPercentage}%) is below 35% target`);
    }
  }

  /**
   * Handle carrier failure retry for sub-500ms international call failures.
   *
   * Per Telnyx support (Feb 2026): these failures indicate routing or carrier
   * compatibility issues rather than codec problems. Strategy:
   * 1. Check retry budget (max 2 retries per destination per hour)
   * 2. Re-queue the campaign_queue item with a short delay so the orchestrator
   *    picks it up again (potentially with a different fromNumber / carrier route)
   * 3. Log detailed diagnostics for Telnyx support investigation
   */
  private async handleCarrierFailureRetry(event: {
    callId: string;
    durationMs: number;
    destination: string;
    isInternational: boolean;
    fromNumber?: string;
    campaignId?: string;
    queueItemId?: string;
  }): Promise<void> {
    const { callId, durationMs, destination, isInternational, fromNumber, campaignId, queueItemId } = event;

    // Check retry budget
    const now = Date.now();
    const existing = this.carrierFailureCounts.get(destination);
    if (existing && (now - existing.lastAttempt) < this.CARRIER_RETRY_WINDOW_MS) {
      if (existing.count >= this.MAX_CARRIER_RETRIES) {
        console.error(`[TelnyxAiBridge] 🚫 CARRIER RETRY BUDGET EXHAUSTED for ${destination}: ${existing.count} failures in the last hour. Skipping retry. Contact Telnyx support for route investigation.`);
        return;
      }
      existing.count++;
      existing.lastAttempt = now;
    } else {
      this.carrierFailureCounts.set(destination, { count: 1, lastAttempt: now });
    }

    const retryCount = this.carrierFailureCounts.get(destination)!.count;
    console.log(`[TelnyxAiBridge] 🔄 CARRIER FAILURE RETRY ${retryCount}/${this.MAX_CARRIER_RETRIES} for ${destination} (call ${callId}, ${durationMs}ms, from: ${fromNumber || 'unknown'}, international: ${isInternational})`);

    // Re-queue the campaign_queue item if we have the identifiers
    if (queueItemId) {
      try {
        const { db } = await import('../db');
        const { sql } = await import('drizzle-orm');
        // Set next_attempt_at to 30s in the future to give carrier routes time to recover
        // Also rotate the fromNumber by clearing any caller-number affinity
        await db.execute(sql`
          UPDATE campaign_queue
          SET status = 'queued',
              next_attempt_at = NOW() + INTERVAL '30 seconds',
              updated_at = NOW(),
              enqueued_reason = COALESCE(enqueued_reason, '') || '|carrier_retry_' || ${String(retryCount)} || ':' || to_char(NOW(), 'HH24:MI:SS')
          WHERE id = ${queueItemId}
        `);
        console.log(`[TelnyxAiBridge] ✅ Re-queued ${queueItemId} for carrier retry in 30s (attempt ${retryCount})`);
      } catch (dbErr) {
        console.error(`[TelnyxAiBridge] Failed to re-queue ${queueItemId} for carrier retry:`, dbErr);
      }
    } else {
      console.warn(`[TelnyxAiBridge] Cannot re-queue carrier failure — no queueItemId for call ${callId}`);
    }
  }

  // Update peak concurrent tracking
  private updatePeakConcurrent(): void {
    const current = this.activeCalls.size;
    if (current > this.peakConcurrent) {
      this.peakConcurrent = current;
    }
  }

  // Get queue status including per-number tracking
  getQueueStatus(): { activeCalls: number; queuedCalls: number; availableSlots: number; activeNumbers: number; maxConcurrent: number } {
    return {
      activeCalls: this.activeCalls.size,
      queuedCalls: this.semaphore.queueLength,
      availableSlots: this.semaphore.available,
      activeNumbers: this.activePhoneNumbers.size,
      maxConcurrent: this.MAX_CONCURRENT_CALLS,
    };
  }
  
  // Check if a phone number is currently busy (has an active call)
  isNumberBusy(phoneNumber: string): boolean {
    const normalized = this.formatToE164(phoneNumber);
    return this.activePhoneNumbers.has(normalized);
  }

  // Safely release a semaphore slot for a call (prevents double-release)
  // Also releases the phone number from per-number tracking
  private releaseSlot(callId: string, call: ActiveAiCall | undefined, reason: string): void {
    if (!call) {
      logger.debug(`[TelnyxAiBridge] 🔓 Cannot release slot for ${callId} - call not found`);
      return;
    }
    if (call.slotReleased) {
      logger.debug(`[TelnyxAiBridge] 🔓 Slot already released for ${callId}, skipping`);
      return;
    }
    call.slotReleased = true;
    this.semaphore.release();
    
    // Release the phone number from per-number tracking
    if (call.dialedNumber) {
      this.activePhoneNumbers.delete(call.dialedNumber);
      logger.debug(`[TelnyxAiBridge] 🔓 Released number ${call.dialedNumber} (${this.activePhoneNumbers.size} numbers still active)`);
    }
    
    logger.debug(`[TelnyxAiBridge] 🔓 Released slot (${reason}) for ${callId} - available: ${this.semaphore.available}`);
  }
  
  // Release phone number tracking without releasing semaphore slot
  // Used when call fails after number was locked but before ActiveAiCall is created
  private releasePhoneNumber(phoneNumber: string, reason: string): void {
    if (this.activePhoneNumbers.has(phoneNumber)) {
      this.activePhoneNumbers.delete(phoneNumber);
      logger.debug(`[TelnyxAiBridge] 🔓 Released number ${phoneNumber} (${reason}) - ${this.activePhoneNumbers.size} numbers still active`);
    }
  }

  private clearHardStopTimer(call: ActiveAiCall | undefined): void {
    if (!call?.hardStopTimer) return;
    clearTimeout(call.hardStopTimer);
    call.hardStopTimer = null;
  }

  private scheduleHardStop(callId: string, callControlId: string, maxDurationSeconds: number): void {
    const delayMs = Math.max(1, maxDurationSeconds) * 1000;
    const timer = setTimeout(async () => {
      const call = this.activeCalls.get(callId);
      if (!call || call.hasEnded) return;

      console.error(
        `[TelnyxAiBridge] HARD STOP: Forcing hangup for ${callId} at ${maxDurationSeconds}s (control_id=${callControlId})`
      );

      try {
        await this.hangupCall(callControlId);
      } catch (err) {
        console.error(`[TelnyxAiBridge] HARD STOP hangup API failed for ${callId}:`, err);
      }

      try {
        if (!call.disposition) {
          call.disposition = call.isAnswered ? "completed" : "no-answer";
        }
        await this.handleCallHangup(callId, call);
      } catch (err) {
        console.error(`[TelnyxAiBridge] HARD STOP post-hangup cleanup failed for ${callId}:`, err);
      } finally {
        this.releaseSlot(callId, call, 'hard_stop');
        this.activeCalls.delete(callId);
      }
    }, delayMs);

    timer.unref?.();

    const call = this.activeCalls.get(callId);
    if (call) {
      this.clearHardStopTimer(call);
      call.hardStopTimer = timer;
      call.enforcedMaxDurationSeconds = maxDurationSeconds;
    } else {
      clearTimeout(timer);
    }
  }

  // Process queued calls when a slot opens up
  private async processQueue(): Promise<void> {
    if (this.callQueue.length === 0) return;
    
    const queuedCall = this.callQueue.shift();
    if (!queuedCall) return;
    
    try {
      const result = await this.initiateAiCall(
        queuedCall.phoneNumber,
        queuedCall.fromNumber,
        queuedCall.settings,
        queuedCall.context
      );
      queuedCall.resolve(result);
    } catch (error) {
      queuedCall.reject(error as Error);
    }
  }

  async initiateAiCall(
    phoneNumber: string,
    fromNumber: string,
    settings: AiAgentSettings,
    context: CallContext,
    _provider: string = 'gemini_live'
  ): Promise<{ callId: string; callControlId: string }> {
    const provider = 'gemini_live';

    // Guard: in dev, calls blocked by default — must be enabled in Telephony settings. Production always allows calls.
    if (process.env.NODE_ENV !== 'production' && process.env.CALL_EXECUTION_ENABLED !== 'true') {
      console.warn(`[TelnyxAiBridge] 🚫 CALL BLOCKED - call execution not enabled. Enable it in Telephony settings. Would have called: ${phoneNumber}`);
      throw new Error('call_execution_disabled - Enable call execution in Settings > Telephony');
    }

    // Format phone numbers to E.164 format first (required for tracking and Telnyx)
    const normalizedPhoneNumber = this.formatToE164(phoneNumber);
    const normalizedFromNumber = this.formatToE164(fromNumber);

    // =========================================================================
    // PER-NUMBER CONCURRENCY GUARD: Only 1 active call per phone number
    // =========================================================================
    // This prevents calling the same number while a call is already in progress.
    // Important for: call quality, compliance, and avoiding customer frustration.
    if (this.activePhoneNumbers.has(normalizedPhoneNumber)) {
      logger.debug(`[TelnyxAiBridge] 🚫 BLOCKED: Number ${normalizedPhoneNumber} already has an active call`);
      throw new Error(`number_busy:${normalizedPhoneNumber} - This number already has an active call in progress`);
    }

    // Global channel guard: wait for available Telnyx outbound slot
    const waitStart = Date.now();
    await this.semaphore.acquire();
    const waitedMs = Date.now() - waitStart;
    if (waitedMs > 0) {
      logger.debug(`[TelnyxAiBridge] ⏳ Queued call for ${normalizedPhoneNumber} (${waitedMs}ms wait, max ${this.MAX_CONCURRENT_CALLS})`);
    }

    // Re-check per-number lock after acquiring semaphore (another call may have started)
    if (this.activePhoneNumbers.has(normalizedPhoneNumber)) {
      this.semaphore.release();
      logger.debug(`[TelnyxAiBridge] 🚫 BLOCKED (post-semaphore): Number ${normalizedPhoneNumber} already has an active call`);
      throw new Error(`number_busy:${normalizedPhoneNumber} - This number already has an active call in progress`);
    }

    // Mark this number as in-use BEFORE making the call
    this.activePhoneNumbers.add(normalizedPhoneNumber);
    logger.debug(`[TelnyxAiBridge] 🔒 Locked number ${normalizedPhoneNumber} (${this.activePhoneNumbers.size} numbers active)`);

    try {
      // Use normalized phone numbers
      phoneNumber = normalizedPhoneNumber;
      fromNumber = normalizedFromNumber;

      // CHECK FOR SIP SWITCH (UI Setting or Global Env)
      // This allows safe A/B testing of direct SIP trunk calling via Drachtio
      // without affecting the default TeXML path
      const useSip = (settings as any).voiceProvider === 'sip' || process.env.VOICE_PROVIDER === 'sip';

      if (useSip) {
        logger.debug(`[TelnyxAiBridge] Switching to Direct SIP for call to ${normalizedPhoneNumber}`);
        try {
          const sipDialer = await import('./sip');

          if (!sipDialer.isReady()) {
            logger.warn('[TelnyxAiBridge] SIP dialer not ready, falling back to TeXML');
          } else {
            const result = await sipDialer.initiateAiCall({
              toNumber: normalizedPhoneNumber,
              fromNumber: normalizedFromNumber,
              campaignId: context.campaignId!,
              contactId: context.contactId!,
              queueItemId: context.queueItemId || '',
              voiceName: (settings as any).persona?.voice || 'Puck',
              systemPrompt: (settings as any).systemPrompt,
              contactName: [context.contactFirstName, context.contactLastName].filter(Boolean).join(' ').trim() || 'there',
              contactFirstName: context.contactFirstName || 'there',
              contactJobTitle: context.contactJobTitle || 'Decision Maker',
              accountName: context.accountName || 'your company',
              organizationName: context.organizationName,
              campaignName: context.campaignName,
              campaignObjective: context.campaignObjective,
              productServiceInfo: context.productServiceInfo,
              talkingPoints: context.talkingPoints,
<<<<<<< HEAD
=======
              maxCallDurationSeconds: context.maxCallDurationSeconds,
              callerNumberId: context.callerNumberId ?? null,
              callerNumberDecisionId: context.callerNumberDecisionId ?? null,
              callAttemptId: context.callAttemptId ?? null,
              telephonyProviderOverride: context.telephonyProviderOverride,
>>>>>>> f1f4cca39ca6bedcaffb09527e55f174ed564739
            });

            if (!result.success) {
              throw new Error(result.error || 'SIP call initiation failed');
            }

            this.releasePhoneNumber(normalizedPhoneNumber, 'sip_handoff');
            this.semaphore.release();

            return {
              callId: result.callId!,
              callControlId: result.callControlId,
            };
          }
        } catch (err) {
          console.error('[TelnyxAiBridge] SIP call failed:', err);
          this.releasePhoneNumber(normalizedPhoneNumber, 'sip_failure');
          this.semaphore.release();
          throw err;
        }
      }

      logger.debug(`[TelnyxAiBridge] 🎤 Initiating AI call with ENFORCED provider: Gemini Live`);

      const telnyxApiKey = context.telephonyProviderOverride?.apiKey?.trim() || this.telnyxApiKey;
      const texmlAppId = context.telephonyProviderOverride?.texmlAppId?.trim() || process.env.TELNYX_TEXML_APP_ID;
      const webhookUrl = context.telephonyProviderOverride?.webhookUrl?.trim() || this.webhookUrl;
      
      const contactFullName = [context.contactFirstName, context.contactLastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const preflight = await preflightVoiceVariableContract({
        agentName: context.agentFullName || (settings.persona as any)?.agentName || settings.persona?.name || "",
        orgName: context.organizationName || settings.persona?.companyName || "",
        account: { name: context.companyName },
        contact: {
          fullName: contactFullName,
          firstName: context.contactFirstName,
          lastName: context.contactLastName,
          jobTitle: context.contactTitle,
          email: context.contactEmail,
        },
        callerId: fromNumber,
        calledNumber: phoneNumber,
      });

      if (!preflight.valid) {
        throw new VoiceVariablePreflightError(preflight);
      }

      const agent = createAiVoiceAgent(settings, context);
      const callId = agent.getCallId();

      agent.on("transcript:ai", (text) => {
        this.emit("ai:speech", { callId, text });
      });

      agent.on("transcript:human", (text) => {
        this.emit("human:speech", { callId, text });
      });

      agent.on("handoff:triggered", (reason) => {
        this.handleHandoff(callId, reason, settings.handoff.transferNumber);
      });

      agent.on("conversation:phase", (phase) => {
        this.emit("phase:change", { callId, phase });
      });

      agent.on("error", (error) => {
        console.error(`[TelnyxAiBridge] AI agent error for call ${callId}:`, error);
        this.emit("call:error", { callId, error });
      });
      // For TeXML outbound calls, prioritize TeXML App ID but fall back to Call Control App ID
      // Note: TeXML requires a TeXML Application ID created in Telnyx Portal
      // Use TeXML API for automatic streaming setup via <Stream bidirectionalMode="rtp" />
      // DEVELOPMENT: Use ngrok tunnel (PUBLIC_WEBHOOK_HOST) - this is set by dev-with-ngrok.ts
      // PRODUCTION: Use PUBLIC_TEXML_HOST or TELNYX_WEBHOOK_URL
      
      // Helper to extract just the hostname from a URL (strips protocol and path)
      const extractHost = (urlString: string): string => {
        try {
          const url = new URL(urlString);
          return url.host;
        } catch {
          // Fallback: strip protocol and path manually
          return urlString.replace('https://', '').replace('http://', '').split('/')[0];
        }
      };

      let webhookHost = '';
      
      // In development, prioritize ngrok tunnel for local testing
      if (process.env.NODE_ENV !== 'production' && process.env.PUBLIC_WEBHOOK_HOST) {
        webhookHost = extractHost(process.env.PUBLIC_WEBHOOK_HOST);
        console.log(`[TelnyxAiBridge] 🔧 Development mode - using ngrok tunnel: ${webhookHost}`);
      } else {
        // Production or fallback chain
        webhookHost = process.env.PUBLIC_TEXML_HOST || process.env.PUBLIC_WEBHOOK_HOST || '';
        if (webhookHost) {
          webhookHost = extractHost(webhookHost);
        } else if (webhookUrl) {
          webhookHost = extractHost(webhookUrl);
        }
      }
      
      webhookHost = webhookHost || 'localhost';
      const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
      const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call`;
      
      // Log the webhook URL being used for campaign calls
      console.log(`[TelnyxAiBridge] 📡 Using TeXML URL: ${texmlUrl}`);
      console.log(`[TelnyxAiBridge] 🎯 Campaign: ${context.campaignId}, Contact: ${context.contactFirstName} at ${context.companyName}`);

      // Build comprehensive client_state for Gemini Live Dialer
      // This data will be passed through TeXML -> WebSocket connection
      // NOTE: All calls use Gemini Live exclusively - no OpenAI Realtime
      // Use actual IDs from context if available, otherwise generate placeholders for test calls
      const callAttemptIdFromContext = (context as any).callAttemptId;
      const metadata = {
        contactId: context.contactId,
        campaignId: context.campaignId,
        queueItemId: context.queueItemId,
        runId: (context as any).runId,
        virtualAgentId: context.virtualAgentId,
      };

      if (callAttemptIdFromContext) {
        try {
          const [attempt] = await db
            .select({
              contactId: dialerCallAttempts.contactId,
              campaignId: dialerCallAttempts.campaignId,
              queueItemId: dialerCallAttempts.queueItemId,
              dialerRunId: dialerCallAttempts.dialerRunId,
              virtualAgentId: dialerCallAttempts.virtualAgentId,
            })
            .from(dialerCallAttempts)
            .where(eq(dialerCallAttempts.id, callAttemptIdFromContext))
            .limit(1);
          if (attempt) {
            metadata.contactId ||= attempt.contactId;
            metadata.campaignId ||= attempt.campaignId;
            metadata.queueItemId ||= attempt.queueItemId || metadata.queueItemId;
            metadata.runId ||= attempt.dialerRunId;
            metadata.virtualAgentId ||= attempt.virtualAgentId || metadata.virtualAgentId;
          }
        } catch (error) {
          console.warn(`[TelnyxAiBridge] Failed to resolve call attempt metadata:`, error);
        }
      }

      const resolvedCallAttemptId = callAttemptIdFromContext;
      const fallbackCallAttemptId = resolvedCallAttemptId || `attempt-${Date.now()}`;
      const customParams = {
        call_id: callId,
        run_id: metadata.runId || `run-${Date.now()}`,
        campaign_id: metadata.campaignId,
        queue_item_id: metadata.queueItemId,
        call_attempt_id: fallbackCallAttemptId,
        contact_id: metadata.contactId || null,
        called_number: phoneNumber,
        from_number: fromNumber,
        caller_number_id: (context as any).callerNumberId || null,
        caller_number_decision_id: (context as any).callerNumberDecisionId || null,
        virtual_agent_id: metadata.virtualAgentId || null,
        provider: provider,
        // Include agent configuration for WebSocket session
        // system_prompt is built by Gemini Live Dialer from agent_settings
        first_message: settings.scripts?.opening || '',
        voice: settings.persona?.voice || 'Puck', // Default to Gemini 2.5 compatible voice
        agent_name: (settings.persona as any)?.agentName || settings.persona?.name || '',
        agent_settings: settings,
        // CRITICAL: Field names must match what gemini-live-dialer.ts expects
        // gemini-live-dialer looks for: contact_name, contact_first_name, contact_job_title, account_name, organization_name
        contact_name: contactFullName || `${context.contactFirstName || ''} ${context.contactLastName || ''}`.trim(),
        contact_first_name: context.contactFirstName || '',
        contact_last_name: context.contactLastName || '',
        contact_job_title: context.contactTitle || '',
        account_name: context.companyName || '',
        // CRITICAL: Use organization_name from context (set by orchestrator from persona.companyName)
        // Do NOT use campaign.name - that's the campaign name, not the organization
        organization_name: context.organizationName || settings.persona?.companyName || 'DemandGentic.ai By Pivotal B2B',
        company_name: context.companyName || '',
        // System prompt for the AI agent - EXCLUDED from URL (loaded from campaign in gemini-live-dialer)
        // system_prompt: settings.scripts?.systemPrompt || '',
        // Campaign context - EXCLUDED from URL to avoid HTTP 431 (loaded from campaign in gemini-live-dialer)
        // These large fields are looked up server-side using campaign_id:
        // - campaign_objective, success_criteria, target_audience_description
        // - product_service_info, talking_points, call_flow
        // Max call duration in seconds - auto-hangup after this time
        max_call_duration_seconds: (() => {
          const raw = Number(context.maxCallDurationSeconds);
          if (!Number.isFinite(raw) || raw <= 0) return undefined;
          return Math.min(raw, GLOBAL_MAX_CALL_DURATION_SECONDS);
        })(),
        // Also include canonical dot-notation fields for other consumers
        'contact.full_name': contactFullName || `${context.contactFirstName || ''} ${context.contactLastName || ''}`.trim(),
        'contact.first_name': context.contactFirstName || '',
        'contact.last_name': context.contactLastName || '',
        'contact.job_title': context.contactTitle || '',
        'account.name': context.companyName || '',
      };
      const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');

      // CRITICAL: Store session data in Redis - same as test calls
      // This ensures queue calls have identical session data available in voice-dialer
      try {
        const { callSessionStore } = await import('./call-session-store');
        await callSessionStore.setSession(callId, {
          call_id: callId,
          run_id: metadata.runId || customParams.run_id,
          campaign_id: metadata.campaignId,
          queue_item_id: metadata.queueItemId,
          call_attempt_id: fallbackCallAttemptId,
          contact_id: metadata.contactId,
          called_number: phoneNumber,
          from_number: fromNumber,
          caller_number_id: (context as any).callerNumberId || null,
          caller_number_decision_id: (context as any).callerNumberDecisionId || null,
          virtual_agent_id: metadata.virtualAgentId,
          is_test_call: false,
          first_message: settings.scripts?.opening || '',
          voice: settings.persona?.voice || 'Puck',
          agent_name: (settings.persona as any)?.agentName || settings.persona?.name || '',
          organization_name: context.organizationName || settings.persona?.companyName || '',
          provider: 'google',
          // Campaign context for unified behavior
          campaign_objective: (context as any).campaignObjective || '',
          success_criteria: (context as any).successCriteria || '',
          target_audience_description: (context as any).targetAudienceDescription || '',
          product_service_info: (context as any).productServiceInfo || '',
          talking_points: (context as any).talkingPoints || [],
          // Contact context
          contact_name: contactFullName,
          contact_first_name: context.contactFirstName || '',
          contact_job_title: context.contactTitle || '',
          account_name: context.companyName || '',
        });
        console.log(`[TelnyxAiBridge] ✅ Stored session ${callId} in Redis (unified with test calls)`);
      } catch (storeErr) {
        console.warn(`[TelnyxAiBridge] Failed to store session in Redis:`, storeErr);
      }

      let response: Response | undefined;
      const useTexml = !!texmlAppId;
      
      if (useTexml) {
        // Build TeXML URL with client_state in query params (like test calls)
        const texmlUrlWithState = `${texmlUrl}?client_state=${encodeURIComponent(clientStateB64)}`;
        
        console.log(`[TelnyxAiBridge] Initiating TeXML call with:
  - TeXML URL: ${texmlUrlWithState}
  - TeXML App ID: ${texmlAppId}
  - From: ${fromNumber}
  - To: ${phoneNumber}
  - Provider: ${provider}`);

        // Use the path-based TeXML endpoint (same as test calls)
        // POST /v2/texml/calls/{application_id}
        response = await this.telnyxFetch(`https://api.telnyx.com/v2/texml/calls/${texmlAppId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            To: phoneNumber,
            From: fromNumber,
            Url: texmlUrlWithState,
            // Prefer explicit webhook URL override for TeXML if provided
            StatusCallback: webhookUrl || (process.env.TELNYX_WEBHOOK_URL || "").trim() || `https://${webhookHost}/api/webhooks/telnyx`,
            // Include client_state so AMD webhook receives call context
            ClientState: clientStateB64,
            // NOTE: Recording disabled to fix audio noise issue
            // Recording was causing audio artifacts in the bidirectional stream
            // If recording is needed, use Telnyx's recording webhook instead
          }),
        }, telnyxApiKey);
        
        // TeXML app must exist; do not fall back to other calling mechanisms
        if (response.status === 404) {
          throw new Error(`TeXML App ID ${texmlAppId} not found. TeXML-only calling is enforced.`);
        }
      } else {
        throw new Error("TELNYX_TEXML_APP_ID is required. TeXML-only calling is enforced.");
      }

      if (!response) {
        throw new Error("Telnyx API response missing");
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Telnyx API error: ${response.status} - ${errorText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          const telnyxError = errorJson.errors?.[0];
          if (telnyxError?.code === 10010) {
            errorMessage = `Telnyx Whitelist Error: ${telnyxError.detail || 'Dialed number is not included in whitelisted countries'}`;
          }
        } catch (e) {
          // Fallback to original error message
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      // TeXML path-based endpoint returns CallSid, Call Control returns data.call_control_id
      const callControlId = result.data?.call_control_id || result.CallSid || result.call_sid;
      const callSessionId = result.data?.call_session_id || result.CallSessionId || result.call_session_id || callControlId;

      if (!callControlId) {
        console.error(`[TelnyxAiBridge] Missing call ID in response:`, JSON.stringify(result));
        throw new Error(`Telnyx API returned no call ID: ${JSON.stringify(result)}`);
      }

      // Store client state by call_control_id for AMD webhook lookups
      // AMD webhook fires before WebSocket connection, so we need this mapping
      this.callStateByControlId.set(callControlId, customParams);

      if (context.callAttemptId) {
        try {
          await db
            .update(dialerCallAttempts)
            .set({
              telnyxCallId: callControlId,
              providerCallId: callControlId,
              telephonyProviderId: context.telephonyProviderId || null,
              telephonyProviderType: context.telephonyProviderType || null,
              telephonyProviderName: context.telephonyProviderName || null,
              telephonyRoutingMode: context.telephonyRoutingMode || null,
              telephonySelectionReason: context.telephonySelectionReason || null,
              telephonyCostPerMinute: context.telephonyCostPerMinute ?? null,
              telephonyCostPerCall: context.telephonyCostPerCall ?? null,
              telephonyCurrency: context.telephonyCurrency || null,
            })
            .where(eq(dialerCallAttempts.id, context.callAttemptId));
        } catch (error) {
          console.warn(`[TelnyxAiBridge] Failed to persist telnyxCallId for call attempt ${context.callAttemptId}:`, error);
        }
      }
      
      const requestedMaxDuration = Number(context.maxCallDurationSeconds);
      const enforcedMaxDurationSeconds =
        Number.isFinite(requestedMaxDuration) && requestedMaxDuration > 0
          ? Math.min(requestedMaxDuration, GLOBAL_MAX_CALL_DURATION_SECONDS)
          : GLOBAL_MAX_CALL_DURATION_SECONDS;

      this.activeCalls.set(callId, {
        callControlId,
        callSessionId,
        agent,
        mediaWs: null,
        campaignId: context.campaignId,
        queueItemId: context.queueItemId,
        callAttemptId: context.callAttemptId || undefined,
        dialedNumber: phoneNumber,
        fromNumber,
        callerNumberId: (context as any).callerNumberId || null,
        callerNumberDecisionId: (context as any).callerNumberDecisionId || null,
        telephonyProviderId: context.telephonyProviderId || null,
        telephonyProviderType: context.telephonyProviderType || null,
        telephonyProviderName: context.telephonyProviderName || null,
        telephonyRoutingMode: context.telephonyRoutingMode || null,
        telephonySelectionReason: context.telephonySelectionReason || null,
        telephonyCostPerMinute: context.telephonyCostPerMinute ?? null,
        telephonyCostPerCall: context.telephonyCostPerCall ?? null,
        telephonyCurrency: context.telephonyCurrency || null,
        telephonyApiKey: telnyxApiKey,
        startTime: new Date(),
        isAnswered: false,
        hardStopTimer: null,
        enforcedMaxDurationSeconds,
      });

      this.scheduleHardStop(callId, callControlId, enforcedMaxDurationSeconds);

      console.log(`[TelnyxAiBridge] AI call initiated: ${callId} -> ${phoneNumber}`);
      this.emit("call:initiated", { callId, callControlId, phoneNumber });

      // Start polling for call status since webhooks may not be configured
      this.pollCallStatus(callId, callControlId, agent);

      return { callId, callControlId };
    } catch (error) {
      console.error("[TelnyxAiBridge] Failed to initiate call:", error);
      // Release both the phone number and the semaphore slot on error
      this.releasePhoneNumber(phoneNumber, 'call_initiation_error');
      this.semaphore.release();
      throw error;
    }
  }

  async handleWebhookEvent(event: TelnyxCallEvent): Promise<void> {
    const { event_type, data } = event;
    const callControlId = data.call_control_id;

    const activeCall = this.findCallByControlId(callControlId);
    if (!activeCall) {
      console.log(`[TelnyxAiBridge] Received event for unknown call: ${callControlId}`);
      return;
    }

    const callId = this.getCallIdByControlId(callControlId);

    logger.debug(`[TelnyxAiBridge] Webhook event: ${event_type} for call ${callId}`);

    switch (event_type) {
      case "call.initiated":
        break;

      case "call.answered":
        await this.handleCallAnswered(callId!, activeCall);
        break;

      case "call.machine.detection.ended":
        await this.handleAmdResult(callId!, activeCall, data);
        break;

      case "call.hangup":
        await this.handleCallHangup(callId!, activeCall);
        break;

      case "streaming.started":
        logger.debug(`[TelnyxAiBridge] Media streaming started for ${callId}`);
        break;

      case "streaming.stopped":
        logger.debug(`[TelnyxAiBridge] Media streaming stopped for ${callId}`);
        break;

      case "call.transcription":
        // Handle real-time transcription from Telnyx
        await this.handleTranscriptionEvent(callId!, activeCall, data);
        break;

      case "call.transcription.stopped":
        logger.debug(`[TelnyxAiBridge] Transcription stopped for ${callId}`);
        break;

      default:
        logger.debug(`[TelnyxAiBridge] Unhandled event type: ${event_type}`);
    }
  }

  private async handleTranscriptionEvent(callId: string, call: ActiveAiCall, data: any): Promise<void> {
    const transcriptionData = data.transcription_data;
    if (!transcriptionData) return;

    const { transcript, is_final, confidence } = transcriptionData;
    if (!is_final || !transcript?.trim()) return;

    logger.sampled(`[TelnyxAiBridge]`, 10, `📝 Telnyx transcription for ${callId}: "${transcript.substring(0, 50)}..." (confidence: ${(confidence * 100).toFixed(0)}%)`);

    // Store in Telnyx transcription accumulator
    try {
      const { addTranscriptSegment, handleTranscriptionWebhook } = await import('./telnyx-transcription');
      handleTranscriptionWebhook('call.transcription', {
        call_control_id: call.callControlId,
        transcription_data: transcriptionData,
      });
    } catch (err) {
      console.warn(`[TelnyxAiBridge] Error handling transcription:`, err);
    }

    // CRITICAL: Feed transcript to Gemini so AI can respond
    // This is the backup path when Deepgram isn't catching the audio
    try {
      const { getVoiceDialerSession, feedTranscriptToGemini } = await import('./voice-dialer');
      const session = getVoiceDialerSession(callId);
      if (session) {
        // Only feed if this isn't a duplicate of what Deepgram already sent
        const recentUserTexts = session.transcripts
          .filter((t: any) => t.role === 'user')
          .slice(-3)
          .map((t: any) => t.text.toLowerCase().trim());

        const normalizedTranscript = transcript.toLowerCase().trim();
        const isDuplicate = recentUserTexts.some((t: string) =>
          t === normalizedTranscript || t.includes(normalizedTranscript) || normalizedTranscript.includes(t)
        );

        if (!isDuplicate) {
          feedTranscriptToGemini(callId, transcript, 'telnyx');
          console.log(`[TelnyxAiBridge] 🎯 Fed Telnyx transcript to Gemini for ${callId}`);
        } else {
          console.log(`[TelnyxAiBridge] ⏭️ Skipping duplicate transcript for ${callId}`);
        }
      }
    } catch (err) {
      console.warn(`[TelnyxAiBridge] Error feeding transcript to Gemini:`, err);
    }
  }

  private async handleCallAnswered(callId: string, call: ActiveAiCall): Promise<void> {
    console.log(`[TelnyxAiBridge] Call answered: ${callId}`);
    call.isAnswered = true;

    // With TeXML, streaming is handled automatically via <Stream bidirectionalMode="rtp" />
    // The opening message will be sent through the Gemini Live WebSocket connection
    // No need to call startMediaStreaming() or speakText() here

    // Enable Telnyx real-time transcription for backup/redundancy
    // This supplements Deepgram transcription and provides two-way transcription
    try {
      const { enableCallTranscription, initializeCallTranscription } = await import('./telnyx-transcription');
      initializeCallTranscription(call.callControlId, call.campaignId, call.callAttemptId || '');
      const transcriptionEnabled = await enableCallTranscription(call.callControlId, {
        language: 'en',
        interimResults: true,
      });
      if (transcriptionEnabled) {
        console.log(`[TelnyxAiBridge] ✅ Telnyx real-time transcription enabled for call ${callId}`);
      }
    } catch (err) {
      console.warn(`[TelnyxAiBridge] Failed to enable Telnyx transcription:`, err);
      // Don't fail the call - Deepgram is the primary transcription source
    }

    await call.agent.startConversation();
    this.emit("call:answered", { callId });
  }

  private async pollCallStatus(callId: string, callControlId: string, agent: AiVoiceAgent): Promise<void> {
    let attempts = 0;
    const preAnswerMaxAttempts = PRE_ANSWER_MAX_SECONDS; // 1 attempt/sec before answer
    const postAnswerMaxAttempts = GLOBAL_MAX_CALL_DURATION_SECONDS; // attempt-based fallback only
    const basePollInterval = 1000; // 1 second
    const mediaPollInterval = 5000; // Reduce polling when media is connected
    const maxPollInterval = 10000;
    const pollTimeoutMs = 15000; // Increased from 5s to 15s for high-load resilience
    const jitterMs = 500; // Increased from 250 to reduce thundering herd during errors
    let hasSpoken = false;
    let consecutiveErrors = 0;

    const getPollDelay = (hasMediaConnection: boolean, isAnswered: boolean): number => {
      const baseInterval = hasMediaConnection && isAnswered ? mediaPollInterval : basePollInterval;
      if (consecutiveErrors === 0) {
        return baseInterval;
      }

      // Exponential backoff capped at 30s to prevent hammering API during outages
      const backoff = Math.min(
        30000, // Cap at 30s during heavy backoff
        baseInterval * Math.pow(2, Math.min(consecutiveErrors, 5))
      );
      const jitter = Math.floor(Math.random() * jitterMs);
      return Math.min(backoff + jitter, 30000);
    };

    const poll = async () => {
      attempts++;
      // Use different timeout based on whether call has been answered
      const activeCall = this.activeCalls.get(callId);
      const isCallAnswered = activeCall?.isAnswered === true;
      const startedAtMs = activeCall?.startTime?.getTime() || Date.now();
      const elapsedMs = Date.now() - startedAtMs;
      const maxDurationSeconds = Math.min(
        activeCall?.enforcedMaxDurationSeconds || GLOBAL_MAX_CALL_DURATION_SECONDS,
        GLOBAL_MAX_CALL_DURATION_SECONDS
      );
      const effectiveMaxAttempts = isCallAnswered ? postAnswerMaxAttempts : preAnswerMaxAttempts;

      if (isCallAnswered && elapsedMs >= maxDurationSeconds * 1000) {
        console.error(
          `[TelnyxAiBridge] POLL HARD STOP: Call ${callId} exceeded ${maxDurationSeconds}s (elapsed=${Math.round(elapsedMs / 1000)}s). Forcing hangup.`
        );
        if (activeCall) {
          try {
            await this.hangupCall(callControlId);
          } catch (err) {
            console.error(`[TelnyxAiBridge] POLL HARD STOP hangup failed for ${callId}:`, err);
          }
          if (!activeCall.disposition) {
            activeCall.disposition = "completed";
          }
          await this.handleCallHangup(callId, activeCall);
        }
        this.releaseSlot(callId, activeCall, 'poll_hard_stop');
        this.activeCalls.delete(callId);
        return;
      }

      if (attempts > effectiveMaxAttempts) {
        console.log(`[TelnyxAiBridge] Call ${callId} polling timeout (${isCallAnswered ? 'post-answer' : 'pre-answer'}) - cleaning up`);
        // Enforce Telnyx-side hangup before cleanup to prevent zombie calls.
        const timedOutCall = this.activeCalls.get(callId);
        if (timedOutCall) {
          try {
            await this.hangupCall(callControlId);
          } catch (err) {
            console.error(`[TelnyxAiBridge] Poll-timeout hangup failed for ${callId}:`, err);
          }
          if (!timedOutCall.disposition) {
            timedOutCall.disposition = timedOutCall.isAnswered ? "completed" : "no-answer";
          }
          await this.handleCallHangup(callId, timedOutCall);
        }
        this.releaseSlot(callId, timedOutCall, 'timeout');
        this.activeCalls.delete(callId);
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), pollTimeoutMs);
        const response = await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}`, {
          signal: controller.signal,
        }, this.getApiKeyForCall(callControlId)).finally(() => clearTimeout(timeout));

        if (!response.ok) {
          if (response.status === 404) {
            const endedCall = this.activeCalls.get(callId);
            const callDurationMs = endedCall ? Date.now() - endedCall.startTime.getTime() : 0;

            // SHORT-DURATION FAILURE DETECTION (per Telnyx support):
            // Sub-500ms call failures with no media exchange indicate carrier/routing issues,
            // not codec problems. These are common for international destinations (UAE, etc.).
            // Log specifically so we can identify patterns.
            if (callDurationMs < 500 && endedCall && !endedCall.isAnswered) {
              const destination = endedCall.dialedNumber || 'unknown';
              const isInternational = destination.replace(/\D/g, '').match(/^(?!1)\d{2,3}/);
              console.error(`[TelnyxAiBridge] ⚠️ SHORT-DURATION CARRIER FAILURE: Call ${callId} to ${destination} ended in ${callDurationMs}ms with no media. ${isInternational ? 'INTERNATIONAL routing issue suspected.' : 'Domestic routing issue.'}`);
              console.error(`[TelnyxAiBridge] 💡 Telnyx recommends investigating carrier routes for this destination. From: ${endedCall.fromNumber || 'unknown'}, Attempt: ${attempts}`);

              // Emit carrier failure event for potential retry by orchestrator
              this.emit("call:carrier_failure", {
                callId,
                durationMs: callDurationMs,
                destination,
                isInternational: !!isInternational,
                fromNumber: endedCall.fromNumber,
                campaignId: endedCall.campaignId,
                queueItemId: endedCall.queueItemId,
              });
            } else {
              console.log(`[TelnyxAiBridge] Call ${callId} no longer exists (ended after ${callDurationMs}ms)`);
            }

            // Call ended before we got the webhook - record disposition
            if (endedCall) {
              // If never answered, treat as no_answer; otherwise disposition was set during call
              if (!endedCall.isAnswered && !endedCall.disposition) {
                endedCall.disposition = "no-answer";
              }
              await this.handleCallHangup(callId, endedCall);
            }
            // CRITICAL: Release semaphore slot when call ends
            this.releaseSlot(callId, endedCall, '404');
            this.activeCalls.delete(callId);
            return;
          }
          console.warn(`[TelnyxAiBridge] Poll error: ${response.status} for call ${callId} (consecutive errors: ${consecutiveErrors}). Retrying with backoff...`);
          consecutiveErrors++;
          const activeCall = this.activeCalls.get(callId);
          const hasMediaConnection = activeCall?.mediaWs !== null;
          const isAnsweredViaWebhook = activeCall?.isAnswered === true;
          const delayMs = getPollDelay(hasMediaConnection, isAnsweredViaWebhook);
          console.log(`[TelnyxAiBridge] Retry scheduled in ${delayMs}ms (attempt ${attempts + 1}/${effectiveMaxAttempts})`);
          setTimeout(poll, delayMs);
          return;
        }

        consecutiveErrors = 0;
        const data = await response.json();
        const callData = data.data || data;
        // For TeXML calls, is_alive might not be returned - treat undefined as alive
        const isAlive = callData.is_alive !== false; // Only false if explicitly false
        const callState = callData.state; // 'ringing', 'answered', 'bridged', etc.

        // Also check if webhook marked this call as answered
        const activeCall = this.activeCalls.get(callId);
        const isAnsweredViaWebhook = activeCall?.isAnswered === true;

        // Check if WebSocket is connected (definitive proof call is alive for TeXML)
        // Also check hasActiveWebSocket flag for Voice-Dialer managed connections
        const hasMediaConnection = (activeCall?.mediaWs !== null && activeCall?.mediaWs !== undefined) || activeCall?.hasActiveWebSocket === true;

        // Log polling status (reduce frequency for answered calls to avoid log spam)
        const shouldLog = !isAnsweredViaWebhook || attempts % 10 === 0 || attempts <= 5;
        if (shouldLog) {
          console.log(`[TelnyxAiBridge] Call ${callId} is_alive: ${callData.is_alive}, state: ${callState}, webhookAnswered: ${isAnsweredViaWebhook}, hasMedia: ${hasMediaConnection}, voiceWs: ${activeCall?.hasActiveWebSocket}, attempt: ${attempts}`);
        }

        // Call is alive if: API says so, OR we have a media WebSocket connection
        if (!isAlive && !hasMediaConnection) {
          console.log(`[TelnyxAiBridge] Call ${callId} ended (is_alive=false, no media)`);
          // Call handleCallHangup to record disposition (if webhook didn't arrive)
          const endedCall = this.activeCalls.get(callId);
          if (endedCall) {
            await this.handleCallHangup(callId, endedCall);
          }
          // CRITICAL: Release semaphore slot when call ends
          this.releaseSlot(callId, endedCall, 'ended');
          this.activeCalls.delete(callId);
          return;
        }

        // Check if call is answered via API state OR via webhook notification
        const isAnsweredViaApi = callState === 'answered' || callState === 'bridged' || callState === 'active';
        const isAnswered = isAnsweredViaApi || isAnsweredViaWebhook;

        // Start conversation only when we have real evidence the call was answered:
        // - Webhook notification (isAnsweredViaWebhook)
        // - API state shows answered/bridged/active (isAnsweredViaApi)
        // - Media WebSocket is connected (hasMediaConnection)
        // NOTE: We no longer use a time-based fallback (attempts >= 30) because
        // is_alive stays true while the call is still ringing, which caused calls
        // to be falsely promoted to "answered" and then sit for 3+ minutes.
        if (isAlive && !hasSpoken && (isAnswered || hasMediaConnection)) {
          hasSpoken = true;

          // CRITICAL: Mark call as answered so polling continues with extended timeout
          // Without this, the next poll iteration would kill the call as "no-answer"
          if (activeCall && !activeCall.isAnswered) {
            activeCall.isAnswered = true;
            if (isAnsweredViaWebhook) {
              console.log(`[TelnyxAiBridge] Call ${callId} answered (via webhook notification)`);
            } else if (isAnsweredViaApi) {
              console.log(`[TelnyxAiBridge] Call ${callId} answered (state: ${callState})`);
            } else if (hasMediaConnection) {
              console.log(`[TelnyxAiBridge] Call ${callId} answered (media WebSocket connected)`);
            }
          }

          console.log(`[TelnyxAiBridge] TeXML streaming active - AI audio handled by Gemini Live dialer for ${callId}`);
          await agent.startConversation();
        }

        // Continue polling to track call end
        setTimeout(poll, getPollDelay(hasMediaConnection, isAnswered));
      } catch (error) {
        console.error(`[TelnyxAiBridge] Poll error for call ${callId}:`, error);
        consecutiveErrors++;
        const activeCall = this.activeCalls.get(callId);
        const hasMediaConnection = activeCall?.mediaWs !== null;
        const isAnsweredViaWebhook = activeCall?.isAnswered === true;
        setTimeout(poll, getPollDelay(hasMediaConnection, isAnsweredViaWebhook));
      }
    };

    // Start polling after initial delay for call to connect
    setTimeout(poll, 2000);
  }

  private async speakText(callControlId: string, text: string, voice?: string): Promise<void> {
    if (!text || !text.trim()) {
      console.warn(`[TelnyxAiBridge] Skipping speakText because payload is empty for ${callControlId}`);
      return;
    }

    // Check if call is still active before attempting TTS (prevents "call has already ended" errors)
    const callState = this.callStateByControlId.get(callControlId);
    if (!callState) {
      console.log(`[TelnyxAiBridge] Skipping speakText - call ${callControlId} no longer tracked (likely ended)`);
      return;
    }

    // 1. Try Google Cloud TTS (Primary - Quality/Reliability + Google-native preference)
    try {
      await this.speakWithGoogle(callControlId, text, voice || "alloy");
      return;
    } catch (error: any) {
      // If call has ended, don't bother with fallbacks
      if (error?.message?.includes('90018') || error?.message?.includes('already ended')) {
        logger.debug(`[TelnyxAiBridge] Call ${callControlId} ended during TTS - skipping fallbacks`);
        return;
      }
      console.warn(`[TelnyxAiBridge] Google TTS failed, falling back to Telnyx TTS (OpenAI disabled)...`, error);
    }

    // 2. Fallback to Telnyx basic TTS (Last Resort)
    logger.debug(`[TelnyxAiBridge] Using Telnyx basic TTS (fallback)`);
    await this.speakWithTelnyxTTS(callControlId, text, voice);
  }

  private async speakWithGoogle(callControlId: string, text: string, voice: string): Promise<void> {
    // Use centralized voice configuration for consistent mapping
    const voiceConfig = getGoogleVoiceConfig(voice);
    const googleVoice = voiceConfig.googleVoiceName;

    // Use rate-limited + cached TTS service (singleton client, request queue, backoff)
    const audioBuffer = await synthesizeSpeechRateLimited(text, googleVoice, "en-US", "MP3");
    const audioId = `google-audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp3`;
    const s3Key = `ai-call-audio/${audioId}`;
    
    await uploadToS3(s3Key, audioBuffer, "audio/mpeg");
    
    // valid for 5 mins
    const audioUrl = await getPresignedDownloadUrl(s3Key, 300);
    logger.debug(`[TelnyxAiBridge] Playing Google TTS audio from S3: ${audioUrl.split("?")[0]}... (${audioBuffer.byteLength} bytes)`);

    // Telnyx Playback
    const telnyxResponse = await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/playback_start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
      }),
    }, this.getApiKeyForCall(callControlId));

    if (!telnyxResponse.ok) {
      const errorText = await telnyxResponse.text();
      throw new Error(`Telnyx playback_start failed: ${telnyxResponse.status} - ${errorText}`);
    }
  }

  private async speakWithOpenAI(callControlId: string, text: string, voice: string, apiKey: string): Promise<void> {
    throw new Error("OpenAI TTS is disabled for Gemini-only calling.");
    // OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer
    const validVoices = ["alloy", "shimmer", "echo", "ash", "ballad", "coral", "sage", "verse"];
    const selectedVoice = validVoices.includes(voice) ? voice : "alloy";
    
    console.log(`[TelnyxAiBridge] Generating natural speech with OpenAI TTS (voice: ${selectedVoice})`);
    
    // Use Replit AI Integrations base URL if available, otherwise direct OpenAI
    const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
    const ttsUrl = `${baseUrl}/audio/speech`;
    
    // Generate speech using OpenAI TTS API
    const ttsResponse = await fetch(ttsUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: selectedVoice,
        response_format: "mp3",
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      throw new Error(`OpenAI TTS error: ${ttsResponse.status} - ${errorText}`);
    }

    // Get the audio as a buffer
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioId = `openai-audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp3`;
    
    // Upload to S3 for reliable external access
    const s3Key = `ai-call-audio/${audioId}`;
    await uploadToS3(s3Key, Buffer.from(audioBuffer), "audio/mpeg");
    
    // Get a presigned URL that Telnyx can access (valid for 5 minutes)
    const audioUrl = await getPresignedDownloadUrl(s3Key, 300);
    console.log(`[TelnyxAiBridge] Playing OpenAI TTS audio from S3: ${audioUrl.substring(0, 100)}... (${audioBuffer.byteLength} bytes)`);
    
    // Play the audio via Telnyx
    const response = await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/playback_start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
      }),
    }, this.getApiKeyForCall(callControlId));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telnyx playback_start failed: ${response.status} - ${errorText}`);
    }
    
    console.log(`[TelnyxAiBridge] OpenAI TTS audio playing successfully`);
  }

  private async speakWithTelnyxTTS(callControlId: string, text: string, voice?: string): Promise<void> {
    // Map voice preference to gender (Telnyx basic TTS only supports male/female)
    const voiceGenderMap: Record<string, string> = {
      alloy: "female",
      echo: "male", 
      fable: "male",
      onyx: "male",
      nova: "female",
      shimmer: "female",
    };

    const selectedVoice = voice && voiceGenderMap[voice] ? voiceGenderMap[voice] : "female";
    
    const response = await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: text,
        voice: selectedVoice,
        language: "en-US",
      }),
    }, this.getApiKeyForCall(callControlId));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TelnyxAiBridge] Speak failed: ${response.status} - ${errorText}`);
    } else {
      console.log(`[TelnyxAiBridge] Speak command sent successfully with voice: ${selectedVoice}`);
    }
  }

  private async handleAmdResult(callId: string, call: ActiveAiCall, data: any): Promise<void> {
    const amdResult = data.result;
    const amdConfidence = data.confidence || 0;
    console.log(`[TelnyxAiBridge] AMD result for ${callId}: ${amdResult} (confidence: ${amdConfidence})`);

    // Store AMD result in call state
    call.amdResult = amdResult;
    call.amdConfidence = amdConfidence;

    // PHASE 1: Notify voice-dialer of AMD result to sync between TelnyxAiBridge and voice-dialer sessions
    try {
      if (call.callControlId) {
        // Dynamic import to avoid circular async dependency
        const { setAmdResultForSession } = await import("./voice-dialer");
        setAmdResultForSession(call.callControlId, amdResult, amdConfidence);
        console.log(`[TelnyxAiBridge] AMD result forwarded to voice-dialer for ${callId}`);
      }
    } catch (e) {
      console.error(`[TelnyxAiBridge] Failed to forward AMD result to voice-dialer:`, e);
    }

    // CRITICAL: Use startsWith('machine') to catch ALL machine results (machine, machine_start, machine_end_*)
    if (amdResult?.startsWith('machine') || amdResult === "fax") {
      call.disposition = "voicemail";
      await this.hangupCall(call.callControlId);
      this.emit("call:voicemail", { callId });
    } else if (amdResult === "human" || amdResult === "human_residence" || amdResult === "human_business") {
      this.emit("call:human_detected", { callId });
    }
  }

  private async handleCallHangup(callId: string, call: ActiveAiCall): Promise<void> {
    // Prevent duplicate hangup processing
    if (call.hasEnded) {
      console.log(`[TelnyxAiBridge] Call hangup already processed for ${callId}, skipping`);
      return;
    }
    call.hasEnded = true;
    this.clearHardStopTimer(call);
    console.log(`[TelnyxAiBridge] Call hangup: ${callId}`);

    const { summary, transcript } = await call.agent.endConversation(call.disposition || "completed");
    const duration = Date.now() - call.startTime.getTime();
    const phase = call.agent.getCurrentPhase();
    const gatekeeperAttempts = call.agent.getGatekeeperAttempts();
    const disposition = this.mapPhaseToDisposition(call.disposition || "completed", phase, transcript);

    try {
      const queueItem = await storage.getQueueItemById(call.queueItemId);
      if (queueItem) {
        // NOTE: Lead creation is now handled by processDisposition() below
        // This ensures all qualified leads go through the standard disposition engine
        // which creates leads, updates queue status, and handles suppression consistently
        console.log(
          `[TelnyxAiBridge] Call ${callId} ending with disposition: ${disposition} (phase: ${phase})`
        );
      }

      // Update dialer_call_attempts with disposition if we have a callAttemptId
      // CRITICAL FIX: Use processDisposition() instead of direct DB update to ensure lead creation
      if (call.callAttemptId) {
        const canonicalDisposition = this.mapToCanonicalDisposition(disposition);
        
        // First update the call attempt record with call metadata
        await db
          .update(dialerCallAttempts)
          .set({
            dispositionSubmittedAt: new Date(),
            callEndedAt: new Date(),
            callDurationSeconds: Math.round(duration / 1000),
            connected: phase !== "opening" && phase !== "gatekeeper",
            voicemailDetected: disposition === "voicemail",
            updatedAt: new Date(),
          })
          .where(eq(dialerCallAttempts.id, call.callAttemptId));
        
        // Then process disposition through engine (creates leads, updates queue, handles suppression)
        try {
          // Pass transcript to disposition engine so it can be stored on the lead
          const cleanTranscript = (typeof transcript === 'string' ? transcript : JSON.stringify(transcript)) || "";
          
          const dispositionResult = await processDisposition(
            call.callAttemptId,
            canonicalDisposition,
            'telnyx_ai_bridge',
            {
                transcript: cleanTranscript
            }
          );
          
          if (dispositionResult.success) {
            console.log(`[TelnyxAiBridge] ✅ Disposition processed for ${call.callAttemptId}: ${canonicalDisposition}`, {
              leadCreated: !!dispositionResult.leadId,
              leadId: dispositionResult.leadId,
              actions: dispositionResult.actions
            });

            // Fallback: If disposition succeeded but no lead was created for a qualified call
            if (canonicalDisposition === 'qualified_lead' && !dispositionResult.leadId) {
              console.warn(`[TelnyxAiBridge] ⚠️ processDisposition succeeded but no lead created for qualified call ${call.callAttemptId} - attempting fallback`);
              const [attempt] = await db.select({ contactId: dialerCallAttempts.contactId, campaignId: dialerCallAttempts.campaignId })
                .from(dialerCallAttempts).where(eq(dialerCallAttempts.id, call.callAttemptId!)).limit(1);
              if (attempt?.contactId && attempt?.campaignId) {
                await createFallbackLead({
                  campaignId: attempt.campaignId,
                  contactId: attempt.contactId,
                  callDuration: Math.round(duration / 1000),
                  dialedNumber: call.dialedNumber,
                  transcript: cleanTranscript,
                  telnyxCallId: call.callControlId,
                  callAttemptId: call.callAttemptId!,
                  source: 'telnyx_ai_bridge (fallback after processDisposition success without lead)',
                });
              }
            }
          } else {
            console.error(`[TelnyxAiBridge] ⚠️ Disposition processing had errors:`, dispositionResult.errors);

            // Fallback: Create lead directly if disposition was qualified but engine returned errors
            if (canonicalDisposition === 'qualified_lead' && !dispositionResult.leadId) {
              const [attempt] = await db.select({ contactId: dialerCallAttempts.contactId, campaignId: dialerCallAttempts.campaignId })
                .from(dialerCallAttempts).where(eq(dialerCallAttempts.id, call.callAttemptId!)).limit(1);
              if (attempt?.contactId && attempt?.campaignId) {
                await createFallbackLead({
                  campaignId: attempt.campaignId,
                  contactId: attempt.contactId,
                  callDuration: Math.round(duration / 1000),
                  dialedNumber: call.dialedNumber,
                  transcript: cleanTranscript,
                  telnyxCallId: call.callControlId,
                  callAttemptId: call.callAttemptId!,
                  source: 'telnyx_ai_bridge (fallback after processDisposition errors)',
                });
              }
            }
          }
        } catch (dispError) {
          console.error(`[TelnyxAiBridge] ❌ Failed to process disposition for ${call.callAttemptId}:`, dispError);

          // Fallback: Create lead directly if disposition was qualified but engine threw
          if (canonicalDisposition === 'qualified_lead') {
            const [attempt] = await db.select({ contactId: dialerCallAttempts.contactId, campaignId: dialerCallAttempts.campaignId })
              .from(dialerCallAttempts).where(eq(dialerCallAttempts.id, call.callAttemptId!)).limit(1);
            if (attempt?.contactId && attempt?.campaignId) {
              const cleanTranscript = (typeof transcript === 'string' ? transcript : JSON.stringify(transcript)) || "";
              await createFallbackLead({
                campaignId: attempt.campaignId,
                contactId: attempt.contactId,
                callDuration: Math.round(duration / 1000),
                dialedNumber: call.dialedNumber,
                transcript: cleanTranscript,
                telnyxCallId: call.callControlId,
                callAttemptId: call.callAttemptId!,
                source: 'telnyx_ai_bridge (fallback after processDisposition exception)',
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[TelnyxAiBridge] Failed to create lead for AI call:`, error);
    }

    this.emit("call:ended", {
      callId,
      disposition: call.disposition || "completed",
      summary,
      transcript,
      duration,
      campaignId: call.campaignId,
      queueItemId: call.queueItemId,
    });

    // Update number pool stats if using pool number
    if (call.callerNumberId) {
      try {
        const durationSec = Math.round(duration / 1000);
        const canonicalDisposition = this.mapToCanonicalDisposition(disposition);
        await handleCallCompleted({
          numberId: call.callerNumberId,
          callSessionId: call.callSessionId,
          dialerAttemptId: call.callAttemptId,
          answered: call.isAnswered ?? false,
          durationSec,
          disposition: canonicalDisposition,
          failed: false,
          prospectNumber: call.dialedNumber || '',
          campaignId: call.campaignId,
        });
        console.log(`[TelnyxAiBridge] 📊 Number pool stats updated for ${call.callerNumberId}`);
      } catch (statsErr) {
        console.error(`[TelnyxAiBridge] Failed to update number pool stats:`, statsErr);
      }
    }

    if (call.mediaWs) {
      call.mediaWs.close();
    }

    // CRITICAL: Release semaphore slot when call ends normally (before deleting from map)
    this.releaseSlot(callId, call, 'hangup');
    this.activeCalls.delete(callId);
  }

  private mapPhaseToDisposition(disposition: string, phase: string, transcript?: string): string {
    // Handle explicit AI agent dispositions first
    if (disposition === "qualified_lead" || disposition === "qualified" || disposition === "handoff") {
      return "qualified";
    }
    if (disposition === "voicemail") return "voicemail";
    if (disposition === "do_not_call" || disposition === "dnc_request") return "do_not_call";
    if (disposition === "invalid_data" || disposition === "wrong_number") return "invalid_data";
    if (disposition === "no_answer") return "no-answer";
    // Handle callback requests as qualified (they showed interest!)
    if (disposition === "callback_requested" || disposition === "callback") return "qualified";

    // FIX: Only mark as not_interested if explicit negative keywords are found in transcript
    const hasExplicitRejection = this.hasExplicitNegativeKeywords(transcript);
    const qualityScore = this.calculateEngagementScore(transcript);

    // If disposition was marked as not_interested, verify with transcript analysis
    if (disposition === "not_interested") {
      // Override not_interested if high engagement score and no explicit rejection
      if (qualityScore >= 60 && !hasExplicitRejection) {
        console.log(`[TelnyxAiBridge] 🔄 Overriding not_interested due to high engagement (${qualityScore}) and no explicit rejection`);
        return "needs_review";
      }
      return "not_interested";
    }

    // Fall back to phase-based inference
    // REMOVED: "closing" phase is too ambiguous with AI screeners - do not auto-qualify
    // if (phase === "closing") return "qualified";

    // For pitch and objection_handling phases, check for explicit rejection
    // FIX: Don't automatically mark as not_interested without explicit negative keywords
    if (phase === "pitch" || phase === "objection_handling") {
      if (hasExplicitRejection) {
        console.log(`[TelnyxAiBridge] ❌ Marking as not_interested - explicit rejection found in transcript`);
        return "not_interested";
      }
      // High engagement means potential interest - needs human review
      if (qualityScore >= 50) {
        console.log(`[TelnyxAiBridge] 📊 High engagement score (${qualityScore}) in ${phase} phase - marking for review`);
        return "needs_review";
      }
      // Low engagement without explicit rejection - still needs review
      console.log(`[TelnyxAiBridge] ⚠️ No explicit rejection in ${phase} phase - marking for review`);
      return "needs_review";
    }

    if (phase === "gatekeeper") return "no-answer";
    // Treat early hangups with minimal interaction as no-answer so they can retry
    if (phase === "opening") return "no-answer";

    // Default: Unknown phases without explicit rejection should be reviewed, not dismissed
    if (hasExplicitRejection) {
      return "not_interested";
    }
    console.log(`[TelnyxAiBridge] ⚠️ Unknown phase "${phase}" - marking for review instead of auto-dismissing`);
    return "needs_review";
  }

  /**
   * Check for explicit negative keywords that indicate genuine disinterest
   * FIX: Only mark as not_interested if prospect explicitly says they don't want to be contacted
   */
  private hasExplicitNegativeKeywords(transcript?: string): boolean {
    if (!transcript) return false;

    const lowerTranscript = transcript.toLowerCase();

    // Explicit rejection phrases - must be clear and unambiguous
    const explicitRejectionPhrases = [
      "not interested",
      "no thank you",
      "no thanks",
      "don't call me",
      "do not call me",
      "stop calling",
      "remove me from",
      "take me off",
      "unsubscribe",
      "don't want",
      "do not want",
      "not looking for",
      "already have",
      "we're good",
      "we are good",
      "please don't contact",
      "please do not contact",
      "i'm not the right person",
      "i am not the right person",
      "wrong person",
      "don't need",
      "do not need",
      "never call",
      "hang up",
      "go away",
      "leave me alone",
      "i said no",
      "i already said no",
      "goodbye",
      "bye bye",
      "not for us",
      "not for me",
      "we don't do that",
      "we do not do that",
    ];

    for (const phrase of explicitRejectionPhrases) {
      if (lowerTranscript.includes(phrase)) {
        console.log(`[TelnyxAiBridge] 🚫 Found explicit rejection phrase: "${phrase}"`);
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate engagement score from transcript to detect genuine interest
   * Higher scores indicate more engagement, which suggests potential interest
   */
  private calculateEngagementScore(transcript?: string): number {
    if (!transcript) return 0;

    let score = 0;
    const lowerTranscript = transcript.toLowerCase();

    // Length-based scoring - longer conversations indicate more engagement
    const wordCount = transcript.split(/\s+/).length;
    if (wordCount > 100) score += 20;
    else if (wordCount > 50) score += 10;
    else if (wordCount > 25) score += 5;

    // Question count - prospect asking questions shows interest
    const questionCount = (transcript.match(/\?/g) || []).length;
    score += Math.min(questionCount * 5, 25); // Max 25 points for questions

    // Positive engagement indicators
    const positiveIndicators = [
      "tell me more",
      "how does that work",
      "what do you mean",
      "interesting",
      "sounds good",
      "that's good",
      "that is good",
      "i'd like",
      "i would like",
      "can you explain",
      "send me",
      "email me",
      "call me back",
      "when can",
      "how much",
      "what's the price",
      "what is the price",
      "what's the cost",
      "who is this",
      "what company",
      "let me think",
      "maybe",
      "possibly",
      "perhaps",
      "i might",
      "we might",
      "could be",
      "let me check",
      "hold on",
      "wait a minute",
      "one moment",
      "give me a second",
    ];

    for (const indicator of positiveIndicators) {
      if (lowerTranscript.includes(indicator)) {
        score += 10;
      }
    }

    // Cap score at 100
    return Math.min(score, 100);
  }

  // Map internal disposition to canonical disposition enum values
  // Canonical values: 'qualified_lead', 'not_interested', 'do_not_call', 'voicemail', 'no_answer', 'invalid_data'
  private mapToCanonicalDisposition(disposition: string): 'qualified_lead' | 'not_interested' | 'do_not_call' | 'voicemail' | 'no_answer' | 'invalid_data' | 'needs_review' {
    const d = disposition.toLowerCase();

    // Qualified outcomes - create lead
    if (d === "qualified" || d === "qualified_lead" || d === "handoff" || d === "meeting_booked") {
      console.log(`[TelnyxAiBridge] ✅ Mapping "${disposition}" to qualified_lead`);
      return "qualified_lead";
    }

    // Callback requested - schedule retry (needs review or standard retry)
    if (d === "callback_requested" || d === "callback") {
      return "needs_review"; 
    }

    // Voicemail - schedule retry
    if (d === "voicemail" || d === "machine") {
      return "voicemail";
    }

    // No answer scenarios - schedule retry
    if (d === "no-answer" || d === "no_answer" || d === "busy" || d === "failed") {
      return "no_answer";
    }

    // Explicit not interested - remove from campaign
    if (d === "not_interested" || d === "not interested") {
      return "not_interested";
    }

    // Do not call - add to global DNC
    if (d === "dnc" || d === "dnc_request" || d === "do_not_call") {
      return "do_not_call";
    }

    // Invalid data - mark phone as invalid
    if (d === "wrong_number" || d === "invalid" || d === "invalid_data") {
      return "invalid_data";
    }

    // BUG FIX: "needs_review", "connected", "completed" - these are ambiguous outcomes
    // where we connected but don't know the true disposition.
    // IMPORTANT: Don't dismiss these as "not_interested"!
    // Instead, treat as "no_answer" so they get scheduled for retry.
    // This gives prospects another chance rather than permanently removing them.
    if (d === "needs_review" || d === "connected" || d === "completed" || d === "pitch") {
      console.log(`[TelnyxAiBridge] ⚠️ Ambiguous disposition "${disposition}" - treating as no_answer for retry`);
      return "no_answer";
    }

    // BUG FIX: "hung_up" could mean they weren't interested OR the call dropped
    // Treat as no_answer for retry rather than permanently dismissing
    if (d === "hung_up") {
      console.log(`[TelnyxAiBridge] ⚠️ Hung up disposition - treating as no_answer for retry`);
      return "no_answer";
    }

    // Default: Unknown disposition - schedule retry rather than dismissing
    // This is a CRITICAL change from the previous "not_interested" default
    console.log(`[TelnyxAiBridge] ⚠️ Unknown disposition "${disposition}" - defaulting to no_answer for retry`);
    return "no_answer";
  }

  private async handleHandoff(callId: string, reason: string, transferNumber: string): Promise<void> {
    const activeCall = this.activeCalls.get(callId);
    if (!activeCall) return;

    console.log(`[TelnyxAiBridge] Initiating handoff for ${callId}: ${reason}`);
    activeCall.disposition = "handoff";

    try {
      await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${activeCall.callControlId}/actions/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: transferNumber,
        }),
      }, this.getApiKeyForCall(activeCall.callControlId));

      this.emit("call:transferred", { callId, reason, transferNumber });
    } catch (error) {
      console.error(`[TelnyxAiBridge] Transfer failed:`, error);
      this.emit("call:transfer_failed", { callId, error });
    }
  }

  // startMediaStreaming() removed - TeXML handles streaming automatically via <Stream bidirectionalMode="rtp" />

  private async hangupCall(callControlId: string): Promise<void> {
    await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }, this.getApiKeyForCall(callControlId));
  }

  private findCallByControlId(callControlId: string): ActiveAiCall | undefined {
    for (const [, call] of this.activeCalls) {
      if (call.callControlId === callControlId) {
        return call;
      }
    }
    return undefined;
  }

  private getCallIdByControlId(callControlId: string): string | undefined {
    for (const [callId, call] of this.activeCalls) {
      if (call.callControlId === callControlId) {
        return callId;
      }
    }
    return undefined;
  }

  getActiveCallsCount(): number {
    return this.activeCalls.size;
  }

  getActiveCall(callId: string): ActiveAiCall | undefined {
    return this.activeCalls.get(callId);
  }

  // Mark a call as answered (called from webhook when call.answered event is received)
  markCallAnswered(callControlId: string): boolean {
    for (const [callId, call] of this.activeCalls.entries()) {
      if (call.callControlId === callControlId) {
        call.isAnswered = true;
        console.log(`[TelnyxAiBridge] Call ${callId} marked as answered via webhook`);
        return true;
      }
    }
    console.log(`[TelnyxAiBridge] Could not find call to mark as answered: ${callControlId}`);
    return false;
  }

  // Mark a call as answered using the custom callId (e.g., ai-call-xxx)
  markCallAnsweredByCallId(callId: string): boolean {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.isAnswered = true;
      call.hasActiveWebSocket = true;
      console.log(`[TelnyxAiBridge] Call ${callId} marked as answered via WebSocket connection`);
      return true;
    }
    console.log(`[TelnyxAiBridge] Could not find call to mark as answered by callId: ${callId}`);
    return false;
  }

  // Notify that a call ended via WebSocket close (for Voice Dialer)
  async notifyCallEndedByCallId(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (call) {
      console.log(`[TelnyxAiBridge] WebSocket closed for call ${callId} - retaining bridge state until carrier hangup is confirmed`);
      call.hasActiveWebSocket = false;
      
      // Ensure disposition is set if missing
      if (!call.disposition) {
        call.disposition = call.isAnswered ? "completed" : "no-answer";
      }
    }
  }

  async processTranscribedSpeech(callId: string, text: string): Promise<string | null> {
    const call = this.activeCalls.get(callId);
    if (!call) return null;

    try {
      const response = await call.agent.generateResponse(text);
      return response;
    } catch (error) {
      console.error(`[TelnyxAiBridge] Error generating response:`, error);
      return null;
    }
  }

  // Handle simple webhook events from Telnyx (called from webhook route)
  // NOTE: This is the legacy Speak/Gather path. All calls (queue + test) now use
  // Gemini Live native audio via TeXML <Stream> → /voice-dialer WebSocket.
  // The 'answered' case here only applies to legacy Call Control API calls.
  async handleSimpleWebhookEvent(eventType: string, payload: any): Promise<void> {
    const callControlId = payload.call_control_id;
    const call = this.findCallByControlId(callControlId);
    const callId = this.getCallIdByControlId(callControlId);

    console.log(`[TelnyxAiBridge] Simple webhook event: ${eventType} for ${callControlId}, found call: ${!!call}`);

    switch (eventType) {
      case 'answered':
        if (call && callId) {
          call.isAnswered = true; // Mark as answered so polling loop knows
          console.log(`[TelnyxAiBridge] Call answered via webhook: ${callId}`);

          // Start recording immediately
          // We use dual channels for better transcription diarization (Agent vs Prospect)
          this.startRecording(callControlId).catch(err => {
            console.error(`[TelnyxAiBridge] Failed to start recording on answer:`, err);
          });

          // Speak opening message
          const openingMessage = call.agent.getOpeningMessage();
          const voiceSetting = call.agent.getVoiceSetting();
          await this.speakText(callControlId, openingMessage, voiceSetting);
        }
        // Test calls and TeXML calls are handled by Gemini Live native audio
        // via the /voice-dialer WebSocket stream - no TTS needed here
        break;

      case 'speak_ended':
        if (call && callId) {
          console.log(`[TelnyxAiBridge] Speak ended, starting gather for: ${callId}`);
          // After speaking, start gathering user speech
          await this.startGather(callControlId);
        }
        break;

      case 'gather_ended':
        if (call && callId) {
          const speechResult = payload.speech?.result || payload.digits;
          console.log(`[TelnyxAiBridge] Gather ended for ${callId}, speech: ${speechResult}`);
          
          if (speechResult && speechResult !== 'timeout') {
            // Generate AI response
            const response = await call.agent.generateResponse(speechResult);
            if (response) {
              const voiceSetting = call.agent.getVoiceSetting();
              await this.speakText(callControlId, response, voiceSetting);
            } else {
              // If no response, continue gathering
              await this.startGather(callControlId);
            }
          } else {
            // Timeout or no speech - prompt again or continue
            const promptMessage = "I'm sorry, I didn't catch that. Could you please repeat?";
            await this.speakText(callControlId, promptMessage);
          }
        }
        break;

      case 'hangup':
        if (call && callId) {
          console.log(`[TelnyxAiBridge] Call hangup via webhook: ${callId}, current disposition: ${call.disposition || 'none'}`);
          // Preserve AI-determined disposition; only default to 'completed' if none set
          if (!call.disposition) {
            call.disposition = 'completed';
          }
          await this.handleCallHangup(callId, call);
          this.activeCalls.delete(callId);
        }
        break;
    }
  }

  // Start recording the call
  private async startRecording(callControlId: string): Promise<void> {
    const callId = this.getCallIdByControlId(callControlId);
    console.log(`[TelnyxAiBridge] Starting recording for call: ${callControlId} (Call ID: ${callId})`);

    const response = await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/record_start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        format: "mp3",
        channels: "dual", // Stereo recording for better diarization
        play_beep: false,
      }),
    }, this.getApiKeyForCall(callControlId));

    if (!response.ok) {
      const errorText = await response.text();
      // Don't throw - recording failure shouldn't kill the call
      console.error(`[TelnyxAiBridge] Failed to start recording: ${response.status} - ${errorText}`);
    } else {
      console.log(`[TelnyxAiBridge] Recording started successfully for ${callControlId}`);
    }
  }

  // Start gathering speech input from the caller
  private async startGather(callControlId: string): Promise<void> {
    const callId = this.getCallIdByControlId(callControlId);
    const call = callId ? this.activeCalls.get(callId) : undefined;
    if (!call || !call.isAnswered) {
      console.warn(`[TelnyxAiBridge] Skipping gather; call ${callControlId} not answered yet or no active call`);
      return;
    }
    console.log(`[TelnyxAiBridge] Starting gather on call: ${callControlId}`);
    
    const response = await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/gather`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_type: "speech",
        speech_recognition_settings: {
          speech_start_timeout_millis: 10000,
          speech_end_threshold_millis: 1500,
          language: "en-US",
        },
        timeout_millis: 30000,
      }),
    }, this.getApiKeyForCall(callControlId));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TelnyxAiBridge] Failed to start gather: ${response.status} - ${errorText}`);
    } else {
      console.log(`[TelnyxAiBridge] Gather started successfully`);
    }
  }
}

let bridgeInstance: TelnyxAiBridge | null = null;

export function getTelnyxAiBridge(): TelnyxAiBridge {
  if (!bridgeInstance) {
    bridgeInstance = new TelnyxAiBridge();
  }
  return bridgeInstance;
}
