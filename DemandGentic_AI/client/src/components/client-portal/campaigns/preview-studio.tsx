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
    
      {[...Array(5)].map((_, i) => (
        
      ))}
    
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
    
      
      
      {config.text}
    
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
  const [mode, setMode] = useState('text');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(preselectedCampaignId || '');
  const [selectedAccountId, setSelectedAccountId] = useState();
  const [selectedContactId, setSelectedContactId] = useState();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [simulationStarted, setSimulationStarted] = useState(false);
  const [context, setContext] = useState(null);
  const [callStatus, setCallStatus] = useState('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(null);
  const callTimerRef = useRef(null);

  // Refs for state tracking
  const isSpeakingRef = useRef(false);
  const isListeningRef = useRef(false);
  const isWaitingForResponseRef = useRef(false);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch client's campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
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
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
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
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
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
    
      
        {/* Header */}
        
          
            
              
                
                  
                
                
                  Preview Studio
                  
                    Experience your AI agent in action
                  
                
              
              {simulationStarted && (
                
                  
                  {callStatus === 'connected' && (
                    
                      
                      {formatDuration(callDuration)}
                    
                  )}
                
              )}
            
          
        

        {!simulationStarted ? (
          /* Setup Screen */
          
            
              {/* Campaign Selection */}
              
                
                  
                  Select Campaign
                
                 { setSelectedCampaignId(v); setSelectedAccountId(undefined); setSelectedContactId(undefined); }}>
                  
                    
                  
                  
                    {campaigns.map((campaign) => (
                      
                        
                          {campaign.name}
                          {campaign.status}
                        
                      
                    ))}
                  
                
              

              {/* Account & Contact Selection */}
              
                
                  
                  Account & Contact
                
                
                   { setSelectedAccountId(v); setSelectedContactId(undefined); }}
                    disabled={!selectedCampaignId}
                  >
                    
                      
                    
                    
                      {accounts.map((account) => (
                        
                          
                            {account.name}
                            {account.industry && {account.industry}}
                          
                        
                      ))}
                    
                  

                  
                    
                      
                    
                    
                      {contacts.map((contact) => (
                        
                          
                            {contact.firstName} {contact.lastName}
                            {contact.jobTitle && {contact.jobTitle}}
                          
                        
                      ))}
                    
                  
                
              

              {/* What to Expect */}
              
                
                  
                    
                    
                      What you'll experience:
                      
                        
                          
                          AI agent with your campaign's intelligence
                        
                        
                          
                          Account-aware conversations
                        
                        
                          
                          Real-time objection handling
                        
                        
                          
                          Personalized engagement
                        
                      
                    
                  
                
              

              {/* Start Button */}
              
                {startSimulationMutation.isPending ? (
                  <>
                    
                    Connecting...
                  
                ) : (
                  <>
                    
                    Start Simulation
                  
                )}
              
            
          
        ) : (
          /* Active Simulation */
          
            {/* Context Bar */}
            {context && (
              
                
                  
                    
                    {context.campaignName}
                  
                  {context.accountName && (
                    
                      
                      {context.accountName}
                    
                  )}
                  {context.contactName && (
                    
                      
                      {context.contactName}
                      {context.contactTitle && (
                        ({context.contactTitle})
                      )}
                    
                  )}
                
              
            )}

            {/* Messages Area */}
            
              
                {messages.map((message) => (
                  
                    {message.role === 'assistant' && (
                      
                        
                          
                        
                      
                    )}
                    {message.role === 'user' && (
                      
                        
                          
                        
                      
                    )}
                    
                      {message.content}
                      
                        {message.isVoice && (
                          
                        )}
                        {message.sentiment && message.role === 'user' && (
                          
                            {message.sentiment}
                          
                        )}
                        
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        
                      
                    
                  
                ))}

                {chatMutation.isPending && (
                  
                    
                      
                        
                      
                    
                    
                      
                        
                        Thinking...
                      
                    
                  
                )}
              
            

            {/* Voice Mode Visual Indicator */}
            {mode === 'voice' && callStatus === 'connected' && (
              
                
                  
                    
                    
                      {isSpeaking ? 'AI Speaking...' : isListening ? 'Listening...' : 'Ready'}
                    
                  
                  
                    
                      
                        
                           setVoiceOutputEnabled(!voiceOutputEnabled)}
                          >
                            {voiceOutputEnabled ?  : }
                          
                        
                        
                          {voiceOutputEnabled ? 'Mute AI voice' : 'Unmute AI voice'}
                        
                      
                    
                    {isSpeaking && (
                      
                        
                        Stop
                      
                    )}
                  
                
              
            )}

            {/* Input Area */}
            
              
                {mode === 'voice' && callStatus === 'connected' && (
                  
                    
                      
                        
                          {isListening ?  : }
                        
                      
                      
                        {isListening ? 'Stop listening' : 'Start listening'}
                      
                    
                  
                )}
                 setInput(e.target.value)}
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
                 handleSend()}
                  disabled={!input.trim() || chatMutation.isPending}
                  className="flex-shrink-0 h-12 w-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                >
                  {chatMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                
              

              {/* Action buttons */}
              
                
                  
                  Reset
                
                {callStatus === 'connected' && (
                  
                    
                    End Call
                  
                )}
              
            
          
        )}
      
    
  );
}

export default PreviewStudio;