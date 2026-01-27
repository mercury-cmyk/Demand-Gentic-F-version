/**
 * Unified Call Router - Routes ALL call types through SIP when enabled
 * 
 * Ensures consistent call routing for:
 * - AI calls (Gemini Live, OpenAI Realtime)
 * - Campaign calls (auto-dialer, predictive dialer)
 * - Agent console calls (human-initiated)
 * - Test calls
 * 
 * When USE_SIP_CALLING=true, all calls MUST use SIP infrastructure.
 */

import { initiateGeminiLiveCall, endGeminiLiveCall, type GeminiLiveCallRequest } from './gemini-live-sip-gateway';
import { enforceGeminiLiveSIPOnly, preflightGeminiLiveSIPCheck } from './gemini-live-sip-enforcement';

// Call type discriminator
export type UnifiedCallType = 
  | 'gemini_live_ai'
  | 'openai_realtime_ai'
  | 'campaign_auto'
  | 'agent_console'
  | 'test_call';

export interface UnifiedCallRequest {
  callType: UnifiedCallType;
  toNumber: string;
  fromNumber: string;
  
  // Optional identifiers
  campaignId?: string;
  contactId?: string;
  queueItemId?: string;
  agentId?: string;
  callAttemptId?: string;
  
  // AI-specific
  systemPrompt?: string;
  voiceName?: string;
  model?: string;
  maxCallDurationSeconds?: number;
  
  // Recording & monitoring
  enableRecording?: boolean;
  
  // Context data
  callContext?: Record<string, any>;
}

export interface UnifiedCallResult {
  success: boolean;
  callId?: string;
  sipCallId?: string;
  provider?: 'sip' | 'telnyx' | 'other';
  status?: 'initiating' | 'ringing' | 'connected' | 'failed';
  error?: string;
  timestamp: Date;
}

/**
 * Route call through appropriate provider based on configuration
 * When USE_SIP_CALLING=true, all calls use SIP
 * When USE_SIP_CALLING=false, falls back to existing providers
 */
export async function routeUnifiedCall(request: UnifiedCallRequest): Promise<UnifiedCallResult> {
  const useSIP = process.env.USE_SIP_CALLING === 'true';
  
  console.log(`[Unified Call Router] Routing ${request.callType} call`, {
    to: request.toNumber,
    from: request.fromNumber,
    useSIP,
    campaignId: request.campaignId,
    contactId: request.contactId,
  });

  if (useSIP) {
    return await routeViaSIP(request);
  } else {
    return await routeViaLegacyProvider(request);
  }
}

/**
 * Route call via SIP infrastructure (drachtio-srf + Gemini Live SIP Gateway)
 */
