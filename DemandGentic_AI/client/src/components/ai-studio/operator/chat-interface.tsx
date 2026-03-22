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
  const [messages, setMessages] = useState([
    {
      id: "1",
      role: "assistant",
      content:
        "Hello! I'm your **Agentic CRM Operator**. I work autonomously to complete your tasks — I'll keep querying data, analyzing, and taking action until I've fully answered your question.\n\nTry asking me:\n- \"Give me a full CRM overview\"\n- \"Find all accounts in healthcare and analyze them\"\n- \"What's our lead conversion rate?\"\n- \"Show me recent campaign performance\"",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentAction, setCurrentAction] = useState(null);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceMode, setVoiceMode] = useState(false); // When true, agent speaks responses
  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthRef = useRef(null);
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
            title: "Listening",
            description: "Speak your command now.",
          });
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = '';
          let interim = '';

          for (let i = event.resultIndex; i  prev + finalTranscript);
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

  // Auto-resize textarea - batch DOM operations to avoid forced reflows
  useEffect(() => {
    if (textareaRef.current) {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "inherit";
          const scrollHeight = textareaRef.current.scrollHeight;
          textareaRef.current.style.height = `${scrollHeight}px`;
        }
      });
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
    
      {/* Chat Header */}
      
        
          
            
              
            
            
          
          
            AI Agent
            Ready to help
          
        
        
          
          Online
        
      

      {/* Chat Area */}
      
        
          {messages.map((msg) => (
            
              {/* Avatar */}
              n                {msg.role === "assistant" ? (
                  
                ) : (
                  
                )}
              

              {/* Message Content */}
              
                {/* Name & Time */}
                
                  
                    {msg.role === "assistant" ? "AgentX" : "You"}
                  
                  
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  
                

                {/* Bubble */}
                
                  {/* Thought Process (Collapsible) - Array version */}
                  {msg.thoughtProcess && msg.thoughtProcess.length > 0 && (
                    
                  )}

                  {/* Tools Executed Summary */}
                  {msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                    
                  )}

                  
                    {msg.content}
                  

                  {/* Code Block */}
                  {msg.codeBlock && (
                    
                      
                        {msg.codeBlock.language}
                        
                          
                        
                      
                      
                        {msg.codeBlock.code}
                      
                    
                  )}

                  {/* Action Result */}
                  {msg.action && (
                    
                      {msg.action.status === "completed" ? (
                        
                          
                        
                      ) : (
                        
                      )}
                      {msg.action.details}
                    
                  )}
                

                {/* Message Actions (Hover) */}
                {msg.role === "assistant" && (
                  
                    
                      
                    
                    
                      
                    
                    
                      
                    
                  
                )}
              
            
          ))}

          {/* Typing Indicator with Current Action */}
          {isTyping && (
            
              
                
              
              
                
                  
                    
                    {currentAction || "Working..."}
                  
                  
                    
                    
                    
                  
                
                
                  
                  Agent is working autonomously...
                
              
            
          )}
          
        
      

      {/* Input Area */}
      
        
          {/* Voice Recording Indicator */}
          {(isListening || isSpeaking) && (
            
              {isListening ? (
                
                  
                    
                    
                  
                  Listening...
                  {interimTranscript && (
                    
                      "{interimTranscript}"
                    
                  )}
                
              ) : isSpeaking ? (
                
                  
                  Speaking...
                  (click to stop)
                
              ) : null}
            
          )}

          
            
              
            
            
             setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening... speak now" : "Ask anything about your CRM, campaigns, or data..."}
              className={cn(
                "min-h-[20px] max-h-[200px] border-0 bg-transparent focus-visible:ring-0 px-2 py-1.5 resize-none",
                isListening && "placeholder:text-red-500"
              )}
              rows={1}
            />

            
              {/* Voice Mode Toggle */}
               {
                  if (isSpeaking) {
                    stopSpeaking();
                  }
                  setVoiceMode(v => !v);
                  toast({
                    title: voiceMode ? "Voice responses disabled" : "Voice responses enabled",
                    description: voiceMode ? "Agent will not speak responses." : "Agent will speak responses aloud.",
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
                {voiceMode ?  : }
              
              {/* Mic Button */}
              
                {isListening ?  : }
              
              
                
              
            
          
          
             Dictate (optional)
            •
             Voice responses (optional)
            •
            Press Enter to send
          
        
      
    
  );
}

function ThoughtProcess({ content }: { content: string[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!content || content.length === 0) return null;

  return (
    
       setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ?  : }
        
        Agent Activity ({content.length} steps)
      
      {isOpen && (
        
          {content.map((step, idx) => (
            
              {idx + 1}.
              {step}
            
          ))}
        
      )}
    
  );
}

function ToolsExecutedSummary({ tools }: { tools: ToolExecution[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!tools || tools.length === 0) return null;

  return (
    
       setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
      >
        {isOpen ?  : }
        
        {tools.length} Tool(s) Executed Successfully
      
      {isOpen && (
        
          {tools.map((tool, idx) => (
            
              
                
                {tool.tool}
              
              
                Args: {JSON.stringify(tool.args)}
              
              {tool.result && !tool.result.error && (
                
                  ✓ {typeof tool.result === 'object' 
                    ? (tool.result.count !== undefined 
                        ? `Count: ${tool.result.count}` 
                        : tool.result.completed 
                          ? 'Task complete' 
                          : 'Data retrieved')
                    : String(tool.result).substring(0, 100)}
                
              )}
            
          ))}
        
      )}
    
  );
}