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

export default function VoiceSimulationPage() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState('setup');
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState();
  const [selectedAccountId, setSelectedAccountId] = useState();
  const [selectedContactId, setSelectedContactId] = useState();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [context, setContext] = useState(null);

  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch campaigns for admin
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/campaigns?limit=100');
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns || [];
    },
  });

  // Fetch accounts for selected campaign
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['/api/knowledge-blocks/campaigns', selectedCampaignId, 'accounts'],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const res = await apiRequest('GET', `/api/knowledge-blocks/campaigns/${selectedCampaignId}/accounts`);
      const data = await res.json();
      return data.accounts || [];
    },
    enabled: !!selectedCampaignId,
  });

  // Fetch contacts for selected account
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['/api/knowledge-blocks/accounts', selectedAccountId, 'contacts'],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const res = await apiRequest('GET', `/api/knowledge-blocks/accounts/${selectedAccountId}/contacts`);
      const data = await res.json();
      return data.contacts || [];
    },
    enabled: !!selectedAccountId,
  });

  // Get selected entities for display
  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const selectedContact = contacts.find(c => c.id === selectedContactId);

  // Start simulation mutation
  const startSimulationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId) throw new Error("A campaign must be selected.");
      const res = await apiRequest('POST', '/api/simulations/start', {
        campaignId: selectedCampaignId,
        accountId: selectedAccountId,
        contactId: selectedContactId,
        personaPreset: 'neutral_dm', maxTurns: 20, simulationSpeed: 'fast'
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to start simulation');
      return res.json();
    },
    onSuccess: (data) => {
      setSessionId(data.session?.id);
      const contactName = selectedContact
        ? `${selectedContact.firstName || ''} ${selectedContact.lastName || ''}`.trim() || 'Contact'
        : 'Simulated Contact';
      setContext({
        campaignId: selectedCampaignId!,
        campaignName: data.agentContext?.agentName || 'Campaign',
        accountName: selectedAccount?.name || 'Simulated Account',
        contactName,
        contactTitle: selectedContact?.jobTitle || undefined,
      });
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
  const audioRef = useRef(null);

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
      // Clean up audio element to prevent blob URL leaks
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
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
      
        
          
            
          
          
            {msg.content}
            
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            
          
        
      
    );
  };

  const SetupView = () => (
    
      
        
          
            
              
            
          
          Voice Simulation Studio
          Configure and test your AI voice agent in realistic call scenarios.
        
        
          {/* Campaign Selection */}
          
            Select Campaign
             { setSelectedCampaignId(v); setSelectedAccountId(undefined); setSelectedContactId(undefined); }}>
              
                
              
              
                {campaigns.map((c: any) => (
                  
                    {c.name}
                  
                ))}
              
            
          

          {/* Account & Contact Selection */}
          
            
              Account
               { setSelectedAccountId(v); setSelectedContactId(undefined); }}
                disabled={!selectedCampaignId}
              >
                
                  
                
                
                  {accounts.map((a) => (
                    
                      
                        {a.name}
                        {a.industry && {a.industry}}
                      
                    
                  ))}
                
              
            

            
              Contact
              
                
                  
                
                
                  {contacts.map((c) => (
                    
                      
                        {c.firstName} {c.lastName}
                        {c.jobTitle && {c.jobTitle}}
                      
                    
                  ))}
                
              
            
          

          
            Select Agent Voice
            
              {AI_VOICES.map((voice) => (
                 setSelectedVoice(voice.id)}
                  className={cn(
                    "cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md relative overflow-hidden group",
                    selectedVoice === voice.id
                      ? "border-purple-500/50 bg-purple-500/10 ring-1 ring-purple-500"
                      : "border-white/10 hover:border-purple-500/30 bg-white/5"
                  )}
                >
                  
                  
                    
                      {voice.gender === 'male' ?  : }
                    
                    
                      
                        {voice.name}
                        {selectedVoice === voice.id && (
                          
                        )}
                      
                      
                        {voice.accent}
                        {voice.gender}
                      
                      {voice.description}
                    
                  
                
              ))}
            
          

          
            {startSimulationMutation.isPending ?  : }
            Start Voice Simulation
          
        
      
    
  );

  const SimulationView = () => (
    
      {/* Left Panel: Controls */}
      
        
          
            Controls
            
              
            
          
        
        
          
            Campaign
            {context?.campaignName}
          
          
          
            AI Context
            
               {context?.accountName || 'Generic Account'}
               {context?.contactName || 'Generic Contact'}
            
          
          
          
            
              Voice Output
              
            
            
              
                
              
              {isListening ? "Listening..." : "Tap to speak"}
            
          
        
      

      {/* Right Panel: Transcript */}
      
        
          
            
            Conversation Transcript
            {isSpeaking && (
              
                
                Speaking
              
            )}
          
        
        
          
            
              {messages.map(renderMessage)}
              {chatMutation.isPending && renderMessage({ role: 'assistant', content: '...', timestamp: new Date() }, messages.length)}
            
          
        
        
          
             setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isListening ? "Listening..." : "Type your message or use voice..."}
              className="pr-12 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              disabled={chatMutation.isPending || isListening}
            />
             handleSend()}
              disabled={chatMutation.isPending || !input.trim()}
            >
              {chatMutation.isPending ?  : }
            
          
        
      
    
  );

  return (
    
      {/* Gradient Background */}
      
        
        
        
      

      {/* Header */}
      
        
          
             setLocation('/')}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors"
            >
              
              Home
            
            
            Voice Simulation
          

          
            
               window.history.back()}
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10"
              >
                
              

              
                
              
              
                Voice Simulation
                Test AI voice agents in realistic call scenarios
              
            

            {view === 'simulation' && (
              
                
                  {isSpeaking ? (
                    <>
                      
                      AI Speaking
                    
                  ) : isListening ? (
                    <>
                      
                      Listening
                    
                  ) : (
                    <>
                      
                      Call Active
                    
                  )}
                
              
            )}
          
        
      

      {/* Main Content */}
      
        {view === 'setup' ?  : }
      
    
  );
}