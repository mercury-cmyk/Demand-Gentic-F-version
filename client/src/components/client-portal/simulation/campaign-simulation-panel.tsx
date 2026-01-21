/**
 * Campaign Simulation Panel for Client Portal
 * Allows clients to experience their AI agent in action with voice and text modes
 * Uses their real campaign, account, and contact intelligence
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Bot, Send, Loader2, User, Sparkles, Phone, MessageSquare,
  Mic, MicOff, Volume2, VolumeX, Play, Square, RefreshCw,
  Building2, UserCircle, Target, Brain, Zap, Info, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant' | 'system';
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

interface CampaignSimulationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampaignSimulationPanel({ open, onOpenChange }: CampaignSimulationPanelProps) {
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [simulationStarted, setSimulationStarted] = useState(false);
  const [context, setContext] = useState<SimulationContext | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch client's campaigns
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

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          const result = event.results[event.resultIndex];
          const text = result[0].transcript;
          setInput(text);
          
          if (result.isFinal) {
            handleSend(text);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
      
      if (data.context) {
        setContext(data.context);
      }

      // Speak the response if voice output is enabled
      if (voiceOutputEnabled && mode === 'voice') {
        speak(data.reply);
      }
    },
    onError: (error: Error) => {
      const errorMessage: Message = {
        role: 'assistant',
        content: `⚠️ ${error.message}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
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
      setContext(data.context);
      setSimulationStarted(true);
      
      // Add the AI's first message
      if (data.firstMessage) {
        const firstMsg: Message = {
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
      const errorMessage: Message = {
        role: 'system',
        content: `⚠️ Failed to start: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages([errorMessage]);
    },
  });

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setInput('');
      } catch (err) {
        console.error('Failed to start recognition:', err);
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
    startSimulationMutation.mutate();
  };

  const handleReset = () => {
    setMessages([]);
    setSessionId(null);
    setContext(null);
    setSimulationStarted(false);
    stopSpeaking();
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Campaign Simulation Studio
          </DialogTitle>
          <DialogDescription>
            Experience your AI agent in action. Simulate conversations as if you were a prospect.
          </DialogDescription>
        </DialogHeader>

        {!simulationStarted ? (
          /* Setup Screen */
          <div className="space-y-6 py-4">
            {/* Campaign Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Select Campaign to Simulate
              </Label>
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder={campaignsLoading ? "Loading campaigns..." : "Choose a campaign"} />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      <div className="flex items-center gap-2">
                        <span>{campaign.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {campaign.status}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mode Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Simulation Mode</Label>
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'text' | 'voice')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Text Chat
                  </TabsTrigger>
                  <TabsTrigger value="voice" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Voice Call
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Info Box */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-blue-500" />
                <div className="text-sm">
                  <p className="font-medium mb-1">What you'll experience:</p>
                  <ul className="text-muted-foreground space-y-1">
                    <li className="flex items-center gap-2">
                      <Brain className="h-3 w-3" />
                      AI agent with your campaign's personality & script
                    </li>
                    <li className="flex items-center gap-2">
                      <Building2 className="h-3 w-3" />
                      Account intelligence about your target companies
                    </li>
                    <li className="flex items-center gap-2">
                      <UserCircle className="h-3 w-3" />
                      Contact intelligence for personalized conversations
                    </li>
                    <li className="flex items-center gap-2">
                      <Zap className="h-3 w-3" />
                      Real-time objection handling & qualification
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              onClick={handleStartSimulation}
              disabled={!selectedCampaignId || startSimulationMutation.isPending}
              className="w-full"
              size="lg"
            >
              {startSimulationMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting Simulation...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start {mode === 'voice' ? 'Voice' : 'Text'} Simulation
                </>
              )}
            </Button>
          </div>
        ) : (
          /* Active Simulation */
          <div className="flex flex-col flex-1 min-h-0">
            {/* Context Bar */}
            {context && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg mb-3 flex-wrap">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {context.campaignName}
                </Badge>
                {context.accountName && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {context.accountName}
                  </Badge>
                )}
                {context.contactName && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <UserCircle className="h-3 w-3" />
                    {context.contactName}
                    {context.contactTitle && <span className="text-muted-foreground ml-1">({context.contactTitle})</span>}
                  </Badge>
                )}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </div>
            )}

            {/* Messages */}
            <ScrollArea ref={scrollRef} className="flex-1 pr-4 min-h-[300px]">
              <div className="space-y-4 pb-4">
                {messages.map((message, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex gap-3',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role !== 'user' && (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'rounded-lg px-4 py-2 max-w-[80%]',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : message.role === 'system'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                          : 'bg-muted'
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {message.isVoice && (
                        <Mic className="h-3 w-3 mt-1 opacity-50" />
                      )}
                    </div>
                    {message.role === 'user' && (
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                
                {chatMutation.isPending && (
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <Separator className="my-3" />

            {/* Voice Mode Controls */}
            {mode === 'voice' && (
              <div className="flex items-center justify-between mb-3 p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Switch
                    id="voice-output"
                    checked={voiceOutputEnabled}
                    onCheckedChange={setVoiceOutputEnabled}
                  />
                  <Label htmlFor="voice-output" className="text-xs flex items-center gap-1">
                    {voiceOutputEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                    AI Voice Response
                  </Label>
                </div>
                {isSpeaking && (
                  <Button variant="outline" size="sm" onClick={stopSpeaking}>
                    <Square className="h-3 w-3 mr-1" />
                    Stop
                  </Button>
                )}
              </div>
            )}

            {/* Input Area */}
            <div className="flex gap-2">
              {mode === 'voice' && (
                <Button
                  type="button"
                  size="icon"
                  variant={isListening ? 'destructive' : 'outline'}
                  onClick={isListening ? stopListening : startListening}
                  disabled={chatMutation.isPending}
                  className="flex-shrink-0"
                >
                  {isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={
                  isListening
                    ? 'Listening...'
                    : mode === 'voice'
                    ? 'Speak or type your response...'
                    : 'Type as the prospect would respond...'
                }
                disabled={chatMutation.isPending || isListening}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => handleSend()}
                disabled={!input.trim() || chatMutation.isPending}
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Listening indicator */}
            {isListening && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Speak now...
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CampaignSimulationPanel;
