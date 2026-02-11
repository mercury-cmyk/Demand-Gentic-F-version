/**
 * Work Order Form Component
 *
 * "Agentic Order Request" - AI-driven campaign creation wizard.
 * Allows clients to describe goals in natural language, which are then parsed (simulated) into campaign config.
 *
 * Features:
 * - Natural Language Input ('Describe Goal')
 * - Quick Start Templates
 * - Context/Resource Uploads
 * - Multi-step Wizard Flow
 * - Organization Intelligence Context (NEW)
 * - Client Profile Awareness (NEW)
 */

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, Phone, Mail, Target, Users, Building2,
  Calendar, Loader2, CheckCircle2,
  Sparkles, X, ChevronRight, ArrowLeft,
  Box, Lightbulb, Brain, AlertCircle, Info, Upload, File, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from "@/components/ui/card";
import { useClientOrgIntelligence } from '@/hooks/use-client-org-intelligence';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WorkOrderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (order: WorkOrder) => void;
  /** Pre-fill form values (e.g. from Upcoming Events) */
  initialValues?: Partial<WorkOrderFormData>;
  /** Event context for Argyle event-sourced orders */
  eventContext?: {
    externalEventId: string;
    eventTitle: string;
    eventDate?: string;
    eventType?: string;
    eventLocation?: string;
    eventCommunity?: string;
    eventSourceUrl: string;
    leadCount?: number;
  } | null;
}

/** File attachment interface */
export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  storageKey?: string;
  uploadUrl?: string;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'error';
  uploadProgress?: number;
  file?: File;
}

/** Exported for external consumers (e.g. launcher hook) */
export interface WorkOrderFormData {
  title: string;
  description: string;
  orderType: string;
  priority: string;
  targetIndustries: string[];
  targetTitles: string[];
  targetCompanySize: string;
  targetRegions: string[];
  targetAccountCount?: number;
  targetLeadCount?: number;
  requestedStartDate: string;
  requestedEndDate: string;
  estimatedBudget?: number;
  clientNotes: string;
  specialRequirements: string;
  targetUrls: string[];
  deliveryMethod: string;
  organizationContext: string | null;
  useOrgIntelligence: boolean;
  // File attachments
  attachments: FileAttachment[];
  // Event linkage
  eventSource?: string | null;
  externalEventId?: string | null;
  eventSourceUrl?: string | null;
  eventMetadata?: {
    eventTitle?: string;
    eventDate?: string;
    eventType?: string;
    eventLocation?: string;
    eventCommunity?: string;
  } | null;
}

interface WorkOrder {
  id: string;
  orderNumber: string;
  title: string;
  description?: string;
  orderType: string;
  priority: string;
  status: string;
  targetLeadCount?: number;
  submittedAt?: string;
}

// Default examples used when no organization intelligence is available
const DEFAULT_QUICK_EXAMPLES = [
  {
    title: "ABM + Technographic Targeting",
    description: "Account-aware outreach with firmographic filters (revenue, employees), technology stack targeting (AWS/Azure), SIC/NAICS codes.",
    icon: Building2
  },
  {
    title: "Content Syndication (CS)",
    description: "Whitepaper/asset distribution with MQL generation, seniority targeting, industry NAICS codes, and multi-region reach.",
    icon: FileText
  },
];

