/**
 * Client Portal Voice Simulation Page
 * Allows client users to test AI voice agents for their campaigns.
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
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import {
  Bot, Send, Loader2, User, Sparkles, Phone, Mic, Volume2,
  Play, RefreshCw, Building2, UserCircle, Target, Brain,
  Zap, Info, X, Settings, History, Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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
    googleVoice: 'en-US-Studio-M',
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
    googleVoice: 'en-US-Journey-F',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'male',
    accent: 'American',
    tone: 'Calm, Measured, Thoughtful',
    description: 'Calm and measured voice for thoughtful conversations.',
    bestFor: ['Consulting', 'Technical Discussions', 'B2B Sales'],
    color: 'from-blue-500 to-indigo-600',
    googleVoice: 'en-US-Studio-Q',
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
    googleVoice: 'en-US-Journey-O',
  },
];

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

export default function ClientPortalVoiceSimulationPage() {
  const [view, setView] = useState('setup');
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [context, setContext] = useState(null);

  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  // Get client portal token
  const getAuthHeaders = (): Record => {
    const token = localStorage.getItem('clientPortalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Fetch client's campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
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
      if (!selectedCampaignId) throw new Error("Please select a campaign.");
      const res = await fetch('/api/client-portal/simulation/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          voiceId: selectedVoice,
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
      if (voiceOutputEnabled) {
        speak(firstMsg.content);
      }
    },
    onError: (error: Error) => {
      setMessages([{ role: 'error', content: `${error.message}`, timestamp: new Date() }]);
    },
  });

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      if (!sessionId) throw new Error('No active session. Start a simulation first.');
      const campaignId = context?.campaignId ?? selectedCampaignId;
      if (!campaignId) throw new Error('Please select a campaign.');

      const res = await fetch('/api/client-portal/simulation/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          sessionId,
          campaignId,
          userMessage,
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
        content: data.reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (voiceOutputEnabled) {
        speak(data.reply);
      }
    },
    onError: (error: Error) => {
      setMessages((prev) => [...prev, { role: 'error', content: `${error.message}`, timestamp: new Date() }]);
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

    try {
      setIsSpeaking(true);
      
      // Check for auth token before calling TTS API
      const authHeaders = getAuthHeaders();
      if (!authHeaders.Authorization) {
        // No auth token - use browser speech synthesis fallback
        console.warn('[VoiceSim] No auth token, using browser TTS fallback');
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
          ...authHeaders,
        },
        body: JSON.stringify({
          text,
          voiceId: selectedVoice,
          provider: 'gemini',
        }),
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
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current || !isListening) return;
    try {
      recognitionRef.current.stop();
    } catch (e) {
      // ignore
    } finally {
      setIsListening(false);
    }
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

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

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isSpeaking, view]);

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
      user: 'bg-primary/20',
      assistant: 'bg-muted',
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
          Test your AI voice agent in realistic call scenarios.
        
        
          
            
              
              Select Campaign
            
            
              
                
              
              
                {campaigns.map((c: any) => (
                  
                    {c.name}
                  
                ))}
              
            
          

          
            Select Agent Voice
            
              {AI_VOICES.map((voice) => (
                 setSelectedVoice(voice.id)}
                  className={cn(
                    'cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md',
                    selectedVoice === voice.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'hover:border-primary/30'
                  )}
                >
                  
                    
                      {voice.gender === 'male' ?  : }
                    
                    
                      
                        {voice.name}
                        {selectedVoice === voice.id && }
                      
                      
                        
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
              
            
            
              
                
              
              {isListening ? 'Listening...' : 'Tap to speak'}
            
          
        
      

      {/* Right Panel: Transcript */}
      
        
          
            
            Conversation Transcript
            {isSpeaking && (
              
                
                Speaking
              
            )}
            {isListening && (
              
                
                Listening
              
            )}
          
        
        
          
            
              {messages.map(renderMessage)}
              {chatMutation.isPending && (
                
                  
                    
                  
                  
                    
                  
                
              )}
            
          
        
        
          
             setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isListening ? 'Listening...' : 'Type your message or use voice...'}
              disabled={chatMutation.isPending || isListening}
            />
             handleSend()}
              disabled={chatMutation.isPending || !input.trim()}
            >
              {chatMutation.isPending ?  : }
            
          
        
      
    
  );

  return (
    
      
        
          Voice Simulation
          Test AI voice agents in realistic call scenarios
        
        {view === 'setup' ?  : }
      
    
  );
}