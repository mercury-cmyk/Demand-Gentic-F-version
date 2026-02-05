/**
 * Client Portal Email Simulation Page
 * Allows client users to test AI email generation in realistic conversation threads.
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
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import {
  Bot, Send, Loader2, User, Sparkles, Mail, Play, RefreshCw,
  Building2, UserCircle, Target, Brain, Zap, Info, X, Settings,
  History, Wand2, Copy, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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
}

const EMAIL_TYPES = [
  { value: 'cold_outreach', label: 'Cold Outreach', description: 'First touch to prospects' },
  { value: 'follow_up', label: 'Follow Up', description: 'After initial contact' },
  { value: 'meeting_request', label: 'Meeting Request', description: 'Request for a call' },
  { value: 'nurture', label: 'Nurture', description: 'Value-add content' },
  { value: 'breakup', label: 'Breakup', description: 'Final outreach' },
];

export default function ClientPortalEmailSimulationPage() {
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

  // Get client portal token
  const getAuthHeaders = () => {
    const token = localStorage.getItem('clientPortalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Fetch client's campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/client-portal/campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns || [];
    },
  });

  // Start simulation mutation
  const startSimulationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId) throw new Error('Please select a campaign.');
      const res = await fetch('/api/client-portal/simulation/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          emailType: personaPreset,
          personaPreset: 'neutral_dm',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start simulation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSessionId(data.session?.id);
      setContext({
        campaignId: selectedCampaignId!,
        campaignName: data.agentContext?.agentName || 'Campaign',
        accountName: 'Simulated Account',
        contactName: 'Simulated Contact',
      });
      const firstMsg: Message = {
        role: 'assistant',
        content: data.session?.transcript?.[0]?.content || 'Hello, how can I help you today?',
        timestamp: new Date(),
      };
      setMessages([firstMsg]);
      setView('simulation');
    },
    onError: (error: Error) => {
      setMessages([{ role: 'error', content: `${error.message}`, timestamp: new Date() }]);
    },
  });

  // Chat mutation (email reply)
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const res = await fetch('/api/client-portal/simulation/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          sessionId,
          humanMessage: userMessage,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to get response');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.agentResponse,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: (error: Error) => {
      setMessages((prev) => [...prev, { role: 'error', content: `${error.message}`, timestamp: new Date() }]);
    },
  });

  const handleSend = useCallback(
    (text?: string) => {
      const messageText = (text || input).trim();
      if (!messageText || chatMutation.isPending) return;
      const userMessage: Message = { role: 'user', content: messageText, timestamp: new Date() };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      chatMutation.mutate(messageText);
    },
    [input, chatMutation]
  );

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
        transition={{ duration: 0.3 }}
        className="mb-4"
      >
        <Card
          className={cn(
            'border-l-4',
            msg.role === 'user' ? 'border-l-blue-500 ml-8' : 'border-l-amber-500 mr-8'
          )}
        >
          <CardHeader className="py-2 px-4 bg-muted/50 flex flex-row justify-between items-center rounded-t-lg">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-sm">{msg.role === 'user' ? 'You (Prospect)' : 'AI Agent'}</div>
              <div className="text-xs text-muted-foreground">
                &lt;{msg.role === 'user' ? 'prospect@company.com' : 'agent@demandgentic.com'}&gt;
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleCopy(msg.content, `email-${index}`)} className="h-6">
                {copiedField === `email-${index}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
              <div className="text-xs text-muted-foreground">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">{msg.content}</CardContent>
        </Card>
      </motion.div>
    );
  };

  const SetupView = () => (
    <div className="flex flex-col items-center justify-center p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <Mail className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Email Simulation Studio</CardTitle>
          <CardDescription>Test AI email responses in realistic conversation threads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Select Campaign
            </Label>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder={campaignsLoading ? 'Loading campaigns...' : 'Choose a campaign'} />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="font-medium">Email Type</Label>
            <div className="grid grid-cols-1 gap-2">
              {EMAIL_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setPersonaPreset(type.value)}
                  className={cn(
                    'w-full p-3 rounded-xl border text-left transition-all duration-200',
                    personaPreset === type.value
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{type.label}</span>
                    {personaPreset === type.value && <Zap className="h-4 w-4 text-primary fill-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleStart}
            disabled={!selectedCampaignId || startSimulationMutation.isPending}
            className="w-full h-12 text-lg"
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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">
      {/* Left Panel: Controls */}
      <Card className="md:col-span-1 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Controls
            </span>
            <Button variant="ghost" size="icon" onClick={handleReset}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 flex-grow">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Campaign</Label>
            <p className="font-semibold text-sm">{context?.campaignName}</p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-muted-foreground">Email Type</Label>
            <Badge variant="secondary">{EMAIL_TYPES.find((t) => t.value === personaPreset)?.label}</Badge>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-muted-foreground">
              <Brain className="h-4 w-4" />
              AI Context
            </Label>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <Building2 className="inline-block h-3 w-3 mr-1" /> {context?.accountName || 'Generic Account'}
              </p>
              <p>
                <UserCircle className="inline-block h-3 w-3 mr-1" /> {context?.contactName || 'Generic Contact'}
              </p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-muted-foreground">Quick Replies</Label>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
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
                className="w-full justify-start"
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
                className="w-full justify-start"
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
      <Card className="md:col-span-3 flex flex-col h-[600px]">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Thread
            <Badge className="ml-auto" variant="secondary">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden p-6">
          <ScrollArea className="h-full pr-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map(renderEmail)}
              {chatMutation.isPending && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI is composing a reply...
                </motion.div>
              )}
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
              placeholder="Write a reply as the prospect..."
              disabled={chatMutation.isPending}
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

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Email Simulation</h1>
          <p className="text-muted-foreground">Test AI email responses in realistic conversation threads</p>
        </div>
        {view === 'setup' ? <SetupView /> : <SimulationView />}
      </div>
    </ClientPortalLayout>
  );
}
