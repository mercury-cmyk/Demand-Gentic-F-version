import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export type CallState = 'idle' | 'calling_agent' | 'agent_connected' | 'calling_prospect' | 'ringing' | 'active' | 'held' | 'hangup';

interface UseCallControlProps {
  onCallStateChange?: (state: CallState) => void;
  onCallEnd?: () => void;
}

interface CallSession {
  callControlId: string;
  prospectCallControlId?: string;
  mode: 'callback' | 'direct';
  status: CallState;
  from: string;
  agentPhone?: string;
  prospectPhone: string;
  startedAt: Date;
}

export function useCallControl({
  onCallStateChange,
  onCallEnd,
}: UseCallControlProps = {}) {
  const [activeSession, setActiveSession] = useState<CallSession | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const { toast } = useToast();
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusPollRef = useRef<NodeJS.Timeout | null>(null);

  // Update call state and notify parent
  const updateCallState = useCallback((newState: CallState) => {
    setCallState(newState);
    if (onCallStateChange) {
      onCallStateChange(newState);
    }
  }, [onCallStateChange]);

  // Start duration timer when call becomes active
  const startDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
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

  // Poll for call status updates
  const startStatusPolling = useCallback((callControlId: string) => {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
    }

    const pollStatus = async () => {
      try {
        const response = await apiRequest('GET', `/api/calls/${callControlId}/status`);
        if (!response.ok) {
          // Call session ended
          console.log('[CALL CONTROL] Call session ended or not found');
          stopStatusPolling();
          return;
        }

        const data = await response.json();
        console.log('[CALL CONTROL] Status poll result:', data);

        // Update state based on server status
        if (data.status !== callState) {
          switch (data.status) {
            case 'calling_agent':
              updateCallState('calling_agent');
              break;
            case 'agent_connected':
              updateCallState('agent_connected');
              break;
            case 'calling_prospect':
              updateCallState('calling_prospect');
              break;
            case 'bridged':
              updateCallState('active');
              startDurationTimer();
              break;
            case 'ended':
              updateCallState('hangup');
              stopDurationTimer();
              stopStatusPolling();
              setActiveSession(null);
              if (onCallEnd) {
                onCallEnd();
              }
              break;
          }
        }
      } catch (error) {
        console.error('[CALL CONTROL] Status poll error:', error);
      }
    };

    // Poll every 2 seconds
    statusPollRef.current = setInterval(pollStatus, 2000);
    // Also poll immediately
    pollStatus();
  }, [callState, updateCallState, startDurationTimer, stopDurationTimer, onCallEnd]);

  // Stop status polling
  const stopStatusPolling = useCallback(() => {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDurationTimer();
      stopStatusPolling();
    };
  }, [stopDurationTimer, stopStatusPolling]);

  // Make outbound call via Call Control API
  const makeCall = useCallback(async (
    phoneNumber: string,
    options?: {
      campaignId?: string;
      contactId?: string;
      queueItemId?: string;
      mode?: 'callback' | 'direct';
    }
  ) => {
    if (activeSession) {
      toast({
        variant: "destructive",
        title: "Call in Progress",
        description: "Please end the current call first",
      });
      return;
    }

    try {
      const callMode = options?.mode || 'direct'; // Default to direct mode
      console.log('[CALL CONTROL] Starting call to:', phoneNumber, 'mode:', callMode, 'options:', options);

      // Set initial state based on mode
      updateCallState(callMode === 'direct' ? 'calling_prospect' : 'calling_agent');

      const response = await apiRequest('POST', '/api/calls/start', {
        to: phoneNumber,
        campaignId: options?.campaignId,
        contactId: options?.contactId,
        queueItemId: options?.queueItemId,
        mode: callMode,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[CALL CONTROL] Start call error:', errorData);

        if (errorData.code === 'NO_CALLBACK_PHONE') {
          toast({
            variant: "destructive",
            title: "Callback Phone Required",
            description: "Please set your callback phone in Settings > Telephony to use click-to-call.",
            duration: 8000,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Call Failed",
            description: errorData.message || "Failed to start call",
          });
        }
        updateCallState('idle');
        return;
      }

      const data = await response.json();
      console.log('[CALL CONTROL] Call initiated:', data);

      // Create call session
      const session: CallSession = {
        callControlId: data.callControlId,
        mode: data.mode,
        status: data.status || 'calling_agent',
        from: data.from,
        agentPhone: data.agentPhone,
        prospectPhone: phoneNumber,
        startedAt: new Date(),
      };

      setActiveSession(session);
      updateCallState(session.status as CallState);

      // Start polling for status updates
      startStatusPolling(data.callControlId);

      console.log('[CALL CONTROL] Call details:', {
        mode: data.mode,
        agentPhone: data.agentPhone,
        prospectPhone: phoneNumber,
        from: data.from,
        callControlId: data.callControlId,
      });

      toast({
        title: data.mode === 'callback' ? "Calling Your Phone" : "Calling",
        description: data.mode === 'callback'
          ? `Answer your phone at ${data.agentPhone} to connect with the prospect`
          : `Calling ${phoneNumber}...`,
        duration: 8000,
      });

      return data.callControlId;
    } catch (error: any) {
      console.error('[CALL CONTROL] Make call error:', error);
      toast({
        variant: "destructive",
        title: "Call Failed",
        description: error.message || "Failed to initiate call",
      });
      updateCallState('idle');
    }
  }, [activeSession, updateCallState, startStatusPolling, toast]);

  // Hangup call
  const hangup = useCallback(async () => {
    if (!activeSession?.callControlId) {
      console.log('[CALL CONTROL] No active call to hang up');
      return;
    }

    try {
      console.log('[CALL CONTROL] Hanging up call:', activeSession.callControlId);

      const response = await apiRequest('POST', '/api/calls/hangup', {
        callControlId: activeSession.callControlId,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[CALL CONTROL] Hangup error:', errorData);
        // Even if hangup fails, clean up local state
      }

      stopStatusPolling();
      stopDurationTimer();
      updateCallState('hangup');
      setActiveSession(null);
      setIsMuted(false);
      setIsHeld(false);

      if (onCallEnd) {
        onCallEnd();
      }
    } catch (error: any) {
      console.error('[CALL CONTROL] Hangup error:', error);
      // Clean up local state anyway
      stopStatusPolling();
      stopDurationTimer();
      updateCallState('hangup');
      setActiveSession(null);
    }
  }, [activeSession, stopStatusPolling, stopDurationTimer, updateCallState, onCallEnd]);

  // Toggle mute (for Call Control, this sends mute command to Telnyx)
  const toggleMute = useCallback(async () => {
    if (!activeSession?.callControlId) return;

    try {
      const endpoint = isMuted ? '/api/calls/unmute' : '/api/calls/mute';
      const response = await apiRequest('POST', endpoint, {
        callControlId: activeSession.callControlId,
      });

      if (response.ok) {
        setIsMuted(!isMuted);
        toast({
          description: isMuted ? "Microphone unmuted" : "Microphone muted",
        });
      }
    } catch (error) {
      console.error('[CALL CONTROL] Mute toggle error:', error);
    }
  }, [activeSession, isMuted, toast]);

  // Toggle hold
  const toggleHold = useCallback(async () => {
    if (!activeSession?.callControlId) return;

    try {
      const endpoint = isHeld ? '/api/calls/unhold' : '/api/calls/hold';
      const response = await apiRequest('POST', endpoint, {
        callControlId: activeSession.callControlId,
      });

      if (response.ok) {
        setIsHeld(!isHeld);
        updateCallState(isHeld ? 'active' : 'held');
        toast({
          description: isHeld ? "Call resumed" : "Call on hold",
        });
      }
    } catch (error) {
      console.error('[CALL CONTROL] Hold toggle error:', error);
    }
  }, [activeSession, isHeld, updateCallState, toast]);

  // Send DTMF tones
  const sendDTMF = useCallback(async (digit: string) => {
    if (!activeSession?.callControlId || callState !== 'active') return;

    try {
      const response = await apiRequest('POST', '/api/calls/dtmf', {
        callControlId: activeSession.callControlId,
        digit,
      });

      if (!response.ok) {
        console.error('[CALL CONTROL] DTMF send failed');
      }
    } catch (error) {
      console.error('[CALL CONTROL] DTMF error:', error);
    }
  }, [activeSession, callState]);

  // Transfer call
  const transferCall = useCallback(async (transferTo: string) => {
    if (!activeSession?.callControlId) return;

    try {
      const response = await apiRequest('POST', '/api/calls/transfer', {
        callControlId: activeSession.callControlId,
        transferTo,
      });

      if (response.ok) {
        toast({
          title: "Call Transferred",
          description: `Transferring to ${transferTo}...`,
        });
        // After transfer, the call ends for this agent
        stopStatusPolling();
        stopDurationTimer();
        updateCallState('hangup');
        setActiveSession(null);
        if (onCallEnd) {
          onCallEnd();
        }
      } else {
        const errorData = await response.json();
        toast({
          variant: "destructive",
          title: "Transfer Failed",
          description: errorData.message || "Failed to transfer call",
        });
      }
    } catch (error: any) {
      console.error('[CALL CONTROL] Transfer error:', error);
      toast({
        variant: "destructive",
        title: "Transfer Failed",
        description: error.message || "Failed to transfer call",
      });
    }
  }, [activeSession, stopStatusPolling, stopDurationTimer, updateCallState, onCallEnd, toast]);

  // Format duration as MM:SS
  const formatDuration = useCallback(() => {
    const minutes = Math.floor(callDuration / 60);
    const seconds = callDuration % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [callDuration]);

  return {
    // State
    activeSession,
    callState,
    callDuration,
    isMuted,
    isHeld,
    callControlId: activeSession?.callControlId || null,

    // Actions
    makeCall,
    hangup,
    toggleMute,
    toggleHold,
    sendDTMF,
    transferCall,
    formatDuration,

    // Connection status (for API-based calls, always "connected" if API is reachable)
    isConnected: true,
  };
}
