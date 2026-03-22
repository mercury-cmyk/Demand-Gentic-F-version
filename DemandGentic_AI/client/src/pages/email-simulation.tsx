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

export default function EmailSimulationPage() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState('setup');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState();
  const [selectedAccountId, setSelectedAccountId] = useState();
  const [selectedContactId, setSelectedContactId] = useState();
  const [personaPreset, setPersonaPreset] = useState('cold_outreach');
  const [context, setContext] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const scrollRef = useRef(null);
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
      
        
          
            
              {msg.role === 'user' ? 'You (Contact)' : 'AI Agent'}
              &lt;{msg.role === 'user' ? 'prospect@company.com' : 'agent@pivotal-b2b.com'}&gt;
            
            
               handleCopy(msg.content, `email-${index}`)}
                className="h-6 text-white/40 hover:text-white hover:bg-white/10"
              >
                {copiedField === `email-${index}` ?  : }
              
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            
          
          
            {msg.content}
          
        
      
    );
  };

  const SetupView = () => (
    
      
        
          
            
              
            
          
          Email Simulation Studio
          Test AI email responses in realistic conversation threads.
        
        
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
                
              
            
          

          
            Email Type
            
              {EMAIL_TYPES.map(type => (
                 setPersonaPreset(type.value)}
                  className={cn(
                    "w-full p-3 rounded-xl border text-left transition-all duration-200",
                    personaPreset === type.value
                      ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/50"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
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
            
              {EMAIL_TYPES.find(t => t.value === personaPreset)?.label}
            
          
          
          
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
              className="pr-12 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              disabled={chatMutation.isPending}
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
            
            
            Email Simulation
          

          
            
               window.history.back()}
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10"
              >
                
              

              
                
              
              
                Email Simulation
                Test AI email responses in realistic threads
              
            

            {view === 'simulation' && (
              
                
                {EMAIL_TYPES.find(t => t.value === personaPreset)?.label}
              
            )}
          
        
      

      {/* Main Content */}
      
        {view === 'setup' ?  : }
      
    
  );
}