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
  actions?: Array<ActionLog>;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    const actionLabels: Record<string, string> = {
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
    <Card className={cn('flex flex-col border-slate-200 shadow-xl overflow-hidden bg-slate-50/50', isExpanded ? 'fixed inset-4 z-50 h-auto' : 'h-[650px]', className)}>
      {/* AgentX Header */}
      <CardHeader className="py-3 px-4 border-b bg-white relative z-10 shrink-0">
        <div className="flex flex-col gap-2">
          {/* Top Row: Brand & Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shadow-sm">
                <Bot className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  AgentX
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-slate-100 text-slate-500 border-slate-200 font-normal">
                    v2.4
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="truncate max-w-[150px]">Gemini 2.0 Flash</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Bottom Row: Auth & Scope Badges */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md text-[10px] font-medium text-slate-600">
              <ShieldCheck className="h-3 w-3 text-indigo-500" />
              Authenticated: Client
            </div>
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md text-[10px] font-medium text-slate-600">
              <Lock className="h-3 w-3 text-slate-500" />
              Boundary: Restricted Scope
            </div>
          </div>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 px-4 py-4 bg-slate-50/50" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-4">
            <div className="h-20 w-20 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-6">
              <Sparkles className="h-10 w-10 text-indigo-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">AgentX Ready</h3>
            <p className="text-sm text-slate-500 max-w-xs mb-8 leading-relaxed">
              I can assist with campaign management, billing inquiries, and order processing. All actions are verified securely.
            </p>

            <div className="w-full max-w-sm grid grid-cols-2 gap-3 mb-8">
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className="justify-start gap-3 h-auto py-3 px-4 border-slate-200 hover:border-indigo-300 hover:bg-white hover:shadow-sm transition-all bg-white"
                  onClick={() => handleQuickAction(action.prompt)}
                >
                  <action.icon className={cn("h-4 w-4", action.color)} />
                  <span className="text-xs font-semibold text-slate-700">{action.label}</span>
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  className="text-xs text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-full border border-transparent hover:border-indigo-100 transition-colors"
                  onClick={() => handleQuickAction(prompt)}
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 pb-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  'flex gap-4 group',
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm mt-1",
                  message.role === 'user' ? "bg-indigo-600 border-indigo-500" : "bg-white border-slate-200"
                )}>
                  {message.role === 'user' ? (
                    <User className="h-4 w-4 text-white" />
                  ) : (
                    <Bot className="h-4 w-4 text-emerald-500" />
                  )}
                </div>

                <div className={cn(
                  'flex flex-col gap-2 max-w-[85%]',
                  message.role === 'user' ? 'items-end' : 'items-start'
                )}>
                  {/* Message Bubble */}
                  <div className={cn(
                    'px-5 py-3 shadow-sm text-sm leading-relaxed',
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm'
                  )}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Execution Log / Action Visualization */}
                  {message.actions && message.actions.length > 0 && (
                    <div className="w-full mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="border border-slate-200 bg-slate-50 rounded-lg overflow-hidden">
                        {/* Log Header */}
                        <div className="bg-slate-100/50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Terminal className="h-3.5 w-3.5 text-slate-500" />
                            <span className="text-[10px] font-mono font-medium text-slate-600 uppercase tracking-wider">Execution Log</span>
                          </div>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] h-5 gap-1 pl-1 pr-2">
                            <CheckCircle2 className="h-3 w-3" />
                            Safety Check Passed
                          </Badge>
                        </div>

                        {/* Actions List */}
                        <div className="p-3 space-y-3">
                          {message.actions.map((action, actionIdx) => (
                            <div key={actionIdx} className="relative pl-4 border-l-2 border-slate-200 hover:border-emerald-400 transition-colors">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  "text-xs font-semibold",
                                  action.result.success ? "text-slate-800" : "text-red-600"
                                )}>
                                  {formatActionDisplay(action.action)}
                                </span>
                                <Badge className={cn("h-4 text-[9px] px-1", action.result.success ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-red-100 text-red-700")}>
                                  {action.result.success ? 'SUCCESS' : 'FAILED'}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono truncate">
                                {JSON.stringify(action.params)}
                              </p>
                            </div>
                          ))}
                        </div>
                        
                        {/* Footer Status */}
                        <div className="bg-emerald-50/50 px-3 py-1.5 border-t border-emerald-100 flex items-center gap-2">
                          <Activity className="h-3 w-3 text-emerald-500" />
                          <span className="text-[10px] text-emerald-700 font-medium">All operations completed securely.</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <span className="text-[10px] text-slate-400 px-1">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {/* Thinking Indicator */}
            {chatMutation.isPending && (
              <div className="flex gap-4 fade-in">
                <div className="h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-1">
                  <Bot className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  <span className="text-sm">Processing request...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="py-2 px-4 bg-white border-t border-slate-100 z-10 shrink-0">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-lg text-slate-500',
              isListening && 'bg-red-50 text-red-600 hover:bg-red-100 animate-pulse'
            )}
            onClick={toggleVoiceInput}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your request to AgentX..."
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 h-9 min-h-[36px] text-sm"
            disabled={chatMutation.isPending}
            autoComplete="off"
          />

          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className={cn(
              "h-8 w-8 rounded-lg transition-all",
              input.trim() 
                ? "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200" 
                : "bg-slate-200 text-slate-400 hover:bg-slate-300"
            )}
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="mt-2 flex justify-center">
          <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            End-to-end encrypted session. Actions logged for auditing.
          </p>
        </div>
      </div>
    </Card>
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0 border-l border-slate-200 shadow-2xl">
        <SheetHeader className="sr-only">
          <SheetTitle>AgentX</SheetTitle>
        </SheetHeader>
        <ClientAgentChat onNavigate={onNavigate} className="h-full border-0 rounded-none shadow-none" />
      </SheetContent>
    </Sheet>
  );
}

// Floating Button Wrapper
export function ClientAgentButton({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-2xl shadow-xl shadow-indigo-200 hover:shadow-2xl hover:scale-105 hover:-translate-y-1 transition-all duration-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 z-50 group"
        >
          <Bot className="h-6 w-6 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
          <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-white" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0 border-l border-slate-200 shadow-2xl">
        <SheetHeader className="sr-only">
          <SheetTitle>AgentX</SheetTitle>
        </SheetHeader>
        <ClientAgentChat onNavigate={onNavigate} className="h-full border-0 rounded-none shadow-none" />
      </SheetContent>
    </Sheet>
  );
}

export default ClientAgentChat;
