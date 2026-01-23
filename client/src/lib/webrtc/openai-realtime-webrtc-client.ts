/**
 * OpenAI Realtime WebRTC Client
 * 
 * Connects to OpenAI Realtime API using WebRTC peer connection.
 * NO WebSockets - pure WebRTC for audio and data channel for events.
 * 
 * Per OpenAI Realtime WebRTC guide:
 * 1. Fetch ephemeral credentials from server
 * 2. Create RTCPeerConnection with audio transceiver
 * 3. Create data channel for events/instructions
 * 4. Perform SDP offer/answer exchange via REST
 */

export type OpenAIRealtimeState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface OpenAIRealtimeConfig {
  // Server endpoint to fetch ephemeral credentials
  ephemeralTokenEndpoint: string;
  // Model configuration
  model?: string;
  voice?: string;
  instructions?: string;
  // Input audio transcription
  inputAudioTranscription?: {
    model?: string;
  };
  // Turn detection
  turnDetection?: {
    type?: 'server_vad' | 'none';
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
    create_response?: boolean;
  };
  // Callbacks
  onStateChange?: (state: OpenAIRealtimeState) => void;
  onAudioOutput?: (track: MediaStreamTrack) => void;
  onTranscript?: (transcript: { role: 'user' | 'assistant'; text: string; isFinal: boolean }) => void;
  onFunctionCall?: (name: string, args: any, callId: string) => void;
  onError?: (error: Error) => void;
  onSessionCreated?: (sessionId: string) => void;
}

export interface OpenAISessionConfig {
  model: string;
  voice: string;
  instructions: string;
  input_audio_format: string;
  output_audio_format: string;
  input_audio_transcription?: {
    model: string;
  };
  turn_detection?: {
    type: 'server_vad' | 'none';
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
    create_response?: boolean;
  };
  tools?: Array<{
    type: 'function';
    name: string;
    description: string;
    parameters: object;
  }>;
}

interface EphemeralTokenResponse {
  token: string;
  expires_at: number;
}

/**
 * OpenAIRealtimeWebRTCClient
 * 
 * WebRTC-only connection to OpenAI Realtime API.
 * Uses data channel for events (no WebSocket).
 */
export class OpenAIRealtimeWebRTCClient {
  private config: OpenAIRealtimeConfig;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private state: OpenAIRealtimeState = 'disconnected';
  private sessionId: string | null = null;
  private outputAudioTrack: MediaStreamTrack | null = null;
  private inputAudioTrack: MediaStreamTrack | null = null;

  // OpenAI Realtime base URL
  private readonly REALTIME_BASE_URL = 'https://api.openai.com/v1/realtime';
  private readonly DEFAULT_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

  constructor(config: OpenAIRealtimeConfig) {
    this.config = config;
  }

