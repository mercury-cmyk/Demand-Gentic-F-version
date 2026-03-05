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
  const [currentCall, setCurrentCall] = useState<CallState | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [callHistory, setCallHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout>();
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

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
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Call Area */}
      {currentCall ? (
        <div className="flex-1 flex flex-col">
          {/* Participants Grid */}
          <div className="flex-1 grid grid-cols-2 gap-4 p-4 justify-center items-center">
            {currentCall.participants.map((participant, idx) => (
              <div
                key={participant.userId}
                className="relative bg-gray-800 rounded-lg overflow-hidden aspect-square flex items-center justify-center"
              >
                {isVideoOn && idx === 0 && (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}

                {!isVideoOn && (
                  <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-4xl text-white">
                    {participant.username[0]?.toUpperCase()}
                  </div>
                )}

                {/* Participant Info */}
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-white font-semibold">{participant.username}</p>
                  <p className="text-gray-300 text-sm capitalize">{participant.status}</p>
                </div>

                {/* Media Status */}
                <div className="absolute top-4 right-4 flex gap-2">
                  {participant.isMuted && (
                    <div className="bg-red-500 p-2 rounded-full">
                      <MicOff size={16} className="text-white" />
                    </div>
                  )}
                  {!participant.isVideoOn && (
                    <div className="bg-red-500 p-2 rounded-full">
                      <VideoOff size={16} className="text-white" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Call Controls */}
          <div className="bg-gray-800 border-t border-gray-700 px-6 py-4 flex items-center justify-between">
            <div className="text-white text-lg font-semibold">
              <Clock className="inline mr-2" size={24} />
              {formatDuration(callDuration)}
            </div>

            <div className="flex gap-4">
              {currentCall.status === 'ringing' ? (
                <>
                  <button
                    onClick={handleAcceptCall}
                    className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center gap-2"
                  >
                    <Phone size={20} /> Accept
                  </button>
                  <button
                    onClick={handleDeclineCall}
                    className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2"
                  >
                    <PhoneOff size={20} /> Decline
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={toggleMic}
                    className={`p-3 rounded-full ${
                      isMicOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'
                    } text-white`}
                    title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
                  >
                    {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                  </button>

                  <button
                    onClick={toggleVideo}
                    className={`p-3 rounded-full ${
                      isVideoOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'
                    } text-white`}
                    title={isVideoOn ? 'Turn off video' : 'Turn on video'}
                  >
                    {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
                  </button>

                  <button
                    onClick={toggleScreenShare}
                    className={`p-3 rounded-full ${
                      isScreenSharing ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    } text-white`}
                    title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
                  >
                    <Share2 size={20} />
                  </button>

                  <button
                    onClick={handleEndCall}
                    className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2"
                  >
                    <PhoneOff size={20} /> End Call
                  </button>
                </>
              )}
            </div>

            <div className="text-white">
              {currentCall.participants.length} participant{currentCall.participants.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      ) : (
        /* Call History */
        <div className="flex-1 flex flex-col bg-black">
          <div className="p-6 border-b border-gray-700">
            <h1 className="text-2xl font-bold text-white">Call History</h1>
            <p className="text-gray-400">Recent calls in {teamId}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {callHistory.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                No call history
              </div>
            ) : (
              <div className="space-y-3">
                {callHistory.map(call => (
                  <div
                    key={call.id}
                    onClick={() => loadCall(call.id)}
                    className="flex items-center justify-between bg-gray-800 p-4 rounded-lg hover:bg-gray-700 cursor-pointer transition"
                  >
                    <div>
                      <p className="text-white font-semibold">
                        Call with {call.participantCount} participant{call.participantCount !== 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-gray-400">
                        {new Date(call.createdAt).toLocaleDateString()} at{' '}
                        {new Date(call.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">{formatDuration(call.callDuration || 0)}</p>
                      <p className={`text-sm ${
                        call.status === 'active' ? 'text-green-400' : 'text-gray-400'
                      }`}>
                        {call.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audio Elements */}
      <audio ref={localAudioRef} autoPlay muted playsInline />
    </div>
  );
}
