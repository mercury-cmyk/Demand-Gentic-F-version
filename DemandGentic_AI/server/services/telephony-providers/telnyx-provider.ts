/**
 * Telnyx Provider Implementation
 * 
 * Wraps existing Telnyx functionality into the new provider interface.
 * This is a THIN WRAPPER - actual implementation remains in existing services.
 * 
 * Purpose: Allow Telnyx to participate in the provider selection/failover system
 * without changing existing production call flows.
 */

import {
  ITelephonyProvider,
  TelephonyProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  CallOptions,
  CallResult,
  HangupOptions,
  TransferOptions,
  BridgeOptions,
  PlayAudioOptions,
  SpeakOptions,
  GatherOptions,
  StreamOptions,
  CallStatus,
  TelephonyWebhookEvent,
  TelephonyEventType,
  TelephonyEventPayload,
} from './telephony-provider.interface';

export class TelnyxProvider implements ITelephonyProvider {
  readonly providerId: string;
  readonly providerType: TelephonyProviderConfig['type'] = 'telnyx';
  readonly config: TelephonyProviderConfig;
  
  private ready: boolean = false;
  private lastHealthCheck: ProviderHealth | null = null;
  private apiKey: string = '';
  
  constructor(config: TelephonyProviderConfig) {
    this.providerId = config.id;
    this.config = config;
  }
  
  async initialize(config: TelephonyProviderConfig): Promise {
    console.log(`[TelnyxProvider] Initializing provider: ${config.id}`);
    
    this.apiKey = config.apiKey || process.env.TELNYX_API_KEY || '';
    
    if (!this.apiKey) {
      console.error('[TelnyxProvider] No API key configured');
      this.ready = false;
      return;
    }
    
    // Validate API key by making a test request
    try {
      // TODO: Make a simple API call to validate credentials
      // const response = await fetch('https://api.telnyx.com/v2/balance', {
      //   headers: { 'Authorization': `Bearer ${this.apiKey}` }
      // });
      
      this.ready = true;
      console.log(`[TelnyxProvider] Provider ${config.id} initialized successfully`);
    } catch (error) {
      console.error(`[TelnyxProvider] Failed to initialize:`, error);
      this.ready = false;
    }
  }
  
  isReady(): boolean {
    return this.ready;
  }
  
  getCapabilities(): ProviderCapabilities {
    return {
      supportsAmd: true,
      supportsStreaming: true,
      supportsBridge: true,
      supportsTransfer: true,
      supportsRecord: true,
      supportsTts: true,
      supportsGather: true,
      supportsSipHeaders: true,
      maxConcurrentCalls: this.config.maxConcurrent || 100,
      supportedCodecs: ['PCMU', 'PCMA', 'G722', 'opus'],
      supportedRegions: ['us', 'eu', 'apac'],
    };
  }
  
  async checkHealth(): Promise {
    const health: ProviderHealth = {
      healthy: false,
      lastCheck: new Date(),
    };
    
    try {
      const startTime = Date.now();
      
      // Simple health check via Telnyx API
      const response = await fetch('https://api.telnyx.com/v2/balance', {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      
      health.latencyMs = Date.now() - startTime;
      health.healthy = response.ok;
      
      if (!response.ok) {
        health.lastError = `API returned ${response.status}`;
      }
    } catch (error) {
      health.healthy = false;
      health.lastError = error instanceof Error ? error.message : 'Health check failed';
      health.errorCount = (this.lastHealthCheck?.errorCount || 0) + 1;
    }
    
    this.lastHealthCheck = health;
    return health;
  }
  
  async originateCall(options: CallOptions): Promise {
    console.log(`[TelnyxProvider] Originating call to ${options.to}`);
    
    if (!this.ready) {
      return {
        success: false,
        error: 'Provider not ready',
        errorCode: 'PROVIDER_NOT_READY',
      };
    }
    
    try {
      // Use Telnyx Call Control API
      const response = await fetch('https://api.telnyx.com/v2/calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connection_id: options.connectionId,
          to: options.to,
          from: options.from,
          webhook_url: options.webhookUrl,
          webhook_url_method: options.webhookMethod || 'POST',
          answering_machine_detection: options.machineDetection || 'disabled',
          answering_machine_detection_config: options.machineDetection !== 'disabled' ? {
            total_analysis_time_millis: options.machineDetectionTimeout || 5000,
          } : undefined,
          timeout_secs: options.timeout || 30,
          time_limit_secs: options.timeLimit || 14400,
          record: options.record ? 'record-from-answer' : undefined,
          record_channels: options.recordingChannels || 'single',
          sip_headers: options.sipHeaders ? Object.entries(options.sipHeaders).map(([name, value]) => ({
            name,
            value,
          })) : undefined,
          client_state: options.clientState,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || `API error: ${response.status}`,
          errorCode: errorData.errors?.[0]?.code || 'API_ERROR',
          rawResponse: errorData,
        };
      }
      
      const data = await response.json();
      
      return {
        success: true,
        callControlId: data.data?.call_control_id,
        callLegId: data.data?.call_leg_id,
        callSessionId: data.data?.call_session_id,
        providerCallId: data.data?.call_control_id,
        rawResponse: data,
      };
    } catch (error) {
      console.error('[TelnyxProvider] Failed to originate call:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to originate call',
        errorCode: 'ORIGINATE_FAILED',
      };
    }
  }
  
  async answerCall(callControlId: string): Promise {
    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to answer',
          errorCode: 'ANSWER_FAILED',
        };
      }
      