async function routeViaSIP(request: UnifiedCallRequest): Promise<UnifiedCallResult> {
  try {
    // Pre-flight check - ensure SIP is ready
    const preflight = await preflightGeminiLiveSIPCheck();
    if (!preflight.ready) {
      console.error('[Unified Call Router] SIP pre-flight check failed:', preflight.issues);
      return {
        success: false,
        error: `SIP not ready: ${preflight.issues.join(', ')}`,
        provider: 'sip',
        status: 'failed',
        timestamp: new Date(),
      };
    }

    // Enforce SIP-only (throws if not properly configured)
    enforceGeminiLiveSIPOnly();

    // Map call types to SIP gateway
    if (request.callType === 'gemini_live_ai' || request.callType === 'openai_realtime_ai') {
      // AI calls via Gemini Live SIP Gateway
      const geminiRequest: GeminiLiveCallRequest = {
        toNumber: request.toNumber,
        fromNumber: request.fromNumber,
        campaignId: request.campaignId || 'unified-router',
        contactId: request.contactId || 'unknown',
        queueItemId: request.queueItemId || 'unknown',
        systemPrompt: request.systemPrompt || 'You are a helpful AI assistant.',
        voiceName: request.voiceName,
        model: request.model,
        maxCallDurationSeconds: request.maxCallDurationSeconds,
        enableRecording: request.enableRecording,
        callContext: request.callContext,
      };

      const result = await initiateGeminiLiveCall(geminiRequest);
      
      return {
        success: result.success,
        callId: result.callId,
        sipCallId: result.sipCallId,
        provider: 'sip',
        status: (result.status || 'failed') as 'initiating' | 'ringing' | 'connected' | 'failed',
        error: result.error,
        timestamp: result.timestamp,
      };
    } else if (request.callType === 'campaign_auto' || request.callType === 'agent_console' || request.callType === 'test_call') {
      // Campaign and agent console calls also via SIP
      // These typically don't need AI, but we route through SIP for consistency
      const geminiRequest: GeminiLiveCallRequest = {
        toNumber: request.toNumber,
        fromNumber: request.fromNumber,
        campaignId: request.campaignId || 'manual-call',
        contactId: request.contactId || 'unknown',
        queueItemId: request.queueItemId || 'unknown',
        systemPrompt: request.systemPrompt || 'This is a human-initiated call.',
        maxCallDurationSeconds: request.maxCallDurationSeconds || 1800, // 30 min default
        enableRecording: request.enableRecording !== false, // Record by default
        callContext: {
          ...request.callContext,
          callType: request.callType,
          agentId: request.agentId,
        },
      };

      const result = await initiateGeminiLiveCall(geminiRequest);
      
      return {
        success: result.success,
        callId: result.callId,
        sipCallId: result.sipCallId,
        provider: 'sip',
        status: (result.status || 'failed') as 'initiating' | 'ringing' | 'connected' | 'failed',
        error: result.error,
        timestamp: result.timestamp,
      };
    } else {
      return {
        success: false,
        error: `Unknown call type: ${request.callType}`,
        provider: 'sip',
        status: 'failed',
        timestamp: new Date(),
      };
    }
  } catch (error: any) {
    console.error('[Unified Call Router] SIP routing failed:', error);
    return {
      success: false,
      error: error.message || 'SIP routing failed',
      provider: 'sip',
      status: 'failed',
      timestamp: new Date(),
    };
  }
}

/**
 * Fallback to legacy providers (Telnyx, etc.) when SIP is disabled
 */
async function routeViaLegacyProvider(request: UnifiedCallRequest): Promise<UnifiedCallResult> {
  console.warn('[Unified Call Router] Using legacy provider (SIP disabled)');
  
  // This would route to existing Telnyx/WebRTC implementations
  // For now, return error indicating SIP is required
  return {
    success: false,
    error: 'SIP calling is disabled. Set USE_SIP_CALLING=true to enable.',
    provider: 'other',
    status: 'failed',
    timestamp: new Date(),
  };
}

/**
 * End a call (works with SIP or legacy providers)
 */
export async function endUnifiedCall(callId: string, sipCallId?: string): Promise<boolean> {
  const useSIP = process.env.USE_SIP_CALLING === 'true';
  
  if (useSIP && callId) {
    try {
      await endGeminiLiveCall(callId);
      return true;
    } catch (error) {
      console.error('[Unified Call Router] Failed to end SIP call:', error);
      return false;
    }
  }
  
  // Legacy provider hangup
  console.warn('[Unified Call Router] Legacy call hangup not implemented');
  return false;
}

/**
 * Get call routing status
 */
export function getCallRoutingStatus(): {
  sipEnabled: boolean;
  provider: 'sip' | 'legacy';
  ready: boolean;
} {
  const sipEnabled = process.env.USE_SIP_CALLING === 'true';
  
  return {
    sipEnabled,
    provider: sipEnabled ? 'sip' : 'legacy',
    ready: sipEnabled, // Could add more checks here
  };
}

/**
 * Initialize unified call router (called on server startup)
 */
export function initializeUnifiedCallRouter(): void {
  const status = getCallRoutingStatus();
  console.log('[Unified Call Router] Initialized', status);
  
  if (status.sipEnabled) {
    console.log('[Unified Call Router] All calls will route through SIP infrastructure');
  } else {
    console.warn('[Unified Call Router] SIP disabled - using legacy providers');
  }
}
