import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

export type CallState = 'idle' | 'connecting' | 'ringing' | 'active' | 'held' | 'hangup';

interface UseSIPWebSocketProps {
  onCallStateChange?: (state: CallState) => void;
  onCallEnd?: () => void;
}

export function useSIPWebSocket({
  onCallStateChange,
  onCallEnd,
}: UseSIPWebSocketProps = {}) {
  const [callState, setCallState] = useState('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [activeCallId, setActiveCallId] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const { toast } = useToast();
  const durationIntervalRef = useRef(null);
  const websocketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);

  // Initialize WebSocket connection to SIP backend
  const initializeWebSocket = useCallback(async () => {
    try {
      // Get WebSocket URL from environment or fallback to current origin
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/sip-agent`;
      
      console.log('[SIP WebSocket] Connecting to:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('[SIP WebSocket] Connected');
        setIsConnected(true);
        websocketRef.current = ws;
      };
      
      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('[SIP WebSocket] Message received:', data);
        
        switch (data.type) {
          case 'session_ready':
            console.log('[SIP WebSocket] Session ready, agent can make calls');
            break;
            
          case 'call_ringing':
            console.log('[SIP WebSocket] Call ringing to:', data.to);
            setCallState('ringing');
            onCallStateChange?.('ringing');
            break;
            
          case 'call_connected':
            console.log('[SIP WebSocket] Call connected');
            setCallState('active');
            setActiveCallId(data.callId);
            onCallStateChange?.('active');
            
            // Start call duration timer
            if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
            setCallDuration(0);
            durationIntervalRef.current = setInterval(() => {
              setCallDuration(prev => prev + 1);
            }, 1000);
            break;
            
          case 'offer':
            // Handle WebRTC offer from backend
            if (data.offer && peerConnectionRef.current) {
              await peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(data.offer)
              );
              const answer = await peerConnectionRef.current.createAnswer();
              await peerConnectionRef.current.setLocalDescription(answer);
              
              ws.send(JSON.stringify({
                type: 'answer',
                callId: data.callId,
                answer: answer,
              }));
            }
            break;
            
          case 'ice_candidate':
            // Handle ICE candidate
            if (data.candidate && peerConnectionRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(data.candidate)
                );
              } catch (err) {
                console.error('[SIP WebSocket] Error adding ICE candidate:', err);
              }
            }
            break;
            
          case 'call_ended':
            console.log('[SIP WebSocket] Call ended');
            setCallState('hangup');
            setActiveCallId(null);
            if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
            onCallEnd?.();
            break;
            
          case 'error':
            console.error('[SIP WebSocket] Error:', data.message);
            setLastError(data.message);
            toast({
              title: 'SIP Error',
              description: data.message,
              variant: 'destructive',
            });
            break;
        }
      };
      
      ws.onerror = (error) => {
        console.error('[SIP WebSocket] Error:', error);
        setIsConnected(false);
        setLastError('WebSocket connection error');
        toast({
          title: 'Connection Error',
          description: 'Failed to connect to SIP server',
          variant: 'destructive',
        });
      };
      
      ws.onclose = () => {
        console.log('[SIP WebSocket] Connection closed');
        setIsConnected(false);
        websocketRef.current = null;
        
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          console.log('[SIP WebSocket] Attempting to reconnect...');
          initializeWebSocket();
        }, 3000);
      };
      
      return ws;
    } catch (error) {
      console.error('[SIP WebSocket] Failed to initialize:', error);
      setLastError(String(error));
    }
  }, [toast, onCallStateChange, onCallEnd]);

  // Initialize WebSocket on component mount
  useEffect(() => {
    initializeWebSocket();

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      // Use the ref for cleanup since initializeWebSocket is async
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, [initializeWebSocket]);

  // Get local audio stream
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      
      // Create audio context for monitoring
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (!analyserRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        source.connect(analyserRef.current);
      }
      
      return stream;
    } catch (error) {
      console.error('[SIP WebSocket] Failed to get audio stream:', error);
      setLastError('Failed to access microphone');
      toast({
        title: 'Microphone Error',
        description: 'Could not access your microphone. Please check permissions.',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  // Make a SIP call via WebSocket
  const makeCall = useCallback(async (phoneNumber: string) => {
    if (!websocketRef.current || !isConnected) {
      setLastError('Not connected to SIP server');
      toast({
        title: 'Connection Error',
        description: 'Not connected to SIP server. Please wait...',
        variant: 'destructive',
      });
      return;
    }

    try {
      setCallState('connecting');
      onCallStateChange?.('connecting');
      
      // Get microphone access
      const stream = await getLocalStream();
      if (!stream) return;

      // Create or reset peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }

      const iceServers = [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      ];
      
      const pc = new RTCPeerConnection({
        iceServers,
      });
      peerConnectionRef.current = pc;

      // Add local audio track
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle remote audio track
      pc.ontrack = (event) => {
        console.log('[SIP WebSocket] Received remote track:', event.track.kind);
        if (event.track.kind === 'audio') {
          const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement;
          if (audioElement) {
            audioElement.srcObject = event.streams[0];
            audioElement.play().catch(err => {
              console.error('[SIP WebSocket] Error playing audio:', err);
            });
          }
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && websocketRef.current) {
          websocketRef.current.send(JSON.stringify({
            type: 'ice_candidate',
            callId: activeCallId || 'new',
            candidate: event.candidate,
          }));
        }
      };

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      // Send call initiation message
      websocketRef.current.send(JSON.stringify({
        type: 'make_call',
        to: phoneNumber,
        offer: offer,
      }));

      console.log('[SIP WebSocket] Call initiated to:', phoneNumber);
    } catch (error) {
      console.error('[SIP WebSocket] Error making call:', error);
      setCallState('idle');
      onCallStateChange?.('idle');
      setLastError(String(error));
      toast({
        title: 'Call Error',
        description: 'Failed to initiate call',
        variant: 'destructive',
      });
    }
  }, [isConnected, toast, onCallStateChange, getLocalStream, activeCallId]);

  // Hangup call
  const hangup = useCallback(() => {
    if (websocketRef.current && isConnected) {
      websocketRef.current.send(JSON.stringify({
        type: 'end_call',
        callId: activeCallId,
      }));
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }

    setCallState('idle');
    setActiveCallId(null);
    setCallDuration(0);
    onCallStateChange?.('idle');
  }, [isConnected, activeCallId, localStream, onCallStateChange]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  }, [localStream, isMuted]);

  // Toggle hold
  const toggleHold = useCallback(() => {
    if (websocketRef.current && isConnected && activeCallId) {
      websocketRef.current.send(JSON.stringify({
        type: 'toggle_hold',
        callId: activeCallId,
      }));
    }
  }, [isConnected, activeCallId]);

  return {
    isConnected,
    callState,
    callDuration,
    makeCall,
    hangup,
    toggleMute,
    toggleHold,
    isMuted,
    lastError,
  };
}