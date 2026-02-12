/**
 * Preview Studio - Beautiful AI Agent Preview Experience
 *
 * A fully functional preview studio that allows clients to:
 * - Experience their AI agent in real-time
 * - Test voice and text conversations
 * - See live transcription
 * - Preview different scenarios
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Bot, Send, Loader2, User, Sparkles, Phone, MessageSquare,
  Mic, MicOff, Volume2, VolumeX, Play, Square, RefreshCw,
  Building2, UserCircle, Target, Brain, Zap, Info, X, Settings,
  Waveform, PhoneCall, PhoneOff, Pause, SkipForward, Clock,
  ChevronRight, Headphones, Radio, CircleDot, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
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

interface PreviewStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedCampaignId?: string;
}


// Audio visualization component
function AudioVisualizer({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className={cn(
            'w-1 rounded-full',
            isActive ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
          animate={{
            height: isActive ? [8, 24, 8] : 8,
          }}
          transition={{
            duration: 0.5,
            repeat: isActive ? Infinity : 0,
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  );
}

// Call status indicator
function CallStatusIndicator({ status }: { status: 'idle' | 'connecting' | 'connected' | 'ended' }) {
  const statusConfig = {
    idle: { color: 'bg-muted', text: 'Ready', icon: Phone },
    connecting: { color: 'bg-yellow-500', text: 'Connecting...', icon: PhoneCall },
    connected: { color: 'bg-green-500', text: 'Connected', icon: Activity },
    ended: { color: 'bg-red-500', text: 'Call Ended', icon: PhoneOff },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <div className={cn('w-3 h-3 rounded-full', config.color, status === 'connected' && 'animate-pulse')} />
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{config.text}</span>
    </div>
  );
}

interface Account {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
}

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
}

export function PreviewStudio({ open, onOpenChange, preselectedCampaignId }: PreviewStudioProps) {
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(preselectedCampaignId || '');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [simulationStarted, setSimulationStarted] = useState(false);
  const [context, setContext] = useState<SimulationContext | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for state tracking
  const isSpeakingRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);
  const isWaitingForResponseRef = useRef<boolean>(false);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch client's campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['client-portal-preview-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/qualified-leads/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    enabled: open,
  });

  // Fetch accounts for selected campaign
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['/api/knowledge-blocks/campaigns', selectedCampaignId, 'accounts'],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const res = await fetch(`/api/knowledge-blocks/campaigns/${selectedCampaignId}/accounts`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.accounts || [];
    },
    enabled: !!selectedCampaignId && open,
  });

  // Fetch contacts for selected account
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ['/api/knowledge-blocks/accounts', selectedAccountId, 'contacts'],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const res = await fetch(`/api/knowledge-blocks/accounts/${selectedAccountId}/contacts`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.contacts || [];
    },
    enabled: !!selectedAccountId && open,
  });

  // Get selected entities for display
  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const selectedContact = contacts.find(c => c.id === selectedContactId);

  // Set preselected campaign when campaigns load
  useEffect(() => {
    if (preselectedCampaignId && campaigns.length > 0) {
      setSelectedCampaignId(preselectedCampaignId);
    }
  }, [preselectedCampaignId, campaigns]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          if (isSpeakingRef.current) return;

          const result = event.results[event.resultIndex];
          const text = result[0].transcript;
          setInput(text);

          if (result.isFinal) {
            isWaitingForResponseRef.current = true;
            handleSend(text);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);

          if (event.error === 'not-allowed') {
            addSystemMessage('Microphone access denied. Please allow microphone access to use voice mode.');
          }
        };

        recognition.onend = () => {
          if (isSpeakingRef.current || isWaitingForResponseRef.current) return;

          if (mode === 'voice' && simulationStarted && !isSpeakingRef.current) {
            try {
              recognition.start();
            } catch (e) {
              setIsListening(false);
            }
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, [mode, simulationStarted]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Keep refs in sync
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  // Call duration timer
  useEffect(() => {
    if (callStatus === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callStatus]);

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const res = await fetch('/api/client-portal/simulation/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          sessionId,
          campaignId: selectedCampaignId,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          userMessage,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to get response');
      }

      return res.json();
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
        sentiment: analyzeSentiment(data.reply),
      };
      setMessages(prev => [...prev, assistantMessage]);

      if (data.sessionId) setSessionId(data.sessionId);
      if (data.context) setContext(data.context);

      isWaitingForResponseRef.current = false;

      if (voiceOutputEnabled && mode === 'voice') {
        speak(data.reply);
      }
    },
    onError: (error: Error) => {
      addSystemMessage(`Error: ${error.message}`);
      isWaitingForResponseRef.current = false;
    },
  });

  // Start simulation mutation
  const startSimulationMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/simulation/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          accountId: selectedAccountId,
          contactId: selectedContactId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to start simulation');
      }

      return res.json();
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      const contactName = selectedContact
        ? `${selectedContact.firstName || ''} ${selectedContact.lastName || ''}`.trim() || 'Contact'
        : data.context?.contactName || 'Simulated Contact';
      setContext({
        ...data.context,
        accountName: selectedAccount?.name || data.context?.accountName || 'Account',
        contactName,
        contactTitle: selectedContact?.jobTitle || data.context?.contactTitle,
      });
      setSimulationStarted(true);
      setCallStatus('connected');
      setCallDuration(0);

      if (data.firstMessage) {
        const firstMsg: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: data.firstMessage,
          timestamp: new Date(),
        };
        setMessages([firstMsg]);

        if (voiceOutputEnabled && mode === 'voice') {
          speak(data.firstMessage);
        }
      }
    },
    onError: (error: Error) => {
      addSystemMessage(`Failed to start: ${error.message}`);
      setCallStatus('idle');
    },
  });

  const addSystemMessage = (content: string) => {
    const msg: Message = {
      id: `msg-${Date.now()}`,
      role: 'system',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, msg]);
  };

  const analyzeSentiment = (text: string): 'positive' | 'neutral' | 'negative' => {
    const positiveWords = ['yes', 'great', 'interested', 'sounds good', 'tell me more', 'absolutely'];
    const negativeWords = ['no', 'not interested', 'busy', 'don\'t', 'can\'t', 'sorry'];

    const lower = text.toLowerCase();
    if (positiveWords.some(w => lower.includes(w))) return 'positive';
    if (negativeWords.some(w => lower.includes(w))) return 'negative';
    return 'neutral';
  };

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;

    if (recognitionRef.current && isListeningRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }
    isSpeakingRef.current = true;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      isWaitingForResponseRef.current = false;

      setTimeout(() => {
        if (mode === 'voice' && simulationStarted && recognitionRef.current && !isSpeakingRef.current) {
          try {
            recognitionRef.current.start();
            setIsListening(true);
          } catch (e) { /* ignore */ }
        }
      }, 300);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    };

    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const startListening = async () => {
    if (recognitionRef.current && !isListening) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        recognitionRef.current.start();
        setIsListening(true);
        setInput('');
      } catch (err: any) {
        addSystemMessage(
          err.name === 'NotAllowedError'
            ? 'Microphone access denied.'
            : 'Failed to start voice recognition.'
        );
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleSend = useCallback((text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || chatMutation.isPending) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
      isVoice: mode === 'voice' && isListening,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    chatMutation.mutate(messageText);
  }, [input, chatMutation, mode, isListening]);

  const handleStartSimulation = () => {
    if (!selectedCampaignId) return;
    setMessages([]);
    setCallStatus('connecting');
    startSimulationMutation.mutate();
  };

  const handleEndCall = () => {
    stopListening();
    stopSpeaking();
    setCallStatus('ended');
    addSystemMessage('Call ended. You can reset to start a new simulation.');
  };

  const handleReset = () => {
    if (recognitionRef.current && isListening) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }
    setIsListening(false);
    isSpeakingRef.current = false;
    isWaitingForResponseRef.current = false;
    setMessages([]);
    setSessionId(null);
    setContext(null);
    setSimulationStarted(false);
    setCallStatus('idle');
    setCallDuration(0);
    stopSpeaking();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[100vw] p-0 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-fuchsia-500/10">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div>
                  <SheetTitle className="text-xl">Preview Studio</SheetTitle>
                  <SheetDescription>
                    Experience your AI agent in action
                  </SheetDescription>
                </div>
              </div>
              {simulationStarted && (
                <div className="flex items-center gap-3">
                  <CallStatusIndicator status={callStatus} />
                  {callStatus === 'connected' && (
                    <Badge variant="outline" className="font-mono">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatDuration(callDuration)}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </SheetHeader>
        </div>

        {!simulationStarted ? (
          /* Setup Screen */
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Campaign Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Select Campaign
                </Label>
                <Select value={selectedCampaignId} onValueChange={(v) => { setSelectedCampaignId(v); setSelectedAccountId(undefined); setSelectedContactId(undefined); }}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder={campaignsLoading ? "Loading..." : "Choose a campaign"} />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        <div className="flex items-center gap-2">
                          <span>{campaign.name}</span>
                          <Badge variant="outline" className="text-xs">{campaign.status}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Account & Contact Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Account & Contact
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    value={selectedAccountId}
                    onValueChange={(v) => { setSelectedAccountId(v); setSelectedContactId(undefined); }}
                    disabled={!selectedCampaignId}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={accountsLoading ? "Loading..." : "Select account"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex flex-col">
                            <span>{account.name}</span>
                            {account.industry && <span className="text-xs text-muted-foreground">{account.industry}</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedContactId}
                    onValueChange={setSelectedContactId}
                    disabled={!selectedAccountId}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={contactsLoading ? "Loading..." : "Select contact"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          <div className="flex flex-col">
                            <span>{contact.firstName} {contact.lastName}</span>
                            {contact.jobTitle && <span className="text-xs text-muted-foreground">{contact.jobTitle}</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* What to Expect */}
              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm mb-2">What you'll experience:</p>
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <Brain className="h-3.5 w-3.5 text-blue-500" />
                          AI agent with your campaign's intelligence
                        </li>
                        <li className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-blue-500" />
                          Account-aware conversations
                        </li>
                        <li className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-blue-500" />
                          Real-time objection handling
                        </li>
                        <li className="flex items-center gap-2">
                          <UserCircle className="h-3.5 w-3.5 text-blue-500" />
                          Personalized engagement
                        </li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Start Button */}
              <Button
                onClick={handleStartSimulation}
                disabled={!selectedCampaignId || startSimulationMutation.isPending}
                className="col-span-1 md:col-span-2 mt-4 w-full h-14 text-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-xl shadow-violet-500/20"
                size="lg"
              >
                {startSimulationMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Start Simulation
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Active Simulation */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Context Bar */}
            {context && (
              <div className="px-4 py-3 bg-muted/30 border-b">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200">
                    <Target className="h-3 w-3 mr-1" />
                    {context.campaignName}
                  </Badge>
                  {context.accountName && (
                    <Badge variant="outline">
                      <Building2 className="h-3 w-3 mr-1" />
                      {context.accountName}
                    </Badge>
                  )}
                  {context.contactName && (
                    <Badge variant="outline">
                      <UserCircle className="h-3 w-3 mr-1" />
                      {context.contactName}
                      {context.contactTitle && (
                        <span className="text-muted-foreground ml-1">({context.contactTitle})</span>
                      )}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Messages Area */}
            <ScrollArea ref={scrollRef} className="flex-1 px-4">
              <div className="py-4 space-y-4">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'flex gap-3',
                      message.role === 'user' ? 'flex-row-reverse' : ''
                    )}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="h-9 w-9 border-2 border-violet-200 dark:border-violet-800">
                        <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {message.role === 'user' && (
                      <Avatar className="h-9 w-9 border-2 border-primary/20">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-3 max-w-[80%] shadow-sm',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : message.role === 'system'
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
                          : 'bg-white dark:bg-zinc-800 border rounded-tl-sm'
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {message.isVoice && (
                          <Mic className="h-3 w-3 opacity-50" />
                        )}
                        {message.sentiment && message.role === 'user' && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs py-0',
                              message.sentiment === 'positive' && 'border-green-300 text-green-600',
                              message.sentiment === 'negative' && 'border-red-300 text-red-600'
                            )}
                          >
                            {message.sentiment}
                          </Badge>
                        )}
                        <span className="text-xs opacity-50">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {chatMutation.isPending && (
                  <div className="flex gap-3">
                    <Avatar className="h-9 w-9 border-2 border-violet-200">
                      <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-white dark:bg-zinc-800 border rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Voice Mode Visual Indicator */}
            {mode === 'voice' && callStatus === 'connected' && (
              <div className="px-4 py-3 border-t bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AudioVisualizer isActive={isSpeaking || isListening} />
                    <span className="text-sm font-medium">
                      {isSpeaking ? 'AI Speaking...' : isListening ? 'Listening...' : 'Ready'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
                          >
                            {voiceOutputEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {voiceOutputEnabled ? 'Mute AI voice' : 'Unmute AI voice'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {isSpeaking && (
                      <Button variant="outline" size="sm" onClick={stopSpeaking}>
                        <Square className="h-3 w-3 mr-1" />
                        Stop
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t bg-white dark:bg-zinc-900">
              <div className="flex gap-2">
                {mode === 'voice' && callStatus === 'connected' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant={isListening ? 'destructive' : 'outline'}
                          onClick={isListening ? stopListening : startListening}
                          disabled={chatMutation.isPending}
                          className="flex-shrink-0 h-12 w-12"
                        >
                          {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isListening ? 'Stop listening' : 'Start listening'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={
                    isListening
                      ? 'Listening... speak now'
                      : mode === 'voice'
                      ? 'Speak or type as the prospect...'
                      : 'Type as the prospect would respond...'
                  }
                  disabled={chatMutation.isPending || isListening}
                  className="flex-1 h-12"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || chatMutation.isPending}
                  className="flex-shrink-0 h-12 w-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                >
                  {chatMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between mt-3">
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                {callStatus === 'connected' && (
                  <Button variant="destructive" size="sm" onClick={handleEndCall}>
                    <PhoneOff className="h-4 w-4 mr-2" />
                    End Call
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default PreviewStudio;
