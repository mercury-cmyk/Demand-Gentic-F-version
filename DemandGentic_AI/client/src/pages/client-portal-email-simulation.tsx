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
  const [view, setView] = useState('setup');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState();
  const [personaPreset, setPersonaPreset] = useState('cold_outreach');
  const [context, setContext] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Get client portal token
  const getAuthHeaders = () => {
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
      
        
          
            
              {msg.role === 'user' ? 'You (Contact)' : 'AI Agent'}
              
                &lt;{msg.role === 'user' ? 'prospect@company.com' : 'agent@pivotal-b2b.com'}&gt;
              
            
            
               handleCopy(msg.content, `email-${index}`)} className="h-6">
                {copiedField === `email-${index}` ?  : }
              
              
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              
            
          
          {msg.content}
        
      
    );
  };

  const SetupView = () => (
    
      
        
          
            
              
            
          
          Email Simulation Studio
          Test AI email responses in realistic conversation threads.
        
        
          
            
              
              Select Campaign
            
            
              
                
              
              
                {campaigns.map((c: any) => (
                  
                    {c.name}
                  
                ))}
              
            
          

          
            Email Type
            
              {EMAIL_TYPES.map((type) => (
                 setPersonaPreset(type.value)}
                  className={cn(
                    'w-full p-3 rounded-xl border text-left transition-all duration-200',
                    personaPreset === type.value
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  
                    {type.label}
                    {personaPreset === type.value && }
                  
                  {type.description}
                
              ))}
            
          

          
            {startSimulationMutation.isPending ?  : }
            Start Email Simulation
          
        
      
    
  );

  const SimulationView = () => (
    
      {/* Left Panel: Controls */}
      
        
          
            
              
              Controls
            
            
              
            
          
        
        
          
            Campaign
            {context?.campaignName}
          
          
          
            Email Type
            {EMAIL_TYPES.find((t) => t.value === personaPreset)?.label}
          
          
          
            
              
              AI Context
            
            
              
                 {context?.accountName || 'Generic Account'}
              
              
                 {context?.contactName || 'Generic Contact'}
              
            
          
          
          
            Quick Replies
            
               {
                  setInput("I'm interested, can you tell me more?");
                  inputRef.current?.focus();
                }}
              >
                
                Show interest
              
               {
                  setInput("What's the pricing like?");
                  inputRef.current?.focus();
                }}
              >
                
                Ask about pricing
              
               {
                  setInput("I'm not interested at this time.");
                  inputRef.current?.focus();
                }}
              >
                
                Decline
              
            
          
        
      

      {/* Right Panel: Email Thread */}
      
        
          
            
            Email Thread
            
              {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            
          
        
        
          
            
              {messages.map(renderEmail)}
              {chatMutation.isPending && (
                
                  
                  AI is composing a reply...
                
              )}
            
          
        
        
          
             setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Write a reply as the prospect..."
              disabled={chatMutation.isPending}
            />
             handleSend()}
              disabled={chatMutation.isPending || !input.trim()}
            >
              {chatMutation.isPending ?  : }
            
          
        
      
    
  );

  return (
    
      
        
          Email Simulation
          Test AI email responses in realistic conversation threads
        
        {view === 'setup' ?  : }
      
    
  );
}