import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Send,
  Loader2,
  Plus,
  Bot,
  User,
  Trash2,
  Sparkles,
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

  // Fetch sessions
  const { data: sessionsData } = useQuery<{ sessions: Session[] }>({
    queryKey: [
      `/api/generative-studio/chat/sessions?organizationId=${organizationId || ""}`,
    ],
    enabled: !!organizationId,
  });

  // Fetch session messages
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
      // Add assistant message to local state
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

    // Add user message to local state immediately
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
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] h-full">
      {/* Left sidebar - Sessions */}
      <div className="border-r flex flex-col">
        <div className="p-3 border-b">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleNewSession}
            disabled={isDisabled}
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessions.length === 0 && (
              <p className="text-xs text-center text-muted-foreground py-4">
                No conversations yet
              </p>
            )}
            {sessions.map((session) => (
              <div
                key={session.sessionId}
                className={`group flex items-start gap-2 p-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors ${
                  sessionId === session.sessionId ? "bg-accent" : ""
                }`}
                onClick={() => setSessionId(session.sessionId)}
              >
                <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {session.lastMessage?.slice(0, 40) || "New conversation"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
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
        <ScrollArea className="flex-1 p-4">
          {localMessages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-3 max-w-md">
                <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-amber-50">
                  <Sparkles className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-semibold">Content Strategy Assistant</h3>
                <p className="text-sm text-muted-foreground">
                  Ask me about content ideas, copywriting tips, SEO strategies, or help refining your
                  generated content. I can help you brainstorm and plan your content marketing.
                </p>
                {isDisabled && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Select an organization to start a conversation.
                  </p>
                )}
                {orgIntelligence?.identity?.legalName?.value && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Powered by Organization Intelligence for {orgIntelligence.identity.legalName.value}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {[
                    "Help me plan a blog series about AI in healthcare",
                    "What makes a high-converting landing page?",
                    "Suggest email subject lines for a SaaS product launch",
                  ].map((suggestion) => (
                    <Badge
                      key={suggestion}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent py-1.5 px-3"
                      onClick={() => {
                        setInput(suggestion);
                      }}
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
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 shrink-0">
                    <Bot className="w-4 h-4 text-amber-600" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-4 py-2.5 max-w-[75%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === "user" && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 shrink-0">
                  <Bot className="w-4 h-4 text-amber-600" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="px-4 pb-2 flex gap-2 flex-wrap">
            {suggestions.map((s, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-accent py-1 px-2 text-xs"
                onClick={() => setInput(s)}
              >
                {s}
              </Badge>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
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
              rows={2}
              className="resize-none"
                disabled={isDisabled}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending || isDisabled}
              className="px-3"
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
