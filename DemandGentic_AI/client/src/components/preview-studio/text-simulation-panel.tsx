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
  agentSettings: Record;
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
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [sessionMemory, setSessionMemory] = useState(createInitialSessionMemory());
  const [provider, setProvider] = useState('openai');
  const [simulationStarted, setSimulationStarted] = useState(false);
  const [useServerAnalysis, setUseServerAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch assembled prompt
  const { data: promptData, isLoading: promptLoading } = useQuery({
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
      return response.json() as Promise;
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
    if (messages.length  ({
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
    if (messages.length  
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
      
        
          
          Select Context
          
            Choose a campaign and account from the sidebar to start a text simulation.
          
          
            Text simulation allows you to test your AI agent without making actual phone calls.
          
        
      
    );
  }

  if (promptLoading) {
    return (
      
        
        
      
    );
  }

  // Not started yet - show start screen
  if (!simulationStarted) {
    return (
      
        
          
            
            Text Simulation
          
          
            Test your AI agent's responses in a text-based conversation (no phone call required)
          
        
        
          {promptData?.firstMessage ? (
            <>
              
                First Message (Agent Opens)
                
                  "{promptData.firstMessage}"
                
              

              
                
                  AI Provider
                   setProvider(v as 'openai' | 'gemini')}>
                    
                      
                    
                    
                      OpenAI (GPT-4o-mini)
                      Google Gemini
                    
                  
                
              

              {/* Server Analysis Toggle */}
              
                 setUseServerAnalysis(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                
                  Use Server AI Analysis
                  
                    Analyze with Vertex AI (same as production calls) instead of client-side heuristics
                  
                
              

              
                
                  
                  Start Simulation
                
              
            
          ) : (
            
              
              
                Loading agent configuration...
              
            
          )}
        
      
    );
  }

  // Active simulation
  return (
    
      {/* Header */}
      
        
          
            
              
                
              
              
                Text Simulation
                
                  {messages.length} messages - {provider === 'openai' ? 'OpenAI' : 'Gemini'}
                  {useServerAnalysis && ' (Server AI)'}
                
              
            
            
              
                
                Reset
              
              
                
                Save to CI
              
              
                {isAnalyzing ? (
                  
                ) : (
                  
                )}
                {isAnalyzing ? 'Analyzing...' : 'End & Analyze'}
              
            
          
        
      

      {/* Messages */}
      
        
          
            {messages.map((message, index) => (
              
                
                  {message.role === 'assistant' ? (
                    
                  ) : (
                    
                  )}
                
                
                  
                    {message.content}
                  
                  
                    
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    
                    {message.stage && (
                      
                        {message.stage}
                      
                    )}
                    {message.intent && message.role === 'user' && (
                      
                        {message.intent}
                      
                    )}
                  
                
              
            ))}
            {chatMutation.isPending && (
              
                
                  
                
                
                  
                
              
            )}
          
        

        {/* Input */}
        
          
             setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response as the prospect..."
              disabled={chatMutation.isPending}
              className="flex-1"
            />
            
              {chatMutation.isPending ? (
                
              ) : (
                
              )}
            
          
          
            Press Enter to send. You are playing the role of the prospect.
          
        
      
    
  );
}