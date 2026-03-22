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
  const [response, setResponse] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState(null);
  
  // Voice mode toggles - both default to OFF (text-first experience)
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const inputRef = useRef(null);

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
    const variants: Record = {
      navigation: 'default',
      query: 'secondary',
      action: 'default',
      report: 'secondary',
    };
    return (
      
        {intent}
      
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
    
      
        
          
            
              
                
                  
                
                AgentX
              
              Always-on chat for every user type.
            
            
              
                
                Live
              
              
                
                
                  Mic
                
              
              
                
                
                  Audio
                
              
            
          
        

        
          {/* Conversation rail */}
          
            
              {conversation.length === 0 && !liveMessage && (
                
                  Ask anything to get started
                  
                    {[
                      'Spin up a call campaign for healthcare leads',
                      'Summarize today’s pipeline health',
                      'Draft an email sequence for renewals',
                      'Show my open invoices',
                    ].map((example) => (
                       {
                          setTranscript(example);
                          processCommand(example);
                        }}
                      >
                        {example}
                      
                    ))}
                  
                
              )}

              {conversation.map((message) => (
                
                  
                    
                      
                        {message.intent || (message.role === 'user' ? 'prompt' : 'agent')}
                      
                      {message.role === 'assistant' && message.navigation && (
                        Navigating…
                      )}
                    
                    {message.text}
                  
                
              ))}

              {liveMessage && (
                
                  
                    
                      {getIntentBadge(liveMessage.intent)}
                      {liveMessage.audioUrl && (
                         playAudio(liveMessage.audioUrl!)}
                        >
                          
                        
                      )}
                    
                    {liveMessage.text}
                    {liveMessage.navigation && (
                      
                        Navigating to {liveMessage.navigation.path}...
                      
                    )}
                  
                
              )}

              {error && (
                
                  {error}
                
              )}

              {isListening && (
                
                  
                    
                    
                  
                  Listening...
                
              )}
            
          

          {/* Composer */}
          
            
               setTranscript(e.target.value)}
                placeholder="Type to your operator..."
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus-visible:ring-primary/60"
                disabled={isProcessing || isListening}
              />
              {voiceInputEnabled && (
                
                  {isListening ?  : }
                
              )}
              
                {isProcessing ?  : }
              
            
            
              
                
                {history.length} recent commands
              
               setShowHistory(!showHistory)}
              >
                {showHistory ? 'Hide' : 'Show'} history
              
            
            {showHistory && history.length > 0 && (
              
                
                  {history.map((item) => (
                     {
                        setTranscript(item.transcript);
                        processCommand(item.transcript);
                      }}
                    >
                      
                        {item.intent}
                      
                      
                        {item.transcript}
                        {item.responseText}
                      
                    
                  ))}
                
              
            )}
          
        

        {/* Hidden audio element */}
        
      
    
  );
}