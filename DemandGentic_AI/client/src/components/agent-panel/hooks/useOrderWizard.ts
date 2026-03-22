import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useClientOrgIntelligence } from '@/hooks/use-client-org-intelligence';
import type { OrderStep } from './useAgentPanel';

export interface UploadedFile {
  name: string;
  key: string;
  type: string;
}

export interface OrderConfiguration {
  campaignType: string;
  volume: number;
  industries: string;
  jobTitles: string;
  companySizeMin?: number;
  companySizeMax?: number;
  geographies: string;
  deliveryTimeline: string;
  channels: string[];
  deliveryMethod: string;
  specialRequirements: string;
}

export interface PricingBreakdown {
  baseRate: number;
  basePrice: number;
  volumeDiscountPercent: number;
  volumeDiscount: number;
  rushFeePercent: number;
  rushFee: number;
  hasCustomPricing: boolean;
  minimumOrderSize: number;
  totalCost: number;
}

export interface OrderRecommendation {
  campaignType: string;
  suggestedVolume: number;
  targetAudience: {
    industries: string[];
    titles: string[];
    companySizeMin?: number;
    companySizeMax?: number;
  };
  channels: string[];
  geographies?: string[];
  deliveryTimeline?: string;
  estimatedCost: number;
  rationale: string;
  expectedResults?: {
    meetings: string;
    qualifiedLeads: string;
  };
}

export const CAMPAIGN_TYPES = [
  { value: 'high_quality_leads', label: 'HQL - High Quality Leads', description: 'Account-aware, verified MQLs' },
  { value: 'bant_leads', label: 'BANT Qualified Leads', description: 'Budget, Authority, Need, Timeline qualified' },
  { value: 'sql', label: 'SQL Generation', description: 'Sales-ready leads with confirmed interest' },
  { value: 'appointment_generation', label: 'Appointment Setting', description: 'Direct calendar bookings with decision makers' },
  { value: 'lead_qualification', label: 'Lead Qualification', description: 'BANT/custom qualification of existing lists' },
  { value: 'content_syndication', label: 'Content Syndication', description: 'Gated asset distribution' },
  { value: 'webinar_invite', label: 'Webinar Invitation', description: 'Targeted webinar registration' },
  { value: 'live_webinar', label: 'Live Webinar Promotion', description: 'Full-service live event marketing' },
  { value: 'on_demand_webinar', label: 'On-Demand Webinar', description: 'Evergreen webinar promotion' },
  { value: 'executive_dinner', label: 'Executive Dinner', description: 'High-touch C-suite events' },
  { value: 'leadership_forum', label: 'Leadership Forum', description: 'Executive roundtable events' },
  { value: 'conference', label: 'Conference/Event', description: 'Trade show attendee acquisition' },
  { value: 'email', label: 'Email-Only Campaign', description: 'Targeted email sequences' },
  { value: 'data_validation', label: 'Data Validation', description: 'Contact verification & enrichment' },
  { value: 'event_registration_digital_ungated', label: 'Event Registration (Ungated)', description: 'Click-through registrations' },
  { value: 'event_registration_digital_gated', label: 'Event Registration (Gated)', description: 'Form-based registration' },
  { value: 'in_person_event', label: 'In-Person Event', description: 'Executive dinners, conferences' },
];

export const DELIVERY_TIMELINES = [
  { value: 'standard', label: 'Standard (2-4 weeks)' },
  { value: '2_weeks', label: '2 Weeks' },
  { value: '1_week', label: '1 Week (+25%)' },
  { value: 'immediate', label: 'Rush (3-5 days) (+50%)' },
];

export const DELIVERY_METHODS = [
  { value: 'api', label: 'API Integration' },
  { value: 'csv', label: 'CSV Export' },
  { value: 'realtime_push', label: 'Real-time Push' },
  { value: 'sftp', label: 'SFTP Transfer' },
  { value: 'email', label: 'Email Delivery' },
];

type UploadCategory = 'context' | 'target_accounts' | 'suppression' | 'template';

