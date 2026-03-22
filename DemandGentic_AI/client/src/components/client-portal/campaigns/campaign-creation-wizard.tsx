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
import { SidebarFilters } from '@/components/filters/sidebar-filters';
import type { FilterGroup } from '@shared/filter-types';
import { parsePhoneNumber } from 'libphonenumber-js'; // Import phone parser
import { ALL_VOICES as AI_VOICES } from '@/lib/voice-constants'; // Import voice constants

interface CampaignCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (campaign: any) => void;
  mode?: 'client' | 'admin';
  clientAccountId?: string;
  initialData?: Partial;
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
  selectedVoices: string[];
  selectedPersonaNames: Record;
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
  filterGroup?: FilterGroup;
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
  const [playingVoice, setPlayingVoice] = useState(null);
  const audioRef = useRef(null);
  const synthRef = useRef(null);
  const [voiceFilter, setVoiceFilter] = useState('all');
  
  // Admin mode: allow selecting client account if not provided via props
  const [selectedClientId, setSelectedClientId] = useState(propClientAccountId || '');
  const clientAccountId = propClientAccountId || selectedClientId;
  
  // Fetch client accounts for admin mode client selector
  const { data: adminClientAccounts = [] } = useQuery>({
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
    selectedVoices: ['Fenrir'],
    selectedPersonaNames: {},
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

  const [formData, setFormData] = useState({ ...defaultFormData, ...initialData });

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
      const existingSelectedVoices = Array.isArray(campaign.selectedVoices)
        ? campaign.selectedVoices.filter((v: string) => typeof v === 'string' && v.trim())
        : [];
      const selectedVoice: string = campaign.selectedVoice || existingSelectedVoices[0] || 'Fenrir';
      const selectedVoices: string[] = existingSelectedVoices.length > 0 ? existingSelectedVoices : [selectedVoice];
      const selectedPersonaNames: Record = {};
      for (const voiceId of selectedVoices) {
        selectedPersonaNames[voiceId] = campaign.selectedPersonaNames?.[voiceId] || resolveContextPersonaName(voiceId);
      }

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
        selectedVoice,
        selectedVoices,
        selectedPersonaNames,
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
  const [activeChannelTab, setActiveChannelTab] = useState('voice');

  // Test & Launch states
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [launchStatus, setLaunchStatus] = useState('active');
  const [isTestSending, setIsTestSending] = useState(false);
  const [isTestingChannel, setIsTestingChannel] = useState(null);
  const [createdWorkOrderId, setCreatedWorkOrderId] = useState(null);

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
          voiceProvider: "openai" // Defaulting to OpenAI Realtime as per governance
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
  const { data: wizardOrgIntel } = useQuery({
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
      ].map(p => typeof p === 'string' ? p : (p && typeof p === 'object' ? (p.name || p.title || p.content || JSON.stringify(p)) : String(p ?? ''))),
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
  const { data: availableLists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['/api/lists'],
    enabled: open && formData.audienceSource === 'lists' && mode === 'admin',
  });

  // Fetch admin segments for audience selection (admin mode only)
  const { data: availableSegments = [], isLoading: segmentsLoading } = useQuery({
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
        selectedVoices: formData.selectedVoices,
        selectedPersonaNames: formData.selectedPersonaNames,
        agentPersona: formData.agentPersona,
        agentTone: formData.agentTone,
        openingScript: formData.openingScript,
        targetQualifiedLeads: formData.targetLeadCount,
        audienceRefs: {
          lists: formData.selectedLists,
          segments: formData.selectedSegments,
          accounts: formData.selectedAccounts,
          contacts: formData.selectedContacts,
          ...(formData.filterGroup?.conditions?.length ? { filterGroup: formData.filterGroup } : {}),
          source: formData.audienceSource === 'advanced_filters' ? 'filters' : 'list',
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
        const headers: Record = {
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
        const headers: Record = {
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
      selectedVoices: ['Fenrir'],
      selectedPersonaNames: {},
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

  // Voice preview functionality - uses TTS API for authentic voice previews
  // Supports both client portal and admin modes with appropriate auth
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
      // Determine the correct TTS endpoint and auth based on mode
      const isAdmin = mode === 'admin';
      const ttsEndpoint = isAdmin ? '/api/voice-providers/tts' : '/api/client-portal/voice/tts';
      const token = isAdmin ? localStorage.getItem('authToken') : getToken();

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
      const response = await fetch(ttsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
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
        return formData.channel === 'email' || formData.selectedVoices.length > 0;
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
        if (formData.channel !== 'email' && formData.selectedVoices.length === 0) missing.push('AI Voice');
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

  const MALE_CORE_NAMES = ['Chris'];
  const MALE_EXPANDED_NAMES: string[] = [];
  const FEMALE_CORE_NAMES = ['Christine'];
  const FEMALE_EXPANDED_NAMES: string[] = [];

  const hashString = (input: string) => {
    let hash = 0;
    for (let i = 0; i  {
    const voice = AI_VOICES.find(v => v.id === voiceId);
    const isFemale = voice?.gender === 'female';
    const pool = isFemale
      ? [...FEMALE_CORE_NAMES, ...FEMALE_EXPANDED_NAMES]
      : [...MALE_CORE_NAMES, ...MALE_EXPANDED_NAMES];

    const contextSeed = [
      formData.campaignType,
      formData.objective,
      formData.targetAudience,
      formData.successCriteria,
      voiceId,
    ].join('|');

    return pool[hashString(contextSeed) % pool.length];
  };

  const autoSelectVoicesFromContext = () => {
    const contextText = [
      selectedType?.label || '',
      selectedType?.strategicIntent || '',
      ...(selectedType?.voicePersonality || []),
      formData.objective,
      formData.targetAudience,
      formData.successCriteria,
      ...(formData.talkingPoints || []),
    ].join(' ').toLowerCase();

    const voicePool = AI_VOICES.filter(v => v.provider === 'gemini');

    const scored = voicePool
      .map((voice) => {
        let score = 0;
        const toneTokens = voice.tone.toLowerCase().split(/[^a-z]+/).filter(Boolean);
        const descriptionTokens = voice.description.toLowerCase().split(/[^a-z]+/).filter(Boolean);
        const bestForTokens = voice.bestFor.flatMap((b) => b.toLowerCase().split(/[^a-z]+/).filter(Boolean));

        for (const token of [...toneTokens, ...descriptionTokens, ...bestForTokens]) {
          if (token.length > 2 && contextText.includes(token)) score += 2;
        }

        // Light balancing to avoid single-gender concentration
        if (voice.gender === 'female') score += 0.5;

        return { voice, score };
      })
      .sort((a, b) => b.score - a.score);

    const picked = Array.from(new Set(scored.slice(0, 4).map(s => s.voice.id)));
    const fallback = ['Fenrir', 'Kore', 'Charon', 'Aoede'];
    const selected = picked.length > 0 ? picked : fallback;

    const selectedPersonaNames = selected.reduce>((acc, voiceId) => {
      acc[voiceId] = resolveContextPersonaName(voiceId);
      return acc;
    }, {});

    setFormData(prev => ({
      ...prev,
      selectedVoices: selected,
      selectedVoice: selected[0],
      selectedPersonaNames,
    }));

    toast({
      title: 'Voices auto-selected',
      description: `${selected.length} voices selected from campaign context`,
    });
  };

  return (
    
      
        {/* Header with progress */}
        
          
            
              
              Create New Campaign
            
            
              Set up your AI-powered campaign in a few easy steps
            
          

          {/* Progress bar */}
          
            
            
              {STEPS.map((s) => (
                
                  
                    
                       s.id  step}
                        className={cn(
                          'flex flex-col items-center gap-1 transition-all',
                          s.id === step && 'scale-110',
                          s.id 
                        
                          {s.id 
                          ) : (
                            
                          )}
                        
                        {s.title}
                      
                    
                    
                      {s.title}
                    
                  
                
              ))}
            
          
        

        {/* Content area */}
        
          
            
              {/* Step 1: Campaign Basics */}
              {step === 1 && (
                
                  
                    Let's start with the basics
                    Give your campaign a name and description
                  

                  
                    {/* Admin mode: Client Account Selector (if not preset via props) */}
                    {mode === 'admin' && !propClientAccountId && (
                      
                        Client Account *
                        
                          Select the client this campaign belongs to
                        
                        
                          
                            
                          
                          
                            {adminClientAccounts.map((client) => (
                              
                                {client.companyName || client.name || client.id}
                              
                            ))}
                          
                        
                        {!selectedClientId && (
                          
                            
                            Required for creating campaigns and testing
                          
                        )}
                      
                    )}
                    
                    
                      Campaign Name *
                      
                        Format: ClientID-MMDDYY-CustomName
                      
                      
                        
                          {clientAccountId ? clientAccountId.slice(0, 8) : 'CLIENTID'}-{(() => {
                            const now = new Date();
                            const mm = String(now.getMonth() + 1).padStart(2, '0');
                            const dd = String(now.getDate()).padStart(2, '0');
                            const yy = String(now.getFullYear()).slice(-2);
                            return `${mm}${dd}${yy}`;
                          })()}-
                        
                         {
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
                      
                      {formData.name && (
                        
                          Full name: {formData.name}
                        
                      )}
                    

                    
                      Campaign Description (Optional)
                       setFormData(prev => ({ ...prev, description: e.target.value }))}
                        rows={4}
                      />
                    
                  
                
              )}

              {/* Step 2: Promotion Channel */}
              {step === 2 && (
                
                  
                    Choose your promotion channel
                    How would you like to reach your audience?
                  

                  
                    {PROMOTION_CHANNELS.map((channel) => (
                       setFormData(prev => ({ ...prev, channel: channel.value as any }))}
                        className={cn(
                          'relative flex flex-col items-center p-6 rounded-xl border-2 transition-all hover:shadow-lg',
                          formData.channel === channel.value
                            ? 'border-primary bg-primary/5 shadow-md'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {formData.channel === channel.value && (
                          
                            
                              
                            
                          
                        )}
                        
                          
                        
                        {channel.label}
                        {channel.description}
                      
                    ))}
                  
                
              )}

              {/* Step 3: Campaign Type */}
              {step === 3 && (
                
                  
                    What type of campaign is this?
                    
                      Choose your campaign objective for {formData.channel === 'voice' ? 'AI Voice Calls' : formData.channel === 'email' ? 'Email Campaigns' : 'Multi-Channel'}
                    
                    {selectedChannel && (
                      
                        
                        {selectedChannel.label}
                      
                    )}
                  

                  
                    
                      {CAMPAIGN_TYPE_CATEGORIES.map((category) => {
                        // Filter types that are available for the selected channel
                        const categoryTypes = availableCampaignTypes.filter(
                          (t: CampaignType) => category.types.includes(t.value)
                        );

                        if (categoryTypes.length === 0) return null;

                        return (
                          
                            {/* Category Header */}
                            
                              
                                
                              
                              
                                {category.label}
                              
                              
                            

                            {/* Category Types */}
                            
                              {categoryTypes.map((type: CampaignType) => (
                                 setFormData(prev => ({ ...prev, campaignType: type.value }))}
                                  className={cn(
                                    'flex flex-col p-4 rounded-xl border-2 text-left transition-all hover:shadow-md',
                                    formData.campaignType === type.value
                                      ? 'border-primary bg-primary/5 shadow-sm'
                                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                                  )}
                                >
                                  
                                    
                                      {type.label}
                                      
                                        {type.description}
                                      
                                    
                                    {formData.campaignType === type.value && (
                                      
                                        
                                      
                                    )}
                                  
                                  {/* Goal Badge */}
                                  
                                    
                                      {type.primaryGoal}
                                    
                                    {type.supportsVoice && type.supportsEmail && (
                                      
                                        Multi-Channel
                                      
                                    )}
                                  
                                
                              ))}
                            
                          
                        );
                      })}
                    
                  
                
              )}

              {/* Step 4: Campaign Content */}
              {step === 4 && (
                
                  
                    Define your campaign content
                    
                      {formData.channel === 'combo'
                        ? 'Configure each channel separately - your campaign shares a unified contact list and objective'
                        : 'Tell us what makes your campaign special'}
                    
                  

                  
                    {/* Prompt Hierarchy Info */}
                    
                      
                        
                        
                          How AI Generates Content
                          
                            The system uses a layered prompt approach for maximum relevance:
                            
                            1. Foundation Prompt (Global Logic)
                            
                            2. Organization Intelligence (Your business context)
                            
                            3. Campaign Prompt (Your inputs below)
                            
                            4. Account Layer (CRM Data)
                          
                        
                      
                    

                    {/* Organization Intelligence Context Panel */}
                    {mode === 'client' && orgIntelData && (
                      
                        
                          
                            
                              
                              Organization Intelligence Connected
                            
                            
                              
                              Auto-Fill from Intelligence
                            
                          
                        
                        
                          
                            
                              Company
                              {orgIntelData.name}
                            
                            {orgIntelData.industry && (
                              
                                Industry
                                {orgIntelData.industry}
                              
                            )}
                            {orgIntelData.offerings?.coreProducts?.length > 0 && (
                              
                                Products
                                {orgIntelData.offerings.coreProducts.length} defined
                              
                            )}
                            {orgIntelData.icp?.industries?.length > 0 && (
                              
                                Target Industries
                                {orgIntelData.icp.industries.slice(0, 2).join(', ')}{orgIntelData.icp.industries.length > 2 ? '...' : ''}
                              
                            )}
                          
                          {orgIntelData.positioning?.oneLiner && (
                            "{orgIntelData.positioning.oneLiner}"
                          )}
                        
                      
                    )}
                    {mode === 'client' && !orgIntelData && (
                      
                        
                        
                          No Organization Intelligence set up. Add your business context in the Intelligence tab for AI-powered auto-fill and smarter campaign targeting.
                        
                      
                    )}

                    {/* Shared Campaign Objective */}
                    
                      
                        
                        Campaign Objective *
                        {formData.channel === 'combo' && (
                          Shared across channels
                        )}
                      
                       setFormData(prev => ({ ...prev, objective: e.target.value }))}
                        rows={3}
                      />
                    

                    {/* Channel Tabs for Combo Campaigns */}
                    {formData.channel === 'combo' && (
                      
                        
                          
                          Multi-Channel Content
                          Configure each channel
                        

                         setActiveChannelTab(v as 'voice' | 'email')} className="w-full">
                          
                            
                              
                              Voice Call
                              {formData.voiceIntent && formData.talkingPoints.length > 0 && (
                                
                              )}
                            
                            
                              
                              Email
                              {formData.emailIntent && formData.emailSubject && (
                                
                              )}
                            
                          

                          {/* Voice Tab Content */}
                          
                            
                              
                                
                                  
                                  Voice Channel Configuration
                                
                                Define the message and intent for AI voice calls
                              
                              
                                {/* Voice Intent */}
                                
                                  
                                    
                                    Call Intent *
                                  
                                   setFormData(prev => ({ ...prev, voiceIntent: e.target.value }))}
                                    rows={2}
                                  />
                                  What should the AI agent accomplish on each call?
                                

                                {/* Key Talking Points */}
                                
                                  
                                    
                                      
                                      Key Talking Points
                                    
                                    {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length > 0 && (
                                      
                                        {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length} added
                                      
                                    )}
                                  
                                  
                                    Type and press Enter to add.
                                  
                                  
                                     setTalkingPointInput(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          if (talkingPointInput.trim()) {
                                            setFormData(prev => ({
                                              ...prev,
                                              talkingPoints: [...prev.talkingPoints.filter(p => typeof p === 'string' && p.trim()), talkingPointInput.trim()],
                                            }));
                                            setTalkingPointInput('');
                                          }
                                        }
                                      }}
                                      className="flex-1"
                                    />
                                     {
                                        if (talkingPointInput.trim()) {
                                          setFormData(prev => ({
                                            ...prev,
                                            talkingPoints: [...prev.talkingPoints.filter(p => typeof p === 'string' && p.trim()), talkingPointInput.trim()],
                                          }));
                                          setTalkingPointInput('');
                                        }
                                      }}
                                      disabled={!talkingPointInput.trim()}
                                      size="sm"
                                    >
                                      
                                      Add
                                    
                                  
                                  {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length > 0 && (
                                    
                                      {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).map((point, idx) => (
                                        
                                          {idx + 1}.
                                          {point}
                                           {
                                              setFormData(prev => ({
                                                ...prev,
                                                talkingPoints: prev.talkingPoints.filter((_, i) => i !== idx),
                                              }));
                                            }}
                                            className="ml-1 hover:text-destructive rounded-full hover:bg-destructive/10 p-0.5"
                                          >
                                            
                                          
                                        
                                      ))}
                                    
                                  )}
                                
                              
                            
                          

                          {/* Email Tab Content */}
                          
                            
                              
                                
                                  
                                  Email Channel Configuration
                                
                                Define the message and intent for email outreach
                              
                              
                                {/* Email Intent */}
                                
                                  
                                    
                                    Email Intent *
                                  
                                   setFormData(prev => ({ ...prev, emailIntent: e.target.value }))}
                                    rows={2}
                                  />
                                  What should the email accomplish?
                                

                                {/* Email Subject */}
                                
                                  Email Subject Line *
                                   setFormData(prev => ({ ...prev, emailSubject: e.target.value }))}
                                  />
                                

                                {/* Email Body */}
                                
                                  Email Body Template *
                                   setFormData(prev => ({ ...prev, emailBody: e.target.value }))}
                                    rows={5}
                                  />
                                  
                                    Variables: &#123;first_name&#125;, &#123;company_name&#125;, &#123;title&#125;
                                  
                                
                              
                            
                          
                        
                      
                    )}

                    {/* Voice Content Configuration (Single Channel) */}
                    {formData.channel === 'voice' && (
                      
                        
                           
                           Voice Call Scripting
                        

                        {/* Voice Intent */}
                        
                          
                            
                            Call Intent
                          
                           setFormData(prev => ({ ...prev, voiceIntent: e.target.value }))}
                            rows={2}
                          />
                        

                        {/* Key Talking Points */}
                        
                          
                            
                              
                                
                                Key Talking Points
                              
                              {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length > 0 && (
                                
                                  {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length} added
                                
                              )}
                            
                            
                              What should the AI agent highlight? Type and press Enter to add.
                            
                            
                               setTalkingPointInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (talkingPointInput.trim()) {
                                      setFormData(prev => ({
                                        ...prev,
                                        talkingPoints: [...prev.talkingPoints.filter(p => typeof p === 'string' && p.trim()), talkingPointInput.trim()],
                                      }));
                                      setTalkingPointInput('');
                                    }
                                  }
                                }}
                                className="flex-1"
                              />
                               {
                                  if (talkingPointInput.trim()) {
                                    setFormData(prev => ({
                                      ...prev,
                                      talkingPoints: [...prev.talkingPoints.filter(p => typeof p === 'string' && p.trim()), talkingPointInput.trim()],
                                    }));
                                    setTalkingPointInput('');
                                  }
                                }}
                                disabled={!talkingPointInput.trim()}
                                size="sm"
                              >
                                
                                Add
                              
                            
                            {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length > 0 && (
                              
                                
                                  {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).map((point, idx) => (
                                    
                                      {idx + 1}.
                                      {point}
                                       {
                                          setFormData(prev => ({
                                            ...prev,
                                            talkingPoints: prev.talkingPoints.filter((_, i) => i !== idx),
                                          }));
                                        }}
                                        className="ml-1 hover:text-destructive rounded-full hover:bg-destructive/10 p-0.5 transition-colors"
                                      >
                                        
                                      
                                    
                                  ))}
                                
                              
                            )}
                            {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length === 0 && (
                              
                                
                                No talking points yet. Add key messages for your AI agent.
                              
                            )}
                          
                        
                      
                    )}

                    {/* Email Content Configuration (Single Channel) */}
                    {formData.channel === 'email' && (
                      
                         
                           
                           Email Configuration
                         

                        {/* Email Intent */}
                        
                          
                            
                            Email Intent
                          
                           setFormData(prev => ({ ...prev, emailIntent: e.target.value }))}
                            rows={2}
                          />
                        

                        
                          Email Subject Line *
                           setFormData(prev => ({ ...prev, emailSubject: e.target.value }))}
                          />
                        

                        
                          Email Body Template *
                           setFormData(prev => ({ ...prev, emailBody: e.target.value }))}
                            rows={6}
                          />
                          
                            Supported variables: &#123;first_name&#125;, &#123;company_name&#125;, &#123;title&#125;
                          
                        
                      
                    )}

                    {/* Success Criteria */}
                    
                      
                        
                        Success Criteria *
                        {formData.channel === 'combo' && (
                          Shared across channels
                        )}
                      
                       setFormData(prev => ({ ...prev, successCriteria: e.target.value }))}
                        rows={3}
                      />
                    

                    {/* Target Audience Description */}
                    
                      
                        
                        Target Audience Description
                      
                       setFormData(prev => ({ ...prev, targetAudience: e.target.value }))}
                        rows={2}
                      />
                    

                    {/* Common Objections (for voice campaigns) */}
                    {(formData.channel === 'voice' || formData.channel === 'combo') && (
                    
                      
                        
                        Common Objections & Responses (Optional)
                      
                      {formData.objections.map((obj, index) => (
                        
                          
                            
                              Objection {index + 1}
                              {formData.objections.length > 1 && (
                                 removeObjection(index)}
                                >
                                  
                                
                              )}
                            
                             updateObjection(index, 'objection', e.target.value)}
                            />
                             updateObjection(index, 'response', e.target.value)}
                            />
                          
                        
                      ))}
                      
                        
                        Add Objection
                      
                    
                    )}
                  
                
              )}

              {/* Step 5: Sender Config */}
              {step === 5 && (
                
                  
                    
                      Sender Configuration
                    
                    
                      Configure who your audience will see or hear from
                    
                  

                  {/* Voice Configuration */}
                  {(formData.channel === 'voice' || formData.channel === 'combo') && (
                    
                      
                        
                        Voice Sender Configuration
                      

                      {/* Phone Number Selection */}
                      
                         Outbound Phone Number
                          setFormData(prev => ({ ...prev, selectedPhoneNumber: value }))}
                          >
                            
                              
                            
                            
                              {phoneNumbersLoading ? (
                                
                                  
                                  Loading...
                                
                              ) : telnyxPhoneNumbers.length === 0 ? (
                                
                                  No phone numbers available
                                
                              ) : (
                                telnyxPhoneNumbers.map((phone: any) => (
                                  
                                    {phone.displayName || phone.phoneNumberE164}
                                    {phone.region && ` - ${phone.region}`}
                                    {phone.areaCode && ` (${phone.areaCode})`}
                                  
                                ))
                              )}
                            
                          
                         {telnyxPhoneNumbers.length === 0 && !phoneNumbersLoading && (
                           
                             No Telnyx phone numbers configured. Contact admin to add numbers.
                           
                         )}
                      

                      {/* Voice Selection Grid */}
                      
                        
                          
                            Select AI Voices
                            
                              {formData.selectedVoices.length} selected
                            
                          
                          
                            
                              
                              Auto Select
                            
                             setVoiceFilter('all')}
                            >
                              All ({AI_VOICES.length})
                            
                             setVoiceFilter('male')}
                            >
                              Male ({AI_VOICES.filter(v => v.gender === 'male').length})
                            
                             setVoiceFilter('female')}
                            >
                              Female ({AI_VOICES.filter(v => v.gender === 'female').length})
                            
                          
                        
                        
                          
                            {AI_VOICES.filter(v => voiceFilter === 'all' || v.gender === voiceFilter).map((voice) => (
                               {
                                  setFormData(prev => {
                                    const isSelected = prev.selectedVoices.includes(voice.id);
                                    const nextSelectedVoices = isSelected
                                      ? prev.selectedVoices.filter(v => v !== voice.id)
                                      : [...prev.selectedVoices, voice.id];

                                    const normalizedSelectedVoices = nextSelectedVoices.length > 0
                                      ? nextSelectedVoices
                                      : [voice.id];

                                    const selectedPersonaNames = normalizedSelectedVoices.reduce>((acc, voiceId) => {
                                      acc[voiceId] = prev.selectedPersonaNames?.[voiceId] || resolveContextPersonaName(voiceId);
                                      return acc;
                                    }, {});

                                    return {
                                      ...prev,
                                      selectedVoices: normalizedSelectedVoices,
                                      selectedVoice: normalizedSelectedVoices[0],
                                      selectedPersonaNames,
                                    };
                                  });
                                }}
                              >
                                {/* Gradient Header */}
                                

                                {formData.selectedVoices.includes(voice.id) && (
                                  
                                    
                                      
                                    
                                  
                                )}

                                
                                  {/* Voice Avatar & Name */}
                                  
                                    
                                      
                                    
                                    
                                      
                                        {voice.name}
                                        
                                          {voice.gender}
                                        
                                      
                                      {voice.tone}
                                    
                                  

                                  {/* Tone Badge */}
                                  
                                    
                                      {voice.tone}
                                    
                                  

                                  {/* Description */}
                                  
                                    {voice.description}
                                  

                                  {/* Best For Tags */}
                                  
                                    {voice.bestFor.map((tag, i) => (
                                      
                                        {tag}
                                      
                                    ))}
                                  

                                  {formData.selectedVoices.includes(voice.id) && (
                                    
                                      
                                        Persona Name: {formData.selectedPersonaNames?.[voice.id] || resolveContextPersonaName(voice.id)}
                                      
                                    
                                  )}

                                  {/* Preview Button */}
                                   {
                                      e.stopPropagation();
                                      playVoicePreview(voice.id);
                                    }}
                                  >
                                    {isPlaying && playingVoice === voice.id ? (
                                      <>
                                        
                                        Stop Preview
                                      
                                    ) : (
                                      <>
                                        
                                        Preview Voice
                                      
                                    )}
                                  
                                
                              
                            ))}
                          
                        
                      
                    
                  )}

                  {/* Email Configuration */}
                  {(formData.channel === 'email' || formData.channel === 'combo') && (
                    
                      
                        
                        Email Sender Configuration
                      

                      
                         
                           Sender Profile
                            setFormData(prev => ({ ...prev, senderProfileId: value }))}
                            >
                              
                                
                              
                              
                                {AVAILABLE_SENDER_PROFILES.map(profile => (
                                  
                                    {profile.name} &lt;{profile.email}&gt; - {profile.role}
                                  
                                ))}
                              
                            
                         
                      
                    
                  )}

                  {/* Agent Personality Configuration */}
                  
                    
                      Agent Tone
                       setFormData(prev => ({ ...prev, agentTone: value as any }))}
                        className="grid grid-cols-2 md:grid-cols-4 gap-4"
                      >
                        {[
                          { value: 'professional', label: 'Professional', icon: Building2 },
                          { value: 'friendly', label: 'Friendly', icon: Sparkles },
                          { value: 'consultative', label: 'Consultative', icon: Brain },
                          { value: 'direct', label: 'Direct', icon: Zap },
                        ].map((tone) => (
                          
                            
                            
                            {tone.label}
                          
                        ))}
                      
                    

                    
                      Agent Persona (Optional)
                       setFormData(prev => ({ ...prev, agentPersona: e.target.value }))}
                        rows={3}
                      />
                    

                    {formData.channel !== 'email' && (
                      
                        Opening Script (Optional)
                         setFormData(prev => ({ ...prev, openingScript: e.target.value }))}
                          rows={3}
                        />
                        
                          Use [Name], [Company], [Title] as placeholders for personalization
                        
                      
                    )}
                  
                
              )}

              {/* Step 6: Audience Selection */}
              {step === 6 && (
                
                  
                    Define your target audience
                    Select from lists, use advanced filters, or let us handle targeting
                  

                  
                    {/* Audience Selection - Admin Lists & Filters */}
                    
                      
                        
                          
                          {mode === 'client' ? 'Select from Your CRM Data' : 'Select Admin Lists & Segments'}
                        
                        
                          {mode === 'client' 
                            ? 'Choose accounts and contacts you\'ve uploaded to your CRM'
                            : 'Choose from approved contact segments and account lists'}
                        
                      
                      
                        {orgIntelData?.id && (
                           {
                              setShowAdvancedFilters(true);
                              try {
                                const res = await apiRequest("POST", "/api/ai/generate-audience-filters", {
                                  organizationId: orgIntelData.id,
                                  campaignName: formData.name,
                                  campaignObjective: formData.objective,
                                  targetAudienceDescription: formData.targetAudience,
                                });
                                const data = await res.json();
                                setFormData(prev => ({ ...prev, filterGroup: data.filterGroup }));
                                toast({
                                  title: "AI Filters Generated",
                                  description: `${data.filterGroup.conditions.length} filter conditions created (${Math.round(data.confidence * 100)}% confidence)`,
                                });
                              } catch (error: any) {
                                toast({
                                  title: "AI Generation Failed",
                                  description: error?.message || "Failed to generate filters with AI",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            
                            AI Filters
                          
                        )}
                         setShowAdvancedFilters(!showAdvancedFilters)}
                          className={cn(showAdvancedFilters && "bg-primary/10 border-primary/50 text-primary")}
                        >
                          
                          Advanced Unified Filter
                        
                      
                    

                    {/* Always Show List Selection */}
                    
                      
                        {(mode === 'client' ? (accountsLoading || contactsLoading) : (listsLoading || segmentsLoading)) ? (
                          
                            
                          
                        ) : mode === 'client' ? (
                          /* Client Portal Mode - Show Client CRM Data */
                          
                            
                              {/* Client Accounts */}
                              
                                
                                  Your Accounts ({clientAccounts.length})
                                
                                
                                  {clientAccounts.length === 0 ? (
                                    
                                      
                                      No accounts uploaded yet
                                      Upload accounts from the CRM section
                                    
                                  ) : (
                                    clientAccounts.slice(0, 50).map((account: any) => (
                                       {
                                          const newSelected = formData.selectedAccounts.includes(account.id)
                                            ? formData.selectedAccounts.filter(a => a !== account.id)
                                            : [...formData.selectedAccounts, account.id];
                                          setFormData(prev => ({ ...prev, selectedAccounts: newSelected }));
                                        }}
                                      >
                                         {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedAccounts: checked
                                                ? [...prev.selectedAccounts, account.id]
                                                : prev.selectedAccounts.filter(a => a !== account.id)
                                            }));
                                          }}
                                        />
                                        
                                          {account.name}
                                          
                                            {account.industry || 'No industry'} • {account.domain || 'No domain'}
                                          
                                        
                                        Account
                                      
                                    ))
                                  )}
                                  {clientAccounts.length > 50 && (
                                    
                                      Showing first 50 of {clientAccounts.length} accounts
                                    
                                  )}
                                
                              

                              {/* Client Contacts */}
                              
                                
                                  Your Contacts ({clientContacts.length})
                                
                                
                                  {clientContacts.length === 0 ? (
                                    
                                      
                                      No contacts uploaded yet
                                      Upload contacts from the CRM section
                                    
                                  ) : (
                                    clientContacts.slice(0, 50).map((contact: any) => (
                                       {
                                          const newSelected = formData.selectedContacts.includes(contact.id)
                                            ? formData.selectedContacts.filter(c => c !== contact.id)
                                            : [...formData.selectedContacts, contact.id];
                                          setFormData(prev => ({ ...prev, selectedContacts: newSelected }));
                                        }}
                                      >
                                         {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedContacts: checked
                                                ? [...prev.selectedContacts, contact.id]
                                                : prev.selectedContacts.filter(c => c !== contact.id)
                                            }));
                                          }}
                                        />
                                        
                                          
                                            {contact.firstName} {contact.lastName}
                                          
                                          
                                            {contact.title || 'No title'} • {contact.email || 'No email'}
                                          
                                        
                                        Contact
                                      
                                    ))
                                  )}
                                  {clientContacts.length > 50 && (
                                    
                                      Showing first 50 of {clientContacts.length} contacts
                                    
                                  )}
                                
                              
                            
                          
                        ) : (
                          /* Admin Mode - Show Lists & Segments */
                          
                            
                              {/* Contact Segments */}
                              
                                Contact Segments
                                
                                  {availableSegments.length === 0 ? (
                                    
                                      
                                      No segments available
                                      Create segments from the Segments page
                                    
                                  ) : (
                                    availableSegments.map((segment: any) => (
                                       {
                                          const newSelected = formData.selectedSegments.includes(segment.id)
                                            ? formData.selectedSegments.filter(s => s !== segment.id)
                                            : [...formData.selectedSegments, segment.id];
                                          setFormData(prev => ({ ...prev, selectedSegments: newSelected }));
                                        }}
                                      >
                                         {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedSegments: checked
                                                ? [...prev.selectedSegments, segment.id]
                                                : prev.selectedSegments.filter(s => s !== segment.id)
                                            }));
                                          }}
                                        />
                                        
                                          {segment.name}
                                          {(segment.recordCountCache || 0).toLocaleString()} contacts
                                        
                                        Segment
                                      
                                    ))
                                  )}
                                
                              

                              {/* Static Lists */}
                              
                                Static Lists
                                
                                  {availableLists.length === 0 ? (
                                    
                                      
                                      No lists available
                                      Create lists from the Lists page
                                    
                                  ) : (
                                    availableLists.map((list: any) => (
                                       {
                                          const newSelected = formData.selectedLists.includes(list.id)
                                            ? formData.selectedLists.filter(l => l !== list.id)
                                            : [...formData.selectedLists, list.id];
                                          setFormData(prev => ({ ...prev, selectedLists: newSelected }));
                                        }}
                                      >
                                         {
                                            setFormData(prev => ({
                                              ...prev,
                                              selectedLists: checked
                                                ? [...prev.selectedLists, list.id]
                                                : prev.selectedLists.filter(l => l !== list.id)
                                            }));
                                          }}
                                        />
                                        
                                          {list.name}
                                          {(list.recordIds?.length || 0).toLocaleString()} contacts
                                        
                                        List
                                      
                                    ))
                                  )}
                                
                              
                            
                          
                        )}
                        {/* Selection Summary */}
                        {mode === 'client' ? (
                          (formData.selectedAccounts.length > 0 || formData.selectedContacts.length > 0) && (
                            
                              
                                Selected: {formData.selectedAccounts.length} accounts, {formData.selectedContacts.length} contacts
                              
                              Ready to Assign
                            
                          )
                        ) : (
                          (formData.selectedSegments.length > 0 || formData.selectedLists.length > 0) && (
                            
                              
                                Selected: {formData.selectedSegments.length} segments, {formData.selectedLists.length} lists
                              
                              Ready to Assign
                            
                          )
                        )}
                      
                    

                    {/* Advanced Unified Filter Section */}
                    
                      {showAdvancedFilters && (
                        
                          
                             
                               
                               
                                 Refine Audience with Filters
                                 
                                   Apply filters to narrow down contacts within your selected lists & segments
                                 
                               
                             

                             setFormData(prev => ({ ...prev, filterGroup: fg || undefined }))}
                              initialFilter={formData.filterGroup}
                              audienceScope={
                                formData.selectedLists.length > 0
                                  ? { listIds: formData.selectedLists }
                                  : formData.selectedSegments.length > 0
                                    ? { segmentIds: formData.selectedSegments }
                                    : undefined
                              }
                            />

                            {formData.filterGroup && formData.filterGroup.conditions?.length > 0 && (
                              
                                
                                
                                  {formData.filterGroup.conditions.length} filter
                                  {formData.filterGroup.conditions.length !== 1 ? 's' : ''} applied
                                  {(formData.selectedLists.length > 0 || formData.selectedSegments.length > 0) &&
                                    ' to narrow down selected audience'}
                                
                              
                            )}

                            {/* Target Lead Count */}
                            
                              Target Lead Count
                               setFormData(prev => ({
                                  ...prev,
                                  targetLeadCount: e.target.value ? parseInt(e.target.value) : undefined
                                }))}
                              />
                            
                          
                        
                      )}
                    
                  
                
              )}

              {/* Step 7: Review */}
              {step === 7 && (
                
                  
                    Review your campaign
                    Make sure everything looks good before submitting
                  

                  
                    {/* Campaign Summary Card */}
                    
                      
                        
                          {selectedChannel && (
                            
                              
                            
                          )}
                          
                            {formData.name || 'Untitled Campaign'}
                            {selectedType?.label} • {selectedChannel?.label}
                          
                        
                      
                      
                        {/* Objective */}
                        
                          
                            Campaign Objective
                            {formData.channel === 'combo' && (
                              Shared
                            )}
                          
                          {formData.objective || 'Not specified'}
                        

                        {/* Channel-Specific Content for Combo */}
                        {formData.channel === 'combo' && (
                          <>
                            
                            
                              {/* Voice Channel Summary */}
                              
                                
                                  
                                  Voice Channel
                                  {formData.channelConfig.voice.enabled ? (
                                    Enabled
                                  ) : (
                                    Disabled
                                  )}
                                
                                {formData.voiceIntent && (
                                  
                                    Intent: {formData.voiceIntent}
                                  
                                )}
                                {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length > 0 && (
                                  
                                    Talking Points:
                                    
                                      {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).slice(0, 3).map((p, i) => (
                                        {p}
                                      ))}
                                      {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length > 3 && (
                                        +{formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length - 3} more
                                      )}
                                    
                                  
                                )}
                                
                                  Trigger: {formData.channelConfig.voice.triggerMode}
                                
                              

                              {/* Email Channel Summary */}
                              
                                
                                  
                                  Email Channel
                                  {formData.channelConfig.email.enabled ? (
                                    Enabled
                                  ) : (
                                    Disabled
                                  )}
                                
                                {formData.emailIntent && (
                                  
                                    Intent: {formData.emailIntent}
                                  
                                )}
                                {formData.emailSubject && (
                                  
                                    Subject: {formData.emailSubject}
                                  
                                )}
                                
                                  Trigger: {formData.channelConfig.email.triggerMode}
                                
                              
                            
                          
                        )}

                        {/* Talking Points (Single Channel) */}
                        {formData.channel !== 'combo' && formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).length > 0 && (
                          
                            Key Talking Points
                            
                              {formData.talkingPoints.filter(p => typeof p === 'string' && p.trim()).map((point, idx) => (
                                {point}
                              ))}
                            
                          
                        )}

                        {/* Success Criteria */}
                        
                          
                            Success Criteria
                            {formData.channel === 'combo' && (
                              Shared
                            )}
                          
                          {formData.successCriteria || 'Not specified'}
                        

                        

                        {/* AI Agent */}
                        {formData.channel !== 'email' && (
                          
                            
                              
                            
                            
                              AI Voice Agent
                              
                                Voice: {selectedVoiceInfo?.name} • Tone: {formData.agentTone}
                              
                            
                             playVoicePreview(formData.selectedVoice)}
                            >
                              
                              Preview Voice
                            
                          
                        )}

                        

                        {/* Audience */}
                        
                          Target Audience
                          
                            {/* Selected Lists & Segments */}
                            {(formData.selectedSegments.length > 0 || formData.selectedLists.length > 0) && (
                              
                                {formData.selectedSegments.length > 0 && (
                                  
                                    {formData.selectedSegments.length} Segments Selected
                                  
                                )}
                                {formData.selectedLists.length > 0 && (
                                  
                                    {formData.selectedLists.length} Account Lists Selected
                                  
                                )}
                              
                            )}

                            {/* Advanced Filters */}
                            {(formData.targetIndustries.length > 0 || formData.targetTitles.length > 0 || formData.targetRegions.length > 0) && (
                              
                                Filters Applied:
                                {formData.targetIndustries.length > 0 && (
                                  
                                    Industries:
                                    {formData.targetIndustries.map((i, idx) => (
                                      {i}
                                    ))}
                                  
                                )}
                                {formData.targetTitles.length > 0 && (
                                  
                                    Titles:
                                    {formData.targetTitles.map((t, idx) => (
                                      {t}
                                    ))}
                                  
                                )}
                                {formData.targetRegions.length > 0 && (
                                  
                                    Regions:
                                    {formData.targetRegions.map((r, idx) => (
                                      {r}
                                    ))}
                                  
                                )}
                              
                            )}
                            
                            {formData.targetLeadCount && (
                              
                                Target Lead Count:{' '}
                                {formData.targetLeadCount.toLocaleString()}
                              
                            )}
                          
                        
                      
                    

                    {/* Organization Intelligence Context */}
                    {mode === 'client' && orgIntelData && (
                      
                        
                          
                            
                            Organization Intelligence
                            Linked
                          
                        
                        
                          
                            Company: {orgIntelData.name}
                            {orgIntelData.positioning?.oneLiner && "{orgIntelData.positioning.oneLiner}"}
                            {orgIntelData.icp?.industries?.length > 0 && ICP Industries: {orgIntelData.icp.industries.join(', ')}}
                          
                          This context will be injected into your AI agent's prompt layers for personalized conversations.
                        
                      
                    )}

                    {/* Test & Validation - Enhanced for Combo Campaigns */}
                    
                      
                        
                          
                          Test Campaign Assets
                          {formData.channel === 'combo' && (
                            Test each channel independently
                          )}
                        
                        
                          {formData.channel === 'combo'
                            ? 'Test voice and email channels separately before launching'
                            : 'Send a test to yourself before launching'}
                        
                      
                      
                        {/* Voice Test Section */}
                        {(formData.channel === 'voice' || formData.channel === 'combo') && (
                          
                            {formData.channel === 'combo' && (
                              
                                
                                Voice Channel Test
                              
                            )}
                            
                              
                                Test Phone Number
                                 setTestPhoneNumber(e.target.value)}
                                />
                              
                               handleSendTest('voice')}
                                disabled={!testPhoneNumber || isTestSending}
                                className={formData.channel === 'combo' ? "border-blue-300 hover:bg-blue-100 dark:border-blue-700" : ""}
                              >
                                {isTestingChannel === 'voice' ?  : }
                                Test Call
                              
                            
                          
                        )}

                        {/* Email Test Section */}
                        {(formData.channel === 'email' || formData.channel === 'combo') && (
                          
                            {formData.channel === 'combo' && (
                              
                                
                                Email Channel Test
                              
                            )}
                            
                              
                                Test Email Address
                                 setTestEmail(e.target.value)}
                                />
                              
                               handleSendTest('email')}
                                disabled={!testEmail || isTestSending}
                                className={formData.channel === 'combo' ? "border-green-300 hover:bg-green-100 dark:border-green-700" : ""}
                              >
                                {isTestingChannel === 'email' ?  : }
                                Test Email
                              
                            
                          
                        )}
                      
                    

                    {/* Channel Execution Configuration (Combo only) */}
                    {formData.channel === 'combo' && (
                      
                        
                          
                            
                            Channel Execution Settings
                          
                          Configure when and how each channel should be triggered independently
                        
                        
                          {/* Voice Channel Trigger */}
                          
                            
                              
                                
                                Voice Channel
                              
                              
                                 setFormData(prev => ({
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      voice: { ...prev.channelConfig.voice, enabled: checked }
                                    }
                                  }))}
                                />
                                
                                  {formData.channelConfig.voice.enabled ? 'Enabled' : 'Disabled'}
                                
                              
                            
                            {formData.channelConfig.voice.enabled && (
                              
                                Trigger Mode
                                 setFormData(prev => ({
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      voice: { ...prev.channelConfig.voice, triggerMode: v as 'immediate' | 'scheduled' | 'manual' }
                                    }
                                  }))}
                                  className="grid grid-cols-3 gap-2"
                                >
                                  
                                    
                                    
                                      
                                      Immediate
                                    
                                  
                                  
                                    
                                    
                                      
                                      Scheduled
                                    
                                  
                                  
                                    
                                    
                                      
                                      Manual
                                    
                                  
                                
                                {formData.channelConfig.voice.triggerMode === 'scheduled' && (
                                  
                                    Schedule Date & Time
                                     setFormData(prev => ({
                                        ...prev,
                                        channelConfig: {
                                          ...prev.channelConfig,
                                          voice: { ...prev.channelConfig.voice, scheduledTime: e.target.value }
                                        }
                                      }))}
                                      className="mt-1"
                                    />
                                  
                                )}
                              
                            )}
                          

                          {/* Email Channel Trigger */}
                          
                            
                              
                                
                                Email Channel
                              
                              
                                 setFormData(prev => ({
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      email: { ...prev.channelConfig.email, enabled: checked }
                                    }
                                  }))}
                                />
                                
                                  {formData.channelConfig.email.enabled ? 'Enabled' : 'Disabled'}
                                
                              
                            
                            {formData.channelConfig.email.enabled && (
                              
                                Trigger Mode
                                 setFormData(prev => ({
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      email: { ...prev.channelConfig.email, triggerMode: v as 'immediate' | 'scheduled' | 'manual' }
                                    }
                                  }))}
                                  className="grid grid-cols-3 gap-2"
                                >
                                  
                                    
                                    
                                      
                                      Immediate
                                    
                                  
                                  
                                    
                                    
                                      
                                      Scheduled
                                    
                                  
                                  
                                    
                                    
                                      
                                      Manual
                                    
                                  
                                
                                {formData.channelConfig.email.triggerMode === 'scheduled' && (
                                  
                                    Schedule Date & Time
                                     setFormData(prev => ({
                                        ...prev,
                                        channelConfig: {
                                          ...prev.channelConfig,
                                          email: { ...prev.channelConfig.email, scheduledTime: e.target.value }
                                        }
                                      }))}
                                      className="mt-1"
                                    />
                                  
                                )}
                              
                            )}
                          

                          {/* Unified Info */}
                          
                            
                            
                              Both channels share the same contact list and campaign objective. Reporting will be unified across channels.
                            
                          
                        
                      
                    )}

                    {/* Launch Configuration */}
                    
                      
                        
                          
                          Launch Configuration
                        
                      
                      
                         setLaunchStatus(v)}
                          className="grid gap-4 md:grid-cols-3"
                        >
                          
                            
                            
                              
                              Activate Now
                              
                                {formData.channel === 'combo' ? 'Start enabled channels per their trigger settings' : 'Start campaign immediately'}
                              
                            
                          

                          
                            
                            
                              
                              Pause
                              Create but do not start
                            
                          

                          
                            
                            
                              
                              Draft
                              Save for later editing
                            
                          
                        
                      
                    

                    {/* Additional Settings */}
                    
                      
                        Additional Settings (Optional)
                      
                      
                        
                          
                            Priority
                             setFormData(prev => ({ ...prev, priority: value as any }))}
                            >
                              
                                
                              
                              
                                Low
                                Normal
                                High
                                Urgent
                              
                            
                          

                          
                            Start Date
                             setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                            />
                          

                          
                            End Date
                             setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                            />
                          
                        

                        
                          Estimated Budget ($)
                           setFormData(prev => ({
                              ...prev,
                              budget: e.target.value ? parseFloat(e.target.value) : undefined
                            }))}
                          />
                        
                      
                    
                  
                
              )}
            
          
        

        {/* Footer with navigation */}
        
          {step > 1 && (
             setStep(step - 1)}
            >
              
              Back
            
          )}

          
            Step {step} of {STEPS.length}
            {/* Show missing fields message */}
            {!isStepValid(step) && getMissingFields(step).length > 0 && (
              
                
                Required: {getMissingFields(step).join(', ')}
              
            )}
          

          {step 
              
                
                  
                     setStep(step + 1)}
                      disabled={!isStepValid(step)}
                    >
                      Continue
                      
                    
                  
                
                {!isStepValid(step) && getMissingFields(step).length > 0 && (
                  
                    Please fill in: {getMissingFields(step).join(', ')}
                  
                )}
              
            
          ) : (
             createMutation.mutate()}
              disabled={createMutation.isPending}
              className="bg-gradient-to-r from-primary to-primary/80"
            >
              {createMutation.isPending ? (
                <>
                  
                  Creating...
                
              ) : (
                <>
                  
                  Submit Campaign
                
              )}
            
          )}
        
      
    
  );
}

export default CampaignCreationWizard;