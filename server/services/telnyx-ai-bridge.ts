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
import { dialerCallAttempts } from "@shared/schema";
import { eq } from "drizzle-orm";
// Use dynamic import to avoid async module initialization issue with voice-dialer
// import { setAmdResultForSession } from "./voice-dialer";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

/**
 * Normalize phone number to E.164 format required by Telnyx
 * Examples:
 *   07542679573 -> +447542679573 (UK mobile)
 *   020 7123 4567 -> +442071234567 (UK landline)
 *   +441733712345 -> +441733712345 (already valid)
 *   001234567890 -> +1234567890 (US format)
 *   441733712345 -> +441733712345 (missing + only)
 *   6506468370 -> +16506468370 (US number without country code)
 *   3126072391 -> +13126072391 (US number without country code)
 */
function normalizeToE164(phoneNumber: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phoneNumber.replace(/[^\d+]/g, '');
  
  // If starts with +, check for invalid formats and fix them
  if (normalized.startsWith('+')) {
    // CRITICAL FIX: Handle bad data like "+07818517774" or "+0012026888819"
    // These are invalid E.164 - no country code starts with 0
    if (normalized.startsWith('+00')) {
      // International dial prefix was included: +0012345... -> +12345...
      normalized = '+' + normalized.substring(3);
    } else if (normalized.startsWith('+0')) {
      // UK national format with + added: +07818... -> +447818...
      // Check if it looks like a UK number (07=mobile, 01/02/03=landline)
      const withoutPlus = normalized.substring(1);
      if (/^0[1-9]/.test(withoutPlus)) {
        // UK national format - convert to +44
        normalized = '+44' + withoutPlus.substring(1);
      }
    }
    return normalized;
  }
  
  // Handle 00 prefix (international format used in UK/EU)
  if (normalized.startsWith('00')) {
    return '+' + normalized.substring(2);
  }
  
  // Handle UK numbers starting with 0 (national format)
  // UK mobiles: 07xxx, UK landlines: 01xxx, 02xxx, 03xxx
  if (/^0[1-9]/.test(normalized)) {
    // Remove leading 0 and add +44 for UK
    return '+44' + normalized.substring(1);
  }
  
  // Handle numbers that already have country code but missing +
  // Check for common country codes at start based on length patterns
  
  // UK numbers (44) - typically 12-13 digits with country code
  if (normalized.startsWith('44') && normalized.length >= 12 && normalized.length <= 13) {
    return '+' + normalized;
  }
  
  // US/Canada (1) - 11 digits with country code
  if (normalized.startsWith('1') && normalized.length === 11) {
    return '+' + normalized;
  }
  
  // Germany (49), France (33), Netherlands (31), etc - check for common EU codes
  const euCountryCodes = ['49', '33', '31', '34', '39', '46', '47', '48', '32', '43', '41'];
  for (const code of euCountryCodes) {
    if (normalized.startsWith(code) && normalized.length >= 10 && normalized.length <= 14) {
      return '+' + normalized;
    }
  }
  
  // Japan (81), India (91), Australia (61), etc
  const asiaPacificCodes = ['81', '91', '61', '86', '82', '65', '60', '63', '62'];
  for (const code of asiaPacificCodes) {
    if (normalized.startsWith(code) && normalized.length >= 10 && normalized.length <= 15) {
      return '+' + normalized;
    }
  }
  
  // If 10 digits and looks like US/Canada area code (not starting with 0 or 1)
  // US area codes start with 2-9, so 10-digit numbers starting with 2-9 are likely US
  if (normalized.length === 10 && /^[2-9]/.test(normalized)) {
    return '+1' + normalized;
  }
  
  // Default: assume missing + and add it
  // This handles cases where country code is present but + is missing
  return '+' + normalized;
}

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
  startTime: Date;
  disposition?: string;
  isAnswered?: boolean;
  hasEnded?: boolean; // Prevent duplicate hangup processing
  amdResult?: string;
  amdConfidence?: number;
}

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
  
  // Call metrics tracking
  private callDurations: number[] = [];
  private peakConcurrent: number = 0;
  private readonly METRICS_WINDOW = 100; // Keep last 100 calls for metrics
  
  // Audio cache for OpenAI TTS audio files (temporary storage)
  private audioCache: Map<string, Buffer> = new Map();

  constructor() {
    super();
    this.telnyxApiKey = process.env.TELNYX_API_KEY || "";
    this.webhookUrl = (process.env.TELNYX_WEBHOOK_URL || "").trim();

    // Allow overriding via env; enforce minimum of 1 to avoid deadlock
    const configuredMax = Number(process.env.TELNYX_MAX_CONCURRENT_CALLS || 8);
    this.MAX_CONCURRENT_CALLS = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 8;
    this.semaphore = new Semaphore(this.MAX_CONCURRENT_CALLS);
  }

  private async telnyxFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this.telnyxApiKey}`);
    }

    // Note: the standard RequestInit type doesn't include undici's dispatcher; omit for TS compatibility
    return fetch(url, {
      ...init,
      headers,
    });
  }
  
  // Format phone number to E.164 format (required by Telnyx)
  private formatToE164(phoneNumber: string): string {
    const formatted = normalizeToE164(phoneNumber);
    console.log(`[TelnyxAiBridge] Formatted phone: ${phoneNumber} -> ${formatted}`);
    return formatted;
  }
  
  // Get client state for a call by control ID (for AMD webhook processing)
  getClientStateByControlId(callControlId: string): any | null {
    return this.callStateByControlId.get(callControlId) || null;
  }
  
  // Get cached audio by ID (for serving to Telnyx)
  getAudio(audioId: string): Buffer | undefined {
    return this.audioCache.get(audioId);
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

  // Update peak concurrent tracking
  private updatePeakConcurrent(): void {
    const current = this.activeCalls.size;
    if (current > this.peakConcurrent) {
      this.peakConcurrent = current;
    }
  }

  // Get queue status
  getQueueStatus(): { activeCalls: number; queuedCalls: number; availableSlots: number } {
    return {
      activeCalls: this.activeCalls.size,
      queuedCalls: this.semaphore.queueLength,
      availableSlots: this.semaphore.available,
    };
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
    _provider: string = 'gemini_live' // ENFORCED: All calls use Gemini Live
  ): Promise<{ callId: string; callControlId: string }> {
    // ENFORCED: All AI voice calls route through Gemini Live
    // OpenAI Realtime is completely disabled
    const provider = 'gemini_live';

    // Global channel guard: wait for available Telnyx outbound slot
    const waitStart = Date.now();
    await this.semaphore.acquire();
    const waitedMs = Date.now() - waitStart;
    if (waitedMs > 0) {
      console.log(`[TelnyxAiBridge] ⏳ Queued call for ${phoneNumber} (${waitedMs}ms wait, max ${this.MAX_CONCURRENT_CALLS})`);
    }

    try {
      // Format phone numbers to E.164 format (required by Telnyx)
      phoneNumber = this.formatToE164(phoneNumber);
      fromNumber = this.formatToE164(fromNumber);

      console.log(`[TelnyxAiBridge] 🎤 Initiating AI call with ENFORCED provider: Gemini Live`);
      
      const contactFullName = [context.contactFirstName, context.contactLastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const preflight = await preflightVoiceVariableContract({
        agentName: context.agentFullName || settings.persona?.name || "",
        orgName: settings.persona?.companyName || "",
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
      const texmlAppId = process.env.TELNYX_TEXML_APP_ID;
      const callControlAppId = process.env.TELNYX_CALL_CONTROL_APP_ID || process.env.TELNYX_CONNECTION_ID;
      
      // Use TeXML API for automatic streaming setup via <Stream bidirectionalMode="rtp" />
      // Extract just the hostname from TELNYX_WEBHOOK_URL (e.g., "demandgentic.ai" from "https://demandgentic.ai/api/webhooks/telnyx")
      // Prefer explicit TeXML host override if provided
      let webhookHost = process.env.PUBLIC_TEXML_HOST || process.env.PUBLIC_WEBHOOK_HOST;
      if (!webhookHost && this.webhookUrl) {
        try {
          const url = new URL(this.webhookUrl);
          webhookHost = url.host; // Gets just "demandgentic.ai"
        } catch {
          // Fallback: strip protocol and path manually
          webhookHost = this.webhookUrl.replace('https://', '').replace('http://', '').split('/')[0];
        }
      }
      webhookHost = webhookHost || 'localhost';
      const texmlUrl = `https://${webhookHost}/api/texml/ai-call`;

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
        virtual_agent_id: metadata.virtualAgentId || null,
        provider: provider,
        // Include agent configuration for WebSocket session
        // system_prompt is built by Gemini Live Dialer from agent_settings
        first_message: settings.scripts?.opening || '',
        voice: settings.persona?.voice || 'nova',
        agent_name: settings.persona?.name || '',
        agent_settings: settings,
        // Contact context for personalization (using canonical field names)
        'contact.full_name': contactFullName || `${context.contactFirstName || ''} ${context.contactLastName || ''}`.trim(),
        'contact.first_name': context.contactFirstName || '',
        'contact.last_name': context.contactLastName || '',
        'contact.job_title': context.contactTitle || '',
        'account.name': context.companyName || '',
        // Legacy field names for backward compatibility
        contact_first_name: context.contactFirstName,
        contact_last_name: context.contactLastName,
        company_name: context.companyName,
      };
      const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');

      let response: Response | undefined;
      let useTexml = !!texmlAppId;
      
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
            StatusCallback: (process.env.TELNYX_WEBHOOK_URL || "").trim() || `https://${webhookHost}/api/webhooks/telnyx`,
            // Include client_state so AMD webhook receives call context
            ClientState: clientStateB64,
            // Enable call recording (all calls recorded for transcription and QA)
            Record: "true",
            RecordingChannels: "dual",
            RecordingFileFormat: "wav",
          }),
        });
        
        // If TeXML app doesn't exist (404), fall back to Call Control API
        if (response.status === 404) {
          console.warn(`[TelnyxAiBridge] TeXML App ID ${texmlAppId} not found, falling back to Call Control API`);
          useTexml = false;
        }
      }
      
      // Fallback to Call Control API if TeXML not available or failed
      if (!useTexml) {
        if (!callControlAppId) {
          throw new Error("No Telnyx Call Control App ID configured. Set TELNYX_CALL_CONTROL_APP_ID or TELNYX_TEXML_APP_ID");
        }
        
        console.log(`[TelnyxAiBridge] Initiating Call Control call with:
  - Connection ID: ${callControlAppId}
  - From: ${fromNumber}
  - To: ${phoneNumber}
  - Provider: ${provider}`);
        
        response = await this.telnyxFetch("https://api.telnyx.com/v2/calls", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connection_id: callControlAppId,
            to: phoneNumber,
            from: fromNumber,
            client_state: clientStateB64,
            // Prefer explicit webhook URL override for TeXML if provided
            webhook_url: (process.env.TELNYX_WEBHOOK_URL || "").trim() || `https://${webhookHost}/api/webhooks/telnyx`,
            // Enable call recording (all calls recorded for transcription and QA)
            record_type: "all",
            recording_channels: "dual",
            record_file_format: "wav",
            // Enable AMD (Answering Machine Detection)
            answering_machine_detection: "detect_words",
            answering_machine_detection_config: {
              // Detect after machine beep message ends
              after_greeting_silence_millis: 1200,
              // Wait for machine to finish speaking
              total_analysis_time_millis: 30000,
              // Minimum speech for machine detection
              initial_silence_timeout_millis: 5000,
              // Speech threshold for machine
              greeting_total_analysis_time_millis: 3500,
            },
          }),
        });
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
            .set({ telnyxCallId: callControlId })
            .where(eq(dialerCallAttempts.id, context.callAttemptId));
        } catch (error) {
          console.warn(`[TelnyxAiBridge] Failed to persist telnyxCallId for call attempt ${context.callAttemptId}:`, error);
        }
      }
      
      this.activeCalls.set(callId, {
        callControlId,
        callSessionId,
        agent,
        mediaWs: null,
        campaignId: context.campaignId,
        queueItemId: context.queueItemId,
        callAttemptId: context.callAttemptId || undefined,
        dialedNumber: phoneNumber,
        startTime: new Date(),
        isAnswered: false,
      });

      console.log(`[TelnyxAiBridge] AI call initiated: ${callId} -> ${phoneNumber}`);
      this.emit("call:initiated", { callId, callControlId, phoneNumber });

      // Start polling for call status since webhooks may not be configured
      this.pollCallStatus(callId, callControlId, agent);

      return { callId, callControlId };
    } catch (error) {
      console.error("[TelnyxAiBridge] Failed to initiate call:", error);
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

    console.log(`[TelnyxAiBridge] Webhook event: ${event_type} for call ${callId}`);

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
        console.log(`[TelnyxAiBridge] Media streaming started for ${callId}`);
        break;

      case "streaming.stopped":
        console.log(`[TelnyxAiBridge] Media streaming stopped for ${callId}`);
        break;

      default:
        console.log(`[TelnyxAiBridge] Unhandled event type: ${event_type}`);
    }
  }

  private async handleCallAnswered(callId: string, call: ActiveAiCall): Promise<void> {
    console.log(`[TelnyxAiBridge] Call answered: ${callId}`);
    call.isAnswered = true;

    // With TeXML, streaming is handled automatically via <Stream bidirectionalMode="rtp" />
    // The opening message will be sent through the OpenAI Realtime WebSocket connection
    // No need to call startMediaStreaming() or speakText() here

    await call.agent.startConversation();
    this.emit("call:answered", { callId });
  }

  private async pollCallStatus(callId: string, callControlId: string, agent: AiVoiceAgent): Promise<void> {
    let attempts = 0;
    const maxAttempts = 20; // Poll for up to 20 seconds
    const basePollInterval = 1000; // 1 second
    const mediaPollInterval = 5000; // Reduce polling when media is connected
    const maxPollInterval = 10000;
    const pollTimeoutMs = 5000;
    const jitterMs = 250;
    let hasSpoken = false;
    let consecutiveErrors = 0;

    const getPollDelay = (hasMediaConnection: boolean, isAnswered: boolean): number => {
      const baseInterval = hasMediaConnection && isAnswered ? mediaPollInterval : basePollInterval;
      if (consecutiveErrors === 0) {
        return baseInterval;
      }

      const backoff = Math.min(
        maxPollInterval,
        baseInterval * Math.pow(2, Math.min(consecutiveErrors, 4))
      );
      const jitter = Math.floor(Math.random() * jitterMs);
      return backoff + jitter;
    };

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        console.log(`[TelnyxAiBridge] Call ${callId} polling timeout - cleaning up`);
        // Set disposition to no_answer for timeout (call never connected)
        const timedOutCall = this.activeCalls.get(callId);
        if (timedOutCall && !timedOutCall.isAnswered) {
          timedOutCall.disposition = "no-answer";
          await this.handleCallHangup(callId, timedOutCall);
        }
        this.activeCalls.delete(callId);
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), pollTimeoutMs);
        const response = await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
          if (response.status === 404) {
            console.log(`[TelnyxAiBridge] Call ${callId} no longer exists (ended)`);
            // Call ended before we got the webhook - record disposition
            const endedCall = this.activeCalls.get(callId);
            if (endedCall) {
              // If never answered, treat as no_answer; otherwise disposition was set during call
              if (!endedCall.isAnswered && !endedCall.disposition) {
                endedCall.disposition = "no-answer";
              }
              await this.handleCallHangup(callId, endedCall);
            }
            this.activeCalls.delete(callId);
            return;
          }
          console.log(`[TelnyxAiBridge] Poll error: ${response.status}`);
          consecutiveErrors++;
          const activeCall = this.activeCalls.get(callId);
          const hasMediaConnection = activeCall?.mediaWs !== null;
          const isAnsweredViaWebhook = activeCall?.isAnswered === true;
          setTimeout(poll, getPollDelay(hasMediaConnection, isAnsweredViaWebhook));
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
        const hasMediaConnection = activeCall?.mediaWs !== null;

        console.log(`[TelnyxAiBridge] Call ${callId} is_alive: ${callData.is_alive}, state: ${callState}, webhookAnswered: ${isAnsweredViaWebhook}, hasMedia: ${hasMediaConnection}, attempt: ${attempts}`);

        // Call is alive if: API says so, OR we have a media WebSocket connection
        if (!isAlive && !hasMediaConnection) {
          console.log(`[TelnyxAiBridge] Call ${callId} ended (is_alive=false, no media)`);
          // Call handleCallHangup to record disposition (if webhook didn't arrive)
          const endedCall = this.activeCalls.get(callId);
          if (endedCall) {
            await this.handleCallHangup(callId, endedCall);
          }
          this.activeCalls.delete(callId);
          return;
        }

        // Check if call is answered via API state OR via webhook notification
        const isAnsweredViaApi = callState === 'answered' || callState === 'bridged' || callState === 'active';
        const isAnswered = isAnsweredViaApi || isAnsweredViaWebhook;

        // Start conversation when call is answered, or after max wait time as fallback
        if (isAlive && !hasSpoken && (isAnswered || attempts >= 20)) {
          hasSpoken = true;
          if (isAnsweredViaWebhook) {
            console.log(`[TelnyxAiBridge] Call ${callId} answered (via webhook notification)`);
          } else if (isAnsweredViaApi) {
            console.log(`[TelnyxAiBridge] Call ${callId} answered (state: ${callState})`);
          } else {
            console.log(`[TelnyxAiBridge] Call ${callId} assumed answered after ${attempts}s (state: ${callState})`);
          }

          console.log(`[TelnyxAiBridge] Starting OpenAI realtime path for ${callId}`);
          const openingMessage = agent.getOpeningMessage();
          const voiceSetting = agent.getVoiceSetting();
          await this.speakText(callControlId, openingMessage, voiceSetting);
          await agent.startConversation();

          // Wait for speak to finish, then start gathering
          setTimeout(async () => {
            console.log(`[TelnyxAiBridge] Starting gather after opening message for ${callId}`);
            await this.startGather(callControlId);
          }, 4000);
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
        console.log(`[TelnyxAiBridge] Call ${callControlId} ended during TTS - skipping fallbacks`);
        return;
      }
      console.warn(`[TelnyxAiBridge] Google TTS failed, attempting OpenAI fallback...`, error);
    }

    // 2. Try OpenAI TTS (Secondary - if key exists)
    const openaiApiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (openaiApiKey) {
      try {
        await this.speakWithOpenAI(callControlId, text, voice || "alloy", openaiApiKey);
        return;
      } catch (error: any) {
        // If call has ended, don't bother with final fallback
        if (error?.message?.includes('90018') || error?.message?.includes('already ended')) {
          console.log(`[TelnyxAiBridge] Call ${callControlId} ended during TTS - skipping final fallback`);
          return;
        }
        console.error(`[TelnyxAiBridge] OpenAI TTS failed:`, error);
      }
    }
    
    // 3. Fallback to Telnyx basic TTS (Last Resort)
    console.log(`[TelnyxAiBridge] Using Telnyx basic TTS (fallback)`);
    await this.speakWithTelnyxTTS(callControlId, text, voice);
  }

  private async speakWithGoogle(callControlId: string, text: string, voice: string): Promise<void> {
    const ttsClient = new TextToSpeechClient();
    
    // Map OpenAI/Gemini voice names to Google Cloud Journey/Studio voices
    // alloy/shimmer/nova/aoede/kore -> Female Journey (F)
    // echo/fable/onyx/puck/charon -> Male Journey (D)
    const voiceLower = voice.toLowerCase();
    
    let googleVoice = "en-US-Journey-F"; // Default Female
    // Male indicators found in OpenAI/Gemini voice names
    if (["echo", "fable", "onyx", "ash", "charon", "fenrir", "puck"].some(v => voiceLower.includes(v))) {
        googleVoice = "en-US-Journey-D"; // Male
    }

    console.log(`[TelnyxAiBridge] Generating natural speech with Google TTS (voice: ${googleVoice} from ${voice})`);
    
    const request = {
      input: { text },
      voice: { languageCode: "en-US", name: googleVoice },
      audioConfig: { audioEncoding: "MP3" as const },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    
    if (!response.audioContent) {
        throw new Error("Google TTS produced no audio content");
    }

    // Google Cloud returns a Buffer or Uint8Array
    const audioBuffer = Buffer.from(response.audioContent);
    const audioId = `google-audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp3`;
    const s3Key = `ai-call-audio/${audioId}`;
    
    await uploadToS3(s3Key, audioBuffer, "audio/mpeg");
    
    // valid for 5 mins
    const audioUrl = await getPresignedDownloadUrl(s3Key, 300);
    // Log simpler URL for cleanliness
    console.log(`[TelnyxAiBridge] Playing Google TTS audio from S3: ${audioUrl.split("?")[0]}... (${audioBuffer.byteLength} bytes)`);

    // Telnyx Playback
    const telnyxResponse = await this.telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/playback_start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
      }),
    });

    if (!telnyxResponse.ok) {
      const errorText = await telnyxResponse.text();
      throw new Error(`Telnyx playback_start failed: ${telnyxResponse.status} - ${errorText}`);
    }
  }

  private async speakWithOpenAI(callControlId: string, text: string, voice: string, apiKey: string): Promise<void> {
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
    });

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
    });

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

    if (amdResult === "machine" || amdResult?.startsWith('machine_end') || amdResult === "fax") {
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
    console.log(`[TelnyxAiBridge] Call hangup: ${callId}`);

    const { summary, transcript } = await call.agent.endConversation(call.disposition || "completed");
    const duration = Date.now() - call.startTime.getTime();
    const phase = call.agent.getCurrentPhase();
    const gatekeeperAttempts = call.agent.getGatekeeperAttempts();
    const disposition = this.mapPhaseToDisposition(call.disposition || "completed", phase);

    try {
      const queueItem = await storage.getQueueItemById(call.queueItemId);
      if (queueItem) {
        
        // Fetch contact info for lead record
        const contact = await storage.getContact(queueItem.contactId);
        const contactName = contact?.fullName || 
          (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` : 
           contact?.firstName || contact?.lastName || 'Unknown');
        
        const shouldCreateLead = disposition === "qualified" || disposition === "callback_requested" || disposition === "handoff" || disposition === "meeting_booked";
        if (!shouldCreateLead) {
          console.log(
            `[TelnyxAiBridge] Skipping lead creation for AI call ${callId} (disposition=${disposition})`
          );
        } else {
          const existingLead = await storage.findLeadByAiCallId(callId);
          if (existingLead) {
            console.log(`[TelnyxAiBridge] Lead already exists for AI call ${callId}, skipping duplicate`);
          } else {
          await storage.createLead({
            campaignId: call.campaignId,
            contactId: queueItem.contactId,
            contactName: contactName,
            contactEmail: contact?.email || undefined,
            accountName: contact?.companyNorm || undefined,
            callAttemptId: call.callAttemptId || undefined,
            agentId: null,
            qaStatus: "new",
            notes: `[AI Agent Call] ${summary}\n\nPhase: ${phase}\nGatekeeper Attempts: ${gatekeeperAttempts}\nDuration: ${Math.round(duration / 1000)}s\n\nTranscript:\n${transcript}`,
            callDuration: Math.round(duration / 1000),
            dialedNumber: call.dialedNumber || undefined,
            telnyxCallId: call.callControlId,
            customFields: {
              aiCallId: callId,
              aiPhase: phase,
              aiDisposition: disposition,
              aiGatekeeperAttempts: gatekeeperAttempts,
                aiHandoff: call.disposition === "handoff",
              },
            });

            console.log(`[TelnyxAiBridge] Lead created for AI call ${callId}`);
          }
        }

        await storage.updateQueueStatus(call.queueItemId, "done");
      }

      // Update dialer_call_attempts with disposition if we have a callAttemptId
      if (call.callAttemptId) {
        const canonicalDisposition = this.mapToCanonicalDisposition(disposition);
        await db
          .update(dialerCallAttempts)
          .set({
            disposition: canonicalDisposition,
            dispositionSubmittedAt: new Date(),
            callEndedAt: new Date(),
            callDurationSeconds: Math.round(duration / 1000),
            connected: phase !== "opening" && phase !== "gatekeeper",
            voicemailDetected: disposition === "voicemail",
            updatedAt: new Date(),
          })
          .where(eq(dialerCallAttempts.id, call.callAttemptId));
        console.log(`[TelnyxAiBridge] Updated call attempt ${call.callAttemptId} with disposition: ${canonicalDisposition}`);
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

    if (call.mediaWs) {
      call.mediaWs.close();
    }

    this.activeCalls.delete(callId);
  }

  private mapPhaseToDisposition(disposition: string, phase: string): string {
    // Handle explicit AI agent dispositions first
    if (disposition === "qualified_lead" || disposition === "qualified" || disposition === "handoff") {
      return "qualified";
    }
    if (disposition === "voicemail") return "voicemail";
    if (disposition === "not_interested") return "not_interested";
    if (disposition === "do_not_call" || disposition === "dnc_request") return "do_not_call";
    if (disposition === "invalid_data" || disposition === "wrong_number") return "invalid_data";
    if (disposition === "no_answer") return "no-answer";
    // Handle callback requests as qualified (they showed interest!)
    if (disposition === "callback_requested" || disposition === "callback") return "qualified";

    // Fall back to phase-based inference
    // BUG FIX: "closing" phase means prospect engaged through the full pitch - likely qualified
    if (phase === "closing") return "qualified";
    // FIX: "pitch" phase means we connected and pitched - if no disposition, likely not interested
    // Previously returned "needs_review" which caused retry loops
    if (phase === "pitch") return "not_interested";
    if (phase === "gatekeeper") return "no-answer";
    // FIX: "objection_handling" means prospect objected - they're not interested
    // Previously returned "needs_review" causing wasted retries
    if (phase === "objection_handling") return "not_interested";
    // Default for unknown phases with human contact - likely not interested
    // This prevents wasted retry cycles on prospects who already declined
    return "not_interested";
  }

  // Map internal disposition to canonical disposition enum values
  // Canonical values: 'qualified_lead', 'not_interested', 'do_not_call', 'voicemail', 'no_answer', 'invalid_data'
  private mapToCanonicalDisposition(disposition: string): 'qualified_lead' | 'not_interested' | 'do_not_call' | 'voicemail' | 'no_answer' | 'invalid_data' {
    const d = disposition.toLowerCase();

    // Qualified outcomes - create lead
    if (d === "qualified" || d === "handoff" || d === "meeting_booked" || d === "callback_requested" || d === "callback") {
      console.log(`[TelnyxAiBridge] ✅ Mapping "${disposition}" to qualified_lead`);
      return "qualified_lead";
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
      });

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
    });
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
      console.log(`[TelnyxAiBridge] Call ${callId} marked as answered via WebSocket connection`);
      return true;
    }
    console.log(`[TelnyxAiBridge] Could not find call to mark as answered by callId: ${callId}`);
    return false;
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
          // Speak opening message
          const openingMessage = call.agent.getOpeningMessage();
          const voiceSetting = call.agent.getVoiceSetting();
          await this.speakText(callControlId, openingMessage, voiceSetting);
        }
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
    });

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
