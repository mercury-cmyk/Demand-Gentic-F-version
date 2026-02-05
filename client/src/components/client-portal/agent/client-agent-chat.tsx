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

// Add missing imports
import { motion, AnimatePresence } from 'framer-motion';
import { Textarea } from '@/components/ui/textarea';

// Typing Indicator Component (Unified)
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

export function ClientAgentChat({ onNavigate, className }: ClientAgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null); // Changed to TextArea
  const { toast } = useToast();

// ... existing code ...

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

// ... existing code ...

  return (
    <Card className={cn('flex flex-col border-0 rounded-none shadow-none bg-background/50', isExpanded ? 'fixed inset-0 z-50 rounded-none' : 'h-full', className)}>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
             <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/10">
                <Bot className="h-4 w-4 text-primary" />
             </div>
             <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-500 animate-pulse" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold leading-none tracking-tight">AgentX</CardTitle>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-0.5">
              Client Assistant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg hover:bg-muted text-muted-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6 flex flex-col items-center justify-center min-h-[400px]"
          >
            <div className="text-center space-y-4">
               <div className="relative mx-auto w-fit">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-xl">
                  <Bot className="h-10 w-10 text-primary" />
                </div>
              </div>
              
              <div className="space-y-2 max-w-sm mx-auto">
                <h3 className="font-semibold text-xl tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Hello! I’m AgentX</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  I can help you manage campaigns, create orders, check billing, view reports, and more.
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="w-full max-w-sm space-y-3">
              <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest text-center">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2 h-auto py-2.5 px-3 text-xs font-normal border-border/50 hover:border-primary/20 hover:bg-primary/5 transition-all"
                    onClick={() => handleQuickAction(action.prompt)}
                  >
                    <action.icon className="h-3.5 w-3.5 text-primary/70" />
                    <span className="truncate">{action.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6 pb-4">
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex gap-3 group',
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border shadow-sm',
                    message.role === 'user' 
                      ? 'bg-primary border-primary/20' 
                      : 'bg-background border-border'
                  )}
                >
                    {message.role === 'user' ? <User className="h-4 w-4 text-primary-foreground" /> : <Bot className="h-4 w-4 text-primary" />}
                </div>

                <div className={cn(
                  'flex flex-col gap-1 max-w-[85%]',
                  message.role === 'user' ? 'items-end' : 'items-start'
                )}>
                  <div className="flex items-center gap-2 px-1">
                     <span className="text-xs font-medium text-muted-foreground">{message.role === 'user' ? 'You' : 'AgentX'}</span>
                     <span className="text-[10px] text-muted-foreground/50">{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <div className={cn(
                    'rounded-2xl px-4 py-3 text-sm shadow-sm border leading-relaxed',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground border-primary/20 rounded-tr-none'
                      : 'bg-card text-card-foreground border-border rounded-tl-none'
                  )}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Show action badges for assistant messages */}
                  {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {message.actions.map((action, actionIdx) => (
                        <Badge
                          key={actionIdx}
                          variant="outline"
                          className={cn(
                            "text-[10px] py-0.5 px-2 gap-1 border",
                            action.result.success 
                              ? "bg-green-500/5 text-green-700 border-green-200" 
                              : "bg-red-500/5 text-red-700 border-red-200"
                          )}
                        >
                          <Zap className="h-3 w-3" />
                          {formatActionBadge(action.action)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Loading indicator */}
            {chatMutation.isPending && (
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <TypingIndicator />
               </motion.div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="relative flex items-end gap-2">
          {/* Voice Input Button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn('shrink-0 h-9 w-9 rounded-full mb-1', isListening && 'bg-red-100 text-red-600 animate-pulse')}
            onMouseDown={startVoiceInput}
            onMouseUp={stopVoiceInput}
            onMouseLeave={stopVoiceInput}
            onTouchStart={startVoiceInput}
            onTouchEnd={stopVoiceInput}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          <div className="relative flex-1 rounded-xl border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring transition-all">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              className="min-h-[48px] max-h-[200px] w-full resize-none border-0 shadow-none focus-visible:ring-0 py-3 px-4 pr-12 bg-transparent leading-relaxed scrollbar-hide"
              rows={1}
              disabled={chatMutation.isPending}
            />
             <div className="absolute right-2 bottom-2">
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className={cn(
                  "h-8 w-8 rounded-lg transition-all duration-200",
                  !input.trim() && !chatMutation.isPending ? "opacity-50 grayscale" : "opacity-100 shadow-md",
                  chatMutation.isPending && "opacity-80"
                )}
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/60 text-center mt-2.5 select-none">
          Verify important information before acting.
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
