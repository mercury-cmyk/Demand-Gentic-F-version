/**
 * WebRTC Audio Bridge Controller
 * 
 * Bridges audio between Telnyx WebRTC and OpenAI Realtime WebRTC.
 * Two modes: Human (direct mic) and AI (OpenAI generated audio).
 * 
 * CRITICAL: All media stays in WebRTC tracks - no WebSocket audio streaming.
 * 
 * Human Mode:
 * - Mic → Telnyx outbound
 * - Telnyx remote → User speakers
 * - OpenAI optional for assist/transcription
 * 
 * AI Mode:
 * - Telnyx remote → OpenAI input
 * - OpenAI output → Telnyx outbound
 * - User speakers optional for monitoring
 */

import { TelnyxWebRTCClient, TelnyxCallState } from './telnyx-webrtc-client';
import { OpenAIRealtimeWebRTCClient, OpenAIRealtimeState } from './openai-realtime-webrtc-client';

export type BridgeMode = 'human' | 'ai';

export type BridgeState = 
  | 'idle'
  | 'telnyx_only'      // Human mode - just Telnyx call
  | 'bridged'          // AI mode - both connected and bridged
  | 'partial'          // Transitioning between modes
  | 'error';

export interface AudioBridgeConfig {
  // Ephemeral token endpoint for OpenAI
  openaiEphemeralEndpoint: string;
  // OpenAI model settings
  openaiModel?: string;
  openaiVoice?: string;
  openaiInstructions?: string;
  // Enable monitoring (hear AI in speakers during AI mode)
  enableMonitoring?: boolean;
  // Callbacks
  onModeChange?: (mode: BridgeMode) => void;
  onStateChange?: (state: BridgeState) => void;
  onTranscript?: (transcript: { role: 'user' | 'assistant'; text: string; isFinal: boolean }) => void;
  onError?: (error: Error) => void;
}

export interface BridgeStatus {
  mode: BridgeMode;
  state: BridgeState;
  telnyxState: TelnyxCallState;
  openaiState: OpenAIRealtimeState;
  isMonitoring: boolean;
}

/**
 * AudioBridgeController
 * 
 * Manages audio routing between Telnyx and OpenAI WebRTC connections.
 */
export class AudioBridgeController {
  private telnyxClient: TelnyxWebRTCClient;
  private openaiClient: OpenAIRealtimeWebRTCClient | null = null;
  private config: AudioBridgeConfig;
  private mode: BridgeMode = 'human';
  private state: BridgeState = 'idle';
  private isMonitoring: boolean = false;

  // Audio elements for playback
  private remoteAudioElement: HTMLAudioElement | null = null;
  private monitorAudioElement: HTMLAudioElement | null = null;

  // Track references
  private originalMicTrack: MediaStreamTrack | null = null;
  private openaiOutputTrack: MediaStreamTrack | null = null;

  // Audio context for processing
  private audioContext: AudioContext | null = null;

  constructor(telnyxClient: TelnyxWebRTCClient, config: AudioBridgeConfig) {
    this.telnyxClient = telnyxClient;
    this.config = config;
    
    // Create audio elements
    this.remoteAudioElement = new Audio();
    this.remoteAudioElement.autoplay = true;
    
    this.monitorAudioElement = new Audio();
    this.monitorAudioElement.autoplay = false;
    this.monitorAudioElement.muted = true;
  }

  /**
   * Initialize the bridge - must be called after Telnyx is ready
   */
  async initialize(): Promise<void> {
    console.log('[AudioBridge] Initializing...');
    
    // Store original mic track reference
    this.originalMicTrack = this.telnyxClient.getLocalAudioTrack();
    
    // Set up Telnyx remote audio playback (for human mode)
    const remoteStream = this.telnyxClient.getRemoteStream();
    if (remoteStream && this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = remoteStream;
      await this.remoteAudioElement.play().catch(e => {
        console.warn('[AudioBridge] Auto-play blocked:', e);
      });
    }
    
    this.updateState('telnyx_only');
    console.log('[AudioBridge] Initialized in human mode');
  }

