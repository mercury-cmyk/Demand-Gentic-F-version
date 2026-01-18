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
  const [mode, setMode] = useState<SimulationMode>("interactive");
  const [selectedPersona, setSelectedPersona] = useState<string>("neutral_dm");
  const [maxTurns, setMaxTurns] = useState<number>(10);
  const [session, setSession] = useState<SimulationSession | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available personas
  const { data: personasData } = useQuery<{ personas: PersonaPreset[] }>({
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
      <Card>
        <CardContent className="py-12 text-center">
          <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Select Context</h2>
          <p className="text-muted-foreground mb-4">
            Choose a campaign and account to start a simulation.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>No phone number required</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Configuration state (before simulation starts)
  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            True Simulation
          </CardTitle>
          <CardDescription>
            Test your AI agent without any telephony — no phone, no dialer, no carrier
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Decoupling indicator */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">Fully Decoupled from Telephony</p>
                <ul className="text-sm text-green-700 mt-1 space-y-1">
                  <li>✓ No phone number required</li>
                  <li>✓ No SIP/carrier connection</li>
                  <li>✓ No voicemail detection</li>
                  <li>✓ Pure conversation simulation</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Mode Selection */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Simulation Mode</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as SimulationMode)}>
              <div className="flex gap-4">
                <div className={cn(
                  "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  mode === "interactive" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/50"
                )}>
                  <RadioGroupItem value="interactive" id="interactive" />
                  <div>
                    <Label htmlFor="interactive" className="font-medium cursor-pointer">
                      Interactive
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      You play the human, agent responds in real-time
                    </p>
                  </div>
                </div>
                <div className={cn(
                  "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  mode === "automated" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/50"
                )}>
                  <RadioGroupItem value="automated" id="automated" />
                  <div>
                    <Label htmlFor="automated" className="font-medium cursor-pointer">
                      Automated
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      AI persona simulates human, full conversation runs
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Persona Selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              <Users className="h-4 w-4 inline mr-1" />
              Simulated Human Persona
            </Label>
            <Select value={selectedPersona} onValueChange={setSelectedPersona}>
              <SelectTrigger>
                <SelectValue placeholder="Select a persona" />
              </SelectTrigger>
              <SelectContent>
                {personas.map((persona) => (
                  <SelectItem key={persona.id} value={persona.id}>
                    <div className="flex items-center gap-2">
                      <span>{persona.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {persona.disposition}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              The persona determines how the simulated human will respond
            </p>
          </div>

          {/* Max Turns */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Max Conversation Turns: {maxTurns}
            </Label>
            <Slider
              value={[maxTurns]}
              onValueChange={([v]) => setMaxTurns(v)}
              min={4}
              max={30}
              step={2}
            />
          </div>

          <Separator />

          {/* Start Button */}
          <Button
            size="lg"
            className="w-full"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Start Simulation
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Active or completed simulation
  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* Header */}
      <Card className="mb-4 flex-shrink-0">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Simulation
                  <Badge variant={session.status === "active" ? "default" : "secondary"}>
                    {session.status}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Turn {session.currentTurn} / {session.maxTurns} • {mode} mode
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {session.status === "active" && (
                <>
                  {mode === "interactive" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => autoTurnMutation.mutate()}
                      disabled={autoTurnMutation.isPending}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Auto Turn
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => endMutation.mutate()}
                    disabled={endMutation.isPending}
                  >
                    <Brain className="h-3 w-3 mr-1" />
                    End & Evaluate
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Transcript */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {session.transcript.map((turn, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-3",
                  turn.role === "agent" ? "" : "flex-row-reverse"
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    turn.role === "agent"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {turn.role === "agent" ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={cn(
                    "flex-1 max-w-[80%]",
                    turn.role === "human" && "text-right"
                  )}
                >
                  <div
                    className={cn(
                      "inline-block rounded-lg px-4 py-2",
                      turn.role === "agent"
                        ? "bg-muted/50"
                        : "bg-primary text-primary-foreground"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{turn.content}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{turn.role === "agent" ? "Agent" : "Human (Simulated)"}</span>
                    {turn.metadata?.stage && (
                      <Badge variant="outline" className="text-xs">
                        {turn.metadata.stage}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {(messageMutation.isPending || autoTurnMutation.isPending) && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input (interactive mode only) */}
        {session.status === "active" && mode === "interactive" && (
          <div className="border-t p-4 flex-shrink-0">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type as the human prospect..."
                disabled={messageMutation.isPending}
                className="min-h-[60px] resize-none"
                rows={2}
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || messageMutation.isPending}
                className="self-end"
              >
                {messageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send. You are playing the prospect.
            </p>
          </div>
        )}

        {/* Evaluation (when completed) */}
        {session.status === "completed" && session.evaluation && (
          <div className="border-t p-4 flex-shrink-0 bg-muted/30">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className={cn(
                  "text-3xl font-bold",
                  session.evaluation.overallScore >= 70 ? "text-green-600" :
                  session.evaluation.overallScore >= 50 ? "text-amber-600" : "text-red-600"
                )}>
                  {session.evaluation.overallScore}
                </div>
                <div className="text-xs text-muted-foreground">Score</div>
              </div>
              <Separator orientation="vertical" className="h-12" />
              <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  {session.evaluation.metrics.identityConfirmation ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                  Identity Check
                </div>
                <div className="flex items-center gap-1">
                  {session.evaluation.metrics.valuePropositionDelivered ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                  Value Prop
                </div>
                <div className="flex items-center gap-1">
                  {session.evaluation.metrics.callToActionDelivered ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                  Call to Action
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default TrueSimulationPanel;
