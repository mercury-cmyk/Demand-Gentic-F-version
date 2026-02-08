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
  Upload, Database, Lightbulb, Headphones, Wand2, Eye, Filter, Pause, TestTube, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { getCampaignTypesForChannel, type CampaignType } from '@/lib/campaign-types';
import { apiRequest } from '@/lib/queryClient'; // Import apiRequest
import { parsePhoneNumber } from 'libphonenumber-js'; // Import phone parser
import { ALL_VOICES as AI_VOICES } from '@/lib/voice-constants'; // Import voice constants

interface CampaignCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (campaign: any) => void;
  mode?: 'client' | 'admin';
  clientAccountId?: string;
  initialData?: Partial<FormData>;
  /** Campaign ID for edit mode - when provided, fetches campaign data and uses PATCH */
  campaignId?: string;
}

// Campaign Type Categories with icons
const CAMPAIGN_TYPE_CATEGORIES = [
  {
    id: 'events',
    label: 'Events & Webinars',
    icon: Calendar,
    color: 'from-violet-500 to-purple-600',
    types: ['webinar_invite', 'executive_dinner', 'leadership_forum', 'conference'],
  },
  {
    id: 'lead_gen',
    label: 'Lead Generation',
    icon: Target,
    color: 'from-blue-500 to-cyan-500',
    types: ['content_syndication', 'high_quality_leads'],
  },
  {
    id: 'qualification',
    label: 'Sales Qualification',
    icon: Brain,
    color: 'from-amber-500 to-orange-500',
    types: ['sql', 'bant_qualification', 'lead_qualification'],
  },
  {
    id: 'appointments',
    label: 'Appointments & Demos',
    icon: Calendar,
    color: 'from-green-500 to-emerald-500',
    types: ['appointment_setting', 'demo_request'],
  },
  {
    id: 'engagement',
    label: 'Follow-up & Engagement',
    icon: MessageSquare,
    color: 'from-rose-500 to-pink-500',
    types: ['follow_up', 'nurture', 're_engagement', 'data_validation'],
  },
];

// Promotion Channels
const PROMOTION_CHANNELS = [
  { value: 'voice', label: 'AI Voice Calls', icon: Phone, description: 'Intelligent AI-powered phone conversations', color: 'bg-blue-500' },
  { value: 'email', label: 'Email Campaign', icon: Mail, description: 'Personalized email sequences', color: 'bg-green-500' },
  { value: 'combo', label: 'Multi-Channel', icon: Sparkles, description: 'Combined voice + email outreach', color: 'bg-purple-500' },
];

// AI Voices are imported from shared constants at the top of the file

// Phone numbers are fetched dynamically from Telnyx via /api/number-pool/numbers

const AVAILABLE_SENDER_PROFILES = [
  { id: 'sp_1', name: 'Sarah Jenkins', email: 'sarah.j@demandgentic.com', role: 'Sales Director' },
  { id: 'sp_2', name: 'Mike Ross', email: 'mike.r@demandgentic.com', role: 'Account Executive' },
  { id: 'sp_3', name: 'Growth Team', email: 'growth@demandgentic.com', role: 'Outreach Team' },
];

// Wizard steps
const STEPS = [
  { id: 1, title: 'Basics', icon: FileText },
  { id: 2, title: 'Channel', icon: Globe },
  { id: 3, title: 'Type', icon: Target },
  { id: 4, title: 'Content', icon: Lightbulb },
  { id: 5, title: 'Sender Config', icon: Bot },
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

  // Step 4: Content (shared)
  objective: string;
  successCriteria: string;
  targetAudience: string;

  // Step 4: Voice-specific content
  talkingPoints: string[];
  voiceIntent: string;
  objections: { objection: string; response: string }[];

  // Step 4: Email-specific content
  emailSubject: string;
  emailBody: string;
  emailIntent: string;

  // Channel execution settings (for combo campaigns)
  channelConfig: {
    voice: {
      enabled: boolean;
      triggerMode: 'immediate' | 'scheduled' | 'manual';
      scheduledTime?: string;
    };
    email: {
      enabled: boolean;
      triggerMode: 'immediate' | 'scheduled' | 'manual';
      scheduledTime?: string;
    };
  };

  // Step 5: AI Agent
  selectedVoice: string;
  selectedPhoneNumber: string;
  senderProfileId: string;
  agentPersona: string;
  agentTone: 'professional' | 'friendly' | 'consultative' | 'direct';
  openingScript: string;

  // Step 6: Audience
  audienceSource: 'lists' | 'advanced_filters' | 'request_handling';
  selectedLists: string[];
  selectedSegments: string[];
  selectedAccounts: string[];
  selectedContacts: string[];
  targetIndustries: string[];
  targetTitles: string[];
  targetRegions: string[];
  targetCompanySize: string;
  targetLeadCount: number | undefined;
  useProjectDocuments: boolean;

  // Additional
  priority: 'low' | 'normal' | 'high' | 'urgent';
  startDate: string;
  endDate: string;
  budget: number | undefined;
}

