/**
 * Unified SIP Dialer Service
 *
 * This is the main entry point for SIP-based calling.
 * It integrates:
 * - Drachtio SIP Server for call signaling
 * - Media Bridge on VM for RTP ↔ Gemini audio bridging
 * - Campaign orchestrator integration
 *
 * Architecture:
 * - Cloud Run handles SIP signaling via Drachtio daemon (TCP 9022)
 * - Drachtio VM runs the media bridge (RTP UDP + Gemini WebSocket)
 * - Cloud Run tells the VM media bridge to create/destroy sessions via HTTP
 *
 * Note: Database operations (call attempts, sessions) are handled by the
 * campaign orchestrator. This module only handles SIP signaling and audio.
 */

import * as mediaBridgeClient from './media-bridge-client';
import { drachtioServer } from './drachtio-server';
import { v4 as uuidv4 } from 'uuid';
import { buildSipRuntimePrompt } from './sip-runtime-prompt';

// Feature flag for SIP calling
const USE_SIP_CALLING = process.env.USE_SIP_CALLING === 'true';

// Hard ceiling: no SIP call can ever exceed this duration (seconds)
const SIP_MAX_CALL_DURATION_SECONDS = 240;

// Track active hard-stop timers so we can clear them on normal hang-up
const sipHardStopTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Call initiation parameters
 */
export interface InitiateCallParams {
  toNumber: string;
  fromNumber: string;
  campaignId: string;
  contactId: string;
  queueItemId: string;
  voiceName?: string;
  systemPrompt?: string;
  // Contact context
  contactName?: string;
  contactFirstName?: string;
  contactJobTitle?: string;
  accountName?: string;
  // Campaign context
  campaignName?: string;
  organizationName?: string;
  campaignType?: string | null;
  campaignObjective?: string;
  successCriteria?: string;
  targetAudienceDescription?: string;
  productServiceInfo?: string;
  talkingPoints?: string[];
  campaignContextBrief?: string | null;
  callFlow?: unknown;
  firstMessage?: string;
  maxCallDurationSeconds?: number;
  // Number pool tracking
  callerNumberId?: string | null;
  callerNumberDecisionId?: string | null;
  // Call attempt tracking (for disposition processing)
  callAttemptId?: string | null;
  previewSessionId?: string | null;
  telephonyProviderOverride?: {
    sipDomain?: string;
    sipProxy?: string;
    sipPort?: number;
    sipTransport?: "udp" | "tcp" | "tls" | "wss";
    sipUsername?: string;
    sipPassword?: string;
  };
  // AI provider for the media bridge (default: gemini)
  aiProvider?: 'gemini' | 'openai';
  openaiApiKey?: string;
  openaiVoice?: string;
}

/**
 * Call result
 */
export interface CallResult {
  success: boolean;
  callId?: string;
  callControlId?: string; // For compatibility with Telnyx API bridge
  g711Format?: 'ulaw' | 'alaw';
  error?: string;
}

/**
 * Initialize SIP dialer on server startup
 */
export async function initializeSipDialer(): Promise<boolean> {
  if (!USE_SIP_CALLING) {
    console.log('[SIP Dialer] SIP calling disabled (USE_SIP_CALLING=false)');
    return false;
  }

  console.log('[SIP Dialer] Initializing with Drachtio...');

  try {
    // Initialize Drachtio SIP server
    const drachtioReady = await drachtioServer.initialize();
    if (drachtioReady) {
      console.log('[SIP Dialer] Drachtio SIP server initialized successfully');
    } else {
      console.warn('[SIP Dialer] Drachtio initialization failed - SIP calls may not work');
    }

    // Check media bridge availability
    if (mediaBridgeClient.isMediaBridgeConfigured()) {
      const health = await mediaBridgeClient.getMediaBridgeHealth();
      if (health.available) {
        console.log('[SIP Dialer] Media bridge available on VM');
      } else {
        console.warn(`[SIP Dialer] Media bridge not reachable: ${health.error}`);
      }
    } else {
      console.warn('[SIP Dialer] Media bridge not configured (MEDIA_BRIDGE_HOST / PUBLIC_IP not set)');
    }

    console.log('[SIP Dialer] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[SIP Dialer] Initialization error:', error);
    return false;
  }
}

/**
 * Check if SIP dialer is ready for outbound calls
 * Returns true only if SIP calling is enabled AND drachtio can make outbound calls
 */
