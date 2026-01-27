/**
 * Intelligent Campaign Creation Wizard
 * 
 * Multi-modal, AI-powered campaign creation with:
 * - Text and voice input support
 * - Real-time context generation
 * - Section-by-section approval workflow
 * - Intelligent validation and guidance
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  MessageSquare,
  Target,
  Users,
  Package,
  FileText,
  MessageCircle,
  Trophy,
  Filter,
  ChevronRight,
  ChevronDown,
  Edit3,
  Eye,
  ThumbsUp,
  RefreshCw,
  Wand2,
  Building2,
  Globe,
  Briefcase,
  Plus,
  X,
} from 'lucide-react';
import type { 
  StructuredCampaignContext, 
  CampaignCreationSession,
  ValidationError,
  ValidationWarning,
} from '@shared/campaign-context-types';

// ============================================================
// TYPES
// ============================================================

interface WizardProps {
  organizationId?: string;
  onComplete?: (context: StructuredCampaignContext, legacyFields: Record<string, any>) => void;
  onCancel?: () => void;
  initialContext?: Partial<StructuredCampaignContext>;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  inputType?: 'text' | 'voice';
  extractedData?: Record<string, any>;
}

interface SectionConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  description: string;
  required: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================

const SECTIONS: SectionConfig[] = [
  { key: 'objectives', label: 'Campaign Objectives', icon: Target, description: 'Goals, outcomes, and KPIs', required: true },
  { key: 'targetAudience', label: 'Target Audience', icon: Users, description: 'Industries, roles, and company profiles', required: true },
  { key: 'deliverables', label: 'Deliverables', icon: Package, description: 'Products, services, or information offered', required: false },
  { key: 'assets', label: 'Assets', icon: FileText, description: 'Content and collateral available', required: false },
  { key: 'coreMessage', label: 'Core Message', icon: MessageSquare, description: 'Main value proposition and pitch', required: true },
  { key: 'conversationFlow', label: 'Conversation Flow', icon: MessageCircle, description: 'Opening, discovery, objection handling', required: false },
  { key: 'successIndicators', label: 'Success Indicators', icon: Trophy, description: 'What defines a qualified lead', required: true },
  { key: 'qualificationCriteria', label: 'Qualification Criteria', icon: Filter, description: 'Qualifying and disqualifying conditions', required: true },
];

// ============================================================
// VOICE INPUT HOOK
// ============================================================

function useVoiceInput(onTranscript: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          onTranscript(finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onTranscript]);

  const startRecording = useCallback(() => {
    if (recognitionRef.current && !isRecording) {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return { isRecording, isSupported, toggleRecording, startRecording, stopRecording };
}

// ============================================================
// SECTION VIEWER COMPONENT
// ============================================================

interface SectionViewerProps {
  sectionKey: string;
  config: SectionConfig;
  data: any;
  isApproved: boolean;
  onApprove: () => void;
  onEdit: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function SectionViewer({ sectionKey, config, data, isApproved, onApprove, onEdit, isExpanded, onToggle }: SectionViewerProps) {
  const Icon = config.icon;
  const hasData = data && Object.keys(data).length > 0;

  const renderSectionContent = () => {
    if (!data) return <p className="text-muted-foreground text-sm">Not yet defined</p>;

    switch (sectionKey) {
      case 'objectives':
        return (
          <div className="space-y-2">
            {data.primaryGoal && (
              <div>
                <span className="text-xs text-muted-foreground">Primary Goal:</span>
                <p className="text-sm font-medium">{data.primaryGoal}</p>
              </div>
            )}
            {data.secondaryGoals?.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Secondary Goals:</span>
                <ul className="list-disc list-inside text-sm">
                  {data.secondaryGoals.map((goal: string, i: number) => (
                    <li key={i}>{goal}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.kpis?.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">KPIs:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.kpis.map((kpi: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{kpi}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'targetAudience':
        return (
          <div className="space-y-2">
            {data.industries?.length > 0 && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-1">
                  {data.industries.map((ind: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">{ind}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.regions?.length > 0 && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-1">
                  {data.regions.map((reg: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">{reg}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.jobTitles?.length > 0 && (
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-1">
                  {data.jobTitles.map((title: string, i: number) => (
                    <Badge key={i} className="text-xs">{title}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'coreMessage':
        return <p className="text-sm">{typeof data === 'string' ? data : data.message || JSON.stringify(data)}</p>;

      case 'successIndicators':
        return (
          <div className="space-y-2">
            {data.primarySuccess && (
              <div>
                <span className="text-xs text-muted-foreground">Primary Success:</span>
                <p className="text-sm">{data.primarySuccess}</p>
              </div>
            )}
            {data.qualifiedLeadDefinition && (
              <div>
                <span className="text-xs text-muted-foreground">Qualified Lead:</span>
                <p className="text-sm">{data.qualifiedLeadDefinition}</p>
              </div>
            )}
          </div>
        );

      default:
        return (
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(data, null, 2)}
          </pre>
        );
    }
  };

  return (
    <div className={cn(
      "border rounded-lg transition-all",
      isApproved ? "border-green-500/50 bg-green-500/5" : hasData ? "border-border" : "border-dashed border-muted-foreground/30"
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            isApproved ? "bg-green-500/20" : hasData ? "bg-primary/10" : "bg-muted"
          )}>
            <Icon className={cn(
              "h-4 w-4",
              isApproved ? "text-green-600" : hasData ? "text-primary" : "text-muted-foreground"
            )} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{config.label}</span>
              {config.required && <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>}
              {isApproved && <CheckCircle2 className="h-4 w-4 text-green-600" />}
            </div>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        </div>
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 pb-3 space-y-3">
              <Separator />
              {renderSectionContent()}
              
              {hasData && (
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={onEdit}>
                    <Edit3 className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  {!isApproved && (
                    <Button size="sm" variant="default" onClick={onApprove} className="bg-green-600 hover:bg-green-700">
                      <ThumbsUp className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// VALIDATION STATUS COMPONENT
// ============================================================

interface ValidationStatusProps {
  validation: {
    validationErrors: ValidationError[];
    validationWarnings: ValidationWarning[];
    canActivate: boolean;
    allSectionsApproved: boolean;
  };
}

function ValidationStatus({ validation }: ValidationStatusProps) {
  if (validation.canActivate) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <span className="text-sm font-medium text-green-700">Ready to activate!</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {validation.validationErrors.length > 0 && (
        <div className="space-y-1">
          {validation.validationErrors.map((error, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-sm">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <span className="text-destructive">{error.message}</span>
            </div>
          ))}
        </div>
      )}
      {validation.validationWarnings.length > 0 && (
        <div className="space-y-1">
          {validation.validationWarnings.slice(0, 3).map((warning, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <span className="text-yellow-700">{warning.message}</span>
            </div>
          ))}
          {validation.validationWarnings.length > 3 && (
            <p className="text-xs text-muted-foreground pl-6">
              +{validation.validationWarnings.length - 3} more warnings
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN WIZARD COMPONENT
// ============================================================

export function IntelligentCampaignWizard({ organizationId, onComplete, onCancel, initialContext }: WizardProps) {
  const { toast } = useToast();
  
  // State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [context, setContext] = useState<Partial<StructuredCampaignContext>>(initialContext || {});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['objectives']));
  const [activeTab, setActiveTab] = useState<'conversation' | 'structure'>('conversation');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice input
  const handleVoiceTranscript = useCallback((text: string) => {
    setInputText(prev => prev + (prev ? ' ' : '') + text);
  }, []);
  
  const { isRecording, isSupported: voiceSupported, toggleRecording } = useVoiceInput(handleVoiceTranscript);

  // Calculate progress
  const approvedCount = SECTIONS.filter(s => (context as any)[s.key]?._approved).length;
  const progress = (approvedCount / SECTIONS.length) * 100;

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Create session on mount
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/campaign-context/sessions');
      return res.json();
    },
    onSuccess: (data) => {
      setSessionId(data.session.sessionId);
      // Add initial greeting
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "👋 Welcome! I'll help you create a powerful outbound campaign. Just describe what you want to achieve - your goals, who you want to reach, and what you're offering. I'll structure everything for you.\n\nYou can type or use the microphone button to speak. Let's get started!",
        timestamp: new Date().toISOString(),
      }]);
    },
    onError: (error) => {
      toast({
        title: 'Session Error',
        description: 'Failed to start campaign creation session',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!sessionId && !initialContext) {
      createSessionMutation.mutate();
    } else if (initialContext && Object.keys(initialContext).length > 0) {
      // If initial context is provided, show it with a helpful message
      console.log('[Campaign Wizard] Initial context loaded:', initialContext);
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "✨ Great! I've pre-loaded campaign context from your organization's intelligence.\n\nSwitch to the 'Campaign Structure' tab to review all the sections. Each section has been automatically populated based on your organization's profile. You can review, edit, and approve each section, or start a conversation to refine anything.\n\nWhen you're ready, approve each section and complete the campaign!",
        timestamp: new Date().toISOString(),
      }]);
      // Auto-expand all sections with data
      const sectionsWithData = SECTIONS.filter(s => {
        const sectionData = (initialContext as any)[s.key];
        return sectionData && Object.keys(sectionData).length > 0;
      }).map(s => s.key);
      console.log('[Campaign Wizard] Sections with data:', sectionsWithData);
      setExpandedSections(new Set(sectionsWithData));
      // Switch to structure tab to show the loaded context
      setTimeout(() => setActiveTab('structure'), 100);
    }
  }, [initialContext]);

  // Converse mutation
  const converseMutation = useMutation({
    mutationFn: async ({ userInput, inputType }: { userInput: string; inputType: 'text' | 'voice' }) => {
      const res = await apiRequest('POST', '/api/campaign-context/converse', { sessionId, userInput, inputType });
      return res.json();
    },
    onSuccess: (data) => {
      // Add assistant response
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
        extractedData: data.extractedData,
      }]);
      
      // Update context
      if (data.updatedContext) {
        setContext(data.updatedContext);
      }
      
      setIsProcessing(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to process your input',
        variant: 'destructive',
      });
      setIsProcessing(false);
    },
  });

  // Approve section mutation
  const approveSectionMutation = useMutation({
    mutationFn: async ({ sectionKey }: { sectionKey: string }) => {
      const res = await apiRequest('POST', '/api/campaign-context/approve-section', { sessionId, sectionKey, approved: true });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.updatedContext) {
        setContext(data.updatedContext);
      }
      toast({
        title: 'Section Approved',
        description: `${data.section} has been approved`,
      });
    },
  });

  // Finalize mutation
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/campaign-context/finalize', { sessionId, context });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Campaign Context Finalized',
        description: 'Your campaign is ready to be created',
      });
      onComplete?.(data.finalizedContext, data.legacyFields);
    },
    onError: (error: any) => {
      toast({
        title: 'Cannot Finalize',
        description: error.message || 'Please complete all required sections',
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleSend = () => {
    if (!inputText.trim() || isProcessing) return;

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
      inputType: 'text',
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    converseMutation.mutate({ userInput: userMessage.content, inputType: 'text' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleApproveSection = (sectionKey: string) => {
    approveSectionMutation.mutate({ sectionKey });
  };

  const validation = context.validationRequirements || {
    validationErrors: [],
    validationWarnings: [],
    canActivate: false,
    allSectionsApproved: false,
    abmRequired: false,
    abmAccountListProvided: false,
    suppressionRequired: false,
    suppressionListProvided: false,
  };

  return (
    <div className="flex h-full min-h-[600px] bg-background">
      {/* Left Panel - Conversation */}
      <div className="flex-1 flex flex-col border-r">
        {/* Header */}
        <div className="p-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wand2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Intelligent Campaign Creator</h2>
                <p className="text-xs text-muted-foreground">AI-powered campaign setup</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Sparkles className="h-3 w-3" />
                {approvedCount}/{SECTIONS.length} sections
              </Badge>
            </div>
          </div>
          <Progress value={progress} className="h-1 mt-3" />
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-2xl mx-auto">
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "rounded-lg px-4 py-2 max-w-[80%]",
                    message.role === 'user' 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted"
                  )}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    {message.inputType === 'voice' && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        <Mic className="h-2 w-2 mr-1" />
                        Voice
                      </Badge>
                    )}
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
                  <p className="text-sm text-muted-foreground">Analyzing your input...</p>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t bg-background">
          <div className="flex gap-2 max-w-2xl mx-auto">
            {voiceSupported && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isRecording ? "destructive" : "outline"}
                    size="icon"
                    onClick={toggleRecording}
                    className={cn(isRecording && "animate-pulse")}
                  >
                    {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isRecording ? 'Stop recording' : 'Start voice input'}
                </TooltipContent>
              </Tooltip>
            )}
            
            <Textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your campaign goals, target audience, what you're offering..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
            />
            
            <Button 
              onClick={handleSend} 
              disabled={!inputText.trim() || isProcessing}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel - Structure */}
      <div className="w-[400px] flex flex-col bg-muted/20">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Campaign Structure</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Review and approve each section
          </p>
        </div>

        <ScrollArea className="flex-1 p-4">
          {initialContext && Object.keys(initialContext).length > 0 && (
            <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary">Pre-loaded from Organization</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Context has been automatically populated. Review and customize as needed.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            {SECTIONS.map((config) => (
              <SectionViewer
                key={config.key}
                sectionKey={config.key}
                config={config}
                data={(context as any)[config.key]}
                isApproved={(context as any)[config.key]?._approved || false}
                onApprove={() => handleApproveSection(config.key)}
                onEdit={() => {
                  // TODO: Open edit modal
                  toast({ title: 'Edit', description: `Editing ${config.label}...` });
                }}
                isExpanded={expandedSections.has(config.key)}
                onToggle={() => toggleSection(config.key)}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Validation & Actions */}
        <div className="p-4 border-t space-y-4">
          <ValidationStatus validation={validation} />
          
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button 
              className="flex-1"
              disabled={!validation.canActivate || finalizeMutation.isPending}
              onClick={() => finalizeMutation.mutate()}
            >
              {finalizeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Finalizing...
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

export default IntelligentCampaignWizard;
