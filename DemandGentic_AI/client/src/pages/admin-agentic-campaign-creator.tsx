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
  extractedData?: Record;
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
  approvals: Record;
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
  const [sessionId, setSessionId] = useState(null);
  const [inputText, setInputText] = useState('');
  const [expandedSteps, setExpandedSteps] = useState>(new Set(['context']));
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
      
        
          
          Starting campaign creator...
        
      
    );
  }

  return (
    
      {/* Left Panel - Conversation */}
      
        {/* Header */}
        
          
            
               navigate('/admin/campaign-intake')}>
                
              
              
                
              
              
                Agentic Campaign Creator
                AI-powered campaign setup
              
            
            
              
              {approvedCount}/{STEPS.length} steps
            
          
          
        

        {/* Messages */}
        
          
            
              {(session?.conversationHistory || []).map((message) => (
                
                  {message.role === 'assistant' && (
                    
                      
                    
                  )}
                  
                    {message.content}
                  
                
              ))}
            

            {isProcessing && (
              
                
                  
                
                
                  Thinking...
                
              
            )}

            
          
        

        {/* Input */}
        
          
            
              
                
                  
                
              
              Analyze URL
            

             setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your campaign goals, target audience, product..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
            />

            
              
            
          
        
      

      {/* Right Panel - Configuration */}
      
        
          Campaign Configuration
          Review and approve each section
        

        
          
            {STEPS.map((step) => {
              const config = getStepConfig(step.key);
              const isApproved = isStepApproved(step.key);
              const hasData = config && Object.keys(config).length > 0;
              const Icon = step.icon;

              return (
                
                   toggleStep(step.key)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 rounded-t-lg text-left"
                  >
                    
                      
                        
                      
                      
                        
                          {step.label}
                          {step.required && (
                            
                              Required
                            
                          )}
                          {isApproved && }
                        
                        {step.description}
                      
                    
                    {expandedSteps.has(step.key) ? (
                      
                    ) : (
                      
                    )}
                  

                  
                    {expandedSteps.has(step.key) && (
                      
                        
                          

                          {/* Step-specific content */}
                          {!hasData ? (
                            
                              Not yet configured
                               generateMutation.mutate(step.key)}
                                disabled={generateMutation.isPending}
                              >
                                {generateMutation.isPending ? (
                                  
                                ) : (
                                  
                                )}
                                Generate
                              
                            
                          ) : (
                            
                              {/* Render config based on step */}
                              {step.key === 'context' && config && (
                                
                                  {config.objective && (
                                    
                                      Objective:
                                      {config.objective}
                                    
                                  )}
                                  {config.productServiceInfo && (
                                    
                                      Product/Service:
                                      {config.productServiceInfo}
                                    
                                  )}
                                
                              )}

                              {step.key === 'audience' && config && (
                                
                                  {config.industries?.length > 0 && (
                                    
                                      {config.industries.map((ind: string, i: number) => (
                                        
                                          {ind}
                                        
                                      ))}
                                    
                                  )}
                                  {config.jobTitles?.length > 0 && (
                                    
                                      {config.jobTitles.map((title: string, i: number) => (
                                        
                                          {title}
                                        
                                      ))}
                                    
                                  )}
                                
                              )}

                              {step.key === 'voice' && config && (
                                
                                  
                                    
                                    {config.voiceName || config.voiceId}
                                    {config.voiceGender && (
                                      
                                        {config.voiceGender}
                                      
                                    )}
                                  
                                  {config.reasoning && (
                                    {config.reasoning}
                                  )}
                                
                              )}

                              {step.key === 'content' && config && (
                                
                                  {config.openingScript && (
                                    
                                      Opening:
                                      
                                        {config.openingScript.slice(0, 100)}...
                                      
                                    
                                  )}
                                
                              )}

                              {/* Actions */}
                              
                                
                                  
                                  Edit
                                
                                {!isApproved && (
                                   approveMutation.mutate({ step: step.key })}
                                    disabled={approveMutation.isPending}
                                  >
                                    {approveMutation.isPending ? (
                                      
                                    ) : (
                                      
                                    )}
                                    Approve
                                  
                                )}
                              
                            
                          )}
                        
                      
                    )}
                  
                
              );
            })}
          
        

        {/* Finalize */}
        
          {requiredStepsApproved ? (
            
              
              Ready to create campaign!
            
          ) : (
            
              Approve all required steps to continue
            
          )}

          
             navigate('/admin/campaign-intake')}>
              Cancel
            
             finalizeMutation.mutate()}
            >
              {finalizeMutation.isPending ? (
                <>
                  
                  Creating...
                
              ) : (
                <>
                  
                  Create Campaign
                
              )}
            
          
        
      
    
  );
}