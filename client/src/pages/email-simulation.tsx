/**
 * Email Simulation Page
 * Standalone page for testing AI email generation and response simulation.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PageLayout } from '@/components/layout/page-layout';
import {
  Bot, Send, Loader2, User, Sparkles, Mail, Play, RefreshCw,
  Building2, UserCircle, Target, Brain, Zap, Info, X, Settings,
  History, ArrowLeft, Home, ChevronRight, Wand2, Copy, Check, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { sanitizeHtmlForIframePreview } from '@/lib/html-preview';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
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
}

const EMAIL_TYPES = [
  { value: 'cold_outreach', label: 'Cold Outreach', description: 'First touch to prospects' },
  { value: 'follow_up', label: 'Follow Up', description: 'After initial contact' },
  { value: 'meeting_request', label: 'Meeting Request', description: 'Request for a call' },
  { value: 'nurture', label: 'Nurture', description: 'Value-add content' },
  { value: 'breakup', label: 'Breakup', description: 'Final outreach' },
];

export default function EmailSimulationPage() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<'setup' | 'simulation'>('setup');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>();
  const [personaPreset, setPersonaPreset] = useState<string>('cold_outreach');
  const [context, setContext] = useState<SimulationContext | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
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
    },
    onError: (error: Error) => {
      setMessages([{ role: 'error', content: `⚠️ ${error.message}`, timestamp: new Date() }]);
    },
  });

  // Chat mutation (email reply)
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
    },
    onError: (error: Error) => {
      setMessages(prev => [...prev, { role: 'error', content: `⚠️ ${error.message}`, timestamp: new Date() }]);
    },
  });

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
    setMessages([]);
    setSessionId(null);
    setContext(null);
    setView('setup');
  };

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
          "border-l-4 bg-white/5 border-white/10",
          msg.role === 'user' ? "border-l-blue-500 ml-8" : "border-l-amber-500 mr-8"
        )}>
          <CardHeader className="py-2 px-4 bg-white/5 flex flex-row justify-between items-center rounded-t-lg">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-sm text-white">{msg.role === 'user' ? 'You (Prospect)' : 'AI Agent'}</div>
              <div className="text-xs text-white/40">&lt;{msg.role === 'user' ? 'prospect@company.com' : 'agent@demandgentic.com'}&gt;</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(msg.content, `email-${index}`)}
                className="h-6 text-white/40 hover:text-white hover:bg-white/10"
              >
                {copiedField === `email-${index}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
              <div className="text-xs text-white/40">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </CardHeader>
          <CardContent className="p-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/80">
            {msg.content}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const SetupView = () => (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Card className="w-full max-w-2xl shadow-2xl bg-white/5 border-white/10 backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Mail className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white">Email Simulation Studio</CardTitle>
          <CardDescription className="text-white/60">Test AI email responses in realistic conversation threads.</CardDescription>
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
            <Label className="font-medium text-white/70">Email Type</Label>
            <div className="grid grid-cols-1 gap-2">
              {EMAIL_TYPES.map(type => (
                <button
                  key={type.value}
                  onClick={() => setPersonaPreset(type.value)}
                  className={cn(
                    "w-full p-3 rounded-xl border text-left transition-all duration-200",
                    personaPreset === type.value
                      ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/50"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{type.label}</span>
                    {personaPreset === type.value && <Zap className="h-4 w-4 text-blue-400 fill-blue-400" />}
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleStart}
            disabled={!selectedCampaignId || startSimulationMutation.isPending}
            className="w-full h-12 text-lg bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/25"
            size="lg"
          >
            {startSimulationMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : <Wand2 className="mr-2" />}
            Start Email Simulation
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const SimulationView = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full p-4">
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
            <Label className="text-white/50">Email Type</Label>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
              {EMAIL_TYPES.find(t => t.value === personaPreset)?.label}
            </Badge>
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
          <div className="space-y-2">
            <Label className="text-white/50">Quick Replies</Label>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setInput("I'm interested, can you tell me more?");
                  inputRef.current?.focus();
                }}
              >
                <Sparkles className="h-3 w-3 mr-2" />
                Show interest
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setInput("What's the pricing like?");
                  inputRef.current?.focus();
                }}
              >
                <Sparkles className="h-3 w-3 mr-2" />
                Ask about pricing
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setInput("I'm not interested at this time.");
                  inputRef.current?.focus();
                }}
              >
                <Sparkles className="h-3 w-3 mr-2" />
                Decline
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right Panel: Email Thread */}
      <Card className="md:col-span-3 flex flex-col h-full bg-white/5 border-white/10">
        <CardHeader className="border-b border-white/10">
          <CardTitle className="flex items-center gap-2 text-white">
            <Mail className="h-5 w-5" />
            Email Thread
            <Badge className="ml-auto bg-white/10 text-white/60">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden p-6">
          <ScrollArea className="h-full pr-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map(renderEmail)}
              {chatMutation.isPending && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-white/50 p-4"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI is composing a reply...
                </motion.div>
              )}
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
              placeholder="Write a reply as the prospect..."
              className="pr-12 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              disabled={chatMutation.isPending}
            />
            <Button
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 bg-blue-500 hover:bg-blue-600"
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
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
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
            <span className="text-white font-medium">Email Simulation</span>
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

              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Email Simulation</h1>
                <p className="text-xs text-white/50">Test AI email responses in realistic threads</p>
              </div>
            </div>

            {view === 'simulation' && (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                <Mail className="h-3 w-3 mr-1" />
                {EMAIL_TYPES.find(t => t.value === personaPreset)?.label}
              </Badge>
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
