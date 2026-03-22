'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Share2, RotateCcw, Clock } from 'lucide-react';

interface CallParticipant {
  userId: string;
  username: string;
  avatar?: string;
  status: 'ringing' | 'active' | 'declined' | 'left';
  isMuted?: boolean;
  isVideoOn?: boolean;
  joinTime?: string;
  leaveTime?: string;
  participationDuration?: number;
}

interface CallState {
  callId: string;
  status: 'ringing' | 'active' | 'ended';
  initiatorId: string;
  participants: CallParticipant[];
  startTime?: string;
  duration?: number;
}

export function TeamCallsComponent({ teamId, callId }: { teamId: string; callId?: string }) {
  const [currentCall, setCurrentCall] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [callHistory, setCallHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const websocketRef = useRef(null);
  const durationIntervalRef = useRef();
  const localAudioRef = useRef(null);
  const localVideoRef = useRef(null);

  // Load call if callId provided
  useEffect(() => {
    if (callId) {
      loadCall(callId);
    }
  }, [callId]);

  // Load call history
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/team-calls/calls/history/${teamId}?limit=20`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await res.json();
        setCallHistory(data.calls || []);
      } catch (err) {
        console.error('Failed to load call history:', err);
      }
    };

    loadHistory();
  }, [teamId]);

  const loadCall = async (id: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/team-calls/calls/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setCurrentCall(data);

      // Connect to WebSocket
      connectToCall(id);
    } catch (err) {
      console.error('Failed to load call:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectToCall = (id: string) => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/calls/${id}/${userId}`,
    );

    ws.onopen = () => {
      console.log(`Connected to call: ${id}`);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'call_participants':
          setCurrentCall(prev => prev ? { ...prev, participants: data.participants } : null);
          break;

        case 'participant_joined':
          setCurrentCall(prev => {
            if (!prev) return null;
            return {
              ...prev,
              participants: [
                ...prev.participants,
                { userId: data.userId, username: data.userId, status: data.status },
              ],
            };
          });
          break;

        case 'participant_left':
          setCurrentCall(prev => {
            if (!prev) return null;
            return {
              ...prev,
              participants: prev.participants.filter(p => p.userId !== data.userId),
            };
          });
          break;

        case 'participant_status_changed':
          setCurrentCall(prev => {
            if (!prev) return null;
            return {
              ...prev,
              participants: prev.participants.map(p =>
                p.userId === data.userId ? { ...p, status: data.status } : p,
              ),
              status: data.status === 'active' && prev.status === 'ringing' ? 'active' : prev.status,
            };
          });
          break;

        case 'participant_media_changed':
          setCurrentCall(prev => {
            if (!prev) return null;
            return {
              ...prev,
              participants: prev.participants.map(p =>
                p.userId === data.userId
                  ? {
                      ...p,
                      isMuted: data.audio !== undefined ? !data.audio : p.isMuted,
                      isVideoOn: data.video !== undefined ? data.video : p.isVideoOn,
                    }
                  : p,
              ),
            };
          });
          break;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    websocketRef.current = ws;
  };

  // Handle call duration timer
  useEffect(() => {
    if (currentCall?.status === 'active') {
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [currentCall?.status]);

  // Accept call
  const handleAcceptCall = async () => {
    if (!currentCall) return;

    try {
      const res = await fetch(`/api/team-calls/calls/${currentCall.callId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (res.ok) {
        if (websocketRef.current) {
          websocketRef.current.send(JSON.stringify({ type: 'accept_call' }));
        }
      }
    } catch (err) {
      console.error('Failed to accept call:', err);
    }
  };

  // Decline call
  const handleDeclineCall = async () => {
    if (!currentCall) return;

    try {
      const res = await fetch(`/api/team-calls/calls/${currentCall.callId}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (res.ok) {
        setCurrentCall(null);
      }
    } catch (err) {
      console.error('Failed to decline call:', err);
    }
  };

  // End call
  const handleEndCall = async () => {
    if (!currentCall) return;

    try {
      const res = await fetch(`/api/team-calls/calls/${currentCall.callId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (res.ok) {
        if (websocketRef.current) {
          websocketRef.current.send(JSON.stringify({ type: 'end_call' }));
          websocketRef.current.close();
        }
        setCurrentCall(null);
        setCallDuration(0);
      }
    } catch (err) {
      console.error('Failed to end call:', err);
    }
  };

  // Toggle media
  const toggleMic = () => {
    setIsMicOn(!isMicOn);
    if (websocketRef.current) {
      websocketRef.current.send(JSON.stringify({
        type: 'mute_audio',
        muted: isMicOn,
      }));
    }
  };

  const toggleVideo = () => {
    setIsVideoOn(!isVideoOn);
    if (websocketRef.current) {
      websocketRef.current.send(JSON.stringify({
        type: 'mute_video',
        muted: isVideoOn,
      }));
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
        });
        setIsScreenSharing(true);
        if (websocketRef.current) {
          websocketRef.current.send(JSON.stringify({
            type: 'share_screen',
            streamId: stream.id,
          }));
        }
      } else {
        setIsScreenSharing(false);
        if (websocketRef.current) {
          websocketRef.current.send(JSON.stringify({ type: 'stop_screen_share' }));
        }
      }
    } catch (err) {
      console.error('Failed to share screen:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  if (loading) {
    return Loading...;
  }

  return (
    
      {/* Call Area */}
      {currentCall ? (
        
          {/* Participants Grid */}
          
            {currentCall.participants.map((participant, idx) => (
              
                {isVideoOn && idx === 0 && (
                  
                )}

                {!isVideoOn && (
                  
                    {participant.username[0]?.toUpperCase()}
                  
                )}

                {/* Participant Info */}
                
                  {participant.username}
                  {participant.status}
                

                {/* Media Status */}
                
                  {participant.isMuted && (
                    
                      
                    
                  )}
                  {!participant.isVideoOn && (
                    
                      
                    
                  )}
                
              
            ))}
          

          {/* Call Controls */}
          
            
              
              {formatDuration(callDuration)}
            

            
              {currentCall.status === 'ringing' ? (
                <>
                  
                     Accept
                  
                  
                     Decline
                  
                
              ) : (
                <>
                  
                    {isMicOn ?  : }
                  

                  
                    {isVideoOn ?  : }
                  

                  
                    
                  

                  
                     End Call
                  
                
              )}
            

            
              {currentCall.participants.length} participant{currentCall.participants.length !== 1 ? 's' : ''}
            
          
        
      ) : (
        /* Call History */
        
          
            Call History
            Recent calls in {teamId}
          

          
            {callHistory.length === 0 ? (
              
                No call history
              
            ) : (
              
                {callHistory.map(call => (
                   loadCall(call.id)}
                    className="flex items-center justify-between bg-gray-800 p-4 rounded-lg hover:bg-gray-700 cursor-pointer transition"
                  >
                    
                      
                        Call with {call.participantCount} participant{call.participantCount !== 1 ? 's' : ''}
                      
                      
                        {new Date(call.createdAt).toLocaleDateString()} at{' '}
                        {new Date(call.createdAt).toLocaleTimeString()}
                      
                    
                    
                      {formatDuration(call.callDuration || 0)}
                      
                        {call.status}
                      
                    
                  
                ))}
              
            )}
          
        
      )}

      {/* Audio Elements */}
      
    
  );
}