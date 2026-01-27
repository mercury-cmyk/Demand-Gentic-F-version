/**
 * SIP Client for Telnyx WebRTC-based Calling
 *
 * This module handles outbound SIP calls using Telnyx WebRTC (via sip.js).
 * Uses the same credentials as the Agent Console WebRTC softphone.
 *
 * Architecture:
 * 1. SIP over WebSocket for call signaling (INVITE, ACK, BYE)
 * 2. WebRTC for media transport
 * 3. Bridge audio to Gemini Live WebSocket
 */

import { UserAgent, Registerer, Inviter, SessionState, Session } from 'sip.js';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// Telnyx WebRTC Configuration (same as Agent Console)
// Use existing WebRTC credentials from environment
const TELNYX_WEBRTC_USERNAME = process.env.TELNYX_WEBRTC_USERNAME || process.env.SIP_USERNAME || '';
const TELNYX_WEBRTC_PASSWORD = process.env.TELNYX_WEBRTC_PASSWORD || process.env.SIP_PASSWORD || '';
const TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || '';
const TELNYX_WEBRTC_URL = process.env.TELNYX_WEBRTC_URL || 'wss://rtc.telnyx.com:14938';

/**
 * Call state for tracking active SIP calls
 */
export interface SipCall {
  callId: string;
  session: Session | null;
  state: 'initiating' | 'ringing' | 'answered' | 'ended';
  startTime: Date;
  toNumber: string;
  fromNumber: string;
  campaignId?: string;
  contactId?: string;
  queueItemId?: string;
  callAttemptId?: string;
  audioBuffer: Buffer[];
  onAudioReceived?: (audio: Buffer) => void;
  onCallStateChanged?: (state: string) => void;
  onCallEnded?: (reason: string) => void;
}

// Active calls map
const activeCalls: Map<string, SipCall> = new Map();

// SIP User Agent instance
let userAgent: UserAgent | null = null;
let registerer: Registerer | null = null;
let isRegisteredState = false;

/**
 * Initialize the SIP User Agent and register with Telnyx WebRTC
 */
export async function initializeSipClient(): Promise<boolean> {
  if (userAgent) {
    console.log('[SIP Client] Already initialized');
    return isRegisteredState;
  }

  if (!TELNYX_WEBRTC_USERNAME || !TELNYX_WEBRTC_PASSWORD) {
    console.error('[SIP Client] TELNYX_WEBRTC_USERNAME and TELNYX_WEBRTC_PASSWORD are required');
    console.error('[SIP Client] Set these in .env or use SIP_USERNAME/SIP_PASSWORD');
    return false;
  }

  try {
    console.log(`[SIP Client] Initializing Telnyx WebRTC...`);
    console.log(`[SIP Client] WebSocket: ${TELNYX_WEBRTC_URL}`);
    console.log(`[SIP Client] Username: ${TELNYX_WEBRTC_USERNAME.substring(0, 10)}...`);

    // Create User Agent configuration for Telnyx WebRTC
    const uri = UserAgent.makeURI(`sip:${TELNYX_WEBRTC_USERNAME}@sip.telnyx.com`);
    if (!uri) {
      throw new Error('Failed to create SIP URI');
    }

    userAgent = new UserAgent({
      uri,
      transportOptions: {
        server: TELNYX_WEBRTC_URL,
      },
      authorizationUsername: TELNYX_WEBRTC_USERNAME,
      authorizationPassword: TELNYX_WEBRTC_PASSWORD,
      displayName: 'DemandGentic AI',
      logLevel: 'warn',
      // Telnyx-specific settings
      userAgentString: 'DemandGentic-AI/1.0',
    });

    // Handle User Agent state changes
    userAgent.stateChange.addListener((state) => {
      console.log(`[SIP Client] User Agent state: ${state}`);
    });

    // Start the User Agent
    await userAgent.start();
    console.log('[SIP Client] User Agent started');

    // Register with Telnyx
    registerer = new Registerer(userAgent, {
      expires: 300, // 5 minutes
    });

    registerer.stateChange.addListener((state) => {
      console.log(`[SIP Client] Registerer state: ${state}`);
      isRegisteredState = state === 'Registered';
    });

    // Wait for registration
    await registerer.register();

    // Give it a moment to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`[SIP Client] Registration complete: ${isRegisteredState ? 'SUCCESS' : 'PENDING'}`);
    return true;
  } catch (error) {
    console.error('[SIP Client] Initialization failed:', error);
    userAgent = null;
    registerer = null;
    return false;
  }
}

/**
 * Check if the SIP client is ready
 */
export function isReady(): boolean {
  return userAgent !== null && isRegisteredState;
}

/**
 * Initiate an outbound call
 */