// Generate personalized quick examples based on organization intelligence
function generatePersonalizedExamples(orgContext: ReturnType<typeof useClientOrgIntelligence>['data']) {
  if (!orgContext?.hasIntelligence || !orgContext.organization) {
    return DEFAULT_QUICK_EXAMPLES;
  }

  const org = orgContext.organization;
  const orgName = org.name || orgContext.clientName;
  const industry = org.identity?.industry || org.industry || 'your industry';
  const coreProducts = Array.isArray(org.offerings?.coreProducts) ? org.offerings.coreProducts : [];
  const products = coreProducts.slice(0, 2).join(' and ') || 'your solutions';
  const icpIndustries = Array.isArray(org.icp?.industries) ? org.icp.industries : [];
  const targetIndustries = icpIndustries.slice(0, 2).join(' and ') || 'target industries';
  const icpPersonas = Array.isArray(org.icp?.personas) ? org.icp.personas : [];
  const personas = icpPersonas.slice(0, 2).map((p: any) => (typeof p === 'string' ? p : p.title)).join(' and ') || 'decision makers';
  const solvedArr = Array.isArray(org.offerings?.problemsSolved) ? org.offerings.problemsSolved : [];
  const problemsSolved = solvedArr.slice(0, 2).join(', ') || 'key business challenges';
  const diffsArr = Array.isArray(org.offerings?.differentiators) ? org.offerings.differentiators : [];
  const differentiators = diffsArr[0] || 'unique value proposition';
  const companySize = org.icp?.companySize || 'mid-size to enterprise';

  const examples = [
    {
      title: `${orgName} Lead Generation`,
      description: `Generate qualified leads from ${personas} at ${companySize} companies in ${targetIndustries} who need help with ${problemsSolved}.`,
      icon: Target
    },
    {
      title: `${industry} Decision Maker Outreach`,
      description: `AI call campaign targeting ${personas} to introduce ${products} and highlight ${differentiators}.`,
      icon: Phone
    },
    {
      title: `ICP-Matched Appointment Setting`,
      description: `Book meetings with ${personas} in ${targetIndustries} companies. Focus on ${problemsSolved} as conversation starters.`,
      icon: Calendar
    },
    {
      title: `Multi-Channel Campaign`,
      description: `Combined email + call outreach to ${companySize} ${targetIndustries} companies, positioning ${products} as the solution for ${problemsSolved}.`,
      icon: Mail
    },
  ];

  // Return first 2 examples that are most relevant
  return examples.slice(0, 2);
}

const ORDER_TYPES = [
  { value: 'lead_generation', label: 'Lead Generation', icon: Target },
  { value: 'call_campaign', label: 'AI Call Campaign', icon: Phone },
  { value: 'email_campaign', label: 'Email Campaign', icon: Mail },
  { value: 'combo_campaign', label: 'Call + Email Combo', icon: Sparkles },
  { value: 'appointment_setting', label: 'Appointment Setting', icon: Calendar },
  { value: 'data_enrichment', label: 'Data Enrichment', icon: Users },
  { value: 'market_research', label: 'Market Research', icon: Building2 },
  { value: 'custom', label: 'Custom Request', icon: FileText },
];

