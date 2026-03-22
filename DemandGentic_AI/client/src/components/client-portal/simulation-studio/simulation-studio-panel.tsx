/**
 * Simulation Studio Panel
 * A complete redesign of the campaign simulation experience for the client portal.
 * This studio provides an immersive environment for clients to test and interact
 * with their AI agents in real-time, using either voice or text.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Bot, Send, Loader2, User, Sparkles, Phone, MessageSquare, Mic, MicOff, Volume2, VolumeX, Play, Square, RefreshCw, Building2, UserCircle, Target, Brain, Zap, Info, X, Settings, History, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// Import voices from shared constants
import { GEMINI_VOICES as AI_VOICES } from '@/lib/voice-constants';

// Prospect Personas - Different types of prospects the AI agent will simulate calling
const PROSPECT_PERSONAS = [
  {
    id: 'friendly_dm',
    name: 'Friendly Decision Maker',
    role: 'VP of Marketing',
    disposition: 'friendly',
    description: 'Open to conversation, interested in learning more',
    icon: 'Smile',
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'neutral_dm',
    name: 'Neutral Decision Maker',
    role: 'Director of Technology',
    disposition: 'neutral',
    description: 'Professional, needs convincing with value',
    icon: 'User',
    color: 'from-blue-500 to-indigo-500',
  },
  {
    id: 'skeptical_dm',
    name: 'Skeptical Decision Maker',
    role: 'IT Director',
    disposition: 'skeptical',
    description: 'Has objections, tests your pitch',
    icon: 'Shield',
    color: 'from-amber-500 to-orange-500',
  },
  {
    id: 'busy_executive',
    name: 'Busy Executive',
    role: 'CEO',
    disposition: 'busy',
    description: 'Limited time, needs quick value proposition',
    icon: 'Clock',
    color: 'from-purple-500 to-violet-500',
  },
  {
    id: 'gatekeeper',
    name: 'Gatekeeper',
    role: 'Executive Assistant',
    disposition: 'gatekeeper',
    description: 'Protects the decision maker',
    icon: 'Users',
    color: 'from-slate-500 to-gray-600',
  },
];

// --- Type Definitions ---
interface Message {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface SimulationContext {
  campaignId: string;
  campaignName: string;
  accountName?: string;
  contactName?: string;
  contactTitle?: string;
  systemPrompt?: string;
  firstMessage?: string;
}

interface SimulationStudioPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
}

// --- Main Component ---
export function SimulationStudioPanel({ open, onOpenChange, campaignId: initialCampaignId }: SimulationStudioPanelProps) {
  const [view, setView] = useState('setup');
  const [mode, setMode] = useState('voice');
  const [selectedVoice, setSelectedVoice] = useState('Fenrir');
  const [selectedPersona, setSelectedPersona] = useState('neutral_dm');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [context, setContext] = useState(null);

  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  }, [initialCampaignId]);

  // --- Data Fetching ---
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['client-portal-voice-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/qualified-leads/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    enabled: open,
  });

  // --- Mutations ---
  const startSimulationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId) throw new Error("A campaign must be selected.");
      const res = await fetch('/api/client-portal/simulation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          mode,
          voiceId: mode === 'voice' ? selectedVoice : undefined,
          personaPreset: selectedPersona, // Send selected prospect persona
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to start simulation');
      return res.json();
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setContext(data.context);
      const firstMsg: Message = {
        role: 'assistant',
        content: data.firstMessage,
        timestamp: new Date(),
      };
      setMessages([firstMsg]);
      setView('simulation');
      if (mode === 'voice' && voiceOutputEnabled) {
        speak(data.firstMessage);
      }
    },
    onError: (error: Error) => {
      setMessages([{ role: 'error', content: `⚠️ ${error.message}`, timestamp: new Date() }]);
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const res = await fetch('/api/client-portal/simulation/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          sessionId,
          campaignId: selectedCampaignId,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          userMessage,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to get response');
      return res.json();
    },
    onSuccess: (data) => {
      const assistantMessage: Message = { role: 'assistant', content: data.reply, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMessage]);
      if (mode === 'voice' && voiceOutputEnabled) {
        speak(data.reply);
      }
    },
    onError: (error: Error) => {
      setMessages(prev => [...prev, { role: 'error', content: `⚠️ ${error.message}`, timestamp: new Date() }]);
    },
  });

  // --- Audio ref for TTS playback ---
  const audioRef = useRef(null);

  // --- Speech Synthesis using Google Cloud TTS API ---
  const speak = async (text: string) => {
    if (!voiceOutputEnabled) return;
    stopListening();
    
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    try {
      setIsSpeaking(true);
      
      // Check for auth token before calling TTS API
      const token = getToken();
      if (!token) {
        // No auth token - use browser speech synthesis fallback
        console.warn('[SimStudio] No auth token, using browser TTS fallback');
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.onend = () => {
            setIsSpeaking(false);
            if (view === 'simulation') startListening();
          };
          utterance.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utterance);
        } else {
          setIsSpeaking(false);
        }
        return;
      }
      
      // Generate TTS audio using the client portal voice API
      const response = await fetch('/api/client-portal/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          voiceId: selectedVoice,
          provider: 'gemini',
        }),
      });

      if (!response.ok) {
        // Fallback to browser speech synthesis if API fails
        console.warn('[SimStudio] TTS API failed, using browser fallback');
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.onend = () => {
            setIsSpeaking(false);
            if (view === 'simulation') startListening();
          };
          utterance.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utterance);
        }
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
        if (view === 'simulation') startListening();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
        console.error('[SimStudio] Audio playback error');
      };

      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error('[SimStudio] TTS error:', error);
      setIsSpeaking(false);
      // Fallback to browser speech synthesis
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => {
          setIsSpeaking(false);
          if (view === 'simulation') startListening();
        };
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const startListening = () => {
    if (isSpeaking || !recognitionRef.current || isListening) return;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      console.error("Could not start recognition:", e);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current || !isListening) return;
    try {
      recognitionRef.current.stop();
    } catch (e) {
      console.error("Could not stop recognition:", e);
    } finally {
      setIsListening(false);
    }
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (mode === 'voice') {
        setMessages([{ role: 'system', content: "Voice recognition is not supported in your browser.", timestamp: new Date() }]);
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      if (isSpeaking) return;
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result) => result.transcript)
        .join('');
      setInput(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        handleSend(transcript);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (view === 'simulation' && !isSpeaking) {
        // Optional: auto-restart listening
        // startListening();
      }
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setMessages(prev => [...prev, { role: 'system', content: 'Microphone access denied. Please allow microphone access to use voice mode.', timestamp: new Date() }]);
      }
    };
    
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isSpeaking, view]);

  // --- Event Handlers ---
  const handleSend = useCallback((text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || chatMutation.isPending) return;
    const userMessage: Message = { role: 'user', content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    chatMutation.mutate(messageText);
  }, [input, chatMutation]);

  const handleStart = () => {
    setMessages([]);
    startSimulationMutation.mutate();
  };

  const handleReset = () => {
    // Stop API TTS audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Stop browser TTS
    window.speechSynthesis?.cancel();
    stopListening();
    setIsSpeaking(false);
    setMessages([]);
    setSessionId(null);
    setContext(null);
    setView('setup');
  };

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // --- UI Rendering ---
  const renderEmail = (msg: Message, index: number) => {
    return (
      
        
           
             
               {msg.role === 'user' ? 'You' : 'AI Agent'}
               &lt;{msg.role === 'user' ? 'client@example.com' : 'ai@pivotal-b2b.com'}&gt;
             
             {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
           
           
             {msg.content}
           
        
      
    );
  };

  const renderMessage = (msg: Message, index: number) => {
    if (mode === 'email') return renderEmail(msg, index);

    const Icon = { user: User, assistant: Bot, system: Info, error: X }[msg.role];
    const bgColor = {
      user: 'bg-blue-100 dark:bg-blue-900/30',
      assistant: 'bg-gray-100 dark:bg-gray-800/50',
      system: 'bg-yellow-100 dark:bg-yellow-900/30',
      error: 'bg-red-100 dark:bg-red-900/30',
    }[msg.role];
    const align = msg.role === 'user' ? 'items-end' : 'items-start';
    const textColor = msg.role === 'error' ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-200';

    return (
      
        
          
            
          
          
            {msg.content}
            
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            
          
        
      
    );
  };

  const SetupView = () => (
    
      
        
          
            
            Simulation Studio
          
          Configure and launch your AI agent simulation
        
        
          
            
              Campaign
              
                
                  
                
                
                  {campaigns.map((c: any) => {c.name})}
                
              
            
            
              Interaction Mode
              
                 setMode('voice')} className="flex items-center gap-1.5 h-9 text-xs"> Voice
                 setMode('email')} className="flex items-center gap-1.5 h-9 text-xs"> Email
                 setMode('text')} className="flex items-center gap-1.5 h-9 text-xs"> Text
              
            
          

          {mode === 'voice' && (
            
              {/* Agent Voice Selection - Compact horizontal scroll */}
              
                
                  
                  Agent Voice
                
                
                  {AI_VOICES.map((voice) => (
                     setSelectedVoice(voice.id)}
                      className={cn(
                        "cursor-pointer rounded-lg border p-2 transition-all hover:shadow-sm flex-shrink-0 w-[120px]",
                        selectedVoice === voice.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      
                        
                          {voice.gender === 'male' ?  : }
                        
                        
                          
                            {voice.name}
                            {selectedVoice === voice.id && }
                          
                          {voice.tone.split(',')[0]}
                        
                      
                    
                  ))}
                
              

              

              {/* Prospect Persona Selection - Compact grid */}
              
                
                  
                  Prospect Type
                
                
                  {PROSPECT_PERSONAS.map((persona) => (
                     setSelectedPersona(persona.id)}
                      className={cn(
                        "cursor-pointer rounded-lg border p-2 transition-all hover:shadow-sm",
                        selectedPersona === persona.id
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-500"
                          : "border-border hover:border-amber-400"
                      )}
                    >
                      
                        {persona.name.split(' ')[0]}
                        {selectedPersona === persona.id && }
                      
                      {persona.role}
                    
                  ))}
                
              
            
          )}

          
            {startSimulationMutation.isPending ?  : }
            Start Simulation
          
        
      
    
  );

  const SimulationView = () => (
    
      {/* Left Panel: Controls & Context - Fixed narrow width */}
      
        
          
            Controls
            
          
        
        
          
            Campaign
            {context?.campaignName}
          
          
          
            AI Context
            
               {context?.accountName || 'Generic Account'}
               {context?.contactName || 'Generic Contact'}
            
          
          {mode === 'voice' && (
            <>
              
              
                
                  Voice Output
                  
                
                
                  
                    
                  
                  {isListening ? "Listening..." : "Tap to speak"}
                
              
            
          )}
        
      

      {/* Right Panel: Chat/Transcript/Email - Takes remaining space */}
      
        
          
            {mode === 'email' ?  : } 
            {mode === 'email' ? "Email Thread" : "Conversation"}
          
        
        
          
            
              {messages.map(renderMessage)}
              {chatMutation.isPending && renderMessage({ role: 'assistant', content: '...', timestamp: new Date() }, messages.length)}
            
          
        
        
          
             setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={mode === 'voice' ? "Listening..." : mode === 'email' ? "Write a reply..." : "Type your message..."}
              className="pr-10 h-9 text-sm"
              disabled={chatMutation.isPending || (mode === 'voice' && isListening)}
            />
             handleSend()}
              disabled={chatMutation.isPending || !input.trim()}
            >
              {chatMutation.isPending ?  : }
            
          
        
      
    
  );

  return (
    
      
        
          
            
            AI Simulation Studio
          
          
            Test your AI agents in a realistic environment
          
        

        
          {view === 'setup' ?  : }
        
      
    
  );
}