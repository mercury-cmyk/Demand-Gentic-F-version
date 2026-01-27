/**
 * SIP-Exclusive Gemini Live Calling Gateway
 *
 * This service ensures that ALL Gemini Live AI calls route through
 * the drachtio-srf SIP server, preventing fallback to other calling
 * methods (Telnyx, WebRTC, etc.)
 *
 * ENFORCED FLOW:
 * 1. Campaign initiates AI call
 * 2. Request routes to this gateway
 * 3. Gateway ONLY accepts SIP as transport
 * 4. Routes to drachtio-srf SIP server
 * 5. Rejects non-SIP attempts
 */

import { drachtioServer } from './sip/drachtio-server';
import { v4 as uuidv4 } from 'uuid';

const log = (msg: string, data?: any) => {
  console.log(`[Gemini→SIP Gateway] ${msg}`, data || '');
};

const logError = (msg: string, error?: any) => {
  console.error(`[Gemini→SIP Gateway] ${msg}`, error || '');
};

/**
 * Call initiation parameters for Gemini Live AI calls
 */
export interface GeminiLiveCallRequest {
  // Call routing
  toNumber: string;
  fromNumber: string;

  // Campaign context
  campaignId: string;
  contactId: string;
  queueItemId: string;
  campaignName?: string;
  contactName?: string;

  // Gemini configuration
  voiceName?: string;
  systemPrompt: string;
  model?: string;

  // Call behavior
  maxCallDurationSeconds?: number;
  enableRecording?: boolean;

  // Context for AI agent
  callContext?: Record<string, any>;
}

/**
 * Result of Gemini Live call initiation
 */