export function CampaignCreationWizard({ open, onOpenChange, onSuccess, mode = 'client', clientAccountId: propClientAccountId, initialData, campaignId }: CampaignCreationWizardProps) {
  const isEditMode = !!campaignId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [voiceFilter, setVoiceFilter] = useState<'all' | 'male' | 'female'>('all');
  
  // Admin mode: allow selecting client account if not provided via props
  const [selectedClientId, setSelectedClientId] = useState<string>(propClientAccountId || '');
  const clientAccountId = propClientAccountId || selectedClientId;
  
  // Fetch client accounts for admin mode client selector
  const { data: adminClientAccounts = [] } = useQuery<Array<{ id: string; name: string; companyName?: string }>>({
    queryKey: ['admin-client-accounts-wizard'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/client-portal/admin/clients');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: mode === 'admin' && !propClientAccountId && open,
  });

  const defaultFormData: FormData = {
    name: '',
    description: '',
    channel: 'voice',
    campaignType: 'content_syndication',
    objective: '',
    successCriteria: '',
    targetAudience: '',
    talkingPoints: [],
    voiceIntent: '',
    objections: [{ objection: '', response: '' }],
    emailSubject: '',
    emailBody: '',
    emailIntent: '',
    channelConfig: {
      voice: {
        enabled: true,
        triggerMode: 'immediate',
      },
      email: {
        enabled: true,
        triggerMode: 'immediate',
      },
    },
    selectedVoice: 'Fenrir',
    selectedPhoneNumber: '',
    senderProfileId: '',
    agentPersona: '',
    agentTone: 'professional',
    openingScript: '',
    audienceSource: 'lists',
    selectedLists: [],
    selectedSegments: [],
    selectedAccounts: [],
    selectedContacts: [],
    targetIndustries: [],
    targetTitles: [],
    targetRegions: [],
    targetCompanySize: '',
    targetLeadCount: undefined,
    useProjectDocuments: true,
    priority: 'normal',
    startDate: '',
    endDate: '',
    budget: undefined,
  };

  const [formData, setFormData] = useState<FormData>({ ...defaultFormData, ...initialData });

  // Fetch campaign data when in edit mode
  const { data: campaignData, isLoading: isCampaignLoading } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: isEditMode && open,
    staleTime: 0,
  });

  // Map campaign data to form data when fetched
  useEffect(() => {
    if (isEditMode && campaignData && open) {
      const campaign = campaignData as any;
      setFormData(prev => ({
        ...prev,
        name: campaign.name || '',
        description: campaign.description || '',
        channel: campaign.type === 'email' ? 'email' : 'voice',
        campaignType: campaign.type || 'lead_qualification',
        objective: campaign.campaignObjective || '',
        talkingPoints: campaign.talkingPoints || [],
        successCriteria: campaign.successCriteria || '',
        targetAudience: campaign.targetAudienceDescription || '',
        objections: campaign.campaignObjections || [{ objection: '', response: '' }],
        selectedVoice: campaign.selectedVoice || 'Fenrir',
        agentPersona: campaign.agentPersona || '',
        agentTone: campaign.agentTone || 'professional',
        openingScript: campaign.openingScript || '',
        audienceSource: campaign.audienceRefs?.filterGroup ? 'advanced_filters' :
                        campaign.audienceRefs?.lists?.length ? 'lists' : 'request_handling',
        selectedLists: campaign.audienceRefs?.lists || [],
        selectedSegments: campaign.audienceRefs?.segments || [],
        selectedAccounts: campaign.audienceRefs?.accounts || [],
        selectedContacts: campaign.audienceRefs?.contacts || [],
        targetIndustries: campaign.targetIndustries || [],
        targetTitles: campaign.targetTitles || [],
        targetRegions: campaign.targetRegions || [],
        targetCompanySize: campaign.targetCompanySize || '',
        targetLeadCount: campaign.targetQualifiedLeads || undefined,
        priority: campaign.priority || 'normal',
        budget: campaign.budget || undefined,
      }));
      // Set launch status based on campaign status
      if (campaign.status === 'active' || campaign.status === 'running') {
        setLaunchStatus('active');
      } else if (campaign.status === 'paused') {
        setLaunchStatus('paused');
      } else {
        setLaunchStatus('draft');
      }
    }
  }, [isEditMode, campaignData, open]);

  // Update form data when initialData changes (for non-edit mode)
  useEffect(() => {
    if (open && initialData && !isEditMode) {
      setFormData(prev => ({ ...prev, ...initialData }));
    }
  }, [open, initialData, isEditMode]);

  // Input states for array fields
  const [industryInput, setIndustryInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [regionInput, setRegionInput] = useState('');
  const [talkingPointInput, setTalkingPointInput] = useState('');

  // Channel tab state for combo campaigns (Step 4 content configuration)
  const [activeChannelTab, setActiveChannelTab] = useState<'voice' | 'email'>('voice');

  // Test & Launch states
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [launchStatus, setLaunchStatus] = useState<'active' | 'paused' | 'draft'>('active');
  const [isTestSending, setIsTestSending] = useState(false);
  const [isTestingChannel, setIsTestingChannel] = useState<'voice' | 'email' | null>(null);
  const [createdWorkOrderId, setCreatedWorkOrderId] = useState<string | null>(null);

  const handleSendTest = async (type: 'voice' | 'email') => {
    setIsTestSending(true);
    setIsTestingChannel(type);

    try {
      // 1. Ensure we have a saved Work Order (Draft) config
      let workOrderId = createdWorkOrderId;

      if (!workOrderId) {
        // Admin mode requires clientAccountId
        if (mode === 'admin' && !clientAccountId) {
          throw new Error('Please select a client account before testing. Use the Intelligent Campaign Create page or pass clientAccountId.');
        }

        // Create draft if not exists
        const endpoint = mode === 'admin' 
          ? '/api/campaign-wizard/create' 
          : '/api/client-portal/campaigns/create';

        const bodyData = mode === 'admin' 
          ? { ...formData, clientAccountId, status: 'draft' } 
          : { ...formData, status: 'draft' };

        // Manually handle headers since apiRequest handles standard auth, but we might have special logic
        // Using apiRequest for consistency
        const res = await apiRequest('POST', endpoint, bodyData);
        const data = await res.json();
        
        // Extract ID (Note: API returns { campaign: { id: ... } } where id is workOrder ID)
        if (data.campaign && data.campaign.id) {
          workOrderId = data.campaign.id;
          setCreatedWorkOrderId(workOrderId);
        } else {
          throw new Error('Failed to retrieve campaign ID after saving draft');
        }
      }

      // 2. Validate Inputs
      if (type === 'voice') {
        if (!testPhoneNumber) throw new Error('Phone number required');
        
        // Normalize
        let normalizedPhone = testPhoneNumber;
        try {
          const phoneNumber = parsePhoneNumber(testPhoneNumber, 'US');
          if (phoneNumber && phoneNumber.isValid()) {
            normalizedPhone = phoneNumber.number;
          } else {
             // Try assuming it's valid enough for now, server will validate again
             // or throw error
          }
        } catch (e) {
          // ignore parsing error, let backend handle
        }

        // 3. Trigger Test Call
        // We use the existing endpoint with a special query param to indicate it's a WorkOrder
        await apiRequest('POST', `/api/campaigns/${workOrderId}/test-call?source=work_order`, {
          testPhoneNumber: normalizedPhone,
          testContactName: "Test User", // Default for wizard test
          voiceProvider: "google" // Defaulting to Google as per preference
        });

      } else {
         // Email test logic (Placeholder for now as user asked for Call endpoint specifically)
         // Simulating email test or calling a future email test endpoint
         await new Promise(resolve => setTimeout(resolve, 1000)); 
      }

      toast({
        title: 'Test Initiated',
        description: `Test ${type} request sent successfully.`,
        variant: "default"
      });

    } catch (error: any) {
      console.error('Test failed:', error);
      toast({
        title: 'Test Failed',
        description: error.message || 'Could not initiate test.',
        variant: "destructive"
      });
    } finally {
      setIsTestSending(false);
      setIsTestingChannel(null);
    }
  };

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch organization intelligence for context injection
  const { data: wizardOrgIntel } = useQuery<{
    organization: any;
    campaigns: any[];
    isPrimary: boolean;
  }>({
    queryKey: ['wizard-org-intelligence'],
    queryFn: async () => {
      const token = getToken();
      if (!token) return { organization: null, campaigns: [], isPrimary: false };
      const res = await fetch('/api/client-portal/settings/organization-intelligence', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { organization: null, campaigns: [], isPrimary: false };
      return res.json();
    },
    enabled: open && mode === 'client',
    staleTime: 60000,
  });
  const orgIntelData = wizardOrgIntel?.organization;

  // Auto-populate wizard fields from org intelligence when available
  const applyOrgIntelToWizard = () => {
    if (!orgIntelData) return;
    setFormData(prev => ({
      ...prev,
      targetAudience: prev.targetAudience || orgIntelData.icp?.industries?.join(', ') || '',
      targetIndustries: prev.targetIndustries.length > 0 ? prev.targetIndustries : (orgIntelData.icp?.industries || []),
      targetCompanySize: prev.targetCompanySize || orgIntelData.icp?.companySize || '',
      agentPersona: prev.agentPersona || `You represent ${orgIntelData.name || 'our company'}. ${orgIntelData.positioning?.oneLiner || ''} ${orgIntelData.identity?.description || ''}`.trim(),
      objective: prev.objective || orgIntelData.positioning?.valueProposition || '',
      voiceIntent: prev.voiceIntent || orgIntelData.outreach?.callOpeners?.[0] || '',
      emailIntent: prev.emailIntent || orgIntelData.outreach?.emailAngles?.[0] || '',
      objections: prev.objections.some(o => o.objection) ? prev.objections : (orgIntelData.icp?.objections || []).map((obj: string) => ({ objection: obj, response: '' })),
      talkingPoints: prev.talkingPoints.length > 0 ? prev.talkingPoints : [
        ...(orgIntelData.offerings?.coreProducts?.slice(0, 3) || []),
        ...(orgIntelData.positioning?.whyUs?.slice(0, 2) || []),
      ],
    }));
    toast({ title: 'Organization context applied', description: 'Fields pre-filled from your Organization Intelligence data.' });
  };

  // Fetch client's accounts for audience selection (client portal mode)
  const { data: clientAccounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['client-crm-accounts-for-campaign'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/crm/accounts?limit=500', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.accounts || [];
    },
    enabled: open && formData.audienceSource === 'lists' && mode === 'client',
  });

  // Fetch client's contacts for audience selection (client portal mode)
  const { data: clientContacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['client-crm-contacts-for-campaign'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/crm/contacts?limit=1000', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.contacts || [];
    },
    enabled: open && formData.audienceSource === 'lists' && mode === 'client',
  });

  // Fetch admin lists for audience selection (admin mode only)
  const { data: availableLists = [], isLoading: listsLoading } = useQuery<any[]>({
    queryKey: ['/api/lists'],
    enabled: open && formData.audienceSource === 'lists' && mode === 'admin',
  });

  // Fetch admin segments for audience selection (admin mode only)
  const { data: availableSegments = [], isLoading: segmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/segments'],
    enabled: open && formData.audienceSource === 'lists' && mode === 'admin',
  });

  // Fetch Telnyx phone numbers from number pool
  const { data: telnyxPhoneNumbers = [], isLoading: phoneNumbersLoading } = useQuery({
    queryKey: ['telnyx-phone-numbers'],
    queryFn: async () => {
      // Use direct fetch - number-pool API is accessible without auth
      const res = await fetch('/api/number-pool/numbers?status=active');
      if (!res.ok) {
        console.error('[CampaignWizard] Failed to fetch Telnyx numbers:', res.status);
        return [];
      }
      const data = await res.json();
      let numbers = data.data || [];
      console.log('[CampaignWizard] Loaded Telnyx numbers:', numbers.length);

      // If no numbers found, trigger a sync from Telnyx and retry
      if (numbers.length === 0) {
        console.log('[CampaignWizard] No numbers found, triggering Telnyx sync...');
        try {
          const syncRes = await fetch('/api/number-pool/sync', { method: 'POST' });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            console.log('[CampaignWizard] Telnyx sync result:', syncData.data);

            // Retry fetching numbers after sync
            const retryRes = await fetch('/api/number-pool/numbers?status=active');
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              numbers = retryData.data || [];
              console.log('[CampaignWizard] Numbers after sync:', numbers.length);
            }
          }
        } catch (syncError) {
          console.error('[CampaignWizard] Telnyx sync failed:', syncError);
        }
      }

      return numbers;
    },
    enabled: open && (formData.channel === 'voice' || formData.channel === 'combo'),
    staleTime: 30000, // Cache for 30 seconds
  });

  // Create/Update campaign mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      // Build request body with campaign data mapped to DB fields
      const campaignPayload = {
        name: formData.name,
        description: formData.description,
        type: formData.campaignType,
        status: launchStatus,
        campaignObjective: formData.objective,
        talkingPoints: formData.talkingPoints,
        successCriteria: formData.successCriteria,
        targetAudienceDescription: formData.targetAudience,
        campaignObjections: formData.objections?.filter(o => o.objection),
        selectedVoice: formData.selectedVoice,
        agentPersona: formData.agentPersona,
        agentTone: formData.agentTone,
        openingScript: formData.openingScript,
        targetQualifiedLeads: formData.targetLeadCount,
        audienceRefs: {
          lists: formData.selectedLists,
          segments: formData.selectedSegments,
          accounts: formData.selectedAccounts,
          contacts: formData.selectedContacts,
        },
        targetIndustries: formData.targetIndustries,
        targetTitles: formData.targetTitles,
        targetRegions: formData.targetRegions,
        targetCompanySize: formData.targetCompanySize,
        priority: formData.priority,
        budget: formData.budget,
        clientAccountId: clientAccountId,
      };

      // Determine endpoint and method based on mode
      if (isEditMode && campaignId) {
        // PATCH for edit mode - update existing campaign
        // Use apiRequest which handles auth automatically for admin mode
        if (mode === 'admin') {
          const res = await apiRequest('PATCH', `/api/campaigns/${campaignId}`, campaignPayload);
          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'Failed to update campaign');
          }
          return res.json();
        }

        // Client portal mode - use token-based auth
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const token = getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`/api/campaigns/${campaignId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(campaignPayload),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Failed to update campaign');
        }
        return res.json();
      } else {
        // POST for create mode
        if (mode === 'admin') {
          // Admin mode requires a client account to be selected
          if (!clientAccountId) {
            throw new Error('Please select a client account before creating a campaign. Use the Intelligent Campaign Create page or pass clientAccountId.');
          }
          // Use apiRequest which handles auth automatically for admin mode
          const bodyData = { ...formData, clientAccountId, status: launchStatus };
          const res = await apiRequest('POST', '/api/campaign-wizard/create', bodyData);
          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'Failed to create campaign');
          }
          return res.json();
        }

        // Client portal mode - use token-based auth
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const token = getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch('/api/client-portal/campaigns/create', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...formData,
            status: launchStatus,
            organizationIntelligence: orgIntelData ? {
              id: orgIntelData.id,
              name: orgIntelData.name,
              identity: orgIntelData.identity,
              offerings: orgIntelData.offerings,
              icp: orgIntelData.icp,
              positioning: orgIntelData.positioning,
              outreach: orgIntelData.outreach,
            } : undefined,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Failed to create campaign');
        }
        return res.json();
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['client-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
      }

      toast({
        title: isEditMode ? 'Campaign Updated!' : 'Campaign Created!',
        description: isEditMode ? 'Your campaign has been updated successfully.' : 'Your campaign has been submitted successfully.',
      });
      onSuccess?.(data);
      onOpenChange(false);
      if (!isEditMode) {
        resetForm();
      }
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
      campaignType: 'content_syndication',
      objective: '',
      successCriteria: '',
      targetAudience: '',
      talkingPoints: [],
      voiceIntent: '',
      objections: [{ objection: '', response: '' }],
      emailSubject: '',
      emailBody: '',
      emailIntent: '',
      channelConfig: {
        voice: {
          enabled: true,
          triggerMode: 'immediate',
        },
        email: {
          enabled: true,
          triggerMode: 'immediate',
        },
      },
      selectedVoice: 'Fenrir',
      selectedPhoneNumber: '',
      senderProfileId: '',
      agentPersona: '',
      agentTone: 'professional',
      openingScript: '',
      audienceSource: 'request_handling',
      selectedLists: [],
      selectedSegments: [],
      selectedAccounts: [],
      selectedContacts: [],
      targetIndustries: [],
      targetTitles: [],
      targetRegions: [],
      targetCompanySize: '',
      targetLeadCount: undefined,
      useProjectDocuments: true,
      priority: 'normal',
      startDate: '',
      endDate: '',
      budget: undefined,
    });
    setStep(1);
  };

  // Voice preview functionality - uses client portal voice TTS API for authentic voice previews
  const playVoicePreview = async (voiceId: string) => {
    if (isPlaying && playingVoice === voiceId) {
      stopVoicePreview();
      return;
    }

    stopVoicePreview();

    const voice = AI_VOICES.find(v => v.id === voiceId);
    if (!voice) return;

    setIsPlaying(true);
    setPlayingVoice(voiceId);

    // Generate sample text for this voice
    const sampleText = `Hello! I'm ${voice.name}. I'll be representing your company in conversations with prospects. ${voice.description} How can I help you today?`;

    try {
      // Use client portal voice TTS API which correctly routes to Google Cloud TTS
      // with unique voice mappings for each voice ID
      const token = getToken();
      if (!token) {
        // No auth token - use browser speech synthesis fallback
        console.warn('[VoicePreview] No auth token, using browser TTS fallback');
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(sampleText);
          utterance.onend = () => {
            setIsPlaying(false);
            setPlayingVoice(null);
          };
          utterance.onerror = () => {
            setIsPlaying(false);
            setPlayingVoice(null);
          };
          window.speechSynthesis.speak(utterance);
        } else {
          setIsPlaying(false);
          setPlayingVoice(null);
          toast({
            title: 'Voice Preview Unavailable',
            description: 'Please log in to preview voices',
            variant: 'destructive',
          });
        }
        return;
      }
      const response = await fetch('/api/client-portal/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: sampleText,
          voiceId: voiceId,
          provider: voice.provider, // 'openai' or 'gemini'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate voice preview');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsPlaying(false);
        setPlayingVoice(null);
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setIsPlaying(false);
        setPlayingVoice(null);
        toast({
          title: 'Preview Failed',
          description: 'Could not play voice preview',
          variant: 'destructive',
        });
      };

      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error('Voice preview error:', error);
      setIsPlaying(false);
      setPlayingVoice(null);
      toast({
        title: 'Preview Failed',
        description: 'Could not generate voice preview. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const stopVoicePreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
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
               formData.selectedLists.length > 0 ||
               formData.selectedSegments.length > 0 ||
               formData.targetIndustries.length > 0;
      case 7:
        return true;
      default:
        return true;
    }
  };

  // Get missing required fields for current step
  const getMissingFields = (stepNum: number): string[] => {
    const missing: string[] = [];
    switch (stepNum) {
      case 1:
        if (mode === 'admin' && !clientAccountId) missing.push('Client Account');
        if (!formData.name.trim()) missing.push('Campaign Name');
        break;
      case 2:
        if (!formData.channel) missing.push('Promotion Channel');
        break;
      case 3:
        if (!formData.campaignType) missing.push('Campaign Type');
        break;
      case 4:
        if (!formData.objective.trim()) missing.push('Campaign Objective');
        if (!formData.successCriteria.trim()) missing.push('Success Criteria');
        break;
      case 5:
        if (formData.channel !== 'email' && !formData.selectedVoice) missing.push('AI Voice');
        break;
      case 6:
        if (formData.audienceSource !== 'request_handling' &&
            formData.selectedAccounts.length === 0 &&
            formData.selectedContacts.length === 0 &&
            formData.selectedLists.length === 0 &&
            formData.selectedSegments.length === 0 &&
            formData.targetIndustries.length === 0) {
          missing.push('Target Audience');
        }
        break;
    }
    return missing;
  };

  // Progress calculation
  const progressPercentage = ((step - 1) / (STEPS.length - 1)) * 100;

  // Add array item helpers
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
  // Get campaign types filtered by selected channel
  const availableCampaignTypes = getCampaignTypesForChannel(
    formData.channel === 'combo' ? 'voice' : formData.channel
  );
  const selectedType = availableCampaignTypes.find(t => t.value === formData.campaignType);
  const selectedVoiceInfo = AI_VOICES.find(v => v.id === formData.selectedVoice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-6xl h-[90vh] overflow-hidden flex flex-col p-0">
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
        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="py-6 min-h-full">
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
                    <h3 className="text-xl font-semibold mb-2">Let's start with the basics</h3>
                    <p className="text-muted-foreground">Give your campaign a name and description</p>
                  </div>

                  <div className="space-y-6 max-w-2xl mx-auto">
                    {/* Admin mode: Client Account Selector (if not preset via props) */}
                    {mode === 'admin' && !propClientAccountId && (
                      <div className="space-y-2">
                        <Label htmlFor="clientAccount" className="text-base">Client Account *</Label>
                        <p className="text-sm text-muted-foreground mb-2">
                          Select the client this campaign belongs to
                        </p>
                        <Select
                          value={selectedClientId}
                          onValueChange={setSelectedClientId}
                        >
                          <SelectTrigger className="h-12 text-lg">
                            <SelectValue placeholder="Select a client account..." />
                          </SelectTrigger>
                          <SelectContent>
                            {adminClientAccounts.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.companyName || client.name || client.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!selectedClientId && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Required for creating campaigns and testing
                          </p>
                        )}
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-base">Campaign Name *</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Format: ClientID-MMDDYY-CustomName
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center h-12 px-3 bg-muted rounded-l-md border border-r-0 text-sm font-mono text-muted-foreground whitespace-nowrap">
                          {clientAccountId ? clientAccountId.slice(0, 8) : 'CLIENTID'}-{(() => {
                            const now = new Date();
                            const mm = String(now.getMonth() + 1).padStart(2, '0');
                            const dd = String(now.getDate()).padStart(2, '0');
                            const yy = String(now.getFullYear()).slice(-2);
                            return `${mm}${dd}${yy}`;
                          })()}-
                        </div>
                        <Input
                          id="name"
                          placeholder="Enter custom name"
                          value={formData.name.includes('-') ? formData.name.split('-').slice(2).join('-') : formData.name}
                          onChange={(e) => {
                            const customName = e.target.value;
                            const now = new Date();
                            const mm = String(now.getMonth() + 1).padStart(2, '0');
                            const dd = String(now.getDate()).padStart(2, '0');
                            const yy = String(now.getFullYear()).slice(-2);
                            const prefix = `${clientAccountId ? clientAccountId.slice(0, 8) : 'CLIENTID'}-${mm}${dd}${yy}`;
                            const fullName = customName ? `${prefix}-${customName}` : '';
                            setFormData(prev => ({ ...prev, name: fullName }));
                          }}
                          className="h-12 text-lg flex-1 rounded-l-none"
                        />
                      </div>
                      {formData.name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Full name: <span className="font-mono">{formData.name}</span>
                        </p>
                      )}
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
                    <h3 className="text-xl font-semibold mb-2">Choose your promotion channel</h3>
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
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-semibold mb-2">What type of campaign is this?</h3>
                    <p className="text-muted-foreground">
                      Choose your campaign objective for {formData.channel === 'voice' ? 'AI Voice Calls' : formData.channel === 'email' ? 'Email Campaigns' : 'Multi-Channel'}
                    </p>
                    {selectedChannel && (
                      <Badge className={cn('mt-2', selectedChannel.color, 'text-white')}>
                        <selectedChannel.icon className="h-3 w-3 mr-1" />
                        {selectedChannel.label}
                      </Badge>
                    )}
                  </div>

                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-6 max-w-5xl mx-auto">
                      {CAMPAIGN_TYPE_CATEGORIES.map((category) => {
                        // Filter types that are available for the selected channel
                        const categoryTypes = availableCampaignTypes.filter(
                          (t: CampaignType) => category.types.includes(t.value)
                        );

                        if (categoryTypes.length === 0) return null;

                        return (
                          <div key={category.id} className="space-y-3">
                            {/* Category Header */}
                            <div className="flex items-center gap-2 px-1">
                              <div className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br',
                                category.color
                              )}>
                                <category.icon className="h-4 w-4 text-white" />
                              </div>
                              <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                                {category.label}
                              </h4>
                              <Separator className="flex-1" />
                            </div>

                            {/* Category Types */}
                            <div className="grid md:grid-cols-2 gap-3 pl-10">
                              {categoryTypes.map((type: CampaignType) => (
                                <button
                                  key={type.value}
                                  onClick={() => setFormData(prev => ({ ...prev, campaignType: type.value }))}
                                  className={cn(
                                    'flex flex-col p-4 rounded-xl border-2 text-left transition-all hover:shadow-md',
                                    formData.campaignType === type.value
                                      ? 'border-primary bg-primary/5 shadow-sm'
                                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <h5 className="font-medium text-base">{type.label}</h5>
                                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                        {type.description}
                                      </p>
                                    </div>
                                    {formData.campaignType === type.value && (
                                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                        <Check className="h-4 w-4 text-primary-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  {/* Goal Badge */}
                                  <div className="mt-3 flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {type.primaryGoal}
                                    </Badge>
                                    {type.supportsVoice && type.supportsEmail && (
                                      <Badge variant="secondary" className="text-xs">
                                        Multi-Channel
                                      </Badge>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
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
                    <h3 className="text-xl font-semibold mb-2">Define your campaign content</h3>
                    <p className="text-muted-foreground">
                      {formData.channel === 'combo'
                        ? 'Configure each channel separately - your campaign shares a unified contact list and objective'
                        : 'Tell us what makes your campaign special'}
                    </p>
                  </div>

                  <div className="max-w-3xl mx-auto space-y-6">
                    {/* Prompt Hierarchy Info */}
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
                      <div className="flex items-start gap-3">
                        <Brain className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <h4 className="font-medium text-sm text-primary mb-1">How AI Generates Content</h4>
                          <p className="text-xs text-muted-foreground">
                            The system uses a layered prompt approach for maximum relevance:
                            <br />
                            <span className="font-semibold">1. Foundation Prompt</span> (Global Logic)
                            <ArrowRight className="inline h-3 w-3 mx-1" />
                            <span className="font-semibold">2. Organization Intelligence</span> (Your business context)
                            <ArrowRight className="inline h-3 w-3 mx-1" />
                            <span className="font-semibold">3. Campaign Prompt</span> (Your inputs below)
                            <ArrowRight className="inline h-3 w-3 mx-1" />
                            <span className="font-semibold">4. Account Layer</span> (CRM Data)
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Organization Intelligence Context Panel */}
                    {mode === 'client' && orgIntelData && (
                      <Card className="border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/10 mb-4">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Brain className="h-4 w-4 text-violet-500" />
                              Organization Intelligence Connected
                            </CardTitle>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={applyOrgIntelToWizard}>
                              <Sparkles className="h-3 w-3 mr-1 text-amber-500" />
                              Auto-Fill from Intelligence
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div className="space-y-1">
                              <p className="text-muted-foreground font-medium">Company</p>
                              <p className="font-semibold">{orgIntelData.name}</p>
                            </div>
                            {orgIntelData.industry && (
                              <div className="space-y-1">
                                <p className="text-muted-foreground font-medium">Industry</p>
                                <p>{orgIntelData.industry}</p>
                              </div>
                            )}
                            {orgIntelData.offerings?.coreProducts?.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-muted-foreground font-medium">Products</p>
                                <p>{orgIntelData.offerings.coreProducts.length} defined</p>
                              </div>
                            )}
                            {orgIntelData.icp?.industries?.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-muted-foreground font-medium">Target Industries</p>
                                <p>{orgIntelData.icp.industries.slice(0, 2).join(', ')}{orgIntelData.icp.industries.length > 2 ? '...' : ''}</p>
                              </div>
                            )}
                          </div>
                          {orgIntelData.positioning?.oneLiner && (
                            <p className="text-xs text-muted-foreground italic mt-2 border-t pt-2">"{orgIntelData.positioning.oneLiner}"</p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                    {mode === 'client' && !orgIntelData && (
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          <span className="font-medium">No Organization Intelligence set up.</span> Add your business context in the Intelligence tab for AI-powered auto-fill and smarter campaign targeting.
                        </p>
                      </div>
                    )}

                    {/* Shared Campaign Objective */}
                    <div className="space-y-2">
                      <Label className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        Campaign Objective *
                        {formData.channel === 'combo' && (
                          <Badge variant="outline" className="text-xs ml-2">Shared across channels</Badge>
                        )}
                      </Label>
                      <Textarea
                        placeholder="e.g., Book qualified meetings with IT decision makers at mid-market companies"
                        value={formData.objective}
                        onChange={(e) => setFormData(prev => ({ ...prev, objective: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    {/* Channel Tabs for Combo Campaigns */}
                    {formData.channel === 'combo' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-purple-500" />
                          <h4 className="font-semibold text-base">Multi-Channel Content</h4>
                          <Badge variant="secondary" className="text-xs">Configure each channel</Badge>
                        </div>

                        <Tabs value={activeChannelTab} onValueChange={(v) => setActiveChannelTab(v as 'voice' | 'email')} className="w-full">
                          <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="voice" className="gap-2">
                              <Phone className="h-4 w-4" />
                              Voice Call
                              {formData.voiceIntent && formData.talkingPoints.length > 0 && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              )}
                            </TabsTrigger>
                            <TabsTrigger value="email" className="gap-2">
                              <Mail className="h-4 w-4" />
                              Email
                              {formData.emailIntent && formData.emailSubject && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              )}
                            </TabsTrigger>
                          </TabsList>

                          {/* Voice Tab Content */}
                          <TabsContent value="voice" className="space-y-6 mt-0">
                            <Card className="border-blue-200 dark:border-blue-800">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                  <Phone className="h-4 w-4 text-blue-500" />
                                  Voice Channel Configuration
                                </CardTitle>
                                <CardDescription>Define the message and intent for AI voice calls</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {/* Voice Intent */}
                                <div className="space-y-2">
                                  <Label className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-amber-500" />
                                    Call Intent *
                                  </Label>
                                  <Textarea
                                    placeholder="e.g., Introduce our solution and qualify interest for a demo. If interested, schedule a follow-up call with our sales team."
                                    value={formData.voiceIntent}
                                    onChange={(e) => setFormData(prev => ({ ...prev, voiceIntent: e.target.value }))}
                                    rows={2}
                                  />
                                  <p className="text-xs text-muted-foreground">What should the AI agent accomplish on each call?</p>
                                </div>

                                {/* Key Talking Points */}
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-2">
                                      <MessageSquare className="h-4 w-4 text-primary" />
                                      Key Talking Points
                                    </Label>
                                    {formData.talkingPoints.filter(p => p.trim()).length > 0 && (
                                      <Badge variant="outline" className="text-xs">
                                        {formData.talkingPoints.filter(p => p.trim()).length} added
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    Type and press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to add.
                                  </p>
                                  <div className="flex gap-2">
                                    <Input
                                      placeholder="e.g., Industry-leading customer support"
                                      value={talkingPointInput}
                                      onChange={(e) => setTalkingPointInput(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          if (talkingPointInput.trim()) {
                                            setFormData(prev => ({
                                              ...prev,
                                              talkingPoints: [...prev.talkingPoints.filter(p => p.trim()), talkingPointInput.trim()],
                                            }));
                                            setTalkingPointInput('');
                                          }
                                        }
                                      }}
                                      className="flex-1"
                                    />
                                    <Button
                                      type="button"
                                      onClick={() => {
                                        if (talkingPointInput.trim()) {
                                          setFormData(prev => ({
                                            ...prev,
                                            talkingPoints: [...prev.talkingPoints.filter(p => p.trim()), talkingPointInput.trim()],
                                          }));
                                          setTalkingPointInput('');
                                        }
                                      }}
                                      disabled={!talkingPointInput.trim()}
                                      size="sm"
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add
                                    </Button>
                                  </div>
                                  {formData.talkingPoints.filter(p => p.trim()).length > 0 && (
                                    <div className="flex flex-wrap gap-2 p-1">
                                      {formData.talkingPoints.filter(p => p.trim()).map((point, idx) => (
                                        <Badge
                                          key={idx}
                                          variant="secondary"
                                          className="gap-1.5 py-1.5 px-3 text-sm bg-blue-50 dark:bg-blue-900/30"
                                        >
                                          <span className="text-blue-600 dark:text-blue-400 font-medium">{idx + 1}.</span>
                                          {point}
                                          <button
                                            onClick={() => {
                                              setFormData(prev => ({
                                                ...prev,
                                                talkingPoints: prev.talkingPoints.filter((_, i) => i !== idx),
                                              }));
                                            }}
                                            className="ml-1 hover:text-destructive rounded-full hover:bg-destructive/10 p-0.5"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </TabsContent>

                          {/* Email Tab Content */}
                          <TabsContent value="email" className="space-y-6 mt-0">
                            <Card className="border-green-200 dark:border-green-800">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                  <Mail className="h-4 w-4 text-green-500" />
                                  Email Channel Configuration
                                </CardTitle>
                                <CardDescription>Define the message and intent for email outreach</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {/* Email Intent */}
                                <div className="space-y-2">
                                  <Label className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-amber-500" />
                                    Email Intent *
                                  </Label>
                                  <Textarea
                                    placeholder="e.g., Warm up prospects before the call campaign. Introduce the value proposition and create awareness."
                                    value={formData.emailIntent}
                                    onChange={(e) => setFormData(prev => ({ ...prev, emailIntent: e.target.value }))}
                                    rows={2}
                                  />
                                  <p className="text-xs text-muted-foreground">What should the email accomplish?</p>
                                </div>

                                {/* Email Subject */}
                                <div className="space-y-2">
                                  <Label>Email Subject Line *</Label>
                                  <Input
                                    placeholder="e.g., Question referring to {company_name}"
                                    value={formData.emailSubject}
                                    onChange={(e) => setFormData(prev => ({ ...prev, emailSubject: e.target.value }))}
                                  />
                                </div>

                                {/* Email Body */}
                                <div className="space-y-2">
                                  <Label>Email Body Template *</Label>
                                  <Textarea
                                    placeholder="Hi {first_name}, I saw that {company_name} is..."
                                    value={formData.emailBody}
                                    onChange={(e) => setFormData(prev => ({ ...prev, emailBody: e.target.value }))}
                                    rows={5}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Variables: &#123;first_name&#125;, &#123;company_name&#125;, &#123;title&#125;
                                  </p>
                                </div>
                              </CardContent>
                            </Card>
                          </TabsContent>
                        </Tabs>
                      </div>
                    )}

                    {/* Voice Content Configuration (Single Channel) */}
                    {formData.channel === 'voice' && (
                      <div className="space-y-6 pt-4 border-t">
                        <div className="flex items-center gap-2 mb-2">
                           <Mic className="h-5 w-5 text-primary" />
                           <h4 className="font-semibold text-base">Voice Call Scripting</h4>
                        </div>

                        {/* Voice Intent */}
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-500" />
                            Call Intent
                          </Label>
                          <Textarea
                            placeholder="e.g., Introduce our solution and qualify interest for a demo"
                            value={formData.voiceIntent}
                            onChange={(e) => setFormData(prev => ({ ...prev, voiceIntent: e.target.value }))}
                            rows={2}
                          />
                        </div>

                        {/* Key Talking Points */}
                        <Card className="border-dashed">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-base flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-primary" />
                                Key Talking Points
                              </Label>
                              {formData.talkingPoints.filter(p => p.trim()).length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {formData.talkingPoints.filter(p => p.trim()).length} added
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              What should the AI agent highlight? Type and press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to add.
                            </p>
                            <div className="flex gap-2">
                              <Input
                                placeholder="e.g., Industry-leading customer support"
                                value={talkingPointInput}
                                onChange={(e) => setTalkingPointInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (talkingPointInput.trim()) {
                                      setFormData(prev => ({
                                        ...prev,
                                        talkingPoints: [...prev.talkingPoints.filter(p => p.trim()), talkingPointInput.trim()],
                                      }));
                                      setTalkingPointInput('');
                                    }
                                  }
                                }}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                onClick={() => {
                                  if (talkingPointInput.trim()) {
                                    setFormData(prev => ({
                                      ...prev,
                                      talkingPoints: [...prev.talkingPoints.filter(p => p.trim()), talkingPointInput.trim()],
                                    }));
                                    setTalkingPointInput('');
                                  }
                                }}
                                disabled={!talkingPointInput.trim()}
                                size="sm"
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Add
                              </Button>
                            </div>
                            {formData.talkingPoints.filter(p => p.trim()).length > 0 && (
                              <ScrollArea className="max-h-32">
                                <div className="flex flex-wrap gap-2 p-1">
                                  {formData.talkingPoints.filter(p => p.trim()).map((point, idx) => (
                                    <Badge
                                      key={idx}
                                      variant="secondary"
                                      className="gap-1.5 py-1.5 px-3 text-sm bg-primary/10 hover:bg-primary/15 transition-colors"
                                    >
                                      <span className="text-primary/70 font-medium">{idx + 1}.</span>
                                      {point}
                                      <button
                                        onClick={() => {
                                          setFormData(prev => ({
                                            ...prev,
                                            talkingPoints: prev.talkingPoints.filter((_, i) => i !== idx),
                                          }));
                                        }}
                                        className="ml-1 hover:text-destructive rounded-full hover:bg-destructive/10 p-0.5 transition-colors"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              </ScrollArea>
                            )}
                            {formData.talkingPoints.filter(p => p.trim()).length === 0 && (
                              <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded-lg">
                                <Lightbulb className="h-5 w-5 mx-auto mb-1 opacity-50" />
                                No talking points yet. Add key messages for your AI agent.
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {/* Email Content Configuration (Single Channel) */}
                    {formData.channel === 'email' && (
                      <div className="space-y-6 pt-4 border-t">
                         <div className="flex items-center gap-2 mb-2">
                           <Mail className="h-5 w-5 text-primary" />
                           <h4 className="font-semibold text-base">Email Configuration</h4>
                         </div>

                        {/* Email Intent */}
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-500" />
                            Email Intent
                          </Label>
                          <Textarea
                            placeholder="e.g., Introduce the value proposition and drive engagement"
                            value={formData.emailIntent}
                            onChange={(e) => setFormData(prev => ({ ...prev, emailIntent: e.target.value }))}
                            rows={2}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Email Subject Line *</Label>
                          <Input
                            placeholder="e.g., Question referring to {company_name}"
                            value={formData.emailSubject}
                            onChange={(e) => setFormData(prev => ({ ...prev, emailSubject: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Email Body Template *</Label>
                          <Textarea
                            placeholder="Hi {first_name}, I saw that {company_name} is..."
                            value={formData.emailBody}
                            onChange={(e) => setFormData(prev => ({ ...prev, emailBody: e.target.value }))}
                            rows={6}
                          />
                          <p className="text-xs text-muted-foreground">
                            Supported variables: &#123;first_name&#125;, &#123;company_name&#125;, &#123;title&#125;
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Success Criteria */}
                    <div className="space-y-2 pt-4 border-t">
                      <Label className="text-base flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Success Criteria *
                        {formData.channel === 'combo' && (
                          <Badge variant="outline" className="text-xs ml-2">Shared across channels</Badge>
                        )}
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

                    {/* Common Objections (for voice campaigns) */}
                    {(formData.channel === 'voice' || formData.channel === 'combo') && (
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
                    )}
                  </div>
                </motion.div>
              )}

              {/* Step 5: Sender Config */}
              {step === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-8">
                    <h3 className="text-xl font-semibold mb-2">
                      Sender Configuration
                    </h3>
                    <p className="text-muted-foreground">
                      Configure who your audience will see or hear from
                    </p>
                  </div>

                  {/* Voice Configuration */}
                  {(formData.channel === 'voice' || formData.channel === 'combo') && (
                    <div className="space-y-6 border-b pb-8">
                      <div className="flex items-center gap-2 mb-4">
                        <Phone className="h-5 w-5 text-primary" />
                        <h4 className="text-lg font-semibold">Voice Sender Configuration</h4>
                      </div>

                      {/* Phone Number Selection */}
                      <div className="max-w-3xl mx-auto mb-8">
                         <Label className="mb-2 block">Outbound Phone Number</Label>
                         <Select
                            value={formData.selectedPhoneNumber}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, selectedPhoneNumber: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={phoneNumbersLoading ? "Loading phone numbers..." : "Select a phone number"} />
                            </SelectTrigger>
                            <SelectContent>
                              {phoneNumbersLoading ? (
                                <SelectItem value="loading" disabled>
                                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                  Loading...
                                </SelectItem>
                              ) : telnyxPhoneNumbers.length === 0 ? (
                                <SelectItem value="none" disabled>
                                  No phone numbers available
                                </SelectItem>
                              ) : (
                                telnyxPhoneNumbers.map((phone: any) => (
                                  <SelectItem key={phone.id} value={phone.phoneNumberE164}>
                                    {phone.displayName || phone.phoneNumberE164}
                                    {phone.region && ` - ${phone.region}`}
                                    {phone.areaCode && ` (${phone.areaCode})`}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                         {telnyxPhoneNumbers.length === 0 && !phoneNumbersLoading && (
                           <p className="text-sm text-muted-foreground mt-2">
                             No Telnyx phone numbers configured. Contact admin to add numbers.
                           </p>
                         )}
                      </div>

                      {/* Voice Selection Grid */}
                      <div className="max-w-5xl mx-auto">
                        <div className="flex items-center justify-between mb-6">
                          <Label className="text-base">Select AI Voice</Label>
                          <div className="flex gap-2">
                            <Badge
                              variant={voiceFilter === 'all' ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => setVoiceFilter('all')}
                            >
                              All ({AI_VOICES.length})
                            </Badge>
                            <Badge
                              variant={voiceFilter === 'male' ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => setVoiceFilter('male')}
                            >
                              Male ({AI_VOICES.filter(v => v.gender === 'male').length})
                            </Badge>
                            <Badge
                              variant={voiceFilter === 'female' ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => setVoiceFilter('female')}
                            >
                              Female ({AI_VOICES.filter(v => v.gender === 'female').length})
                            </Badge>
                          </div>
                        </div>
                        <ScrollArea className="h-[500px] pr-4">
                          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {AI_VOICES.filter(v => voiceFilter === 'all' || v.gender === voiceFilter).map((voice) => (
                              <Card
                                key={voice.id}
                                className={cn(
                                  'cursor-pointer transition-all hover:shadow-lg relative overflow-hidden group',
                                  formData.selectedVoice === voice.id
                                    ? 'ring-2 ring-primary shadow-md'
                                    : 'hover:ring-1 hover:ring-primary/50'
                                )}
                                onClick={() => setFormData(prev => ({ ...prev, selectedVoice: voice.id }))}
                              >
                                {/* Gradient Header */}
                                <div className={cn('h-2 bg-gradient-to-r', voice.color)} />

                                {formData.selectedVoice === voice.id && (
                                  <div className="absolute top-4 right-3 z-10">
                                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                                      <Check className="h-4 w-4 text-primary-foreground" />
                                    </div>
                                  </div>
                                )}

                                <CardContent className="p-4">
                                  {/* Voice Avatar & Name */}
                                  <div className="flex items-start gap-3 mb-3">
                                    <div className={cn(
                                      'w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br shadow-inner',
                                      voice.color
                                    )}>
                                      <UserCircle className="h-7 w-7 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-lg">{voice.name}</h4>
                                        <Badge variant="outline" className="text-xs capitalize">
                                          {voice.gender}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground">{voice.accent} English</p>
                                    </div>
                                  </div>

                                  {/* Tone Badge */}
                                  <div className="mb-3">
                                    <Badge className={cn('bg-gradient-to-r text-white border-0', voice.color)}>
                                      {voice.tone}
                                    </Badge>
                                  </div>

                                  {/* Description */}
                                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                    {voice.description}
                                  </p>

                                  {/* Best For Tags */}
                                  <div className="flex flex-wrap gap-1 mb-4">
                                    {voice.bestFor.map((tag, i) => (
                                      <Badge key={i} variant="secondary" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>

                                  {/* Preview Button */}
                                  <Button
                                    type="button"
                                    variant={isPlaying && playingVoice === voice.id ? 'default' : 'outline'}
                                    size="sm"
                                    className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      playVoicePreview(voice.id);
                                    }}
                                  >
                                    {isPlaying && playingVoice === voice.id ? (
                                      <>
                                        <Square className="h-3 w-3 mr-2" />
                                        Stop Preview
                                      </>
                                    ) : (
                                      <>
                                        <Play className="h-3 w-3 mr-2" />
                                        Preview Voice
                                      </>
                                    )}
                                  </Button>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  )}

                  {/* Email Configuration */}
                  {(formData.channel === 'email' || formData.channel === 'combo') && (
                    <div className="space-y-6 max-w-3xl mx-auto border-b pb-8">
                      <div className="flex items-center gap-2 mb-4">
                        <Mail className="h-5 w-5 text-primary" />
                        <h4 className="text-lg font-semibold">Email Sender Configuration</h4>
                      </div>

                      <div className="space-y-4">
                         <div className="space-y-2">
                           <Label>Sender Profile</Label>
                           <Select
                              value={formData.senderProfileId}
                              onValueChange={(value) => setFormData(prev => ({ ...prev, senderProfileId: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a sender profile" />
                              </SelectTrigger>
                              <SelectContent>
                                {AVAILABLE_SENDER_PROFILES.map(profile => (
                                  <SelectItem key={profile.id} value={profile.id}>
                                    {profile.name} &lt;{profile.email}&gt; - {profile.role}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* Agent Personality Configuration */}
                  <div className="max-w-3xl mx-auto space-y-6 pt-4">
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
                    <h3 className="text-xl font-semibold mb-2">Define your target audience</h3>
                    <p className="text-muted-foreground">Select from lists, use advanced filters, or let us handle targeting</p>
                  </div>

                  <div className="max-w-3xl mx-auto">
                    {/* Audience Selection - Admin Lists & Filters */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="space-y-1">
                        <h4 className="text-base font-medium flex items-center gap-2">
                          <Database className="h-4 w-4 text-primary" />
                          {mode === 'client' ? 'Select from Your CRM Data' : 'Select Admin Lists & Segments'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {mode === 'client' 
                            ? 'Choose accounts and contacts you\'ve uploaded to your CRM'
                            : 'Choose from approved contact segments and account lists'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        className={cn(showAdvancedFilters && "bg-primary/10 border-primary/50 text-primary")}
                      >
                        <Filter className="h-4 w-4 mr-2" />
                        Advanced Unified Filter
                      </Button>
                    </div>

                    {/* Always Show List Selection */}
                    <div className="space-y-6">
                      <div className="space-y-3">
                        {(mode === 'client' ? (accountsLoading || contactsLoading) : (listsLoading || segmentsLoading)) ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : mode === 'client' ? (
                          /* Client Portal Mode - Show Client CRM Data */
                          <ScrollArea className="h-64 border rounded-lg p-4 bg-muted/5">
                            <div className="space-y-4">
                              {/* Client Accounts */}
                              <div>
                                <h5 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">
                                  Your Accounts ({clientAccounts.length})
                                </h5>
                                <div className="space-y-2">
                                  {clientAccounts.length === 0 ? (
                                    <div className="text-center py-4 text-muted-foreground text-sm">
                                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>No accounts uploaded yet</p>
                                      <p className="text-xs">Upload accounts from the CRM section</p>
                                    </div>
                                  ) : (
                                    clientAccounts.slice(0, 50).map((account: any) => (
                                      <div
                                        key={account.id}
                                        className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg border bg-card transition-colors cursor-pointer"
                                        onClick={() => {
                                          const newSelected = formData.selectedAccounts.includes(account.id)
                                            ? formData.selectedAccounts.filter(a => a !== account.id)
                                            : [...formData.selectedAccounts, account.id];
                                          setFormData(prev => ({ ...prev, selectedAccounts: newSelected }));
                                        }}
                                      >
                                        <Checkbox
                                          checked={formData.selectedAccounts.includes(account.id)}
                                          onCheckedChange={(checked) => {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedAccounts: checked
                                                ? [...prev.selectedAccounts, account.id]
                                                : prev.selectedAccounts.filter(a => a !== account.id)
                                            }));
                                          }}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-sm truncate">{account.name}</p>
                                          <p className="text-xs text-muted-foreground truncate">
                                            {account.industry || 'No industry'} • {account.domain || 'No domain'}
                                          </p>
                                        </div>
                                        <Badge variant="secondary" className="text-xs flex-shrink-0">Account</Badge>
                                      </div>
                                    ))
                                  )}
                                  {clientAccounts.length > 50 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">
                                      Showing first 50 of {clientAccounts.length} accounts
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Client Contacts */}
                              <div>
                                <h5 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">
                                  Your Contacts ({clientContacts.length})
                                </h5>
                                <div className="space-y-2">
                                  {clientContacts.length === 0 ? (
                                    <div className="text-center py-4 text-muted-foreground text-sm">
                                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>No contacts uploaded yet</p>
                                      <p className="text-xs">Upload contacts from the CRM section</p>
                                    </div>
                                  ) : (
                                    clientContacts.slice(0, 50).map((contact: any) => (
                                      <div
                                        key={contact.id}
                                        className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg border bg-card transition-colors cursor-pointer"
                                        onClick={() => {
                                          const newSelected = formData.selectedContacts.includes(contact.id)
                                            ? formData.selectedContacts.filter(c => c !== contact.id)
                                            : [...formData.selectedContacts, contact.id];
                                          setFormData(prev => ({ ...prev, selectedContacts: newSelected }));
                                        }}
                                      >
                                        <Checkbox
                                          checked={formData.selectedContacts.includes(contact.id)}
                                          onCheckedChange={(checked) => {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedContacts: checked
                                                ? [...prev.selectedContacts, contact.id]
                                                : prev.selectedContacts.filter(c => c !== contact.id)
                                            }));
                                          }}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-sm truncate">
                                            {contact.firstName} {contact.lastName}
                                          </p>
                                          <p className="text-xs text-muted-foreground truncate">
                                            {contact.title || 'No title'} • {contact.email || 'No email'}
                                          </p>
                                        </div>
                                        <Badge variant="outline" className="text-xs flex-shrink-0">Contact</Badge>
                                      </div>
                                    ))
                                  )}
                                  {clientContacts.length > 50 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">
                                      Showing first 50 of {clientContacts.length} contacts
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </ScrollArea>
                        ) : (
                          /* Admin Mode - Show Lists & Segments */
                          <ScrollArea className="h-64 border rounded-lg p-4 bg-muted/5">
                            <div className="space-y-4">
                              {/* Contact Segments */}
                              <div>
                                <h5 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">Contact Segments</h5>
                                <div className="space-y-2">
                                  {availableSegments.length === 0 ? (
                                    <div className="text-center py-4 text-muted-foreground text-sm">
                                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>No segments available</p>
                                      <p className="text-xs">Create segments from the Segments page</p>
                                    </div>
                                  ) : (
                                    availableSegments.map((segment: any) => (
                                      <div
                                        key={segment.id}
                                        className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg border bg-card transition-colors cursor-pointer"
                                        onClick={() => {
                                          const newSelected = formData.selectedSegments.includes(segment.id)
                                            ? formData.selectedSegments.filter(s => s !== segment.id)
                                            : [...formData.selectedSegments, segment.id];
                                          setFormData(prev => ({ ...prev, selectedSegments: newSelected }));
                                        }}
                                      >
                                        <Checkbox
                                          checked={formData.selectedSegments.includes(segment.id)}
                                          onCheckedChange={(checked) => {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedSegments: checked
                                                ? [...prev.selectedSegments, segment.id]
                                                : prev.selectedSegments.filter(s => s !== segment.id)
                                            }));
                                          }}
                                        />
                                        <div className="flex-1">
                                          <p className="font-medium text-sm">{segment.name}</p>
                                          <p className="text-xs text-muted-foreground">{(segment.recordCountCache || 0).toLocaleString()} contacts</p>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">Segment</Badge>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {/* Static Lists */}
                              <div>
                                <h5 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">Static Lists</h5>
                                <div className="space-y-2">
                                  {availableLists.length === 0 ? (
                                    <div className="text-center py-4 text-muted-foreground text-sm">
                                      <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>No lists available</p>
                                      <p className="text-xs">Create lists from the Lists page</p>
                                    </div>
                                  ) : (
                                    availableLists.map((list: any) => (
                                      <div
                                        key={list.id}
                                        className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg border bg-card transition-colors cursor-pointer"
                                        onClick={() => {
                                          const newSelected = formData.selectedLists.includes(list.id)
                                            ? formData.selectedLists.filter(l => l !== list.id)
                                            : [...formData.selectedLists, list.id];
                                          setFormData(prev => ({ ...prev, selectedLists: newSelected }));
                                        }}
                                      >
                                        <Checkbox
                                          checked={formData.selectedLists.includes(list.id)}
                                          onCheckedChange={(checked) => {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedLists: checked
                                                ? [...prev.selectedLists, list.id]
                                                : prev.selectedLists.filter(l => l !== list.id)
                                            }));
                                          }}
                                        />
                                        <div className="flex-1">
                                          <p className="font-medium text-sm">{list.name}</p>
                                          <p className="text-xs text-muted-foreground">{(list.recordIds?.length || 0).toLocaleString()} contacts</p>
                                        </div>
                                        <Badge variant="outline" className="text-xs">List</Badge>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </ScrollArea>
                        )}
                        {/* Selection Summary */}
                        {mode === 'client' ? (
                          (formData.selectedAccounts.length > 0 || formData.selectedContacts.length > 0) && (
                            <div className="p-3 bg-primary/5 rounded-lg flex items-center justify-between">
                              <p className="text-sm font-medium">
                                Selected: {formData.selectedAccounts.length} accounts, {formData.selectedContacts.length} contacts
                              </p>
                              <Badge variant="default">Ready to Assign</Badge>
                            </div>
                          )
                        ) : (
                          (formData.selectedSegments.length > 0 || formData.selectedLists.length > 0) && (
                            <div className="p-3 bg-primary/5 rounded-lg flex items-center justify-between">
                              <p className="text-sm font-medium">
                                Selected: {formData.selectedSegments.length} segments, {formData.selectedLists.length} lists
                              </p>
                              <Badge variant="default">Ready to Assign</Badge>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* Advanced Unified Filter Section */}
                    <AnimatePresence>
                      {showAdvancedFilters && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="border rounded-lg p-5 bg-muted/10 space-y-6 mt-6">
                             <div className="flex items-center gap-2 mb-2 border-b pb-4">
                               <Target className="h-5 w-5 text-primary" />
                               <div>
                                 <h3 className="font-semibold text-base">Unified Filter Configuration</h3>
                                 <p className="text-xs text-muted-foreground">Apply filters across selected lists & segments</p>
                               </div>
                             </div>

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

                            {/* Use Project Documents Toggle */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-primary" />
                                <div>
                                  <p className="font-medium text-sm">Use Project Documents</p>
                                  <p className="text-xs text-muted-foreground">Auto-populate filters from uploaded project context</p>
                                </div>
                              </div>
                              <Switch
                                checked={formData.useProjectDocuments}
                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, useProjectDocuments: checked }))}
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                    <h3 className="text-xl font-semibold mb-2">Review your campaign</h3>
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
                          <h4 className="font-medium text-sm text-muted-foreground mb-2">
                            Campaign Objective
                            {formData.channel === 'combo' && (
                              <Badge variant="outline" className="text-xs ml-2">Shared</Badge>
                            )}
                          </h4>
                          <p>{formData.objective || 'Not specified'}</p>
                        </div>

                        {/* Channel-Specific Content for Combo */}
                        {formData.channel === 'combo' && (
                          <>
                            <Separator />
                            <div className="grid md:grid-cols-2 gap-4">
                              {/* Voice Channel Summary */}
                              <div className="p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                                <div className="flex items-center gap-2 mb-3">
                                  <Phone className="h-4 w-4 text-blue-500" />
                                  <span className="font-medium text-sm">Voice Channel</span>
                                  {formData.channelConfig.voice.enabled ? (
                                    <Badge className="bg-green-100 text-green-700 text-xs">Enabled</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">Disabled</Badge>
                                  )}
                                </div>
                                {formData.voiceIntent && (
                                  <p className="text-sm text-muted-foreground mb-2">
                                    <span className="font-medium">Intent:</span> {formData.voiceIntent}
                                  </p>
                                )}
                                {formData.talkingPoints.filter(p => p.trim()).length > 0 && (
                                  <div className="text-sm">
                                    <span className="font-medium text-muted-foreground">Talking Points:</span>
                                    <ul className="list-disc list-inside mt-1">
                                      {formData.talkingPoints.filter(p => p.trim()).slice(0, 3).map((p, i) => (
                                        <li key={i} className="text-muted-foreground">{p}</li>
                                      ))}
                                      {formData.talkingPoints.filter(p => p.trim()).length > 3 && (
                                        <li className="text-muted-foreground">+{formData.talkingPoints.filter(p => p.trim()).length - 3} more</li>
                                      )}
                                    </ul>
                                  </div>
                                )}
                                <div className="mt-2 text-xs text-muted-foreground">
                                  Trigger: <span className="capitalize">{formData.channelConfig.voice.triggerMode}</span>
                                </div>
                              </div>

                              {/* Email Channel Summary */}
                              <div className="p-4 rounded-lg border bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                                <div className="flex items-center gap-2 mb-3">
                                  <Mail className="h-4 w-4 text-green-500" />
                                  <span className="font-medium text-sm">Email Channel</span>
                                  {formData.channelConfig.email.enabled ? (
                                    <Badge className="bg-green-100 text-green-700 text-xs">Enabled</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">Disabled</Badge>
                                  )}
                                </div>
                                {formData.emailIntent && (
                                  <p className="text-sm text-muted-foreground mb-2">
                                    <span className="font-medium">Intent:</span> {formData.emailIntent}
                                  </p>
                                )}
                                {formData.emailSubject && (
                                  <p className="text-sm text-muted-foreground">
                                    <span className="font-medium">Subject:</span> {formData.emailSubject}
                                  </p>
                                )}
                                <div className="mt-2 text-xs text-muted-foreground">
                                  Trigger: <span className="capitalize">{formData.channelConfig.email.triggerMode}</span>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Talking Points (Single Channel) */}
                        {formData.channel !== 'combo' && formData.talkingPoints.filter(p => p.trim()).length > 0 && (
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
                          <h4 className="font-medium text-sm text-muted-foreground mb-2">
                            Success Criteria
                            {formData.channel === 'combo' && (
                              <Badge variant="outline" className="text-xs ml-2">Shared</Badge>
                            )}
                          </h4>
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
                          <div className="space-y-4">
                            {/* Selected Lists & Segments */}
                            {(formData.selectedSegments.length > 0 || formData.selectedLists.length > 0) && (
                              <div className="flex flex-wrap gap-2">
                                {formData.selectedSegments.length > 0 && (
                                  <Badge variant="outline" className="bg-primary/5">
                                    {formData.selectedSegments.length} Segments Selected
                                  </Badge>
                                )}
                                {formData.selectedLists.length > 0 && (
                                  <Badge variant="outline" className="bg-primary/5">
                                    {formData.selectedLists.length} Account Lists Selected
                                  </Badge>
                                )}
                              </div>
                            )}

                            {/* Advanced Filters */}
                            {(formData.targetIndustries.length > 0 || formData.targetTitles.length > 0 || formData.targetRegions.length > 0) && (
                              <div className="space-y-2 border-t pt-2">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Filters Applied:</p>
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
                              </div>
                            )}
                            
                            {formData.targetLeadCount && (
                              <p className="text-sm pt-1">
                                <span className="text-muted-foreground">Target Lead Count:</span>{' '}
                                <span className="font-medium">{formData.targetLeadCount.toLocaleString()}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Organization Intelligence Context */}
                    {mode === 'client' && orgIntelData && (
                      <Card className="border-violet-200 dark:border-violet-800">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Brain className="h-4 w-4 text-violet-500" />
                            Organization Intelligence
                            <Badge variant="secondary" className="text-xs">Linked</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          <div className="grid grid-cols-2 gap-3">
                            <div><span className="text-muted-foreground">Company:</span> <span className="font-medium">{orgIntelData.name}</span></div>
                            {orgIntelData.positioning?.oneLiner && <div className="col-span-2 italic text-muted-foreground">"{orgIntelData.positioning.oneLiner}"</div>}
                            {orgIntelData.icp?.industries?.length > 0 && <div className="col-span-2"><span className="text-muted-foreground">ICP Industries:</span> {orgIntelData.icp.industries.join(', ')}</div>}
                          </div>
                          <p className="text-xs text-muted-foreground pt-1 border-t">This context will be injected into your AI agent's prompt layers for personalized conversations.</p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Test & Validation - Enhanced for Combo Campaigns */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <TestTube className="h-4 w-4 text-primary" />
                          Test Campaign Assets
                          {formData.channel === 'combo' && (
                            <Badge variant="outline" className="text-xs ml-2">Test each channel independently</Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {formData.channel === 'combo'
                            ? 'Test voice and email channels separately before launching'
                            : 'Send a test to yourself before launching'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Voice Test Section */}
                        {(formData.channel === 'voice' || formData.channel === 'combo') && (
                          <div className={cn(
                            "p-4 rounded-lg border",
                            formData.channel === 'combo' ? "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800" : ""
                          )}>
                            {formData.channel === 'combo' && (
                              <div className="flex items-center gap-2 mb-3">
                                <Phone className="h-4 w-4 text-blue-500" />
                                <span className="font-medium text-sm">Voice Channel Test</span>
                              </div>
                            )}
                            <div className="flex items-end gap-4">
                              <div className="flex-1 space-y-2">
                                <Label>Test Phone Number</Label>
                                <Input
                                  placeholder="+1 (555) 000-0000"
                                  value={testPhoneNumber}
                                  onChange={(e) => setTestPhoneNumber(e.target.value)}
                                />
                              </div>
                              <Button
                                variant="outline"
                                onClick={() => handleSendTest('voice')}
                                disabled={!testPhoneNumber || isTestSending}
                                className={formData.channel === 'combo' ? "border-blue-300 hover:bg-blue-100 dark:border-blue-700" : ""}
                              >
                                {isTestingChannel === 'voice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
                                Test Call
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Email Test Section */}
                        {(formData.channel === 'email' || formData.channel === 'combo') && (
                          <div className={cn(
                            "p-4 rounded-lg border",
                            formData.channel === 'combo' ? "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : ""
                          )}>
                            {formData.channel === 'combo' && (
                              <div className="flex items-center gap-2 mb-3">
                                <Mail className="h-4 w-4 text-green-500" />
                                <span className="font-medium text-sm">Email Channel Test</span>
                              </div>
                            )}
                            <div className="flex items-end gap-4">
                              <div className="flex-1 space-y-2">
                                <Label>Test Email Address</Label>
                                <Input
                                  placeholder="you@company.com"
                                  value={testEmail}
                                  onChange={(e) => setTestEmail(e.target.value)}
                                />
                              </div>
                              <Button
                                variant="outline"
                                onClick={() => handleSendTest('email')}
                                disabled={!testEmail || isTestSending}
                                className={formData.channel === 'combo' ? "border-green-300 hover:bg-green-100 dark:border-green-700" : ""}
                              >
                                {isTestingChannel === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                                Test Email
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Channel Execution Configuration (Combo only) */}
                    {formData.channel === 'combo' && (
                      <Card className="border-purple-200 dark:border-purple-800">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                            Channel Execution Settings
                          </CardTitle>
                          <CardDescription>Configure when and how each channel should be triggered independently</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {/* Voice Channel Trigger */}
                          <div className="p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">Voice Channel</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={formData.channelConfig.voice.enabled}
                                  onCheckedChange={(checked) => setFormData(prev => ({
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      voice: { ...prev.channelConfig.voice, enabled: checked }
                                    }
                                  }))}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {formData.channelConfig.voice.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                            </div>
                            {formData.channelConfig.voice.enabled && (
                              <div className="space-y-3">
                                <Label className="text-sm">Trigger Mode</Label>
                                <RadioGroup
                                  value={formData.channelConfig.voice.triggerMode}
                                  onValueChange={(v) => setFormData(prev => ({
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      voice: { ...prev.channelConfig.voice, triggerMode: v as 'immediate' | 'scheduled' | 'manual' }
                                    }
                                  }))}
                                  className="grid grid-cols-3 gap-2"
                                >
                                  <div>
                                    <RadioGroupItem value="immediate" id="voice-immediate" className="peer sr-only" />
                                    <Label htmlFor="voice-immediate" className="flex flex-col items-center p-3 border rounded-lg cursor-pointer peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50 dark:peer-data-[state=checked]:bg-blue-900/30">
                                      <Zap className="h-4 w-4 mb-1 text-blue-500" />
                                      <span className="text-xs font-medium">Immediate</span>
                                    </Label>
                                  </div>
                                  <div>
                                    <RadioGroupItem value="scheduled" id="voice-scheduled" className="peer sr-only" />
                                    <Label htmlFor="voice-scheduled" className="flex flex-col items-center p-3 border rounded-lg cursor-pointer peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50 dark:peer-data-[state=checked]:bg-blue-900/30">
                                      <Clock className="h-4 w-4 mb-1 text-blue-500" />
                                      <span className="text-xs font-medium">Scheduled</span>
                                    </Label>
                                  </div>
                                  <div>
                                    <RadioGroupItem value="manual" id="voice-manual" className="peer sr-only" />
                                    <Label htmlFor="voice-manual" className="flex flex-col items-center p-3 border rounded-lg cursor-pointer peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50 dark:peer-data-[state=checked]:bg-blue-900/30">
                                      <Play className="h-4 w-4 mb-1 text-blue-500" />
                                      <span className="text-xs font-medium">Manual</span>
                                    </Label>
                                  </div>
                                </RadioGroup>
                                {formData.channelConfig.voice.triggerMode === 'scheduled' && (
                                  <div className="pt-2">
                                    <Label className="text-xs text-muted-foreground">Schedule Date & Time</Label>
                                    <Input
                                      type="datetime-local"
                                      value={formData.channelConfig.voice.scheduledTime || ''}
                                      onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        channelConfig: {
                                          ...prev.channelConfig,
                                          voice: { ...prev.channelConfig.voice, scheduledTime: e.target.value }
                                        }
                                      }))}
                                      className="mt-1"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Email Channel Trigger */}
                          <div className="p-4 rounded-lg border bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-green-500" />
                                <span className="font-medium">Email Channel</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={formData.channelConfig.email.enabled}
                                  onCheckedChange={(checked) => setFormData(prev => ({
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      email: { ...prev.channelConfig.email, enabled: checked }
                                    }
                                  }))}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {formData.channelConfig.email.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                            </div>
                            {formData.channelConfig.email.enabled && (
                              <div className="space-y-3">
                                <Label className="text-sm">Trigger Mode</Label>
                                <RadioGroup
                                  value={formData.channelConfig.email.triggerMode}
                                  onValueChange={(v) => setFormData(prev => ({
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      email: { ...prev.channelConfig.email, triggerMode: v as 'immediate' | 'scheduled' | 'manual' }
                                    }
                                  }))}
                                  className="grid grid-cols-3 gap-2"
                                >
                                  <div>
                                    <RadioGroupItem value="immediate" id="email-immediate" className="peer sr-only" />
                                    <Label htmlFor="email-immediate" className="flex flex-col items-center p-3 border rounded-lg cursor-pointer peer-data-[state=checked]:border-green-500 peer-data-[state=checked]:bg-green-50 dark:peer-data-[state=checked]:bg-green-900/30">
                                      <Zap className="h-4 w-4 mb-1 text-green-500" />
                                      <span className="text-xs font-medium">Immediate</span>
                                    </Label>
                                  </div>
                                  <div>
                                    <RadioGroupItem value="scheduled" id="email-scheduled" className="peer sr-only" />
                                    <Label htmlFor="email-scheduled" className="flex flex-col items-center p-3 border rounded-lg cursor-pointer peer-data-[state=checked]:border-green-500 peer-data-[state=checked]:bg-green-50 dark:peer-data-[state=checked]:bg-green-900/30">
                                      <Clock className="h-4 w-4 mb-1 text-green-500" />
                                      <span className="text-xs font-medium">Scheduled</span>
                                    </Label>
                                  </div>
                                  <div>
                                    <RadioGroupItem value="manual" id="email-manual" className="peer sr-only" />
                                    <Label htmlFor="email-manual" className="flex flex-col items-center p-3 border rounded-lg cursor-pointer peer-data-[state=checked]:border-green-500 peer-data-[state=checked]:bg-green-50 dark:peer-data-[state=checked]:bg-green-900/30">
                                      <Play className="h-4 w-4 mb-1 text-green-500" />
                                      <span className="text-xs font-medium">Manual</span>
                                    </Label>
                                  </div>
                                </RadioGroup>
                                {formData.channelConfig.email.triggerMode === 'scheduled' && (
                                  <div className="pt-2">
                                    <Label className="text-xs text-muted-foreground">Schedule Date & Time</Label>
                                    <Input
                                      type="datetime-local"
                                      value={formData.channelConfig.email.scheduledTime || ''}
                                      onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        channelConfig: {
                                          ...prev.channelConfig,
                                          email: { ...prev.channelConfig.email, scheduledTime: e.target.value }
                                        }
                                      }))}
                                      className="mt-1"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Unified Info */}
                          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                            <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <p className="text-xs text-muted-foreground">
                              Both channels share the same contact list and campaign objective. Reporting will be unified across channels.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Launch Configuration */}
                    <Card className={cn(
                      "border-2 transition-colors",
                      launchStatus === 'active' ? 'border-primary/50 bg-primary/5' : 'border-dashed'
                    )}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Zap className="h-4 w-4 text-primary" />
                          Launch Configuration
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <RadioGroup
                          value={launchStatus}
                          onValueChange={(v: any) => setLaunchStatus(v)}
                          className="grid gap-4 md:grid-cols-3"
                        >
                          <div>
                            <RadioGroupItem value="active" id="status-active" className="peer sr-only" />
                            <Label
                              htmlFor="status-active"
                              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer h-full"
                            >
                              <Zap className="mb-3 h-6 w-6 text-primary" />
                              <span className="font-semibold">Activate Now</span>
                              <span className="text-xs text-muted-foreground text-center mt-1">
                                {formData.channel === 'combo' ? 'Start enabled channels per their trigger settings' : 'Start campaign immediately'}
                              </span>
                            </Label>
                          </div>

                          <div>
                            <RadioGroupItem value="paused" id="status-paused" className="peer sr-only" />
                            <Label
                              htmlFor="status-paused"
                              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer h-full"
                            >
                              <Pause className="mb-3 h-6 w-6 text-orange-500" />
                              <span className="font-semibold">Pause</span>
                              <span className="text-xs text-muted-foreground text-center mt-1">Create but do not start</span>
                            </Label>
                          </div>

                          <div>
                            <RadioGroupItem value="draft" id="status-draft" className="peer sr-only" />
                            <Label
                              htmlFor="status-draft"
                              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer h-full"
                            >
                              <Save className="mb-3 h-6 w-6 text-muted-foreground" />
                              <span className="font-semibold">Draft</span>
                              <span className="text-xs text-muted-foreground text-center mt-1">Save for later editing</span>
                            </Label>
                          </div>
                        </RadioGroup>
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

          <div className="flex-1 text-center">
            <span className="text-sm text-muted-foreground">Step {step} of {STEPS.length}</span>
            {/* Show missing fields message */}
            {!isStepValid(step) && getMissingFields(step).length > 0 && (
              <p className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Required: {getMissingFields(step).join(', ')}
              </p>
            )}
          </div>

          {step < STEPS.length ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={() => setStep(step + 1)}
                      disabled={!isStepValid(step)}
                    >
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </span>
                </TooltipTrigger>
                {!isStepValid(step) && getMissingFields(step).length > 0 && (
                  <TooltipContent>
                    <p>Please fill in: {getMissingFields(step).join(', ')}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
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
