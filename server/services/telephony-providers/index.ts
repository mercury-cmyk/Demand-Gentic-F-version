/**
 * Telephony Providers Module
 * 
 * Abstraction layer for telephony providers (Telnyx, SIP Trunk, etc.)
 * Allows swapping between providers without changing call orchestration logic.
 * 
 * ISOLATED from production Telnyx workflow until fully tested.
 * 
 * Usage:
 * ```typescript
 * import { 
 *   getTelephonyProviderRegistry, 
 *   initializeTelephonyProviders,
 *   TelephonyProviderFactory 
 * } from './telephony-providers';
 * 
 * // Initialize from database configs
 * const registry = await initializeTelephonyProviders(configs);
 * 
 * // Get best provider for a call
 * const provider = registry.selectProvider('+15551234567');
 * 
 * // Originate call
 * const result = await provider.originateCall({
 *   to: '+15551234567',
 *   from: '+15559876543',
 *   webhookUrl: 'https://example.com/webhook',
 * });
 * ```
 */

// Core interfaces
export type {
  ITelephonyProvider,
  ITelephonyProviderRegistry,
  TelephonyProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  ProviderSelectionOptions,
  // Call options and results
  CallOptions,
  CallResult,
  CallStatus,
  HangupOptions,
  TransferOptions,
  BridgeOptions,
  PlayAudioOptions,
  SpeakOptions,
  GatherOptions,
  StreamOptions,
  // Webhook events
  TelephonyWebhookEvent,
  TelephonyEventType,
  TelephonyEventPayload,
} from './telephony-provider.interface';

// Provider implementations
export { TelnyxProvider } from './telnyx-provider';
export { SipTrunkProvider } from './sip-trunk-provider';

// Factory and registry
export {
  TelephonyProviderFactory,
  TelephonyProviderRegistry,
  getTelephonyProviderRegistry,
  initializeTelephonyProviders,
} from './telephony-provider-factory';