export function isReady(): boolean {
  if (!USE_SIP_CALLING) return false;

  // Check if Drachtio is connected AND can make outbound calls
  const stats = drachtioServer.getStats();
  const ready = stats.connected && stats.canMakeOutboundCalls;

  if (stats.connected && !stats.canMakeOutboundCalls) {
    console.log('[SIP Dialer] Drachtio connected but cannot make outbound calls - falling back to Telnyx API');
    if (stats.lastConnectionError) {
      console.log(`[SIP Dialer] Reason: ${stats.lastConnectionError}`);
    }
  }

  return ready;
}

/**
 * Build system prompt for the media bridge Gemini session
 */
function buildSystemPrompt(params: InitiateCallParams, callId: string): string {
  return buildSipRuntimePrompt({
    sessionId: callId,
    voiceName: params.voiceName,
    systemPrompt: params.systemPrompt,
    contactName: params.contactName,
    contactFirstName: params.contactFirstName,
    contactJobTitle: params.contactJobTitle,
    accountName: params.accountName,
    organizationName: params.organizationName,
    campaignName: params.campaignName,
    campaignType: params.campaignType,
    campaignObjective: params.campaignObjective,
    successCriteria: params.successCriteria,
    targetAudienceDescription: params.targetAudienceDescription,
    productServiceInfo: params.productServiceInfo,
    talkingPoints: params.talkingPoints,
    campaignContextBrief: params.campaignContextBrief,
    callFlow: params.callFlow,
  });
}

/**
 * Initiate an AI voice call via SIP
 *
 * Flow:
 * 1. Initiate SIP call via Drachtio → waits for call to be answered
 * 2. After answer, create media bridge on VM with RTP port + remote endpoint
 * 3. Media bridge handles RTP ↔ Gemini bidirectional audio
 */