export function WorkOrderForm({ open, onOpenChange, onSuccess, initialValues, eventContext }: WorkOrderFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  // Fetch organization intelligence context
  const {
    data: orgContext,
    isLoading: isLoadingContext,
    buildContextSummary,
    getTargetingSuggestions,
    getValueProposition,
  } = useClientOrgIntelligence();

  // Generate personalized quick examples based on organization intelligence
  const quickExamples = generatePersonalizedExamples(orgContext);

  // Build default form state, merging in initialValues and eventContext
  const buildDefaultFormData = () => {
    const defaults = {
      title: '',
      description: '',
      orderType: 'lead_generation',
      priority: 'normal',
      targetIndustries: [] as string[],
      targetTitles: [] as string[],
      targetCompanySize: '',
      targetRegions: [] as string[],
      targetAccountCount: undefined as number | undefined,
      targetLeadCount: undefined as number | undefined,
      requestedStartDate: '',
      requestedEndDate: '',
      estimatedBudget: undefined as number | undefined,
      clientNotes: '',
      specialRequirements: '',
      // Agentic specific fields
      targetUrls: [] as string[],
      deliveryMethod: 'email',
      // File attachments
      attachments: [] as FileAttachment[],
      // Organization context (attached automatically)
      organizationContext: null as string | null,
      useOrgIntelligence: true,
      // Event linkage fields
      eventSource: null as string | null,
      externalEventId: null as string | null,
      eventSourceUrl: null as string | null,
      eventMetadata: null as { eventTitle?: string; eventDate?: string; eventType?: string; eventLocation?: string; eventCommunity?: string } | null,
    };

    // Apply event context first (canonical source)
    if (eventContext) {
      defaults.title = eventContext.eventTitle || '';
      defaults.description = `Generate leads for ${eventContext.eventTitle || 'upcoming event'}`;
      defaults.targetLeadCount = eventContext.leadCount;
      defaults.targetUrls = eventContext.eventSourceUrl ? [eventContext.eventSourceUrl] : [];
      defaults.targetRegions = eventContext.eventLocation ? [eventContext.eventLocation] : [];
      defaults.requestedEndDate = eventContext.eventDate || '';
      defaults.eventSource = 'argyle_event';
      defaults.externalEventId = eventContext.externalEventId;
      defaults.eventSourceUrl = eventContext.eventSourceUrl;
      defaults.eventMetadata = {
        eventTitle: eventContext.eventTitle,
        eventDate: eventContext.eventDate,
        eventType: eventContext.eventType,
        eventLocation: eventContext.eventLocation,
        eventCommunity: eventContext.eventCommunity,
      };
    }

    // Apply any explicit initialValues overrides
    if (initialValues) {
      return { ...defaults, ...initialValues };
    }

    return defaults;
  };

  // Form state
  const [formData, setFormData] = useState(buildDefaultFormData);

  // Re-initialize form when eventContext or initialValues change (dialog opens with new context)
  useEffect(() => {
    if (open) {
      setFormData(buildDefaultFormData());
      setStep(1);
    }
  }, [open, eventContext?.externalEventId]);

  // Auto-populate targeting suggestions from org intelligence when available
  useEffect(() => {
    if (orgContext?.hasIntelligence && formData.useOrgIntelligence) {
      const suggestions = getTargetingSuggestions();
      // Only auto-populate if fields are empty
      setFormData(prev => ({
        ...prev,
        targetIndustries: prev.targetIndustries.length > 0 ? prev.targetIndustries : suggestions.industries,
        targetTitles: prev.targetTitles.length > 0 ? prev.targetTitles : suggestions.titles,
        targetCompanySize: prev.targetCompanySize || suggestions.companySize || '',
        organizationContext: buildContextSummary(),
      }));
    }
  }, [orgContext?.hasIntelligence]);

  // Temporary input states
  const [industryInput, setIndustryInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [urlInput, setUrlInput] = useState('');

  // File upload mutations and state
  const uploadMutation = useMutation({
    mutationFn: async ({ file, attachmentId }: { file: File; attachmentId: string }) => {
      // Step 1: Get presigned URL
      const presignRes = await fetch('/api/s3/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          folder: 'campaign-orders',
        }),
      });

      if (!presignRes.ok) {
        const error = await presignRes.json();
        if (presignRes.status === 503) {
          throw new Error('File upload service is not configured. Please contact support.');
        }
        throw new Error(error.message || 'Failed to get upload URL');
      }

      const { uploadUrl, key } = await presignRes.json();

      // Step 2: Upload file directly to storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`);
      }

      return { key, uploadUrl };
    },
    onMutate: ({ attachmentId }) => {
      // Update attachment status to uploading
      setFormData(prev => ({
        ...prev,
        attachments: prev.attachments.map(att =>
          att.id === attachmentId
            ? { ...att, uploadStatus: 'uploading' as const, uploadProgress: 0 }
            : att
        ),
      }));
    },
    onSuccess: ({ key }, { attachmentId }) => {
      // Update attachment with storage key
      setFormData(prev => ({
        ...prev,
        attachments: prev.attachments.map(att =>
          att.id === attachmentId
            ? { ...att, uploadStatus: 'uploaded' as const, storageKey: key, uploadProgress: 100 }
            : att
        ),
      }));
      toast({
        title: 'File uploaded successfully',
        variant: 'default',
      });
    },
    onError: (error: Error, { attachmentId }) => {
      // Update attachment status to error
      setFormData(prev => ({
        ...prev,
        attachments: prev.attachments.map(att =>
          att.id === attachmentId
            ? { ...att, uploadStatus: 'error' as const, uploadProgress: 0 }
            : att
        ),
      }));
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Create work order mutation
  const createMutation = useMutation({
    mutationFn: async (submitNow: boolean) => {
      // Ensure all uploads are complete
      const pendingUploads = formData.attachments.filter(att => 
        att.uploadStatus === 'uploading' || att.uploadStatus === 'pending'
      );
      
      if (pendingUploads.length > 0) {
        throw new Error('Please wait for file uploads to complete before submitting');
      }

      const failedUploads = formData.attachments.filter(att => att.uploadStatus === 'error');
      if (failedUploads.length > 0) {
        throw new Error(`Some files failed to upload: ${failedUploads.map(f => f.name).join(', ')}`);
      }

      // Prepare attachment metadata
      const attachmentMetadata = formData.attachments
        .filter(att => att.uploadStatus === 'uploaded' && att.storageKey)
        .map(att => ({
          name: att.name,
          size: att.size,
          type: att.type,
          storageKey: att.storageKey!,
        }));

      // Auto-generate title if missing
      const submissionData = {
        ...formData,
        title: formData.title || `Agentic Order - ${new Date().toLocaleDateString()}`,
        attachments: attachmentMetadata,
        submitNow,
      };

      const res = await fetch('/api/client-portal/work-orders/client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(submissionData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create work order');
      }
      return res.json();
    },
    onSuccess: (data, submitNow) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      // Also invalidate argyle events if this was an event-sourced order
      if (formData.eventSource === 'argyle_event') {
        queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      }
      
      const toastTitle = data.alreadyExists
        ? 'Order Already Exists'
        : submitNow ? 'Work Order Submitted!' : 'Draft Saved';
      
      const toastDescription = data.alreadyExists
        ? `Order ${data.workOrder.orderNumber} was already created for this event.`
        : submitNow
          ? `Order ${data.workOrder.orderNumber} has been submitted and will appear in Admin Project Requests. Request ID: ${data.workOrder.id.substring(0, 8)}`
          : 'Your work order has been saved as a draft';

      toast({
        title: toastTitle,
        description: toastDescription,
        variant: "default", 
        className: "bg-emerald-600 text-white border-none"
      });
      onSuccess?.(data.workOrder);
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

  // File upload mutation - get presigned URL
  const getUploadUrlMutation = useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch('/api/s3/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          folder: 'campaign-orders',
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to get upload URL');
      }
      return res.json();
    },
  });

  // File upload to storage
  const uploadToStorageMutation = useMutation({
    mutationFn: async ({ file, uploadUrl }: { file: File; uploadUrl: string }) => {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });
      if (!res.ok) {
        throw new Error('Failed to upload file');
      }
      return res;
    },
  });

  // Handle file selection and upload
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles: FileAttachment[] = [];
    
    for (const file of Array.from(files)) {
      // Size limit: 10MB
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `File "${file.name}" exceeds 10MB limit`,
          variant: 'destructive',
        });
        continue;
      }

      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const attachment: FileAttachment = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadStatus: 'pending',
        file,
      };
      
      newFiles.push(attachment);
    }

    if (newFiles.length === 0) return;

    // Add files to form data
    setFormData(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...newFiles],
    }));

    // Upload files
    for (const attachment of newFiles) {
      try {
        // Update status to uploading
        setFormData(prev => ({
          ...prev,
          attachments: prev.attachments.map(a => 
            a.id === attachment.id 
              ? { ...a, uploadStatus: 'uploading' as const }
              : a
          ),
        }));

        // Get presigned URL
        const urlResponse = await getUploadUrlMutation.mutateAsync(attachment.file!);
        
        // Upload file
        await uploadToStorageMutation.mutateAsync({
          file: attachment.file!,
          uploadUrl: urlResponse.uploadUrl,
        });

        // Update status to uploaded
        setFormData(prev => ({
          ...prev,
          attachments: prev.attachments.map(a => 
            a.id === attachment.id 
              ? { 
                  ...a, 
                  uploadStatus: 'uploaded' as const, 
                  storageKey: urlResponse.key,
                  uploadUrl: urlResponse.uploadUrl 
                }
              : a
          ),
        }));

        toast({
          title: 'File uploaded',
          description: `"${attachment.name}" uploaded successfully`,
        });
      } catch (error) {
        // Update status to error
        setFormData(prev => ({
          ...prev,
          attachments: prev.attachments.map(a => 
            a.id === attachment.id 
              ? { ...a, uploadStatus: 'error' as const }
              : a
          ),
        }));

        toast({
          title: 'Upload failed',
          description: `Failed to upload "${attachment.name}"`,
          variant: 'destructive',
        });
      }
    }

    // Clear file input
    event.target.value = '';
  };

  // Remove file attachment
  const handleRemoveFile = (attachmentId: string) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter(a => a.id !== attachmentId),
    }));
  };

  const resetForm = () => {
    setFormData(buildDefaultFormData());
    setStep(1);
    setIndustryInput('');
    setTitleInput('');
    setUrlInput('');
  };

  const handleAddItem = (field: 'targetIndustries' | 'targetTitles' | 'targetUrls', value: string) => {
    if (value.trim()) {
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], value.trim()],
      }));
    }
  };

  const handleRemoveItem = (field: 'targetIndustries' | 'targetTitles' | 'targetUrls', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter(att => att.id !== attachmentId),
    }));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleQuickExample = (example: { title: string; description: string; icon: any }) => {
    setFormData(prev => ({
      ...prev,
      title: example.title,
      description: example.description
    }));
    toast({
      title: orgContext?.hasIntelligence ? "Personalized Template Applied" : "Template Applied",
      description: orgContext?.hasIntelligence
        ? `Goal customized based on ${orgContext.organization?.name || orgContext.clientName}'s ICP.`
        : "Goal description updated from example.",
    })
  };

  const isStepValid = (stepNum: number) => {
    if (stepNum === 1) return formData.description.trim().length > 0;
    if (stepNum === 2) {
      // Check if any uploads are still in progress or failed
      const hasUploadIssues = formData.attachments.some(att => 
        att.uploadStatus === 'uploading' || att.uploadStatus === 'pending' || att.uploadStatus === 'error'
      );
      return !hasUploadIssues;
    }
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0 gap-0 border-none rounded-xl">
        {/* Header - Green Background as per user design */}
        <div className="bg-[#0FA97F] text-white p-6 pb-20 relative overflow-hidden">
            {/* Texture/Pattern overlay if needed, for now just clean green */}
          <DialogHeader className="relative z-10">
            <div className="flex items-center justify-between">
                <DialogTitle className="text-2xl font-normal tracking-wide flex items-center gap-3">
                    <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                        <Box className="h-6 w-6 text-white" />
                    </div>
                    Agentic Order Request
                </DialogTitle>
                <button onClick={() => onOpenChange(false)} className="text-white/70 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>
            <DialogDescription className="text-white/90 text-sm mt-1 ml-11">
              {eventContext
                ? `Source: Upcoming Event — ${eventContext.eventTitle}`
                : 'Directly instruct agents to execute your campaign'}
            </DialogDescription>
          </DialogHeader>
          {/* Event context badge in header */}
          {eventContext && (
            <div className="relative z-10 mt-3 ml-11 flex flex-wrap items-center gap-2">
              <Badge className="bg-white/20 text-white border-0 text-xs backdrop-blur-sm">
                <Calendar className="h-3 w-3 mr-1" />
                {eventContext.eventDate || 'Date TBD'}
              </Badge>
              {eventContext.eventType && (
                <Badge className="bg-white/20 text-white border-0 text-xs backdrop-blur-sm">
                  {eventContext.eventType}
                </Badge>
              )}
              {eventContext.eventLocation && (
                <Badge className="bg-white/20 text-white border-0 text-xs backdrop-blur-sm">
                  {eventContext.eventLocation}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Wizard Panel - Overlapping Card */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 -mt-12 rounded-t-3xl z-20 mx-0 overflow-hidden shadow-2xl h-full">
            {/* Stepper */}
            <div className="flex justify-center items-center py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-4">
                    {[
                        { num: 1, label: "Describe Goal" },
                        { num: 2, label: "Configure" },
                        { num: 3, label: "Review & Submit" }
                    ].map((s, idx, arr) => (
                        <div key={s.num} className="flex items-center">
                            <div className={cn(
                                "flex items-center gap-2 px-4 py-1 rounded-full transition-colors",
                                step === s.num ? "bg-emerald-50 text-emerald-700 font-medium" : 
                                step > s.num ? "text-emerald-600" : "text-slate-400"
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded flex items-center justify-center text-xs font-bold",
                                    step === s.num ? "bg-emerald-600 text-white" :
                                    step > s.num ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                                )}>
                                    {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                                </div>
                                <span>{s.label}</span>
                            </div>
                            {idx < arr.length - 1 && (
                                <div className="w-12 h-[2px] bg-slate-100 mx-2" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-slate-950">
            {/* Step 1: Describe Goal */}
            {step === 1 && (
                <div className="space-y-8 max-w-3xl mx-auto text-center">
                    {/* Organization Context Banner */}
                    {isLoadingContext ? (
                      <div className="flex items-center justify-center gap-2 p-4 bg-slate-50 rounded-lg text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Loading organization context...</span>
                      </div>
                    ) : orgContext?.hasIntelligence ? (
                      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-left">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg">
                              <Brain className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-emerald-900 text-sm">
                                  Organization Intelligence Active
                                </h4>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                        <Info className="w-4 h-4 text-emerald-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p>Your organization's profile, ICP, and offerings are being used to enhance AI suggestions.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <p className="text-sm text-emerald-700 mt-1">
                                <span className="font-medium">{orgContext.organization?.name || orgContext.clientName}</span>
                                {orgContext.organization?.identity?.industry && (
                                  <span className="text-emerald-600"> • {orgContext.organization.identity.industry}</span>
                                )}
                              </p>
                              {getValueProposition() && (
                                <p className="text-xs text-emerald-600 mt-2 italic">
                                  "{getValueProposition()}"
                                </p>
                              )}
                              {orgContext.campaigns.length > 0 && (
                                <p className="text-xs text-emerald-600 mt-2">
                                  {orgContext.campaigns.length} previous campaign{orgContext.campaigns.length > 1 ? 's' : ''} on record
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Alert className="text-left border-amber-200 bg-amber-50">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-800 text-sm">
                          <span className="font-medium">No organization intelligence found.</span> Set up your organization profile in Settings for better AI recommendations.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                        <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                            What would you like to achieve?
                        </h2>
                        <p className="text-slate-500 max-w-lg mx-auto">
                            Describe your campaign goal in natural language and our AI will recommend the best approach.
                        </p>
                    </div>

                    <div className="relative">
                        <Card className="border-slate-200 shadow-sm overflow-hidden text-left">
                            <CardContent className="p-0">
                                <Textarea
                                    placeholder="Example: I want to generate 200 qualified leads from IT directors at mid-size healthcare companies in the US who might be interested in our cybersecurity solution..."
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    className="min-h-[180px] w-full resize-none border-0 focus-visible:ring-0 p-6 text-base placeholder:text-slate-300 leading-relaxed"
                                />
                                <div className="border-t bg-slate-50 px-4 py-2 flex justify-between items-center">
                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                        <Lightbulb className="w-3 h-3" /> AI will parse targeting from this text
                                    </span>
                                    <span className="text-xs text-slate-400">{formData.description.length} chars</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-4 pt-4 text-left">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                            <Lightbulb className="w-4 h-4 text-amber-500" />
                            {orgContext?.hasIntelligence ? (
                              <span>Personalized Examples for {orgContext.organization?.name || orgContext.clientName} — Click to populate:</span>
                            ) : (
                              <span>Quick Examples — Click to populate:</span>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {quickExamples.map((ex, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleQuickExample(ex)}
                                    className={cn(
                                      "text-left p-4 rounded-xl border hover:border-emerald-500 hover:shadow-md transition-all group hover:bg-white",
                                      orgContext?.hasIntelligence
                                        ? "border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-teal-50/30"
                                        : "border-slate-200 bg-slate-50/50"
                                    )}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={cn(
                                          "p-1.5 rounded group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors",
                                          orgContext?.hasIntelligence
                                            ? "bg-emerald-100 text-emerald-600"
                                            : "bg-blue-100 text-blue-600"
                                        )}>
                                            <ex.icon className="w-4 h-4" />
                                        </div>
                                        <h4 className="font-semibold text-slate-900 dark:text-slate-200 text-sm">{ex.title}</h4>
                                        {orgContext?.hasIntelligence && (
                                          <Badge variant="secondary" className="text-[10px] h-4 bg-emerald-100 text-emerald-700 border-0">
                                            ICP-Based
                                          </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">{ex.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2: Configure */}
            {step === 2 && (
                <div className="space-y-6 max-w-3xl mx-auto">
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg flex gap-3">
                        <div className="flex gap-2">
                          <Sparkles className="w-5 h-5 text-emerald-600 mt-0.5" />
                          {orgContext?.hasIntelligence && <Brain className="w-5 h-5 text-emerald-600 mt-0.5" />}
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-emerald-900">
                              AI Analysis {orgContext?.hasIntelligence && '+ Organization Intelligence'}
                            </h4>
                            <p className="text-sm text-emerald-700 mt-1">
                                {orgContext?.hasIntelligence 
                                  ? `Based on your description and ${orgContext.organization?.name || orgContext.clientName}'s ICP, we've pre-configured the targeting parameters below.`
                                  : 'Based on your description, we\'ve pre-configured the following targeting parameters. Please refine if needed.'
                                }
                            </p>
                            {/* AI Assist Button for Argyle Events */}
                            {eventContext && (
                              <div className="mt-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    // AI Assist for event-based orders
                                    const aiSuggestions = {
                                      description: `Generate qualified leads for ${eventContext.eventTitle}. Target attendees and interested professionals in ${eventContext.eventLocation || 'the local area'} who would benefit from networking and business opportunities at this ${eventContext.eventType || 'event'}.`,
                                      targetIndustries: eventContext.eventCommunity ? [eventContext.eventCommunity] : [],
                                      targetTitles: ['Business Owner', 'Director', 'Manager', 'Executive'],
                                      targetRegions: eventContext.eventLocation ? [eventContext.eventLocation] : [],
                                    };
                                    
                                    setFormData(prev => ({
                                      ...prev,
                                      ...aiSuggestions,
                                    }));
                                    
                                    toast({
                                      title: 'AI suggestions applied',
                                      description: 'Event-specific targeting suggestions have been added. Please review and adjust as needed.',
                                    });
                                  }}
                                  className="text-purple-600 border-purple-200 hover:bg-purple-50"
                                >
                                  <Sparkles className="w-4 h-4 mr-2" />
                                  AI Assist for Event
                                </Button>
                              </div>
                            )}
                            {orgContext?.hasIntelligence && formData.targetIndustries.length > 0 && (
                              <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> 
                                ICP-based targeting suggestions applied
                              </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                         <div className="space-y-3">
                            <Label>Campaign Type</Label>
                            <Select 
                                value={formData.orderType} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, orderType: val }))}
                            >
                                <SelectTrigger className="bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ORDER_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>
                                            <div className="flex items-center gap-2">
                                                <t.icon className="w-4 h-4" /> {t.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-3">
                             <Label>Lead Volume Target</Label>
                             <Input 
                                type="number" 
                                placeholder="e.g. 500" 
                                value={formData.targetLeadCount || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, targetLeadCount: parseInt(e.target.value) }))}
                                className="bg-white"
                             />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label>Target Industries</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Add industry..."
                                value={industryInput}
                                onChange={(e) => setIndustryInput(e.target.value)}
                                className="bg-white"
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') { e.preventDefault(); handleAddItem('targetIndustries', industryInput); setIndustryInput(''); }
                                }}
                            />
                            <Button variant="secondary" type="button" onClick={() => { handleAddItem('targetIndustries', industryInput); setIndustryInput(''); }}>Add</Button>
                        </div>
                        {formData.targetIndustries.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.targetIndustries.map((ind, i) => (
                                    <Badge key={i} variant="outline" className="bg-white">
                                        {ind} <button onClick={() => handleRemoveItem('targetIndustries', i)} className="ml-1 hover:text-red-500">×</button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        <Label>Target Job Titles</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Add job title..."
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                className="bg-white"
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') { e.preventDefault(); handleAddItem('targetTitles', titleInput); setTitleInput(''); }
                                }}
                            />
                            <Button variant="secondary" type="button" onClick={() => { handleAddItem('targetTitles', titleInput); setTitleInput(''); }}>Add</Button>
                        </div>
                         {formData.targetTitles.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.targetTitles.map((t, i) => (
                                    <Badge key={i} variant="outline" className="bg-white">
                                        {t} <button onClick={() => handleRemoveItem('targetTitles', i)} className="ml-1 hover:text-red-500">×</button>
                                    </Badge>
                                ))}
                            </div>
                         )}
                    </div>
                    
                    <div className="space-y-3">
                         <Label>Reference URLs (Optional)</Label>
                         <div className="flex gap-2">
                            <Input
                                placeholder="https://..."
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="bg-white"
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') { e.preventDefault(); handleAddItem('targetUrls', urlInput); setUrlInput(''); }
                                }}
                            />
                            <Button variant="secondary" type="button" onClick={() => { handleAddItem('targetUrls', urlInput); setUrlInput(''); }}>Add</Button>
                        </div>
                         {formData.targetUrls.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.targetUrls.map((u, i) => (
                                    <Badge key={i} variant="outline" className="bg-white max-w-full truncate">
                                        <span className="truncate">{u}</span> <button onClick={() => handleRemoveItem('targetUrls', i)} className="ml-1 hover:text-red-500">×</button>
                                    </Badge>
                                ))}
                            </div>
                         )}
                    </div>
                    
                    {/* File Attachments Section */}
                    <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            File Attachments (Optional)
                        </Label>
                        <p className="text-sm text-slate-600">
                            Upload relevant documents like target account lists, templates, or reference materials.
                            Supported formats: PDF, DOCX, CSV, XLSX, PNG, JPG (max 10MB each)
                        </p>

                        {/* File Upload Area */}
                        <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-lg p-6">
                            <div className="text-center">
                                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                <label className="cursor-pointer">
                                    <span className="text-sm font-medium text-slate-600 hover:text-slate-800">
                                        Choose files or drag and drop
                                    </span>
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        accept=".pdf,.docx,.doc,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
                                        onChange={handleFileSelect}
                                        disabled={uploadMutation.isPending}
                                    />
                                </label>
                                <p className="text-xs text-slate-400 mt-1">
                                    PDF, DOCX, CSV, XLSX, Images • Max 10MB per file
                                </p>
                            </div>
                        </div>

                        {/* Attachment List */}
                        {formData.attachments.length > 0 && (
                            <div className="space-y-2">
                                {formData.attachments.map((attachment) => (
                                    <div
                                        key={attachment.id}
                                        className="flex items-center gap-3 p-3 bg-white border rounded-lg"
                                    >
                                        <File className="w-4 h-4 text-slate-400" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900 truncate">
                                                {attachment.name}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span>{formatFileSize(attachment.size)}</span>
                                                {attachment.uploadStatus === 'uploading' && (
                                                    <span className="flex items-center gap-1">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        Uploading...
                                                    </span>
                                                )}
                                                {attachment.uploadStatus === 'uploaded' && (
                                                    <span className="flex items-center gap-1 text-green-600">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Uploaded
                                                    </span>
                                                )}
                                                {attachment.uploadStatus === 'error' && (
                                                    <span className="flex items-center gap-1 text-red-600">
                                                        <AlertCircle className="w-3 h-3" />
                                                        Upload failed
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveAttachment(attachment.id)}
                                            className="text-slate-400 hover:text-red-500 p-1"
                                            disabled={attachment.uploadStatus === 'uploading'}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
                <div className="max-w-3xl mx-auto space-y-8 pt-4">
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in-50 duration-300">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-2xl font-semibold text-slate-900">Ready to Launch</h3>
                        <p className="text-slate-500">
                            Our agents will review your request and begin execution within 24 hours.
                        </p>
                    </div>

                    <Card className="border-slate-200">
                        <CardContent className="p-8 space-y-6">
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Goal Statement</h4>
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 text-slate-700 italic">
                                    "{formData.description}"
                                </div>
                            </div>

                            <Separator />

                            <div className="grid grid-cols-2 gap-y-6 gap-x-12">
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Campaign Specs</h4>
                                    <ul className="space-y-2 text-sm">
                                        <li className="flex justify-between">
                                            <span className="text-slate-500">Type:</span>
                                            <span className="font-medium text-slate-900">{ORDER_TYPES.find(t => t.value === formData.orderType)?.label}</span>
                                        </li>
                                        <li className="flex justify-between">
                                            <span className="text-slate-500">Priority:</span>
                                            <span className="font-medium text-slate-900 capitalize">{formData.priority}</span>
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Targeting</h4>
                                    <ul className="space-y-2 text-sm">
                                        <li className="flex justify-between">
                                            <span className="text-slate-500">Industries:</span>
                                            <span className="font-medium text-slate-900">{formData.targetIndustries.length || 'Open'}</span>
                                        </li>
                                        <li className="flex justify-between">
                                            <span className="text-slate-500">Titles:</span>
                                            <span className="font-medium text-slate-900">{formData.targetTitles.length || 'Open'}</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            {/* Attachments Summary */}
                            {formData.attachments.length > 0 && (
                                <>
                                    <Separator />
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Attachments</h4>
                                        <div className="space-y-2">
                                            {formData.attachments.map((attachment, idx) => (
                                                <div key={attachment.id} className="flex items-center gap-2 text-sm">
                                                    <File className="w-4 h-4 text-slate-400" />
                                                    <span className="flex-1 truncate">{attachment.name}</span>
                                                    <span className="text-slate-500 text-xs">{formatFileSize(attachment.size)}</span>
                                                    {attachment.uploadStatus === 'uploaded' && (
                                                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
            </div>

            {/* Sticky Footer */}
            <div className="bg-white dark:bg-slate-900 border-t border-slate-200 p-6 flex justify-between items-center z-30">
                <Button variant="ghost" disabled={step === 1} onClick={() => setStep(s => s - 1)} className="text-slate-500 hover:text-slate-900">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                
                {step < 3 ? (
                    <Button 
                        onClick={() => setStep(s => s + 1)} 
                        disabled={!isStepValid(step)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]"
                    >
                        Next Step <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                ) : (
                    <div className="flex gap-3">
                         <Button 
                            variant="outline" 
                            onClick={() => createMutation.mutate(false)}
                            disabled={createMutation.isPending}
                        >
                            Save Draft
                        </Button>
                        <Button 
                            onClick={() => createMutation.mutate(true)}
                            disabled={createMutation.isPending}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]"
                        >
                            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Submit Request
                        </Button>
                    </div>
                )}
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WorkOrderForm;
