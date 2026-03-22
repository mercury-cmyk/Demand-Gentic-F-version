/**
 * WebRTC Module Index
 * 
 * Unified calling stack exports for Human + AI agents.
 * All components use WebRTC only - no WebSockets for media.
 */

// Telnyx WebRTC client
export {
  TelnyxWebRTCClient,
  getTelnyxClient,
  destroyTelnyxClient,
  type TelnyxCallState,
  type TelnyxCallDirection,
  type TelnyxCredentials,
  type TelnyxClientConfig,
  type TelnyxOutboundCallOptions,
} from './telnyx-webrtc-client';

// OpenAI Realtime WebRTC client
export {
  OpenAIRealtimeWebRTCClient,
  type OpenAIRealtimeState,
  type OpenAIRealtimeConfig,
  type OpenAISessionConfig,
} from './openai-realtime-webrtc-client';

// Audio bridge controller
export {
  AudioBridgeController,
  createAudioBridge,
  type BridgeMode,
  type BridgeState,
  type AudioBridgeConfig,
  type BridgeStatus,
} from './audio-bridge-controller';