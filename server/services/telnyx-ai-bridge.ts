import { EventEmitter } from "events";
import WebSocket from "ws";
import { AiVoiceAgent, AiAgentSettings, CallContext, createAiVoiceAgent } from "./ai-voice-agent";
import { storage } from "../storage";
import { uploadToS3, getPresignedDownloadUrl } from "../lib/s3";
import { preflightVoiceVariableContract, VoiceVariablePreflightError } from "./voice-variable-contract";

/**
 * Normalize phone number to E.164 format required by Telnyx/OpenAI
 * Examples:
 *   07542679573 -> +447542679573 (UK mobile)
 *   020 7123 4567 -> +442071234567 (UK landline)
 *   +441733712345 -> +441733712345 (already valid)
 *   001234567890 -> +1234567890 (US format)
 *   441733712345 -> +441733712345 (missing + only)
 */
function normalizeToE164(phoneNumber: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phoneNumber.replace(/[^\d+]/g, '');
  
  // If already starts with +, it should be valid E.164
  if (normalized.startsWith('+')) {
    return normalized;
  }
  
  // Handle UK numbers starting with 0 (national format)
  // UK mobiles: 07xxx, UK landlines: 01xxx, 02xxx, 03xxx
  if (/^0[1-9]/.test(normalized)) {
    // Remove leading 0 and add +44 for UK
    return '+44' + normalized.substring(1);
  }
  
  // Handle numbers that already have country code but missing +
  // e.g., 441234567890 or 12125551234
  if (normalized.length >= 10) {
    // Check for common country codes at start
    if (normalized.startsWith('44') && normalized.length >= 12) {
      // UK number without +
      return '+' + normalized;
    }
    if (normalized.startsWith('1') && normalized.length === 11) {
      // US/Canada number without +
      return '+' + normalized;
    }
  }
  
  // Handle 00 prefix (international format used in UK/EU)
  if (normalized.startsWith('00')) {
    return '+' + normalized.substring(2);
  }
  
  // Default: assume missing + and add it
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
  startTime: Date;
  disposition?: string;
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
  
  // Concurrency control - max 10 concurrent calls for AI agents
  private readonly MAX_CONCURRENT_CALLS = 10;
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
    this.webhookUrl = process.env.TELNYX_WEBHOOK_URL || "";
    this.semaphore = new Semaphore(this.MAX_CONCURRENT_CALLS);
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
      queuedCalls: this.callQueue.length,
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
    provider: string = 'openai_realtime'
  ): Promise<{ callId: string; callControlId: string }> {
    console.log(`[TelnyxAiBridge] Using Telnyx direct call with provider: ${provider}`);
    
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

    try {
      // For TeXML outbound calls, prioritize TeXML App ID
      const connectionId = process.env.TELNYX_TEXML_APP_ID || process.env.TELNYX_CONNECTION_ID || process.env.TELNYX_CALL_CONTROL_APP_ID;

      // Use TeXML API for automatic streaming setup via <Stream bidirectionalMode="rtp" />
      const webhookHost = process.env.PUBLIC_WEBHOOK_HOST || this.webhookUrl.replace('https://', '').replace('http://', '');
      const texmlUrl = `https://${webhookHost}/api/texml/ai-call`;

      // Build comprehensive client_state for OpenAI Realtime Dialer
      // This data will be passed through TeXML -> WebSocket connection
      const customParams = {
        call_id: callId,
        run_id: `run-${Date.now()}`,
        campaign_id: context.campaignId,
        queue_item_id: context.queueItemId,
        call_attempt_id: `attempt-${Date.now()}`,
        contact_id: (context as any).contactId || '',
        virtual_agent_id: (context as any).virtualAgentId || '',
        provider: provider,
        // Include agent configuration for WebSocket session
        // system_prompt is built by OpenAI Realtime Dialer from agent_settings
        first_message: settings.scripts?.opening || '',
        voice: settings.persona?.voice || 'nova',
        agent_name: settings.persona?.name || '',
        agent_settings: settings,
        // Contact context for personalization
        contact_first_name: context.contactFirstName,
        contact_last_name: context.contactLastName,
        company_name: context.companyName,
      };
      const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');

      console.log(`[TelnyxAiBridge] Initiating TeXML call with:
  - TeXML URL: ${texmlUrl}
  - Connection ID: ${connectionId}
  - From: ${fromNumber}
  - To: ${phoneNumber}
  - Provider: ${provider}`);

      const response = await fetch("https://api.telnyx.com/v2/texml/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.telnyxApiKey}`,
        },
        body: JSON.stringify({
          application_id: connectionId, // Use application_id for TeXML calls
          to: phoneNumber,
          from: fromNumber,
          url: texmlUrl,
          client_state: clientStateB64,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Telnyx API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const callControlId = result.data.call_control_id;
      const callSessionId = result.data.call_session_id;

      this.activeCalls.set(callId, {
        callControlId,
        callSessionId,
        agent,
        mediaWs: null,
        campaignId: context.campaignId,
        queueItemId: context.queueItemId,
        startTime: new Date(),
      });

      console.log(`[TelnyxAiBridge] AI call initiated: ${callId} -> ${phoneNumber}`);
      this.emit("call:initiated", { callId, callControlId, phoneNumber });

      // Start polling for call status since webhooks may not be configured
      this.pollCallStatus(callId, callControlId, agent);

      return { callId, callControlId };
    } catch (error) {
      console.error("[TelnyxAiBridge] Failed to initiate call:", error);
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

    // With TeXML, streaming is handled automatically via <Stream bidirectionalMode="rtp" />
    // The opening message will be sent through the OpenAI Realtime WebSocket connection
    // No need to call startMediaStreaming() or speakText() here

    await call.agent.startConversation();
    this.emit("call:answered", { callId });
  }

  private async pollCallStatus(callId: string, callControlId: string, agent: AiVoiceAgent): Promise<void> {
    let attempts = 0;
    const maxAttempts = 20; // Poll for up to 20 seconds
    const pollInterval = 1000; // 1 second
    let hasSpoken = false;

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        console.log(`[TelnyxAiBridge] Call ${callId} polling timeout - cleaning up`);
        this.activeCalls.delete(callId);
        return;
      }

      try {
        const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}`, {
          headers: {
            Authorization: `Bearer ${this.telnyxApiKey}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            console.log(`[TelnyxAiBridge] Call ${callId} no longer exists (ended)`);
            this.activeCalls.delete(callId);
            return;
          }
          console.log(`[TelnyxAiBridge] Poll error: ${response.status}`);
          setTimeout(poll, pollInterval);
          return;
        }

        const data = await response.json();
        const callData = data.data || data;
        const isAlive = callData.is_alive;
        
        console.log(`[TelnyxAiBridge] Call ${callId} is_alive: ${isAlive}, attempt: ${attempts}`);

        if (!isAlive) {
          console.log(`[TelnyxAiBridge] Call ${callId} ended (is_alive=false)`);
          this.activeCalls.delete(callId);
          return;
        }

        // Wait 10 seconds (attempts >= 10) then assume answered and start conversation
        // This gives time for the call to connect and for AMD to complete
        if (isAlive && attempts >= 10 && !hasSpoken) {
          hasSpoken = true;
          console.log(`[TelnyxAiBridge] Call ${callId} assumed answered after ${attempts}s`);
          
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
        setTimeout(poll, pollInterval);
      } catch (error) {
        console.error(`[TelnyxAiBridge] Poll error for call ${callId}:`, error);
        setTimeout(poll, pollInterval);
      }
    };

    // Start polling after initial delay for call to connect
    setTimeout(poll, 2000);
  }

  private async speakText(callControlId: string, text: string, voice?: string): Promise<void> {
    // Prefer OpenAI TTS, fall back to Telnyx basic TTS
    const openaiApiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    
    if (openaiApiKey) {
      try {
        await this.speakWithOpenAI(callControlId, text, voice || "nova", openaiApiKey);
        return;
      } catch (error) {
        console.error(`[TelnyxAiBridge] OpenAI TTS failed:`, error);
      }
    }
    
    // Fallback to Telnyx basic TTS
    console.log(`[TelnyxAiBridge] Using Telnyx basic TTS (no OpenAI key)`);
    await this.speakWithTelnyxTTS(callControlId, text, voice);
  }

  private async speakWithOpenAI(callControlId: string, text: string, voice: string, apiKey: string): Promise<void> {
    // OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer
    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const selectedVoice = validVoices.includes(voice) ? voice : "nova";
    
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
    const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/playback_start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.telnyxApiKey}`,
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
    
    const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.telnyxApiKey}`,
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
    console.log(`[TelnyxAiBridge] AMD result for ${callId}: ${amdResult}`);

    if (amdResult === "machine") {
      call.disposition = "voicemail";
      await this.hangupCall(call.callControlId);
      this.emit("call:voicemail", { callId });
    } else if (amdResult === "human") {
      this.emit("call:human_detected", { callId });
    }
  }

  private async handleCallHangup(callId: string, call: ActiveAiCall): Promise<void> {
    console.log(`[TelnyxAiBridge] Call hangup: ${callId}`);

    const { summary, transcript } = await call.agent.endConversation(call.disposition || "completed");
    const duration = Date.now() - call.startTime.getTime();
    const phase = call.agent.getCurrentPhase();
    const gatekeeperAttempts = call.agent.getGatekeeperAttempts();

    try {
      const queueItem = await storage.getQueueItemById(call.queueItemId);
      if (queueItem) {
        const disposition = this.mapPhaseToDisposition(call.disposition || "completed", phase);
        
        await storage.createLead({
          campaignId: call.campaignId,
          contactId: queueItem.contactId,
          agentId: null,
          qaStatus: "new",
          notes: `[AI Agent Call] ${summary}\n\nPhase: ${phase}\nGatekeeper Attempts: ${gatekeeperAttempts}\nDuration: ${Math.round(duration / 1000)}s\n\nTranscript:\n${transcript}`,
          callDuration: Math.round(duration / 1000),
          customFields: {
            aiCallId: callId,
            aiPhase: phase,
            aiDisposition: disposition,
            aiGatekeeperAttempts: gatekeeperAttempts,
            aiHandoff: call.disposition === "handoff",
          },
        });

        await storage.updateQueueStatus(call.queueItemId, "done");

        console.log(`[TelnyxAiBridge] Lead created for AI call ${callId}`);
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
    if (disposition === "voicemail") return "voicemail";
    if (disposition === "handoff") return "qualified";
    if (phase === "pitch" || phase === "closing") return "connected";
    if (phase === "gatekeeper") return "no-answer";
    if (phase === "objection_handling") return "not_interested";
    return "connected";
  }

  private async handleHandoff(callId: string, reason: string, transferNumber: string): Promise<void> {
    const activeCall = this.activeCalls.get(callId);
    if (!activeCall) return;

    console.log(`[TelnyxAiBridge] Initiating handoff for ${callId}: ${reason}`);
    activeCall.disposition = "handoff";

    try {
      await fetch(`https://api.telnyx.com/v2/calls/${activeCall.callControlId}/actions/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.telnyxApiKey}`,
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
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.telnyxApiKey}`,
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
          console.log(`[TelnyxAiBridge] Call hangup via webhook: ${callId}`);
          call.disposition = 'completed';
          await this.handleCallHangup(callId, call);
          this.activeCalls.delete(callId);
        }
        break;
    }
  }

  // Start gathering speech input from the caller
  private async startGather(callControlId: string): Promise<void> {
    console.log(`[TelnyxAiBridge] Starting gather on call: ${callControlId}`);
    
    const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/gather`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.telnyxApiKey}`,
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
