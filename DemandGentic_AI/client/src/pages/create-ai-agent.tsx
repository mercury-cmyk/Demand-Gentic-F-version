/**
 * Create AI Agent - Full Page Experience
 * 
 * A dedicated, full-width page for creating AI voice agents with:
 * - Modern stepper workflow
 * - Organization Intelligence research with preview & approval
 * - Skill-based agent creation
 * - Voice configuration
 * - Beautiful, refreshing UI/UX
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// Icons
import {
  Bot,
  Sparkles,
  Building2,
  Globe,
  Search,
  Database,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Mic,
  Zap,
  Target,
  Calendar,
  MessageSquare,
  Shield,
  Eye,
  Edit3,
  RefreshCw,
  ChevronRight,
  Play,
  Volume2,
  Settings2,
  Brain,
  Lightbulb,
  Check,
  X,
} from 'lucide-react';

// Types
type OrgIntelligenceMode = 'use_existing' | 'fresh_research' | 'none';
type CreationStep = 'intelligence' | 'skills' | 'voice' | 'review';

interface OrgIntelligenceConfig {
  mode: OrgIntelligenceMode;
  snapshotId?: string;
  masterOrgIntelligenceId?: string;
  organizationName?: string;
  websiteUrl?: string;
  industry?: string;
  notes?: string;
  saveAsReusable?: boolean;
}

interface ResearchResult {
  success: boolean;
  snapshot?: {
    id: string;
    organizationName: string;
    domain: string;
    industry: string | null;
    researchData: any;
    confidenceScore: number;
  };
  researchSummary: string;
  companyInfo?: {
    name: string;
    description: string;
    industry: string;
    size: string;
    products: string[];
    valueProposition: string;
  };
}

interface SkillConfig {
  skillId: string;
  skillName: string;
  inputs: Record;
}

interface VoiceConfig {
  provider: string;
  voice: string;
  agentName: string;
}

type OrgSourcesResponse = {
  masterOrgIntelligence: {
    id: string;
    domain: string;
    companyName: string;
    updatedAt: string;
  } | null;
  reusableSnapshots: Array;
  modes: Array;
};

// Skills data
const SKILLS = [
  {
    id: 'whitepaper_distribution',
    name: 'Whitepaper Distribution',
    category: 'content',
    icon: FileText,
    description: 'Share research, insights, and thought leadership content with prospects',
    inputs: [
      { key: 'asset_title', label: 'Whitepaper Title', type: 'text', required: true, placeholder: 'e.g., The Future of B2B Marketing' },
      { key: 'publishing_org', label: 'Publishing Organization', type: 'text', required: true, placeholder: 'e.g., Acme Corp' },
      { key: 'target_persona', label: 'Target Persona', type: 'select', required: false, options: [
        { value: 'marketing', label: 'Marketing Leaders' },
        { value: 'sales', label: 'Sales Leaders' },
        { value: 'executive', label: 'C-Suite' }
      ]}
    ]
  },
  {
    id: 'webinar_registration',
    name: 'Webinar Registration',
    category: 'events',
    icon: Calendar,
    description: 'Drive registrations for webinars, workshops, and online events',
    inputs: [
      { key: 'event_name', label: 'Webinar Title', type: 'text', required: true, placeholder: 'e.g., Mastering Demand Gen' },
      { key: 'event_date', label: 'Event Date', type: 'datetime-local', required: true },
      { key: 'registration_link', label: 'Registration URL', type: 'url', required: true, placeholder: 'https://...' },
      { key: 'speakers', label: 'Speakers', type: 'text', required: false, placeholder: 'e.g., Jane Doe (CMO)' }
    ]
  },
  {
    id: 'appointment_setting',
    name: 'Appointment Setting',
    category: 'qualification',
    icon: Target,
    description: 'Book qualified discovery calls, demos, and consultations',
    inputs: [
      { key: 'meeting_purpose', label: 'Meeting Type', type: 'select', required: true, options: [
        { value: 'discovery', label: 'Discovery Call' },
        { value: 'demo', label: 'Product Demo' },
        { value: 'consultation', label: 'Consultation' }
      ]},
      { key: 'meeting_duration', label: 'Meeting Duration (minutes)', type: 'select', required: true, options: [
        { value: '15', label: '15 minutes' },
        { value: '30', label: '30 minutes' },
        { value: '45', label: '45 minutes' },
        { value: '60', label: '60 minutes' }
      ]},
      { key: 'calendar_link', label: 'Calendar Link', type: 'url', required: true, placeholder: 'https://calendly.com/...' },
      { key: 'meeting_with', label: 'Meeting With', type: 'text', required: false, placeholder: 'e.g., Sarah Johnson, VP Sales' }
    ]
  },
  {
    id: 'executive_dinner',
    name: 'Executive Dinner',
    category: 'events',
    icon: MessageSquare,
    description: 'Invite C-suite executives to exclusive networking events',
    inputs: [
      { key: 'event_name', label: 'Event Name', type: 'text', required: true, placeholder: 'e.g., CMO Leadership Dinner' },
      { key: 'event_date', label: 'Event Date', type: 'datetime-local', required: true },
      { key: 'venue', label: 'Venue', type: 'text', required: true, placeholder: 'e.g., The Capital Grille' },
      { key: 'city', label: 'City', type: 'text', required: false, placeholder: 'e.g., San Francisco' }
    ]
  },
  {
    id: 'market_research',
    name: 'Market Research',
    category: 'research',
    icon: Search,
    description: 'Conduct voice-of-customer research and market discovery',
    inputs: [
      { key: 'research_topic', label: 'Research Topic', type: 'text', required: true, placeholder: 'e.g., Buying behavior in Q1' },
      { key: 'target_market', label: 'Target Market', type: 'text', required: true, placeholder: 'e.g., Enterprise SaaS' },
      { key: 'key_questions', label: 'Key Questions', type: 'textarea', required: false, placeholder: 'List key questions to explore...' }
    ]
  },
  {
    id: 'product_feedback',
    name: 'Product Feedback',
    category: 'research',
    icon: Lightbulb,
    description: 'Collect customer feedback and product improvement insights',
    inputs: [
      { key: 'product_name', label: 'Product Name', type: 'text', required: true, placeholder: 'e.g., Acme Platform' },
      { key: 'feedback_area', label: 'Feedback Focus', type: 'select', required: true, options: [
        { value: 'features', label: 'Feature Requests' },
        { value: 'usability', label: 'Usability' },
        { value: 'satisfaction', label: 'Satisfaction' },
        { value: 'general', label: 'General Feedback' }
      ]},
      { key: 'context', label: 'Additional Context', type: 'textarea', required: false }
    ]
  }
];

const VOICE_OPTIONS = {
  openai: [
    { id: 'nova', name: 'Nova', gender: 'Female', style: 'Professional & Warm' },
    { id: 'alloy', name: 'Alloy', gender: 'Neutral', style: 'Balanced & Clear' },
    { id: 'echo', name: 'Echo', gender: 'Male', style: 'Confident & Direct' },
    { id: 'shimmer', name: 'Shimmer', gender: 'Female', style: 'Friendly & Energetic' },
    { id: 'onyx', name: 'Onyx', gender: 'Male', style: 'Deep & Authoritative' },
    { id: 'fable', name: 'Fable', gender: 'Neutral', style: 'Storytelling & Engaging' },
  ]
};

// Step indicator component
function StepIndicator({ 
  steps, 
  currentStep 
}: { 
  steps: { id: CreationStep; label: string; icon: React.ComponentType }[];
  currentStep: CreationStep;
}) {
  const currentIndex = steps.findIndex(s => s.id === currentStep);
  
  return (
    
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isCompleted = index 
            
              {isCompleted ? (
                
              ) : (
                
              )}
              {step.label}
            
            {index 
            )}
          
        );
      })}
    
  );
}

// Research Preview Component
function ResearchPreview({ 
  result, 
  onApprove, 
  onRerun, 
  isLoading 
}: { 
  result: ResearchResult;
  onApprove: () => void;
  onRerun: () => void;
  isLoading: boolean;
}) {
  const data = result.snapshot?.researchData || {};
  
  return (
    
      {/* Header */}
      
        
          
            
          
          
            Research Complete
            {result.researchSummary}
          
        
        
          
          {Math.round((result.snapshot?.confidenceScore || 0) * 100)}% Confidence
        
      

      {/* Research Data Preview */}
      
        {/* Company Overview */}
        
          
            
              
              Company Overview
            
          
          
            
              Name:
              {result.snapshot?.organizationName || data.companyName || 'N/A'}
            
            
              Domain:
              {result.snapshot?.domain || 'N/A'}
            
            
              Industry:
              {result.snapshot?.industry || data.industry || 'N/A'}
            
            {data.companySize && (
              
                Size:
                {data.companySize}
              
            )}
          
        

        {/* Value Proposition */}
        
          
            
              
              Value Proposition
            
          
          
            
              {data.valueProposition || data.description || 'No value proposition extracted'}
            
          
        

        {/* Products & Services */}
        {(data.products || data.offerings) && (
          
            
              
                
                Products & Services
              
            
            
              
                {(data.products || data.offerings || []).slice(0, 6).map((product: string, i: number) => (
                  
                    {product}
                  
                ))}
              
            
          
        )}

        {/* Key Differentiators */}
        {data.differentiators && (
          
            
              
                
                Differentiators
              
            
            
              
                {data.differentiators.slice(0, 3).map((diff: string, i: number) => (
                  
                    
                    {diff}
                  
                ))}
              
            
          
        )}
      

      {/* Action Buttons */}
      
        
          
          Re-run Research
        
        
          
          Approve & Continue
        
      
    
  );
}

