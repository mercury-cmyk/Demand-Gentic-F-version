/**
 * useUnifiedWebRTC Hook
 * 
 * React hook for the unified WebRTC calling stack.
 * Supports both Human Agent and AI Agent modes.
 * Uses Telnyx WebRTC SDK + OpenAI Realtime WebRTC.
 * 
 * CRITICAL: No WebSockets - WebRTC only for all media.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TelnyxWebRTCClient,
  OpenAIRealtimeWebRTCClient,
  AudioBridgeController,
  createAudioBridge,
  type TelnyxCallState,
  type TelnyxCredentials,
  type TelnyxOutboundCallOptions,
  type BridgeMode,
  type BridgeState,
} from '../lib/webrtc';

export type { TelnyxCallState, BridgeMode, BridgeState };

export interface UnifiedWebRTCConfig {
  // Telnyx credentials (token or user/pass)
  telnyxCredentials: TelnyxCredentials;
  // Caller ID
  callerIdName?: string;
  callerIdNumber?: string;
  // OpenAI Realtime settings
  openaiEphemeralEndpoint: string;
  openaiModel?: string;
  openaiVoice?: string;
  openaiInstructions?: string;
  // Enable AI monitoring (hear AI audio in speakers)
  enableAIMonitoring?: boolean;
}

export interface CallTranscript {
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: Date;
}

export interface UnifiedWebRTCState {
  // Connection states
  isReady: boolean;
  callState: TelnyxCallState;
  bridgeMode: BridgeMode;
  bridgeState: BridgeState;
  // Call info
  isCallActive: boolean;
  isMuted: boolean;
  isHeld: boolean;
  isAIConnected: boolean;
  isMonitoring: boolean;
  // Call duration
  callStartTime: Date | null;
  callDurationSeconds: number;
  // Transcripts (AI mode)
  transcripts: CallTranscript[];
  // Error
  error: Error | null;
}

export interface UnifiedWebRTCActions {
  // Connection
  connect: () => Promise<void>;
  disconnect: () => void;
  // Calling
  makeCall: (destination: string, options?: Partial<TelnyxOutboundCallOptions>) => Promise<void>;
  answerCall: () => Promise<void>;
  hangup: () => void;
  // Controls
  toggleMute: () => void;
  toggleHold: () => Promise<void>;
  sendDTMF: (digit: string) => void;
  // Mode switching
  switchToHuman: () => Promise<void>;
  switchToAI: () => Promise<void>;
  toggleMode: () => Promise<void>;
  toggleMonitoring: () => void;
  // AI interaction
  sendMessageToAI: (text: string) => void;
  updateAIInstructions: (instructions: string) => void;
  cancelAIResponse: () => void;
  // Device management
  setAudioInput: (deviceId: string) => Promise<void>;
  setAudioOutput: (deviceId: string) => Promise<void>;
  getDevices: () => Promise<{ audioInputs: MediaDeviceInfo[]; audioOutputs: MediaDeviceInfo[] }>;
}

export function useUnifiedWebRTC(config: UnifiedWebRTCConfig): [UnifiedWebRTCState, UnifiedWebRTCActions] {
  // Refs for clients
  const telnyxClientRef = useRef<TelnyxWebRTCClient | null>(null);
  const bridgeRef = useRef<AudioBridgeController | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const [isReady, setIsReady] = useState(false);
  const [callState, setCallState] = useState<TelnyxCallState>('idle');
  const [bridgeMode, setBridgeMode] = useState<BridgeMode>('human');
  const [bridgeState, setBridgeState] = useState<BridgeState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [isAIConnected, setIsAIConnected] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [transcripts, setTranscripts] = useState<CallTranscript[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // Computed values
  const isCallActive = callState === 'active' || callState === 'held';

  // Call duration timer
  useEffect(() => {
    if (callState === 'active' && !callStartTime) {
      setCallStartTime(new Date());
    }
    
    if (callState === 'active') {
      callTimerRef.current = setInterval(() => {
        if (callStartTime) {
          const seconds = Math.floor((Date.now() - callStartTime.getTime()) / 1000);
          setCallDurationSeconds(seconds);
        }
      }, 1000);
    }
    
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [callState, callStartTime]);

  // Reset call state on hangup
  useEffect(() => {
    if (callState === 'hangup' || callState === 'idle') {
      setCallStartTime(null);
      setCallDurationSeconds(0);
      setTranscripts([]);
      setIsMuted(false);
      setIsHeld(false);
      
      // Cleanup bridge
      if (bridgeRef.current) {
        bridgeRef.current.cleanup();
      }
    }
  }, [callState]);

  // Connect to Telnyx
  const connect = useCallback(async () => {
    try {
      console.log('[useUnifiedWebRTC] Connecting...');
      setError(null);
      setIsReady(false);

      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        setError(new Error('WebRTC connection timeout after 30 seconds. Check network/firewall or try refreshing the page.'));
      }, 30000);

      const telnyxClient = new TelnyxWebRTCClient({
        credentials: config.telnyxCredentials,
        callerIdName: config.callerIdName,
        callerIdNumber: config.callerIdNumber,
        onReady: () => {
          clearTimeout(connectionTimeout);
          console.log('[useUnifiedWebRTC] Telnyx ready');
          setIsReady(true);
        },
        onError: (err) => {
          clearTimeout(connectionTimeout);
          console.error('[useUnifiedWebRTC] Telnyx error:', err);
          setError(err);
        },
        onCallStateChange: (state) => {
          console.log('[useUnifiedWebRTC] Call state:', state);
          setCallState(state);
          
          // Initialize bridge when call becomes active
          if (state === 'active' && telnyxClientRef.current && !bridgeRef.current) {
            initializeBridge();
          }
        },
        onIncomingCall: (call) => {
          console.log('[useUnifiedWebRTC] Incoming call');
          // The call state change will handle the UI update
        },
        onRemoteStream: (stream) => {
          console.log('[useUnifiedWebRTC] Remote stream received');
        },
      });

      telnyxClientRef.current = telnyxClient;
      await telnyxClient.connect();

    } catch (err) {
      console.error('[useUnifiedWebRTC] Connect error:', err);
      setError(err as Error);
      throw err;
    }
  }, [config]);

  // Initialize audio bridge
  const initializeBridge = useCallback(async () => {
    if (!telnyxClientRef.current) return;

    console.log('[useUnifiedWebRTC] Initializing audio bridge');
    
    const bridge = createAudioBridge(telnyxClientRef.current, {
      openaiEphemeralEndpoint: config.openaiEphemeralEndpoint,
      openaiModel: config.openaiModel,
      openaiVoice: config.openaiVoice,
      openaiInstructions: config.openaiInstructions,
      enableMonitoring: config.enableAIMonitoring,
      onModeChange: (mode) => {
        console.log('[useUnifiedWebRTC] Mode changed:', mode);
        setBridgeMode(mode);
        setIsAIConnected(mode === 'ai');
      },
      onStateChange: (state) => {
        console.log('[useUnifiedWebRTC] Bridge state:', state);
        setBridgeState(state);
      },
      onTranscript: (transcript) => {
        setTranscripts(prev => [...prev, {
          ...transcript,
          timestamp: new Date(),
        }]);
      },
      onError: (err) => {
        console.error('[useUnifiedWebRTC] Bridge error:', err);
        setError(err);
      },
    });

    bridgeRef.current = bridge;
    await bridge.initialize();
  }, [config]);

  // Disconnect
  const disconnect = useCallback(() => {
    console.log('[useUnifiedWebRTC] Disconnecting');
    
    if (bridgeRef.current) {
      bridgeRef.current.cleanup();
      bridgeRef.current = null;
    }
    
    if (telnyxClientRef.current) {
      telnyxClientRef.current.disconnect();
      telnyxClientRef.current = null;
    }
    
    setIsReady(false);
    setCallState('idle');
    setBridgeMode('human');
    setBridgeState('idle');
  }, []);

  // Make outbound call
  const makeCall = useCallback(async (destination: string, options?: Partial<TelnyxOutboundCallOptions>) => {
    if (!telnyxClientRef.current?.isReady()) {
      throw new Error('Telnyx not ready');
    }

    console.log('[useUnifiedWebRTC] Making call to:', destination);
    
    await telnyxClientRef.current.call({
      destinationNumber: destination,
      ...options,
    });
  }, []);

  // Answer incoming call
  const answerCall = useCallback(async () => {
    if (!telnyxClientRef.current) {
      throw new Error('Telnyx not connected');
    }
    
    await telnyxClientRef.current.answer();
  }, []);

  // Hang up
  const hangup = useCallback(() => {
    telnyxClientRef.current?.hangup();
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (telnyxClientRef.current) {
      const muted = telnyxClientRef.current.toggleMute();
      setIsMuted(muted);
    }
  }, []);

  // Toggle hold
  const toggleHold = useCallback(async () => {
    if (telnyxClientRef.current) {
      const held = await telnyxClientRef.current.toggleHold();
      setIsHeld(held);
    }
  }, []);

  // Send DTMF
  const sendDTMF = useCallback((digit: string) => {
    telnyxClientRef.current?.sendDTMF(digit);
  }, []);

  // Switch to human mode
  const switchToHuman = useCallback(async () => {
    if (bridgeRef.current) {
      await bridgeRef.current.switchToHumanMode();
    }
  }, []);

  // Switch to AI mode
  const switchToAI = useCallback(async () => {
    if (bridgeRef.current) {
      await bridgeRef.current.switchToAIMode();
    }
  }, []);

  // Toggle mode
  const toggleMode = useCallback(async () => {
    if (bridgeRef.current) {
      await bridgeRef.current.toggleMode();
    }
  }, []);

  // Toggle monitoring
  const toggleMonitoring = useCallback(() => {
    if (bridgeRef.current) {
      const monitoring = bridgeRef.current.toggleMonitoring();
      setIsMonitoring(monitoring);
    }
  }, []);

  // Send message to AI
  const sendMessageToAI = useCallback((text: string) => {
    bridgeRef.current?.sendMessageToAI(text);
  }, []);

  // Update AI instructions
  const updateAIInstructions = useCallback((instructions: string) => {
    bridgeRef.current?.updateAIInstructions(instructions);
  }, []);

  // Cancel AI response
  const cancelAIResponse = useCallback(() => {
    bridgeRef.current?.cancelAIResponse();
  }, []);

  // Set audio input device
  const setAudioInput = useCallback(async (deviceId: string) => {
    await telnyxClientRef.current?.setAudioInputDevice(deviceId);
  }, []);

  // Set audio output device
  const setAudioOutput = useCallback(async (deviceId: string) => {
    await telnyxClientRef.current?.setAudioOutputDevice(deviceId);
  }, []);

  // Get devices
  const getDevices = useCallback(async () => {
    if (!telnyxClientRef.current) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audioInputs: devices.filter(d => d.kind === 'audioinput'),
        audioOutputs: devices.filter(d => d.kind === 'audiooutput'),
      };
    }
    return telnyxClientRef.current.getMediaDevices();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const state: UnifiedWebRTCState = {
    isReady,
    callState,
    bridgeMode,
    bridgeState,
    isCallActive,
    isMuted,
    isHeld,
    isAIConnected,
    isMonitoring,
    callStartTime,
    callDurationSeconds,
    transcripts,
    error,
  };

  const actions: UnifiedWebRTCActions = {
    connect,
    disconnect,
    makeCall,
    answerCall,
    hangup,
    toggleMute,
    toggleHold,
    sendDTMF,
    switchToHuman,
    switchToAI,
    toggleMode,
    toggleMonitoring,
    sendMessageToAI,
    updateAIInstructions,
    cancelAIResponse,
    setAudioInput,
    setAudioOutput,
    getDevices,
  };

  return [state, actions];
}
