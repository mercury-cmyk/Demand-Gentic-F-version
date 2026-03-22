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
  onComplete?: (context: StructuredCampaignContext, legacyFields: Record) => void;
  onCancel?: () => void;
  initialContext?: Partial;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  inputType?: 'text' | 'voice';
  extractedData?: Record;
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
  const recognitionRef = useRef(null);

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
        for (let i = event.resultIndex; i  {
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
    if (!data) return Not yet defined;

    switch (sectionKey) {
      case 'objectives':
        return (
          
            {data.primaryGoal && (
              
                Primary Goal:
                {data.primaryGoal}
              
            )}
            {data.secondaryGoals?.length > 0 && (
              
                Secondary Goals:
                
                  {data.secondaryGoals.map((goal: string, i: number) => (
                    {goal}
                  ))}
                
              
            )}
            {data.kpis?.length > 0 && (
              
                KPIs:
                
                  {data.kpis.map((kpi: string, i: number) => (
                    {kpi}
                  ))}
                
              
            )}
          
        );

      case 'targetAudience':
        return (
          
            {data.industries?.length > 0 && (
              
                
                
                  {data.industries.map((ind: string, i: number) => (
                    {ind}
                  ))}
                
              
            )}
            {data.regions?.length > 0 && (
              
                
                
                  {data.regions.map((reg: string, i: number) => (
                    {reg}
                  ))}
                
              
            )}
            {data.jobTitles?.length > 0 && (
              
                
                
                  {data.jobTitles.map((title: string, i: number) => (
                    {title}
                  ))}
                
              
            )}
          
        );

      case 'coreMessage':
        return {typeof data === 'string' ? data : data.message || JSON.stringify(data)};

      case 'successIndicators':
        return (
          
            {data.primarySuccess && (
              
                Primary Success:
                {data.primarySuccess}
              
            )}
            {data.qualifiedLeadDefinition && (
              
                Qualified Lead:
                {data.qualifiedLeadDefinition}
              
            )}
          
        );

      default:
        return (
          
            {JSON.stringify(data, null, 2)}
          
        );
    }
  };

  return (
    
      
        
          
            
          
          
            
              {config.label}
              {config.required && Required}
              {isApproved && }
            
            {config.description}
          
        
        {isExpanded ?  : }
      

      
        {isExpanded && (
          
            
              
              {renderSectionContent()}
              
              {hasData && (
                
                  
                    
                    Edit
                  
                  {!isApproved && (
                    
                      
                      Approve
                    
                  )}
                
              )}
            
          
        )}
      
    
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
      
        
        Ready to activate!
      
    );
  }

  return (
    
      {validation.validationErrors.length > 0 && (
        
          {validation.validationErrors.map((error, i) => (
            
              
              {error.message}
            
          ))}
        
      )}
      {validation.validationWarnings.length > 0 && (
        
          {validation.validationWarnings.slice(0, 3).map((warning, i) => (
            
              
              {warning.message}
            
          ))}
          {validation.validationWarnings.length > 3 && (
            
              +{validation.validationWarnings.length - 3} more warnings
            
          )}
        
      )}
    
  );
}

// ============================================================
// MAIN WIZARD COMPONENT
// ============================================================

export function IntelligentCampaignWizard({ organizationId, onComplete, onCancel, initialContext }: WizardProps) {
  const { toast } = useToast();
  
  // State
  const [sessionId, setSessionId] = useState(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [context, setContext] = useState>(initialContext || {});
  const [expandedSections, setExpandedSections] = useState>(new Set(['objectives']));
  const [activeTab, setActiveTab] = useState('conversation');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
    
      {/* Left Panel - Conversation */}
      
        {/* Header */}
        
          
            
              
                
              
              
                Intelligent Campaign Creator
                AI-powered campaign setup
              
            
            
              
                
                {approvedCount}/{SECTIONS.length} sections
              
            
          
          
        

        {/* Messages */}
        
          
            
              {messages.map((message) => (
                
                  {message.role === 'assistant' && (
                    
                      
                    
                  )}
                  
                    {message.content}
                    {message.inputType === 'voice' && (
                      
                        
                        Voice
                      
                    )}
                  
                
              ))}
            
            
            {isProcessing && (
              
                
                  
                
                
                  Analyzing your input...
                
              
            )}
            
            
          
        

        {/* Input */}
        
          
            {voiceSupported && (
              
                
                  
                    {isRecording ?  : }
                  
                
                
                  {isRecording ? 'Stop recording' : 'Start voice input'}
                
              
            )}
            
             setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your campaign goals, target audience, what you're offering..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
            />
            
            
              
            
          
        
      

      {/* Right Panel - Structure */}
      
        
          Campaign Structure
          
            Review and approve each section
          
        

        
          {initialContext && Object.keys(initialContext).length > 0 && (
            
              
                
                
                  Pre-loaded from Organization
                  
                    Context has been automatically populated. Review and customize as needed.
                  
                
              
            
          )}
          
          
            {SECTIONS.map((config) => (
               handleApproveSection(config.key)}
                onEdit={() => {
                  // TODO: Open edit modal
                  toast({ title: 'Edit', description: `Editing ${config.label}...` });
                }}
                isExpanded={expandedSections.has(config.key)}
                onToggle={() => toggleSection(config.key)}
              />
            ))}
          
        

        {/* Validation & Actions */}
        
          
          
          
            
              Cancel
            
             finalizeMutation.mutate()}
            >
              {finalizeMutation.isPending ? (
                <>
                  
                  Finalizing...
                
              ) : (
                <>
                  
                  Create Campaign
                
              )}
            
          
        
      
    
  );
}

export default IntelligentCampaignWizard;