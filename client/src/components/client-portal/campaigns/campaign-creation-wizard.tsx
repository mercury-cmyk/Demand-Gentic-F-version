/**
 * Campaign Creation Wizard
 *
 * Multi-step wizard for creating campaigns with:
 * - Campaign basics (name, channel, type)
 * - Campaign content (objective, talking points, success criteria)
 * - AI Agent selection with voice preview
 * - Audience selection (own data or request handling)
 * - Review & submit
 */

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Phone, Mail, Target, Users, Building2, MapPin,
  Calendar, DollarSign, Loader2, Send, Save, CheckCircle2,
  Sparkles, AlertCircle, ArrowRight, ArrowLeft, Bot, Mic,
  Volume2, VolumeX, Play, Square, Brain, Zap, UserCircle,
  Globe, MessageSquare, ChevronRight, Check, X, Plus, Trash2,
  Upload, Database, Lightbulb, Headphones, Wand2, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface CampaignCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (campaign: any) => void;
}

// Campaign Types
const CAMPAIGN_TYPES = [
  { value: 'lead_generation', label: 'Lead Generation', icon: Target, description: 'Generate qualified leads for your sales team' },
  { value: 'appointment_setting', label: 'Appointment Setting', icon: Calendar, description: 'Book meetings with qualified prospects' },
  { value: 'market_research', label: 'Market Research', icon: Brain, description: 'Gather market intelligence through conversations' },
  { value: 'event_promotion', label: 'Event Promotion', icon: Users, description: 'Promote webinars, conferences, or events' },
  { value: 'product_launch', label: 'Product Launch', icon: Sparkles, description: 'Introduce new products or services' },
  { value: 'customer_feedback', label: 'Customer Feedback', icon: MessageSquare, description: 'Collect feedback from existing customers' },
];

// Promotion Channels
const PROMOTION_CHANNELS = [
  { value: 'voice', label: 'AI Voice Calls', icon: Phone, description: 'Intelligent AI-powered phone conversations', color: 'bg-blue-500' },
  { value: 'email', label: 'Email Campaign', icon: Mail, description: 'Personalized email sequences', color: 'bg-green-500' },
  { value: 'combo', label: 'Multi-Channel', icon: Sparkles, description: 'Combined voice + email outreach', color: 'bg-purple-500' },
];

// AI Voices available for preview
const AI_VOICES = [
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', description: 'Professional, confident tone', accent: 'American' },
  { id: 'Aoede', name: 'Aoede', gender: 'female', description: 'Warm, friendly personality', accent: 'American' },
  { id: 'Puck', name: 'Puck', gender: 'male', description: 'Energetic, engaging style', accent: 'American' },
  { id: 'Kore', name: 'Kore', gender: 'female', description: 'Calm, reassuring voice', accent: 'American' },
  { id: 'Charon', name: 'Charon', gender: 'male', description: 'Deep, authoritative tone', accent: 'American' },
  { id: 'Orion', name: 'Orion', gender: 'male', description: 'Clear, articulate speaker', accent: 'British' },
  { id: 'Vega', name: 'Vega', gender: 'female', description: 'Sophisticated, professional', accent: 'British' },
  { id: 'Pegasus', name: 'Pegasus', gender: 'male', description: 'Dynamic, persuasive style', accent: 'American' },
];

// Wizard steps
const STEPS = [
  { id: 1, title: 'Basics', icon: FileText },
  { id: 2, title: 'Channel', icon: Globe },
  { id: 3, title: 'Type', icon: Target },
  { id: 4, title: 'Content', icon: Lightbulb },
  { id: 5, title: 'AI Agent', icon: Bot },
  { id: 6, title: 'Audience', icon: Users },
  { id: 7, title: 'Review', icon: Eye },
];

interface FormData {
  // Step 1: Basics
  name: string;
  description: string;

  // Step 2: Channel
  channel: 'voice' | 'email' | 'combo';

  // Step 3: Type
  campaignType: string;

