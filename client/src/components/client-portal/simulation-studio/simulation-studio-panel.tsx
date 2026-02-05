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
import { Bot, Send, Loader2, User, Sparkles, Phone, MessageSquare, Mic, MicOff, Volume2, VolumeX, Play, Square, RefreshCw, Building2, UserCircle, Target, Brain, Zap, Info, X, Settings, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [mode, setMode] = useState<'text' | 'voice'>('voice');
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
        body: JSON.stringify({ campaignId: selectedCampaignId, mode }),
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

  // --- Speech Synthesis & Recognition ---
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    stopListening();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (view === 'simulation') startListening();
    };
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
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
    window.speechSynthesis.cancel();
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
  const renderMessage = (msg: Message, index: number) => {
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
    <div className="flex flex-col items-center justify-center h-full p-8 bg-gray-50 dark:bg-gray-900/50">
      <Card className="w-full max-w-lg shadow-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-2">
            <Sparkles className="h-8 w-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl font-bold">Simulation Studio</CardTitle>
          <CardDescription>Configure and launch your AI agent simulation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="font-medium flex items-center gap-2"><Target className="h-4 w-4" />Campaign</Label>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder={campaignsLoading ? "Loading..." : "Choose a campaign"} />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label className="font-medium">Interaction Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={mode === 'voice' ? 'default' : 'outline'} onClick={() => setMode('voice')} className="flex items-center gap-2 h-12"><Phone /> Voice Call</Button>
              <Button variant={mode === 'text' ? 'default' : 'outline'} onClick={() => setMode('text')} className="flex items-center gap-2 h-12"><MessageSquare /> Text Chat</Button>
            </div>
          </div>
          <Button
            onClick={handleStart}
            disabled={!selectedCampaignId || startSimulationMutation.isPending}
            className="w-full h-12 text-lg"
            size="lg"
          >
            {startSimulationMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2" />}
            Start Simulation
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const SimulationView = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full p-4">
      {/* Left Panel: Controls & Context */}
      <Card className="md:col-span-1 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span><Settings className="inline-block mr-2" />Controls</span>
            <Button variant="ghost" size="icon" onClick={handleReset}><RefreshCw className="h-4 w-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 flex-grow">
          <div className="space-y-2">
            <Label>Campaign</Label>
            <p className="font-semibold text-sm">{context?.campaignName}</p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Brain className="h-4 w-4" />AI Context</Label>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><Building2 className="inline-block h-3 w-3 mr-1" /> {context?.accountName || 'Generic Account'}</p>
              <p><UserCircle className="inline-block h-3 w-3 mr-1" /> {context?.contactName || 'Generic Contact'}</p>
            </div>
          </div>
          <Separator />
          {mode === 'voice' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="voice-output">Voice Output</Label>
                <Switch id="voice-output" checked={voiceOutputEnabled} onCheckedChange={setVoiceOutputEnabled} />
              </div>
              <div className="text-center">
                <Button
                  size="lg"
                  className={cn("rounded-full h-20 w-20", isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600')}
                  onClick={isListening ? stopListening : startListening}
                >
                  <Mic className="h-8 w-8" />
                </Button>
                <p className="text-sm text-muted-foreground mt-2">{isListening ? "Listening..." : "Tap to speak"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right Panel: Chat/Transcript */}
      <Card className="md:col-span-2 flex flex-col h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="inline-block" /> Conversation Transcript</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map(renderMessage)}
              {chatMutation.isPending && renderMessage({ role: 'assistant', content: '...', timestamp: new Date() }, messages.length)}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="p-4 border-t">
          <div className="relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={mode === 'voice' ? "Listening..." : "Type your message..."}
              className="pr-12"
              disabled={chatMutation.isPending || (mode === 'voice' && isListening)}
            />
            <Button
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
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