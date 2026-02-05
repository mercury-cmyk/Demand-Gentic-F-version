/**
 * Agentic Campaign Order Panel
 * AI-powered campaign ordering interface for client portal
 * Allows natural language campaign requests and AI-optimized order creation
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
  MessageSquare, Bot, Lightbulb, ArrowRight, Globe, Phone, Mail,
  FileText, Link as LinkIcon, Upload, Plus, X, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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
  { value: 'combo', label: 'Multi-Channel (Voice + Email)', description: 'Coordinated voice and email sequences for maximum reach' },
  { value: 'call', label: 'Voice-Only Campaign', description: 'Dedicated telemarketing with live agent conversations' },
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

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Financial Services', 'Manufacturing',
  'Retail', 'Professional Services', 'Education', 'Government',
  'Real Estate', 'Energy', 'Telecommunications', 'Other'
];

export function AgenticCampaignOrderPanel({ open, onOpenChange, onOrderCreated }: AgenticCampaignOrderPanelProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'goal' | 'configure' | 'review'>('goal');
  const [goalDescription, setGoalDescription] = useState('');
  const [recommendation, setRecommendation] = useState<any>(null);

  // Context management
  const [contextUrls, setContextUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // File states
  const [uploadedFiles, setUploadedFiles] = useState<{name: string, key: string, type: string}[]>([]);
  const [targetAccountFiles, setTargetAccountFiles] = useState<{name: string, key: string, type: string}[]>([]);
  const [suppressionFiles, setSuppressionFiles] = useState<{name: string, key: string, type: string}[]>([]);
  const [templateFiles, setTemplateFiles] = useState<{name: string, key: string, type: string}[]>([]);

  // Delivery Method state
  const [deliveryMethod, setDeliveryMethod] = useState<string>('');
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetAccountsInputRef = useRef<HTMLInputElement>(null);
  const suppressionInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  
  // Order configuration
  const [campaignType, setCampaignType] = useState('high_quality_leads');
  const [volume, setVolume] = useState(100);
  const [industries, setIndustries] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState('');
  const [companySizeMin, setCompanySizeMin] = useState<number | undefined>();
  const [companySizeMax, setCompanySizeMax] = useState<number | undefined>();
  const [geographies, setGeographies] = useState('');
  const [deliveryTimeline, setDeliveryTimeline] = useState('standard');
  const [channels, setChannels] = useState<string[]>(['voice', 'email']);
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: 'context' | 'target_accounts' | 'suppression' | 'template') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newUploadedFiles: {name: string, key: string, type: string}[] = [];

    // Process each file (sequentially for simplicity)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 1. Get presigned URL
        const res = await fetch('/api/s3/upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            folder: category === 'context' ? 'campaign-orders' : `campaign-orders/${category}`
          }),
        });

        if (!res.ok) throw new Error(`Failed to get upload URL for ${file.name}`);
        const { url, key } = await res.json();

        // 2. Upload to S3
        const uploadRes = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadRes.ok) throw new Error(`Failed to upload ${file.name}`);

        newUploadedFiles.push({
          name: file.name,
          key: key,
          type: file.type
        });
      }
      
      if (category === 'context') {
        setUploadedFiles(prev => [...prev, ...newUploadedFiles]);
      } else if (category === 'target_accounts') {
        setTargetAccountFiles(prev => [...prev, ...newUploadedFiles]);
      } else if (category === 'suppression') {
        setSuppressionFiles(prev => [...prev, ...newUploadedFiles]);
      } else if (category === 'template') {
        setTemplateFiles(prev => [...prev, ...newUploadedFiles]);
      }

      toast({ title: 'Files uploaded successfully' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Upload failed', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
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

  // Get AI recommendation based on goal
  const recommendMutation = useMutation({
    mutationFn: async (goal: string) => {
      const res = await fetch('/api/client-portal/agentic/orders/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ 
          goal,
          contextUrls, // Add context URLs
          contextFiles: uploadedFiles // Add uploaded files
        }),
      });
      if (!res.ok) throw new Error('Failed to get recommendations');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data?.recommendation) {
        const rec = data.data.recommendation;
        setRecommendation(data.data);
        
        // Pre-fill form with recommendations
        setCampaignType(rec.campaignType || 'lead_generation');
        setVolume(rec.suggestedVolume || 100);
        if (rec.targetAudience?.industries) {
          setIndustries(rec.targetAudience.industries);
        }
        if (rec.targetAudience?.titles) {
          setJobTitles(rec.targetAudience.titles.join(', '));
        }
        if (rec.channels) {
          setChannels(rec.channels);
        }
        setEstimatedCost(rec.estimatedCost);
        setStep('configure');
      }
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
          industries,
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
    setIndustries([]);
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
  };

  const handleGoalSubmit = () => {
    if (!goalDescription.trim()) return;
    recommendMutation.mutate(goalDescription);
  };

  const handleIndustryToggle = (industry: string) => {
    setIndustries(prev =>
      prev.includes(industry)
        ? prev.filter(i => i !== industry)
        : [...prev, industry]
    );
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[95vh] max-h-[900px] p-0 overflow-hidden flex flex-col bg-gradient-to-br from-slate-50 to-white">
        {/* Enhanced Header */}
        <DialogHeader className="px-8 py-6 border-b bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl shadow-lg">
              <Package className="h-8 w-8" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-white tracking-tight">Agentic Order Request</DialogTitle>
              <DialogDescription className="text-emerald-100 text-base mt-1">
                Directly instruct agents to execute your campaign
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Main Content Area with ScrollArea */}
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="px-8 py-8">
            {/* Enhanced Progress Steps - Clickable */}
            <div className="flex items-center justify-center mb-10">
              <div className="flex items-center bg-white rounded-2xl shadow-lg border border-slate-100 px-8 py-4">
                {/* Step 1 */}
                <button
                  type="button"
                  onClick={() => setStep('goal')}
                  className="flex items-center gap-3 group cursor-pointer"
                >
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center text-base font-bold transition-all duration-300 shadow-md group-hover:scale-105",
                    step === 'goal'
                      ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-emerald-200"
                      : "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200"
                  )}>
                    {step !== 'goal' ? <Check className="h-5 w-5" /> : '1'}
                  </div>
                  <span className={cn(
                    "text-base font-medium transition-colors hidden sm:block",
                    step === 'goal' ? "text-emerald-700" : "text-slate-500 group-hover:text-emerald-600"
                  )}>
                    Describe Goal
                  </span>
                </button>

                {/* Connector */}
                <div className={cn(
                  "w-16 h-1 mx-4 rounded-full transition-colors duration-300",
                  step !== 'goal' ? "bg-emerald-400" : "bg-slate-200"
                )} />

                {/* Step 2 */}
                <button
                  type="button"
                  onClick={() => setStep('configure')}
                  className="flex items-center gap-3 group cursor-pointer"
                >
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center text-base font-bold transition-all duration-300 shadow-md group-hover:scale-105",
                    step === 'configure'
                      ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-emerald-200"
                      : step === 'review'
                        ? "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200"
                        : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                  )}>
                    {step === 'review' ? <Check className="h-5 w-5" /> : '2'}
                  </div>
                  <span className={cn(
                    "text-base font-medium transition-colors hidden sm:block",
                    step === 'configure' ? "text-emerald-700" : "text-slate-500 group-hover:text-emerald-600"
                  )}>
                    Configure
                  </span>
                </button>

                {/* Connector */}
                <div className={cn(
                  "w-16 h-1 mx-4 rounded-full transition-colors duration-300",
                  step === 'review' ? "bg-emerald-400" : "bg-slate-200"
                )} />

                {/* Step 3 */}
                <button
                  type="button"
                  onClick={() => setStep('review')}
                  className="flex items-center gap-3 group cursor-pointer"
                >
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center text-base font-bold transition-all duration-300 shadow-md group-hover:scale-105",
                    step === 'review'
                      ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-emerald-200"
                      : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                  )}>
                    3
                  </div>
                  <span className={cn(
                    "text-base font-medium transition-colors hidden sm:block",
                    step === 'review' ? "text-emerald-700" : "text-slate-500 group-hover:text-emerald-600"
                  )}>
                    Review & Submit
                  </span>
                </button>
              </div>
            </div>

          {/* Step 1: Describe Goal */}
          {step === 'goal' && (
            <div className="space-y-8 max-w-4xl mx-auto">
              {/* Hero Section */}
              <div className="text-center mb-8">
                <div className="inline-flex p-4 bg-gradient-to-br from-emerald-100 to-green-100 rounded-2xl mb-5 shadow-lg shadow-emerald-100/50">
                  <Sparkles className="h-10 w-10 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-3">What would you like to achieve?</h3>
                <p className="text-slate-500 max-w-xl mx-auto text-base leading-relaxed">
                  Describe your campaign goal in natural language and our AI will recommend the best approach.
                </p>
              </div>

              {/* Main Goal Input Card */}
              <Card className="border-2 border-slate-200 shadow-xl shadow-slate-100/50 overflow-hidden">
                <CardContent className="p-6">
                  <Textarea
                    value={goalDescription}
                    onChange={(e) => setGoalDescription(e.target.value)}
                    placeholder="Example: I want to generate 200 qualified leads from IT directors at mid-size healthcare companies in the US who might be interested in our cybersecurity solution..."
                    className="min-h-[160px] text-base border-2 border-slate-200 focus:border-emerald-400 rounded-xl p-4 resize-none transition-all duration-200 placeholder:text-slate-400"
                  />

                  {/* Quick Examples - Showcasing Capabilities */}
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-4">
                      <Lightbulb className="h-5 w-5 text-amber-500" />
                      <span className="text-sm font-semibold text-slate-700">Quick Examples — Click to populate:</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* ABM + Technographic Targeting */}
                      <button
                        type="button"
                        className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all duration-200 group"
                        onClick={() => setGoalDescription("I need 100 qualified leads from Manager-level and above IT professionals at technology companies with 500+ employees and $500M+ in revenue, using AWS or Azure cloud infrastructure, within SIC codes 7370-7379 (Computer Programming & Data Processing), located in North America, focusing on the San Francisco Bay Area and Seattle metro regions.")}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                            <Building2 className="h-4 w-4 text-blue-600" />
                          </div>
                          <span className="font-semibold text-slate-800">ABM + Technographic Targeting</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Account-aware outreach with firmographic filters (revenue, employees), technology stack targeting (AWS/Azure), SIC/NAICS codes, and geo-targeting by metro area.
                        </p>
                      </button>

                      {/* Content Syndication Campaign */}
                      <button
                        type="button"
                        className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 transition-all duration-200 group"
                        onClick={() => setGoalDescription("Run a content syndication campaign to generate 200 MQLs from C-suite and VP-level executives in Financial Services and Insurance sectors (NAICS 52), targeting companies with $1B+ revenue that use Salesforce CRM. Distribute our whitepaper on 'AI in Risk Management' with double opt-in consent, focusing on East Coast US and UK markets.")}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                            <FileText className="h-4 w-4 text-purple-600" />
                          </div>
                          <span className="font-semibold text-slate-800">Content Syndication (CS)</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Whitepaper/asset distribution with MQL generation, seniority targeting, industry NAICS codes, CRM tech stack filtering, and multi-region reach.
                        </p>
                      </button>

                      {/* Contact-Aware Outreach */}
                      <button
                        type="button"
                        className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-teal-400 hover:bg-teal-50/50 transition-all duration-200 group"
                        onClick={() => setGoalDescription("Execute contact-aware multi-touch outreach to 150 pre-qualified contacts from our uploaded TAL (Target Account List). Focus on Directors and above in IT Security, DevOps, and Cloud Architecture roles at Healthcare and Pharma companies (NAICS 621-623) with 1000-5000 employees. Use BANT qualification criteria and coordinate voice + email sequences.")}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 bg-teal-100 rounded-lg group-hover:bg-teal-200 transition-colors">
                            <Users className="h-4 w-4 text-teal-600" />
                          </div>
                          <span className="font-semibold text-slate-800">Contact-Aware Multi-Touch</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Personalized outreach using your TAL, job function targeting, BANT qualification, employee count ranges, and coordinated voice + email cadence.
                        </p>
                      </button>

                      {/* Event/Webinar Registration */}
                      <button
                        type="button"
                        className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 transition-all duration-200 group"
                        onClick={() => setGoalDescription("Drive 75 qualified webinar registrations for our upcoming 'Cloud Security Best Practices' event. Target Security Engineers, IT Managers, and CISOs at mid-market companies (200-2000 employees, $50M-$500M revenue) in Manufacturing and Retail sectors using any major cloud provider (AWS, GCP, Azure). Include suppression against our existing customer database and past event attendees.")}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
                            <Calendar className="h-4 w-4 text-amber-600" />
                          </div>
                          <span className="font-semibold text-slate-800">Event Registration + Suppression</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Webinar/event signups with multi-title targeting, revenue ranges, technology install base filtering, and suppression list integration.
                        </p>
                      </button>

                      {/* Demo Booking Campaign */}
                      <button
                        type="button"
                        className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-rose-400 hover:bg-rose-50/50 transition-all duration-200 group"
                        onClick={() => setGoalDescription("Book 50 product demo meetings with VP of Engineering, CTO, and Technical Architects at SaaS companies with $10M-$100M ARR, 50-500 employees, currently using legacy on-premise infrastructure looking to modernize. Target postal codes within 50 miles of Austin, Denver, and Portland tech hubs. Qualify for budget authority and 6-month purchase timeline.")}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 bg-rose-100 rounded-lg group-hover:bg-rose-200 transition-colors">
                            <Target className="h-4 w-4 text-rose-600" />
                          </div>
                          <span className="font-semibold text-slate-800">Demo Booking + Postal Targeting</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Meeting scheduling with ARR-based targeting, employee ranges, postal radius targeting, intent signals, and timeline qualification.
                        </p>
                      </button>

                      {/* Full ABM Program */}
                      <button
                        type="button"
                        className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all duration-200 group"
                        onClick={() => setGoalDescription("Launch a full ABM program targeting our uploaded list of 500 named accounts in the Fortune 1000. Need contact-level intelligence for Procurement, IT, and Finance buying committee members (Director+). Prioritize accounts showing intent signals for 'enterprise software', 'digital transformation', and 'cloud migration'. Deliver account-aware personalized outreach with company-specific pain points and use case mapping.")}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
                            <Sparkles className="h-4 w-4 text-indigo-600" />
                          </div>
                          <span className="font-semibold text-slate-800">Full ABM Program</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Named account targeting, buying committee mapping, intent data integration, account-aware personalization, and multi-stakeholder engagement.
                        </p>
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-4 text-center">
                      These examples showcase our targeting capabilities. Combine any filters: firmographics, technographics, intent data, geography, and more.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Context Upload Section */}
              <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-600" />
                    Additional Context (Optional)
                  </CardTitle>
                  <CardDescription className="text-slate-500">
                    Upload existing campaign briefs, suppression lists, or website URLs to help the AI understand your needs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* URL Input */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <LinkIcon className="h-4 w-4" />
                        Add URLs
                      </Label>
                      <div className="flex gap-3">
                        <div className="relative flex-1">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <Input
                            placeholder="https://example.com/landing-page"
                            className="pl-11 h-12 text-base border-2 border-slate-200 focus:border-emerald-400 rounded-xl transition-all"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUrlAdd()}
                          />
                        </div>
                        <Button
                          size="lg"
                          variant="secondary"
                          onClick={handleUrlAdd}
                          className="h-12 w-12 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
                        >
                          <Plus className="h-5 w-5" />
                        </Button>
                      </div>
                      {/* URL List */}
                      {contextUrls.length > 0 && (
                        <ScrollArea className="max-h-[120px] mt-3">
                          <div className="space-y-2">
                            {contextUrls.map((url, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-white p-3 rounded-xl border-2 border-slate-100 shadow-sm group hover:border-emerald-200 transition-all">
                                <div className="flex items-center gap-3 truncate">
                                  <div className="p-1.5 bg-blue-100 rounded-lg">
                                    <Globe className="h-4 w-4 text-blue-600" />
                                  </div>
                                  <span className="truncate text-slate-600">{url}</span>
                                </div>
                                <button onClick={() => removeUrl(url)} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>

                    {/* File Upload */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Upload Documents
                      </Label>
                      <Button
                        variant="outline"
                        className="w-full h-12 justify-start text-slate-500 border-2 border-dashed border-slate-300 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-all"
                        disabled={isUploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {isUploading ? (
                          <Loader2 className="h-5 w-5 mr-3 animate-spin text-emerald-600" />
                        ) : (
                          <Upload className="h-5 w-5 mr-3 text-emerald-600" />
                        )}
                        <span className="text-base">{isUploading ? 'Uploading...' : 'Upload PDF, DOCX, CSV'}</span>
                      </Button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={(e) => handleFileUpload(e, 'context')}
                        accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
                      />
                      {/* File List */}
                      {uploadedFiles.length > 0 && (
                        <ScrollArea className="max-h-[120px] mt-3">
                          <div className="space-y-2">
                            {uploadedFiles.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-white p-3 rounded-xl border-2 border-slate-100 shadow-sm group hover:border-emerald-200 transition-all">
                                <div className="flex items-center gap-3 truncate">
                                  <div className="p-1.5 bg-orange-100 rounded-lg">
                                    <FileText className="h-4 w-4 text-orange-600" />
                                  </div>
                                  <span className="truncate text-slate-600">{file.name}</span>
                                </div>
                                <button onClick={() => removeFile(file.key, 'context')} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Target Account Files */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Target Accounts List (CSV/Excel)
                      </Label>
                      <Button
                        variant="outline"
                        className="w-full h-12 justify-start text-slate-500 border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-all"
                        disabled={isUploading}
                        onClick={() => targetAccountsInputRef.current?.click()}
                      >
                        {isUploading ? (
                          <Loader2 className="h-5 w-5 mr-3 animate-spin text-blue-600" />
                        ) : (
                          <Target className="h-5 w-5 mr-3 text-blue-600" />
                        )}
                        <span className="text-base">{isUploading ? 'Uploading...' : 'Upload Target List'}</span>
                      </Button>
                      <input
                        type="file"
                        ref={targetAccountsInputRef}
                        className="hidden"
                        multiple
                        onChange={(e) => handleFileUpload(e, 'target_accounts')}
                        accept=".csv,.xlsx,.xls"
                      />
                      {/* File List */}
                      {targetAccountFiles.length > 0 && (
                        <ScrollArea className="max-h-[120px] mt-3">
                          <div className="space-y-2">
                            {targetAccountFiles.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-white p-3 rounded-xl border-2 border-slate-100 shadow-sm group hover:border-blue-200 transition-all">
                                <div className="flex items-center gap-3 truncate">
                                  <div className="p-1.5 bg-blue-100 rounded-lg">
                                    <FileText className="h-4 w-4 text-blue-600" />
                                  </div>
                                  <span className="truncate text-slate-600">{file.name}</span>
                                </div>
                                <button onClick={() => removeFile(file.key, 'target_accounts')} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>

                    {/* Suppression Files */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Suppression List (Optional)
                      </Label>
                      <Button
                        variant="outline"
                        className="w-full h-12 justify-start text-slate-500 border-2 border-dashed border-slate-300 rounded-xl hover:border-red-400 hover:bg-red-50/50 transition-all"
                        disabled={isUploading}
                        onClick={() => suppressionInputRef.current?.click()}
                      >
                        {isUploading ? (
                          <Loader2 className="h-5 w-5 mr-3 animate-spin text-red-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 mr-3 text-red-500" />
                        )}
                        <span className="text-base">{isUploading ? 'Uploading...' : 'Upload Do Not Contact'}</span>
                      </Button>
                      <input
                        type="file"
                        ref={suppressionInputRef}
                        className="hidden"
                        multiple
                        onChange={(e) => handleFileUpload(e, 'suppression')}
                        accept=".csv,.xlsx,.xls,.txt"
                      />
                      {/* File List */}
                      {suppressionFiles.length > 0 && (
                        <ScrollArea className="max-h-[120px] mt-3">
                          <div className="space-y-2">
                            {suppressionFiles.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-white p-3 rounded-xl border-2 border-slate-100 shadow-sm group hover:border-red-200 transition-all">
                                <div className="flex items-center gap-3 truncate">
                                  <div className="p-1.5 bg-red-100 rounded-lg">
                                    <FileText className="h-4 w-4 text-red-600" />
                                  </div>
                                  <span className="truncate text-slate-600">{file.name}</span>
                                </div>
                                <button onClick={() => removeFile(file.key, 'suppression')} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  </div>

                  <Separator className="my-4" />

                  {/* Delivery Method & Template Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Delivery Method */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Preferred Delivery Method
                      </Label>
                      <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                        <SelectTrigger className="h-12 text-base border-2 border-slate-200 rounded-xl hover:border-emerald-300 transition-colors">
                          <SelectValue placeholder="Select how you want leads delivered" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {DELIVERY_METHODS.map(method => (
                            <SelectItem key={method.value} value={method.value} className="py-3">
                              <div className="flex flex-col">
                                <span className="font-medium">{method.label}</span>
                                <span className="text-xs text-slate-500">{method.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {deliveryMethod && (
                        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                          <Check className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm text-emerald-700">
                            {DELIVERY_METHODS.find(m => m.value === deliveryMethod)?.label} selected
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Template Upload */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email/Call Templates (Optional)
                      </Label>
                      <Button
                        variant="outline"
                        className="w-full h-12 justify-start text-slate-500 border-2 border-dashed border-slate-300 rounded-xl hover:border-purple-400 hover:bg-purple-50/50 transition-all"
                        disabled={isUploading}
                        onClick={() => templateInputRef.current?.click()}
                      >
                        {isUploading ? (
                          <Loader2 className="h-5 w-5 mr-3 animate-spin text-purple-600" />
                        ) : (
                          <FileText className="h-5 w-5 mr-3 text-purple-600" />
                        )}
                        <span className="text-base">{isUploading ? 'Uploading...' : 'Upload Templates (HTML, TXT, DOCX)'}</span>
                      </Button>
                      <input
                        type="file"
                        ref={templateInputRef}
                        className="hidden"
                        multiple
                        onChange={(e) => handleFileUpload(e, 'template')}
                        accept=".html,.htm,.txt,.doc,.docx,.pdf"
                      />
                      <p className="text-xs text-slate-400">
                        Upload email templates, call scripts, or messaging guides
                      </p>
                      {/* Template File List */}
                      {templateFiles.length > 0 && (
                        <ScrollArea className="max-h-[120px] mt-3">
                          <div className="space-y-2">
                            {templateFiles.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm bg-white p-3 rounded-xl border-2 border-slate-100 shadow-sm group hover:border-purple-200 transition-all">
                                <div className="flex items-center gap-3 truncate">
                                  <div className="p-1.5 bg-purple-100 rounded-lg">
                                    <FileText className="h-4 w-4 text-purple-600" />
                                  </div>
                                  <span className="truncate text-slate-600">{file.name}</span>
                                </div>
                                <button onClick={() => removeFile(file.key, 'template')} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Navigation Buttons */}
              <div className="flex gap-4 pt-4">
                {/* Optional: Get AI Recommendations */}
                <Button
                  variant="outline"
                  size="lg"
                  className="h-14 px-6 text-base border-2 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 transition-all"
                  onClick={handleGoalSubmit}
                  disabled={!goalDescription.trim() || recommendMutation.isPending}
                >
                  {recommendMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 mr-2 text-emerald-600" />
                      Get AI Suggestions
                    </>
                  )}
                </Button>

                {/* Next Button */}
                <Button
                  className="flex-1 h-14 text-lg font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-200/50 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-200/60"
                  onClick={() => setStep('configure')}
                >
                  Next: Configure Campaign
                  <ArrowRight className="h-5 w-5 ml-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Configure Order */}
          {step === 'configure' && (
            <div className="space-y-8 max-w-4xl mx-auto">
              {/* AI Recommendation Card */}
              {recommendation?.rationale && (
                <Card className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 shadow-lg shadow-emerald-100/50 overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex gap-4 items-start">
                      <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-md">
                        <Bot className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-semibold text-emerald-800 mb-2">AI Recommendation</p>
                        <p className="text-sm text-emerald-700 leading-relaxed">{recommendation.rationale}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Main Configuration Card */}
              <Card className="border-2 border-slate-200 shadow-xl shadow-slate-100/50">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-emerald-600" />
                    Campaign Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Campaign Type */}
                    <div className="space-y-3">
                      <Label className="text-base font-medium text-slate-700">Campaign Type</Label>
                      <Select value={campaignType} onValueChange={setCampaignType}>
                        <SelectTrigger className="h-12 text-base border-2 border-slate-200 rounded-xl hover:border-emerald-300 transition-colors">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {CAMPAIGN_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value} className="py-3">
                              <div className="flex flex-col">
                                <span className="font-medium">{type.label}</span>
                                <span className="text-xs text-slate-500">{type.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Volume */}
                    <div className="space-y-3">
                      <Label className="text-base font-medium text-slate-700">
                        Lead Volume: <span className="text-emerald-600 font-bold">{volume}</span>
                      </Label>
                      <div className="pt-2">
                        <Slider
                          value={[volume]}
                          onValueChange={(v) => setVolume(v[0])}
                          min={25}
                          max={1000}
                          step={25}
                          className="mt-2"
                        />
                      </div>
                      <div className="flex justify-between text-sm text-slate-500 pt-1">
                        <span>25 leads</span>
                        <span>1,000 leads</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Target Industries */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium text-slate-700 flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-emerald-600" />
                      Target Industries
                    </Label>
                    <div className="flex flex-wrap gap-3">
                      {INDUSTRIES.map(industry => (
                        <Badge
                          key={industry}
                          variant={industries.includes(industry) ? "default" : "outline"}
                          className={cn(
                            "cursor-pointer text-sm py-2 px-4 rounded-full transition-all duration-200 border-2",
                            industries.includes(industry)
                              ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 shadow-md"
                              : "border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-slate-600"
                          )}
                          onClick={() => handleIndustryToggle(industry)}
                        >
                          {industries.includes(industry) && <Check className="h-3.5 w-3.5 mr-1.5" />}
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Job Titles */}
                  <div className="space-y-3">
                    <Label className="text-base font-medium text-slate-700 flex items-center gap-2">
                      <Users className="h-5 w-5 text-emerald-600" />
                      Target Job Titles
                    </Label>
                    <Input
                      value={jobTitles}
                      onChange={(e) => setJobTitles(e.target.value)}
                      placeholder="CTO, VP of Engineering, IT Director (comma separated)"
                      className="h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Company Size */}
                    <div className="space-y-3">
                      <Label className="text-base font-medium text-slate-700">Company Size (Employees)</Label>
                      <div className="flex gap-3 items-center">
                        <Input
                          type="number"
                          value={companySizeMin || ''}
                          onChange={(e) => setCompanySizeMin(e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Min"
                          className="flex-1 h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                        />
                        <span className="text-slate-400 font-medium px-2">to</span>
                        <Input
                          type="number"
                          value={companySizeMax || ''}
                          onChange={(e) => setCompanySizeMax(e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Max"
                          className="flex-1 h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Delivery Timeline */}
                    <div className="space-y-3">
                      <Label className="text-base font-medium text-slate-700 flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-emerald-600" />
                        Delivery Timeline
                      </Label>
                      <Select value={deliveryTimeline} onValueChange={setDeliveryTimeline}>
                        <SelectTrigger className="h-12 text-base border-2 border-slate-200 rounded-xl hover:border-emerald-300 transition-colors">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {DELIVERY_TIMELINES.map(timeline => (
                            <SelectItem key={timeline.value} value={timeline.value} className="py-3">
                              {timeline.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  {/* Channels */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium text-slate-700">Outreach Channels</Label>
                    <div className="flex flex-wrap gap-4">
                      <div
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                          channels.includes('voice')
                            ? "border-emerald-500 bg-emerald-50 shadow-md"
                            : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
                        )}
                        onClick={() => handleChannelToggle('voice')}
                      >
                        <Checkbox
                          id="channel-voice"
                          checked={channels.includes('voice')}
                          onCheckedChange={() => handleChannelToggle('voice')}
                          className="h-5 w-5"
                        />
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "p-2 rounded-lg",
                            channels.includes('voice') ? "bg-emerald-200" : "bg-slate-100"
                          )}>
                            <Phone className={cn("h-5 w-5", channels.includes('voice') ? "text-emerald-700" : "text-slate-500")} />
                          </div>
                          <span className={cn("font-medium", channels.includes('voice') ? "text-emerald-700" : "text-slate-600")}>
                            Voice Calls
                          </span>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                          channels.includes('email')
                            ? "border-emerald-500 bg-emerald-50 shadow-md"
                            : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
                        )}
                        onClick={() => handleChannelToggle('email')}
                      >
                        <Checkbox
                          id="channel-email"
                          checked={channels.includes('email')}
                          onCheckedChange={() => handleChannelToggle('email')}
                          className="h-5 w-5"
                        />
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "p-2 rounded-lg",
                            channels.includes('email') ? "bg-emerald-200" : "bg-slate-100"
                          )}>
                            <Mail className={cn("h-5 w-5", channels.includes('email') ? "text-emerald-700" : "text-slate-500")} />
                          </div>
                          <span className={cn("font-medium", channels.includes('email') ? "text-emerald-700" : "text-slate-600")}>
                            Email
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Geographies */}
                  <div className="space-y-3">
                    <Label className="text-base font-medium text-slate-700 flex items-center gap-2">
                      <Globe className="h-5 w-5 text-emerald-600" />
                      Target Geographies
                    </Label>
                    <Input
                      value={geographies}
                      onChange={(e) => setGeographies(e.target.value)}
                      placeholder="United States, Canada, UK (comma separated)"
                      className="h-12 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors"
                    />
                  </div>

                  {/* Special Requirements */}
                  <div className="space-y-3">
                    <Label className="text-base font-medium text-slate-700 flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-emerald-600" />
                      Special Requirements (Optional)
                    </Label>
                    <Textarea
                      value={specialRequirements}
                      onChange={(e) => setSpecialRequirements(e.target.value)}
                      placeholder="Any additional requirements or preferences..."
                      className="min-h-[120px] text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 transition-colors resize-none"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Cost Estimate */}
              {estimatedCost !== null && (
                <Card className="bg-gradient-to-r from-slate-800 to-slate-900 border-0 shadow-2xl overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/20 rounded-xl">
                          <DollarSign className="h-7 w-7 text-emerald-400" />
                        </div>
                        <div>
                          <span className="font-semibold text-slate-300 text-lg">Estimated Cost</span>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {formatCurrency(estimatedCost / volume)} per lead
                          </p>
                        </div>
                      </div>
                      <span className="text-4xl font-bold text-emerald-400">
                        {formatCurrency(estimatedCost)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 pt-4 border-t border-slate-700">
                      Final cost may vary based on delivery timeline and lead quality requirements.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Navigation Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStep('goal')}
                  className="h-14 px-8 text-base border-2 rounded-xl hover:bg-slate-50 transition-all"
                >
                  <ChevronRight className="h-5 w-5 mr-2 rotate-180" />
                  Back: Describe Goal
                </Button>
                <Button
                  className="flex-1 h-14 text-lg font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-200/50 transition-all duration-300"
                  onClick={() => setStep('review')}
                >
                  Next: Review & Submit
                  <ArrowRight className="h-5 w-5 ml-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Submit */}
          {step === 'review' && (
            <div className="space-y-8 max-w-4xl mx-auto">
              {/* Success Header */}
              <div className="text-center mb-6">
                <div className="inline-flex p-4 bg-gradient-to-br from-emerald-100 to-green-100 rounded-2xl mb-5 shadow-lg shadow-emerald-100/50">
                  <Check className="h-10 w-10 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-3">Review Your Order</h3>
                <p className="text-slate-500 max-w-xl mx-auto text-base leading-relaxed">
                  Please review your campaign details before submitting.
                </p>
              </div>

              {/* Order Summary Card */}
              <Card className="border-2 border-slate-200 shadow-xl shadow-slate-100/50 overflow-hidden">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                    <Package className="h-5 w-5 text-emerald-600" />
                    Order Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Campaign Type */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-500 mb-1 flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Campaign Type
                      </p>
                      <p className="font-semibold text-slate-800 text-lg">{CAMPAIGN_TYPES.find(t => t.value === campaignType)?.label}</p>
                    </div>

                    {/* Volume */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-500 mb-1 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Volume
                      </p>
                      <p className="font-semibold text-slate-800 text-lg">{volume} leads</p>
                    </div>

                    {/* Target Industries */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-500 mb-1 flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Target Industries
                      </p>
                      <p className="font-semibold text-slate-800">{industries.length > 0 ? industries.join(', ') : 'All industries'}</p>
                    </div>

                    {/* Job Titles */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-500 mb-1 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Job Titles
                      </p>
                      <p className="font-semibold text-slate-800">{jobTitles || 'All decision makers'}</p>
                    </div>

                    {/* Delivery Timeline */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-500 mb-1 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Delivery Timeline
                      </p>
                      <p className="font-semibold text-slate-800 text-lg">{DELIVERY_TIMELINES.find(t => t.value === deliveryTimeline)?.label}</p>
                    </div>

                    {/* Channels */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-500 mb-1 flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Channels
                      </p>
                      <p className="font-semibold text-slate-800 text-lg capitalize">{channels.join(' & ')}</p>
                    </div>
                  </div>

                  {/* Special Requirements */}
                  {specialRequirements && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <p className="text-sm text-amber-600 mb-1 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Special Requirements
                      </p>
                      <p className="font-medium text-amber-800">{specialRequirements}</p>
                    </div>
                  )}

                  {/* Geographies */}
                  {geographies && (
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-sm text-blue-600 mb-1 flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Target Geographies
                      </p>
                      <p className="font-medium text-blue-800">{geographies}</p>
                    </div>
                  )}

                  {/* Delivery Method */}
                  {deliveryMethod && (
                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                      <p className="text-sm text-purple-600 mb-1 flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Delivery Method
                      </p>
                      <p className="font-medium text-purple-800">{DELIVERY_METHODS.find(m => m.value === deliveryMethod)?.label}</p>
                    </div>
                  )}

                  {/* Templates */}
                  {templateFiles.length > 0 && (
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                      <p className="text-sm text-indigo-600 mb-1 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Uploaded Templates
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {templateFiles.map((file, idx) => (
                          <Badge key={idx} variant="secondary" className="bg-white text-indigo-700 border border-indigo-200">
                            {file.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Total Cost Card */}
              <Card className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 border-0 shadow-2xl shadow-emerald-200/50 overflow-hidden relative">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
                <CardContent className="p-8 relative z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
                        <DollarSign className="h-8 w-8 text-white" />
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-100 text-lg">Estimated Total</span>
                        <p className="text-sm text-white/70 mt-1">
                          Based on {volume} leads at {estimatedCost ? formatCurrency(estimatedCost / volume) : '$--'}/lead
                        </p>
                      </div>
                    </div>
                    <span className="text-5xl font-bold text-white">
                      {estimatedCost ? formatCurrency(estimatedCost) : 'TBD'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Navigation Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStep('configure')}
                  className="h-14 px-8 text-base border-2 rounded-xl hover:bg-slate-50 transition-all"
                >
                  <ChevronRight className="h-5 w-5 mr-2 rotate-180" />
                  Back: Configure
                </Button>
                <Button
                  className="flex-1 h-14 text-lg font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-200/50 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-200/60"
                  onClick={() => createOrderMutation.mutate()}
                  disabled={createOrderMutation.isPending}
                >
                  {createOrderMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                      Submitting Order...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-3" />
                      Submit Order
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default AgenticCampaignOrderPanel;