  // Step 4: Content
  objective: string;
  talkingPoints: string[];
  successCriteria: string;
  targetAudience: string;
  objections: { objection: string; response: string }[];

  // Step 5: AI Agent
  selectedVoice: string;
  agentPersona: string;
  agentTone: 'professional' | 'friendly' | 'consultative' | 'direct';
  openingScript: string;

  // Step 6: Audience
  audienceSource: 'own_data' | 'request_handling';
  selectedAccounts: string[];
  selectedContacts: string[];
  targetIndustries: string[];
  targetTitles: string[];
  targetRegions: string[];
  targetCompanySize: string;
  targetLeadCount: number | undefined;

  // Additional
  priority: 'low' | 'normal' | 'high' | 'urgent';
  startDate: string;
  endDate: string;
  budget: number | undefined;
}

export function CampaignCreationWizard({ open, onOpenChange, onSuccess }: CampaignCreationWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    channel: 'voice',
    campaignType: 'lead_generation',
    objective: '',
    talkingPoints: [''],
    successCriteria: '',
    targetAudience: '',
    objections: [{ objection: '', response: '' }],
    selectedVoice: 'Fenrir',
    agentPersona: '',
    agentTone: 'professional',
    openingScript: '',
    audienceSource: 'request_handling',
    selectedAccounts: [],
    selectedContacts: [],
    targetIndustries: [],
    targetTitles: [],
    targetRegions: [],
    targetCompanySize: '',
    targetLeadCount: undefined,
    priority: 'normal',
    startDate: '',
    endDate: '',
    budget: undefined,
  });

  // Input states for array fields
  const [industryInput, setIndustryInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [regionInput, setRegionInput] = useState('');

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch client's accounts for audience selection
  const { data: clientAccounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['client-accounts-for-campaign'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/crm/accounts', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && formData.audienceSource === 'own_data',
  });

  // Fetch client's contacts for audience selection
  const { data: clientContacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['client-contacts-for-campaign'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/crm/contacts', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && formData.audienceSource === 'own_data',
  });

  // Create campaign mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/campaigns/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create campaign');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['client-campaigns'] });
      toast({
        title: 'Campaign Created!',
        description: 'Your campaign has been submitted for review.',
      });
      onSuccess?.(data);
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      channel: 'voice',
      campaignType: 'lead_generation',
      objective: '',
      talkingPoints: [''],
      successCriteria: '',
      targetAudience: '',
      objections: [{ objection: '', response: '' }],
      selectedVoice: 'Fenrir',
      agentPersona: '',
      agentTone: 'professional',
      openingScript: '',
      audienceSource: 'request_handling',
      selectedAccounts: [],
      selectedContacts: [],
      targetIndustries: [],
      targetTitles: [],
      targetRegions: [],
      targetCompanySize: '',
      targetLeadCount: undefined,
      priority: 'normal',
      startDate: '',
      endDate: '',
      budget: undefined,
    });
    setStep(1);
  };

  // Voice preview functionality
  const playVoicePreview = (voiceId: string) => {
    if (isPlaying && playingVoice === voiceId) {
      stopVoicePreview();
      return;
    }

    stopVoicePreview();

    const voice = AI_VOICES.find(v => v.id === voiceId);
    if (!voice) return;

    setIsPlaying(true);
    setPlayingVoice(voiceId);

    // Use browser TTS for preview (in production, use actual AI voice API)
    const sampleText = `Hello! I'm ${voice.name}. I'll be representing your company in conversations with prospects. My style is ${voice.description.toLowerCase()}. How can I help you today?`;

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(sampleText);
      utterance.rate = 1.0;
      utterance.pitch = voice.gender === 'male' ? 0.9 : 1.1;
      utterance.onend = () => {
        setIsPlaying(false);
        setPlayingVoice(null);
      };
      utterance.onerror = () => {
        setIsPlaying(false);
        setPlayingVoice(null);
      };
      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopVoicePreview = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setPlayingVoice(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoicePreview();
    };
  }, []);

  // Step validation
  const isStepValid = (stepNum: number): boolean => {
    switch (stepNum) {
      case 1:
        return formData.name.trim().length > 0;
      case 2:
        return !!formData.channel;
      case 3:
        return !!formData.campaignType;
      case 4:
        return formData.objective.trim().length > 0 && formData.successCriteria.trim().length > 0;
      case 5:
        return formData.channel === 'email' || !!formData.selectedVoice;
      case 6:
        return formData.audienceSource === 'request_handling' ||
               formData.selectedAccounts.length > 0 ||
               formData.selectedContacts.length > 0 ||
               formData.targetIndustries.length > 0;
      case 7:
        return true;
      default:
        return true;
    }
  };

  // Progress calculation
  const progressPercentage = ((step - 1) / (STEPS.length - 1)) * 100;

  // Add array item helpers
  const addTalkingPoint = () => {
    setFormData(prev => ({
      ...prev,
      talkingPoints: [...prev.talkingPoints, ''],
    }));
  };

  const removeTalkingPoint = (index: number) => {
    setFormData(prev => ({
      ...prev,
      talkingPoints: prev.talkingPoints.filter((_, i) => i !== index),
    }));
  };

  const updateTalkingPoint = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      talkingPoints: prev.talkingPoints.map((p, i) => i === index ? value : p),
    }));
  };

  const addObjection = () => {
    setFormData(prev => ({
      ...prev,
      objections: [...prev.objections, { objection: '', response: '' }],
    }));
  };

  const removeObjection = (index: number) => {
    setFormData(prev => ({
      ...prev,
      objections: prev.objections.filter((_, i) => i !== index),
    }));
  };

  const updateObjection = (index: number, field: 'objection' | 'response', value: string) => {
    setFormData(prev => ({
      ...prev,
      objections: prev.objections.map((o, i) =>
        i === index ? { ...o, [field]: value } : o
      ),
    }));
  };

  const handleAddArrayItem = (field: 'targetIndustries' | 'targetTitles' | 'targetRegions', value: string) => {
    if (value.trim()) {
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], value.trim()],
      }));
    }
  };

  const handleRemoveArrayItem = (field: 'targetIndustries' | 'targetTitles' | 'targetRegions', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const selectedChannel = PROMOTION_CHANNELS.find(c => c.value === formData.channel);
  const selectedType = CAMPAIGN_TYPES.find(t => t.value === formData.campaignType);
  const selectedVoiceInfo = AI_VOICES.find(v => v.id === formData.selectedVoice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header with progress */}
        <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Wand2 className="h-5 w-5 text-primary" />
              Create New Campaign
            </DialogTitle>
            <DialogDescription>
              Set up your AI-powered campaign in a few easy steps
            </DialogDescription>
          </DialogHeader>

          {/* Progress bar */}
          <div className="mt-4">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex justify-between mt-3">
              {STEPS.map((s) => (
                <TooltipProvider key={s.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => s.id < step && setStep(s.id)}
                        disabled={s.id > step}
                        className={cn(
                          'flex flex-col items-center gap-1 transition-all',
                          s.id === step && 'scale-110',
                          s.id <= step ? 'text-primary' : 'text-muted-foreground'
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                          s.id < step ? 'bg-primary text-primary-foreground' :
                          s.id === step ? 'bg-primary/20 text-primary ring-2 ring-primary' :
                          'bg-muted text-muted-foreground'
                        )}>
                          {s.id < step ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <s.icon className="h-4 w-4" />
                          )}
                        </div>
                        <span className="text-xs font-medium hidden sm:block">{s.title}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{s.title}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        </div>

        {/* Content area */}
        <ScrollArea className="flex-1 px-6">
          <div className="py-6">
            <AnimatePresence mode="wait">
              {/* Step 1: Campaign Basics */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <h3 className="text-lg font-semibold mb-2">Let's start with the basics</h3>
                    <p className="text-muted-foreground">Give your campaign a name and description</p>
                  </div>

                  <div className="space-y-4 max-w-xl mx-auto">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-base">Campaign Name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Q1 Lead Generation - Tech Sector"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="h-12 text-lg"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Campaign Description (Optional)</Label>
                      <Textarea
                        id="description"
                        placeholder="Briefly describe what this campaign is about..."
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        rows={4}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Promotion Channel */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <h3 className="text-lg font-semibold mb-2">Choose your promotion channel</h3>
                    <p className="text-muted-foreground">How would you like to reach your audience?</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                    {PROMOTION_CHANNELS.map((channel) => (
                      <button
                        key={channel.value}
                        onClick={() => setFormData(prev => ({ ...prev, channel: channel.value as any }))}
                        className={cn(
                          'relative flex flex-col items-center p-6 rounded-xl border-2 transition-all hover:shadow-lg',
                          formData.channel === channel.value
                            ? 'border-primary bg-primary/5 shadow-md'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {formData.channel === channel.value && (
                          <div className="absolute top-3 right-3">
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-4 w-4 text-primary-foreground" />
                            </div>
                          </div>
                        )}
                        <div className={cn(
                          'w-16 h-16 rounded-full flex items-center justify-center mb-4',
                          channel.color,
                          'text-white'
                        )}>
                          <channel.icon className="h-8 w-8" />
                        </div>
                        <h4 className="font-semibold mb-2">{channel.label}</h4>
                        <p className="text-sm text-muted-foreground text-center">{channel.description}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 3: Campaign Type */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <h3 className="text-lg font-semibold mb-2">What type of campaign is this?</h3>
                    <p className="text-muted-foreground">Select the primary goal for your campaign</p>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
                    {CAMPAIGN_TYPES.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setFormData(prev => ({ ...prev, campaignType: type.value }))}
                        className={cn(
                          'flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all',
                          formData.campaignType === type.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                          formData.campaignType === type.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}>
                          <type.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-medium">{type.label}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 4: Campaign Content */}
              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <h3 className="text-lg font-semibold mb-2">Define your campaign content</h3>
                    <p className="text-muted-foreground">Tell us what makes your campaign special</p>
                  </div>

                  <div className="max-w-2xl mx-auto space-y-6">
                    {/* Campaign Objective */}
                    <div className="space-y-2">
                      <Label className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        Campaign Objective *
                      </Label>
                      <Textarea
                        placeholder="e.g., Book qualified meetings with IT decision makers at mid-market companies"
                        value={formData.objective}
                        onChange={(e) => setFormData(prev => ({ ...prev, objective: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    {/* Key Talking Points */}
                    <div className="space-y-3">
                      <Label className="text-base flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        Key Talking Points
                      </Label>
                      <p className="text-sm text-muted-foreground">What should the AI agent highlight?</p>
                      {formData.talkingPoints.map((point, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            placeholder={`Talking point ${index + 1}`}
                            value={point}
                            onChange={(e) => updateTalkingPoint(index, e.target.value)}
                          />
                          {formData.talkingPoints.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeTalkingPoint(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addTalkingPoint}
                        className="w-full"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Talking Point
                      </Button>
                    </div>

                    {/* Success Criteria */}
                    <div className="space-y-2">
                      <Label className="text-base flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Success Criteria *
                      </Label>
                      <Textarea
                        placeholder="e.g., Meeting booked with a decision maker who has budget authority and a timeline of 3-6 months"
                        value={formData.successCriteria}
                        onChange={(e) => setFormData(prev => ({ ...prev, successCriteria: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    {/* Target Audience Description */}
                    <div className="space-y-2">
                      <Label className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Target Audience Description
                      </Label>
                      <Textarea
                        placeholder="e.g., CISOs and IT Directors at companies with 500-5000 employees in the financial services sector"
                        value={formData.targetAudience}
                        onChange={(e) => setFormData(prev => ({ ...prev, targetAudience: e.target.value }))}
                        rows={2}
                      />
                    </div>

                    {/* Common Objections */}
                    <div className="space-y-3">
                      <Label className="text-base flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-primary" />
                        Common Objections & Responses (Optional)
                      </Label>
                      {formData.objections.map((obj, index) => (
                        <Card key={index} className="p-4">
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium">Objection {index + 1}</span>
                              {formData.objections.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeObjection(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <Input
                              placeholder="What objection might prospects raise?"
                              value={obj.objection}
                              onChange={(e) => updateObjection(index, 'objection', e.target.value)}
                            />
                            <Input
                              placeholder="How should the AI respond?"
                              value={obj.response}
                              onChange={(e) => updateObjection(index, 'response', e.target.value)}
                            />
                          </div>
                        </Card>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addObjection}
                        className="w-full"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Objection
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 5: AI Agent Selection */}
              {step === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <h3 className="text-lg font-semibold mb-2">
                      {formData.channel === 'email' ? 'Configure AI Email Agent' : 'Select Your AI Voice Agent'}
                    </h3>
                    <p className="text-muted-foreground">
                      {formData.channel === 'email'
                        ? 'Set up how your AI will craft emails'
                        : 'Choose a voice and preview how your AI agent will sound'}
                    </p>
                  </div>

                  {formData.channel !== 'email' && (
                    <>
                      {/* Voice Selection Grid */}
                      <div className="max-w-4xl mx-auto">
                        <Label className="text-base mb-4 block">Select AI Voice</Label>
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {AI_VOICES.map((voice) => (
                            <Card
                              key={voice.id}
                              className={cn(
                                'cursor-pointer transition-all hover:shadow-md relative overflow-hidden',
                                formData.selectedVoice === voice.id
                                  ? 'ring-2 ring-primary'
                                  : 'hover:ring-1 hover:ring-primary/50'
                              )}
                              onClick={() => setFormData(prev => ({ ...prev, selectedVoice: voice.id }))}
                            >
                              {formData.selectedVoice === voice.id && (
                                <div className="absolute top-2 right-2">
                                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                    <Check className="h-3 w-3 text-primary-foreground" />
                                  </div>
                                </div>
                              )}
                              <CardContent className="p-4">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className={cn(
                                    'w-10 h-10 rounded-full flex items-center justify-center',
                                    voice.gender === 'male' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'
                                  )}>
                                    <Mic className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <h4 className="font-semibold">{voice.name}</h4>
                                    <p className="text-xs text-muted-foreground">{voice.accent}</p>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground mb-3">{voice.description}</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="w-full"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playVoicePreview(voice.id);
                                  }}
                                >
                                  {isPlaying && playingVoice === voice.id ? (
                                    <>
                                      <Square className="h-3 w-3 mr-2" />
                                      Stop
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-3 w-3 mr-2" />
                                      Preview
                                    </>
                                  )}
                                </Button>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>

                      <Separator />
                    </>
                  )}

                  {/* Agent Personality Configuration */}
                  <div className="max-w-2xl mx-auto space-y-6">
                    <div className="space-y-2">
                      <Label className="text-base">Agent Tone</Label>
                      <RadioGroup
                        value={formData.agentTone}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, agentTone: value as any }))}
                        className="grid grid-cols-2 md:grid-cols-4 gap-4"
                      >
                        {[
                          { value: 'professional', label: 'Professional', icon: Building2 },
                          { value: 'friendly', label: 'Friendly', icon: Sparkles },
                          { value: 'consultative', label: 'Consultative', icon: Brain },
                          { value: 'direct', label: 'Direct', icon: Zap },
                        ].map((tone) => (
                          <Label
                            key={tone.value}
                            className={cn(
                              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all',
                              formData.agentTone === tone.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <RadioGroupItem value={tone.value} className="sr-only" />
                            <tone.icon className={cn(
                              'h-6 w-6',
                              formData.agentTone === tone.value ? 'text-primary' : 'text-muted-foreground'
                            )} />
                            <span className="font-medium text-sm">{tone.label}</span>
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="persona">Agent Persona (Optional)</Label>
                      <Textarea
                        id="persona"
                        placeholder="e.g., A knowledgeable solutions consultant who focuses on understanding client needs before proposing solutions"
                        value={formData.agentPersona}
                        onChange={(e) => setFormData(prev => ({ ...prev, agentPersona: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    {formData.channel !== 'email' && (
                      <div className="space-y-2">
                        <Label htmlFor="opening">Opening Script (Optional)</Label>
                        <Textarea
                          id="opening"
                          placeholder="e.g., Hi [Name], this is [Agent] from [Company]. I'm reaching out because..."
                          value={formData.openingScript}
                          onChange={(e) => setFormData(prev => ({ ...prev, openingScript: e.target.value }))}
                          rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                          Use [Name], [Company], [Title] as placeholders for personalization
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Step 6: Audience Selection */}
              {step === 6 && (
                <motion.div
                  key="step6"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <h3 className="text-lg font-semibold mb-2">Define your target audience</h3>
                    <p className="text-muted-foreground">Use your own data or let us find the right prospects</p>
                  </div>

                  <div className="max-w-3xl mx-auto">
                    {/* Audience Source Toggle */}
                    <div className="grid md:grid-cols-2 gap-4 mb-8">
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, audienceSource: 'own_data' }))}
                        className={cn(
                          'flex flex-col items-center p-6 rounded-xl border-2 transition-all',
                          formData.audienceSource === 'own_data'
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        <Database className="h-12 w-12 mb-4 text-primary" />
                        <h4 className="font-semibold mb-2">Use My Data</h4>
                        <p className="text-sm text-muted-foreground text-center">
                          Select from your uploaded accounts and contacts
                        </p>
                      </button>

                      <button
                        onClick={() => setFormData(prev => ({ ...prev, audienceSource: 'request_handling' }))}
                        className={cn(
                          'flex flex-col items-center p-6 rounded-xl border-2 transition-all',
                          formData.audienceSource === 'request_handling'
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        <Sparkles className="h-12 w-12 mb-4 text-primary" />
                        <h4 className="font-semibold mb-2">Let Us Handle It</h4>
                        <p className="text-sm text-muted-foreground text-center">
                          We'll source and qualify the right prospects for you
                        </p>
                      </button>
                    </div>

                    {formData.audienceSource === 'own_data' ? (
                      <div className="space-y-6">
                        {/* Account Selection */}
                        <div className="space-y-3">
                          <Label className="text-base">Select Accounts</Label>
                          {accountsLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                          ) : clientAccounts.length > 0 ? (
                            <ScrollArea className="h-48 border rounded-lg p-4">
                              <div className="space-y-2">
                                {clientAccounts.map((account: any) => (
                                  <div key={account.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded">
                                    <Checkbox
                                      checked={formData.selectedAccounts.includes(account.id)}
                                      onCheckedChange={(checked) => {
                                        setFormData(prev => ({
                                          ...prev,
                                          selectedAccounts: checked
                                            ? [...prev.selectedAccounts, account.id]
                                            : prev.selectedAccounts.filter(id => id !== account.id)
                                        }));
                                      }}
                                    />
                                    <div className="flex-1">
                                      <p className="font-medium">{account.name}</p>
                                      <p className="text-sm text-muted-foreground">{account.industry}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          ) : (
                            <Card className="p-6 text-center">
                              <Database className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-muted-foreground">No accounts uploaded yet</p>
                              <Button variant="link" className="mt-2">Upload Accounts</Button>
                            </Card>
                          )}
                        </div>

                        {/* Contact Selection */}
                        <div className="space-y-3">
                          <Label className="text-base">Select Contacts</Label>
                          {contactsLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                          ) : clientContacts.length > 0 ? (
                            <ScrollArea className="h-48 border rounded-lg p-4">
                              <div className="space-y-2">
                                {clientContacts.map((contact: any) => (
                                  <div key={contact.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded">
                                    <Checkbox
                                      checked={formData.selectedContacts.includes(contact.id)}
                                      onCheckedChange={(checked) => {
                                        setFormData(prev => ({
                                          ...prev,
                                          selectedContacts: checked
                                            ? [...prev.selectedContacts, contact.id]
                                            : prev.selectedContacts.filter(id => id !== contact.id)
                                        }));
                                      }}
                                    />
                                    <div className="flex-1">
                                      <p className="font-medium">{contact.firstName} {contact.lastName}</p>
                                      <p className="text-sm text-muted-foreground">{contact.jobTitle}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          ) : (
                            <Card className="p-6 text-center">
                              <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-muted-foreground">No contacts uploaded yet</p>
                              <Button variant="link" className="mt-2">Upload Contacts</Button>
                            </Card>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Target Industries */}
                        <div className="space-y-2">
                          <Label>Target Industries</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add industry (press Enter)"
                              value={industryInput}
                              onChange={(e) => setIndustryInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddArrayItem('targetIndustries', industryInput);
                                  setIndustryInput('');
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                handleAddArrayItem('targetIndustries', industryInput);
                                setIndustryInput('');
                              }}
                            >
                              Add
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {formData.targetIndustries.map((industry, idx) => (
                              <Badge key={idx} variant="secondary" className="gap-1 py-1">
                                {industry}
                                <button
                                  onClick={() => handleRemoveArrayItem('targetIndustries', idx)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Target Job Titles */}
                        <div className="space-y-2">
                          <Label>Target Job Titles</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add job title (press Enter)"
                              value={titleInput}
                              onChange={(e) => setTitleInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddArrayItem('targetTitles', titleInput);
                                  setTitleInput('');
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                handleAddArrayItem('targetTitles', titleInput);
                                setTitleInput('');
                              }}
                            >
                              Add
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {formData.targetTitles.map((title, idx) => (
                              <Badge key={idx} variant="secondary" className="gap-1 py-1">
                                {title}
                                <button
                                  onClick={() => handleRemoveArrayItem('targetTitles', idx)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Target Regions */}
                        <div className="space-y-2">
                          <Label>Target Regions</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add region (press Enter)"
                              value={regionInput}
                              onChange={(e) => setRegionInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddArrayItem('targetRegions', regionInput);
                                  setRegionInput('');
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                handleAddArrayItem('targetRegions', regionInput);
                                setRegionInput('');
                              }}
                            >
                              Add
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {formData.targetRegions.map((region, idx) => (
                              <Badge key={idx} variant="secondary" className="gap-1 py-1">
                                {region}
                                <button
                                  onClick={() => handleRemoveArrayItem('targetRegions', idx)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Company Size and Lead Count */}
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Company Size</Label>
                            <Select
                              value={formData.targetCompanySize}
                              onValueChange={(value) => setFormData(prev => ({ ...prev, targetCompanySize: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select size range" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1-10">1-10 employees</SelectItem>
                                <SelectItem value="11-50">11-50 employees</SelectItem>
                                <SelectItem value="51-200">51-200 employees</SelectItem>
                                <SelectItem value="201-500">201-500 employees</SelectItem>
                                <SelectItem value="501-1000">501-1000 employees</SelectItem>
                                <SelectItem value="1001-5000">1001-5000 employees</SelectItem>
                                <SelectItem value="5001+">5001+ employees</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Target Lead Count</Label>
                            <Input
                              type="number"
                              placeholder="e.g., 500"
                              value={formData.targetLeadCount || ''}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                targetLeadCount: e.target.value ? parseInt(e.target.value) : undefined
                              }))}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Step 7: Review */}
              {step === 7 && (
                <motion.div
                  key="step7"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <h3 className="text-lg font-semibold mb-2">Review your campaign</h3>
                    <p className="text-muted-foreground">Make sure everything looks good before submitting</p>
                  </div>

                  <div className="max-w-3xl mx-auto space-y-4">
                    {/* Campaign Summary Card */}
                    <Card className="overflow-hidden">
                      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
                        <div className="flex items-center gap-3">
                          {selectedChannel && (
                            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center text-white', selectedChannel.color)}>
                              <selectedChannel.icon className="h-6 w-6" />
                            </div>
                          )}
                          <div>
                            <CardTitle>{formData.name || 'Untitled Campaign'}</CardTitle>
                            <CardDescription>{selectedType?.label} • {selectedChannel?.label}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6 space-y-6">
                        {/* Objective */}
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground mb-2">Objective</h4>
                          <p>{formData.objective || 'Not specified'}</p>
                        </div>

                        {/* Talking Points */}
                        {formData.talkingPoints.filter(p => p.trim()).length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm text-muted-foreground mb-2">Key Talking Points</h4>
                            <ul className="list-disc list-inside space-y-1">
                              {formData.talkingPoints.filter(p => p.trim()).map((point, idx) => (
                                <li key={idx}>{point}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Success Criteria */}
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground mb-2">Success Criteria</h4>
                          <p>{formData.successCriteria || 'Not specified'}</p>
                        </div>

                        <Separator />

                        {/* AI Agent */}
                        {formData.channel !== 'email' && (
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <Bot className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-medium">AI Voice Agent</h4>
                              <p className="text-sm text-muted-foreground">
                                Voice: {selectedVoiceInfo?.name} • Tone: {formData.agentTone}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="ml-auto"
                              onClick={() => playVoicePreview(formData.selectedVoice)}
                            >
                              <Headphones className="h-4 w-4 mr-2" />
                              Preview Voice
                            </Button>
                          </div>
                        )}

                        <Separator />

                        {/* Audience */}
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground mb-2">Target Audience</h4>
                          {formData.audienceSource === 'own_data' ? (
                            <div className="flex flex-wrap gap-2">
                              {formData.selectedAccounts.length > 0 && (
                                <Badge variant="outline">
                                  {formData.selectedAccounts.length} Accounts Selected
                                </Badge>
                              )}
                              {formData.selectedContacts.length > 0 && (
                                <Badge variant="outline">
                                  {formData.selectedContacts.length} Contacts Selected
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {formData.targetIndustries.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-sm text-muted-foreground mr-2">Industries:</span>
                                  {formData.targetIndustries.map((i, idx) => (
                                    <Badge key={idx} variant="secondary">{i}</Badge>
                                  ))}
                                </div>
                              )}
                              {formData.targetTitles.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-sm text-muted-foreground mr-2">Titles:</span>
                                  {formData.targetTitles.map((t, idx) => (
                                    <Badge key={idx} variant="secondary">{t}</Badge>
                                  ))}
                                </div>
                              )}
                              {formData.targetRegions.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-sm text-muted-foreground mr-2">Regions:</span>
                                  {formData.targetRegions.map((r, idx) => (
                                    <Badge key={idx} variant="secondary">{r}</Badge>
                                  ))}
                                </div>
                              )}
                              {formData.targetLeadCount && (
                                <p className="text-sm">
                                  <span className="text-muted-foreground">Target Leads:</span>{' '}
                                  <span className="font-medium">{formData.targetLeadCount.toLocaleString()}</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Additional Settings */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Additional Settings (Optional)</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Priority</Label>
                            <Select
                              value={formData.priority}
                              onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value as any }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Start Date</Label>
                            <Input
                              type="date"
                              value={formData.startDate}
                              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>End Date</Label>
                            <Input
                              type="date"
                              value={formData.endDate}
                              onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Estimated Budget ($)</Label>
                          <Input
                            type="number"
                            placeholder="Optional"
                            value={formData.budget || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              budget: e.target.value ? parseFloat(e.target.value) : undefined
                            }))}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Footer with navigation */}
        <div className="px-6 py-4 border-t bg-muted/30 flex items-center gap-3">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}

          <div className="flex-1 text-center text-sm text-muted-foreground">
            Step {step} of {STEPS.length}
          </div>

          {step < STEPS.length ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!isStepValid(step)}
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="bg-gradient-to-r from-primary to-primary/80"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Campaign
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CampaignCreationWizard;