  /**
   * Connect to OpenAI Realtime via WebRTC
   */
  async connect(inputAudioTrack?: MediaStreamTrack): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      console.warn('[OpenAI-WebRTC] Already connected/connecting');
      return;
    }

    this.updateState('connecting');
    
    try {
      // 1. Get ephemeral token from server
      console.log('[OpenAI-WebRTC] Fetching ephemeral token...');
      const { token } = await this.fetchEphemeralToken();
      
      // 2. Create peer connection
      console.log('[OpenAI-WebRTC] Creating peer connection...');
      this.createPeerConnection();
      
      // 3. Add input audio track if provided
      if (inputAudioTrack) {
        this.setInputAudioTrack(inputAudioTrack);
      }
      
      // 4. Create data channel for events
      this.createDataChannel();
      
      // 5. Create and send offer
      console.log('[OpenAI-WebRTC] Creating offer...');
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);
      
      // 6. Exchange SDP with OpenAI
      console.log('[OpenAI-WebRTC] Exchanging SDP...');
      const answer = await this.exchangeSDP(token, offer.sdp!);
      
      // 7. Set remote description
      await this.peerConnection!.setRemoteDescription({
        type: 'answer',
        sdp: answer
      });
      
      console.log('[OpenAI-WebRTC] Connection established');
      
    } catch (error) {
      console.error('[OpenAI-WebRTC] Connection error:', error);
      this.updateState('error');
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Fetch ephemeral token from server
   */
  private async fetchEphemeralToken(): Promise<EphemeralTokenResponse> {
    const response = await fetch(this.config.ephemeralTokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        model: this.config.model || this.DEFAULT_MODEL,
        voice: this.config.voice,
        instructions: this.config.instructions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch ephemeral token: ${error}`);
    }

    return response.json();
  }

  /**
   * Create RTCPeerConnection with proper configuration
   */
  private createPeerConnection(): void {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
      bundlePolicy: 'max-bundle',
    };

    this.peerConnection = new RTCPeerConnection(config);

    // Handle incoming tracks (OpenAI audio output)
    this.peerConnection.ontrack = (event) => {
      console.log('[OpenAI-WebRTC] Received track:', event.track.kind);
      if (event.track.kind === 'audio') {
        this.outputAudioTrack = event.track;
        this.config.onAudioOutput?.(event.track);
      }
    };

    // Handle ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('[OpenAI-WebRTC] ICE state:', state);
      
      if (state === 'connected' || state === 'completed') {
        this.updateState('connected');
      } else if (state === 'failed' || state === 'disconnected') {
        this.updateState('error');
      }
    };

    // Handle connection state
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[OpenAI-WebRTC] Connection state:', state);
      
      if (state === 'connected') {
        this.updateState('connected');
      } else if (state === 'failed' || state === 'closed') {
        this.updateState('disconnected');
      }
    };

    // Add audio transceiver for receiving OpenAI output
    // sendrecv allows both sending input and receiving output
    this.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
  }

  /**
   * Create data channel for events/instructions
   */
  private createDataChannel(): void {
    if (!this.peerConnection) return;

    // Create the data channel for server events
    this.dataChannel = this.peerConnection.createDataChannel('oai-events', {
      ordered: true,
    });

    this.dataChannel.onopen = () => {
      console.log('[OpenAI-WebRTC] Data channel opened');
      // Send session update with initial configuration
      this.sendSessionUpdate();
    };

    this.dataChannel.onclose = () => {
      console.log('[OpenAI-WebRTC] Data channel closed');
    };

    this.dataChannel.onmessage = (event) => {
      this.handleServerEvent(event.data);
    };

    this.dataChannel.onerror = (error) => {
      console.error('[OpenAI-WebRTC] Data channel error:', error);
    };
  }

  /**
   * Exchange SDP with OpenAI Realtime API
   */
  private async exchangeSDP(token: string, offerSdp: string): Promise<string> {
    const model = this.config.model || this.DEFAULT_MODEL;
    const url = `${this.REALTIME_BASE_URL}?model=${encodeURIComponent(model)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: offerSdp,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SDP exchange failed: ${error}`);
    }

    const answerSdp = await response.text();
    return answerSdp;
  }

  /**
   * Send session update via data channel
   */
  private sendSessionUpdate(): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('[OpenAI-WebRTC] Data channel not ready for session update');
      return;
    }

    const sessionConfig: OpenAISessionConfig = {
      model: this.config.model || this.DEFAULT_MODEL,
      voice: this.config.voice || 'marin',
      instructions: this.config.instructions || 'You are a helpful assistant.',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
    };

    // Add input audio transcription if configured
    if (this.config.inputAudioTranscription) {
      sessionConfig.input_audio_transcription = {
        model: this.config.inputAudioTranscription.model || 'whisper-1',
      };
    }

    // Add turn detection if configured
    if (this.config.turnDetection && this.config.turnDetection.type) {
      sessionConfig.turn_detection = {
        type: this.config.turnDetection.type,
        threshold: this.config.turnDetection.threshold,
        prefix_padding_ms: this.config.turnDetection.prefix_padding_ms,
        silence_duration_ms: this.config.turnDetection.silence_duration_ms,
        create_response: this.config.turnDetection.create_response,
      };
    }

    const event = {
      type: 'session.update',
      session: sessionConfig,
    };

    this.dataChannel.send(JSON.stringify(event));
    console.log('[OpenAI-WebRTC] Session update sent');
  }

  /**
   * Handle server events from data channel
   */
  private handleServerEvent(data: string): void {
    try {
      const event = JSON.parse(data);
      console.log('[OpenAI-WebRTC] Server event:', event.type);

      switch (event.type) {
        case 'session.created':
          this.sessionId = event.session?.id;
          this.config.onSessionCreated?.(this.sessionId!);
          break;

        case 'session.updated':
          console.log('[OpenAI-WebRTC] Session updated');
          break;

        case 'conversation.item.input_audio_transcription.completed':
          this.config.onTranscript?.({
            role: 'user',
            text: event.transcript || '',
            isFinal: true,
          });
          break;

        case 'response.audio_transcript.delta':
          this.config.onTranscript?.({
            role: 'assistant',
            text: event.delta || '',
            isFinal: false,
          });
          break;

        case 'response.audio_transcript.done':
          this.config.onTranscript?.({
            role: 'assistant',
            text: event.transcript || '',
            isFinal: true,
          });
          break;

        case 'response.function_call_arguments.done':
          if (event.name && event.call_id) {
            try {
              const args = JSON.parse(event.arguments || '{}');
              this.config.onFunctionCall?.(event.name, args, event.call_id);
            } catch (e) {
              console.error('[OpenAI-WebRTC] Failed to parse function args:', e);
            }
          }
          break;

        case 'error':
          console.error('[OpenAI-WebRTC] Server error:', event.error);
          this.config.onError?.(new Error(event.error?.message || 'Unknown error'));
          break;

        case 'rate_limits.updated':
          console.log('[OpenAI-WebRTC] Rate limits:', event.rate_limits);
          break;
      }
    } catch (error) {
      console.error('[OpenAI-WebRTC] Failed to parse server event:', error);
    }
  }

  /**
   * Set the input audio track (remote party's voice from Telnyx)
   */
  setInputAudioTrack(track: MediaStreamTrack): void {
    if (!this.peerConnection) {
      console.error('[OpenAI-WebRTC] No peer connection');
      return;
    }

    this.inputAudioTrack = track;

    // Find existing audio sender and replace track
    const senders = this.peerConnection.getSenders();
    const audioSender = senders.find(s => s.track?.kind === 'audio' || !s.track);
    
    if (audioSender) {
      audioSender.replaceTrack(track)
        .then(() => console.log('[OpenAI-WebRTC] Input audio track set'))
        .catch(e => console.error('[OpenAI-WebRTC] Failed to set input track:', e));
    } else {
      // Add as new track
      this.peerConnection.addTrack(track, new MediaStream([track]));
      console.log('[OpenAI-WebRTC] Input audio track added');
    }
  }

  /**
   * Get the output audio track (OpenAI generated speech)
   */
  getOutputAudioTrack(): MediaStreamTrack | null {
    return this.outputAudioTrack;
  }

  /**
   * Send a text message to the model (via data channel)
   */
  sendMessage(text: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.error('[OpenAI-WebRTC] Data channel not ready');
      return;
    }

    // Create conversation item
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: text,
        }],
      },
    };

    this.dataChannel.send(JSON.stringify(event));

    // Trigger response
    this.dataChannel.send(JSON.stringify({ type: 'response.create' }));
  }

  /**
   * Send function call result
   */
  sendFunctionResult(callId: string, result: any): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.error('[OpenAI-WebRTC] Data channel not ready');
      return;
    }

    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    };

    this.dataChannel.send(JSON.stringify(event));
    
    // Trigger response after function result
    this.dataChannel.send(JSON.stringify({ type: 'response.create' }));
  }

  /**
   * Cancel ongoing response
   */
  cancelResponse(): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return;
    }

    this.dataChannel.send(JSON.stringify({ type: 'response.cancel' }));
    console.log('[OpenAI-WebRTC] Response cancelled');
  }

  /**
   * Update session configuration
   */
  updateSession(config: Partial<OpenAISessionConfig>): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.error('[OpenAI-WebRTC] Data channel not ready');
      return;
    }

    const event = {
      type: 'session.update',
      session: config,
    };

    this.dataChannel.send(JSON.stringify(event));
  }

  /**
   * Add a tool/function to the session
   */
  addTool(tool: {
    name: string;
    description: string;
    parameters: object;
  }): void {
    this.updateSession({
      tools: [{
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }],
    } as any);
  }

  /**
   * Update state and notify listeners
   */
  private updateState(state: OpenAIRealtimeState): void {
    if (this.state !== state) {
      console.log('[OpenAI-WebRTC] State:', this.state, '->', state);
      this.state = state;
      this.config.onStateChange?.(state);
    }
  }

  /**
   * Get current state
   */
  getState(): OpenAIRealtimeState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    console.log('[OpenAI-WebRTC] Disconnecting...');

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.outputAudioTrack = null;
    this.inputAudioTrack = null;
    this.sessionId = null;
    this.updateState('disconnected');
  }
}
