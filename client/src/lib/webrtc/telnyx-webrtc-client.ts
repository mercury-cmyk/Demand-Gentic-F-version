/**
 * Telnyx WebRTC Client Wrapper
 * 
 * Single unified calling stack using @telnyx/webrtc SDK.
 * Supports both Human Agent and AI Agent modes.
 * 
 * CRITICAL: No WebSockets for media - WebRTC only.
 */

import { TelnyxRTC } from '@telnyx/webrtc';

// Telnyx SDK types - using any for flexibility across SDK versions
// The SDK exports vary between versions, so we use duck typing
export type ICall = any;
export type INotification = any;

const formatSocketCloseDetails = (event?: CloseEvent | Event | null): string => {
  if (!event || typeof (event as CloseEvent).code !== 'number') {
    return '';
  }

  const closeEvent = event as CloseEvent;
  const details: string[] = [`code=${closeEvent.code}`];

  if (closeEvent.reason) {
    details.push(`reason=${closeEvent.reason}`);
  }

  if (typeof closeEvent.wasClean === 'boolean') {
    details.push(`clean=${closeEvent.wasClean}`);
  }

  return details.length ? ` (${details.join(', ')})` : '';
};

export type TelnyxCallState = 
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'early'
  | 'active'
  | 'held'
  | 'hangup'
  | 'error';

export type TelnyxCallDirection = 'inbound' | 'outbound';

export interface TelnyxCredentials {
  // Token-based auth (preferred for browser)
  token?: string;
  // Or credential-based auth
  username?: string;
  password?: string;
}

export interface TelnyxClientConfig {
  credentials: TelnyxCredentials;
  callerIdName?: string;
  callerIdNumber?: string;
  // Audio device IDs
  audioInputDeviceId?: string;
  audioOutputDeviceId?: string;
  // Network configuration for corporate/restrictive environments
  ringToneFile?: string;
  ringtoneFile?: string;
  host?: string;
  port?: number;
  wss?: boolean;
  iceServers?: RTCIceServer[];
  // Callbacks
  onReady?: () => void;
  onError?: (error: Error) => void;
  onCallStateChange?: (state: TelnyxCallState, call: ICall | null) => void;
  onIncomingCall?: (call: ICall) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onLocalStream?: (stream: MediaStream) => void;
}

export interface TelnyxOutboundCallOptions {
  destinationNumber: string;
  callerIdNumber?: string;
  callerIdName?: string;
  // Custom headers for SIP
  customHeaders?: Array<{ name: string; value: string }>;
}

/**
 * TelnyxWebRTCClient
 * 
 * Wraps the @telnyx/webrtc SDK for unified call management.
 * Exposes media tracks for audio bridging with OpenAI Realtime.
 */
export class TelnyxWebRTCClient {
  private client: TelnyxRTC | null = null;
  private config: TelnyxClientConfig;
  private currentCall: ICall | null = null;
  private callState: TelnyxCallState = 'idle';
  private isConnected: boolean = false;
  private remoteStream: MediaStream | null = null;
  private localStream: MediaStream | null = null;

  // Audio context for track manipulation
  private audioContext: AudioContext | null = null;
  private remoteAudioSource: MediaStreamAudioSourceNode | null = null;
  private localAudioDestination: MediaStreamAudioDestinationNode | null = null;

  constructor(config: TelnyxClientConfig) {
    this.config = config;
  }