const getToken = () => localStorage.getItem('clientPortalToken');

export function useOrderWizard(
  isActive: boolean,
  onStepChange?: (step: OrderStep) => void,
) {
  const { toast } = useToast();
  const {
    data: orgIntelData,
    isLoading: orgIntelLoading,
    buildContextSummary,
    getTargetingSuggestions,
  } = useClientOrgIntelligence();

  // Form state
  const [goalDescription, setGoalDescription] = useState('');
  const [recommendation, setRecommendation] = useState(null);
  const [config, setConfig] = useState({
    campaignType: 'high_quality_leads',
    volume: 100,
    industries: '',
    jobTitles: '',
    geographies: '',
    deliveryTimeline: 'standard',
    channels: ['voice', 'email'],
    deliveryMethod: '',
    specialRequirements: '',
  });
  const [pricing, setPricing] = useState(null);
  const [showAiReview, setShowAiReview] = useState(false);

  // File upload state
  const [contextUrls, setContextUrls] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [targetAccountFiles, setTargetAccountFiles] = useState([]);
  const [suppressionFiles, setSuppressionFiles] = useState([]);
  const [templateFiles, setTemplateFiles] = useState([]);
  const [uploadingCategories, setUploadingCategories] = useState>({
    context: false, target_accounts: false, suppression: false, template: false,
  });
  const isUploading = Object.values(uploadingCategories).some(Boolean);
  const [isExtracting, setIsExtracting] = useState(false);

  // Refs for file inputs
  const fileInputRef = useRef(null);
  const targetAccountsInputRef = useRef(null);
  const suppressionInputRef = useRef(null);
  const templateInputRef = useRef(null);

  // Client-specific pricing
  const { data: clientPricingData } = useQuery({
    queryKey: ['client-campaign-pricing'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/campaign-pricing', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isActive,
  });

  // Clamp HQL volume
  useEffect(() => {
    if (config.campaignType === 'high_quality_leads' && config.volume > 100) {
      setConfig(prev => ({ ...prev, volume: 100 }));
    }
  }, [config.campaignType, config.volume]);

  // Extract document fields
  const extractDocumentFields = useCallback(async (files: UploadedFile[]) => {
    const extractable = files.filter(f => {
      const ext = f.name.toLowerCase().split('.').pop() || '';
      return ['pdf', 'docx', 'doc', 'txt', 'md'].includes(ext);
    });
    if (extractable.length === 0) return;

    setIsExtracting(true);
    try {
      const file = extractable[0];
      const res = await fetch('/api/client-portal/agentic/orders/extract-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          fileKey: file.key,
          fileName: file.name,
          fileType: file.type,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.extractedFields) {
          const fields = data.data.extractedFields;
          setConfig(prev => ({
            ...prev,
            ...(fields.industries?.length && !prev.industries && { industries: fields.industries.join(', ') }),
            ...(fields.jobTitles?.length && !prev.jobTitles && { jobTitles: fields.jobTitles.join(', ') }),
            ...(fields.companySizeMin && !prev.companySizeMin && { companySizeMin: fields.companySizeMin }),
            ...(fields.companySizeMax && !prev.companySizeMax && { companySizeMax: fields.companySizeMax }),
            ...(fields.geographies?.length && !prev.geographies && { geographies: fields.geographies.join(', ') }),
          }));

          toast({
            title: 'Document Analyzed',
            description: `Extracted targeting data from ${file.name}`,
          });
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setIsExtracting(false);
    }
  }, [toast]);

  // File upload handler
  const handleFileUpload = useCallback(async (
    e: React.ChangeEvent,
    category: UploadCategory,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingCategories(prev => ({ ...prev, [category]: true }));
    const newFiles: UploadedFile[] = [];

    try {
      for (let i = 0; i  [...prev, ...newFiles]);

      if (category === 'context') extractDocumentFields(newFiles);

      toast({ title: 'Files uploaded', description: `${newFiles.length} file(s) attached` });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setUploadingCategories(prev => ({ ...prev, [category]: false }));
      [fileInputRef, targetAccountsInputRef, suppressionInputRef, templateInputRef].forEach(ref => {
        if (ref.current) ref.current.value = '';
      });
    }
  }, [toast, extractDocumentFields]);

  const removeFile = useCallback((key: string, category: UploadCategory) => {
    const setter = category === 'context' ? setUploadedFiles
      : category === 'target_accounts' ? setTargetAccountFiles
      : category === 'suppression' ? setSuppressionFiles
      : setTemplateFiles;
    setter(prev => prev.filter(f => f.key !== key));
  }, []);

  const addUrl = useCallback((url: string) => {
    let formatted = url;
    if (!/^https?:\/\//i.test(formatted)) formatted = 'https://' + formatted;
    setContextUrls(prev => prev.includes(formatted) ? prev : [...prev, formatted]);
  }, []);

  const removeUrl = useCallback((url: string) => {
    setContextUrls(prev => prev.filter(u => u !== url));
  }, []);

  // AI recommendation
  const recommendMutation = useMutation({
    mutationFn: async (goal: string) => {
      const organizationContext = buildContextSummary();
      const targetingSuggestions = getTargetingSuggestions();

      const res = await fetch('/api/client-portal/agentic/orders/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          goal,
          contextUrls,
          contextFiles: uploadedFiles,
          organizationContext,
          organizationIntelligence: orgIntelData?.organization ? {
            identity: orgIntelData.organization.identity,
            offerings: orgIntelData.organization.offerings,
            icp: orgIntelData.organization.icp,
            positioning: orgIntelData.organization.positioning,
          } : null,
          targetingSuggestions,
          businessProfile: orgIntelData?.businessProfile ? {
            name: orgIntelData.businessProfile.legalBusinessName,
            dbaName: orgIntelData.businessProfile.dbaName,
            website: orgIntelData.businessProfile.website,
          } : null,
        }),
      });
      if (!res.ok) throw new Error('Failed to get recommendations');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data?.recommendation) {
        const rec = data.data.recommendation;
        const recObj: OrderRecommendation = {
          campaignType: rec.campaignType || 'high_quality_leads',
          suggestedVolume: rec.suggestedVolume || 100,
          targetAudience: rec.targetAudience || { industries: [], titles: [] },
          channels: rec.channels || ['voice', 'email'],
          geographies: rec.geographies,
          deliveryTimeline: rec.deliveryTimeline,
          estimatedCost: rec.estimatedCost || 0,
          rationale: data.data.rationale || rec.rationale || 'AI analysis complete.',
          expectedResults: rec.expectedResults,
        };
        setRecommendation(recObj);

        const recType = recObj.campaignType;
        const recVolume = recType === 'high_quality_leads'
          ? Math.min(recObj.suggestedVolume, 100)
          : recObj.suggestedVolume;

        setConfig(prev => ({
          ...prev,
          campaignType: recType,
          volume: recVolume,
          channels: recObj.channels,
          ...(recObj.targetAudience.industries?.length && !prev.industries && {
            industries: recObj.targetAudience.industries.join(', '),
          }),
          ...(recObj.targetAudience.titles?.length && !prev.jobTitles && {
            jobTitles: recObj.targetAudience.titles.join(', '),
          }),
          ...(recObj.targetAudience.companySizeMin && !prev.companySizeMin && {
            companySizeMin: recObj.targetAudience.companySizeMin,
          }),
          ...(recObj.targetAudience.companySizeMax && !prev.companySizeMax && {
            companySizeMax: recObj.targetAudience.companySizeMax,
          }),
          ...(recObj.geographies?.length && !prev.geographies && {
            geographies: Array.isArray(recObj.geographies) ? recObj.geographies.join(', ') : recObj.geographies,
          }),
        }));

        setShowAiReview(true);
        onStepChange?.('strategy_review');
        toast({ title: 'Strategy Generated', description: 'Review the AI-recommended strategy.' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Strategy Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Cost estimation
  const estimateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/billing/estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          volumeRequested: config.volume,
          campaignType: config.campaignType,
          deliveryTimeline: config.deliveryTimeline,
          channels: config.channels,
        }),
      });
      if (!res.ok) throw new Error('Failed to estimate cost');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPricing({
          baseRate: data.data.baseRate,
          basePrice: data.data.breakdown.basePrice,
          volumeDiscountPercent: data.data.breakdown.volumeDiscountPercent || 0,
          volumeDiscount: data.data.breakdown.volumeDiscount || 0,
          rushFeePercent: data.data.breakdown.rushFeePercent || 0,
          rushFee: data.data.breakdown.rushFee || 0,
          hasCustomPricing: data.data.hasCustomPricing,
          minimumOrderSize: data.data.minimumOrderSize,
          totalCost: data.data.estimatedCost,
        });
      }
    },
  });

  // Auto-estimate on config changes when on configure step
  useEffect(() => {
    if (!isActive || config.volume  estimateMutation.mutate(), 500);
    return () => clearTimeout(timer);
  }, [config.volume, config.campaignType, config.deliveryTimeline, config.channels, isActive]);

  // Create order
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          campaignType: config.campaignType,
          industries: config.industries.split(',').map(i => i.trim()).filter(Boolean),
          jobTitles: config.jobTitles.split(',').map(t => t.trim()).filter(Boolean),
          companySizeMin: config.companySizeMin,
          companySizeMax: config.companySizeMax,
          geographies: config.geographies.split(',').map(g => g.trim()).filter(Boolean),
          volumeRequested: config.volume,
          deliveryTimeline: config.deliveryTimeline,
          channels: config.channels,
          specialRequirements: config.specialRequirements,
          contextUrls,
          contextFiles: uploadedFiles,
          targetAccountFiles,
          suppressionFiles,
          deliveryMethod: config.deliveryMethod || undefined,
          templateFiles,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create order: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Order Created!',
          description: `Order #${data.data?.orderNumber || 'NEW'} submitted for review.`,
        });
        onStepChange?.('submitted');
      } else {
        toast({ title: 'Order Failed', description: data.message, variant: 'destructive' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Order Failed', description: error.message, variant: 'destructive' });
    },
  });

  const updateConfig = useCallback((updates: Partial) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const submitGoal = useCallback((goal: string) => {
    setGoalDescription(goal);
    recommendMutation.mutate(goal);
  }, [recommendMutation]);

  const approveStrategy = useCallback(() => {
    setShowAiReview(false);
    onStepChange?.('configure');
  }, [onStepChange]);

  const submitOrder = useCallback(() => {
    createOrderMutation.mutate();
  }, [createOrderMutation]);

  const reset = useCallback(() => {
    setGoalDescription('');
    setRecommendation(null);
    setConfig({
      campaignType: 'high_quality_leads',
      volume: 100,
      industries: '',
      jobTitles: '',
      geographies: '',
      deliveryTimeline: 'standard',
      channels: ['voice', 'email'],
      deliveryMethod: '',
      specialRequirements: '',
    });
    setPricing(null);
    setShowAiReview(false);
    setContextUrls([]);
    setUploadedFiles([]);
    setTargetAccountFiles([]);
    setSuppressionFiles([]);
    setTemplateFiles([]);
  }, []);

  return {
    // State
    goalDescription,
    recommendation,
    config,
    pricing,
    showAiReview,
    orgIntelData,
    orgIntelLoading,
    clientPricingData,
    isExtracting,

    // Files
    contextUrls,
    uploadedFiles,
    targetAccountFiles,
    suppressionFiles,
    templateFiles,
    isUploading,
    uploadingCategories,
    fileInputRef,
    targetAccountsInputRef,
    suppressionInputRef,
    templateInputRef,

    // Loading states
    isRecommending: recommendMutation.isPending,
    isEstimating: estimateMutation.isPending,
    isCreatingOrder: createOrderMutation.isPending,

    // Actions
    setGoalDescription,
    submitGoal,
    approveStrategy,
    updateConfig,
    submitOrder,
    reset,
    handleFileUpload,
    removeFile,
    addUrl,
    removeUrl,
  };
}