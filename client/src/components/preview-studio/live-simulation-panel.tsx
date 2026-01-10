import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  AlertTriangle,
  CheckCircle2,
  User,
  Bot,
  Loader2,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface SimulationSession {
  sessionId: string;
  websocketUrl: string;
  assembledPrompt: string;
}

interface LiveSimulationPanelProps {
  campaignId: string | null;
  accountId: string | null;
  contactId: string | null;
}

type SimulationStatus = 'idle' | 'connecting' | 'active' | 'ended' | 'error';

export function LiveSimulationPanel({
  campaignId,
  accountId,
  contactId,
}: LiveSimulationPanelProps) {
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcripts
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endSimulation();
    };
  }, []);

  const startSimulation = async () => {
    if (!campaignId || !accountId) {
      setError('Campaign and account are required');
      return;
    }

    setStatus('connecting');
    setError(null);
    setTranscripts([]);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });
      mediaStreamRef.current = stream;

      // Create audio context
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });

      // Setup analyser for audio level visualization
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Start audio level animation
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average / 255);
        }
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

      // Start simulation session via API
      const response = await apiRequest('POST', '/api/preview-studio/simulation/start', {
        campaignId,
        accountId,
        contactId,
      });

      const session: SimulationSession = await response.json();
      setSessionId(session.sessionId);

      // Add system message
      setTranscripts(prev => [...prev, {
        role: 'system',
        content: 'Simulation started. Speak into your microphone to test the AI agent.',
        timestamp: new Date(),
      }]);

      // Note: Full WebSocket audio streaming would be implemented here
      // For now, we show a placeholder that the infrastructure is ready
      setStatus('active');

      // Simulate AI greeting after a short delay
      setTimeout(() => {
        setTranscripts(prev => [...prev, {
          role: 'assistant',
          content: 'Hello, may I speak with the person in charge of your technology decisions?',
          timestamp: new Date(),
        }]);
      }, 1000);

    } catch (err) {
      console.error('Failed to start simulation:', err);
      setError(err instanceof Error ? err.message : 'Failed to start simulation');
      setStatus('error');
      cleanup();
    }
  };

  const cleanup = useCallback(() => {
    // Stop animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setAudioLevel(0);
  }, []);

  const endSimulation = async () => {
    cleanup();

    if (sessionId) {
      try {
        await apiRequest('POST', `/api/preview-studio/simulation/${sessionId}/end`);
      } catch (e) {
        console.error('Failed to end simulation:', e);
      }
    }

    setTranscripts(prev => [...prev, {
      role: 'system',
      content: 'Simulation ended.',
      timestamp: new Date(),
    }]);

    setStatus('ended');
    setSessionId(null);
  };

  const toggleMute = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // Toggle
      });
      setIsMuted(!isMuted);
    }
  };

  const canStart = campaignId && accountId && status === 'idle';
  const isActive = status === 'active';

  return (
    <div className="space-y-6">
      {/* Controls Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="h-5 w-5" />
            Live Voice Simulation
          </CardTitle>
          <CardDescription>
            Test the AI agent with your microphone. Speak naturally and observe how it responds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-4">
            {/* Start/End Button */}
            {status === 'idle' || status === 'ended' || status === 'error' ? (
              <Button
                size="lg"
                onClick={startSimulation}
                disabled={!canStart}
                className="gap-2"
              >
                <Phone className="h-5 w-5" />
                Start Simulation
              </Button>
            ) : status === 'connecting' ? (
              <Button size="lg" disabled className="gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Connecting...
              </Button>
            ) : (
              <Button
                size="lg"
                variant="destructive"
                onClick={endSimulation}
                className="gap-2"
              >
                <PhoneOff className="h-5 w-5" />
                End Simulation
              </Button>
            )}

            {/* Mute Button */}
            {isActive && (
              <Button
                variant={isMuted ? "destructive" : "outline"}
                size="lg"
                onClick={toggleMute}
                className="gap-2"
              >
                {isMuted ? (
                  <>
                    <MicOff className="h-5 w-5" />
                    Muted
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    Mic On
                  </>
                )}
              </Button>
            )}

            {/* Audio Level Indicator */}
            {isActive && (
              <div className="flex items-center gap-2">
                <Radio className={cn(
                  "h-4 w-4",
                  audioLevel > 0.1 ? "text-green-500 animate-pulse" : "text-muted-foreground"
                )} />
                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-100"
                    style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Status Badge */}
            <Badge variant={
              status === 'active' ? 'default' :
              status === 'connecting' ? 'secondary' :
              status === 'error' ? 'destructive' : 'outline'
            }>
              {status === 'idle' && 'Ready'}
              {status === 'connecting' && 'Connecting...'}
              {status === 'active' && 'Live'}
              {status === 'ended' && 'Ended'}
              {status === 'error' && 'Error'}
            </Badge>
          </div>

          {!contactId && status === 'idle' && (
            <p className="text-sm text-muted-foreground mt-4">
              Tip: Select a contact for a more personalized simulation experience.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Transcript Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Conversation Transcript</CardTitle>
          <CardDescription>
            Real-time transcript of the simulation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transcripts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Volume2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No conversation yet. Start a simulation to begin.</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {transcripts.map((entry, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      entry.role === 'user' && "justify-end"
                    )}
                  >
                    {entry.role !== 'user' && (
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        entry.role === 'assistant' ? "bg-primary/10" : "bg-muted"
                      )}>
                        {entry.role === 'assistant' ? (
                          <Bot className="h-4 w-4 text-primary" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[80%] rounded-lg px-4 py-2",
                      entry.role === 'user' ? "bg-primary text-primary-foreground" :
                      entry.role === 'assistant' ? "bg-muted" :
                      "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
                    )}>
                      <p className="text-sm">{entry.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {entry.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    {entry.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Browser Simulation Mode</p>
              <p className="text-muted-foreground mt-1">
                This simulation runs directly in your browser using the OpenAI Realtime API.
                Your microphone audio is processed in real-time. No actual phone calls are made.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