export interface GeminiLiveCallResult {
  success: boolean;
  callId?: string;
  sipCallId?: string;
  status?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Gemini Live call state tracking
 */
interface GeminiLiveCall {
  callId: string;
  sipCallId: string;
  request: GeminiLiveCallRequest;
  startTime: Date;
  endTime?: Date;
  status: 'initiating' | 'ringing' | 'connected' | 'ended' | 'failed';
  errorReason?: string;
}

// Track active Gemini Live calls
const activeCalls: Map<string, GeminiLiveCall> = new Map();

/**
 * Initiate a Gemini Live AI call via SIP
 *
 * ENFORCED: This is the ONLY method for Gemini Live calls.
 * All AI calls MUST use SIP transport.
 */
export async function initiateGeminiLiveCall(
  request: GeminiLiveCallRequest
): Promise<GeminiLiveCallResult> {
  const callId = uuidv4();
  const timestamp = new Date();

  log(`Initiating Gemini Live call: ${request.toNumber} (campaign: ${request.campaignId})`);

  try {
    // Validate required fields
    if (!request.toNumber) {
      throw new Error('Missing required field: toNumber');
    }
    if (!request.fromNumber) {
      throw new Error('Missing required field: fromNumber');
    }
    if (!request.systemPrompt) {
      throw new Error('Missing required field: systemPrompt');
    }

    // CRITICAL: Verify SIP server is initialized
    if (!drachtioServer) {
      throw new Error('Drachtio SIP server not initialized - SIP transport required for Gemini Live');
    }

    const health = await drachtioServer.healthCheck();
    if (!health) {
      throw new Error('Drachtio SIP server unhealthy - cannot initiate Gemini Live call');
    }

    // Initiate SIP call
    log(`Routing to Drachtio SIP server: ${request.toNumber}`);
    const sipCallId = await drachtioServer.initiateCall({
      to: request.toNumber,
      from: request.fromNumber,
      campaignId: request.campaignId,
      contactId: request.contactId,
      queueItemId: request.queueItemId,
    });

    // Track call
    const geminiCall: GeminiLiveCall = {
      callId,
      sipCallId,
      request,
      startTime: timestamp,
      status: 'initiating',
    };

    activeCalls.set(callId, geminiCall);

    log(`✓ Gemini Live call initiated via SIP: ${callId} (SIP: ${sipCallId})`);

    return {
      success: true,
      callId,
      sipCallId,
      status: 'initiating',
      timestamp,
    };
  } catch (error) {
    logError(`Failed to initiate Gemini Live call: ${error}`, error);

    return {
      success: false,
      callId,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp,
    };
  }
}

/**
 * End a Gemini Live call
 */
export async function endGeminiLiveCall(callId: string): Promise<void> {
  const geminiCall = activeCalls.get(callId);
  if (!geminiCall) {
    logError(`Call not found: ${callId}`);
    return;
  }

  try {
    log(`Ending Gemini Live call: ${callId} (SIP: ${geminiCall.sipCallId})`);

    // End SIP call
    await drachtioServer.endCall(geminiCall.sipCallId);

    // Update call state
    geminiCall.status = 'ended';
    geminiCall.endTime = new Date();

    // Remove from tracking
    activeCalls.delete(callId);

    log(`✓ Gemini Live call ended: ${callId}`);
  } catch (error) {
    logError(`Error ending Gemini Live call: ${callId}`, error);
  }
}

/**
 * Get active Gemini Live calls
 */
export function getActiveCalls(): GeminiLiveCall[] {
  return Array.from(activeCalls.values());
}

/**
 * Get call details
 */
export function getCallDetails(callId: string): GeminiLiveCall | undefined {
  return activeCalls.get(callId);
}

/**
 * Validate that Gemini Live calls ONLY use SIP
 */
export function validateSIPOnly(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if SIP server is available
  if (!drachtioServer) {
    errors.push('Drachtio SIP server not initialized');
  }

  // Check if SIP calling is enabled
  if (process.env.USE_SIP_CALLING !== 'true') {
    errors.push('SIP calling is disabled (USE_SIP_CALLING=false)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get Gemini Live to SIP gateway statistics
 */
export function getGatewayStats() {
  return {
    activeCalls: activeCalls.size,
    totalInitiated: activeCalls.size, // Would need persistence for true total
    calls: Array.from(activeCalls.values()).map((call) => ({
      callId: call.callId,
      sipCallId: call.sipCallId,
      status: call.status,
      duration: call.endTime
        ? (call.endTime.getTime() - call.startTime.getTime()) / 1000
        : (Date.now() - call.startTime.getTime()) / 1000,
      campaign: call.request.campaignName || call.request.campaignId,
      contact: call.request.contactName || call.request.contactId,
    })),
  };
}

/**
 * Initialize Gemini Live SIP Gateway
 *
 * Must be called on application startup to ensure SIP is the
 * exclusive transport for Gemini Live AI calls.
 */
export async function initializeGeminiLiveSIPGateway(): Promise<boolean> {
  log('Initializing Gemini Live → SIP Gateway');

  try {
    // Verify SIP server is ready
    const validation = validateSIPOnly();
    if (!validation.valid) {
      logError('SIP validation failed', validation.errors);
      return false;
    }

    // Check SIP health
    const health = await drachtioServer.healthCheck();
    if (!health) {
      logError('Drachtio SIP server is not healthy');
      return false;
    }

    log('✓ Gemini Live SIP Gateway initialized - SIP is exclusive transport');
    return true;
  } catch (error) {
    logError('Failed to initialize Gemini Live SIP Gateway', error);
    return false;
  }
}

/**
 * Enforce that call routing MUST go through this gateway
 *
 * Call this from voice-dialer.ts or campaign orchestrator to
 * prevent bypassing the SIP-only requirement.
 */
export function enforceGeminiLiveSIPOnly(): void {
  const validation = validateSIPOnly();

  if (!validation.valid) {
    const errorMsg = `Gemini Live SIP enforcement failed: ${validation.errors.join(', ')}`;
    logError(errorMsg);
    throw new Error(errorMsg);
  }

  log('✓ Gemini Live SIP enforcement: All calls routed through SIP');
}
