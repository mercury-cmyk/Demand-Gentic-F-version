/**
 * Voice Simulation Page
 * Standalone page for testing AI voice agents in realistic scenarios.
 * Uses the same simulation backend as the client portal but with admin campaigns.
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
import { PageLayout } from '@/components/layout/page-layout';
import {
  Bot, Send, Loader2, User, Sparkles, Phone, Mic, MicOff, Volume2,
  Play, Square, RefreshCw, Building2, UserCircle, Target, Brain,
  Zap, Info, X, Settings, History, ArrowLeft, Home, ChevronRight,
  PhoneCall, Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';

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

export default function VoiceSimulationPage() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<'setup' | 'simulation'>('setup');
  const [selectedVoice, setSelectedVoice] = useState<string>('Puck');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [context, setContext] = useState<SimulationContext | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch campaigns for admin
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/campaigns?limit=100');
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns || [];
    },
  });

  // Start simulation mutation
  const startSimulationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId) throw new Error("A campaign must be selected.");
      const res = await apiRequest('POST', '/api/simulations/start', {
        campaignId: selectedCampaignId,
        personaPreset: 'neutral_dm', maxTurns: 20, simulationSpeed: 'fast'
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to start simulation');
      return res.json();
    },
    onSuccess: (data) => {
      setSessionId(data.session?.id);
      setContext({ campaignId: selectedCampaignId!, campaignName: data.agentContext?.agentName || 'Campaign', accountName: 'Simulated Account', contactName: 'Simulated Contact' });
      const firstMsg: Message = {
        role: 'assistant',
        content: (data.session?.transcript?.[0]?.content || 'Hello, how can I help you today?'),
        timestamp: new Date(),
      };
      setMessages([firstMsg]);
      setView('simulation');
      if (voiceOutputEnabled) {
        speak((data.session?.transcript?.[0]?.content || 'Hello, how can I help you today?'));
      }
    },
    onError: (error: Error) => {
      setMessages([{ role: 'error', content: `⚠️ ${error.message}`, timestamp: new Date() }]);
    },
  });

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const res = await apiRequest('POST', '/api/simulations/message', {
        sessionId,
        humanMessage: userMessage,
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to get response');
      return res.json();
    },
    onSuccess: (data) => {
      const assistantMessage: Message = { role: 'assistant', content: data.agentResponse, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMessage]);
      if (voiceOutputEnabled) {
        speak(data.agentResponse);
      }
    },
    onError: (error: Error) => {
      setMessages(prev => [...prev, { role: 'error', content: `⚠️ ${error.message}`, timestamp: new Date() }]);
    },
  });

  // Audio player ref for TTS playback
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Speech Synthesis using Google Cloud TTS API (mapped to selected Gemini voice)
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
      
      // Generate TTS audio using the voice-providers API
      const response = await apiRequest('POST', '/api/voice-providers/tts', {
        text,
        voiceId: selectedVoice,
        provider: 'gemini',
      });

      if (!response.ok) {
        // Fallback to browser speech synthesis if API fails
        console.warn('[VoiceSim] TTS API failed, using browser fallback');
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
        console.error('[VoiceSim] Audio playback error');
      };

      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error('[VoiceSim] TTS error:', error);
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const renderMessage = (msg: Message, index: number) => {
    const Icon = { user: User, assistant: Bot, system: Info, error: X }[msg.role];
    const bgColor = {
      user: 'bg-purple-500/20',
      assistant: 'bg-white/10',
      system: 'bg-yellow-500/20',
      error: 'bg-red-500/20',
    }[msg.role];
    const align = msg.role === 'user' ? 'items-end' : 'items-start';

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
            <Icon className="h-5 w-5 text-white/70" />
          </div>
          <div className={cn('p-4 rounded-2xl', bgColor, msg.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md')}>
            <p className="text-sm text-white">{msg.content}</p>
            <p className="text-xs text-white/40 mt-2 text-right">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </motion.div>
    );
  };

  const SetupView = () => (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Card className="w-full max-w-4xl shadow-2xl bg-white/5 border-white/10 backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Phone className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white">Voice Simulation Studio</CardTitle>
          <CardDescription className="text-white/60">Configure and test your AI voice agent in realistic call scenarios.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="font-medium text-white/70 flex items-center gap-2"><Target className="h-4 w-4" />Select Campaign</Label>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder={campaignsLoading ? "Loading campaigns..." : "Choose a campaign to simulate"} />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/10">
                {campaigns.map((c: any) => (
                  <SelectItem key={c.id} value={c.id} className="text-white focus:bg-white/10">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="font-medium text-white/70">Select Agent Voice</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {AI_VOICES.map((voice) => (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={cn(
                    "cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md relative overflow-hidden group",
                    selectedVoice === voice.id
                      ? "border-purple-500/50 bg-purple-500/10 ring-1 ring-purple-500"
                      : "border-white/10 hover:border-purple-500/30 bg-white/5"
                  )}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${voice.color} opacity-[0.03] group-hover:opacity-[0.08] transition-opacity`} />
                  <div className="relative flex items-start gap-4">
                    <div className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-full text-white shadow-sm bg-gradient-to-br",
                      voice.color
                    )}>
                      {voice.gender === 'male' ? <User className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold text-sm text-white truncate">{voice.name}</h4>
                        {selectedVoice === voice.id && (
                          <Zap className="h-3 w-3 text-purple-400 fill-purple-400 animate-pulse" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 bg-white/10">{voice.accent}</Badge>
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] h-4 border-white/20">{voice.gender}</Badge>
                      </div>
                      <p className="text-xs text-white/40 line-clamp-2">{voice.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={handleStart}
            disabled={!selectedCampaignId || startSimulationMutation.isPending}
            className="w-full h-12 text-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25"
            size="lg"
          >
            {startSimulationMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2" />}
            Start Voice Simulation
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const SimulationView = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full p-4">
      {/* Left Panel: Controls */}
      <Card className="md:col-span-1 flex flex-col bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-white">
            <span className="flex items-center gap-2"><Settings className="h-5 w-5" />Controls</span>
            <Button variant="ghost" size="icon" onClick={handleReset} className="text-white/70 hover:text-white hover:bg-white/10">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 flex-grow">
          <div className="space-y-2">
            <Label className="text-white/50">Campaign</Label>
            <p className="font-semibold text-sm text-white">{context?.campaignName}</p>
          </div>
          <Separator className="bg-white/10" />
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-white/50"><Brain className="h-4 w-4" />AI Context</Label>
            <div className="text-sm text-white/60 space-y-1">
              <p><Building2 className="inline-block h-3 w-3 mr-1" /> {context?.accountName || 'Generic Account'}</p>
              <p><UserCircle className="inline-block h-3 w-3 mr-1" /> {context?.contactName || 'Generic Contact'}</p>
            </div>
          </div>
          <Separator className="bg-white/10" />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="voice-output" className="text-white/70">Voice Output</Label>
              <Switch id="voice-output" checked={voiceOutputEnabled} onCheckedChange={setVoiceOutputEnabled} />
            </div>
            <div className="text-center pt-4">
              <Button
                size="lg"
                className={cn(
                  "rounded-full h-20 w-20 transition-all",
                  isListening
                    ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30'
                    : 'bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30'
                )}
                onClick={isListening ? stopListening : startListening}
              >
                <Mic className="h-8 w-8" />
              </Button>
              <p className="text-sm text-white/50 mt-3">{isListening ? "Listening..." : "Tap to speak"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right Panel: Transcript */}
      <Card className="md:col-span-2 flex flex-col h-full bg-white/5 border-white/10">
        <CardHeader className="border-b border-white/10">
          <CardTitle className="flex items-center gap-2 text-white">
            <History className="h-5 w-5" />
            Conversation Transcript
            {isSpeaking && (
              <Badge className="ml-auto bg-green-500/20 text-green-400 border-green-500/30">
                <Volume2 className="h-3 w-3 mr-1 animate-pulse" />
                Speaking
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden p-6">
          <ScrollArea className="h-full pr-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map(renderMessage)}
              {chatMutation.isPending && renderMessage({ role: 'assistant', content: '...', timestamp: new Date() }, messages.length)}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="p-4 border-t border-white/10">
          <div className="relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isListening ? "Listening..." : "Type your message or use voice..."}
              className="pr-12 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              disabled={chatMutation.isPending || isListening}
            />
            <Button
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 bg-purple-500 hover:bg-purple-600"
              onClick={() => handleSend()}
              disabled={chatMutation.isPending || !input.trim()}
            >
              {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <PageLayout className="bg-[#0a0a0f] h-screen overflow-hidden">
      {/* Gradient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 text-sm mb-3">
            <button
              onClick={() => setLocation('/')}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Home</span>
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-white/30" />
            <span className="text-white font-medium">Voice Simulation</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.history.back()}
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Voice Simulation</h1>
                <p className="text-xs text-white/50">Test AI voice agents in realistic call scenarios</p>
              </div>
            </div>

            {view === 'simulation' && (
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl",
                  isSpeaking
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : isListening
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-white/5 text-white/60 border border-white/10"
                )}>
                  {isSpeaking ? (
                    <>
                      <Radio className="h-4 w-4 animate-pulse" />
                      <span className="text-sm font-medium">AI Speaking</span>
                    </>
                  ) : isListening ? (
                    <>
                      <Mic className="h-4 w-4 animate-pulse" />
                      <span className="text-sm font-medium">Listening</span>
                    </>
                  ) : (
                    <>
                      <PhoneCall className="h-4 w-4" />
                      <span className="text-sm font-medium">Call Active</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 overflow-hidden">
        {view === 'setup' ? <SetupView /> : <SimulationView />}
      </div>
    </PageLayout>
  );
}
