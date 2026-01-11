// JsSIP SIP/WebRTC stub implementation
import { useEffect, useRef, useState } from 'react';

// Stub JsSIP types (since actual JsSIP may have issues with bundlers)
const JsSIP = {
  WebSocketInterface: class {},
  UA: class {
    start() {}
    stop() {}
    on() {}
    call() {}
  },
};

export type CallState = 'idle' | 'connecting' | 'ringing' | 'active' | 'held' | 'hangup';

interface UseSIPWebRTCProps {
  sipUri: string;
  sipPassword: string;
  sipWebSocket: string;
  onCallStateChange?: (state: CallState) => void;
  onCallEnd?: () => void;
}

export function useSIPWebRTC({
  sipUri,
  sipPassword,
  sipWebSocket,
  onCallStateChange,
  onCallEnd,
}: UseSIPWebRTCProps) {
  const [ua, setUa] = useState<JsSIP.UA | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [activeSession, setActiveSession] = useState<any>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const socket = new JsSIP.WebSocketInterface(sipWebSocket);
    const configuration = {
      sockets: [socket],
      uri: sipUri,
      password: sipPassword,
      session_timers: false,
    };
    const userAgent = new JsSIP.UA(configuration);
    userAgent.start();
    setUa(userAgent);

    userAgent.on('newRTCSession', (data: any) => {
      const session = data.session;
      setActiveSession(session);
      setCallState('connecting');
      if (onCallStateChange) onCallStateChange('connecting');

      session.on('accepted', () => {
        setCallState('active');
        if (onCallStateChange) onCallStateChange('active');
        const pc = session.connection;
        const remoteStream = new MediaStream();
        pc.getReceivers().forEach((receiver: any) => {
          if (receiver.track) remoteStream.addTrack(receiver.track);
        });
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play();
        }
      });

      session.on('ended', () => {
        setCallState('hangup');
        if (onCallEnd) onCallEnd();
      });
      session.on('failed', () => {
        setCallState('hangup');
        if (onCallEnd) onCallEnd();
      });
    });

    return () => {
      userAgent.stop();
    };
  }, [sipUri, sipPassword, sipWebSocket, onCallStateChange, onCallEnd]);

  const makeCall = (target: string) => {
    if (!ua) return;
    ua.call(target, {
      mediaConstraints: { audio: true, video: false },
      rtcOfferConstraints: { offerToReceiveAudio: 1, offerToReceiveVideo: 0 },
    });
    setCallState('connecting');
    if (onCallStateChange) onCallStateChange('connecting');
  };

  const hangup = () => {
    if (activeSession) {
      activeSession.terminate();
      setCallState('hangup');
      if (onCallEnd) onCallEnd();
    }
  };

  return {
    callState,
    makeCall,
    hangup,
    remoteAudioRef,
  };
}
