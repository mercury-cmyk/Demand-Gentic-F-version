/**
 * Unified Call Router - Routes ALL call types through TeXML + Telnyx API
 * 
 * Ensures consistent call routing for:
 * - AI calls (Gemini Live)
 * - Campaign calls (auto-dialer, predictive dialer)
 * - Agent console calls (human-initiated)
 * - Test calls
 * 
 * SIP calling is disabled. TeXML + Telnyx API is the only call transport.
 */

import { getTelnyxAiBridge } from './telnyx-ai-bridge';
import type { AiAgentSettings, CallContext } from './ai-voice-agent';

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
  provider?: 'telnyx' | 'other';
  status?: 'initiating' | 'ringing' | 'connected' | 'failed';
  error?: string;
  timestamp: Date;
}

/**
 * Route call through TeXML + Telnyx API (Gemini-only)
 */
export async function routeUnifiedCall(request: UnifiedCallRequest): Promise<UnifiedCallResult> {
  console.log(`[Unified Call Router] Routing ${request.callType} call`, {
    to: request.toNumber,
    from: request.fromNumber,
    campaignId: request.campaignId,
    contactId: request.contactId,
  });

  return await routeViaTexml(request);
}

/**
 * Route call via TeXML + Telnyx API (Gemini Live)
 */
async function routeViaTexml(request: UnifiedCallRequest): Promise<UnifiedCallResult> {
  try {
    const bridge = getTelnyxAiBridge();

    const settings: AiAgentSettings = {
      persona: {
        name: "AI Agent",
        companyName: request.callContext?.organizationName || "DemandGentic.ai",
        role: "AI Assistant",
        voice: (request.voiceName as AiAgentSettings["persona"]["voice"]) || "Puck",
      },
      scripts: {
        opening: request.systemPrompt || "Hello, this is an AI assistant calling.",
        gatekeeper: "This is an AI call routed via TeXML.",
        pitch: request.systemPrompt || "This call is routed via TeXML using Gemini Live.",
        objections: "I understand. Thank you for your time.",
        closing: "Thanks for your time. Goodbye.",
      },
      handoff: {
        enabled: false,
        triggers: [],
        transferNumber: "",
      },
      gatekeeperLogic: {
        maxAttempts: 1,
      },
    };

    const context: CallContext = {
      contactFirstName: request.callContext?.contactFirstName || "there",
      contactLastName: request.callContext?.contactLastName || "",
      contactTitle: request.callContext?.contactTitle || "",
      contactEmail: request.callContext?.contactEmail || "",
      companyName: request.callContext?.companyName || "your company",
      phoneNumber: request.toNumber,
      campaignId: request.campaignId || "unified-router",
      queueItemId: request.queueItemId || "unified-router",
      contactId: request.contactId || undefined,
      agentFullName: settings.persona.name,
      organizationName: request.callContext?.organizationName,
      campaignObjective: request.callContext?.campaignObjective,
      successCriteria: request.callContext?.successCriteria,
      targetAudienceDescription: request.callContext?.targetAudienceDescription,
      productServiceInfo: request.callContext?.productServiceInfo,
      talkingPoints: request.callContext?.talkingPoints,
      maxCallDurationSeconds: request.maxCallDurationSeconds,
    };

    const result = await bridge.initiateAiCall(
      request.toNumber,
      request.fromNumber,
      settings,
      context,
      'gemini_live'
    );

    return {
      success: true,
      callId: result.callId,
      provider: 'telnyx',
      status: 'initiating',
      timestamp: new Date(),
    };
  } catch (error: any) {
    console.error('[Unified Call Router] TeXML routing failed:', error);
    return {
      success: false,
      error: error.message || 'TeXML routing failed',
      provider: 'telnyx',
      status: 'failed',
      timestamp: new Date(),
    };
  }
}

/**
 * End a call (works with SIP or legacy providers)
 */
export async function endUnifiedCall(callId: string, sipCallId?: string): Promise<boolean> {
  console.warn('[Unified Call Router] Call hangup not implemented for TeXML bridge');
  return false;
}

/**
 * Get call routing status
 */
export function getCallRoutingStatus(): {
  sipEnabled: boolean;
  provider: 'telnyx' | 'legacy';
  ready: boolean;
} {
  const sipEnabled = false;
  const texmlReady = !!process.env.TELNYX_API_KEY && !!process.env.TELNYX_TEXML_APP_ID;
  
  return {
    sipEnabled,
    provider: 'telnyx',
    ready: texmlReady,
  };
}

/**
 * Initialize unified call router (called on server startup)
 */
export function initializeUnifiedCallRouter(): void {
  const status = getCallRoutingStatus();
  console.log('[Unified Call Router] Initialized', status);
  console.log('[Unified Call Router] TeXML + Telnyx API is the only call transport');
}
