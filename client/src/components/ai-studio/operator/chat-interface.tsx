import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Send, Sparkles, Bot, User, Loader2, Paperclip, 
  Mic, MicOff, Image as ImageIcon, Terminal, FileCode, 
  ChevronDown, ChevronRight, Copy, ThumbsUp, ThumbsDown,
  AlertCircle, Wrench, CheckCircle2, Database, Zap,
  Volume2, VolumeX
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Speech Recognition Types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface ToolExecution {
  tool: string;
  args: any;
  result: any;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  thoughtProcess?: string[]; // Array of thought steps
  toolsExecuted?: ToolExecution[];
  iterations?: number;
  isComplete?: boolean;
  attachments?: string[];
  codeBlock?: {
    language: string;
    code: string;
  };
  action?: {
    type: "create_campaign" | "analyze_data" | "update_record";
    status: "pending" | "completed" | "failed";
    details?: string;
  };
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your **Agentic CRM Operator**. I work autonomously to complete your tasks - I'll keep querying data, analyzing, and taking action until I've fully answered your question.\n\nTry asking me:\n• \"Give me a full CRM overview\"\n• \"Find all accounts in healthcare and analyze them\"\n• \"What's our lead conversion rate?\"\n• \"Show me recent campaign performance\"\n\n🎤 **Voice Mode**: Click the microphone button to speak your commands!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceMode, setVoiceMode] = useState(false); // When true, agent speaks responses
  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const { toast } = useToast();

  // Text-to-speech function to speak agent responses
  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('Speech synthesis not available');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Clean text for speech (remove markdown, bullets, etc.)
    const cleanText = text
      .replace(/\*\*/g, '') // Remove bold markdown
      .replace(/\*/g, '')
      .replace(/•/g, '')
      .replace(/🎤/g, 'microphone')
      .replace(/[#`_~]/g, '')
      .replace(/\n+/g, '. ') // Convert newlines to pauses
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Samantha')
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    speechSynthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          setInterimTranscript("");
          toast({
            title: "🎤 Voice Mode Active",
            description: "Listening... Speak your command now.",
          });
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = '';
          let interim = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interim += transcript;
            }
          }

          if (finalTranscript) {
            setInput(prev => prev + finalTranscript);
            setInterimTranscript("");
          } else {
            setInterimTranscript(interim);
          }
        };

        recognition.onerror = (event: Event) => {
          console.error('Speech recognition error:', event);
          setIsListening(false);
          setInterimTranscript("");
          toast({
            title: "Voice Error",
            description: "Could not recognize speech. Please try again.",
            variant: "destructive",
          });
        };

        recognition.onend = () => {
          setIsListening(false);
          setInterimTranscript("");
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [toast]);

  // Toggle voice recording
  const toggleVoiceInput = useCallback(() => {
    if (!recognitionRef.current) {
      toast({
        title: "Voice Not Supported",
        description: "Your browser doesn't support voice input. Please use Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    // Stop any ongoing speech when user wants to speak
    stopSpeaking();

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      // Auto-send if we have text
      if (input.trim()) {
        setTimeout(() => handleSend(), 100);
      }
    } else {
      // Enable voice mode - agent will speak responses
      setVoiceMode(true);
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Failed to start recognition:', err);
        toast({
          title: "Microphone Error",
          description: "Could not access microphone. Please check permissions.",
          variant: "destructive",
        });
      }
    }
  }, [isListening, input, toast, stopSpeaking]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    setCurrentAction("Thinking...");
    setError(null);

    try {
      // Build message history for context (last 10 messages)
      const messageHistory = [...messages, userMsg].slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      setCurrentAction("Analyzing request...");

      const response = await apiRequest("POST", "/api/ai-operator/chat", {
        messages: messageHistory,
        includeContext: true,
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Parse the response
      const content = data.message?.content || "I apologize, I couldn't generate a response.";

      // Build action summary
      let actionDetails = undefined;
      if (data.toolsExecuted && data.toolsExecuted.length > 0) {
        actionDetails = {
          type: "analyze_data" as const,
          status: "completed" as const,
          details: `Executed ${data.toolsExecuted.length} tool(s) in ${data.iterations || 1} iteration(s)`,
        };
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: content,
        timestamp: new Date(),
        thoughtProcess: data.thoughtProcess || [],
        toolsExecuted: data.toolsExecuted || [],
        iterations: data.iterations || 1,
        isComplete: data.isComplete !== false,
        action: actionDetails,
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Speak the response if voice mode is active
      if (voiceMode) {
        speakText(content);
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      setError(err.message || "Failed to get response");
      
      // Add error message to chat
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `I encountered an error: ${err.message || "Unable to process your request"}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      
      toast({
        title: "Error",
        description: err.message || "Failed to get AI response",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
      setCurrentAction(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-muted/10 rounded-2xl border border-border/50 shadow-xl overflow-hidden backdrop-blur-sm">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b bg-background/80 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Agent</h3>
            <p className="text-xs text-muted-foreground">Ready to help</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
          Online
        </Badge>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6 max-w-3xl mx-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-4 group",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Avatar */}
              <Avatar className={cn(
                "h-9 w-9 mt-1 shadow-sm",
                msg.role === "assistant" 
                  ? "bg-gradient-to-br from-violet-500 to-purple-600 border-0" 
                  : "bg-gradient-to-br from-slate-500 to-slate-600 border-0"
              )}>n                {msg.role === "assistant" ? (
                  <AvatarFallback className="bg-transparent text-white"><Sparkles className="h-4 w-4" /></AvatarFallback>
                ) : (
                  <AvatarFallback className="bg-transparent text-white"><User className="h-4 w-4" /></AvatarFallback>
                )}
              </Avatar>

              {/* Message Content */}
              <div className={cn(
                "flex flex-col max-w-[80%]",
                msg.role === "user" ? "items-end" : "items-start"
              )}>
                {/* Name & Time */}
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {msg.role === "assistant" ? "AgentX" : "You"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Bubble */}
                <div className={cn(
                  "rounded-2xl px-4 py-3 text-sm shadow-md",
                  msg.role === "user" 
                    ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-tr-md" 
                    : "bg-card border border-border/50 text-card-foreground rounded-tl-md shadow-sm"
                )}>
                  {/* Thought Process (Collapsible) - Array version */}
                  {msg.thoughtProcess && msg.thoughtProcess.length > 0 && (
                    <ThoughtProcess content={msg.thoughtProcess} />
                  )}

                  {/* Tools Executed Summary */}
                  {msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                    <ToolsExecutedSummary tools={msg.toolsExecuted} />
                  )}

                  <div className="whitespace-pre-wrap leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                    {msg.content}
                  </div>

                  {/* Code Block */}
                  {msg.codeBlock && (
                    <div className="mt-3 rounded-md overflow-hidden border bg-muted/50">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b text-xs text-muted-foreground">
                        <span>{msg.codeBlock.language}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-background/50">
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <pre className="p-3 overflow-x-auto text-xs font-mono">
                        <code>{msg.codeBlock.code}</code>
                      </pre>
                    </div>
                  )}

                  {/* Action Result */}
                  {msg.action && (
                    <div className="mt-3 flex items-center gap-2 p-2 rounded bg-background/50 border text-xs">
                      {msg.action.status === "completed" ? (
                        <div className="h-4 w-4 rounded-full bg-green-500/20 flex items-center justify-center">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                        </div>
                      ) : (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      <span className="font-medium">{msg.action.details}</span>
                    </div>
                  )}
                </div>

                {/* Message Actions (Hover) */}
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                      <ThumbsUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                      <ThumbsDown className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing Indicator with Current Action */}
          {isTyping && (
            <div className="flex gap-4">
              <Avatar className="h-8 w-8 mt-1 border bg-primary/10 border-primary/20">
                <AvatarFallback className="bg-transparent text-primary"><Sparkles className="h-4 w-4" /></AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <div className="bg-card border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="font-medium">{currentAction || "Working..."}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <div className="h-2 w-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="h-2 w-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="h-2 w-2 bg-primary/40 rounded-full animate-bounce" />
                  </div>
                </div>
                <div className="flex items-center gap-2 px-2">
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Agent is working autonomously...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-gradient-to-t from-background via-background to-transparent border-t border-border/50">
        <div className="max-w-3xl mx-auto relative">
          {/* Voice Recording Indicator */}
          {(isListening || isSpeaking) && (
            <div className="absolute -top-14 left-0 right-0 flex justify-center z-10">
              {isListening ? (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-600 px-5 py-2.5 rounded-full shadow-lg backdrop-blur-sm">
                  <div className="relative">
                    <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                    <div className="absolute inset-0 h-3 w-3 bg-red-500 rounded-full animate-ping" />
                  </div>
                  <span className="text-sm font-medium">Listening...</span>
                  {interimTranscript && (
                    <span className="text-xs text-muted-foreground ml-2 max-w-[200px] truncate">
                      "{interimTranscript}"
                    </span>
                  )}
                </div>
              ) : isSpeaking ? (
                <div 
                  onClick={stopSpeaking}
                  className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/30 text-violet-600 px-5 py-2.5 rounded-full cursor-pointer hover:bg-violet-500/20 transition-colors shadow-lg backdrop-blur-sm"
                >
                  <Volume2 className="h-4 w-4 animate-pulse" />
                  <span className="text-sm font-medium">Speaking...</span>
                  <span className="text-xs opacity-70">(click to stop)</span>
                </div>
              ) : null}
            </div>
          )}

          <div className="relative flex items-end gap-2 bg-muted/40 border border-border/50 rounded-2xl p-2.5 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500/50 transition-all shadow-sm">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground shrink-0 mb-0.5 hover:bg-background/50 rounded-xl">
              <Paperclip className="h-4 w-4" />
            </Button>
            
            <Textarea
              ref={textareaRef}
              value={input + (interimTranscript ? ` ${interimTranscript}` : '')}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening... speak now" : "Ask anything about your CRM, campaigns, or data..."}
              className={cn(
                "min-h-[20px] max-h-[200px] border-0 bg-transparent focus-visible:ring-0 px-2 py-1.5 resize-none",
                isListening && "placeholder:text-red-500"
              )}
              rows={1}
            />

            <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
              {/* Voice Mode Toggle */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  if (isSpeaking) {
                    stopSpeaking();
                  }
                  setVoiceMode(v => !v);
                  toast({
                    title: voiceMode ? "🔇 Voice Mode Off" : "🔊 Voice Mode On",
                    description: voiceMode ? "Agent will no longer speak responses" : "Agent will now speak responses aloud",
                  });
                }}
                className={cn(
                  "h-9 w-9 transition-all rounded-xl",
                  voiceMode 
                    ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-md" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title={voiceMode ? "Disable voice responses" : "Enable voice responses"}
              >
                {voiceMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              {/* Mic Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleVoiceInput}
                className={cn(
                  "h-9 w-9 transition-all rounded-xl",
                  isListening 
                    ? "bg-gradient-to-br from-red-500 to-rose-600 text-white hover:from-red-600 hover:to-rose-700 shadow-md animate-pulse" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title={isListening ? "Stop listening (will send)" : "Start voice input"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button 
                onClick={handleSend} 
                disabled={(!input.trim() && !interimTranscript) || isTyping}
                size="icon"
                className={cn(
                  "h-9 w-9 transition-all rounded-xl",
                  input.trim() 
                    ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-md" 
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground mt-3">
            <span className="flex items-center gap-1"><Mic className="h-3 w-3" /> Speak commands</span>
            <span className="text-muted-foreground/30">•</span>
            <span className="flex items-center gap-1"><Volume2 className="h-3 w-3" /> Agent speaks back</span>
            <span className="text-muted-foreground/30">•</span>
            <span>Press Enter to send</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThoughtProcess({ content }: { content: string[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!content || content.length === 0) return null;

  return (
    <div className="mb-3 border-b border-border/50 pb-3">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Wrench className="h-3 w-3" />
        Agent Activity ({content.length} steps)
      </button>
      {isOpen && (
        <div className="mt-2 space-y-1">
          {content.map((step, idx) => (
            <div 
              key={idx} 
              className="flex items-start gap-2 text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded"
            >
              <span className="text-primary/60 shrink-0">{idx + 1}.</span>
              <span className="break-all">{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolsExecutedSummary({ tools }: { tools: ToolExecution[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!tools || tools.length === 0) return null;

  return (
    <div className="mb-3 border-b border-border/50 pb-3">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <CheckCircle2 className="h-3 w-3" />
        {tools.length} Tool(s) Executed Successfully
      </button>
      {isOpen && (
        <div className="mt-2 space-y-2">
          {tools.map((tool, idx) => (
            <div 
              key={idx} 
              className="text-xs bg-muted/50 rounded-md p-2 border border-border/50"
            >
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Database className="h-3 w-3 text-primary" />
                {tool.tool}
              </div>
              <div className="mt-1 text-muted-foreground font-mono text-[10px]">
                Args: {JSON.stringify(tool.args)}
              </div>
              {tool.result && !tool.result.error && (
                <div className="mt-1 text-green-600 dark:text-green-400 font-mono text-[10px]">
                  ✓ {typeof tool.result === 'object' 
                    ? (tool.result.count !== undefined 
                        ? `Count: ${tool.result.count}` 
                        : tool.result.completed 
                          ? 'Task complete' 
                          : 'Data retrieved')
                    : String(tool.result).substring(0, 100)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
