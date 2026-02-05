/**
 * Admin Agentic Campaign Creator Page
 *
 * Agent-first campaign creation with:
 * - Left panel: Conversational AI chat
 * - Right panel: Progressive step configuration
 * - Step-by-step approval workflow
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Icons
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  Link,
  FileUp,
  Target,
  Users,
  Volume2,
  Phone,
  FileText,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Edit3,
  ThumbsUp,
  Loader2,
  ArrowLeft,
  Play,
  Wand2,
} from 'lucide-react';

// Types
interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  inputType?: string;
  extractedData?: Record<string, any>;
}

interface StepConfig {
  key: string;
  label: string;
  icon: any;
  description: string;
  required: boolean;
}

interface Session {
  id: string;
  currentStep: string;
  completedSteps: string[];
  conversationHistory: ConversationMessage[];
  contextConfig: any;
  audienceConfig: any;
  voiceConfig: any;
  phoneConfig: any;
  contentConfig: any;
  approvals: Record<string, { approved: boolean; by: string; at: string }>;
  isComplete: boolean;
}

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  tone: string;
  description: string;
}

// Step configuration
const STEPS: StepConfig[] = [
  { key: 'context', label: 'Campaign Context', icon: Target, description: 'Objective, product, success criteria', required: true },
  { key: 'audience', label: 'Target Audience', icon: Users, description: 'Industries, titles, regions', required: true },
  { key: 'voice', label: 'Voice Selection', icon: Volume2, description: 'Agent voice and personality', required: false },
  { key: 'phone', label: 'Phone Config', icon: Phone, description: 'Phone number and caller ID', required: false },
  { key: 'content', label: 'Content', icon: FileText, description: 'Scripts and messaging', required: true },
];

export default function AdminAgenticCampaignCreatorPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const intakeId = searchParams.get('intakeId');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(['context']));
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/agentic-campaign/start', {
        intakeRequestId: intakeId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setSessionId(data.data.id);
      }
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Fetch session if we have an ID
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ['agentic-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const res = await apiRequest('GET', `/api/admin/agentic-campaign/${sessionId}`);
      return res.json();
    },
    enabled: !!sessionId,
  });

  const session: Session | null = sessionData?.data || null;

  // Fetch voice options
  const { data: voiceOptionsData } = useQuery({
    queryKey: ['voice-options'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/voice-options');
      return res.json();
    },
  });

  const voiceOptions: VoiceOption[] = voiceOptionsData?.data || [];

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async ({ message, inputType }: { message: string; inputType: string }) => {
      const res = await apiRequest('POST', `/api/admin/agentic-campaign/${sessionId}/chat`, {
        message,
        inputType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setIsProcessing(false);
      refetchSession();
    },
    onError: (error: any) => {
      setIsProcessing(false);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Generate step config mutation
  const generateMutation = useMutation({
    mutationFn: async (step: string) => {
      const res = await apiRequest('POST', `/api/admin/agentic-campaign/${sessionId}/step/${step}/generate`);
      return res.json();
    },
    onSuccess: () => {
      refetchSession();
      toast({ title: 'Generated', description: 'Configuration has been generated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Approve step mutation
  const approveMutation = useMutation({
    mutationFn: async ({ step, edits }: { step: string; edits?: any }) => {
      const res = await apiRequest('POST', `/api/admin/agentic-campaign/${sessionId}/step/${step}/approve`, {
        edits,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchSession();
      toast({ title: 'Approved', description: 'Step has been approved.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Finalize mutation
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/admin/agentic-campaign/${sessionId}/finalize`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Campaign Created', description: 'Your campaign has been created successfully.' });
      if (data.data?.campaign?.id) {
        navigate(`/campaigns/${data.data.campaign.id}`);
      }
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // URL analysis mutation
  const analyzeUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest('POST', `/api/admin/agentic-campaign/${sessionId}/analyze-url`, { url });
      return res.json();
    },
    onSuccess: (data) => {
      refetchSession();
      toast({ title: 'URL Analyzed', description: 'Context has been extracted from the URL.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Start session on mount
  useEffect(() => {
    if (!sessionId) {
      startSessionMutation.mutate();
    }
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.conversationHistory]);

  // Handlers
  const handleSend = () => {
    if (!inputText.trim() || isProcessing || !sessionId) return;

    setIsProcessing(true);
    chatMutation.mutate({ message: inputText.trim(), inputType: 'text' });
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUrlPaste = () => {
    const url = prompt('Enter a URL to analyze:');
    if (url) {
      analyzeUrlMutation.mutate(url);
    }
  };

  const toggleStep = (key: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getStepConfig = (step: string): any => {
    if (!session) return null;
    const configKey = `${step}Config` as keyof Session;
    return session[configKey];
  };

  const isStepApproved = (step: string): boolean => {
    return session?.approvals?.[step]?.approved || false;
  };

  const isStepComplete = (step: string): boolean => {
    return session?.completedSteps?.includes(step) || false;
  };

  // Calculate progress
  const approvedCount = STEPS.filter((s) => isStepApproved(s.key)).length;
  const progress = (approvedCount / STEPS.length) * 100;

  // Check if can finalize
  const requiredStepsApproved = STEPS.filter((s) => s.required).every((s) => isStepApproved(s.key));

  if (!session && startSessionMutation.isPending) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Starting campaign creator...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Left Panel - Conversation */}
      <div className="flex-1 flex flex-col border-r">
        {/* Header */}
        <div className="p-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/admin/campaign-intake')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wand2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Agentic Campaign Creator</h2>
                <p className="text-xs text-muted-foreground">AI-powered campaign setup</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {approvedCount}/{STEPS.length} steps
            </Badge>
          </div>
          <Progress value={progress} className="h-1 mt-3" />
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-2xl mx-auto">
            <AnimatePresence>
              {(session?.conversationHistory || []).map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isProcessing && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <p className="text-sm text-muted-foreground">Thinking...</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t bg-background">
          <div className="flex gap-2 max-w-2xl mx-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleUrlPaste}>
                  <Link className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Analyze URL</TooltipContent>
            </Tooltip>

            <Textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your campaign goals, target audience, product..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
            />

            <Button onClick={handleSend} disabled={!inputText.trim() || isProcessing} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel - Configuration */}
      <div className="w-[420px] flex flex-col bg-muted/20">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Campaign Configuration</h3>
          <p className="text-xs text-muted-foreground mt-1">Review and approve each section</p>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {STEPS.map((step) => {
              const config = getStepConfig(step.key);
              const isApproved = isStepApproved(step.key);
              const hasData = config && Object.keys(config).length > 0;
              const Icon = step.icon;

              return (
                <Card
                  key={step.key}
                  className={`transition-all ${
                    isApproved
                      ? 'border-green-500/50 bg-green-500/5'
                      : hasData
                      ? 'border-border'
                      : 'border-dashed border-muted-foreground/30'
                  }`}
                >
                  <button
                    onClick={() => toggleStep(step.key)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 rounded-t-lg text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          isApproved ? 'bg-green-500/20' : hasData ? 'bg-primary/10' : 'bg-muted'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            isApproved ? 'text-green-600' : hasData ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{step.label}</span>
                          {step.required && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              Required
                            </Badge>
                          )}
                          {isApproved && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        </div>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                    {expandedSteps.has(step.key) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <AnimatePresence>
                    {expandedSteps.has(step.key) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CardContent className="pt-0 pb-3">
                          <Separator className="mb-3" />

                          {/* Step-specific content */}
                          {!hasData ? (
                            <div className="text-center py-4">
                              <p className="text-sm text-muted-foreground mb-3">Not yet configured</p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generateMutation.mutate(step.key)}
                                disabled={generateMutation.isPending}
                              >
                                {generateMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3 mr-2" />
                                )}
                                Generate
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {/* Render config based on step */}
                              {step.key === 'context' && config && (
                                <div className="space-y-2 text-sm">
                                  {config.objective && (
                                    <div>
                                      <span className="text-xs text-muted-foreground">Objective:</span>
                                      <p className="font-medium">{config.objective}</p>
                                    </div>
                                  )}
                                  {config.productServiceInfo && (
                                    <div>
                                      <span className="text-xs text-muted-foreground">Product/Service:</span>
                                      <p>{config.productServiceInfo}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {step.key === 'audience' && config && (
                                <div className="space-y-2">
                                  {config.industries?.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {config.industries.map((ind: string, i: number) => (
                                        <Badge key={i} variant="outline" className="text-xs">
                                          {ind}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  {config.jobTitles?.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {config.jobTitles.map((title: string, i: number) => (
                                        <Badge key={i} className="text-xs">
                                          {title}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {step.key === 'voice' && config && (
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center gap-2">
                                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">{config.voiceName || config.voiceId}</span>
                                    {config.voiceGender && (
                                      <Badge variant="secondary" className="text-xs">
                                        {config.voiceGender}
                                      </Badge>
                                    )}
                                  </div>
                                  {config.reasoning && (
                                    <p className="text-xs text-muted-foreground">{config.reasoning}</p>
                                  )}
                                </div>
                              )}

                              {step.key === 'content' && config && (
                                <div className="space-y-2 text-sm">
                                  {config.openingScript && (
                                    <div>
                                      <span className="text-xs text-muted-foreground">Opening:</span>
                                      <p className="text-xs bg-muted p-2 rounded mt-1">
                                        {config.openingScript.slice(0, 100)}...
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex gap-2 pt-2">
                                <Button size="sm" variant="outline">
                                  <Edit3 className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                {!isApproved && (
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={() => approveMutation.mutate({ step: step.key })}
                                    disabled={approveMutation.isPending}
                                  >
                                    {approveMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <ThumbsUp className="h-3 w-3 mr-1" />
                                    )}
                                    Approve
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        {/* Finalize */}
        <div className="p-4 border-t space-y-3">
          {requiredStepsApproved ? (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">Ready to create campaign!</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <span className="text-sm text-yellow-700">Approve all required steps to continue</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => navigate('/admin/campaign-intake')}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={!requiredStepsApproved || finalizeMutation.isPending}
              onClick={() => finalizeMutation.mutate()}
            >
              {finalizeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Create Campaign
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
