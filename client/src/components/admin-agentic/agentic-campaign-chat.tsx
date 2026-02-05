import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  Bot,
  User,
  Mic,
  MicOff,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface AgenticCampaignChatProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  welcomeMessage?: string;
  className?: string;
}

export function AgenticCampaignChat({
  messages,
  onSendMessage,
  isLoading,
  placeholder = "Describe your campaign, paste a URL, or ask a question...",
  welcomeMessage = "Hello! I'm your AI campaign assistant. Tell me about the campaign you'd like to create, and I'll help you configure it step by step.",
  className,
}: AgenticCampaignChatProps) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        150
      )}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = async (messageId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
    } else {
      // Start recording (placeholder for actual voice input)
      setIsRecording(true);
      // In production, this would use Web Speech API or similar
      setTimeout(() => {
        setIsRecording(false);
        setInput((prev) =>
          prev
            ? prev + " [Voice input would appear here]"
            : "[Voice input would appear here]"
        );
      }, 2000);
    }
  };

  const displayMessages = messages.length > 0 ? messages : [
    {
      id: "welcome",
      role: "assistant" as const,
      content: welcomeMessage,
      timestamp: new Date(),
    },
  ];

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {displayMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" && "flex-row-reverse"
              )}
            >
              <Avatar
                className={cn(
                  "h-8 w-8",
                  message.role === "assistant" && "bg-primary/10"
                )}
              >
                <AvatarFallback>
                  {message.role === "assistant" ? (
                    <Bot className="h-4 w-4 text-primary" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "flex-1 max-w-[80%]",
                  message.role === "user" && "flex flex-col items-end"
                )}
              >
                <div
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm",
                    message.role === "assistant"
                      ? "bg-muted"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {message.role === "assistant" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCopy(message.id, message.content)}
                    >
                      {copiedId === message.id ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 bg-primary/10">
                <AvatarFallback>
                  <Bot className="h-4 w-4 text-primary" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  Thinking...
                </span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <CardContent className="border-t p-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="min-h-[44px] max-h-[150px] resize-none pr-20"
              rows={1}
              disabled={isLoading}
            />
            <div className="absolute right-2 bottom-2 flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  isRecording && "bg-red-100 text-red-600"
                )}
                onClick={toggleRecording}
                disabled={isLoading}
              >
                {isRecording ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="h-auto"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>Powered by AgentX AI</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default AgenticCampaignChat;
