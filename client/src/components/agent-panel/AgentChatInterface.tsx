import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Mic,
  MicOff,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  Wrench,
  Copy,
  Check,
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
import { useAgentPanelContext } from './AgentPanelProvider';
import { AgentPlanViewer } from './AgentPlanViewer';

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
  const { setConversationId, setAgentStatus } = useAgentPanelContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<ExecutionPlan | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    return localStorage.getItem(isClientPortal ? 'clientPortalToken' : 'token');
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
      const response = await fetch(`/api/agent-panel/chat?clientPortal=${isClientPortal}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
          conversationId,
          planMode: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      // Update conversation ID if new
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

      // Add assistant message
      const assistantMessage: Message = {
        ...data.message,
        timestamp: data.message.timestamp || new Date().toISOString(),
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
        content: 'Sorry, I encountered an error. Please try again.',
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

      // Add execution result message
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
            <WelcomeMessage isClientPortal={isClientPortal} userRole={userRole} />
          ) : (
            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </AnimatePresence>
          )}

          {/* Current Plan */}
          {currentPlan && (
            <AgentPlanViewer
              plan={currentPlan}
              onApprove={() => handlePlanApprove(currentPlan.id)}
              onReject={() => handlePlanReject(currentPlan.id)}
            />
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
              placeholder="Tell AgentX what you want done…"
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

// Welcome Message Component
function WelcomeMessage({
  isClientPortal,
  userRole,
}: {
  isClientPortal: boolean;
  userRole: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-10 px-4 space-y-6"
    >
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-xl">
          <Bot className="h-10 w-10 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-background rounded-full flex items-center justify-center border border-border shadow-sm">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
        </div>
      </div>
      
      <div className="text-center space-y-2 max-w-sm">
        <h3 className="font-semibold text-xl tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Welcome to AgentX
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {isClientPortal
            ? "Your personal AI assistant for campaigns, orders, and analytics. What would you like to check today?"
            : "I'm ready to help you manage your tasks, analyze data, and optimize results. Use a prompt below or type your own."}
        </p>
      </div>

      <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </motion.div>
  );
}

// Message Bubble Component
function MessageBubble({ message }: { message: Message }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copyContent = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn('group flex gap-3', isUser && 'flex-row-reverse')}
    >
      <div
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-sm transition-colors',
          isUser 
            ? 'bg-primary border-primary/20' 
            : 'bg-background border-border'
        )}
      >
        {isUser ? (
          <User className="h-5 w-5 text-primary-foreground" />
        ) : (
          <Bot className="h-5 w-5 text-primary" />
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
          <div className={cn("text-xs text-muted-foreground px-1 flex items-center gap-2", isUser && "justify-end")}>
            <span className="font-medium">{isUser ? 'You' : 'AgentX'}</span>
            <span className="opacity-50">•</span>
            <span>
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div
            className={cn(
              'rounded-2xl px-4 py-3 text-sm shadow-sm border leading-relaxed',
              isUser
                ? 'bg-primary text-primary-foreground border-primary/20 rounded-tr-none'
                : 'bg-card text-card-foreground border-border rounded-tl-none'
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>

        {/* Thought Process */}
        {message.thoughtProcess && message.thoughtProcess.length > 0 && (
          <div className="w-full max-w-[90%]">
            <Collapsible open={showDetails} onOpenChange={setShowDetails} className="bg-muted/30 rounded-lg border border-border/50 overflow-hidden">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full flex items-center justify-between px-3 h-9 text-xs font-medium hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="p-1 rounded bg-background border border-border/50">
                      <Wrench className="h-3 w-3" />
                    </div>
                    <span>Reasoning Process ({message.thoughtProcess.length} steps)</span>
                  </div>
                  {showDetails ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 pt-1 space-y-2">
                  <div className="h-px w-full bg-border/50 mb-2" />
                  {message.thoughtProcess.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <div className="flex items-center justify-center w-4 h-4 rounded-full bg-background border border-border/50 shrink-0 mt-0.5 text-[10px] font-mono text-muted-foreground">
                        {i + 1}
                      </div>
                      <span className="text-muted-foreground leading-relaxed">{step}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Tools Executed */}
        {message.toolsExecuted && message.toolsExecuted.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {message.toolsExecuted.map((tool, i) => (
              <Badge 
                key={i} 
                variant="outline" 
                className="text-xs py-1 px-2.5 bg-green-500/5 text-green-700 border-green-200 gap-1.5 hover:bg-green-500/10 transition-colors"
              >
                <CheckCircle className="h-3 w-3" />
                <span className="font-mono font-medium">{tool.tool}</span>
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-md hover:bg-muted"
              onClick={copyContent}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
