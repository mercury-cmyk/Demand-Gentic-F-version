import { useState, useEffect, useCallback, useRef } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import type { Call } from '@telnyx/webrtc';
import { useToast } from '@/hooks/use-toast';

export type CallState = 'idle' | 'connecting' | 'ringing' | 'active' | 'held' | 'hangup';

interface TelnyxErrorDetail {
  code?: number;
  message?: string;
  sessionId?: string;
  rawError?: any;
  timestamp?: string;
}

interface UseTelnyxWebRTCProps {
  sipUsername?: string;
  sipPassword?: string;
  sipDomain?: string;
  rtcHost?: string;
  rtcEnv?: 'production' | 'development';
  rtcRegion?: string;
  rtcIp?: string;
  rtcPort?: number;
  useCanaryRtcServer?: boolean;
  onCallStateChange?: (state: CallState) => void;
  onCallEnd?: () => void;
}

export function useTelnyxWebRTC({
  sipUsername,
  sipPassword,
  sipDomain = 'sip.telnyx.com',
  rtcHost,
  rtcEnv,
  rtcRegion,
  rtcIp,
  rtcPort,
  useCanaryRtcServer,
  onCallStateChange,
  onCallEnd,
}: UseTelnyxWebRTCProps = {}) {
  const [client, setClient] = useState<TelnyxRTC | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [lastError, setLastError] = useState<TelnyxErrorDetail | null>(null);
  const [telnyxCallId, setTelnyxCallId] = useState<string | null>(null);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const { toast } = useToast();
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const streamAttachRetryRef = useRef<number>(0);

  // Load saved audio device preferences from localStorage
  useEffect(() => {
    const savedMic = localStorage.getItem('telnyx_microphone_id');
    const savedSpeaker = localStorage.getItem('telnyx_speaker_id');

    if (savedMic) setSelectedMicId(savedMic);
    if (savedSpeaker) setSelectedSpeakerId(savedSpeaker);
  }, []);

  /**
   * Attach remote audio stream to audio element
   * This is the critical function for audio playback
   */
  const attachRemoteStream = useCallback((call: Call) => {
    try {
      const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement;
      if (!audioElement) {
        console.error('[AUDIO] Remote audio element not found');
        return false;
      }

      // Try multiple ways to get the remote stream from the call object
      let remoteStream: MediaStream | null = null;
      
      // Method 1: Direct remoteStream property
      if ((call as any).remoteStream) {
        remoteStream = (call as any).remoteStream;
        console.log('[AUDIO] Got remoteStream from call.remoteStream');
      }
      
      // Method 2: From peer connection
      if (!remoteStream && (call as any).peer) {
        const pc = (call as any).peer;
        if (pc.getReceivers) {
          const receivers = pc.getReceivers();
          const audioReceiver = receivers.find((r: RTCRtpReceiver) => r.track?.kind === 'audio');
          if (audioReceiver?.track) {
            remoteStream = new MediaStream([audioReceiver.track]);
            console.log('[AUDIO] Created stream from peer receiver');
          }
        }
      }

      // Method 3: From session if available
      if (!remoteStream && (call as any).session?.sessionDescriptionHandler) {
        const sdh = (call as any).session.sessionDescriptionHandler;
        if (sdh.peerConnection) {
          const pc = sdh.peerConnection;
          const receivers = pc.getReceivers();
          const audioReceiver = receivers.find((r: RTCRtpReceiver) => r.track?.kind === 'audio');
          if (audioReceiver?.track) {
            remoteStream = new MediaStream([audioReceiver.track]);
            console.log('[AUDIO] Created stream from session SDH');
          }
        }
      }

      if (!remoteStream) {
        console.warn('[AUDIO] No remote stream available yet');
        return false;
      }

      // Check if stream has active audio tracks
      const audioTracks = remoteStream.getAudioTracks();
      console.log('[AUDIO] Remote stream audio tracks:', audioTracks.length);
      
      if (audioTracks.length === 0) {
        console.warn('[AUDIO] Remote stream has no audio tracks');
        return false;
      }

      // Log track details
      audioTracks.forEach((track, i) => {
        console.log(`[AUDIO] Track ${i}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
      });

      // Attach stream to audio element
      audioElement.srcObject = remoteStream;
      audioElement.volume = 1.0;
      audioElement.muted = false;
      
      // Try to play
      const playPromise = audioElement.play();
      if (playPromise) {
        playPromise
          .then(() => {
            console.log('[AUDIO] ✅ Audio playback started successfully');
          })
          .catch((err) => {
            console.error('[AUDIO] Playback failed:', err);
            // User interaction may be required
            toast({
              variant: "destructive",
              title: "Audio Blocked",
              description: "Click anywhere on the page to enable audio",
            });
          });
      }

      return true;
    } catch (error) {
      console.error('[AUDIO] Error attaching remote stream:', error);
      return false;
    }
  }, [toast]);

  /**
   * Monitor audio and attempt recovery if stream is missing
   */
  const startAudioMonitor = useCallback((call: Call) => {
    // Clear any existing monitor
    if (audioMonitorRef.current) {
      clearInterval(audioMonitorRef.current);
    }
    
    let noAudioCount = 0;
    const maxRetries = 3;
    
    audioMonitorRef.current = setInterval(() => {
      const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement;
      
      if (!audioElement || !audioElement.srcObject) {
        noAudioCount++;
        if (noAudioCount <= maxRetries) {
          console.log('[AUDIO-MONITOR] Re-attaching stream...');
          attachRemoteStream(call);
        }
        return;
      }

      // Check if audio tracks are active
      const stream = audioElement.srcObject as MediaStream;
      const audioTracks = stream.getAudioTracks();
      
      if (audioTracks.length === 0 || !audioTracks[0].enabled) {
        noAudioCount++;
        if (noAudioCount <= maxRetries) {
          attachRemoteStream(call);
        }
      } else {
        noAudioCount = 0;
      }
    }, 5000);
  }, [attachRemoteStream]);

  /**
   * Stop audio monitoring
   */
  const stopAudioMonitor = useCallback(() => {
    if (audioMonitorRef.current) {
      clearInterval(audioMonitorRef.current);
      audioMonitorRef.current = null;
    }
  }, []);

  // Initialize Telnyx client
  useEffect(() => {
    if (!sipUsername || !sipPassword) {
      console.warn('WebRTC initialization skipped: Missing SIP credentials');
      return;
    }

    let connectionTimeout: NodeJS.Timeout;
    let telnyxClient: TelnyxRTC | null = null;

    try {
      // Extract just the username if full SIP URI is provided
      const username = sipUsername.includes('@') ? sipUsername.split('@')[0] : sipUsername;

      console.log('=== TELNYX WebRTC CONNECTION START ===');
      console.log('Connection details:', {
        login: username,
        domain: sipDomain,
        rtcHost: rtcHost || null,
        rtcEnv: rtcEnv || null,
        rtcRegion: rtcRegion || null,
        rtcIp: rtcIp || null,
        rtcPort: rtcPort ?? null,
        useCanaryRtcServer: !!useCanaryRtcServer,
        hasPassword: !!sipPassword,
        timestamp: new Date().toISOString(),
      });

      // Initialize TelnyxRTC with optimized configuration
      telnyxClient = new TelnyxRTC({
        login: username,
        password: sipPassword,
        // Enable debug mode for troubleshooting
        debug: true,
        debugOutput: 'console',
        // Use relay for more reliable connections through restrictive networks
        iceTransportPolicy: 'relay',
        // Prefetch ICE candidates for faster connection
        prefetchIceCandidates: true,
        host: rtcHost,
        env: rtcEnv,
        region: rtcRegion,
        rtcIp: rtcIp,
        rtcPort: rtcPort,
        useCanaryRtcServer: useCanaryRtcServer,
      } as any);

      // Set connection timeout (30 seconds)
      connectionTimeout = setTimeout(() => {
        console.error('=== TELNYX CONNECTION TIMEOUT ===');
        console.error('Connection failed to establish within 30 seconds');
        setIsConnected(false);
        toast({
          variant: "destructive",
          title: "Connection Timeout",
          description: "Unable to connect to calling service. Check your network connection.",
          duration: 10000,
        });

        if (telnyxClient) {
          try {
            telnyxClient.disconnect();
          } catch (e) {
            console.error('Error disconnecting after timeout:', e);
          }
        }
      }, 30000);

      // Event listeners
      telnyxClient.on('telnyx.ready', () => {
        clearTimeout(connectionTimeout);
        console.log('=== TELNYX CONNECTION SUCCESS ===');
        console.log('WebRTC client ready at', new Date().toISOString());
        console.log('==================================');
        setIsConnected(true);
        toast({
          title: "Connected",
          description: "Ready to make calls",
        });
      });

      telnyxClient.on('telnyx.error', (error: any) => {
        const errorDetail: TelnyxErrorDetail = {
          code: error?.error?.code || error?.code,
          message: error?.error?.message || error?.message || 'Unknown error',
          sessionId: error?.sessionId || '',
          rawError: error,
          timestamp: new Date().toISOString(),
        };

        setLastError(errorDetail);

        console.error('=== TELNYX ERROR DETAILS ===');
        console.error('Error Code:', errorDetail.code);
        console.error('Error Message:', errorDetail.message);
        console.error('Full Error Object:', error);
        console.error('===========================');

        let userMessage = errorDetail.message;
        let troubleshootingTip = '';

        switch (errorDetail.code) {
          case -32001:
            userMessage = 'Authentication Failed';
            troubleshootingTip = 'Invalid credentials. Please verify your SIP username and password.';
            break;
          case -32002:
            userMessage = 'Call Does Not Exist';
            troubleshootingTip = 'The call has ended or was not established.';
            break;
          case -32003:
            userMessage = 'Account Issue';
            troubleshootingTip = 'Your Telnyx account may need attention.';
            break;
          default:
            troubleshootingTip = `Error code: ${errorDetail.code}`;
        }

        // Don't show toast for CALL DOES NOT EXIST after hangup
        if (errorDetail.code !== -32002) {
          toast({
            variant: "destructive",
            title: userMessage,
            description: troubleshootingTip,
          });
        }

        setIsConnected(false);
      });

      telnyxClient.on('telnyx.notification', (notification: any) => {
        console.log('Telnyx notification - Type:', notification.type, 'Call State:', notification.call?.state);

        if (notification.type === 'callUpdate' && notification.call) {
          const call = notification.call;

          // When call becomes active, attach remote audio stream
          if (call.state === 'active') {
            console.log('[AUDIO] Call active - attempting to attach remote stream');
            streamAttachRetryRef.current = 0;
            
            // Try to attach immediately
            const attached = attachRemoteStream(call);
            
            if (!attached) {
              // Retry with delays if initial attach fails
              const retryAttach = () => {
                if (streamAttachRetryRef.current < 5) {
                  streamAttachRetryRef.current++;
                  console.log(`[AUDIO] Retry attach attempt ${streamAttachRetryRef.current}`);
                  const success = attachRemoteStream(call);
                  if (!success) {
                    setTimeout(retryAttach, 500);
                  } else {
                    // Start monitoring once attached
                    startAudioMonitor(call);
                  }
                }
              };
              setTimeout(retryAttach, 300);
            } else {
              startAudioMonitor(call);
            }
          }

          // Map Telnyx call states to our CallState
          switch (call.state) {
            case 'new':
            case 'requesting':
              updateCallState('connecting');
              break;
            case 'trying':
            case 'ringing':
              updateCallState('ringing');
              break;
            case 'early':
              // Early media - try to attach stream for ringback
              console.log('[AUDIO] Early media state - attempting stream attachment');
              attachRemoteStream(call);
              updateCallState('ringing');
              break;
            case 'active':
              updateCallState('active');
              startDurationTimer();
              break;
            case 'held':
              updateCallState('held');
              break;
            case 'hangup':
            case 'destroy':
            case 'done':
              updateCallState('hangup');
              stopDurationTimer();
              stopAudioMonitor();
              cleanupAudioElement();
              setActiveCall(null);
              if (onCallEnd) {
                onCallEnd();
              }
              break;
          }
        }
      });

      telnyxClient.on('telnyx.socket.close', (event: any) => {
        console.warn('=== TELNYX SOCKET CLOSED ===');
        console.warn('Close details:', {
          code: event?.code,
          reason: event?.reason,
          wasClean: event?.wasClean,
          url: event?.target?.url,
          readyState: event?.target?.readyState,
        });
        console.warn('============================');
        setIsConnected(false);
        setActiveCall(null);
        stopAudioMonitor();
        cleanupAudioElement();
        updateCallState('idle');
      });

      telnyxClient.on('telnyx.socket.error', (error: any) => {
        console.error('=== TELNYX SOCKET ERROR ===');
        console.error('Socket error:', error);
        console.error('Socket error details:', {
          sessionId: error?.sessionId,
          type: error?.error?.type,
          message: error?.error?.message,
          url: error?.error?.target?.url,
          readyState: error?.error?.target?.readyState,
        });
        console.error('===========================');
      });

      // Connect to Telnyx
      console.log('Initiating WebRTC connection...');
      telnyxClient.connect().catch((error: any) => {
        clearTimeout(connectionTimeout);
        console.error('=== TELNYX CONNECTION ERROR ===');
        console.error('Connection rejected:', error);
        setIsConnected(false);
        toast({
          variant: "destructive",
          title: "Connection Failed",
          description: error.message || "Failed to connect to Telnyx server.",
          duration: 10000,
        });
      });

      setClient(telnyxClient);

      return () => {
        clearTimeout(connectionTimeout);
        stopAudioMonitor();
        cleanupAudioElement();
        if (telnyxClient) {
          try {
            telnyxClient.disconnect();
          } catch (e) {
            console.error('Error during cleanup disconnect:', e);
          }
        }
        stopDurationTimer();
      };
    } catch (error) {
      console.error('Failed to initialize Telnyx client:', error);
      toast({
        variant: "destructive",
        title: "Initialization Error",
        description: "Failed to initialize calling service",
      });
    }
  }, [
    sipUsername,
    sipPassword,
    sipDomain,
    rtcHost,
    rtcEnv,
    rtcRegion,
    rtcIp,
    rtcPort,
    useCanaryRtcServer,
    attachRemoteStream,
    startAudioMonitor,
    stopAudioMonitor,
  ]);

  /**
   * Clean up audio element between calls
   */
  const cleanupAudioElement = useCallback(() => {
    const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement;
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      console.log('[AUDIO] Audio element cleaned up');
    }
  }, []);

  // Update call state and notify parent
  const updateCallState = useCallback((newState: CallState) => {
    setCallState(newState);
    if (onCallStateChange) {
      onCallStateChange(newState);
    }
  }, [onCallStateChange]);

  // Start duration timer
  const startDurationTimer = useCallback(() => {
    stopDurationTimer();
    setCallDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  // Stop duration timer
  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Make outbound call
  const makeCall = useCallback((phoneNumber: string, callerIdNumber?: string) => {
    if (!client || !isConnected) {
      toast({
        variant: "destructive",
        title: "Not Connected",
        description: "Please wait for connection to be established",
      });
      return;
    }

    if (activeCall) {
      toast({
        variant: "destructive",
        title: "Call in Progress",
        description: "Please end the current call first",
      });
      return;
    }

    // Clean up any leftover audio from previous call
    cleanupAudioElement();

    try {
      console.log('Making call with params:', {
        destinationNumber: phoneNumber,
        callerNumber: callerIdNumber,
        hasClient: !!client,
        isConnected,
        selectedMicId,
        selectedSpeakerId,
      });

      // Build call options
      const callOptions: any = {
        destinationNumber: phoneNumber,
        callerNumber: callerIdNumber,
        audio: true,
        video: false,
        // Let SDK attach remote audio to this element
        remoteElement: 'remoteAudio',
        // Enable call recording
        record: 'record-from-answer',
        // Use useStereo for better audio quality
        useStereo: true,
      };

      // Apply microphone device constraint if selected
      if (selectedMicId) {
        callOptions.audio = {
          deviceId: { exact: selectedMicId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
        console.log('Using selected microphone:', selectedMicId);
      }

      const call = client.newCall(callOptions);

      console.log('Call object created - ID:', call?.id, 'State:', call?.state);

      // Capture the Telnyx call ID for recording lookup
      if (call?.id) {
        setTelnyxCallId(call.id);
        console.log('Captured Telnyx Call ID:', call.id);
      }

      setActiveCall(call);
      updateCallState('connecting');

      // Apply speaker to remote audio element once call is active
      if (selectedSpeakerId) {
        setTimeout(() => {
          const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement;
          if (audioElement && 'setSinkId' in audioElement) {
            (audioElement as any).setSinkId(selectedSpeakerId)
              .then(() => {
                console.log('Applied selected speaker:', selectedSpeakerId);
              })
              .catch((error: any) => {
                console.error('Failed to apply speaker:', error);
              });
          }
        }, 500);
      }

      toast({
        title: "Dialing",
        description: `Calling ${phoneNumber}...`,
      });
    } catch (error: any) {
      console.error('Failed to make call:', error);
      const errorMessage = error?.message || error?.toString() || "Failed to initiate call";

      toast({
        variant: "destructive",
        title: "Call Failed",
        description: errorMessage,
      });
      updateCallState('idle');
    }
  }, [client, isConnected, activeCall, updateCallState, toast, selectedMicId, selectedSpeakerId, cleanupAudioElement]);

  // Hangup call
  const hangup = useCallback(() => {
    if (activeCall) {
      try {
        activeCall.hangup();
        updateCallState('hangup');
        stopAudioMonitor();
        cleanupAudioElement();
      } catch (error) {
        console.error('Failed to hangup:', error);
      }
    }
  }, [activeCall, updateCallState, stopAudioMonitor, cleanupAudioElement]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (activeCall) {
      try {
        if (isMuted) {
          activeCall.unmuteAudio();
          setIsMuted(false);
          toast({
            description: "Microphone unmuted",
          });
        } else {
          activeCall.muteAudio();
          setIsMuted(true);
          toast({
            description: "Microphone muted",
          });
        }
      } catch (error) {
        console.error('Failed to toggle mute:', error);
      }
    }
  }, [activeCall, isMuted, toast]);

  // Hold/Unhold
  const toggleHold = useCallback(() => {
    if (activeCall) {
      try {
        if (callState === 'held') {
          activeCall.unhold();
          updateCallState('active');
          toast({
            description: "Call resumed",
          });
        } else {
          activeCall.hold();
          updateCallState('held');
          toast({
            description: "Call on hold",
          });
        }
      } catch (error) {
        console.error('Failed to toggle hold:', error);
      }
    }
  }, [activeCall, callState, updateCallState, toast]);

  // Send DTMF tones
  const sendDTMF = useCallback((digit: string) => {
    if (activeCall && callState === 'active') {
      try {
        activeCall.dtmf(digit);
      } catch (error) {
        console.error('Failed to send DTMF:', error);
      }
    }
  }, [activeCall, callState]);

  // Set audio devices (microphone and speaker)
  const setAudioDevices = useCallback((micId: string | null, speakerId: string | null) => {
    if (micId) {
      setSelectedMicId(micId);
      localStorage.setItem('telnyx_microphone_id', micId);
    }
    if (speakerId) {
      setSelectedSpeakerId(speakerId);
      localStorage.setItem('telnyx_speaker_id', speakerId);
    }

    // Apply speaker to remote audio element immediately
    if (speakerId) {
      const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement;
      if (audioElement && 'setSinkId' in audioElement) {
        (audioElement as any).setSinkId(speakerId)
          .then(() => {
            console.log('Applied new speaker:', speakerId);
          })
          .catch((error: any) => {
            console.error('Failed to apply speaker:', error);
          });
      }
    }
  }, []);

  // Format duration as MM:SS
  const formatDuration = useCallback(() => {
    const minutes = Math.floor(callDuration / 60);
    const seconds = callDuration % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [callDuration]);

  return {
    client,
    activeCall,
    callState,
    isConnected,
    isMuted,
    callDuration,
    lastError,
    telnyxCallId,
    selectedMicId,
    selectedSpeakerId,
    formatDuration,
    makeCall,
    hangup,
    toggleMute,
    toggleHold,
    sendDTMF,
    setAudioDevices,
  };
}
