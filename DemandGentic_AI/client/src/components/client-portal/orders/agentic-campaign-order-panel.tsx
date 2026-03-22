/**
 * Agentic Campaign Order Panel
 * AI-powered campaign ordering interface for client portal
 * Allows natural language campaign requests and AI-optimized order creation
 * 
 * ENHANCED: Uses organization intelligence to generate smarter recommendations
 * based on client's ICP, business profile, and previous campaign patterns.
 */
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Package, Send, Loader2, Sparkles, Target, Building2, Users,
  DollarSign, Calendar, Zap, ChevronRight, Check, AlertCircle,
  MessageSquare, Bot, ArrowRight, Globe, Phone, Mail,
  FileText, Link as LinkIcon, Upload, Plus, X, Trash2, Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useClientOrgIntelligence } from '@/hooks/use-client-org-intelligence';

interface OrderRecommendation {
  campaignType: string;
  suggestedVolume: number;
  targetAudience: {
    industries: string[];
    titles: string[];
    companySize: string;
  };
  channels: string[];
  estimatedCost: number;
  expectedResults: {
    meetings: string;
    qualifiedLeads: string;
  };
}

interface AgenticCampaignOrderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated?: () => void;
}

const CAMPAIGN_TYPES = [
  // Lead Generation Services
  { value: 'high_quality_leads', label: 'HQL - High Quality Leads', description: 'Account-aware, verified MQLs with firmographic & technographic targeting' },
  { value: 'bant_leads', label: 'BANT Qualified Leads', description: 'Budget, Authority, Need, Timeline qualified with full buying signals' },
  { value: 'sql', label: 'SQL Generation', description: 'Sales-ready leads with confirmed interest and engagement' },

  // Appointment & Meeting Services
  { value: 'appointment_generation', label: 'Appointment Setting', description: 'Direct calendar bookings with verified decision makers' },
  { value: 'lead_qualification', label: 'Lead Qualification', description: 'BANT/custom qualification of your existing contact lists' },

  // Content Syndication
  { value: 'content_syndication', label: 'Content Syndication (CS)', description: 'Gated asset distribution with double opt-in consent capture' },

  // Event & Webinar Services
  { value: 'webinar_invite', label: 'Webinar Invitation', description: 'Targeted webinar registration with attendee qualification' },
  { value: 'live_webinar', label: 'Live Webinar Promotion', description: 'Full-service live event marketing with registration management' },
  { value: 'on_demand_webinar', label: 'On-Demand Webinar', description: 'Evergreen webinar promotion with ongoing lead capture' },
  { value: 'executive_dinner', label: 'Executive Dinner', description: 'High-touch C-suite event with personalized outreach' },
  { value: 'leadership_forum', label: 'Leadership Forum', description: 'Executive roundtable with buying committee targeting' },
  { value: 'conference', label: 'Conference/Event', description: 'Trade show & conference attendee acquisition' },

  // Channel-Specific Campaigns
  { value: 'email', label: 'Email-Only Campaign', description: 'Targeted email sequences with engagement tracking' },

  // Data Services
  { value: 'data_validation', label: 'Data Validation & Enrichment', description: 'Contact verification, firmographic enrichment, and list hygiene' },
];

const DELIVERY_TIMELINES = [
  { value: 'standard', label: 'Standard (2-4 weeks)' },
  { value: '2_weeks', label: '2 Weeks' },
  { value: '1_week', label: '1 Week (+25%)' },
  { value: 'immediate', label: 'Rush (3-5 days) (+50%)' },
];

const DELIVERY_METHODS = [
  { value: 'api', label: 'API Integration', description: 'Real-time delivery via REST API', icon: 'Zap' },
  { value: 'csv', label: 'CSV Export', description: 'Downloadable CSV file delivery', icon: 'FileText' },
  { value: 'realtime_push', label: 'Real-time Push', description: 'Instant push to your CRM/system', icon: 'Zap' },
  { value: 'sftp', label: 'SFTP Transfer', description: 'Secure file transfer to your server', icon: 'Upload' },
  { value: 'email', label: 'Email Delivery', description: 'Leads delivered via secure email', icon: 'Mail' },
];

