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
  inputs: Record<string, any>;
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
  reusableSnapshots: Array<{
    id: string;
    organizationName: string;
    domain: string;
    industry: string | null;
    confidenceScore: number | null;
    createdAt: string;
  }>;
  modes: Array<{
    value: 'use_existing' | 'fresh_research' | 'none';
    label: string;
    description: string;
  }>;
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
  ],
  elevenlabs: [
    { id: 'rachel', name: 'Rachel', gender: 'Female', style: 'American Professional' },
    { id: 'drew', name: 'Drew', gender: 'Male', style: 'American Confident' },
    { id: 'clyde', name: 'Clyde', gender: 'Male', style: 'American Casual' },
    { id: 'emily', name: 'Emily', gender: 'Female', style: 'British Professional' },
  ]
};

// Step indicator component
function StepIndicator({ 
  steps, 
  currentStep 
}: { 
  steps: { id: CreationStep; label: string; icon: React.ComponentType<any> }[];
  currentStep: CreationStep;
}) {
  const currentIndex = steps.findIndex(s => s.id === currentStep);
  
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isCompleted = index < currentIndex;
        
        return (
          <React.Fragment key={step.id}>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
              isActive 
                ? 'bg-primary text-primary-foreground shadow-lg scale-105' 
                : isCompleted 
                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span className="font-medium text-sm hidden sm:inline">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <ChevronRight className={`h-4 w-4 ${
                index < currentIndex ? 'text-green-500' : 'text-muted-foreground'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Research Complete</h3>
            <p className="text-sm text-muted-foreground">{result.researchSummary}</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1">
          <Shield className="h-3 w-3" />
          {Math.round((result.snapshot?.confidenceScore || 0) * 100)}% Confidence
        </Badge>
      </div>

      {/* Research Data Preview */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Company Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Company Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Name:</span>
              <span className="ml-2 font-medium">{result.snapshot?.organizationName || data.companyName || 'N/A'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Domain:</span>
              <span className="ml-2 font-medium">{result.snapshot?.domain || 'N/A'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Industry:</span>
              <span className="ml-2 font-medium">{result.snapshot?.industry || data.industry || 'N/A'}</span>
            </div>
            {data.companySize && (
              <div>
                <span className="text-muted-foreground">Size:</span>
                <span className="ml-2 font-medium">{data.companySize}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Value Proposition */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Value Proposition
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {data.valueProposition || data.description || 'No value proposition extracted'}
            </p>
          </CardContent>
        </Card>

        {/* Products & Services */}
        {(data.products || data.offerings) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                Products & Services
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {(data.products || data.offerings || []).slice(0, 6).map((product: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {product}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Key Differentiators */}
        {data.differentiators && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Differentiators
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                {data.differentiators.slice(0, 3).map((diff: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
                    {diff}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button
          variant="outline"
          onClick={onRerun}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Re-run Research
        </Button>
        <Button
          onClick={onApprove}
          disabled={isLoading}
          className="gap-2 bg-green-600 hover:bg-green-700"
        >
          <CheckCircle2 className="h-4 w-4" />
          Approve & Continue
        </Button>
      </div>
    </div>
  );
}

// Main Page Component
export default function CreateAIAgentPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [currentStep, setCurrentStep] = useState<CreationStep>('intelligence');
  const [oiConfig, setOiConfig] = useState<OrgIntelligenceConfig>({ mode: 'fresh_research' });
  const [skillConfig, setSkillConfig] = useState<SkillConfig | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({ 
    provider: 'openai', 
    voice: 'nova',
    agentName: '' 
  });
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [researchApproved, setResearchApproved] = useState(false);

  // Steps configuration
  const steps: { id: CreationStep; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'intelligence', label: 'Intelligence', icon: Brain },
    { id: 'skills', label: 'Skills', icon: Zap },
    { id: 'voice', label: 'Voice', icon: Mic },
    { id: 'review', label: 'Review', icon: Eye },
  ];

  // Fetch available OI sources
  const { data: oiSources, isLoading: sourcesLoading } = useQuery<OrgSourcesResponse>({
    queryKey: ['/api/org-intelligence-injection/available-sources'],
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
      const response = await apiRequest('POST', '/api/org-intelligence-injection/research', input);
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
      queryClient.invalidateQueries({ queryKey: ['/api/org-intelligence-injection/available-sources'] });
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
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const stepOrder: CreationStep[] = ['intelligence', 'skills', 'voice', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Create AI Voice Agent</h1>
                <p className="text-sm text-muted-foreground">Build your intelligent calling assistant</p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => setLocation('/virtual-agents')}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="border-b bg-muted/30 py-4">
        <div className="container mx-auto px-6">
          <StepIndicator steps={steps} currentStep={currentStep} />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Step 1: Organization Intelligence */}
          {currentStep === 'intelligence' && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Organization Intelligence</h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  How should your agent understand the organization it represents? 
                  This knowledge powers authentic, informed conversations.
                </p>
              </div>

              {/* Mode Selection */}
              <RadioGroup
                value={oiConfig.mode}
                onValueChange={(value) => {
                  setOiConfig({ mode: value as OrgIntelligenceMode });
                  setResearchResult(null);
                  setResearchApproved(false);
                }}
                className="grid gap-4"
              >
                {/* Fresh Research */}
                <label className={`cursor-pointer`}>
                  <div className={`p-6 rounded-xl border-2 transition-all hover:shadow-md ${
                    oiConfig.mode === 'fresh_research' 
                      ? 'border-primary bg-primary/5 shadow-md' 
                      : 'border-border hover:border-primary/50'
                  }`}>
                    <div className="flex items-start gap-4">
                      <RadioGroupItem value="fresh_research" className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Search className="h-5 w-5 text-green-500" />
                          <span className="font-semibold">Run Fresh Research</span>
                          <Badge variant="secondary" className="text-xs">Recommended</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          AI will research a new organization from their website and build a comprehensive 
                          intelligence profile. You'll review and approve before proceeding.
                        </p>
                      </div>
                    </div>
                  </div>
                </label>

                {/* Use Existing */}
                <label className="cursor-pointer">
                  <div className={`p-6 rounded-xl border-2 transition-all hover:shadow-md ${
                    oiConfig.mode === 'use_existing' 
                      ? 'border-primary bg-primary/5 shadow-md' 
                      : 'border-border hover:border-primary/50'
                  }`}>
                    <div className="flex items-start gap-4">
                      <RadioGroupItem value="use_existing" className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Database className="h-5 w-5 text-blue-500" />
                          <span className="font-semibold">Use Existing Intelligence</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Load from saved organization profiles or previous research snapshots. 
                          Best for your own organization or known clients.
                        </p>
                      </div>
                    </div>
                  </div>
                </label>

                {/* None */}
                <label className="cursor-pointer">
                  <div className={`p-6 rounded-xl border-2 transition-all hover:shadow-md ${
                    oiConfig.mode === 'none' 
                      ? 'border-primary bg-primary/5 shadow-md' 
                      : 'border-border hover:border-primary/50'
                  }`}>
                    <div className="flex items-start gap-4">
                      <RadioGroupItem value="none" className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-5 w-5 text-gray-500" />
                          <span className="font-semibold">No Organization Intelligence</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Agent operates as a neutral researcher without representing any brand. 
                          Good for market research or discovery calls.
                        </p>
                      </div>
                    </div>
                  </div>
                </label>
              </RadioGroup>

              {/* Fresh Research Form */}
              {oiConfig.mode === 'fresh_research' && !researchResult && (
                <Card className="border-2 border-dashed">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-amber-500" />
                      Research Target Organization
                    </CardTitle>
                    <CardDescription>
                      Enter the organization details to begin AI-powered research
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Organization Name <span className="text-destructive">*</span></Label>
                        <Input
                          placeholder="e.g., Acme Corporation"
                          value={oiConfig.organizationName || ''}
                          onChange={(e) => setOiConfig(prev => ({ ...prev, organizationName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Website URL <span className="text-destructive">*</span></Label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="https://www.example.com"
                            value={oiConfig.websiteUrl || ''}
                            onChange={(e) => setOiConfig(prev => ({ ...prev, websiteUrl: e.target.value }))}
                            className="pl-10"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Industry (optional)</Label>
                        <Input
                          placeholder="e.g., SaaS, Healthcare"
                          value={oiConfig.industry || ''}
                          onChange={(e) => setOiConfig(prev => ({ ...prev, industry: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={oiConfig.saveAsReusable || false}
                            onChange={(e) => setOiConfig(prev => ({ ...prev, saveAsReusable: e.target.checked }))}
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-sm">Save for future campaigns</span>
                        </label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Research Notes (optional)</Label>
                      <Textarea
                        placeholder="Any specific focus areas or context..."
                        value={oiConfig.notes || ''}
                        onChange={(e) => setOiConfig(prev => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                      />
                    </div>
                    <Button
                      onClick={handleRunResearch}
                      disabled={researchMutation.isPending || !oiConfig.organizationName || !oiConfig.websiteUrl}
                      className="w-full"
                      size="lg"
                    >
                      {researchMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Researching Organization...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Run Organization Research
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Research Result Preview */}
              {oiConfig.mode === 'fresh_research' && researchResult && researchResult.success && (
                <Card className="border-2 border-green-200 dark:border-green-800">
                  <CardContent className="pt-6">
                    <ResearchPreview
                      result={researchResult}
                      onApprove={handleApproveResearch}
                      onRerun={handleRunResearch}
                      isLoading={researchMutation.isPending}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Use Existing Source Selector */}
              {oiConfig.mode === 'use_existing' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Select Intelligence Source</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sourcesLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {oiSources?.masterOrgIntelligence && (
                          <button
                            onClick={() => setOiConfig(prev => ({ 
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
                            <div className="flex items-center gap-3">
                              <Building2 className="h-5 w-5 text-primary" />
                              <div>
                                <div className="font-medium">{oiSources.masterOrgIntelligence.companyName}</div>
                                <div className="text-sm text-muted-foreground">{oiSources.masterOrgIntelligence.domain}</div>
                              </div>
                              <Badge className="ml-auto">Primary</Badge>
                            </div>
                          </button>
                        )}
                        {oiSources?.reusableSnapshots?.map((snapshot: any) => (
                          <button
                            key={snapshot.id}
                            onClick={() => setOiConfig(prev => ({ 
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
                            <div className="flex items-center gap-3">
                              <Globe className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{snapshot.organizationName}</div>
                                <div className="text-sm text-muted-foreground">{snapshot.domain}</div>
                              </div>
                              {snapshot.confidenceScore && (
                                <Badge variant="outline" className="ml-auto">
                                  {Math.round(snapshot.confidenceScore * 100)}%
                                </Badge>
                              )}
                            </div>
                          </button>
                        ))}
                        {!oiSources?.masterOrgIntelligence && !oiSources?.reusableSnapshots?.length && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>No existing intelligence found.</p>
                            <p className="text-sm">Switch to "Fresh Research" to create one.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* None Mode Info */}
              {oiConfig.mode === 'none' && (
                <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-800 dark:text-amber-200">Neutral Agent Mode</p>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          Your agent will operate without representing any organization. 
                          This is ideal for market research, surveys, or discovery conversations 
                          where brand neutrality is important.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 2: Skills */}
          {currentStep === 'skills' && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Select Agent Skill</h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  What should your agent specialize in? Each skill comes with 
                  pre-trained conversation intelligence.
                </p>
              </div>

              {/* Skill Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {SKILLS.map((skill) => {
                  const Icon = skill.icon;
                  const isSelected = skillConfig?.skillId === skill.id;
                  return (
                    <button
                      key={skill.id}
                      onClick={() => handleSkillSelect(skill)}
                      className={`p-5 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                        isSelected 
                          ? 'border-primary bg-primary/5 shadow-md' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`p-2 rounded-lg ${
                          isSelected ? 'bg-primary/20' : 'bg-muted'
                        }`}>
                          <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        {isSelected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                      </div>
                      <h3 className="font-semibold mb-1">{skill.name}</h3>
                      <p className="text-sm text-muted-foreground">{skill.description}</p>
                    </button>
                  );
                })}
              </div>

              {/* Skill Configuration */}
              {skillConfig && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Configure {skillConfig.skillName}</CardTitle>
                    <CardDescription>
                      Provide the details your agent needs to execute this skill effectively
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {SKILLS.find(s => s.id === skillConfig.skillId)?.inputs.map((input) => (
                      <div key={input.key} className="space-y-2">
                        <Label>
                          {input.label}
                          {input.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        {input.type === 'select' && input.options ? (
                          <Select
                            value={skillConfig.inputs[input.key] || ''}
                            onValueChange={(val) => handleSkillInputChange(input.key, val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {input.options.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : input.type === 'textarea' ? (
                          <Textarea
                            placeholder={input.placeholder}
                            value={skillConfig.inputs[input.key] || ''}
                            onChange={(e) => handleSkillInputChange(input.key, e.target.value)}
                            rows={3}
                          />
                        ) : (
                          <Input
                            type={input.type}
                            placeholder={input.placeholder}
                            value={skillConfig.inputs[input.key] || ''}
                            onChange={(e) => handleSkillInputChange(input.key, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Voice */}
          {currentStep === 'voice' && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Configure Voice & Identity</h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  Give your agent a name and choose the voice that best represents your brand.
                </p>
              </div>

              <Card>
                <CardContent className="pt-6 space-y-6">
                  {/* Agent Name */}
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Agent Name <span className="text-destructive">*</span></Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      This is how your agent will introduce themselves on calls
                    </p>
                    <Input
                      placeholder="e.g., Sarah Chen, Michael Brooks"
                      value={voiceConfig.agentName}
                      onChange={(e) => setVoiceConfig(prev => ({ ...prev, agentName: e.target.value }))}
                      className="text-lg h-12"
                    />
                  </div>

                  <Separator />

                  {/* Voice Provider */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-semibold">Voice Provider</Label>
                      <p className="text-sm text-muted-foreground">Choose your preferred text-to-speech provider</p>
                    </div>
                    <Tabs value={voiceConfig.provider} onValueChange={(v) => setVoiceConfig(prev => ({ ...prev, provider: v, voice: VOICE_OPTIONS[v as keyof typeof VOICE_OPTIONS][0].id }))}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="openai" className="gap-2">
                          <Zap className="h-4 w-4" />
                          OpenAI
                        </TabsTrigger>
                        <TabsTrigger value="elevenlabs" className="gap-2">
                          <Volume2 className="h-4 w-4" />
                          ElevenLabs
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Voice Selection */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-semibold">Select Voice</Label>
                      <p className="text-sm text-muted-foreground">Choose the voice that best fits your agent's persona</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {VOICE_OPTIONS[voiceConfig.provider as keyof typeof VOICE_OPTIONS].map((voice) => (
                        <button
                          key={voice.id}
                          onClick={() => setVoiceConfig(prev => ({ ...prev, voice: voice.id }))}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            voiceConfig.voice === voice.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{voice.name}</span>
                            {voiceConfig.voice === voice.id && (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="text-xs">{voice.gender}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{voice.style}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 'review' && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Review & Create</h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  Review your agent configuration before deployment
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Agent Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      Agent Profile
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <Bot className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">{voiceConfig.agentName || 'Unnamed Agent'}</h3>
                        <p className="text-muted-foreground">{skillConfig?.skillName} Specialist</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Voice</span>
                        <span className="font-medium capitalize">{voiceConfig.voice} ({voiceConfig.provider})</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Skill</span>
                        <span className="font-medium">{skillConfig?.skillName}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Intelligence Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Brain className="h-5 w-5 text-purple-500" />
                      Intelligence
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      {oiConfig.mode === 'fresh_research' && <Search className="h-4 w-4 text-green-500" />}
                      {oiConfig.mode === 'use_existing' && <Database className="h-4 w-4 text-blue-500" />}
                      {oiConfig.mode === 'none' && <FileText className="h-4 w-4 text-gray-500" />}
                      <span className="font-medium capitalize">{oiConfig.mode.replace('_', ' ')}</span>
                    </div>
                    {oiConfig.mode === 'fresh_research' && researchResult?.snapshot && (
                      <div className="text-sm text-muted-foreground">
                        <p>Organization: <span className="font-medium text-foreground">{researchResult.snapshot.organizationName}</span></p>
                        <p>Domain: {researchResult.snapshot.domain}</p>
                        <p>Confidence: {Math.round((researchResult.snapshot.confidenceScore || 0) * 100)}%</p>
                      </div>
                    )}
                    {oiConfig.mode === 'none' && (
                      <p className="text-sm text-muted-foreground">
                        Agent will operate in neutral mode without organization context.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Skill Configuration */}
                {skillConfig && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Settings2 className="h-5 w-5 text-amber-500" />
                        Skill Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {Object.entries(skillConfig.inputs).map(([key, value]) => (
                          <div key={key}>
                            <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                            <p className="font-medium truncate">{String(value) || '-'}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Create Button */}
              <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">Ready to Deploy</h3>
                      <p className="text-sm text-muted-foreground">
                        Your agent will be ready to make calls immediately after creation.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      onClick={handleCreateAgent}
                      disabled={createAgentMutation.isPending}
                      className="gap-2 px-8"
                    >
                      {createAgentMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Create Agent
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-8 border-t mt-8">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 'intelligence'}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {currentStep !== 'review' && (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                className="gap-2"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
