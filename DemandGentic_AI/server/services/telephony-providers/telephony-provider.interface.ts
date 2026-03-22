/**
 * Telephony Provider Abstraction Layer
 * 
 * This interface defines the contract for all telephony providers (Telnyx, SIP Trunk, etc.)
 * Allows swapping between providers without changing call orchestration logic.
 * 
 * ISOLATED from production Telnyx workflow until fully tested.
 */

export interface CallOptions {
  to: string;
  from: string;
  webhookUrl: string;
  webhookMethod?: 'POST' | 'GET';
  machineDetection?: 'detect' | 'detect_beep' | 'detect_words' | 'disabled';
  machineDetectionTimeout?: number;
  answeringMachineDetection?: boolean;
  timeout?: number;
  timeLimit?: number;
  record?: boolean;
  recordingChannels?: 'single' | 'dual';
  sipHeaders?: Record;
  customHeaders?: Record;
  clientState?: string;
  connectionId?: string;
  // Provider-specific options
  providerOptions?: Record;
}

export interface CallResult {
  success: boolean;
  callControlId?: string;
  callLegId?: string;
  callSessionId?: string;
  providerCallId?: string;
  error?: string;
  errorCode?: string;
  rawResponse?: unknown;
}

export interface TransferOptions {
  callControlId: string;
  to: string;
  from?: string;
  sipHeaders?: Record;
  timeout?: number;
}

export interface HangupOptions {
  callControlId: string;
  cause?: string;
}

export interface PlayAudioOptions {
  callControlId: string;
  audioUrl?: string;
  audioBase64?: string;
  loop?: number;
}

export interface GatherOptions {
  callControlId: string;
  minDigits?: number;
  maxDigits?: number;
  timeout?: number;
  terminatingDigit?: string;
  validDigits?: string;
  interDigitTimeout?: number;
}

export interface SpeakOptions {
  callControlId: string;
  text: string;
  voice?: string;
  language?: string;
}

export interface StreamOptions {
  callControlId: string;
  streamUrl: string;
  streamTrack?: 'inbound' | 'outbound' | 'both';
  enableDialogflow?: boolean;
}

export interface BridgeOptions {
  callControlId: string;
  targetCallControlId: string;
}

export interface CallStatus {
  callControlId: string;
  status: 'initiated' | 'ringing' | 'answered' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'canceled';
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  duration?: number;
  startTime?: Date;
  endTime?: Date;
  answeredTime?: Date;
  hangupCause?: string;
  hangupSource?: string;
  providerData?: Record;
}

export interface ProviderCapabilities {
  supportsAmd: boolean;  // Answering Machine Detection
  supportsStreaming: boolean;
  supportsBridge: boolean;
  supportsTransfer: boolean;
  supportsRecord: boolean;
  supportsTts: boolean;
  supportsGather: boolean;
  supportsSipHeaders: boolean;
  maxConcurrentCalls?: number;
  supportedCodecs?: string[];
  supportedRegions?: string[];
}

export interface ProviderHealth {
  healthy: boolean;
  latencyMs?: number;
  lastCheck: Date;
  errorCount?: number;
  lastError?: string;
  activeCallCount?: number;
}

export interface TelephonyProviderConfig {
  id: string;
  name: string;
  type: 'telnyx' | 'sip_trunk' | 'twilio' | 'bandwidth' | 'custom';
  enabled: boolean;
  priority: number;
  // Connection settings
  apiKey?: string;
  apiSecret?: string;
  sipDomain?: string;
  sipUsername?: string;
  sipPassword?: string;
  sipProxy?: string;
  sipPort?: number;
  sipTransport?: 'udp' | 'tcp' | 'tls' | 'wss';
  // Routing
  outboundNumbers?: string[];
  allowedDestinations?: string[];
  blockedDestinations?: string[];
  // Rate limiting
  maxCps?: number;  // Calls per second
  maxConcurrent?: number;
  // Failover
  failoverProviderId?: string;
  healthCheckInterval?: number;
  // Cost tracking
  costPerMinute?: number;
  costPerCall?: number;
  currency?: string;
}

/**
 * Main interface for telephony providers
 */
export interface ITelephonyProvider {
  readonly providerId: string;
  readonly providerType: TelephonyProviderConfig['type'];
  readonly config: TelephonyProviderConfig;
  
  /**
   * Initialize the provider with configuration
   */
  initialize(config: TelephonyProviderConfig): Promise;
  
  /**
   * Check if provider is ready to handle calls
   */
  isReady(): boolean;
  
  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities;
  
