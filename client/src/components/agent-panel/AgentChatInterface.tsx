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
  toolsExecuted?: Array<{ tool: string; args: any; result: any }>;
  planId?: string;
}

interface ExecutionPlan {
  id: string;
  steps: Array<{
    id: string;
    stepNumber: number;
    tool: string;
    description: string;
    args: Record<string, any>;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<ExecutionPlan | null>(null);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    const handleQuickAction = (e: CustomEvent<{ prompt: string }>) => {
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
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="relative">
        <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-purple-500/20 blur-xl rounded-full opacity-50" />
        <div className="bg-gradient-to-br from-primary/10 to-background p-4 rounded-2xl border border-primary/10 shadow-xl relative backdrop-blur-sm">
          <Bot className="w-12 h-12 text-primary" />
        </div>
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
          How can I help you?
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          I can help you analyze leads, optimize campaigns, or process new orders.
        </p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
        <QuickActionCard 
          icon={Package} 
          label="New Campaign" 
          desc="Create a new lead order"
          onClick={() => {
            enterOrderMode();
          }}
        />
        <QuickActionCard 
          icon={BarChart3} 
          label="Analyze Leads" 
          desc="Review recent performance"
          onClick={() => {
             setInputValue("Analyze my recent lead performance");
             inputRef.current?.focus();
          }}
        />
        <QuickActionCard 
          icon={Sparkles} 
          label="Optimize" 
          desc="Improve conversion rates"
          onClick={() => {
             setInputValue("How can I optimize my current campaigns?");
             inputRef.current?.focus();
          }}
        />
        <QuickActionCard 
          icon={FileText} 
          label="Reports" 
          desc="Generate summary report"
          onClick={() => {
             setInputValue("Generate a summary report for this week");
             inputRef.current?.focus();
          }}
        />
      </div>
    </div>
  );

  const QuickActionCard = ({ icon: Icon, label, desc, onClick }: any) => (
    <button
      onClick={onClick}
      className="flex flex-col items-start p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-primary/5 hover:border-primary/20 transition-all duration-300 text-left group"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
        <span className="font-medium text-sm text-foreground/80 group-hover:text-primary transition-colors">{label}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{desc}</span>
    </button>
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
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="py-4 space-y-4">
          {messages.length === 0 ? (
            <WelcomeMessage isClientPortal={isClientPortal} userRole={userRole} onEnterOrderMode={enterOrderMode} />
          ) : (
            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </AnimatePresence>
          )}

          {/* Current Plan */}
          {currentPlan && (
            <div className="space-y-3">
              <AgentPlanViewer
                plan={currentPlan}
                onApprove={() => handlePlanApprove(currentPlan.id)}
                onReject={() => handlePlanReject(currentPlan.id)}
              />
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <TypingIndicator />
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="relative">
          <div className="relative flex items-center rounded-xl border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring transition-all">
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell AgentX what you want done..."
              className="min-h-[50px] max-h-[200px] w-full resize-none border-0 shadow-none focus-visible:ring-0 py-3.5 pl-4 pr-12 bg-transparent leading-relaxed"
              rows={1}
            />
            <div className="absolute right-2 bottom-2">
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
                className={cn(
                  "h-8 w-8 rounded-lg transition-all duration-200",
                  !inputValue.trim() && !isLoading ? "opacity-50 grayscale" : "opacity-100 shadow-md",
                  isLoading && "opacity-80"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 mb-2">
          <AgentQuickActions isClientPortal={isClientPortal} userRole={userRole} />
        </div>

        <p className="text-[10px] text-muted-foreground/60 mt-2 text-center select-none">
          AgentX can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}


// Typing Indicator Component
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 p-2">
      <motion.div
        className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
      />
      <motion.div
        className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
      />
      <span className="text-xs text-muted-foreground ml-2">AgentX is thinking...</span>
    </div>
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
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2 p-3.5 rounded-xl border text-left transition-all duration-200 group',
        primary
          ? 'bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-primary/25 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10'
          : 'bg-card/50 border-border/60 hover:bg-muted/50 hover:border-border hover:shadow-sm'
      )}
    >
      <div
        className={cn(
          'p-2 rounded-lg transition-colors',
          primary
            ? 'bg-primary/15 text-primary group-hover:bg-primary/20'
            : 'bg-muted text-muted-foreground group-hover:bg-muted/80'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className={cn(
          'text-sm font-semibold leading-none',
          primary ? 'text-primary' : 'text-foreground'
        )}>
          {title}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
          {description}
        </p>
      </div>
    </button>
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
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-12 px-6 space-y-8 select-none"
    >
      <div className="relative group cursor-default">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
        <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-card to-background flex items-center justify-center border border-border/50 shadow-2xl">
          <Bot className="h-10 w-10 text-primary transition-transform duration-500 group-hover:scale-110" />
        </div>
        <div className="absolute -bottom-2 -right-2 bg-background p-1.5 rounded-full border border-border shadow-sm">
           <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500/20 animate-pulse" />
        </div>
      </div>

      <div className="text-center space-y-3 max-w-sm">
        <h3 className="font-bold text-2xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
          AgentX
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          I'm an autonomic agent designed to help you analyze data, execute campaigns, and manage operations.
        </p>
      </div>

      {/* Client Portal Action Cards */}
      {isClientPortal && (
        <div className="w-full grid grid-cols-2 gap-3 max-w-md">
          <WelcomeActionCard
            icon={Rocket}
            title="New Campaign"
            description="Launch order"
            onClick={onEnterOrderMode}
            primary
          />
          <WelcomeActionCard
            icon={BarChart3}
            title="Analysis"
            description="Performance review"
            onClick={() => dispatchQuickAction('Analyze the performance of my active campaigns')}
          />
          <WelcomeActionCard
            icon={FileText}
            title="Reports"
            description="View reports"
            onClick={() => dispatchQuickAction('Generate a weekly summary report')}
          />
           <WelcomeActionCard
            icon={Target}
            title="Leads"
            description="Lead quality check"
            onClick={() => dispatchQuickAction('Check the quality of leads generated today')}
          />
        </div>
      )}

      {/* Admin/Internal Welcome */}
      {!isClientPortal && (
        <div className="w-full grid grid-cols-2 gap-3 max-w-md">
            <WelcomeActionCard
              icon={Brain}
              title="System Check"
              description="Diagnostics"
              onClick={() => dispatchQuickAction('Run a full system diagnostic check')}
            />
             <WelcomeActionCard
              icon={Building2}
              title="Org Intel"
              description="Analyze accounts"
              onClick={() => dispatchQuickAction('Analyze recently active accounts for intent')}
            />
        </div>
      )}
    </motion.div>
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn('group flex gap-4', isUser && 'flex-row-reverse')}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ring-2 ring-background z-10',
          isUser
            ? 'bg-gradient-to-tr from-primary to-primary/80'
            : 'bg-gradient-to-tr from-card to-secondary border border-border/50'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      <div
        className={cn(
          'flex-1 max-w-[85%] space-y-2',
          isUser && 'flex flex-col items-end'
        )}
      >
        <div className="flex flex-col gap-1">
          {/* Sender Name */}
          <div className={cn("text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 px-1 flex items-center gap-2", isUser && "justify-end")}>
            <span>{isUser ? 'You' : 'AgentX'}</span>
          </div>

          <div
            className={cn(
              'relative rounded-2xl px-5 py-4 text-sm shadow-sm leading-7 transition-all duration-200',
              isUser
                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                : 'bg-card/80 backdrop-blur-sm border border-border/50 rounded-tl-sm text-foreground shadow-sm hover:shadow-md'
            )}
          >
            {isCampaignProposal && (
              <div className="absolute top-0 right-0 p-2">
                 <Badge variant="outline" className="bg-background/50 backdrop-blur text-[10px] border-primary/20 text-primary gap-1">
                    <Sparkles className="w-3 h-3" />
                    Strategy
                 </Badge>
              </div>
            )}
            
            <div className={cn("markdown-prose whitespace-pre-wrap", isCampaignProposal && "font-medium text-foreground/90")}>
              {message.content}
            </div>
          </div>
        </div>

        {/* Thought Process */}
        {message.thoughtProcess && message.thoughtProcess.length > 0 && (
          <div className="w-full max-w-[90%]">
            <Collapsible open={showDetails} onOpenChange={setShowDetails} className="group/details bg-muted/20 hover:bg-muted/40 transition-colors rounded-lg border border-border/30 overflow-hidden">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full flex items-center justify-between px-3 h-8 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5" />
                    <span>View Reasoning ({message.thoughtProcess.length} steps)</span>
                  </div>
                  <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", showDetails && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 pt-1 space-y-3">
                  <div className="h-px w-full bg-border/40 mb-2" />
                  {message.thoughtProcess.map((step, i) => (
                    <div key={i} className="flex gap-3 text-xs group/step">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-background border border-border/60 shrink-0 text-[10px] font-mono text-muted-foreground group-hover/step:border-primary/40 group-hover/step:text-primary transition-colors">
                        {i + 1}
                      </div>
                      <span className="text-muted-foreground leading-relaxed pt-0.5">{step}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Tools Executed */}
        {message.toolsExecuted && message.toolsExecuted.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.toolsExecuted.map((tool, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-xs py-1 px-3 h-7 bg-emerald-500/5 text-emerald-700 border-emerald-200/50 gap-1.5 hover:bg-emerald-500/10 transition-colors rounded-lg"
              >
                <div className="p-0.5 bg-emerald-500/20 rounded-full">
                  <Check className="h-2.5 w-2.5" />
                </div>
                <span className="font-mono font-medium">{tool.tool}</span>
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-1 duration-200">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md hover:bg-muted text-muted-foreground"
              onClick={copyContent}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
