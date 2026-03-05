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

import * as rtpBridge from './rtp-gemini-bridge';
import * as mediaBridgeClient from './media-bridge-client';
import { drachtioServer } from './drachtio-server';
import { v4 as uuidv4 } from 'uuid';
import { resolveGeminiPersonaProfile } from '../voice-providers/gemini-dynamic-persona';

// Feature flag for SIP calling
const USE_SIP_CALLING = process.env.USE_SIP_CALLING === 'true';

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
  campaignObjective?: string;
  productServiceInfo?: string;
  talkingPoints?: string[];
  maxCallDurationSeconds?: number;
  // Number pool tracking
  callerNumberId?: string | null;
  callerNumberDecisionId?: string | null;
  // Call attempt tracking (for disposition processing)
  callAttemptId?: string | null;
}

/**
 * Call result
 */
export interface CallResult {
  success: boolean;
  callId?: string;
  callControlId?: string; // For compatibility with Telnyx API bridge
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
  const voiceName = params.voiceName || 'Puck';
  const orgRef = params.organizationName || 'DemandGentic.ai By Pivotal B2B';

  const personaProfile = resolveGeminiPersonaProfile({ voiceName, sessionId: callId });

  let prompt = `${personaProfile.prompt}

## YOUR IDENTITY

You are an AI voice assistant from ${orgRef}.

${params.contactName ? `**The person you are calling:** ${params.contactName}` : ''}
${params.contactJobTitle ? `**Job Title:** ${params.contactJobTitle}` : ''}
${params.accountName ? `**Company:** ${params.accountName}` : ''}

**Opening:**
"Hello, may I please speak with ${params.contactName || 'the contact'}?"

${params.campaignObjective ? `## INTERNAL OBJECTIVE (DO NOT SAY TO PROSPECT)
${params.campaignObjective}
` : ''}

${params.productServiceInfo ? `## WHAT TO SAY ABOUT YOUR OFFERING
${params.productServiceInfo}
` : ''}

${params.talkingPoints?.length ? `## KEY TALKING POINTS
${params.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}
` : ''}

## CALL FLOW
1. Confirm identity
2. Introduce yourself and ${orgRef}
3. Explain why you're calling (value to them)
4. Ask questions to understand their needs
5. Present relevant information
6. Propose next steps
7. Close professionally

## VOICEMAIL / IVR FAST-EXIT (CRITICAL)
If you hear ANY automation or mailbox cue, do NOT continue the script.
Examples:
- "leave a message", "after the beep", "after the tone", "voicemail", "mailbox"
- "the person you are trying to reach is not available"
- menu prompts like "press 1", "press 2", "to disconnect", "main menu"
- repeated automated prompts or beep/silence loops

When detected, IMMEDIATELY:
1. Call \`submit_disposition\` with "voicemail"
2. Call \`end_call\` with reason "voicemail detected"

Never leave a voicemail message. Never continue discovery/pitch on automation.

## SILENCE GUARD
If call is connected but there is no meaningful human response:
- after your opening and ~8-10 seconds of silence/looping audio, end quickly
- use "no_answer" only for pure silence/ringing with no mailbox cue

## RECORDING CALL OUTCOME

BEFORE ending any call, you MUST call \`submit_disposition\` with the outcome:
- "qualified_lead" - prospect interested
- "not_interested" - prospect declined
- "do_not_call" - requested removal
- "voicemail" - reached voicemail
- "no_answer" - no answer / callback requested
- "invalid_data" - wrong number

## ENDING THE CALL

When conversation is over:
1. Call \`submit_disposition\` with outcome
2. Call \`end_call\` to hang up
`;

  return prompt;
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
      onCallStateChanged: (state: string) => {
        console.log(`[SIP Dialer] Call ${callId} state: ${state}`);
      },
      onCallEnded: async (reason: string) => {
        console.log(`[SIP Dialer] Call ${callId} ended: ${reason}`);
        // Destroy media bridge on VM
        await mediaBridgeClient.destroyMediaBridge(sipResult.callId || callId);
        // Also close any legacy bridge session
        await rtpBridge.closeBridgeSession(callId);
      },
    });

    if (!sipResult.success) {
      throw new Error(`Failed to initiate SIP call: ${sipResult.error}`);
    }

    // Step 2: Create media bridge on VM for RTP ↔ Gemini
    if (mediaBridgeClient.isMediaBridgeConfigured() && sipResult.rtpPort && sipResult.remoteAddress && sipResult.remotePort) {
      const systemPrompt = buildSystemPrompt(params, sipResult.callId);

      const bridgeResult = await mediaBridgeClient.createMediaBridge({
        callId: sipResult.callId,
        rtpPort: sipResult.rtpPort,
        remoteAddress: sipResult.remoteAddress,
        remotePort: sipResult.remotePort,
        systemPrompt,
        voiceName: params.voiceName,
        toPhoneNumber: params.toNumber,
        contactName: params.contactName || params.contactFirstName,
        context: {
          campaignId: params.campaignId,
          contactId: params.contactId,
          queueItemId: params.queueItemId,
          callerNumberId: params.callerNumberId,
          phoneNumber: params.toNumber,
          callAttemptId: params.callAttemptId,
          // Safety hints for the SIP media bridge runtime
          voicemailAutoHangup: true,
          voicemailSilenceGuardMs: 10000,
          voicemailBeepLoopGuard: true,
        },
        maxDurationSeconds: params.maxCallDurationSeconds,
      });

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

    return {
      success: true,
      callId: sipResult.callId,
      callControlId: sipResult.callId, // For compatibility with orchestrator
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

  // Destroy media bridge on VM
  mediaBridgeClient.destroyMediaBridge(callId).catch(() => {});

  // Close legacy bridge session
  rtpBridge.closeBridgeSession(callId);

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
 * Get active bridge sessions
 */
export function getActiveSessions() {
  return rtpBridge.getActiveSessions();
}

/**
 * Shutdown SIP dialer
 */
export async function shutdown(): Promise<void> {
  console.log('[SIP Dialer] Shutting down...');

  // Close all bridge sessions
  const sessions = rtpBridge.getActiveSessions();
  const callIds = Array.from(sessions.keys());
  for (const callId of callIds) {
    rtpBridge.closeBridgeSession(callId);
  }

  console.log('[SIP Dialer] Shutdown complete');
}

/**
 * Check if SIP calling should be used
 */
export function shouldUseSipCalling(): boolean {
  return USE_SIP_CALLING;
}