export async function initiateCall(params: {
  toNumber: string;
  fromNumber: string;
  campaignId?: string;
  contactId?: string;
  queueItemId?: string;
  callAttemptId?: string;
  onAudioReceived?: (audio: Buffer) => void;
  onCallStateChanged?: (state: string) => void;
  onCallEnded?: (reason: string) => void;
}): Promise<{ callId: string; success: boolean; error?: string }> {
  const callId = uuidv4();

  // Lazy initialize if not ready (registration may drop during runtime)
  if (!userAgent || !isRegisteredState) {
    const initialized = await initializeSipClient();
    if (!initialized || !userAgent || !isRegisteredState) {
      return { callId, success: false, error: 'SIP client not initialized' };
    }
  }

  try {
    console.log(`[SIP Client] Initiating call ${callId} to ${params.toNumber}`);

    // Create the call record
    const call: SipCall = {
      callId,
      session: null,
      state: 'initiating',
      startTime: new Date(),
      toNumber: params.toNumber,
      fromNumber: params.fromNumber,
      campaignId: params.campaignId,
      contactId: params.contactId,
      queueItemId: params.queueItemId,
      callAttemptId: params.callAttemptId,
      audioBuffer: [],
      onAudioReceived: params.onAudioReceived,
      onCallStateChanged: params.onCallStateChanged,
      onCallEnded: params.onCallEnded,
    };

    activeCalls.set(callId, call);

    // Create target URI for the outbound call
    // Format: sip:+1234567890@sip.telnyx.com
    const targetUri = UserAgent.makeURI(`sip:${params.toNumber}@sip.telnyx.com`);
    if (!targetUri) {
      throw new Error('Failed to create target URI');
    }

    // Create the inviter (outbound call)
    const inviter = new Inviter(userAgent, targetUri, {
      // Pass caller ID and other headers
      extraHeaders: [
        `X-Telnyx-Connection-ID: ${TELNYX_CONNECTION_ID}`,
        `P-Asserted-Identity: <sip:${params.fromNumber}@sip.telnyx.com>`,
      ],
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: true,
          video: false,
        },
      },
    });

    call.session = inviter;

    // Handle session state changes
    inviter.stateChange.addListener((state) => {
      console.log(`[SIP Client] Call ${callId} state: ${state}`);

      switch (state) {
        case SessionState.Establishing:
          call.state = 'ringing';
          call.onCallStateChanged?.('ringing');
          break;

        case SessionState.Established:
          call.state = 'answered';
          call.onCallStateChanged?.('answered');
          console.log(`[SIP Client] Call ${callId} answered`);

          // Set up media handling
          setupMediaHandlers(call, inviter);
          break;

        case SessionState.Terminated:
          call.state = 'ended';
          call.onCallStateChanged?.('ended');
          call.onCallEnded?.('terminated');
          cleanupCall(callId);
          break;
      }
    });

    // Send INVITE
    await inviter.invite();
    console.log(`[SIP Client] INVITE sent for call ${callId}`);

    return { callId, success: true };
  } catch (error: any) {
    console.error(`[SIP Client] Failed to initiate call ${callId}:`, error);
    cleanupCall(callId);
    return { callId, success: false, error: error.message };
  }
}

/**
 * Set up media handlers for the call
 */
function setupMediaHandlers(call: SipCall, session: Session): void {
  const sdh = session.sessionDescriptionHandler;
  if (!sdh) {
    console.warn(`[SIP Client] No session description handler for call ${call.callId}`);
    return;
  }

  // Get the peer connection for media access
  const pc = (sdh as any).peerConnection as RTCPeerConnection | undefined;
  if (!pc) {
    console.warn(`[SIP Client] No peer connection for call ${call.callId}`);
    return;
  }

  // Handle incoming audio
  pc.ontrack = (event) => {
    console.log(`[SIP Client] Received track for call ${call.callId}: ${event.track.kind}`);

    if (event.track.kind === 'audio') {
      // Create audio context for processing
      const audioContext = new (globalThis.AudioContext || (globalThis as any).webkitAudioContext)();
      const mediaStream = new MediaStream([event.track]);
      const source = audioContext.createMediaStreamSource(mediaStream);

      // Create script processor to capture audio data
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send to callback
        call.onAudioReceived?.(Buffer.from(pcm16.buffer));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    }
  };

  console.log(`[SIP Client] Media handlers set up for call ${call.callId}`);
}

/**
 * End an active call
 */
export async function endCall(callId: string, reason?: string): Promise<boolean> {
  const call = activeCalls.get(callId);
  if (!call) {
    console.warn(`[SIP Client] Call ${callId} not found`);
    return false;
  }

  try {
    console.log(`[SIP Client] Ending call ${callId}: ${reason}`);

    if (call.session) {
      // Send BYE
      if (call.session.state === SessionState.Established) {
        await (call.session as any).bye();
      } else if (call.session.state === SessionState.Establishing) {
        await (call.session as any).cancel();
      }
    }

    cleanupCall(callId);
    return true;
  } catch (error) {
    console.error(`[SIP Client] Failed to end call ${callId}:`, error);
    cleanupCall(callId);
    return false;
  }
}

/**
 * Clean up call resources
 */
function cleanupCall(callId: string): void {
  const call = activeCalls.get(callId);
  if (call) {
    activeCalls.delete(callId);
    console.log(`[SIP Client] Call ${callId} cleaned up`);
  }
}

/**
 * Get call state
 */
export function getCallState(callId: string): SipCall | undefined {
  return activeCalls.get(callId);
}

/**
 * Get all active calls
 */
export function getActiveCalls(): Map<string, SipCall> {
  return activeCalls;
}

/**
 * Shutdown SIP client
 */
export async function shutdown(): Promise<void> {
  console.log('[SIP Client] Shutting down...');

  // End all active calls
  const callIds = Array.from(activeCalls.keys());
  for (const callId of callIds) {
    await endCall(callId, 'shutdown');
  }

  // Unregister
  if (registerer) {
    try {
      await registerer.unregister();
    } catch (e) {}
  }

  // Stop user agent
  if (userAgent) {
    try {
      await userAgent.stop();
    } catch (e) {}
  }

  userAgent = null;
  registerer = null;
  isRegisteredState = false;

  console.log('[SIP Client] Shutdown complete');
}

/**
 * Send audio to a call (for TTS playback)
 */
export function sendAudio(callId: string, audioData: Buffer): boolean {
  const call = activeCalls.get(callId);
  if (!call || call.state !== 'answered') {
    return false;
  }

  // Audio sending would require injecting into the WebRTC peer connection
  // This is more complex and typically done through the session description handler
  console.log(`[SIP Client] Audio send requested for call ${callId} (${audioData.length} bytes)`);

  return true;
}
