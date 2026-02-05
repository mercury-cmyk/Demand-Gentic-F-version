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
              className="flex items-center gap-2 text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-background/50">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell AgentX what you want done…"
              className="min-h-[44px] max-h-[120px] pr-10 resize-none"
              rows={1}
            />
          </div>

          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-8"
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">Hello! I’m AgentX</h3>
      <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
        {isClientPortal
          ? "I can help you view your campaigns, check orders, review billing, and understand your analytics."
          : "I can help you manage campaigns, analyze data, search records, and much more. Just ask!"}
      </p>
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
      className={cn('flex gap-3', isUser && 'flex-row-reverse')}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-primary/10' : 'bg-muted'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div
        className={cn(
          'flex-1 max-w-[85%]',
          isUser && 'flex flex-col items-end'
        )}
      >
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Thought Process */}
        {message.thoughtProcess && message.thoughtProcess.length > 0 && (
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-7 text-xs text-muted-foreground"
              >
                <Wrench className="h-3 w-3 mr-1" />
                {message.thoughtProcess.length} steps
                {showDetails ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-2 bg-muted/50 rounded-md text-xs space-y-1">
                {message.thoughtProcess.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Tools Executed */}
        {message.toolsExecuted && message.toolsExecuted.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.toolsExecuted.map((tool, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                {tool.tool}
              </Badge>
            ))}
          </div>
        )}

        {/* Timestamp and actions */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {!isUser && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={copyContent}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