  /**
   * Health check
   */
  checkHealth(): Promise;
  
  /**
   * Originate an outbound call
   */
  originateCall(options: CallOptions): Promise;
  
  /**
   * Answer an inbound call
   */
  answerCall(callControlId: string): Promise;
  
  /**
   * Hangup a call
   */
  hangupCall(options: HangupOptions): Promise;
  
  /**
   * Transfer a call
   */
  transferCall(options: TransferOptions): Promise;
  
  /**
   * Bridge two calls together
   */
  bridgeCalls(options: BridgeOptions): Promise;
  
  /**
   * Play audio on a call
   */
  playAudio(options: PlayAudioOptions): Promise;
  
  /**
   * Speak text on a call (TTS)
   */
  speak(options: SpeakOptions): Promise;
  
  /**
   * Gather DTMF digits
   */
  gatherDigits(options: GatherOptions): Promise;
  
  /**
   * Start media streaming (for AI integration)
   */
  startStream(options: StreamOptions): Promise;
  
  /**
   * Stop media streaming
   */
  stopStream(callControlId: string): Promise;
  
  /**
   * Get call status
   */
  getCallStatus(callControlId: string): Promise;
  
  /**
   * Parse webhook event from provider
   */
  parseWebhookEvent(payload: unknown, headers?: Record): TelephonyWebhookEvent | null;
  
  /**
   * Validate webhook signature (if supported)
   */
  validateWebhookSignature?(payload: string, signature: string): boolean;
  
  /**
   * Cleanup/shutdown provider
   */
  shutdown(): Promise;
}

/**
 * Normalized webhook event from any provider
 */
export interface TelephonyWebhookEvent {
  eventType: TelephonyEventType;
  callControlId: string;
  callSessionId?: string;
  callLegId?: string;
  timestamp: Date;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  // Event-specific data
  payload: TelephonyEventPayload;
  // Raw provider event
  rawEvent: unknown;
  providerType: TelephonyProviderConfig['type'];
}

export type TelephonyEventType =
  | 'call.initiated'
  | 'call.ringing'
  | 'call.answered'
  | 'call.hangup'
  | 'call.machine.detection.ended'
  | 'call.machine.greeting.ended'
  | 'call.dtmf.received'
  | 'call.gather.ended'
  | 'call.playback.started'
  | 'call.playback.ended'
  | 'call.speak.started'
  | 'call.speak.ended'
  | 'call.recording.saved'
  | 'call.bridged'
  | 'call.unbridged'
  | 'streaming.started'
  | 'streaming.stopped'
  | 'streaming.failed'
  | 'call.transfer.initiated'
  | 'call.transfer.completed'
  | 'call.transfer.failed'
  | 'unknown';

export interface TelephonyEventPayload {
  // AMD results
  amdResult?: 'human' | 'machine' | 'fax' | 'not_sure' | 'no_answer';
  amdConfidence?: number;
  
  // DTMF
  digit?: string;
  digits?: string;
  
  // Hangup
  hangupCause?: string;
  hangupSource?: 'caller' | 'callee' | 'system' | 'api';
  sipCode?: number;
  sipReason?: string;
  
  // Recording
  recordingUrl?: string;
  recordingDuration?: number;
  
  // Playback/Speak
  status?: 'started' | 'ended' | 'failed';
  
  // Streaming
  streamUrl?: string;
  streamError?: string;
  
  // Call details
  duration?: number;
  billableDuration?: number;
  
  // Custom data passed via clientState
  clientState?: Record;
}

/**
 * Provider registry for managing multiple providers
 */
export interface ITelephonyProviderRegistry {
  /**
   * Register a provider
   */
  registerProvider(provider: ITelephonyProvider): void;
  
  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): ITelephonyProvider | undefined;
  
  /**
   * Get provider by type
   */
  getProviderByType(type: TelephonyProviderConfig['type']): ITelephonyProvider | undefined;
  
  /**
   * Get all registered providers
   */
  getAllProviders(): ITelephonyProvider[];
  
  /**
   * Get the primary/default provider
   */
  getPrimaryProvider(): ITelephonyProvider | undefined;
  
  /**
   * Select best provider for a call based on destination, cost, health
   */
  selectProvider(destination: string, options?: ProviderSelectionOptions): ITelephonyProvider | undefined;
  
  /**
   * Remove a provider
   */
  removeProvider(providerId: string): boolean;
}

export interface ProviderSelectionOptions {
  preferredProviderId?: string;
  excludeProviderIds?: string[];
  requireCapabilities?: (keyof ProviderCapabilities)[];
  maxCostPerMinute?: number;
}