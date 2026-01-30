import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Mic, MicOff, Volume2, Loader2, Send, History, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (path: string) => void;
}

interface CommandHistoryItem {
  id: string;
  transcript: string;
  responseText: string;
  intent: string;
  success: boolean;
  createdAt: string;
}

interface VoiceResponse {
  success: boolean;
  intent: string;
  action: string;
  confidence: number;
  response: {
    text: string;
    audioUrl?: string;
  };
  navigation?: {
    path: string;
  };
  data?: unknown;
}

export function VoiceAssistant({ open, onOpenChange, onNavigate }: VoiceAssistantProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState<VoiceResponse | null>(null);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Voice mode toggles - both default to OFF (text-first experience)
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        window.SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const current = event.resultIndex;
          const result = event.results[current];
          const text = result[0].transcript;
          setTranscript(text);

          if (result.isFinal) {
            processCommand(text);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setError(`Speech recognition error: ${event.error}`);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Load history when opened
  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open]);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/client-portal/voice/history?limit=10', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setError(null);
      setTranscript('');
      setResponse(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start recognition:', err);
        setError('Failed to start voice recognition. Please try again.');
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const processCommand = async (text: string) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch('/api/client-portal/voice/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          transcript: text,
          generateAudio: true,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to process command');
      }

      const data: VoiceResponse = await res.json();
      setResponse(data);

      // Play audio response only if voice output is enabled
      if (data.response.audioUrl && voiceOutputEnabled) {
        playAudio(data.response.audioUrl);
      }

      // Handle navigation
      if (data.navigation?.path && onNavigate) {
        setTimeout(() => {
          onNavigate(data.navigation!.path);
        }, 2000);
      }

      // Reload history
      loadHistory();
    } catch (err) {
      console.error('Command processing error:', err);
      setError('Failed to process your command. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = (audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.play().catch(console.error);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (transcript.trim()) {
      processCommand(transcript);
    }
  };

  const getIntentBadge = (intent: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      navigation: 'default',
      query: 'secondary',
      action: 'default',
      report: 'secondary',
    };
    return (
      <Badge variant={variants[intent] || 'outline'} className="capitalize">
        {intent}
      </Badge>
    );
  };

  const conversation = history.flatMap((item) => [
    { id: `${item.id}-user`, role: 'user' as const, text: item.transcript, intent: item.intent },
    { id: `${item.id}-assistant`, role: 'assistant' as const, text: item.responseText, intent: item.intent },
  ]);
  const liveMessage =
    response && {
      id: 'live-response',
      role: 'assistant' as const,
      text: response.response.text,
      intent: response.intent,
      navigation: response.navigation,
      audioUrl: response.response.audioUrl,
    };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-[420px] w-full p-0 border-l bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col shadow-2xl"
      >
        <SheetHeader className="p-4 pb-3 border-b border-white/5 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle className="text-base flex items-center gap-2 text-white">
                <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </span>
                Agentic Operator
              </SheetTitle>
              <p className="text-xs text-slate-300/80">Always-on chat for every user type.</p>
            </div>
            <div className="flex items-center gap-3 rounded-full bg-white/5 px-3 py-1">
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-200">
                <Sparkles className="h-3 w-3 text-amber-300" />
                Live
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="voice-input"
                  checked={voiceInputEnabled}
                  onCheckedChange={setVoiceInputEnabled}
                />
                <Label htmlFor="voice-input" className="text-[11px] cursor-pointer">
                  Mic
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="voice-output"
                  checked={voiceOutputEnabled}
                  onCheckedChange={setVoiceOutputEnabled}
                />
                <Label htmlFor="voice-output" className="text-[11px] cursor-pointer">
                  Audio
                </Label>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Conversation rail */}
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {conversation.length === 0 && !liveMessage && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                  <p className="font-medium mb-1">Ask anything to get started</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Spin up a call campaign for healthcare leads',
                      'Summarize today’s pipeline health',
                      'Draft an email sequence for renewals',
                      'Show my open invoices',
                    ].map((example) => (
                      <button
                        key={example}
                        className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 transition"
                        onClick={() => {
                          setTranscript(example);
                          processCommand(example);
                        }}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {conversation.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex w-full',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm border',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground border-primary/50 rounded-br-sm'
                        : 'bg-white/5 border-white/10 text-slate-50 rounded-bl-sm'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] bg-black/20 border-white/10 capitalize">
                        {message.intent || (message.role === 'user' ? 'prompt' : 'agent')}
                      </Badge>
                      {message.role === 'assistant' && message.navigation && (
                        <span className="text-[11px] text-emerald-200">Navigating…</span>
                      )}
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
                  </div>
                </div>
              ))}

              {liveMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm border bg-white/5 border-white/10 text-slate-50 rounded-bl-sm">
                    <div className="flex items-center gap-2 mb-1">
                      {getIntentBadge(liveMessage.intent)}
                      {liveMessage.audioUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-white hover:text-primary"
                          onClick={() => playAudio(liveMessage.audioUrl!)}
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{liveMessage.text}</p>
                    {liveMessage.navigation && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Navigating to {liveMessage.navigation.path}...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-100 px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              {isListening && (
                <div className="flex items-center gap-2 text-xs text-amber-200">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                  Listening...
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="border-t border-white/10 p-4 space-y-2 bg-slate-950/80 backdrop-blur">
            <form onSubmit={handleTextSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Type to your operator..."
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus-visible:ring-primary/60"
                disabled={isProcessing || isListening}
              />
              {voiceInputEnabled && (
                <Button
                  type="button"
                  size="icon"
                  variant={isListening ? "destructive" : "secondary"}
                  onClick={isListening ? stopListening : startListening}
                  disabled={isProcessing}
                  className="w-11"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Button
                type="submit"
                size="icon"
                disabled={!transcript.trim() || isProcessing || isListening}
                className="w-11"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5" />
                <span>{history.length} recent commands</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[12px] px-2 text-white"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? 'Hide' : 'Show'} history
              </Button>
            </div>
            {showHistory && history.length > 0 && (
              <ScrollArea className="h-28 mt-2 rounded-md border border-white/10 bg-white/5">
                <div className="p-2 space-y-2">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      className="w-full text-left text-xs p-2 rounded-md hover:bg-white/10 transition flex items-start gap-2"
                      onClick={() => {
                        setTranscript(item.transcript);
                        processCommand(item.transcript);
                      }}
                    >
                      <Badge className="text-[10px] px-1" variant={item.success ? 'default' : 'destructive'}>
                        {item.intent}
                      </Badge>
                      <div className="flex-1 space-y-1">
                        <p className="font-medium text-slate-100 line-clamp-1">{item.transcript}</p>
                        <p className="text-slate-300/80 line-clamp-1">{item.responseText}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Hidden audio element */}
        <audio ref={audioRef} className="hidden" />
      </SheetContent>
    </Sheet>
  );
}
