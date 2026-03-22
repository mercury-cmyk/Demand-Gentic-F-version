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
  const [copiedId, setCopiedId] = useState(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive - batch DOM operations
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages]);

  // Auto-resize textarea - batch DOM operations to avoid forced reflows
  useEffect(() => {
    if (textareaRef.current) {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          const scrollHeight = textareaRef.current.scrollHeight;
          textareaRef.current.style.height = `${Math.min(
            scrollHeight,
            150
          )}px`;
        }
      });
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
    
      {/* Messages Area */}
      
        
          {displayMessages.map((message) => (
            
              
                
                  {message.role === "assistant" ? (
                    
                  ) : (
                    
                  )}
                
              
              
                
                  {message.content}
                  {message.isStreaming && (
                    
                  )}
                
                
                  
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  
                  {message.role === "assistant" && (
                     handleCopy(message.id, message.content)}
                    >
                      {copiedId === message.id ? (
                        
                      ) : (
                        
                      )}
                    
                  )}
                
              
            
          ))}
          {isLoading && (
            
              
                
                  
                
              
              
                
                
                  Thinking...
                
              
            
          )}
        
      

      {/* Input Area */}
      
        
          
             setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="min-h-[44px] max-h-[150px] resize-none pr-20"
              rows={1}
              disabled={isLoading}
            />
            
              
                {isRecording ? (
                  
                ) : (
                  
                )}
              
            
          
          
            {isLoading ? (
              
            ) : (
              
            )}
          
        
        
          
          Powered by AgentX AI
        
      
    
  );
}

export default AgenticCampaignChat;