/**
 * True Simulation Panel - FULLY DECOUPLED from Telephony
 * 
 * This component provides:
 * - NO phone number field (hidden when call_mode = SIMULATION)
 * - Persona-based human simulation
 * - Interactive or automated conversation modes
 * - Complete bypass of dialer/SIP/carrier
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Send,
  Play,
  Pause,
  RotateCcw,
  Bot,
  User,
  Loader2,
  Sparkles,
  Brain,
  CheckCircle2,
  AlertTriangle,
  Users,
  Zap,
  Settings2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Types matching backend
interface SimulatedHumanProfile {
  role: string;
  disposition: "friendly" | "neutral" | "skeptical" | "hostile";
  objections: string[];
  buyingSignals?: string[];
  communicationStyle: "brief" | "verbose" | "technical" | "executive";
  gatekeeperType?: "assistant" | "receptionist" | "voicemail" | null;
}

interface SimulationTurn {
  role: "agent" | "human";
  content: string;
  timestamp: string;
  metadata?: {
    stage?: string;
    intent?: string;
  };
}

interface SimulationSession {
  id: string;
  status: "active" | "completed" | "error";
  currentTurn: number;
  maxTurns: number;
  humanProfile: SimulatedHumanProfile;
  transcript: SimulationTurn[];
  evaluation?: SimulationEvaluation;
}

interface SimulationEvaluation {
  overallScore: number;
  metrics: {
    identityConfirmation: boolean;
    qualificationQuestions: number;
    objectionsHandled: number;
    valuePropositionDelivered: boolean;
    callToActionDelivered: boolean;
    toneProfessional: boolean;
    complianceViolations: string[];
  };
  recommendations: string[];
  conversationStages: string[];
}

interface PersonaPreset {
  id: string;
  name: string;
  role: string;
  disposition: string;
  description?: string;
}

interface TrueSimulationPanelProps {
  campaignId: string | null;
  accountId: string | null;
  contactId?: string | null;
  virtualAgentId?: string | null;
  onComplete?: (evaluation: SimulationEvaluation) => void;
}

type SimulationMode = "interactive" | "automated";

export function TrueSimulationPanel({
  campaignId,
  accountId,
  contactId,
  virtualAgentId,
  onComplete,
}: TrueSimulationPanelProps) {
  // State
  const [mode, setMode] = useState("interactive");
  const [selectedPersona, setSelectedPersona] = useState("neutral_dm");
  const [maxTurns, setMaxTurns] = useState(10);
  const [session, setSession] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  
  const { toast } = useToast();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch available personas
  const { data: personasData } = useQuery({
    queryKey: ["/api/simulations/personas"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/simulations/personas");
      return res.json();
    },
  });

  const personas = personasData?.personas || [];

  // Start simulation mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulations/start", {
        campaignId,
        accountId,
        contactId,
        virtualAgentId,
        personaPreset: selectedPersona,
        maxTurns,
        runFullSimulation: mode === "automated",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSession(data.session);
      if (mode === "automated" && data.session.evaluation) {
        onComplete?.(data.session.evaluation);
      }
      toast({
        title: "Simulation Started",
        description: mode === "automated" 
          ? "Full simulation completed" 
          : "Interactive simulation ready",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start simulation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send message mutation (interactive mode)
  const messageMutation = useMutation({
    mutationFn: async (humanMessage: string) => {
      const res = await apiRequest("POST", "/api/simulations/message", {
        sessionId: session!.id,
        humanMessage,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSession(data.session);
      setInputValue("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-turn mutation (for step-by-step automated)
  const autoTurnMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulations/auto-turn", {
        sessionId: session!.id,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSession(data.session);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to process turn",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // End simulation mutation
  const endMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/simulations/${session!.id}/end`);
      return res.json();
    },
    onSuccess: (data) => {
      setSession(prev => prev ? { ...prev, status: "completed" } : null);
      if (data.evaluation) {
        onComplete?.(data.evaluation);
      }
      toast({
        title: "Simulation Ended",
        description: `Score: ${data.evaluation?.overallScore || 0}/100`,
      });
    },
  });

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.transcript]);

  // Handle send message
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !session) return;
    messageMutation.mutate(inputValue.trim());
  }, [inputValue, session, messageMutation]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Reset
  const handleReset = () => {
    setSession(null);
    setInputValue("");
    setIsRunning(false);
  };

  // Not ready state
  if (!campaignId || !accountId) {
    return (
      
        
          
          Select Context
          
            Choose a campaign and account to start a simulation.
          
          
            
            No phone number required
          
        
      
    );
  }

  // Configuration state (before simulation starts)
  if (!session) {
    return (
      
        
          
            
            True Simulation
          
          
            Test your AI agent without any telephony — no phone, no dialer, no carrier
          
        
        
          {/* Decoupling indicator */}
          
            
              
              
                Fully Decoupled from Telephony
                
                  ✓ No phone number required
                  ✓ No SIP/carrier connection
                  ✓ No voicemail detection
                  ✓ Pure conversation simulation
                
              
            
          

          {/* Mode Selection */}
          
            Simulation Mode
             setMode(v as SimulationMode)}>
              
                
                  
                  
                    
                      Interactive
                    
                    
                      You play the human, agent responds in real-time
                    
                  
                
                
                  
                  
                    
                      Automated
                    
                    
                      AI persona simulates human, full conversation runs
                    
                  
                
              
            
          

          {/* Persona Selection */}
          
            
              
              Simulated Human Persona
            
            
              
                
              
              
                {personas.map((persona) => (
                  
                    
                      {persona.name}
                      
                        {persona.disposition}
                      
                    
                  
                ))}
              
            
            
              The persona determines how the simulated human will respond
            
          

          {/* Max Turns */}
          
            
              Max Conversation Turns: {maxTurns}
            
             setMaxTurns(v)}
              min={4}
              max={30}
              step={2}
            />
          

          

          {/* Start Button */}
           startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? (
              
            ) : (
              
            )}
            Start Simulation
          
        
      
    );
  }

  // Active or completed simulation
  return (
    
      {/* Header */}
      
        
          
            
              
                
              
              
                
                  Simulation
                  
                    {session.status}
                  
                
                
                  Turn {session.currentTurn} / {session.maxTurns} • {mode} mode
                
              
            
            
              {session.status === "active" && (
                <>
                  {mode === "interactive" && (
                     autoTurnMutation.mutate()}
                      disabled={autoTurnMutation.isPending}
                    >
                      
                      Auto Turn
                    
                  )}
                   endMutation.mutate()}
                    disabled={endMutation.isPending}
                  >
                    
                    End & Evaluate
                  
                
              )}
              
                
                Reset
              
            
          
        
      

      {/* Transcript */}
      
        
          
            {session.transcript.map((turn, index) => (
              
                
                  {turn.role === "agent" ? (
                    
                  ) : (
                    
                  )}
                
                
                  
                    {turn.content}
                  
                  
                    {turn.role === "agent" ? "Agent" : "Human (Simulated)"}
                    {turn.metadata?.stage && (
                      
                        {turn.metadata.stage}
                      
                    )}
                  
                
              
            ))}
            
            {(messageMutation.isPending || autoTurnMutation.isPending) && (
              
                
                  
                
                
                  
                
              
            )}
          
        

        {/* Input (interactive mode only) */}
        {session.status === "active" && mode === "interactive" && (
          
            
               setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type as the human prospect..."
                disabled={messageMutation.isPending}
                className="min-h-[60px] resize-none"
                rows={2}
              />
              
                {messageMutation.isPending ? (
                  
                ) : (
                  
                )}
              
            
            
              Press Enter to send. You are playing the prospect.
            
          
        )}

        {/* Evaluation (when completed) */}
        {session.status === "completed" && session.evaluation && (
          
            
              
                = 70 ? "text-green-600" :
                  session.evaluation.overallScore >= 50 ? "text-amber-600" : "text-red-600"
                )}>
                  {session.evaluation.overallScore}
                
                Score
              
              
              
                
                  {session.evaluation.metrics.identityConfirmation ? (
                    
                  ) : (
                    
                  )}
                  Identity Check
                
                
                  {session.evaluation.metrics.valuePropositionDelivered ? (
                    
                  ) : (
                    
                  )}
                  Value Prop
                
                
                  {session.evaluation.metrics.callToActionDelivered ? (
                    
                  ) : (
                    
                  )}
                  Call to Action
                
              
            
          
        )}
      
    
  );
}

export default TrueSimulationPanel;