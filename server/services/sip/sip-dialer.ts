/**
 * Unified SIP Dialer Service
 *
 * This is the main entry point for SIP-based calling.
 * It integrates:
 * - Drachtio SIP Server for call signaling (primary)
 * - RTP Bridge for audio streaming to Gemini
 * - Campaign orchestrator integration
 *
 * Replaces the API-based calling in telnyx-ai-bridge.ts
 *
 * Note: Database operations (call attempts, sessions) are handled by the
 * campaign orchestrator. This module only handles SIP signaling and audio.
 */

import * as rtpBridge from './rtp-gemini-bridge';
import { drachtioServer } from './drachtio-server';
import { v4 as uuidv4 } from 'uuid';

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
 * Initiate an AI voice call via SIP
 *
 * Note: Database operations are handled by the campaign orchestrator.
 * This function only handles SIP signaling and audio bridging.
 */
export async function initiateAiCall(params: InitiateCallParams): Promise<CallResult> {
  const callId = uuidv4();

  console.log(`[SIP Dialer] Initiating call ${callId} to ${params.toNumber}`);

  try {
    // Create RTP bridge session for Gemini first
    const bridgeResult = await rtpBridge.createBridgeSession({
      callId,
      toNumber: params.toNumber,
      fromNumber: params.fromNumber,
      voiceName: params.voiceName,
      context: {
        contactName: params.contactName,
        contactFirstName: params.contactFirstName,
        contactJobTitle: params.contactJobTitle,
        accountName: params.accountName,
        organizationName: params.organizationName,
        campaignName: params.campaignName,
        campaignObjective: params.campaignObjective,
        productServiceInfo: params.productServiceInfo,
        talkingPoints: params.talkingPoints,
        queueItemId: params.queueItemId,
        campaignId: params.campaignId,
        contactId: params.contactId,
        maxCallDurationSeconds: params.maxCallDurationSeconds,
      },
    });

    if (!bridgeResult.success) {
      throw new Error(`Failed to create bridge session: ${bridgeResult.error}`);
    }

    // Initiate SIP call via Drachtio
    const sipResult = await drachtioServer.initiateCall({
      to: params.toNumber,
      from: params.fromNumber,
      campaignId: params.campaignId,
      contactId: params.contactId,
      queueItemId: params.queueItemId,
      onAudioReceived: (audio: Buffer) => {
        // Forward RTP audio to Gemini bridge
        rtpBridge.handleSipAudio(callId, audio);
      },
      onCallStateChanged: (state: string) => {
        console.log(`[SIP Dialer] Call ${callId} state: ${state}`);
      },
      onCallEnded: (reason: string) => {
        console.log(`[SIP Dialer] Call ${callId} ended: ${reason}`);
        // Close bridge session
        rtpBridge.closeBridgeSession(callId);
      },
    });

    if (!sipResult.success) {
      throw new Error(`Failed to initiate SIP call: ${sipResult.error}`);
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
    rtpBridge.closeBridgeSession(callId);

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

  // Close bridge session
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
