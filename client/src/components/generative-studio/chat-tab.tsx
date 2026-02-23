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

export default function ChatTab({ orgIntelligence, organizationId }: ChatTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDisabled = !organizationId;

  const { data: sessionsData } = useQuery<{ sessions: Session[] }>({
    queryKey: [
      `/api/generative-studio/chat/sessions?organizationId=${organizationId || ""}`,
    ],
    enabled: !!organizationId,
  });

  const { data: messagesData } = useQuery<{ messages: Message[] }>({
    queryKey: [
      `/api/generative-studio/chat/sessions/${sessionId}?organizationId=${organizationId || ""}`,
    ],
    enabled: !!sessionId && !!organizationId,
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
  }, [organizationId]);

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
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] h-full">
      {/* Left sidebar - Sessions */}
      <div className="border-r bg-muted/10 flex flex-col">
        <div className="p-3 border-b">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-9 text-sm"
            onClick={handleNewSession}
            disabled={isDisabled}
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {sessions.length === 0 && (
              <p className="text-xs text-center text-muted-foreground py-6">
                No conversations yet
              </p>
            )}
            {sessions.map((session) => (
              <div
                key={session.sessionId}
                className={cn(
                  "group flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-colors",
                  "hover:bg-accent/50",
                  sessionId === session.sessionId
                    ? "bg-accent border border-border shadow-sm"
                    : "border border-transparent"
                )}
                onClick={() => setSessionId(session.sessionId)}
              >
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate leading-tight">
                    {session.lastMessage?.slice(0, 40) || "New conversation"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSessionMutation.mutate(session.sessionId);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right panel - Chat */}
      <div className="flex flex-col h-full">
        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {localMessages.length === 0 && (
              <div className="h-full min-h-[400px] flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md px-4">
                  <div className="flex items-center justify-center w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-100">
                    <Sparkles className="w-7 h-7 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Content Strategy Assistant</h3>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                      Ask me about content ideas, copywriting tips, SEO strategies, or help refining your generated content.
                    </p>
                  </div>
                  {isDisabled && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mx-auto max-w-xs">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Select an organization to start.
                    </div>
                  )}
                  {orgIntelligence?.identity?.legalName?.value && (
                    <p className="text-xs text-emerald-600">
                      Powered by OI for {orgIntelligence.identity.legalName.value}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {orgIntelligence?.identity?.legalName?.value ? [
                      `Plan a blog series for ${orgIntelligence.identity.legalName.value}`,
                      `What makes a high-converting landing page for ${orgIntelligence.icp?.personas?.value || 'our target audience'}?`,
                      `Email subject lines for our ${orgIntelligence.offerings?.coreProducts?.value || 'product'} launch`,
                    ].map((suggestion) => (
                      <Badge
                        key={suggestion}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent py-1.5 px-3 text-xs font-normal"
                        onClick={() => setInput(suggestion)}
                      >
                        {suggestion}
                      </Badge>
                    )) : [
                      "Plan a blog series about AI in healthcare",
                      "What makes a high-converting landing page?",
                      "Email subject lines for a product launch",
                    ].map((suggestion) => (
                      <Badge
                        key={suggestion}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent py-1.5 px-3 text-xs font-normal"
                        onClick={() => setInput(suggestion)}
                      >
                        {suggestion}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {localMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "")}
                >
                  {msg.role === "assistant" && (
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-xl px-4 py-2.5 max-w-[75%]",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                  {msg.role === "user" && (
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 shrink-0">
                    <Bot className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="bg-muted rounded-xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </ScrollArea>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="px-4 pb-2 flex gap-2 flex-wrap">
            {suggestions.map((s, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-accent py-1 px-2.5 text-xs font-normal"
                onClick={() => setInput(s)}
              >
                {s}
              </Badge>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t p-3 bg-background">
          <div className="flex gap-2 items-end">
            <Textarea
              placeholder="Ask about content strategy, ideas, or get help with your content..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending || isDisabled}
              className="px-3 h-10 shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              {chatMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