  /**
   * Switch to AI mode - connect OpenAI and bridge audio
   */
  async switchToAIMode(): Promise<void> {
    if (this.mode === 'ai') {
      console.warn('[AudioBridge] Already in AI mode');
      return;
    }

    console.log('[AudioBridge] Switching to AI mode...');
    this.updateState('partial');

    try {
      // Get Telnyx remote audio track (other party's voice)
      const telnyxRemoteTrack = this.telnyxClient.getRemoteAudioTrack();
      if (!telnyxRemoteTrack) {
        throw new Error('No remote audio track from Telnyx call');
      }

      // Create OpenAI client
      this.openaiClient = new OpenAIRealtimeWebRTCClient({
        ephemeralTokenEndpoint: this.config.openaiEphemeralEndpoint,
        model: this.config.openaiModel,
        voice: this.config.openaiVoice,
        instructions: this.config.openaiInstructions,
        inputAudioTranscription: { model: 'whisper-1' },
        turnDetection: {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 500,
          create_response: true,
        },
        onStateChange: (state) => {
          console.log('[AudioBridge] OpenAI state:', state);
          this.checkBridgeState();
        },
        onAudioOutput: (track) => {
          console.log('[AudioBridge] OpenAI output track received');
          this.handleOpenAIOutputTrack(track);
        },
        onTranscript: (transcript) => {
          this.config.onTranscript?.(transcript);
        },
        onError: (error) => {
          console.error('[AudioBridge] OpenAI error:', error);
          this.config.onError?.(error);
        },
      });

      // Connect to OpenAI with Telnyx remote audio as input
      await this.openaiClient.connect(telnyxRemoteTrack);

      // Update mode
      this.mode = 'ai';
      this.config.onModeChange?.('ai');
      
      // Mute the regular remote audio playback (AI handles it now)
      if (this.remoteAudioElement) {
        this.remoteAudioElement.muted = true;
      }

      console.log('[AudioBridge] AI mode activated');
      
    } catch (error) {
      console.error('[AudioBridge] Failed to switch to AI mode:', error);
      this.updateState('error');
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Handle OpenAI output track - bridge to Telnyx outbound
   */
  private async handleOpenAIOutputTrack(track: MediaStreamTrack): Promise<void> {
    this.openaiOutputTrack = track;
    
    // Replace Telnyx local audio track with OpenAI output
    const success = await this.telnyxClient.replaceLocalAudioTrack(track);
    if (success) {
      console.log('[AudioBridge] OpenAI output bridged to Telnyx');
      this.updateState('bridged');
    } else {
      console.error('[AudioBridge] Failed to bridge OpenAI output');
      this.updateState('error');
    }

    // Set up monitoring if enabled
    if (this.config.enableMonitoring && this.monitorAudioElement) {
      const monitorStream = new MediaStream([track]);
      this.monitorAudioElement.srcObject = monitorStream;
      // Don't auto-play - user must enable monitoring explicitly
    }
  }

  /**
   * Switch back to human mode
   */
  async switchToHumanMode(): Promise<void> {
    if (this.mode === 'human') {
      console.warn('[AudioBridge] Already in human mode');
      return;
    }

    console.log('[AudioBridge] Switching to human mode...');
    this.updateState('partial');

    try {
      // Restore original microphone track to Telnyx
      if (this.originalMicTrack) {
        await this.telnyxClient.replaceLocalAudioTrack(this.originalMicTrack);
        console.log('[AudioBridge] Mic track restored to Telnyx');
      } else {
        await this.telnyxClient.restoreLocalMicrophoneTrack();
      }

      // Disconnect OpenAI
      if (this.openaiClient) {
        this.openaiClient.disconnect();
        this.openaiClient = null;
      }

      // Unmute remote audio playback
      if (this.remoteAudioElement) {
        this.remoteAudioElement.muted = false;
      }

      // Disable monitoring
      this.setMonitoring(false);

      // Update mode
      this.mode = 'human';
      this.config.onModeChange?.('human');
      this.updateState('telnyx_only');
      
      console.log('[AudioBridge] Human mode activated');
      
    } catch (error) {
      console.error('[AudioBridge] Failed to switch to human mode:', error);
      this.updateState('error');
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Toggle between human and AI mode
   */
  async toggleMode(): Promise<BridgeMode> {
    if (this.mode === 'human') {
      await this.switchToAIMode();
    } else {
      await this.switchToHumanMode();
    }
    return this.mode;
  }

  /**
   * Enable/disable AI audio monitoring (hear AI in speakers)
   */
  setMonitoring(enabled: boolean): void {
    this.isMonitoring = enabled;
    
    if (this.monitorAudioElement) {
      this.monitorAudioElement.muted = !enabled;
      
      if (enabled && this.openaiOutputTrack) {
        this.monitorAudioElement.play().catch(e => {
          console.warn('[AudioBridge] Monitor play blocked:', e);
        });
      } else {
        this.monitorAudioElement.pause();
      }
    }
    
    console.log('[AudioBridge] Monitoring:', enabled);
  }

  /**
   * Toggle monitoring
   */
  toggleMonitoring(): boolean {
    this.setMonitoring(!this.isMonitoring);
    return this.isMonitoring;
  }

  /**
   * Send a text message to AI (in AI mode)
   */
  sendMessageToAI(text: string): void {
    if (this.mode !== 'ai' || !this.openaiClient) {
      console.warn('[AudioBridge] Cannot send message - not in AI mode');
      return;
    }
    
    this.openaiClient.sendMessage(text);
  }

  /**
   * Update AI instructions mid-call
   */
  updateAIInstructions(instructions: string): void {
    if (!this.openaiClient) {
      console.warn('[AudioBridge] Cannot update instructions - OpenAI not connected');
      return;
    }
    
    this.openaiClient.updateSession({ instructions } as any);
  }

  /**
   * Cancel current AI response
   */
  cancelAIResponse(): void {
    if (this.openaiClient) {
      this.openaiClient.cancelResponse();
    }
  }

  /**
   * Check and update bridge state based on both connections
   */
  private checkBridgeState(): void {
    const telnyxState = this.telnyxClient.getCallState();
    const openaiState = this.openaiClient?.getState() || 'disconnected';

    if (telnyxState === 'active' && this.mode === 'ai' && openaiState === 'connected') {
      this.updateState('bridged');
    } else if (telnyxState === 'active' && this.mode === 'human') {
      this.updateState('telnyx_only');
    } else if (telnyxState === 'idle' || telnyxState === 'hangup') {
      this.updateState('idle');
    }
  }

  /**
   * Update state and notify listeners
   */
  private updateState(state: BridgeState): void {
    if (this.state !== state) {
      console.log('[AudioBridge] State:', this.state, '->', state);
      this.state = state;
      this.config.onStateChange?.(state);
    }
  }

  /**
   * Get current status
   */
  getStatus(): BridgeStatus {
    return {
      mode: this.mode,
      state: this.state,
      telnyxState: this.telnyxClient.getCallState(),
      openaiState: this.openaiClient?.getState() || 'disconnected',
      isMonitoring: this.isMonitoring,
    };
  }

  /**
   * Get current mode
   */
  getMode(): BridgeMode {
    return this.mode;
  }

  /**
   * Get current state
   */
  getState(): BridgeState {
    return this.state;
  }

  /**
   * Clean up when call ends
   */
  cleanup(): void {
    console.log('[AudioBridge] Cleaning up...');
    
    if (this.openaiClient) {
      this.openaiClient.disconnect();
      this.openaiClient = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
    }

    if (this.monitorAudioElement) {
      this.monitorAudioElement.srcObject = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.originalMicTrack = null;
    this.openaiOutputTrack = null;
    this.mode = 'human';
    this.isMonitoring = false;
    this.updateState('idle');
  }
}

/**
 * Create a pre-configured audio bridge for a call
 */
export function createAudioBridge(
  telnyxClient: TelnyxWebRTCClient,
  config: AudioBridgeConfig
): AudioBridgeController {
  return new AudioBridgeController(telnyxClient, config);
}
