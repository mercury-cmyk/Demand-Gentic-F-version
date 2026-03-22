import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Send,
  Loader2,
  Plus,
  Bot,
  User,
  Trash2,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

interface Session {
  sessionId: string;
  lastMessage: string;
  lastRole: string;
  createdAt: string;
}

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface ChatTabProps {
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
}

// Handles both { value: "..." } (admin-analyzed) and flat string (client-portal-analyzed)
function iv(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field.value || "";
}

export default function ChatTab({ orgIntelligence, organizationId }: ChatTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState(null);
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const messagesEndRef = useRef(null);
  const hasOrgIntel = !!iv(orgIntelligence?.identity?.legalName);
  const isDisabled = !organizationId || !hasOrgIntel;

  const { data: sessionsData } = useQuery({
    queryKey: [
      `/api/generative-studio/chat/sessions?organizationId=${organizationId || ""}`,
    ],
    enabled: !!organizationId && hasOrgIntel,
  });

  const { data: messagesData } = useQuery({
    queryKey: [
      `/api/generative-studio/chat/sessions/${sessionId}?organizationId=${organizationId || ""}`,
    ],
    enabled: !!sessionId && !!organizationId && hasOrgIntel,
  });

  useEffect(() => {
    if (messagesData?.messages) {
      setLocalMessages(messagesData.messages);
    }
  }, [messagesData]);

  useEffect(() => {
    setSessionId(null);
    setLocalMessages([]);
    setSuggestions([]);
  }, [hasOrgIntel, organizationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const chatMutation = useMutation({
    mutationFn: async (data: { sessionId?: string; message: string; organizationId?: string }) => {
      const res = await apiRequest("POST", "/api/generative-studio/chat", data);
      return await res.json();
    },
    onSuccess: (data) => {
      if (!sessionId) {
        setSessionId(data.sessionId);
      }
      setLocalMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
      setSuggestions(data.suggestions || []);
      queryClient.invalidateQueries({
        queryKey: [
          `/api/generative-studio/chat/sessions?organizationId=${organizationId || ""}`,
        ],
      });
    },
    onError: (error: any) => {
      toast({ title: "Chat error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sid: string) => {
      await apiRequest(
        "DELETE",
        `/api/generative-studio/chat/sessions/${sid}?organizationId=${organizationId || ""}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/generative-studio/chat/sessions?organizationId=${organizationId || ""}`,
        ],
      });
      if (sessionId) {
        setSessionId(null);
        setLocalMessages([]);
      }
      toast({ title: "Session deleted" });
    },
  });

  const handleSend = () => {
    if (!input.trim() || isDisabled) return;

    setLocalMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content: input,
        createdAt: new Date().toISOString(),
      },
    ]);

    chatMutation.mutate({
      sessionId: sessionId || undefined,
      message: input,
      organizationId,
    });

    setInput("");
    setSuggestions([]);
  };

  const handleNewSession = () => {
    setSessionId(null);
    setLocalMessages([]);
    setSuggestions([]);
  };

  const sessions = sessionsData?.sessions || [];

  return (
    
      {/* Left sidebar - Sessions */}
      
        
          
            
            New Conversation
          
        

        
          
            {sessions.length === 0 && (
              
                No conversations yet
              
            )}
            {sessions.map((session) => (
               setSessionId(session.sessionId)}
              >
                
                
                  
                    {session.lastMessage?.slice(0, 40) || "New conversation"}
                  
                  
                    {new Date(session.createdAt).toLocaleDateString()}
                  
                
                 {
                    e.stopPropagation();
                    deleteSessionMutation.mutate(session.sessionId);
                  }}
                >
                  
                
              
            ))}
          
        
      

      {/* Right panel - Chat */}
      
        {/* Messages */}
        
          
            {localMessages.length === 0 && (
              
                
                  
                    
                  
                  
                    Content Strategy Assistant
                    
                      Ask me about content ideas, copywriting tips, SEO strategies, or help refining your generated content.
                    
                  
                  {isDisabled && (
                    
                      
                      {!organizationId
                        ? "Select an organization to start."
                        : "Complete Organizational Intelligence to unlock organization-exclusive chat."}
                    
                  )}
                  {iv(orgIntelligence?.identity?.legalName) && (
                    
                      Powered by OI for {iv(orgIntelligence?.identity?.legalName)}
                    
                  )}
                  {hasOrgIntel && (
                    
                      {[
                      `Plan a blog series for ${iv(orgIntelligence?.identity?.legalName)}`,
                      `What makes a high-converting landing page for ${iv(orgIntelligence?.icp?.personas) || 'our target audience'}?`,
                      `Email subject lines for our ${iv(orgIntelligence?.offerings?.coreProducts) || 'product'} launch`,
                      ].map((suggestion) => (
                       setInput(suggestion)}
                      >
                        {suggestion}
                      
                      ))}
                    
                  )}
                
              
            )}

            
              {localMessages.map((msg) => (
                
                  {msg.role === "assistant" && (
                    
                      
                    
                  )}
                  
                    {msg.content}
                  
                  {msg.role === "user" && (
                    
                      
                    
                  )}
                
              ))}

              {chatMutation.isPending && (
                
                  
                    
                  
                  
                    
                      
                      
                      
                    
                  
                
              )}

              
            
          
        

        {/* Suggestions */}
        {suggestions.length > 0 && (
          
            {suggestions.map((s, i) => (
               setInput(s)}
              >
                {s}
              
            ))}
          
        )}

        {/* Input */}
        
          
             setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              className="resize-none min-h-[40px] max-h-[120px]"
              disabled={isDisabled}
            />
            
              {chatMutation.isPending ? (
                
              ) : (
                
              )}
            
          
        
      
    
  );
}