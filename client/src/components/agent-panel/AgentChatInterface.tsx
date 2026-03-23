import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  CheckCircle2,
  Copy,
  Check,
  Package,
  BarChart3,
  FileText,
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

  // Check if user message triggers order mode
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

      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantMessage: Message = {
        ...data.message,
        timestamp: data.message?.timestamp || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

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
      const stepCount = data.executedSteps?.length || 0;

      const resultMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Plan executed successfully. ${stepCount} step${stepCount !== 1 ? 's' : ''} completed.`,
        timestamp: new Date().toISOString(),
        toolsExecuted: data.executedSteps?.map((s: any) => ({
          tool: s.result?.tool || s.stepId,
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
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-muted/20">
      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="py-4 space-y-5">
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
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <AgentPlanViewer
                plan={currentPlan}
                onApprove={() => handlePlanApprove(currentPlan.id)}
                onReject={() => handlePlanReject(currentPlan.id)}
                isExecuting={isExecutingPlan}
              />
            </motion.div>
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

      {/* ── Input Area ── */}
      <div className="border-t border-border/30 bg-background/98 backdrop-blur-xl">
        <div className="p-3">
          <div className="relative flex items-end rounded-xl border border-border/60 bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all duration-200">
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell AgentC what you want done..."
              className="min-h-[44px] max-h-[160px] w-full resize-none border-0 shadow-none focus-visible:ring-0 py-3 pl-4 pr-12 bg-transparent text-sm leading-relaxed"
              rows={1}
            />
            <div className="absolute right-2 bottom-2">
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
                className={cn(
                  'h-7 w-7 rounded-lg transition-all duration-200',
                  inputValue.trim() && !isLoading
                    ? 'bg-primary hover:bg-primary/90 shadow-md shadow-primary/25'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <AgentQuickActions isClientPortal={isClientPortal} userRole={userRole} />

        <p className="text-[10px] text-muted-foreground/40 pb-2 text-center select-none">
          AgentC can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}


// ── Typing Indicator ──
function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex items-center gap-1.5 pt-2">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 bg-primary/40 rounded-full"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
          />
        ))}
        <span className="text-xs text-muted-foreground/60 ml-1.5">Thinking...</span>
      </div>
    </div>
  );
}

// ── Welcome Action Card ──
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
        'flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-all duration-200 group',
        primary
          ? 'bg-gradient-to-br from-primary/10 to-primary/[0.03] border-primary/20 hover:border-primary/35 hover:shadow-md hover:shadow-primary/5'
          : 'bg-card/50 border-border/50 hover:bg-muted/40 hover:border-border/80 hover:shadow-sm'
      )}
    >
      <div className={cn(
        'p-1.5 rounded-lg transition-colors',
        primary
          ? 'bg-primary/15 text-primary group-hover:bg-primary/20'
          : 'bg-muted text-muted-foreground group-hover:text-foreground'
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className={cn(
          'text-xs font-semibold leading-none',
          primary ? 'text-primary' : 'text-foreground/90'
        )}>
          {title}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{description}</p>
      </div>
    </button>
  );
}

// ── Welcome Message ──
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
      initial={{ opacity: 0, scale: 0.97, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center py-10 px-4 space-y-6 select-none"
    >
      <div className="relative group cursor-default">
        <div className="absolute -inset-3 bg-gradient-to-r from-primary/15 to-violet-500/15 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-background flex items-center justify-center border border-primary/10 shadow-xl">
          <Bot className="h-9 w-9 text-primary" />
        </div>
        <div className="absolute -bottom-1.5 -right-1.5 bg-background p-1 rounded-full border border-border/50 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
        </div>
      </div>

      <div className="text-center space-y-2 max-w-xs">
        <h3 className="font-bold text-xl tracking-tight text-foreground">
          AgentC
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your autonomous AI assistant for campaigns, analytics, and operations.
        </p>
      </div>

      {/* Client Portal Action Cards */}
      {isClientPortal && (
        <div className="w-full grid grid-cols-2 gap-2.5 max-w-sm">
          <WelcomeActionCard icon={Rocket} title="New Campaign" description="Launch order" onClick={onEnterOrderMode} primary />
          <WelcomeActionCard icon={BarChart3} title="Analysis" description="Performance review" onClick={() => dispatchQuickAction('Analyze the performance of my active campaigns')} />
          <WelcomeActionCard icon={FileText} title="Reports" description="Summary report" onClick={() => dispatchQuickAction('Generate a weekly summary report')} />
          <WelcomeActionCard icon={Target} title="Leads" description="Quality check" onClick={() => dispatchQuickAction('Check the quality of leads generated today')} />
          <WelcomeActionCard icon={Search} title="Deep Research" description="Market & competitive" onClick={() => dispatchQuickAction('Deep research: analyze the competitive landscape and market trends for our industry')} />
          <WelcomeActionCard icon={Code2} title="Code Assist" description="AI generation" onClick={() => dispatchQuickAction('Help me write code for a new API endpoint')} />
        </div>
      )}

      {/* Admin Welcome */}
      {!isClientPortal && (
        <div className="w-full grid grid-cols-2 gap-2.5 max-w-sm">
          <WelcomeActionCard icon={Brain} title="System Check" description="Diagnostics" onClick={() => dispatchQuickAction('Run a full system diagnostic check')} />
          <WelcomeActionCard icon={Building2} title="Org Intel" description="Account analysis" onClick={() => dispatchQuickAction('Analyze recently active accounts for intent')} />
          <WelcomeActionCard icon={Search} title="Deep Research" description="Market intel" onClick={() => dispatchQuickAction('Deep research: comprehensive market analysis and industry trends')} />
          <WelcomeActionCard icon={Code2} title="Code Assist" description="AI generation" onClick={() => dispatchQuickAction('Help me implement a new feature with code')} />
        </div>
      )}
    </motion.div>
  );
}

// ── Message Bubble ──
function MessageBubble({ message }: { message: Message }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const hasExecutedSteps = !isUser && message.toolsExecuted && message.toolsExecuted.length > 0;
  const isSuccessMessage = !isUser && message.content.includes('Plan executed successfully');

  const copyContent = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn('group flex gap-3', isUser && 'flex-row-reverse')}
    >
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
        isUser
          ? 'bg-primary shadow-sm shadow-primary/20'
          : 'bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10'
      )}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-primary-foreground" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-primary" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 max-w-[85%] space-y-1.5', isUser && 'flex flex-col items-end')}>
        {/* Sender */}
        <span className={cn(
          'text-[10px] font-medium text-muted-foreground/60 px-0.5',
          isUser && 'text-right'
        )}>
          {isUser ? 'You' : 'AgentC'}
        </span>

        {/* Bubble */}
        <div className={cn(
          'relative rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all duration-200',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-md'
            : isSuccessMessage
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-tl-md text-foreground'
              : 'bg-card border border-border/50 rounded-tl-md text-foreground shadow-sm'
        )}>
          {/* Success icon for plan completion */}
          {isSuccessMessage && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-200/60 dark:border-emerald-800/40">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Execution Complete</span>
            </div>
          )}

          <div className="whitespace-pre-wrap">{message.content}</div>

          {/* Executed steps */}
          {hasExecutedSteps && (
            <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
              {message.toolsExecuted!.map((step, idx) => {
                const toolLabel = (step.result?.message || step.tool || `Step ${idx + 1}`)
                  .replace(/^Executed\s+/, '')
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c: string) => c.toUpperCase());
                return (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span className="font-medium text-foreground/80">{toolLabel}</span>
                    {step.result?.success && (
                      <span className="text-emerald-600/70 text-[10px]">Done</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Copy button on hover */}
          {!isUser && (
            <button
              onClick={copyContent}
              className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border/60 rounded-md p-1 shadow-sm hover:bg-muted"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {/* Thought Process */}
        {message.thoughtProcess && message.thoughtProcess.length > 0 && (
          <div className="w-full max-w-[92%]">
            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full flex items-center justify-between px-3 h-7 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-1.5">
                    <Brain className="h-3 w-3" />
                    <span>View Reasoning ({message.thoughtProcess.length} steps)</span>
                  </div>
                  <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', showDetails && 'rotate-180')} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 p-3 bg-muted/30 rounded-lg border border-border/30 space-y-2">
                  {message.thoughtProcess.map((thought, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-[10px] font-mono text-primary/60 shrink-0 mt-0.5 w-4 text-right">{idx + 1}.</span>
                      <span className="leading-relaxed">{thought}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>
    </motion.div>
  );
}