export async function initiateAiCall(params: InitiateCallParams): Promise<CallResult> {
  const callId = uuidv4();

  console.log(`[SIP Dialer] Initiating call ${callId} to ${params.toNumber}`);

  try {
    // Step 1: Initiate SIP call via Drachtio (returns when call is answered)
    const sipResult = await drachtioServer.initiateCall({
      to: params.toNumber,
      from: params.fromNumber,
      campaignId: params.campaignId,
      contactId: params.contactId,
      queueItemId: params.queueItemId,
      telephonyProviderOverride: params.telephonyProviderOverride,
      onCallStateChanged: (state: string) => {
        console.log(`[SIP Dialer] Call ${callId} state: ${state}`);
      },
      onCallEnded: async (reason: string) => {
        console.log(`[SIP Dialer] Call ${callId} ended: ${reason}`);
        // Clear hard-stop timer on natural hang-up
        const t = sipHardStopTimers.get(sipResult?.callId || callId);
        if (t) { clearTimeout(t); sipHardStopTimers.delete(sipResult?.callId || callId); }
        // Destroy media bridge on VM
        await mediaBridgeClient.destroyMediaBridge(sipResult.callId || callId);
      },
    });

    if (!sipResult.success) {
      throw new Error(`Failed to initiate SIP call: ${sipResult.error}`);
    }

    // Step 2: Create media bridge on VM for RTP ↔ Gemini
    if (mediaBridgeClient.isMediaBridgeConfigured() && sipResult.rtpPort && sipResult.remoteAddress && sipResult.remotePort) {
      const systemPrompt = buildSystemPrompt(params, sipResult.callId);

      const aiProvider = params.aiProvider || 'gemini'; // Default to Gemini Live for AI calls
      const bridgeResult = await mediaBridgeClient.createMediaBridge({
        callId: sipResult.callId,
        rtpPort: sipResult.rtpPort,
        remoteAddress: sipResult.remoteAddress,
        remotePort: sipResult.remotePort,
        g711Format: sipResult.g711Format,
        systemPrompt,
        voiceName: params.voiceName,
        toPhoneNumber: params.toNumber,
        contactName: params.contactName || params.contactFirstName,
        firstMessage: params.firstMessage,
        context: {
          campaignId: params.campaignId,
          contactId: params.contactId,
          queueItemId: params.queueItemId,
          callerNumberId: params.callerNumberId,
          phoneNumber: params.toNumber,
          callAttemptId: params.callAttemptId,
          previewSessionId: params.previewSessionId,
          // Safety hints for the SIP media bridge runtime
          voicemailAutoHangup: true,
          voicemailSilenceGuardMs: 10000,
          voicemailBeepLoopGuard: true,
        },
        maxDurationSeconds: params.maxCallDurationSeconds,
        provider: aiProvider,
        openaiApiKey: params.openaiApiKey,
        openaiVoice: params.openaiVoice || 'shimmer',
      });
      console.log(`[SIP Dialer] Media bridge provider: ${aiProvider}`);

      if (bridgeResult.success) {
        console.log(`[SIP Dialer] Media bridge created for ${sipResult.callId}`);
      } else {
        console.error(`[SIP Dialer] Media bridge creation failed: ${bridgeResult.error}`);
        // Call is still connected — just no audio. Log but don't fail the call.
      }
    } else if (!mediaBridgeClient.isMediaBridgeConfigured()) {
      console.warn(`[SIP Dialer] Media bridge not configured — call ${sipResult.callId} has no audio path`);
    } else {
      console.warn(`[SIP Dialer] Missing media info for ${sipResult.callId} — no media bridge created`);
    }

    console.log(`[SIP Dialer] Call ${callId} initiated successfully`);

    // Schedule server-side hard-stop timer for SIP calls
    // This is critical: the VM media bridge may not enforce duration, and
    // without this the SIP call can stay connected indefinitely.
    const effectiveMaxDuration = Math.min(
      params.maxCallDurationSeconds && params.maxCallDurationSeconds > 0
        ? params.maxCallDurationSeconds
        : SIP_MAX_CALL_DURATION_SECONDS,
      SIP_MAX_CALL_DURATION_SECONDS
    );
    const effectiveCallId = sipResult.callId;
    const hardStopTimer = setTimeout(async () => {
      sipHardStopTimers.delete(effectiveCallId);
      const callState = drachtioServer.getCallState(effectiveCallId);
      if (!callState || callState.state === 'ended') return;

      console.error(`[SIP Dialer] HARD STOP: Forcing SIP hangup for ${effectiveCallId} after ${effectiveMaxDuration}s`);
      try {
        await endCall(effectiveCallId, 'max_duration_exceeded');
      } catch (err) {
        console.error(`[SIP Dialer] HARD STOP hangup failed for ${effectiveCallId}:`, err);
      }
    }, effectiveMaxDuration * 1000);
    hardStopTimer.unref?.();
    sipHardStopTimers.set(effectiveCallId, hardStopTimer);

    return {
      success: true,
      callId: sipResult.callId,
      callControlId: sipResult.callId, // For compatibility with orchestrator
      g711Format: sipResult.g711Format,
    };
  } catch (error: any) {
    console.error(`[SIP Dialer] Failed to initiate call ${callId}:`, error);

    // Clean up on failure
    mediaBridgeClient.destroyMediaBridge(callId).catch(() => {});

    return {
      success: false,
      callId,
      error: error.message,
    };
  }
}

/**
 * End an active call
 */
export async function endCall(callId: string, reason?: string): Promise<boolean> {
  console.log(`[SIP Dialer] Ending call ${callId}: ${reason}`);

  // Clear the hard-stop timer if one exists (call ended normally)
  const timer = sipHardStopTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    sipHardStopTimers.delete(callId);
  }

  // Destroy media bridge on VM
  mediaBridgeClient.destroyMediaBridge(callId).catch(() => {});

  // End SIP call via Drachtio
  try {
    await drachtioServer.endCall(callId);
    return true;
  } catch (error) {
    console.error(`[SIP Dialer] Error ending call ${callId}:`, error);
    return false;
  }
}

/**
 * Get call state
 */
export function getCallState(callId: string) {
  return drachtioServer.getCallState(callId);
}

/**
 * Get all active calls
 */
export function getActiveCalls() {
  return drachtioServer.getActiveCalls();
}

/**
 * Get active media bridge sessions (via VM HTTP API)
 */
export async function getActiveSessions() {
  try {
    const health = await mediaBridgeClient.getMediaBridgeHealth();
    return { activeSessions: health.activeSessions || 0 };
  } catch {
    return { activeSessions: 0 };
  }
}

/**
 * Shutdown SIP dialer
 */
export async function shutdown(): Promise<void> {
  console.log('[SIP Dialer] Shutting down...');
  console.log('[SIP Dialer] Shutdown complete');
}

/**
 * Check if SIP calling should be used
 */
export function shouldUseSipCalling(): boolean {
  return USE_SIP_CALLING;
}
