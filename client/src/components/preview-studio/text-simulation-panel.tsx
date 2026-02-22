import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare,
  Send,
  RefreshCw,
  Loader2,
  Bot,
  User,
  StopCircle,
  Brain,
  Sparkles,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { PreviewMessage, SessionMemory, EvaluationReport } from "@/types/call-analysis";
import {
  createInitialSessionMemory,
  updateSessionMemory,
  generateEvaluationReport,
  detectUserIntent,
  detectConversationStage,
} from "@/lib/call-analysis";

interface TextSimulationPanelProps {
  campaignId: string | null;
  accountId: string | null;
  contactId: string | null;
  onAnalysisReady: (report: EvaluationReport) => void;
}

interface AssembledPromptResponse {
  systemPrompt: string;
  firstMessage: string;
  sections: {
    foundation: string;
    campaign: string;
    account: string;
    contact: string;
    callPlan: string;
  };
  tokenCount: number;
  virtualAgentId: string | null;
  agentSettings: Record<string, unknown>;
  agentSettingsSource: 'agent' | 'default';
  hasAgent: boolean;
}

interface ChatResponse {
  reply: string;
  sessionId: string;
  conversationState?: {
    identityConfirmed: boolean;
    currentStage: string;
  };
}

export function TextSimulationPanel({
  campaignId,
  accountId,
  contactId,
  onAnalysisReady,
}: TextSimulationPanelProps) {
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionMemory, setSessionMemory] = useState<SessionMemory>(createInitialSessionMemory());
  const [provider, setProvider] = useState<'openai' | 'gemini'>('openai');
  const [simulationStarted, setSimulationStarted] = useState(false);
  const [useServerAnalysis, setUseServerAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch assembled prompt
  const { data: promptData, isLoading: promptLoading } = useQuery<AssembledPromptResponse>({
    queryKey: ['/api/preview-studio/assembled-prompt', campaignId, accountId, contactId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaignId', campaignId);
      if (accountId) params.set('accountId', accountId);
      if (contactId) params.set('contactId', contactId);
      const response = await apiRequest('GET', `/api/preview-studio/assembled-prompt?${params.toString()}`);
      return response.json();
    },
    enabled: !!(campaignId && accountId),
  });

  // Chat mutation - calls the new simulation chat endpoint
  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      // Use 60s timeout for AI simulation endpoints
      const response = await apiRequest('POST', '/api/preview-studio/simulation/chat', {
        sessionId,
        campaignId,
        accountId,
        contactId,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        userMessage,
        provider,
      }, { timeout: 60000 });
      return response.json() as Promise<ChatResponse>;
    },
    onSuccess: (data) => {
      const assistantMessage: PreviewMessage = {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
        stage: detectConversationStage([...messages, { role: 'assistant', content: data.reply, timestamp: new Date() }]),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setSessionMemory(prev => updateSessionMemory(prev, assistantMessage));
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
    },
    onError: (error: Error) => {
      console.error('Text simulation error:', error);
      
      // Parse the error message to provide better feedback
      let errorMessage = error.message || 'Failed to get response';
      
      // Check for specific error patterns
      if (errorMessage.includes('timed out') || errorMessage.includes('AbortError')) {
        errorMessage = 'Request timed out. The AI service may be slow. Please try again.';
      } else if (errorMessage.includes('API key') || errorMessage.includes('401')) {
        errorMessage = 'AI service authentication failed. Please check your API keys in settings.';
      } else if (errorMessage.includes('Gemini error') || errorMessage.includes('OpenAI')) {
        errorMessage = `AI service error: ${errorMessage}`;
      }
      
      // Add error message to chat
      const errorMessage_display: PreviewMessage = {
        role: 'assistant',
        content: `⚠️ Error: ${errorMessage}`,
        timestamp: new Date(),
        stage: 'error',
      };
      setMessages(prev => [...prev, errorMessage_display]);
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Start simulation with first message
  const handleStartSimulation = useCallback(async () => {
    if (!promptData?.firstMessage) return;

    setSimulationStarted(true);
    const firstMessage: PreviewMessage = {
      role: 'assistant',
      content: promptData.firstMessage,
      timestamp: new Date(),
      stage: 'opening',
    };
    setMessages([firstMessage]);
    setSessionMemory(createInitialSessionMemory());
    setSessionId(null);

    // Focus input after starting
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [promptData?.firstMessage]);

  // Send message
  const handleSendMessage = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMessage: PreviewMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
      intent: detectUserIntent(trimmed),
      stage: detectConversationStage(messages),
    };

    setMessages(prev => [...prev, userMessage]);
    setSessionMemory(prev => updateSessionMemory(prev, userMessage));
    setInputValue("");

    chatMutation.mutate(trimmed);
  }, [inputValue, chatMutation, messages]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // End simulation and trigger analysis
  const handleEndSimulation = useCallback(async () => {
    if (messages.length < 2) return;

    if (useServerAnalysis) {
      // Use server-side AI analysis (Vertex AI)
      setIsAnalyzing(true);
      try {
        // Send messages as array for server to process
        const transcript = messages.map(m => ({
          role: m.role,
          content: m.content,
        }));

        const response = await apiRequest('POST', '/api/preview-studio/analyze', {
          transcript,
          campaignId,
          accountId,
          sessionId,
        });
        const analysisResult = await response.json();
        
        // Map server analysis to EvaluationReport format
        const analysis = analysisResult.analysis || {};
        const scorecard = analysis.scorecard || {};
        
        const report: EvaluationReport = {
          executiveSummary: {
            whatWentWell: analysis.executiveSummary?.whatWentWell || [],
            whatHurtConversation: analysis.executiveSummary?.needsImprovement || [],
            verdict: (analysis.executiveSummary?.verdict || 'needs-edits') as 'approve' | 'needs-edits' | 'reject',
          },
          scorecard: {
            clarity: Math.round((scorecard.intelligence || 20) * 0.67), // Scale 30→20
            authority: Math.round((scorecard.closing || 25) * 0.72), // Scale 35→25
            brevity: Math.round((scorecard.voicemail || 10) * 1.5), // Scale 10→15
            questionQuality: Math.round((scorecard.intelligence || 20) * 0.5), // Scale 30→15
            objectionHandling: Math.round((scorecard.objectionHandling || 25) * 0.43), // Scale 35→15
            compliance: Math.round((scorecard.humanity || 18) * 0.6), // Scale 25→15
            humanity: Math.round((scorecard.humanity || 15) * 0.8), // Scale 25→20
            intelligence: Math.round((scorecard.intelligence || 10) * 0.5), // Scale 30→15
            total: Math.round((scorecard.total || 90) * 0.82), // Scale 135→110 approximate
          },
          timelineHighlights: (analysis.timelineHighlights || []).map((h: any, i: number) => ({
            turn: h.turnNumber || i + 1,
            role: h.speaker === 'agent' ? 'assistant' : 'user',
            summary: h.summary || '',
            tag: h.tag || 'unclear',
          })),
          objectionReview: {
            detected: analysis.objectionReview?.details || [],
            responseQuality: `${analysis.objectionReview?.objectionsHandled || 0}/${analysis.objectionReview?.objectionsIdentified || 0} handled`,
            betterAlternatives: [],
          },
          promptImprovements: (analysis.promptImprovements || []).map((p: string) => ({
            originalLine: 'Current prompt behavior',
            replacement: p,
            reason: 'AI recommendation',
          })),
          recommendedPrompt: (analysis.promptImprovements || []).join('\n'),
          learningNotes: [
            ...(analysis.executiveSummary?.needsImprovement || []),
            analysis.nextStepRecommendation || '',
          ].filter(Boolean),
          voicemailDiscipline: {
            passed: analysis.voicemailDiscipline?.passed ?? true,
            violations: analysis.voicemailDiscipline?.violations || [],
          },
          humanityReport: {
            score: scorecard.humanity || 15,
            maxScore: 25,
            passed: (scorecard.humanity || 15) >= 18,
            issues: analysis.humanityReport?.issues || [],
          },
          intelligenceReport: {
            score: scorecard.intelligence || 20,
            maxScore: 30,
            passed: (scorecard.intelligence || 20) >= 20,
            issues: analysis.intelligenceReport?.insights || [],
          },
        };
        onAnalysisReady(report);
      } catch (error) {
        console.error('Server analysis failed, falling back to client:', error);
        // Fallback to client-side analysis
        const report = generateEvaluationReport(messages, sessionMemory);
        onAnalysisReady(report);
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      // Use client-side heuristic analysis
      const report = generateEvaluationReport(messages, sessionMemory);
      onAnalysisReady(report);
    }
  }, [messages, sessionMemory, onAnalysisReady, useServerAnalysis, campaignId, accountId, sessionId]);

  // Save session to leads for conversation intelligence
  const handleSaveToLeads = useCallback(async () => {
    if (messages.length < 2 || !campaignId || !accountId) return;

    try {
      const transcript = messages.map(m => 
        `${m.role === 'assistant' ? 'Agent' : 'Contact'}: ${m.content}`
      ).join('\n');

      const response = await apiRequest('POST', '/api/preview-studio/save-as-lead', {
        campaignId,
        accountId,
        contactId,
        transcript,
        sessionId,
        simulationType: 'text',
        provider,
      });
      const result = await response.json();
      console.log('Saved to leads:', result);
      return result;
    } catch (error) {
      console.error('Failed to save to leads:', error);
      throw error;
    }
  }, [messages, campaignId, accountId, contactId, sessionId, provider]);

  // Reset simulation
  const handleReset = () => {
    setMessages([]);
    setSessionId(null);
    setSessionMemory(createInitialSessionMemory());
    setSimulationStarted(false);
  };

  if (!campaignId || !accountId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Select Context</h2>
          <p className="text-muted-foreground mb-4">
            Choose a campaign and account from the sidebar to start a text simulation.
          </p>
          <p className="text-sm text-muted-foreground">
            Text simulation allows you to test your AI agent without making actual phone calls.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (promptLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Not started yet - show start screen
  if (!simulationStarted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Text Simulation
          </CardTitle>
          <CardDescription>
            Test your AI agent's responses in a text-based conversation (no phone call required)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {promptData?.firstMessage ? (
            <>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="text-sm font-medium mb-2">First Message (Agent Opens)</div>
                <p className="text-sm text-muted-foreground italic">
                  "{promptData.firstMessage}"
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">AI Provider</label>
                  <Select value={provider} onValueChange={(v) => setProvider(v as 'openai' | 'gemini')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Server Analysis Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                <input
                  type="checkbox"
                  id="serverAnalysis"
                  checked={useServerAnalysis}
                  onChange={(e) => setUseServerAnalysis(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="serverAnalysis" className="flex-1">
                  <div className="text-sm font-medium">Use Server AI Analysis</div>
                  <div className="text-xs text-muted-foreground">
                    Analyze with Vertex AI (same as production calls) instead of client-side heuristics
                  </div>
                </label>
              </div>

              <div className="flex justify-center">
                <Button size="lg" onClick={handleStartSimulation}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Start Simulation
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading agent configuration...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Active simulation
  return (
    <div className="flex flex-col h-[calc(100vh-320px)]">
      {/* Header */}
      <Card className="mb-4">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Text Simulation</CardTitle>
                <CardDescription className="text-xs">
                  {messages.length} messages - {provider === 'openai' ? 'OpenAI' : 'Gemini'}
                  {useServerAnalysis && ' (Server AI)'}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveToLeads}
                disabled={messages.length < 2}
                title="Save to Conversation Intelligence for background AI analysis"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Save to CI
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleEndSimulation}
                disabled={messages.length < 2 || isAnalyzing}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Brain className="h-3 w-3 mr-1" />
                )}
                {isAnalyzing ? 'Analyzing...' : 'End & Analyze'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Messages */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${message.role === 'assistant' ? '' : 'flex-row-reverse'}`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                    message.role === 'assistant'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={`flex-1 max-w-[80%] ${
                    message.role === 'assistant' ? '' : 'text-right'
                  }`}
                >
                  <div
                    className={`inline-block rounded-lg px-4 py-2 ${
                      message.role === 'assistant'
                        ? 'bg-muted/50'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {message.stage && (
                      <Badge variant="outline" className="text-xs">
                        {message.stage}
                      </Badge>
                    )}
                    {message.intent && message.role === 'user' && (
                      <Badge variant="secondary" className="text-xs">
                        {message.intent}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
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

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response as the prospect..."
              disabled={chatMutation.isPending}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || chatMutation.isPending}
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send. You are playing the role of the prospect.
          </p>
        </div>
      </Card>
    </div>
  );
}
