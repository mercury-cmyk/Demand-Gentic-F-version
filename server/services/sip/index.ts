/**
 * SIP Services Module
 *
 * Exports all SIP-related functionality for direct SIP trunk calling.
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

// SIP client (lower level)
export {
  initializeSipClient,
  isReady as isSipClientReady,
  sendAudio,
  type SipCall,
} from './sip-client';

// RTP Bridge (lower level)
export {
  createBridgeSession,
  handleSipAudio,
  closeBridgeSession,
  getBridgeSession,
  type BridgeSession,
  type CallContext,
} from './rtp-gemini-bridge';