// Main Page Component
export default function CreateAIAgentPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [currentStep, setCurrentStep] = useState('intelligence');
  const [oiConfig, setOiConfig] = useState({ mode: 'fresh_research' });
  const [skillConfig, setSkillConfig] = useState(null);
  const [voiceConfig, setVoiceConfig] = useState({ 
    provider: 'openai', 
    voice: 'nova',
    agentName: '' 
  });
  const [researchResult, setResearchResult] = useState(null);
  const [researchApproved, setResearchApproved] = useState(false);

  // Steps configuration
  const steps: { id: CreationStep; label: string; icon: React.ComponentType }[] = [
    { id: 'intelligence', label: 'Intelligence', icon: Brain },
    { id: 'skills', label: 'Skills', icon: Zap },
    { id: 'voice', label: 'Voice', icon: Mic },
    { id: 'review', label: 'Review', icon: Eye },
  ];

  // Fetch available OI sources
  const { data: oiSources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['/api/unified-agents/org-intelligence/available-sources'],
    initialData: {
      masterOrgIntelligence: null,
      reusableSnapshots: [],
      modes: [],
    },
  });

  // Research mutation
  const researchMutation = useMutation({
    mutationFn: async (input: {
      organizationName: string;
      websiteUrl: string;
      industry?: string;
      notes?: string;
      saveAsReusable?: boolean;
    }) => {
      const response = await apiRequest('POST', '/api/unified-agents/org-intelligence/research', input);
      return response.json();
    },
    onSuccess: (data) => {
      setResearchResult({
        success: true,
        snapshot: data.snapshot,
        researchSummary: data.researchSummary,
        companyInfo: data.companyInfo,
      });
      setOiConfig(prev => ({ ...prev, snapshotId: data.snapshot.id }));
      queryClient.invalidateQueries({ queryKey: ['/api/unified-agents/org-intelligence/available-sources'] });
      toast({
        title: 'Research Complete',
        description: 'Review the findings below before continuing.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Research Failed',
        description: error.message || 'Failed to research organization',
        variant: 'destructive',
      });
    },
  });

  // Create agent mutation
  const createAgentMutation = useMutation({
    mutationFn: async (input: any) => {
      const response = await apiRequest('POST', '/api/virtual-agents/create-from-skill', input);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Agent Created!',
        description: `${voiceConfig.agentName} is ready to make calls.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents'] });
      setLocation('/virtual-agents');
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Create Agent',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleRunResearch = async () => {
    if (!oiConfig.organizationName || !oiConfig.websiteUrl) {
      toast({
        title: 'Missing Information',
        description: 'Please provide organization name and website URL',
        variant: 'destructive',
      });
      return;
    }
    setResearchResult(null);
    setResearchApproved(false);
    await researchMutation.mutateAsync({
      organizationName: oiConfig.organizationName,
      websiteUrl: oiConfig.websiteUrl,
      industry: oiConfig.industry,
      notes: oiConfig.notes,
      saveAsReusable: oiConfig.saveAsReusable,
    });
  };

  const handleApproveResearch = () => {
    setResearchApproved(true);
    toast({
      title: 'Research Approved',
      description: 'Proceeding to skill selection',
    });
    setCurrentStep('skills');
  };

  const handleSkillSelect = (skill: typeof SKILLS[0]) => {
    setSkillConfig({
      skillId: skill.id,
      skillName: skill.name,
      inputs: {},
    });
  };

  const handleSkillInputChange = (key: string, value: any) => {
    if (!skillConfig) return;
    setSkillConfig({
      ...skillConfig,
      inputs: { ...skillConfig.inputs, [key]: value },
    });
  };

  const handleCreateAgent = async () => {
    if (!skillConfig || !voiceConfig.agentName) {
      toast({
        title: 'Missing Information',
        description: 'Please complete all required fields',
        variant: 'destructive',
      });
      return;
    }

    await createAgentMutation.mutateAsync({
      agentName: voiceConfig.agentName,
      skillId: skillConfig.skillId,
      skillInputValues: skillConfig.inputs,
      voice: voiceConfig.voice,
      provider: voiceConfig.provider,
      orgIntelligenceConfig: oiConfig,
    });
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'intelligence':
        if (oiConfig.mode === 'none') return true;
        if (oiConfig.mode === 'use_existing') return !!(oiConfig.snapshotId || oiConfig.masterOrgIntelligenceId);
        if (oiConfig.mode === 'fresh_research') return researchApproved;
        return false;
      case 'skills':
        if (!skillConfig) return false;
        const skill = SKILLS.find(s => s.id === skillConfig.skillId);
        return skill?.inputs.filter(i => i.required).every(i => skillConfig.inputs[i.key]);
      case 'voice':
        return !!voiceConfig.agentName.trim();
      default:
        return true;
    }
  };

  const handleNext = () => {
    const stepOrder: CreationStep[] = ['intelligence', 'skills', 'voice', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex  {
    const stepOrder: CreationStep[] = ['intelligence', 'skills', 'voice', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  return (
    
      {/* Header */}
      
        
          
            
              
                
              
              
                Create AI Voice Agent
                Build your intelligent calling assistant
              
            
             setLocation('/virtual-agents')}>
              
              Cancel
            
          
        
      

      {/* Step Indicator */}
      
        
          
        
      

      {/* Main Content */}
      
        
          {/* Step 1: Organization Intelligence */}
          {currentStep === 'intelligence' && (
            
              
                Organization Intelligence
                
                  How should your agent understand the organization it represents? 
                  This knowledge powers authentic, informed conversations.
                
              

              {/* Mode Selection */}
               {
                  setOiConfig({ mode: value as OrgIntelligenceMode });
                  setResearchResult(null);
                  setResearchApproved(false);
                }}
                className="grid gap-4"
              >
                {/* Fresh Research */}
                
                  
                    
                      
                      
                        
                          
                          Run Fresh Research
                          Recommended
                        
                        
                          AI will research a new organization from their website and build a campaign-scoped snapshot
                          you control with the same Organization Profile intelligence workflow. You'll review and
                          approve before proceeding.
                        
                      
                    
                  
                

                {/* Use Existing */}
                
                  
                    
                      
                      
                        
                          
                          Use Existing Intelligence
                        
                        
                          Load from saved organization profiles or previous research snapshots. 
                          Best for your own organization or known clients.
                        
                      
                    
                  
                

                {/* None */}
                
                  
                    
                      
                      
                        
                          
                          No Organization Intelligence
                        
                        
                          Agent operates as a neutral researcher without representing any brand. 
                          Good for market research or discovery calls.
                        
                      
                    
                  
                
              

              {/* Fresh Research Form */}
              {oiConfig.mode === 'fresh_research' && !researchResult && (
                
                  
                    
                      
                      Research Target Organization
                    
                    
                      Enter the organization details to begin AI-powered research
                    
                  
                  
                    
                      
                        Organization Name *
                         setOiConfig(prev => ({ ...prev, organizationName: e.target.value }))}
                        />
                      
                      
                        Website URL *
                        
                          
                           setOiConfig(prev => ({ ...prev, websiteUrl: e.target.value }))}
                            className="pl-10"
                          />
                        
                      
                    
                    
                      
                        Industry (optional)
                         setOiConfig(prev => ({ ...prev, industry: e.target.value }))}
                        />
                      
                      
                        
                           setOiConfig(prev => ({ ...prev, saveAsReusable: e.target.checked }))}
                            className="h-4 w-4 rounded"
                          />
                          Save for future campaigns
                        
                      
                    
                    
                      Research Notes (optional)
                       setOiConfig(prev => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                      />
                    
                    
                      {researchMutation.isPending ? (
                        <>
                          
                          Researching Organization...
                        
                      ) : (
                        <>
                          
                          Run Organization Research
                        
                      )}
                    
                  
                
              )}

              {/* Research Result Preview */}
              {oiConfig.mode === 'fresh_research' && researchResult && researchResult.success && (
                
                  
                    
                  
                
              )}

              {/* Use Existing Source Selector */}
              {oiConfig.mode === 'use_existing' && (
                
                  
                    Select Intelligence Source
                  
                  
                    {sourcesLoading ? (
                      
                        
                        
                      
                    ) : (
                      
                        {oiSources?.masterOrgIntelligence && (
                           setOiConfig(prev => ({ 
                              ...prev, 
                              masterOrgIntelligenceId: oiSources.masterOrgIntelligence!.id,
                              snapshotId: undefined 
                            }))}
                            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                              oiSources.masterOrgIntelligence && oiConfig.masterOrgIntelligenceId === oiSources.masterOrgIntelligence.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            
                              
                              
                                {oiSources.masterOrgIntelligence.companyName}
                                {oiSources.masterOrgIntelligence.domain}
                              
                              Primary
                            
                          
                        )}
                        {oiSources?.reusableSnapshots?.map((snapshot: any) => (
                           setOiConfig(prev => ({ 
                              ...prev, 
                              snapshotId: snapshot.id,
                              masterOrgIntelligenceId: undefined 
                            }))}
                            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                              oiConfig.snapshotId === snapshot.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            
                              
                              
                                {snapshot.organizationName}
                                {snapshot.domain}
                              
                              {snapshot.confidenceScore && (
                                
                                  {Math.round(snapshot.confidenceScore * 100)}%
                                
                              )}
                            
                          
                        ))}
                        {!oiSources?.masterOrgIntelligence && !oiSources?.reusableSnapshots?.length && (
                          
                            
                            No existing intelligence found.
                            Switch to "Fresh Research" to create one.
                          
                        )}
                      
                    )}
                  
                
              )}

              {/* None Mode Info */}
              {oiConfig.mode === 'none' && (
                
                  
                    
                      
                      
                        Neutral Agent Mode
                        
                          Your agent will operate without representing any organization. 
                          This is ideal for market research, surveys, or discovery conversations 
                          where brand neutrality is important.
                        
                      
                    
                  
                
              )}
            
          )}

          {/* Step 2: Skills */}
          {currentStep === 'skills' && (
            
              
                Select Agent Skill
                
                  What should your agent specialize in? Each skill comes with 
                  pre-trained conversation intelligence.
                
              

              {/* Skill Grid */}
              
                {SKILLS.map((skill) => {
                  const Icon = skill.icon;
                  const isSelected = skillConfig?.skillId === skill.id;
                  return (
                     handleSkillSelect(skill)}
                      className={`p-5 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                        isSelected 
                          ? 'border-primary bg-primary/5 shadow-md' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      
                        
                          
                        
                        {isSelected && }
                      
                      {skill.name}
                      {skill.description}
                    
                  );
                })}
              

              {/* Skill Configuration */}
              {skillConfig && (
                
                  
                    Configure {skillConfig.skillName}
                    
                      Provide the details your agent needs to execute this skill effectively
                    
                  
                  
                    {SKILLS.find(s => s.id === skillConfig.skillId)?.inputs.map((input) => (
                      
                        
                          {input.label}
                          {input.required && *}
                        
                        {input.type === 'select' && input.options ? (
                           handleSkillInputChange(input.key, val)}
                          >
                            
                              
                            
                            
                              {input.options.map(opt => (
                                {opt.label}
                              ))}
                            
                          
                        ) : input.type === 'textarea' ? (
                           handleSkillInputChange(input.key, e.target.value)}
                            rows={3}
                          />
                        ) : (
                           handleSkillInputChange(input.key, e.target.value)}
                          />
                        )}
                      
                    ))}
                  
                
              )}
            
          )}

          {/* Step 3: Voice */}
          {currentStep === 'voice' && (
            
              
                Configure Voice & Identity
                
                  Give your agent a name and choose the voice that best represents your brand.
                
              

              
                
                  {/* Agent Name */}
                  
                    Agent Name *
                    
                      This is how your agent will introduce themselves on calls
                    
                     setVoiceConfig(prev => ({ ...prev, agentName: e.target.value }))}
                      className="text-lg h-12"
                    />
                  

                  

                  {/* Voice Provider - OpenAI only */}
                  
                    
                      Voice Provider
                      Using OpenAI text-to-speech
                    
                    
                      
                      OpenAI
                    
                  

                  {/* Voice Selection */}
                  
                    
                      Select Voice
                      Choose the voice that best fits your agent's persona
                    
                    
                      {VOICE_OPTIONS[voiceConfig.provider as keyof typeof VOICE_OPTIONS].map((voice) => (
                         setVoiceConfig(prev => ({ ...prev, voice: voice.id }))}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            voiceConfig.voice === voice.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          
                            {voice.name}
                            {voiceConfig.voice === voice.id && (
                              
                            )}
                          
                          
                            {voice.gender}
                          
                          {voice.style}
                        
                      ))}
                    
                  
                
              
            
          )}

          {/* Step 4: Review */}
          {currentStep === 'review' && (
            
              
                Review & Create
                
                  Review your agent configuration before deployment
                
              

              
                {/* Agent Summary */}
                
                  
                    
                      
                      Agent Profile
                    
                  
                  
                    
                      
                        
                      
                      
                        {voiceConfig.agentName || 'Unnamed Agent'}
                        {skillConfig?.skillName} Specialist
                      
                    
                    
                    
                      
                        Voice
                        {voiceConfig.voice} ({voiceConfig.provider})
                      
                      
                        Skill
                        {skillConfig?.skillName}
                      
                    
                  
                

                {/* Intelligence Summary */}
                
                  
                    
                      
                      Intelligence
                    
                  
                  
                    
                      {oiConfig.mode === 'fresh_research' && }
                      {oiConfig.mode === 'use_existing' && }
                      {oiConfig.mode === 'none' && }
                      {oiConfig.mode.replace('_', ' ')}
                    
                    {oiConfig.mode === 'fresh_research' && researchResult?.snapshot && (
                      
                        Organization: {researchResult.snapshot.organizationName}
                        Domain: {researchResult.snapshot.domain}
                        Confidence: {Math.round((researchResult.snapshot.confidenceScore || 0) * 100)}%
                      
                    )}
                    {oiConfig.mode === 'none' && (
                      
                        Agent will operate in neutral mode without organization context.
                      
                    )}
                  
                

                {/* Skill Configuration */}
                {skillConfig && (
                  
                    
                      
                        
                        Skill Configuration
                      
                    
                    
                      
                        {Object.entries(skillConfig.inputs).map(([key, value]) => (
                          
                            {key.replace(/_/g, ' ')}
                            {String(value) || '-'}
                          
                        ))}
                      
                    
                  
                )}
              

              {/* Create Button */}
              
                
                  
                    
                      Ready to Deploy
                      
                        Your agent will be ready to make calls immediately after creation.
                      
                    
                    
                      {createAgentMutation.isPending ? (
                        <>
                          
                          Creating...
                        
                      ) : (
                        <>
                          
                          Create Agent
                        
                      )}
                    
                  
                
              
            
          )}

          {/* Navigation */}
          
            
              
              Back
            
            {currentStep !== 'review' && (
              
                Continue
                
              
            )}
          
        
      
    
  );
}