/**
 * SIP Services Module
 *
 * Unified SIP calling interface.
 * Architecture:
 *   sip-dialer → drachtio-server (SIP signaling) → media-bridge-client (VM HTTP)
 *   VM media-bridge/server.ts handles RTP ↔ Gemini Live audio bridging
 */

// Main dialer interface
export {
  initializeSipDialer,
  isReady,
  initiateAiCall,
  endCall,
  getCallState,
  getActiveCalls,
  getActiveSessions,
  shutdown,
  shouldUseSipCalling,
  type InitiateCallParams,
  type CallResult,
} from './sip-dialer';