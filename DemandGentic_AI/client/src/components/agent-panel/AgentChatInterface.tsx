import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Wrench,
  Copy,
  Check,
  Package,
  BarChart3,
  FileText,
  CreditCard,
  Sparkles,
  Brain,
  Building2,
  Rocket,
  Target,
  Search,
  Code2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAgentPanelContext } from './AgentPanelProvider';
import { AgentPlanViewer } from './AgentPlanViewer';
import { AgentQuickActions } from './AgentQuickActions';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thoughtProcess?: string[];
  toolsExecuted?: Array;
  planId?: string;
}

interface ExecutionPlan {
  id: string;
  steps: Array;
    isDestructive: boolean;
    estimatedImpact?: string;
  }>;
  riskLevel: 'low' | 'medium' | 'high';
  status: string;
}

interface AgentChatInterfaceProps {
  sessionId: string;
  conversationId: string | null;
  isClientPortal: boolean;
  userRole: string;
}

export function AgentChatInterface({
  sessionId,
  conversationId,
  isClientPortal,
  userRole,
}: AgentChatInterfaceProps) {
  const { toast } = useToast();
  const { setConversationId, setAgentStatus, enterOrderMode } = useAgentPanelContext();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Detect order intent from messages
  const detectOrderIntent = useCallback((message: string) => {
    const orderKeywords = [
      'create a new campaign order',
      'new order',
      'place an order',
      'order campaign',
      'want to order',
      'need leads',
      'generate leads',
      'qualified leads',
      'appointment setting',
    ];
    return orderKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }, []);

  // Check if user message triggers order mode → enter order mode via context
  useEffect(() => {
    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (lastUserMessage && detectOrderIntent(lastUserMessage.content) && isClientPortal) {
      enterOrderMode();
    }
  }, [messages, detectOrderIntent, enterOrderMode, isClientPortal]);

  useEffect(() => {
    if (isExecutingPlan) {
      setAgentStatus('executing');
      return;
    }

    if (isLoading) {
      setAgentStatus('thinking');
      return;
    }

    if (currentPlan) {
      setAgentStatus('awaiting_review');
      return;
    }

    setAgentStatus('idle');
  }, [currentPlan, isExecutingPlan, isLoading, setAgentStatus]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle quick action events
  useEffect(() => {
    const handleQuickAction = (e: CustomEvent) => {
      setInputValue(e.detail.prompt);
      inputRef.current?.focus();
    };

    window.addEventListener('agent-quick-action', handleQuickAction as EventListener);
    return () => {
      window.removeEventListener('agent-quick-action', handleQuickAction as EventListener);
    };
  }, []);

  const getAuthToken = useCallback(() => {
    return localStorage.getItem(isClientPortal ? 'clientPortalToken' : 'authToken');
  }, [isClientPortal]);

  const WelcomeHero = () => (
    
      
        
        
          
        
      
      
        
          How can I help you?
        
        
          I can help you analyze leads, optimize campaigns, or process new orders.
        
      
      
      
         {
            enterOrderMode();
          }}
        />
         {
             setInputValue("Analyze my recent lead performance");
             inputRef.current?.focus();
          }}
        />
         {
             setInputValue("How can I optimize my current campaigns?");
             inputRef.current?.focus();
          }}
        />
         {
             setInputValue("Generate a summary report for this week");
             inputRef.current?.focus();
          }}
        />
      
    
  );

  const QuickActionCard = ({ icon: Icon, label, desc, onClick }: any) => (
    
      
        
        {label}
      
      {desc}
    
  );

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setCurrentPlan(null);

    try {
      const token = getAuthToken();

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const endpoint = `/api/agent-panel/chat?clientPortal=${isClientPortal}`;

      const requestBody = {
        message: userMessage.content,
        sessionId,
        conversationId: conversationId || undefined,
        planMode: true,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        throw new Error(`Server Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // Update conversation ID if new
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

      // Regular message handling
      const assistantMessage: Message = {
        ...data.message,
        timestamp: data.message?.timestamp || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Set plan if returned
      if (data.plan) {
        setCurrentPlan(data.plan);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error. ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, getAuthToken, inputValue, isClientPortal, isLoading, sessionId, setConversationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handlePlanApprove = async (planId: string) => {
    setIsExecutingPlan(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/agent-panel/execute/${planId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error('Failed to execute plan');
      }

      const data = await response.json();

      const resultMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Plan executed successfully. ${data.executedSteps?.length || 0} steps completed.`,
        timestamp: new Date().toISOString(),
        toolsExecuted: data.executedSteps?.map((s: any) => ({
          tool: s.stepId,
          args: {},
          result: s.result,
        })),
      };
      setMessages((prev) => [...prev, resultMessage]);
      setCurrentPlan(null);
    } catch (error) {
      console.error('Error executing plan:', error);
    } finally {
      setIsExecutingPlan(false);
    }
  };

  const handlePlanReject = async (planId: string) => {
    try {
      const token = getAuthToken();
      await fetch(`/api/agent-panel/reject/${planId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'User rejected the plan' }),
      });

      const rejectMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Plan cancelled. How else can I help you?',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, rejectMessage]);
      setCurrentPlan(null);
    } catch (error) {
      console.error('Error rejecting plan:', error);
    }
  };

  return (
    
      {/* Messages Area */}
      
        
          {messages.length === 0 ? (
            
          ) : (
            
              {messages.map((message) => (
                
              ))}
            
          )}

          {/* Current Plan */}
          {currentPlan && (
            
               handlePlanApprove(currentPlan.id)}
                onReject={() => handlePlanReject(currentPlan.id)}
              />
            
          )}

          {/* Loading Indicator */}
          {isLoading && (
            
              
            
          )}
        
      

      {/* Input Area */}
      
        
          
             setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell AgentX what you want done..."
              className="min-h-[50px] max-h-[200px] w-full resize-none border-0 shadow-none focus-visible:ring-0 py-3.5 pl-4 pr-12 bg-transparent leading-relaxed"
              rows={1}
            />
            
              
                {isLoading ? (
                  
                ) : (
                  
                )}
              
            
          
        

        
          
        

        
          AgentX can make mistakes. Check important info.
        
      
    
  );
}


// Typing Indicator Component
function TypingIndicator() {
  return (
    
      
      
      
      AgentX is thinking...
    
  );
}

// Welcome Action Card for client portal
function WelcomeActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  primary,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    
      
        
      
      
        
          {title}
        
        
          {description}
        
      
    
  );
}

// Welcome Message Component
function WelcomeMessage({
  isClientPortal,
  userRole,
  onEnterOrderMode,
}: {
  isClientPortal: boolean;
  userRole: string;
  onEnterOrderMode: () => void;
}) {
  const dispatchQuickAction = (prompt: string) => {
    window.dispatchEvent(
      new CustomEvent('agent-quick-action', { detail: { prompt } })
    );
  };

  return (
    
      
        
        
          
        
        
           
        
      

      
        
          AgentX
        
        
          I'm an autonomic agent designed to help you analyze data, execute campaigns, and manage operations.
        
      

      {/* Client Portal Action Cards */}
      {isClientPortal && (
        
          
           dispatchQuickAction('Analyze the performance of my active campaigns')}
          />
           dispatchQuickAction('Generate a weekly summary report')}
          />
            dispatchQuickAction('Check the quality of leads generated today')}
          />
           dispatchQuickAction('Deep research: analyze the competitive landscape and market trends for our industry')}
          />
           dispatchQuickAction('Help me write code for a new API endpoint')}
          />
        
      )}

      {/* Admin/Internal Welcome */}
      {!isClientPortal && (
        
             dispatchQuickAction('Run a full system diagnostic check')}
            />
              dispatchQuickAction('Analyze recently active accounts for intent')}
            />
             dispatchQuickAction('Deep research: comprehensive market analysis and industry trends')}
            />
             dispatchQuickAction('Help me implement a new feature with code')}
            />
        
      )}
    
  );
}

// Message Bubble Component
function MessageBubble({ message }: { message: Message }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  
  // Detect if this is a campaign proposal or highly structured output
  const isCampaignProposal = !isUser && (
    message.content.includes('# Campaign Strategy') || 
    message.content.includes('Campaign Created') ||
    message.content.includes('Order Summary')
  );

  const copyContent = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    
      
        {isUser ? (
          
        ) : (
          
        )}
      

      
        
          {/* Sender Name */}
          
            {isUser ? 'You' : 'AgentX'}
          

          
            {isCampaignProposal && (
              
                 
                    
                    Strategy
                 
              
            )}
            
            
              {message.content}
            
          
        

        {/* Thought Process */}
        {message.thoughtProcess && message.thoughtProcess.length > 0 && (
          
            
              
                
                  
                    
                    View Reasoning ({message.thoughtProcess.length} steps)
                  
                  
                
              
              
                
                  
                  {message.thoughtProcess.map((step, i) => (
                    
                      
                        {i + 1}
                      
                      {step}
                    
                  ))}
                
              
            
          
        )}

        {/* Tools Executed */}
        {message.toolsExecuted && message.toolsExecuted.length > 0 && (
          
            {message.toolsExecuted.map((tool, i) => (
              
                
                  
                
                {tool.tool}
              
            ))}
          
        )}

        {/* Actions */}
        {!isUser && (
          
            
              {copied ? (
                
              ) : (
                
              )}
            
          
        )}
      
    
  );
}