export function AgenticCampaignOrderPanel({ open, onOpenChange, onOrderCreated }: AgenticCampaignOrderPanelProps) {
  const { toast } = useToast();
  const [step, setStep] = useState('goal');
  const [goalDescription, setGoalDescription] = useState('');
  const [recommendation, setRecommendation] = useState(null);
  const [showAiReview, setShowAiReview] = useState(false);
  const [extractedDocFields, setExtractedDocFields] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Organization Intelligence - provides client context for smarter recommendations
  const { 
    data: orgIntelData, 
    isLoading: orgIntelLoading, 
    buildContextSummary, 
    getTargetingSuggestions,
    getValueProposition 
  } = useClientOrgIntelligence();

  // Context management
  const [contextUrls, setContextUrls] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  
  // Per-category upload states for better UX (no shared loading state confusion)
  type UploadCategory = 'context' | 'target_accounts' | 'suppression' | 'template';
  const [uploadingCategories, setUploadingCategories] = useState>({
    context: false,
    target_accounts: false,
    suppression: false,
    template: false,
  });
  // Backward compat: derive global isUploading from any category uploading
  const isUploading = Object.values(uploadingCategories).some(Boolean);
  
  // File states
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [targetAccountFiles, setTargetAccountFiles] = useState([]);
  const [suppressionFiles, setSuppressionFiles] = useState([]);
  const [templateFiles, setTemplateFiles] = useState([]);

  // Delivery Method state
  const [deliveryMethod, setDeliveryMethod] = useState('');
  
  // Refs
  const fileInputRef = useRef(null);
  const targetAccountsInputRef = useRef(null);
  const suppressionInputRef = useRef(null);
  const templateInputRef = useRef(null);
  
  // Order configuration
  const [campaignType, setCampaignType] = useState('high_quality_leads');
  const [volume, setVolume] = useState(100);
  const [industries, setIndustries] = useState('');
  const [jobTitles, setJobTitles] = useState('');
  const [companySizeMin, setCompanySizeMin] = useState();
  const [companySizeMax, setCompanySizeMax] = useState();
  const [geographies, setGeographies] = useState('');
  const [deliveryTimeline, setDeliveryTimeline] = useState('standard');
  const [channels, setChannels] = useState(['voice', 'email']);
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [estimatedCost, setEstimatedCost] = useState(null);
  const [pricingBreakdown, setPricingBreakdown] = useState(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch client-specific pricing
  const { data: clientPricingData } = useQuery({
    queryKey: ['client-campaign-pricing'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/campaign-pricing', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open,
  });

  const handleUrlAdd = () => {
    if (newUrl && !contextUrls.includes(newUrl)) {
      // Basic validation
      let formattedUrl = newUrl;
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = 'https://' + formattedUrl;
      }
      setContextUrls([...contextUrls, formattedUrl]);
      setNewUrl('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent, category: UploadCategory) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Generate correlation ID for tracking this upload batch
    const correlationId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Upload:${correlationId}] Starting upload for category="${category}", fileCount=${files.length}`);

    // Set per-category loading state
    setUploadingCategories(prev => ({ ...prev, [category]: true }));
    const newUploadedFiles: {name: string, key: string, type: string}[] = [];

    // Upload timeout (60s per file)
    const UPLOAD_TIMEOUT_MS = 60000;

    // Helper to create timeout-enabled fetch
    const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number): Promise => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
        }
        throw err;
      }
    };

    // Process each file (sequentially for simplicity)
    try {
      for (let i = 0; i  [...prev, ...newUploadedFiles]);
        // Auto-extract order fields from context documents (non-blocking)
        extractDocumentFields(newUploadedFiles);
      } else if (category === 'target_accounts') {
        setTargetAccountFiles(prev => [...prev, ...newUploadedFiles]);
      } else if (category === 'suppression') {
        setSuppressionFiles(prev => [...prev, ...newUploadedFiles]);
      } else if (category === 'template') {
        setTemplateFiles(prev => [...prev, ...newUploadedFiles]);
      }

      console.log(`[Upload:${correlationId}] All files uploaded successfully. Count=${newUploadedFiles.length}`);
      toast({
        title: 'Files uploaded successfully',
        description: `${newUploadedFiles.length} file(s) attached`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      console.error(`[Upload:${correlationId}] Upload failed:`, errorMessage, error);
      toast({ 
        title: 'Upload failed', 
        description: errorMessage,
        variant: 'destructive' 
      });
    } finally {
      // Clear this category's loading state
      setUploadingCategories(prev => ({ ...prev, [category]: false }));
      // Reset inputs
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (targetAccountsInputRef.current) targetAccountsInputRef.current.value = '';
      if (suppressionInputRef.current) suppressionInputRef.current.value = '';
      if (templateInputRef.current) templateInputRef.current.value = '';
    }
  };

  const removeUrl = (url: string) => {
    setContextUrls(contextUrls.filter(u => u !== url));
  };

  const removeFile = (key: string, category: 'context' | 'target_accounts' | 'suppression' | 'template') => {
    if (category === 'context') {
      setUploadedFiles(uploadedFiles.filter(f => f.key !== key));
    } else if (category === 'target_accounts') {
      setTargetAccountFiles(targetAccountFiles.filter(f => f.key !== key));
    } else if (category === 'suppression') {
      setSuppressionFiles(suppressionFiles.filter(f => f.key !== key));
    } else if (category === 'template') {
      setTemplateFiles(templateFiles.filter(f => f.key !== key));
    }
  };

  // Extract order fields from uploaded context documents using AI
  const extractDocumentFields = async (files: { name: string; key: string; type: string }[]) => {
    // Only extract from context documents (PDF, DOCX, TXT)
    const extractable = files.filter(f => {
      const ext = f.name.toLowerCase().split('.').pop() || '';
      return ['pdf', 'docx', 'doc', 'txt', 'md'].includes(ext);
    });
    if (extractable.length === 0) return;

    setIsExtracting(true);
    try {
      // Extract from first extractable document
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
          setExtractedDocFields(fields);

          // Pre-fill form fields with extracted data
          if (fields.industries?.length) {
            setIndustries(fields.industries.join(', '));
          }
          if (fields.jobTitles?.length) {
            setJobTitles(fields.jobTitles.join(', '));
          }
          if (fields.companySizeMin) {
            setCompanySizeMin(fields.companySizeMin);
          }
          if (fields.companySizeMax) {
            setCompanySizeMax(fields.companySizeMax);
          }
          if (fields.geographies?.length) {
            setGeographies(fields.geographies.join(', '));
          }

          toast({
            title: 'Document Analyzed',
            description: `Extracted targeting data from ${file.name}. Fields will be pre-filled in the next step.`,
          });
        }
      }
    } catch (err) {
      console.error('[Extract] Document extraction failed:', err);
      // Non-blocking - extraction failure shouldn't block the order flow
    } finally {
      setIsExtracting(false);
    }
  };

  // Get AI recommendation based on goal - ENHANCED with organization intelligence
  const recommendMutation = useMutation({
    mutationFn: async (goal: string) => {
      // Build organization context from intelligence
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
          // NEW: Include organization intelligence context
          organizationContext,
          organizationIntelligence: orgIntelData?.organization ? {
            identity: orgIntelData.organization.identity,
            offerings: orgIntelData.organization.offerings,
            icp: orgIntelData.organization.icp,
            positioning: orgIntelData.organization.positioning,
          } : null,
          // NEW: Include ICP-based targeting suggestions
          targetingSuggestions,
          // NEW: Include business profile info
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
        // Store the full recommendation data including rationale
        setRecommendation({
          ...data.data,
          rationale: data.data.rationale || rec.rationale || 'AI analysis complete. Please review the recommended strategy below.'
        });

        // Pre-fill form with recommendations
        const recType = rec.campaignType || 'high_quality_leads';
        setCampaignType(recType);
        // Cap high_quality_leads at 100 max
        const recVolume = rec.suggestedVolume || 100;
        setVolume(recType === 'high_quality_leads' ? Math.min(recVolume, 100) : recVolume);
        if (rec.channels) {
          setChannels(rec.channels);
        }
        setEstimatedCost(rec.estimatedCost);

        // Pre-fill targeting fields from AI recommendation if document extraction hasn't already filled them
        if (rec.targetAudience) {
          if (rec.targetAudience.industries?.length && !industries) {
            setIndustries(rec.targetAudience.industries.join(', '));
          }
          if (rec.targetAudience.titles?.length && !jobTitles) {
            setJobTitles(rec.targetAudience.titles.join(', '));
          }
          if (rec.targetAudience.companySizeMin && !companySizeMin) {
            setCompanySizeMin(rec.targetAudience.companySizeMin);
          }
          if (rec.targetAudience.companySizeMax && !companySizeMax) {
            setCompanySizeMax(rec.targetAudience.companySizeMax);
          }
        }
        if (rec.geographies?.length && !geographies) {
          setGeographies(Array.isArray(rec.geographies) ? rec.geographies.join(', ') : rec.geographies);
        }

        // CRITICAL: Show AI strategy review screen - user MUST review and approve before proceeding
        // This blocks any campaign/order creation until explicit user approval
        setShowAiReview(true);

        toast({
          title: 'Strategy Generated',
          description: 'Please review the AI-recommended strategy before proceeding.',
        });
      } else {
        toast({
          title: 'Strategy Generation Failed',
          description: 'Unable to generate strategy. Please try again with more details.',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Strategy Generation Failed',
        description: error.message || 'Failed to generate campaign strategy.',
        variant: 'destructive',
      });
    },
  });

  // Estimate cost
  const estimateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/billing/estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          volumeRequested: volume,
          campaignType,
          deliveryTimeline,
          channels,
        }),
      });
      if (!res.ok) throw new Error('Failed to estimate cost');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setEstimatedCost(data.data.estimatedCost);
        setPricingBreakdown({
          baseRate: data.data.baseRate,
          basePrice: data.data.breakdown.basePrice,
          volumeDiscountPercent: data.data.breakdown.volumeDiscountPercent || 0,
          volumeDiscount: data.data.breakdown.volumeDiscount || 0,
          rushFeePercent: data.data.breakdown.rushFeePercent || 0,
          rushFee: data.data.breakdown.rushFee || 0,
          hasCustomPricing: data.data.hasCustomPricing,
          minimumOrderSize: data.data.minimumOrderSize,
        });
      }
    },
  });

  // Create order
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const token = getToken();
      console.log('[OrderCreate] Starting order creation, token present:', !!token);
      const res = await fetch('/api/client-portal/agentic/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignType,
          industries: industries.split(',').map(i => i.trim()).filter(Boolean),
          jobTitles: jobTitles.split(',').map(t => t.trim()).filter(Boolean),
          companySizeMin,
          companySizeMax,
          geographies: geographies.split(',').map(g => g.trim()).filter(Boolean),
          volumeRequested: volume,
          deliveryTimeline,
          channels,
          specialRequirements,
          contextUrls, // Add context URLs to order
          contextFiles: uploadedFiles, // Add uploaded files to order
          targetAccountFiles,
          suppressionFiles,
          deliveryMethod: deliveryMethod || undefined,
          templateFiles
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[OrderCreate] Failed:', res.status, errorText);
        throw new Error(`Failed to create order: ${res.status} - ${errorText}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Order Created!',
          description: `Order #${data.data?.orderNumber || 'NEW'} has been submitted for review.`,
        });
        onOrderCreated?.();
        onOpenChange(false);
        resetForm();
      } else {
        toast({
          title: 'Order Failed',
          description: data.message || 'Failed to create order. Please try again.',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Order Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Clamp volume when switching to high_quality_leads
  useEffect(() => {
    if (campaignType === 'high_quality_leads' && volume > 100) {
      setVolume(100);
    }
  }, [campaignType]);

  // Recalculate estimate when key fields change
  useEffect(() => {
    if (step === 'configure' && volume > 0) {
      const timer = setTimeout(() => {
        estimateMutation.mutate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [volume, campaignType, deliveryTimeline, channels]);

  const resetForm = () => {
    setStep('goal');
    setGoalDescription('');
    setRecommendation(null);
    setCampaignType('lead_generation');
    setVolume(100);
    setIndustries('');
    setJobTitles('');
    setCompanySizeMin(undefined);
    setCompanySizeMax(undefined);
    setGeographies('');
    setDeliveryTimeline('standard');
    setChannels(['voice', 'email']);
    setSpecialRequirements('');
    setEstimatedCost(null);
    setContextUrls([]);
    setUploadedFiles([]);
    setTargetAccountFiles([]);
    setSuppressionFiles([]);
    setTemplateFiles([]);
    setDeliveryMethod('');
    setNewUrl('');
    setExtractedDocFields(null);
    setIsExtracting(false);
  };

  const handleGoalSubmit = () => {
    if (!goalDescription.trim()) return;
    recommendMutation.mutate(goalDescription);
  };

  const handleChannelToggle = (channel: string) => {
    setChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    
      
        {/* Enhanced Header */}
        
          
          
            
              
            
            
              Agentic Order Request
              
                Directly instruct agents to execute your campaign
              
            
          
        

        {/* Main Content Area with ScrollArea */}
        
          
            {/* Enhanced Progress Steps - Clickable */}
            
              
                {/* Step 1 */}
                 setStep('goal')}
                  className="flex items-center gap-3 group cursor-pointer"
                >
                  
                    {step !== 'goal' ?  : '1'}
                  
                  
                    Describe Goal
                  
                

                {/* Connector */}
                

                {/* Step 2 */}
                 recommendation && setStep('configure')}
                  className={cn("flex items-center gap-3 group", recommendation ? "cursor-pointer" : "cursor-not-allowed opacity-50")}
                  disabled={!recommendation}
                >
                  
                    {step === 'review' ?  : '2'}
                  
                  
                    Configure
                  
                

                {/* Connector */}
                

                {/* Step 3 */}
                 recommendation && setStep('review')}
                  className={cn("flex items-center gap-3 group", recommendation ? "cursor-pointer" : "cursor-not-allowed opacity-50")}
                  disabled={!recommendation}
                >
                  
                    3
                  
                  
                    Review & Submit
                  
                
              
            

          {/* Step 1: Describe Goal */}
          {step === 'goal' && (
            
              {showAiReview ? (
                
                  {/* Important Notice Banner */}
                  
                    
                    
                      Strategy Review Required
                      No campaign or order will be created until you explicitly approve this strategy and complete the configuration.
                    
                  

                  
                    
                      
                    
                    AI Strategy Analysis Complete
                    Review the AI-generated strategy below. You must approve before proceeding.
                  

                  
                    
                      
                        
                        Strategic Rationale
                      
                    
                    
                      
                        {recommendation?.rationale}
                      
                    
                  

                  
                     
                        
                          
                          Proposed Configuration
                        
                     
                     
                        
                            Campaign Type
                            {CAMPAIGN_TYPES.find(t => t.value === campaignType)?.label}
                            {CAMPAIGN_TYPES.find(t => t.value === campaignType)?.description}
                        
                        
                            Target Volume
                            {volume} Leads
                        
                         
                            Est. Timeline
                            {deliveryTimeline?.replace('_', ' ')}
                        
                         
                            Channels
                            {channels.join(' & ')}
                        
                     
                  
                  
                  
                     setShowAiReview(false)} 
                        className="h-14 px-8 border-2"
                    >
                        Refine Request
                    
                     {
                            setStep('configure');
                            setShowAiReview(false);
                        }}
                    >
                        Accept Strategy & Configure 
                    
                
               
              ) : (
                <>
              {/* Organization Intelligence Banner - Shows when org context is available */}
              {orgIntelData?.hasIntelligence && (
                
                  
                    
                      
                    
                    
                      Organization Intelligence Active
                      
                        AI recommendations will be personalized based on your ICP, value proposition, and previous campaign patterns.
                      
                      {orgIntelData.organization?.icp?.industries?.length ? (
                        
                          {orgIntelData.organization.icp.industries.slice(0, 4).map((ind: string) => (
                            
                              {ind}
                            
                          ))}
                          {orgIntelData.organization.icp.industries.length > 4 && (
                            
                              +{orgIntelData.organization.icp.industries.length - 4} more
                            
                          )}
                        
                      ) : null}
                    
                  
                
              )}

              {/* Hero Section */}
              
                
                  
                
                What would you like to achieve?
                
                  Describe your campaign goal in natural language and our AI will recommend the best approach
                  {orgIntelData?.hasIntelligence ? ' — powered by your organization intelligence.' : '.'}
                
              

              {/* Main Goal Input Card */}
              
                
                   setGoalDescription(e.target.value)}
                    placeholder="Example: I want to generate 200 qualified leads from IT directors at mid-size healthcare companies in the US who might be interested in our cybersecurity solution..."
                    className="min-h-[160px] text-base border-2 border-slate-200 focus:border-emerald-400 rounded-xl p-4 resize-none transition-all duration-200 placeholder:text-slate-400"
                  />
                
              

              {/* Context Upload Section */}
              
                
                  
                    
                    Additional Context (Optional)
                  
                  
                    Upload existing campaign briefs, suppression lists, or website URLs to help the AI understand your needs.
                  
                
                
                  
                    {/* URL Input */}
                    
                      
                        
                        Add URLs
                      
                      
                        
                          
                           setNewUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUrlAdd()}
                          />
                        
                        
                          
                        
                      
                      {/* URL List */}
                      {contextUrls.length > 0 && (
                        
                          
                            {contextUrls.map((url, idx) => (
                              
                                
                                  
                                    
                                  
                                  {url}
                                
                                 removeUrl(url)} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  
                                
                              
                            ))}
                          
                        
                      )}
                    

                    {/* File Upload */}
                    
                      
                        
                        Upload Documents
                      
                       fileInputRef.current?.click()}
                      >
                        {uploadingCategories.context ? (
                          
                        ) : (
                          
                        )}
                        {uploadingCategories.context ? 'Uploading...' : 'Upload PDF, DOCX, CSV'}
                      
                       handleFileUpload(e, 'context')}
                        accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
                      />
                      {/* File List */}
                      {uploadedFiles.length > 0 && (
                        
                          
                            {uploadedFiles.map((file, idx) => (
                              
                                
                                  
                                    
                                  
                                  {file.name}
                                
                                 removeFile(file.key, 'context')} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  
                                
                              
                            ))}
                          
                        
                      )}
                      {/* Document extraction indicator */}
                      {isExtracting && (
                        
                          
                          AI is analyzing your document to pre-fill targeting fields...
                        
                      )}
                      {extractedDocFields && !isExtracting && (
                        
                          
                          Targeting data extracted from document. Fields will be pre-filled.
                        
                      )}
                    
                  

                  

                  
                    {/* Target Account Files */}
                    
                      
                        
                        Target Accounts List (CSV/Excel)
                      
                       targetAccountsInputRef.current?.click()}
                      >
                        {uploadingCategories.target_accounts ? (
                          
                        ) : (
                          
                        )}
                        {uploadingCategories.target_accounts ? 'Uploading...' : 'Upload Target List'}
                      
                       handleFileUpload(e, 'target_accounts')}
                        accept=".csv,.xlsx,.xls"
                      />
                      {/* File List */}
                      {targetAccountFiles.length > 0 && (
                        
                          
                            {targetAccountFiles.map((file, idx) => (
                              
                                
                                  
                                    
                                  
                                  {file.name}
                                
                                 removeFile(file.key, 'target_accounts')} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  
                                
                              
                            ))}
                          
                        
                      )}
                    

                    {/* Suppression Files */}
                    
                      
                        
                        Suppression List (Optional)
                      
                       suppressionInputRef.current?.click()}
                      >
                        {uploadingCategories.suppression ? (
                          
                        ) : (
                          
                        )}
                        {uploadingCategories.suppression ? 'Uploading...' : 'Upload Do Not Contact'}
                      
                       handleFileUpload(e, 'suppression')}
                        accept=".csv,.xlsx,.xls,.txt"
                      />
                      {/* File List */}
                      {suppressionFiles.length > 0 && (
                        
                          
                            {suppressionFiles.map((file, idx) => (
                              
                                
                                  
                                    
                                  
                                  {file.name}
                                
                                 removeFile(file.key, 'suppression')} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  
                                
                              
                            ))}
                          
                        
                      )}
                    
                  

                  

                  {/* Delivery Method & Template Section */}
                  
                    {/* Delivery Method */}
                    
                      
                        
                        Preferred Delivery Method
                      
                      
                        
                          
                        
                        
                          {DELIVERY_METHODS.map(method => (
                            
                              
                                {method.label}
                                {method.description}
                              
                            
                          ))}
                        
                      
                      {deliveryMethod && (
                        
                          
                          
                            {DELIVERY_METHODS.find(m => m.value === deliveryMethod)?.label} selected
                          
                        
                      )}
                    

                    {/* Template Upload */}
                    
                      
                        
                        Email/Call Templates (Optional)
                      
                       templateInputRef.current?.click()}
                      >
                        {uploadingCategories.template ? (
                          
                        ) : (
                          
                        )}
                        {uploadingCategories.template ? 'Uploading...' : 'Upload Templates (HTML, TXT, DOCX)'}
                      
                       handleFileUpload(e, 'template')}
                        accept=".html,.htm,.txt,.doc,.docx,.pdf"
                      />
                      
                        Upload email templates, call scripts, or messaging guides
                      
                      {/* Template File List */}
                      {templateFiles.length > 0 && (
                        
                          
                            {templateFiles.map((file, idx) => (
                              
                                
                                  
                                    
                                  
                                  {file.name}
                                
                                 removeFile(file.key, 'template')} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  
                                
                              
                            ))}
                          
                        
                      )}
                    
                  
                
              

              {/* Navigation Buttons */}
              
                
                  {recommendMutation.isPending ? (
                    <>
                      
                      Analyzing Goal & Generating Strategy...
                    
                  ) : (
                    <>
                      
                      Generate AI Campaign Strategy
                    
                  )}
                
              
              
            )}
            
          )}

          {/* Step 2: Configure Order */}
          {step === 'configure' && (
            
              {/* AI Recommendation Card */}
              {recommendation?.rationale && (
                
                  
                    
                      
                        
                      
                      
                        AI Recommendation
                        {recommendation.rationale}
                      
                    
                  
                
              )}

              {/* Main Configuration Card */}
              
                
                  
                    
                    Campaign Configuration
                  
                
                
                  
                    {/* Campaign Type */}
                    
                      Campaign Type
                      
                        
                          
                        
                        
                          {CAMPAIGN_TYPES
                            .filter(type => {
                              // Filter out disabled campaign types based on client pricing
                              const clientTypeConfig = clientPricingData?.pricing?.[type.value];
                              return clientTypeConfig?.isEnabled !== false;
                            })
                            .map(type => {
                              const clientTypeConfig = clientPricingData?.pricing?.[type.value];
                              const hasCustomPrice = clientTypeConfig && clientPricingData?.hasCustomPricing;
                              return (
                                
                                  
                                    
                                      {type.label}
                                      {hasCustomPrice && (
                                        ${clientTypeConfig.pricePerLead}/lead
                                      )}
                                    
                                    {type.description}
                                  
                                
                              );
                            })}
                        
                      
                    

                    {/* Volume */}
                    
                      
                        Lead Volume: {volume}
                        {campaignType === 'high_quality_leads' && (
                          (max 100 for HQL)
                        )}
                      
                      
                         setVolume(v[0])}
                          min={25}
                          max={campaignType === 'high_quality_leads' ? 100 : 1000}
                          step={25}
                          className="mt-2"
                        />
                      
                      
                        25 leads
                        {campaignType === 'high_quality_leads' ? '100' : '1,000'} leads
                      
                    
                  

                  

                  {/* Target Industries */}
                  
                    
                      
                      Target Industries
                    
                     setIndustries(e.target.value)}
                      placeholder="Technology, Healthcare, Financial Services (comma separated)"
                      className="h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                    />
                  

                  

                  {/* Job Titles */}
                  
                    
                      
                      Target Job Titles
                    
                     setJobTitles(e.target.value)}
                      placeholder="CTO, VP of Engineering, IT Director (comma separated)"
                      className="h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                    />
                  

                  
                    {/* Company Size */}
                    
                      Company Size (Employees)
                      
                         setCompanySizeMin(e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Min"
                          className="flex-1 h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                        />
                        to
                         setCompanySizeMax(e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Max"
                          className="flex-1 h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                        />
                      
                    

                    {/* Delivery Timeline */}
                    
                      
                        
                        Delivery Timeline
                      
                      
                        
                          
                        
                        
                          {DELIVERY_TIMELINES.map(timeline => (
                            
                              {timeline.label}
                            
                          ))}
                        
                      
                    
                  

                  

                  {/* Channels */}
                  
                    Outreach Channels
                    
                       handleChannelToggle('voice')}
                      >
                         handleChannelToggle('voice')}
                          className="h-5 w-5"
                        />
                        
                          
                            
                          
                          
                            Voice Calls
                          
                        
                      
                       handleChannelToggle('email')}
                      >
                         handleChannelToggle('email')}
                          className="h-5 w-5"
                        />
                        
                          
                            
                          
                          
                            Email
                          
                        
                      
                    
                  

                  {/* Geographies */}
                  
                    
                      
                      Target Geographies
                    
                     setGeographies(e.target.value)}
                      placeholder="United States, Canada, UK (comma separated)"
                      className="h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                    />
                  

                  {/* Special Requirements */}
                  
                    
                      
                      Special Requirements (Optional)
                    
                     setSpecialRequirements(e.target.value)}
                      placeholder="Any additional requirements or preferences..."
                      className="min-h-[120px] text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors resize-none"
                    />
                  
                
              

              {/* Cost Estimate */}
              {estimatedCost !== null && (
                
                  
                    
                      
                        
                          
                        
                        
                          Estimated Cost
                          
                            {formatCurrency(pricingBreakdown?.baseRate || estimatedCost / volume)} per lead
                            {pricingBreakdown?.hasCustomPricing && (
                              Custom Pricing
                            )}
                          
                        
                      
                      
                        {formatCurrency(estimatedCost)}
                      
                    

                    {/* Pricing Breakdown */}
                    {pricingBreakdown && (
                      
                        
                          Base Price ({volume} x {formatCurrency(pricingBreakdown.baseRate)})
                          {formatCurrency(pricingBreakdown.basePrice)}
                        
                        {pricingBreakdown.volumeDiscountPercent > 0 && (
                          
                            Volume Discount ({pricingBreakdown.volumeDiscountPercent}%)
                            -{formatCurrency(pricingBreakdown.volumeDiscount)}
                          
                        )}
                        {pricingBreakdown.rushFeePercent > 0 && (
                          
                            Rush Fee ({pricingBreakdown.rushFeePercent}%)
                            +{formatCurrency(pricingBreakdown.rushFee)}
                          
                        )}
                        
                          Total
                          {formatCurrency(estimatedCost)}
                        
                      
                    )}

                    
                      {pricingBreakdown?.hasCustomPricing
                        ? 'Pricing based on your negotiated rates.'
                        : 'Standard pricing applied. Contact us for custom rates.'}
                    
                  
                
              )}

              {/* Navigation Buttons */}
              
                 setStep('goal')}
                  className="h-14 px-8 text-base border-2 rounded-xl hover:bg-slate-50 transition-all"
                >
                  
                  Back: Describe Goal
                
                 setStep('review')}
                >
                  Next: Review & Submit
                  
                
              
            
          )}

          {/* Step 3: Review & Submit */}
          {step === 'review' && (
            
              {/* Success Header */}
              
                
                  
                
                Review Your Order
                
                  Please review your campaign details before submitting.
                
              

              {/* Order Summary Card */}
              
                
                  
                    
                    Order Summary
                  
                
                
                  
                    {/* Campaign Type */}
                    
                      
                        
                        Campaign Type
                      
                      {CAMPAIGN_TYPES.find(t => t.value === campaignType)?.label}
                    

                    {/* Volume */}
                    
                      
                        
                        Volume
                      
                      {volume} leads
                    

                    {/* Target Industries */}
                    
                      
                        
                        Target Industries
                      
                      {industries || 'All industries'}
                    

                    {/* Job Titles */}
                    
                      
                        
                        Job Titles
                      
                      {jobTitles || 'All decision makers'}
                    

                    {/* Delivery Timeline */}
                    
                      
                        
                        Delivery Timeline
                      
                      {DELIVERY_TIMELINES.find(t => t.value === deliveryTimeline)?.label}
                    

                    {/* Channels */}
                    
                      
                        
                        Channels
                      
                      {channels.join(' & ')}
                    
                  

                  {/* Special Requirements */}
                  {specialRequirements && (
                    
                      
                        
                        Special Requirements
                      
                      {specialRequirements}
                    
                  )}

                  {/* Geographies */}
                  {geographies && (
                    
                      
                        
                        Target Geographies
                      
                      {geographies}
                    
                  )}

                  {/* Delivery Method */}
                  {deliveryMethod && (
                    
                      
                        
                        Delivery Method
                      
                      {DELIVERY_METHODS.find(m => m.value === deliveryMethod)?.label}
                    
                  )}

                  {/* Templates */}
                  {templateFiles.length > 0 && (
                    
                      
                        
                        Uploaded Templates
                      
                      
                        {templateFiles.map((file, idx) => (
                          
                            {file.name}
                          
                        ))}
                      
                    
                  )}
                
              

              {/* Total Cost Card */}
              
                
                
                  
                    
                      
                        
                      
                      
                        Estimated Total
                        
                          Based on {volume} leads at {estimatedCost ? formatCurrency(estimatedCost / volume) : '$--'}/lead
                        
                      
                    
                    
                      {estimatedCost ? formatCurrency(estimatedCost) : 'TBD'}
                    
                  
                
              

              {/* Navigation Buttons */}
              
                 setStep('configure')}
                  className="h-14 px-8 text-base border-2 rounded-xl hover:bg-slate-50 transition-all"
                >
                  
                  Back: Configure
                
                 createOrderMutation.mutate()}
                  disabled={createOrderMutation.isPending}
                >
                  {createOrderMutation.isPending ? (
                    <>
                      
                      Submitting Order...
                    
                  ) : (
                    <>
                      
                      Submit Order
                    
                  )}
                
              
            
          )}
          
        
      
    
  );
}

export default AgenticCampaignOrderPanel;