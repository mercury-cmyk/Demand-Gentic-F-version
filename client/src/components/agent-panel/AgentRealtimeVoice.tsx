/**
 * AgentC Realtime Voice Panel
 *
 * Full-duplex voice conversation with AgentC using OpenAI Realtime WebRTC API.
 * - Requests ephemeral token from server
 * - Establishes WebRTC peer connection with OpenAI
 * - Streams mic audio to model, plays model audio back
 * - Shows live transcript and conversation history
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  Loader2,
  Sparkles,
  Bot,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

interface AgentRealtimeVoiceProps {
  isClientPortal: boolean;
  onClose: () => void;
}

const AGENTC_INSTRUCTIONS = `You are AgentC, an AI-powered agentic operator for DemandGentic — a B2B demand generation platform. You assist clients and admins with campaigns, analytics, leads, billing, orders, and creative content.

Key behaviors:
- Be concise and precise in voice responses — keep answers under 30 seconds
- When the user asks about campaigns, leads, analytics, or billing, provide helpful guidance
- You can help draft emails, plan campaigns, analyze performance, and manage pipeline
- Always be professional yet conversational in tone
- If you don't know something specific, suggest where in the portal to find it
- Reference DemandGentic features naturally: Organization Intelligence, Creative Studio, Pipeline & Engagement, Campaign Planner`;

export function AgentRealtimeVoice({ isClientPortal, onClose }: AgentRealtimeVoiceProps) {
  const { toast } = useToast();
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [currentUserTranscript, setCurrentUserTranscript] = useState('');
  const [currentAssistantTranscript, setCurrentAssistantTranscript] = useState('');
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [transcripts, currentUserTranscript, currentAssistantTranscript]);

  const getAuthToken = useCallback(() => {
    return localStorage.getItem(isClientPortal ? 'clientPortalToken' : 'authToken');
  }, [isClientPortal]);

  const connect = useCallback(async () => {
    setConnectionState('connecting');
    try {
      // 1. Get ephemeral token from server
      const token = getAuthToken();
      const tokenRes = await fetch('/api/openai/webrtc/ephemeral-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview',
          voice: 'alloy',
          instructions: AGENTC_INSTRUCTIONS,
        }),
      });

      if (!tokenRes.ok) {
        throw new Error('Failed to get realtime session token');
      }

      const { token: ephemeralToken } = await tokenRes.json();

      // 2. Create peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Set up remote audio playback
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioRef.current = audioEl;

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 4. Get user mic and add track
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // 5. Set up data channel for events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          handleRealtimeEvent(event);
        } catch {
          // ignore parse errors
        }
      };

      dc.onopen = () => {
        // Send session update for AgentC persona
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: AGENTC_INSTRUCTIONS,
            voice: 'alloy',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
          },
        }));
      };

      // 6. Create offer and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 7. Send SDP to OpenAI realtime endpoint
      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!sdpRes.ok) {
        throw new Error('WebRTC SDP exchange failed');
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setConnectionState('connected');
    } catch (err) {
      console.error('[AgentC Realtime] Connection error:', err);
      setConnectionState('error');
      toast({
        title: 'Voice Connection Failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
      disconnect();
    }
  }, [getAuthToken, toast]);

  const handleRealtimeEvent = useCallback((event: any) => {
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed':
        // User speech transcription complete
        if (event.transcript) {
          const entry: TranscriptEntry = {
            id: `user-${Date.now()}`,
            role: 'user',
            text: event.transcript.trim(),
            timestamp: new Date(),
            isFinal: true,
          };
          setTranscripts((prev) => [...prev, entry]);
          setCurrentUserTranscript('');
        }
        break;

      case 'response.audio_transcript.delta':
        // Streaming assistant transcript
        setCurrentAssistantTranscript((prev) => prev + (event.delta || ''));
        setIsAssistantSpeaking(true);
        break;

      case 'response.audio_transcript.done':
        // Assistant transcript complete
        if (event.transcript) {
          const entry: TranscriptEntry = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: event.transcript.trim(),
            timestamp: new Date(),
            isFinal: true,
          };
          setTranscripts((prev) => [...prev, entry]);
        }
        setCurrentAssistantTranscript('');
        setIsAssistantSpeaking(false);
        break;

      case 'input_audio_buffer.speech_started':
        setCurrentUserTranscript('Speaking...');
        break;

      case 'input_audio_buffer.speech_stopped':
        setCurrentUserTranscript('Processing...');
        break;

      case 'response.done':
        setIsAssistantSpeaking(false);
        setCurrentAssistantTranscript('');
        break;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    setConnectionState('idle');
    setCurrentUserTranscript('');
    setCurrentAssistantTranscript('');
    setIsAssistantSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const toggleSpeaker = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !isSpeakerOff;
      setIsSpeakerOff(!isSpeakerOff);
    }
  }, [isSpeakerOff]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-950/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600/30 to-indigo-600/30 border border-violet-500/20 flex items-center justify-center">
              <Radio className="h-4 w-4 text-violet-400" />
            </div>
            {connectionState === 'connected' && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border border-slate-950 shadow-[0_0_8px] shadow-emerald-400/50 animate-pulse" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              AgentC Voice
              <Badge className="text-[9px] h-4 px-1.5 bg-violet-500/20 text-violet-300 border-violet-500/30">
                Realtime
              </Badge>
            </h3>
            <p className="text-[10px] text-slate-400">
              {connectionState === 'connected'
                ? 'Live conversation active'
                : connectionState === 'connecting'
                  ? 'Establishing connection...'
                  : 'Start a voice conversation'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { disconnect(); onClose(); }}
          className="text-slate-400 hover:text-white hover:bg-white/10 h-7 px-2 text-xs"
        >
          Exit Voice
        </Button>
      </div>

      {/* Transcript Area */}
      <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
        <div className="space-y-3">
          {transcripts.length === 0 && connectionState === 'idle' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-600/10 border border-violet-500/20 flex items-center justify-center">
                  <Bot className="h-9 w-9 text-violet-400" />
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 bg-slate-950 p-1 rounded-full border border-violet-500/20">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Voice Conversation</h3>
              <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-6">
                Talk to AgentC in real-time. Ask about campaigns, analytics, leads, or anything in your portal.
              </p>
              <Button
                onClick={connect}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/25 px-6"
              >
                <Mic className="h-4 w-4 mr-2" />
                Start Conversation
              </Button>
            </div>
          )}

          {connectionState === 'connecting' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400 mb-4" />
              <p className="text-sm text-slate-300">Connecting to AgentC Voice...</p>
              <p className="text-xs text-slate-500 mt-1">Setting up secure WebRTC channel</p>
            </div>
          )}

          {connectionState === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                <MicOff className="h-6 w-6 text-red-400" />
              </div>
              <p className="text-sm text-red-300 mb-4">Connection failed. Please try again.</p>
              <Button onClick={connect} variant="outline" className="border-red-500/30 text-red-300 hover:bg-red-500/10">
                Retry
              </Button>
            </div>
          )}

          {/* Transcript Messages */}
          <AnimatePresence mode="popLayout">
            {transcripts.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex', entry.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
                    entry.role === 'user'
                      ? 'bg-violet-600/80 text-white rounded-br-sm'
                      : 'bg-white/5 border border-white/10 text-slate-100 rounded-bl-sm'
                  )}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                  <p className="text-[10px] mt-1 opacity-50">
                    {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Live user transcript */}
          {currentUserTranscript && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-end"
            >
              <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-violet-600/40 text-white/70 rounded-br-sm border border-violet-500/20">
                <p className="italic">{currentUserTranscript}</p>
              </div>
            </motion.div>
          )}

          {/* Live assistant transcript */}
          {currentAssistantTranscript && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-white/5 border border-white/10 text-slate-200 rounded-bl-sm">
                <p className="leading-relaxed">{currentAssistantTranscript}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                  </span>
                  <span className="text-[10px] text-violet-300">Speaking...</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Controls */}
      {connectionState === 'connected' && (
        <div className="border-t border-white/10 px-4 py-4 bg-slate-950/80 backdrop-blur shrink-0">
          {/* Voice Visualizer */}
          <div className="flex items-center justify-center gap-1 mb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <motion.div
                key={i}
                className={cn(
                  'w-1 rounded-full',
                  isAssistantSpeaking ? 'bg-violet-400' : isMuted ? 'bg-slate-600' : 'bg-emerald-400'
                )}
                animate={{
                  height: isAssistantSpeaking || (!isMuted && connectionState === 'connected')
                    ? [8, 20 + Math.random() * 16, 8]
                    : 8,
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.1,
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            {/* Mute toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleMute}
              className={cn(
                'h-12 w-12 rounded-full border-2 transition-all',
                isMuted
                  ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                  : 'bg-white/5 border-white/20 text-white hover:bg-white/10'
              )}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>

            {/* End call */}
            <Button
              onClick={disconnect}
              className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30"
            >
              <PhoneOff className="h-5 w-5" />
            </Button>

            {/* Speaker toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleSpeaker}
              className={cn(
                'h-12 w-12 rounded-full border-2 transition-all',
                isSpeakerOff
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                  : 'bg-white/5 border-white/20 text-white hover:bg-white/10'
              )}
            >
              {isSpeakerOff ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
          </div>

          <p className="text-center text-[10px] text-slate-500 mt-3">
            {isMuted ? 'Microphone muted' : isAssistantSpeaking ? 'AgentC is speaking...' : 'Listening for your voice...'}
          </p>
        </div>
      )}
    </div>
  );
}
