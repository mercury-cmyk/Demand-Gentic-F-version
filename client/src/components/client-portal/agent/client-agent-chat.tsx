import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Bot, Send, Loader2, User, Sparkles, ChevronRight,
  Target, Package, CreditCard, BarChart3, MessageSquare,
  Mic, MicOff, X, Minimize2, Maximize2, Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: Array<{
    action: string;
    params: any;
    result: {
      success: boolean;
      message: string;
      data?: any;
    };
  }>;
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
  { label: 'View my campaigns', icon: Target, prompt: 'Show me all my campaigns' },
  { label: 'Recent orders', icon: Package, prompt: 'What are my recent orders?' },
  { label: 'Billing summary', icon: CreditCard, prompt: 'Show me my billing summary' },
  { label: 'Analytics report', icon: BarChart3, prompt: 'Give me an analytics summary for the last 30 days' },
];

const EXAMPLE_PROMPTS = [
  "Create an order for 500 leads from my top campaign",
  "What's the status of my latest order?",
  "How much have I spent this month?",
  "Request a new campaign targeting IT directors",
  "I need help with an invoice issue",
];

export function ClientAgentChat({ onNavigate, className }: ClientAgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Chat mutation
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

      // Handle navigation if requested
      if (data.navigateTo && onNavigate) {
        onNavigate(data.navigateTo);
      }

      // Show toast for completed actions
      if (data.actions?.length > 0) {
        const successActions = data.actions.filter((a: any) => a.result.success);
        if (successActions.length > 0) {
          toast({
            title: 'Actions completed',
            description: `${successActions.length} action(s) executed successfully`,
          });
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
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
    // Auto-send after a brief delay for better UX
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

  // Voice input (Web Speech API)
  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Voice not supported',
        description: 'Your browser does not support voice input',
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

  const formatActionBadge = (action: string) => {
    const actionLabels: Record<string, string> = {
      navigate: 'Navigated',
      list_campaigns: 'Listed Campaigns',
      get_campaign_details: 'Campaign Details',
      create_order: 'Created Order',
      list_orders: 'Listed Orders',
      get_order_status: 'Order Status',
      get_billing_summary: 'Billing Summary',
      list_invoices: 'Listed Invoices',
      get_analytics_summary: 'Analytics',
      request_campaign: 'Campaign Requested',
      submit_support_ticket: 'Ticket Created',
    };
    return actionLabels[action] || action;
  };

  return (
    <Card className={cn('flex flex-col', isExpanded ? 'fixed inset-4 z-50' : 'h-[600px]', className)}>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">AI Assistant</CardTitle>
            <p className="text-xs text-muted-foreground">Powered by GPT-4</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="space-y-6">
            {/* Welcome Message */}
            <div className="text-center py-6">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Hello! I'm your AI Assistant</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                I can help you manage campaigns, create orders, check billing, view reports, and more. Just ask!
              </p>
            </div>

            {/* Quick Actions */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2 h-auto py-2 px-3"
                    onClick={() => handleQuickAction(action.prompt)}
                  >
                    <action.icon className="h-4 w-4 text-primary" />
                    <span className="text-xs">{action.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Example Prompts */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Try saying...</p>
              <div className="space-y-1">
                {EXAMPLE_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    className="w-full text-left text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg px-3 py-2 transition-colors"
                    onClick={() => handleQuickAction(prompt)}
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={cn(
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white'
                  )}>
                    {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>

                <div className={cn(
                  'flex flex-col gap-1 max-w-[80%]',
                  message.role === 'user' ? 'items-end' : 'items-start'
                )}>
                  <div className={cn(
                    'rounded-2xl px-4 py-2',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  )}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Show action badges for assistant messages */}
                  {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {message.actions.map((action, actionIdx) => (
                        <Badge
                          key={actionIdx}
                          variant={action.result.success ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {formatActionBadge(action.action)}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <span className="text-xs text-muted-foreground">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {chatMutation.isPending && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <Separator />

      {/* Input Area */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn('shrink-0', isListening && 'bg-red-100 text-red-600')}
            onClick={toggleVoiceInput}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            className="flex-1"
            disabled={chatMutation.isPending}
          />

          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="shrink-0"
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </Card>
  );
}

// Controlled Agent Chat Panel - can be opened from sidebar or other components
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[450px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>AgentX</SheetTitle>
        </SheetHeader>
        <ClientAgentChat onNavigate={onNavigate} className="h-full border-0 rounded-none" />
      </SheetContent>
    </Sheet>
  );
}

// Floating chat button component
export function ClientAgentButton({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
        >
          <Zap className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[450px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>AgentX</SheetTitle>
        </SheetHeader>
        <ClientAgentChat onNavigate={onNavigate} className="h-full border-0 rounded-none" />
      </SheetContent>
    </Sheet>
  );
}

export default ClientAgentChat;