      return { success: true, callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to answer call',
        errorCode: 'ANSWER_FAILED',
      };
    }
  }
  
  async hangupCall(options: HangupOptions): Promise {
    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${options.callControlId}/actions/hangup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to hangup',
          errorCode: 'HANGUP_FAILED',
        };
      }
      
      return { success: true, callControlId: options.callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to hangup call',
        errorCode: 'HANGUP_FAILED',
      };
    }
  }
  
  async transferCall(options: TransferOptions): Promise {
    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${options.callControlId}/actions/transfer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: options.to,
          from: options.from,
          timeout_secs: options.timeout || 30,
          sip_headers: options.sipHeaders ? Object.entries(options.sipHeaders).map(([name, value]) => ({
            name,
            value,
          })) : undefined,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to transfer',
          errorCode: 'TRANSFER_FAILED',
        };
      }
      
      return { success: true, callControlId: options.callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to transfer call',
        errorCode: 'TRANSFER_FAILED',
      };
    }
  }
  
  async bridgeCalls(options: BridgeOptions): Promise {
    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${options.callControlId}/actions/bridge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          call_control_id: options.targetCallControlId,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to bridge',
          errorCode: 'BRIDGE_FAILED',
        };
      }
      
      return { success: true, callControlId: options.callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to bridge calls',
        errorCode: 'BRIDGE_FAILED',
      };
    }
  }
  
  async playAudio(options: PlayAudioOptions): Promise {
    try {
      const body: Record = {};
      
      if (options.audioUrl) {
        body.audio_url = options.audioUrl;
      } else if (options.audioBase64) {
        body.media_url = `data:audio/wav;base64,${options.audioBase64}`;
      }
      
      if (options.loop) {
        body.loop = options.loop;
      }
      
      const response = await fetch(`https://api.telnyx.com/v2/calls/${options.callControlId}/actions/playback_start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to play audio',
          errorCode: 'PLAY_AUDIO_FAILED',
        };
      }
      
      return { success: true, callControlId: options.callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to play audio',
        errorCode: 'PLAY_AUDIO_FAILED',
      };
    }
  }
  
  async speak(options: SpeakOptions): Promise {
    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${options.callControlId}/actions/speak`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: options.text,
          voice: options.voice || 'female',
          language: options.language || 'en-US',
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to speak',
          errorCode: 'SPEAK_FAILED',
        };
      }
      
      return { success: true, callControlId: options.callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to speak',
        errorCode: 'SPEAK_FAILED',
      };
    }
  }
  
  async gatherDigits(options: GatherOptions): Promise {
    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${options.callControlId}/actions/gather`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          minimum_digits: options.minDigits || 1,
          maximum_digits: options.maxDigits || 128,
          timeout_millis: (options.timeout || 60) * 1000,
          terminating_digit: options.terminatingDigit || '#',
          valid_digits: options.validDigits || '0123456789*#',
          inter_digit_timeout_millis: (options.interDigitTimeout || 5) * 1000,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to gather',
          errorCode: 'GATHER_FAILED',
        };
      }
      
      return { success: true, callControlId: options.callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to gather digits',
        errorCode: 'GATHER_FAILED',
      };
    }
  }
  
  async startStream(options: StreamOptions): Promise {
    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${options.callControlId}/actions/streaming_start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stream_url: options.streamUrl,
          stream_track: options.streamTrack || 'both',
          enable_dialogflow: options.enableDialogflow || false,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to start stream',
          errorCode: 'STREAM_START_FAILED',
        };
      }
      
      return { success: true, callControlId: options.callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start stream',
        errorCode: 'STREAM_START_FAILED',
      };
    }
  }
  
  async stopStream(callControlId: string): Promise {
    try {
      const response = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/streaming_stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.errors?.[0]?.detail || 'Failed to stop stream',
          errorCode: 'STREAM_STOP_FAILED',
        };
      }
      
      return { success: true, callControlId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop stream',
        errorCode: 'STREAM_STOP_FAILED',
      };
    }
  }
  
  async getCallStatus(callControlId: string): Promise {
    // Telnyx doesn't have a direct call status endpoint
    // Status is typically tracked via webhooks
    // This would need to query our own database
    return null;
  }
  
  parseWebhookEvent(payload: unknown, headers?: Record): TelephonyWebhookEvent | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    
    const event = payload as Record;
    const data = event.data as Record | undefined;
    const eventPayload = data?.payload as Record | undefined;
    
    if (!data || !eventPayload) {
      return null;
    }
    
    // Map Telnyx event types to normalized types
    const eventTypeMap: Record = {
      'call.initiated': 'call.initiated',
      'call.ringing': 'call.ringing',
      'call.answered': 'call.answered',
      'call.hangup': 'call.hangup',
      'call.machine.detection.ended': 'call.machine.detection.ended',
      'call.machine.greeting.ended': 'call.machine.greeting.ended',
      'call.dtmf.received': 'call.dtmf.received',
      'call.gather.ended': 'call.gather.ended',
      'call.playback.started': 'call.playback.started',
      'call.playback.ended': 'call.playback.ended',
      'call.speak.started': 'call.speak.started',
      'call.speak.ended': 'call.speak.ended',
      'call.recording.saved': 'call.recording.saved',
      'call.bridged': 'call.bridged',
      'streaming.started': 'streaming.started',
      'streaming.stopped': 'streaming.stopped',
      'streaming.failed': 'streaming.failed',
    };
    
    const telnyxEventType = data.event_type as string || '';
    const eventType = eventTypeMap[telnyxEventType] || 'unknown';
    
    // Build normalized payload
    const normalizedPayload: TelephonyEventPayload = {};
    
    // AMD result
    if (eventPayload.result) {
      normalizedPayload.amdResult = eventPayload.result as TelephonyEventPayload['amdResult'];
    }
    
    // DTMF
    if (eventPayload.digit) {
      normalizedPayload.digit = eventPayload.digit as string;
    }
    if (eventPayload.digits) {
      normalizedPayload.digits = eventPayload.digits as string;
    }
    
    // Hangup
    if (eventPayload.hangup_cause) {
      normalizedPayload.hangupCause = eventPayload.hangup_cause as string;
    }
    if (eventPayload.hangup_source) {
      normalizedPayload.hangupSource = eventPayload.hangup_source as TelephonyEventPayload['hangupSource'];
    }
    if (eventPayload.sip_hangup_cause) {
      normalizedPayload.sipCode = parseInt(eventPayload.sip_hangup_cause as string, 10);
    }
    
    // Recording
    if (eventPayload.recording_urls) {
      const urls = eventPayload.recording_urls as Record;
      normalizedPayload.recordingUrl = urls.mp3 || urls.wav;
    }
    
    // Client state
    if (eventPayload.client_state) {
      try {
        const decoded = Buffer.from(eventPayload.client_state as string, 'base64').toString('utf-8');
        normalizedPayload.clientState = JSON.parse(decoded);
      } catch {
        // Ignore parse errors
      }
    }
    
    return {
      eventType,
      callControlId: eventPayload.call_control_id as string || '',
      callSessionId: eventPayload.call_session_id as string,
      callLegId: eventPayload.call_leg_id as string,
      timestamp: new Date(data.occurred_at as string || Date.now()),
      direction: eventPayload.direction as 'inbound' | 'outbound' || 'outbound',
      from: eventPayload.from as string || '',
      to: eventPayload.to as string || '',
      payload: normalizedPayload,
      rawEvent: payload,
      providerType: 'telnyx',
    };
  }
  
  validateWebhookSignature(payload: string, signature: string): boolean {
    // TODO: Implement Telnyx webhook signature validation
    // Telnyx uses HMAC-SHA256 with the webhook secret
    return true; // Placeholder
  }
  
  async shutdown(): Promise {
    console.log(`[TelnyxProvider] Shutting down provider: ${this.providerId}`);
    this.ready = false;
  }
}