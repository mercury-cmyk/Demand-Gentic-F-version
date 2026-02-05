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

// Complete list of Gemini voices mapped to high-quality Google Cloud TTS
const AI_VOICES = [
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'male',
    accent: 'American',
    tone: 'Natural, Soft, Storytelling',
    description: 'Light and expressive voice - great for creative content.',
    bestFor: ['Product Launches', 'Cold Calling'],
    color: 'from-orange-500 to-amber-500',
    provider: 'gemini',
    googleVoice: 'en-US-Journey-D',
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'male',
    accent: 'American',
    tone: 'Deep, Resonant, Authoritative',
    description: 'Deep and authoritative voice that commands attention.',
    bestFor: ['Enterprise Sales', 'Executive Outreach'],
    color: 'from-slate-600 to-slate-800',
    provider: 'gemini',
    googleVoice: 'en-US-Studio-M',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'male',
    accent: 'American',
    tone: 'Calm, Measured, Thoughtful',
    description: 'Calm and measured voice for thoughtful conversations.',
    bestFor: ['Sales Calls', 'Lead Qualification', 'B2B'],
    color: 'from-blue-500 to-indigo-600',
    provider: 'gemini',
    googleVoice: 'en-US-Studio-Q',
  },
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'female',
    accent: 'American',
    tone: 'Balanced, Clear, Professional',
    description: 'Soft and friendly voice - great default for most use cases.',
    bestFor: ['Healthcare', 'Insurance', 'Customer Service'],
    color: 'from-green-400 to-emerald-500',
    provider: 'gemini',
    googleVoice: 'en-US-Journey-F',
  },
  {
    id: 'Aoede',
    name: 'Aoede',
    gender: 'female',
    accent: 'American',
    tone: 'Bright, Expressive, Engaging',
    description: 'Bright and warm voice with natural enthusiasm.',
    bestFor: ['Appointment Setting', 'Customer Outreach'],
    color: 'from-rose-400 to-pink-500',
    provider: 'gemini',
    googleVoice: 'en-US-Journey-F',
  },
  {
    id: 'Leda',
    name: 'Leda',
    gender: 'female',
    accent: 'American',
    tone: 'Professional, Articulate, Steady',
    description: 'Steady and clear voice with executive presence.',
    bestFor: ['Executive Outreach', 'Consulting', 'Financial Services'],
    color: 'from-violet-500 to-purple-600',
    provider: 'gemini',
    googleVoice: 'en-US-Studio-O',
  },
  {
    id: 'Orus',
    name: 'Orus',
    gender: 'male',
    accent: 'American',
    tone: 'Confident, Direct, Professional',
    description: 'Confident and direct voice for assertive conversations.',
    bestFor: ['Sales Calls', 'Lead Qualification', 'Negotiations'],
    color: 'from-amber-500 to-orange-600',
    provider: 'gemini',
    googleVoice: 'en-US-Journey-D',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'female',
    accent: 'American',
    tone: 'Gentle, Reliable, Soothing',
    description: 'Gentle and reliable voice for sensitive conversations.',
    bestFor: ['Healthcare', 'Support Calls', 'Sensitive Topics'],
    color: 'from-teal-400 to-cyan-500',
    provider: 'gemini',
    googleVoice: 'en-US-Journey-O',
  },
];

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
  const [view, setView] = useState<'setup' | 'simulation'>('setup');
  const [mode, setMode] = useState<'text' | 'voice' | 'email'>('voice');
  const [selectedVoice, setSelectedVoice] = useState<string>('Fenrir');
  const [selectedPersona, setSelectedPersona] = useState<string>('neutral_dm');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(initialCampaignId);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [context, setContext] = useState<SimulationContext | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  }, [initialCampaignId]);

  // --- Data Fetching ---
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      
      // Generate TTS audio using the client portal voice API
      const response = await fetch('/api/client-portal/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
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
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="mb-4"
      >
        <Card className={cn(
          "border-l-4",
          msg.role === 'user' ? "border-l-blue-500 ml-8" : "border-l-amber-500 mr-8"
        )}>
           <CardHeader className="py-2 px-4 bg-muted/20 flex flex-row justify-between items-center rounded-t-lg">
             <div className="flex items-center gap-2">
               <div className="font-semibold text-sm">{msg.role === 'user' ? 'You' : 'AI Agent'}</div>
               <div className="text-xs text-muted-foreground">&lt;{msg.role === 'user' ? 'client@example.com' : 'ai@demandgentic.com'}&gt;</div>
             </div>
             <div className="text-xs text-muted-foreground">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
           </CardHeader>
           <CardContent className="p-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">
             {msg.content}
           </CardContent>
        </Card>
      </motion.div>
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
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className={cn('flex flex-col', align)}
      >
        <div className={cn('flex items-start gap-3 max-w-[85%]', msg.role === 'user' && 'flex-row-reverse')}>
          <div className={cn('p-2 rounded-full', bgColor)}>
            <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div className={cn('p-3 rounded-lg', bgColor, textColor)}>
            <p className="text-sm">{msg.content}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </motion.div>
    );
  };

  const SetupView = () => (
    <div className="flex flex-col items-center h-full p-4 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto">
      <Card className="w-full max-w-5xl shadow-xl">
        <CardHeader className="text-center py-3">
          <div className="flex justify-center items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-500" />
            <CardTitle className="text-xl font-bold">Simulation Studio</CardTitle>
          </div>
          <CardDescription className="text-xs">Configure and launch your AI agent simulation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5"><Target className="h-3 w-3" />Campaign</Label>
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={campaignsLoading ? "Loading..." : "Choose a campaign"} />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Interaction Mode</Label>
              <div className="grid grid-cols-3 gap-1.5">
                <Button variant={mode === 'voice' ? 'default' : 'outline'} onClick={() => setMode('voice')} className="flex items-center gap-1.5 h-9 text-xs"><Phone className="h-3 w-3" /> Voice</Button>
                <Button variant={mode === 'email' ? 'default' : 'outline'} onClick={() => setMode('email')} className="flex items-center gap-1.5 h-9 text-xs"><Mail className="h-3 w-3" /> Email</Button>
                <Button variant={mode === 'text' ? 'default' : 'outline'} onClick={() => setMode('text')} className="flex items-center gap-1.5 h-9 text-xs"><MessageSquare className="h-3 w-3" /> Text</Button>
              </div>
            </div>
          </div>

          {mode === 'voice' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3"
            >
              {/* Agent Voice Selection - Compact horizontal scroll */}
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Volume2 className="h-3 w-3 text-violet-600" />
                  Agent Voice
                </Label>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                  {AI_VOICES.map((voice) => (
                    <div
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice.id)}
                      className={cn(
                        "cursor-pointer rounded-lg border p-2 transition-all hover:shadow-sm flex-shrink-0 w-[120px]",
                        selectedVoice === voice.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "flex items-center justify-center w-7 h-7 rounded-full text-white text-xs bg-gradient-to-br flex-shrink-0",
                          voice.color
                        )}>
                          {voice.gender === 'male' ? <User className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-xs truncate">{voice.name}</span>
                            {selectedVoice === voice.id && <Zap className="h-2.5 w-2.5 text-primary fill-primary" />}
                          </div>
                          <span className="text-[10px] text-muted-foreground">{voice.tone.split(',')[0]}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator className="my-2" />

              {/* Prospect Persona Selection - Compact grid */}
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <UserCircle className="h-3 w-3 text-amber-600" />
                  Prospect Type
                </Label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {PROSPECT_PERSONAS.map((persona) => (
                    <div
                      key={persona.id}
                      onClick={() => setSelectedPersona(persona.id)}
                      className={cn(
                        "cursor-pointer rounded-lg border p-2 transition-all hover:shadow-sm",
                        selectedPersona === persona.id
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-500"
                          : "border-border hover:border-amber-400"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-medium text-xs truncate">{persona.name.split(' ')[0]}</span>
                        {selectedPersona === persona.id && <Zap className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />}
                      </div>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{persona.role}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <Button
            onClick={handleStart}
            disabled={!selectedCampaignId || startSimulationMutation.isPending}
            className="w-full h-10"
          >
            {startSimulationMutation.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            Start Simulation
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const SimulationView = () => (
    <div className="flex gap-3 h-full p-3">
      {/* Left Panel: Controls & Context - Fixed narrow width */}
      <Card className="w-56 flex-shrink-0 flex flex-col">
        <CardHeader className="py-3 px-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5"><Settings className="h-3.5 w-3.5" />Controls</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 flex-grow px-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Campaign</Label>
            <p className="font-medium text-xs truncate">{context?.campaignName}</p>
          </div>
          <Separator />
          <div>
            <Label className="text-xs flex items-center gap-1 text-muted-foreground"><Brain className="h-3 w-3" />AI Context</Label>
            <div className="text-xs space-y-0.5 mt-1">
              <p className="flex items-center gap-1 truncate"><Building2 className="h-3 w-3 flex-shrink-0" /> {context?.accountName || 'Generic Account'}</p>
              <p className="flex items-center gap-1 truncate"><UserCircle className="h-3 w-3 flex-shrink-0" /> {context?.contactName || 'Generic Contact'}</p>
            </div>
          </div>
          {mode === 'voice' && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="voice-output" className="text-xs">Voice Output</Label>
                  <Switch id="voice-output" checked={voiceOutputEnabled} onCheckedChange={setVoiceOutputEnabled} className="scale-90" />
                </div>
                <div className="text-center pt-2">
                  <Button
                    size="lg"
                    className={cn("rounded-full h-14 w-14", isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600')}
                    onClick={isListening ? stopListening : startListening}
                  >
                    <Mic className="h-6 w-6" />
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1.5">{isListening ? "Listening..." : "Tap to speak"}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Right Panel: Chat/Transcript/Email - Takes remaining space */}
      <Card className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900/50">
        <CardHeader className="border-b bg-card py-2.5 px-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            {mode === 'email' ? <Mail className="h-4 w-4" /> : <History className="h-4 w-4" />} 
            {mode === 'email' ? "Email Thread" : "Conversation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-3">
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="space-y-3 pr-2">
              {messages.map(renderMessage)}
              {chatMutation.isPending && renderMessage({ role: 'assistant', content: '...', timestamp: new Date() }, messages.length)}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="p-3 border-t bg-card">
          <div className="relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={mode === 'voice' ? "Listening..." : mode === 'email' ? "Write a reply..." : "Type your message..."}
              className="pr-10 h-9 text-sm"
              disabled={chatMutation.isPending || (mode === 'voice' && isListening)}
            />
            <Button
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => handleSend()}
              disabled={chatMutation.isPending || !input.trim()}
            >
              {chatMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] max-h-[700px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-4 py-2.5 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            AI Simulation Studio
          </DialogTitle>
          <DialogDescription className="text-xs">
            Test your AI agents in a realistic environment
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-muted/20">
          {view === 'setup' ? <SetupView /> : <SimulationView />}
        </div>
      </DialogContent>
    </Dialog>
  );
}