  /**
   * Initialize and connect the Telnyx WebRTC client
   */
  async connect(): Promise<void> {
    try {
      // Check if TelnyxRTC is available
      if (typeof TelnyxRTC === 'undefined') {
        throw new Error('[TelnyxWebRTC] Telnyx WebRTC SDK not loaded. Make sure @telnyx/webrtc is installed.');
      }

      console.log('[TelnyxWebRTC] Starting connection process...');
      console.log('[TelnyxWebRTC] Credentials check:', {
        hasToken: !!this.config.credentials.token,
        hasUsername: !!this.config.credentials.username,
        hasPassword: !!this.config.credentials.password,
      });

      const wsHost = this.config.host || 'rtc.telnyx.com';
      const wsPort = this.config.port || 14938; // Telnyx documented WebRTC port
      const wsSecure = this.config.wss !== false; // default to secure
      const wsUrl = `${wsSecure ? 'wss' : 'ws'}://${wsHost}:${wsPort}`;

      const clientOptions: any = {
        // WebRTC-only configuration
        useMicrophone: true,
        useSpeaker: true,
        // Audio device selection
        ...(this.config.audioInputDeviceId && { micId: this.config.audioInputDeviceId }),
        ...(this.config.audioOutputDeviceId && { speakerId: this.config.audioOutputDeviceId }),
        // Explicit WebSocket endpoint (avoids default wss://rtc.telnyx.com/ with no port)
        host: wsHost,
        port: wsPort,
        wss: wsSecure,
        wsServer: wsUrl,
      };

      // Set credentials
      if (this.config.credentials.token) {
        clientOptions.login_token = this.config.credentials.token;
        console.log('[TelnyxWebRTC] Using token authentication');
      } else if (this.config.credentials.username && this.config.credentials.password) {
        clientOptions.login = this.config.credentials.username;
        clientOptions.password = this.config.credentials.password;
        console.log('[TelnyxWebRTC] Using username/password authentication for user:', this.config.credentials.username);
      } else {
        throw new Error('[TelnyxWebRTC] No valid credentials provided');
      }

      console.log('[TelnyxWebRTC] Initializing client with options:', { 
        ...clientOptions, 
        password: clientOptions.password ? '[REDACTED]' : undefined,
        login_token: clientOptions.login_token ? '[REDACTED]' : undefined 
      });
      
      this.client = new TelnyxRTC(clientOptions);

      // Set up event handlers BEFORE connecting
      this.setupEventHandlers();

      console.log('[TelnyxWebRTC] Starting connection...');
      // Connect to Telnyx
      await this.client.connect();
      console.log('[TelnyxWebRTC] Client connected successfully');
    } catch (error) {
      console.error('[TelnyxWebRTC] Connection error:', error);
      console.error('[TelnyxWebRTC] Error stack:', (error as Error).stack);
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Set up all Telnyx SDK event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Socket ready
    this.client.on('telnyx.ready', () => {
      console.log('[TelnyxWebRTC] Ready - registration complete');
      this.isConnected = true;
      this.config.onReady?.();
    });

    // Socket error
    this.client.on('telnyx.error', (error: Error) => {
      console.error('[TelnyxWebRTC] Error:', error);
      this.config.onError?.(error);
    });

    // Socket connect event
    this.client.on('telnyx.socket.open', () => {
      console.log('[TelnyxWebRTC] Socket opened - connection established');
    });

    // Socket disconnect event  
    this.client.on('telnyx.socket.close', (event: CloseEvent | Event) => {
      const details = formatSocketCloseDetails(event);
      console.log(`[TelnyxWebRTC] Socket closed${details}:`, event);
      this.isConnected = false;
      this.updateCallState('idle');
    });

    // Socket error event
    this.client.on('telnyx.socket.error', (event: Event) => {
      console.error('[TelnyxWebRTC] Socket error:', event);
    });

    // Registration events
    this.client.on('telnyx.socket.message', (message: any) => {
      console.log('[TelnyxWebRTC] Socket message:', message?.method || 'unknown');
      
      // Detect authentication failures
      if (message?.error) {
        const errorMsg = message.error.message || message.error;
        console.error('[TelnyxWebRTC] Server error:', errorMsg);
        
        if (errorMsg.includes('Unauthorized') || errorMsg.includes('credentials')) {
          this.config.onError?.(new Error('Authentication failed - check your Telnyx WebRTC credentials'));
        }
      }
    });

    // Incoming notification (includes calls)
    this.client.on('telnyx.notification', (notification: INotification) => {
      console.log('[TelnyxWebRTC] Notification:', notification.type);
      this.handleNotification(notification);
    });

  }

  /**
   * Handle incoming notifications from Telnyx
   */
  private handleNotification(notification: INotification): void {
    const call = notification.call as ICall;
    
    switch (notification.type) {
      case 'callUpdate':
        this.handleCallUpdate(call);
        break;
      case 'userMediaError':
        console.error('[TelnyxWebRTC] Media error:', notification);
        this.updateCallState('error');
        break;
      default:
        console.log('[TelnyxWebRTC] Unhandled notification:', notification.type);
    }
  }

  /**
   * Handle call state updates
   */
  private handleCallUpdate(call: ICall): void {
    this.currentCall = call;
    const state = call.state;
    
    console.log('[TelnyxWebRTC] Call state update:', state, 'Direction:', call.direction);

    switch (state) {
      case 'new':
        // New incoming call
        if (call.direction === 'inbound') {
          this.updateCallState('ringing');
          this.config.onIncomingCall?.(call);
        }
        break;

      case 'trying':
      case 'requesting':
        this.updateCallState('connecting');
        break;

      case 'ringing':
      case 'early':
        this.updateCallState('ringing');
        break;

      case 'active':
        this.updateCallState('active');
        this.extractMediaStreams(call);
        break;

      case 'held':
        this.updateCallState('held');
        break;

      case 'hangup':
      case 'destroy':
        this.updateCallState('hangup');
        this.cleanupCall();
        break;

      default:
        console.log('[TelnyxWebRTC] Unknown call state:', state);
    }
  }

  /**
   * Extract media streams from the call
   */
  private extractMediaStreams(call: ICall): void {
    try {
      // Get remote stream (other party's audio)
      const remoteStream = call.remoteStream;
      if (remoteStream) {
        this.remoteStream = remoteStream;
        console.log('[TelnyxWebRTC] Remote stream captured, tracks:', remoteStream.getAudioTracks().length);
        this.config.onRemoteStream?.(remoteStream);
      }

      // Get local stream (our microphone)
      const localStream = call.localStream;
      if (localStream) {
        this.localStream = localStream;
        console.log('[TelnyxWebRTC] Local stream captured, tracks:', localStream.getAudioTracks().length);
        this.config.onLocalStream?.(localStream);
      }
    } catch (error) {
      console.error('[TelnyxWebRTC] Error extracting streams:', error);
    }
  }

  /**
   * Update call state and notify listeners
   */
  private updateCallState(state: TelnyxCallState): void {
    if (this.callState !== state) {
      console.log('[TelnyxWebRTC] State transition:', this.callState, '->', state);
      this.callState = state;
      this.config.onCallStateChange?.(state, this.currentCall);
    }
  }

  /**
   * Clean up after call ends
   */
  private cleanupCall(): void {
    this.currentCall = null;
    this.remoteStream = null;
    this.localStream = null;
    setTimeout(() => {
      if (this.callState === 'hangup') {
        this.updateCallState('idle');
      }
    }, 1000);
  }

  /**
   * Place an outbound call
   */
  async call(options: TelnyxOutboundCallOptions): Promise<ICall> {
    if (!this.client || !this.isConnected) {
      throw new Error('[TelnyxWebRTC] Client not connected');
    }

    if (this.currentCall) {
      throw new Error('[TelnyxWebRTC] Call already in progress');
    }

    console.log('[TelnyxWebRTC] Placing call to:', options.destinationNumber);
    this.updateCallState('connecting');

    try {
      const callOptions: any = {
        destinationNumber: options.destinationNumber,
        callerNumber: options.callerIdNumber || this.config.callerIdNumber,
        callerName: options.callerIdName || this.config.callerIdName,
      };

      // Add custom SIP headers if provided
      if (options.customHeaders?.length) {
        callOptions.customHeaders = options.customHeaders;
      }

      const call = this.client.newCall(callOptions);
      this.currentCall = call;
      
      return call;
    } catch (error) {
      console.error('[TelnyxWebRTC] Call error:', error);
      this.updateCallState('error');
      throw error;
    }
  }

  /**
   * Answer an incoming call
   */
  async answer(): Promise<void> {
    if (!this.currentCall) {
      throw new Error('[TelnyxWebRTC] No incoming call to answer');
    }

    console.log('[TelnyxWebRTC] Answering call');
    this.currentCall.answer();
  }

  /**
   * Hang up the current call
   */
  hangup(): void {
    if (this.currentCall) {
      console.log('[TelnyxWebRTC] Hanging up call');
      this.currentCall.hangup();
    }
  }

  /**
   * Toggle mute on local audio
   */
  toggleMute(): boolean {
    if (!this.currentCall) return false;
    
    if (this.currentCall.localStream) {
      const audioTracks = this.currentCall.localStream.getAudioTracks();
      const isMuted = !audioTracks[0]?.enabled;
      audioTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = isMuted;
      });
      console.log('[TelnyxWebRTC] Mute toggled:', !isMuted);
      return !isMuted;
    }
    return false;
  }

  /**
   * Toggle hold on the call
   */
  async toggleHold(): Promise<boolean> {
    if (!this.currentCall) return false;
    
    if (this.callState === 'held') {
      await this.currentCall.unhold();
      return false;
    } else {
      await this.currentCall.hold();
      return true;
    }
  }

  /**
   * Send DTMF tones
   */
  sendDTMF(digit: string): void {
    if (this.currentCall) {
      this.currentCall.dtmf(digit);
      console.log('[TelnyxWebRTC] DTMF sent:', digit);
    }
  }

  /**
   * Get the remote audio track (other party's voice)
   * Used for bridging to OpenAI Realtime
   */
  getRemoteAudioTrack(): MediaStreamTrack | null {
    if (!this.remoteStream) return null;
    const tracks = this.remoteStream.getAudioTracks();
    return tracks.length > 0 ? tracks[0] : null;
  }

  /**
   * Get the local audio track (our microphone)
   */
  getLocalAudioTrack(): MediaStreamTrack | null {
    if (!this.localStream) return null;
    const tracks = this.localStream.getAudioTracks();
    return tracks.length > 0 ? tracks[0] : null;
  }

  /**
   * Replace the local audio track (for AI mode - inject OpenAI output)
   * This is the key method for audio bridging
   */
  async replaceLocalAudioTrack(newTrack: MediaStreamTrack): Promise<boolean> {
    if (!this.currentCall) {
      console.error('[TelnyxWebRTC] No active call for track replacement');
      return false;
    }

    try {
      // Get the RTCPeerConnection from the call
      const peerConnection = (this.currentCall as any).peer;
      if (!peerConnection) {
        console.error('[TelnyxWebRTC] No peer connection available');
        return false;
      }

      // Find the audio sender
      const senders = peerConnection.getSenders();
      const audioSender = senders.find((s: RTCRtpSender) => 
        s.track?.kind === 'audio' || s.track === null
      );

      if (!audioSender) {
        console.error('[TelnyxWebRTC] No audio sender found');
        return false;
      }

      // Replace the track
      await audioSender.replaceTrack(newTrack);
      console.log('[TelnyxWebRTC] Local audio track replaced successfully');
      return true;
    } catch (error) {
      console.error('[TelnyxWebRTC] Track replacement error:', error);
      return false;
    }
  }

  /**
   * Restore original microphone track (switch back from AI mode)
   */
  async restoreLocalMicrophoneTrack(): Promise<boolean> {
    if (!this.localStream) {
      console.error('[TelnyxWebRTC] No local stream available');
      return false;
    }

    const micTrack = this.localStream.getAudioTracks()[0];
    if (!micTrack) {
      console.error('[TelnyxWebRTC] No microphone track available');
      return false;
    }

    return this.replaceLocalAudioTrack(micTrack);
  }

  /**
   * Get current call state
   */
  getCallState(): TelnyxCallState {
    return this.callState;
  }

  /**
   * Get current call
   */
  getCurrentCall(): ICall | null {
    return this.currentCall;
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Get remote stream
   */
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Get local stream  
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Update audio device
   */
  async setAudioInputDevice(deviceId: string): Promise<void> {
    if (this.client) {
      await this.client.setAudioSettings({ micId: deviceId });
      console.log('[TelnyxWebRTC] Audio input device set:', deviceId);
    }
  }

  /**
   * Update speaker device
   */
  async setAudioOutputDevice(deviceId: string): Promise<void> {
    if (this.client) {
      // Note: Telnyx SDK may not support speaker selection directly
      // Speaker output is typically handled at the HTMLAudioElement level
      // Store for reference and apply to audio elements as needed
      console.log('[TelnyxWebRTC] Audio output device set:', deviceId);
      // If SDK supports it in future versions:
      // await this.client.setAudioSettings({ speakerId: deviceId });
    }
  }

  /**
   * Get available media devices
   */
  async getMediaDevices(): Promise<{
    audioInputs: MediaDeviceInfo[];
    audioOutputs: MediaDeviceInfo[];
  }> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      audioInputs: devices.filter(d => d.kind === 'audioinput'),
      audioOutputs: devices.filter(d => d.kind === 'audiooutput'),
    };
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    if (this.currentCall) {
      this.hangup();
    }
    
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    
    this.isConnected = false;
    this.updateCallState('idle');
    console.log('[TelnyxWebRTC] Disconnected');
  }
}

/**
 * Singleton factory for TelnyxWebRTCClient
 */
let clientInstance: TelnyxWebRTCClient | null = null;

export function getTelnyxClient(config?: TelnyxClientConfig): TelnyxWebRTCClient | null {
  if (config && !clientInstance) {
    clientInstance = new TelnyxWebRTCClient(config);
  }
  return clientInstance;
}

export function destroyTelnyxClient(): void {
  if (clientInstance) {
    clientInstance.disconnect();
    clientInstance = null;
  }
}
