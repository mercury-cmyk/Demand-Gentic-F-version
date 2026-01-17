import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, MicOff, Volume2, Loader2, Send, History } from 'lucide-react';
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

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

      // Play audio response
      if (data.response.audioUrl) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Voice Assistant
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Main interaction area */}
          <div className="flex flex-col items-center justify-center py-6">
            {/* Microphone button */}
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isProcessing}
              className={cn(
                'relative w-24 h-24 rounded-full flex items-center justify-center transition-all',
                isListening
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                  : 'bg-primary hover:bg-primary/90',
                isProcessing && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isProcessing ? (
                <Loader2 className="h-10 w-10 text-white animate-spin" />
              ) : isListening ? (
                <MicOff className="h-10 w-10 text-white" />
              ) : (
                <Mic className="h-10 w-10 text-white" />
              )}

              {/* Listening animation rings */}
              {isListening && (
                <>
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25" />
                  <span className="absolute inset-[-8px] rounded-full border-2 border-red-500/50 animate-pulse" />
                </>
              )}
            </button>

            <p className="mt-4 text-sm text-muted-foreground">
              {isListening
                ? 'Listening...'
                : isProcessing
                ? 'Processing...'
                : 'Click to speak'}
            </p>
          </div>

          {/* Text input fallback */}
          <form onSubmit={handleTextSubmit} className="flex gap-2">
            <input
              type="text"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Or type your command..."
              className="flex-1 px-3 py-2 border rounded-md text-sm bg-background"
              disabled={isProcessing || isListening}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!transcript.trim() || isProcessing || isListening}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm rounded-md">
              {error}
            </div>
          )}

          {/* Response display */}
          {response && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                {getIntentBadge(response.intent)}
                {response.response.audioUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => playAudio(response.response.audioUrl!)}
                  >
                    <Volume2 className="h-4 w-4 mr-1" />
                    Replay
                  </Button>
                )}
              </div>
              <p className="text-sm">{response.response.text}</p>
              {response.navigation && (
                <p className="text-xs text-muted-foreground">
                  Navigating to {response.navigation.path}...
                </p>
              )}
            </div>
          )}

          {/* Example commands */}
          {!response && !isListening && !isProcessing && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Try saying:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Go to my projects',
                  "What's my spend this month?",
                  'Show pending invoices',
                  'Create a new order',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => {
                      setTranscript(example);
                      processCommand(example);
                    }}
                    className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded-md transition-colors"
                  >
                    "{example}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* History toggle */}
          <div className="border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between"
              onClick={() => setShowHistory(!showHistory)}
            >
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Recent Commands
              </span>
              <span className="text-xs text-muted-foreground">
                {history.length} commands
              </span>
            </Button>

            {showHistory && history.length > 0 && (
              <ScrollArea className="h-40 mt-2">
                <div className="space-y-2">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 bg-muted/50 rounded text-xs cursor-pointer hover:bg-muted"
                      onClick={() => {
                        setTranscript(item.transcript);
                        processCommand(item.transcript);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate max-w-[200px]">
                          "{item.transcript}"
                        </span>
                        <Badge
                          variant={item.success ? 'default' : 'destructive'}
                          className="text-[10px] h-4"
                        >
                          {item.intent}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground truncate">
                        {item.responseText}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Hidden audio element */}
        <audio ref={audioRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
