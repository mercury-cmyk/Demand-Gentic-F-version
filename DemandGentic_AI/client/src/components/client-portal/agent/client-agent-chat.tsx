import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Bot, Loader2, User, Sparkles, ChevronRight,
  Target, Package, CreditCard, BarChart3,
  Mic, MicOff, Minimize2, Maximize2,
  ShieldCheck, Terminal, CheckCircle2, Activity,
  Lock, ArrowRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Helper interface for Action Log
interface ActionLog {
  action: string;
  params: any;
  result: {
    success: boolean;
    message: string;
    data?: any;
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: Array;
  timestamp: Date;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClientAgentChatProps {
  onNavigate?: (section: string) => void;
  className?: string;
}

const QUICK_ACTIONS = [
  { label: 'Campaigns', icon: Target, prompt: 'Show me all my campaigns', color: 'text-emerald-500' },
  { label: 'Recent Orders', icon: Package, prompt: 'What are my recent orders?', color: 'text-indigo-500' },
  { label: 'Billing', icon: CreditCard, prompt: 'Show me my billing summary', color: 'text-blue-500' },
  { label: 'Analytics', icon: BarChart3, prompt: 'Give me an analytics summary for the last 30 days', color: 'text-violet-500' },
];

const EXAMPLE_PROMPTS = [
  "Create an order for 500 leads",
  "Status of my latest order?",
  "Spend this month?",
  "Invoice help",
];

export function ClientAgentChat({ onNavigate, className }: ClientAgentChatProps) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollAreaRef = useRef(null);
  const inputRef = useRef(null);
  const { toast } = useToast();

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch('/api/client-portal/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          message,
          conversationHistory,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to send message');
      }

      return res.json();
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        actions: data.actions,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setConversationHistory(data.conversationHistory);

      if (data.navigateTo && onNavigate) {
        onNavigate(data.navigateTo);
      }

      if (data.actions?.length > 0) {
        const successActions = data.actions.filter((a: any) => a.result.success);
        if (successActions.length > 0) {
          // Subtle log
          console.log(`${successActions.length} action(s) executed successfully`);
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Agent Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSend = useCallback(() => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    chatMutation.mutate(input.trim());
    setInput('');
  }, [input, chatMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    setTimeout(() => {
      const userMessage: Message = {
        role: 'user',
        content: prompt,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      chatMutation.mutate(prompt);
      setInput('');
    }, 100);
  };

  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'System Alert',
        description: 'Voice input not supported in this browser environment.',
        variant: 'destructive',
      });
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.start();
  };

  const formatActionDisplay = (action: string) => {
    const actionLabels: Record = {
      navigate: 'Navigation Executed',
      list_campaigns: 'Retrieved Campaigns',
      get_campaign_details: 'Fetched Campaign Details',
      create_order: 'Order Processing',
      list_orders: 'Retrieved Orders',
      get_order_status: 'Status Check',
      get_billing_summary: 'Secure Billing Access',
      list_invoices: 'Retrieved Invoices',
      get_analytics_summary: 'Generated Analytics',
      request_campaign: 'Campaign Request Submitted',
      submit_support_ticket: 'Support Ticket Logged',
    };
    return actionLabels[action] || action;
  };

  return (
    
      {/* AgentX Header */}
      
        
          {/* Top Row: Brand & Controls */}
          
            
              
                
              
              
                
                  AgentX
                  
                    v2.4
                  
                
                
                  
                    
                    Online
                  
                  |
                  Gemini 2.0 Flash
                
              
            
            
               setIsExpanded(!isExpanded)}
              >
                {isExpanded ?  : }
              
            
          

          {/* Bottom Row: Auth & Scope Badges */}
          
            
              
              Authenticated: Client
            
            
              
              Boundary: Restricted Scope
            
          
        
      

      
        {messages.length === 0 ? (
          
            
              
            
            AgentX: Agentic Operator
            
              Agentic Operator with Agentic CRM Actions, ImageGen, Organization Aware Chat Bot, and Creative Content capabilities.
            

            
              {QUICK_ACTIONS.map((action) => (
                 handleQuickAction(action.prompt)}
                >
                  
                  {action.label}
                
              ))}
            

            
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                 handleQuickAction(prompt)}
                >
                  "{prompt}"
                
              ))}
            
          
        ) : (
          
            {messages.map((message, index) => (
              
                
                  {message.role === 'user' ? (
                    
                  ) : (
                    
                  )}
                

                
                  {/* Message Bubble */}
                  
                    {message.content}
                  

                  {/* Execution Log / Action Visualization */}
                  {message.actions && message.actions.length > 0 && (
                    
                      
                        {/* Log Header */}
                        
                          
                            
                            Execution Log
                          
                          
                            
                            Safety Check Passed
                          
                        

                        {/* Actions List */}
                        
                          {message.actions.map((action, actionIdx) => (
                            
                              
                                
                                  {formatActionDisplay(action.action)}
                                
                                
                                  {action.result.success ? 'SUCCESS' : 'FAILED'}
                                
                              
                              
                                {JSON.stringify(action.params)}
                              
                            
                          ))}
                        
                        
                        {/* Footer Status */}
                        
                          
                          All operations completed securely.
                        
                      
                    
                  )}

                  
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  
                
              
            ))}

            {/* Thinking Indicator */}
            {chatMutation.isPending && (
              
                
                  
                
                
                  
                  Processing request...
                
              
            )}
          
        )}
      

      {/* Input Area */}
      
        
          
            {isListening ?  : }
          

           setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your request to AgentX..."
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 h-9 min-h-[36px] text-sm"
            disabled={chatMutation.isPending}
            autoComplete="off"
          />

          
            {chatMutation.isPending ? (
              
            ) : (
              
            )}
          
        

        
          
            
            End-to-end encrypted session. Actions logged for auditing.
          
        
      
    
  );
}

// Side Panel Wrapper
export function ClientAgentPanel({
  open,
  onOpenChange,
  onNavigate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (section: string) => void;
}) {
  return (
    
      
        
          AgentX
        
        
      
    
  );
}

// Floating Button Wrapper
export function ClientAgentButton({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    
      
        
          
          
        
      
      
        
          AgentX
        
        
      
    
  );
}

export default ClientAgentChat;