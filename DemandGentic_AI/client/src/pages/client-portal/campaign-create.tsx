/**
 * Client Portal — Simplified Campaign Creation
 *
 * Allows clients to create email or phone campaigns with minimal mandatory info.
 * Campaign creation is optional and requires project approval before execution.
 * Creates a project (pending) + work order in one step.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Phone, Mail, Layers, ArrowLeft, ArrowRight, Send, Loader2,
  CheckCircle2, AlertCircle, Target, Megaphone, Info, Sparkles,
  Building2, Users, Calendar, DollarSign, FileText, Plus, X,
  Upload, File, Trash2, Link as LinkIcon, ShieldBan, Database, Paperclip,
  Tag, Handshake, MousePointerClick, ClipboardCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

const getToken = () => localStorage.getItem('clientPortalToken');

// ── Program Type Pricing Defaults ─────────────────────────────────────────

const DEFAULT_PROGRAM_TYPES = [
  { key: 'appointment_setting', label: 'Appointment Setting', price: 500.00, unit: 'per lead', icon: Handshake, colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { key: 'event_registration_digital_ungated', label: 'Event Registration - Digital (Ungated)', price: 10.00, unit: 'per lead', icon: MousePointerClick, colorClass: 'text-blue-600 bg-blue-50 border-blue-100' },
  { key: 'event_registration_digital_gated', label: 'Event Registration - Digital (Gated)', price: 40.00, unit: 'per lead', icon: ClipboardCheck, colorClass: 'text-violet-600 bg-violet-50 border-violet-100' },
  { key: 'in_person_event', label: 'In-Person Events Program', price: 80.00, unit: 'per lead', icon: Users, colorClass: 'text-amber-600 bg-amber-50 border-amber-100' },
  { key: 'data_hygiene_enrichment', label: 'Data Hygiene & Enrichment', price: 0.35, unit: 'per record', icon: Database, colorClass: 'text-slate-600 bg-slate-50 border-slate-200' },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  status: string;
  description: string | null;
}

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  category: 'target_accounts' | 'suppression_list' | 'asset';
  file: File;
}

interface FormData {
  // Required
  name: string;
  channel: 'voice' | 'email' | 'combo' | '';
  objective: string;

  // Optional
  description: string;
  campaignType: string;
  programType: string;
  targetAudience: string;
  targetLeadCount: number | undefined;
  targetIndustries: string[];
  targetTitles: string[];
  targetRegions: string[];
  successCriteria: string;
  startDate: string;
  endDate: string;
  budget: number | undefined;
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // Email-specific
  emailSubject: string;
  emailBody: string;

  // Voice-specific
  callScript: string;

  // Project linking
  projectId: string;

  // File uploads
  attachments: FileAttachment[];

  // Reference URLs
  referenceUrls: string[];
  landingPageUrl: string;
}

interface ArgylePrefillResponse {
  draftId: string;
  status: string;
  workOrderId?: string | null;
  alreadyExists: boolean;
  rejectionReason?: string | null;
  prefill: {
    channel: 'email';
    name?: string;
    objective?: string;
    description?: string;
    landingPageUrl?: string;
    targetAudience?: string;
    targetTitles?: string[];
    targetIndustries?: string[];
    targetRegions?: string[];
    startDate?: string;
    targetLeadCount?: number;
    eventSummary?: {
      title?: string | null;
      type?: string | null;
      date?: string | null;
      location?: string | null;
      sourceUrl?: string | null;
    };
  };
}

function formatFileSize(bytes: number): string {
  if (bytes ({ ...DEFAULT_FORM });
  const [argyleDraftId, setArgyleDraftId] = useState(initialArgyleDraftId || '');
  const [argylePrefillApplied, setArgylePrefillApplied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdCampaign, setCreatedCampaign] = useState(null);
  const [industryInput, setIndustryInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [regionInput, setRegionInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [orgInteligenceLoading, setOrgIntelligenceLoading] = useState(false);
  const [showOrgIntelligenceOptions, setShowOrgIntelligenceOptions] = useState(false);

  // For Argyle event flow, ensure one idempotent draft exists and get prefill values.
  const { data: argylePrefill, isLoading: argylePrefillLoading, error: argylePrefillError } = useQuery({
    queryKey: ['argyle-campaign-prefill', argyleEventId, argyleDraftId],
    queryFn: async () => {
      if (!argyleFlow || !argyleEventId) return null;
      const res = await fetch(`/api/client-portal/argyle-events/events/${argyleEventId}/draft`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to load event draft' }));
        throw new Error(err.error || 'Failed to load event draft');
      }
      return res.json();
    },
    enabled: argyleFlow && !!argyleEventId,
  });

  useEffect(() => {
    if (!argyleFlow || argylePrefillApplied || !argylePrefill?.prefill) return;

    const prefill = argylePrefill.prefill;
    setArgyleDraftId((prev) => argylePrefill.draftId || prev);
    setForm((prev) => ({
      ...prev,
      channel: 'email',
      name: prefill.name || prev.name,
      objective: prefill.objective || prev.objective,
      description: prefill.description || prev.description,
      landingPageUrl: prefill.landingPageUrl || prev.landingPageUrl,
      targetAudience: prefill.targetAudience || prev.targetAudience,
      targetTitles: prefill.targetTitles?.length ? prefill.targetTitles : prev.targetTitles,
      targetIndustries: prefill.targetIndustries?.length ? prefill.targetIndustries : prev.targetIndustries,
      targetRegions: prefill.targetRegions?.length ? prefill.targetRegions : prev.targetRegions,
      startDate: prefill.startDate || prev.startDate,
      targetLeadCount: prefill.targetLeadCount ?? prev.targetLeadCount,
    }));
    setArgylePrefillApplied(true);
  }, [argyleFlow, argylePrefill, argylePrefillApplied]);

  useEffect(() => {
    if (argyleFlow && argylePrefillError) {
      toast({
        title: 'Unable to load event draft',
        description: (argylePrefillError as Error).message || 'Please retry from Upcoming Events.',
        variant: 'destructive',
      });
    }
  }, [argyleFlow, argylePrefillError, toast]);

  // Fetch organization intelligence data
  const { data: organizationIntelligence } = useQuery({
    queryKey: ['client-portal-organization-intelligence'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/client-portal/settings/organization-intelligence', {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) return null;
        return res.json();
      } catch (error) {
        console.error('Failed to fetch organization intelligence:', error);
        return null;
      }
    },
  });

  // Fetch campaign pricing data
  const { data: pricingData } = useQuery;
    hasCustomPricing: boolean;
  }>({
    queryKey: ['client-portal-campaign-pricing'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/campaign-pricing', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Build program types list — use custom pricing if available, else defaults
  const programTypes = pricingData?.hasCustomPricing
    ? Object.entries(pricingData.pricing)
        .filter(([, config]) => config.isEnabled)
        .map(([key, config]) => {
          const defaultType = DEFAULT_PROGRAM_TYPES.find(d => d.key === key);
          return {
            key,
            label: config.label,
            price: config.pricePerLead,
            unit: key === 'data_hygiene_enrichment' ? 'per record' : 'per lead',
            icon: defaultType?.icon || Tag,
            colorClass: defaultType?.colorClass || 'text-slate-600 bg-slate-50 border-slate-200',
          };
        })
    : [];

  // Fetch existing projects for linking
  const { data: projects } = useQuery({
    queryKey: ['client-portal-projects-for-campaign'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns/projects-for-campaign', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Create campaign mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload: Record = {
        name: data.name,
        channel: data.channel,
        objective: data.objective,
      };
      // Optional fields — only include if provided
      if (data.description) payload.description = data.description;
      if (data.campaignType) payload.campaignType = data.campaignType;
      if (data.programType) payload.programType = data.programType;
      if (data.targetAudience) payload.targetAudience = data.targetAudience;
      if (data.targetLeadCount) payload.targetLeadCount = data.targetLeadCount;
      if (data.targetIndustries.length) payload.targetIndustries = data.targetIndustries;
      if (data.targetTitles.length) payload.targetTitles = data.targetTitles;
      if (data.targetRegions.length) payload.targetRegions = data.targetRegions;
      if (data.successCriteria) payload.successCriteria = data.successCriteria;
      if (data.startDate) payload.startDate = data.startDate;
      if (data.endDate) payload.endDate = data.endDate;
      if (data.budget) payload.budget = data.budget;
      if (data.priority !== 'normal') payload.priority = data.priority;
      if (data.emailSubject) payload.emailSubject = data.emailSubject;
      if (data.emailBody) payload.emailBody = data.emailBody;
      if (data.callScript) payload.callScript = data.callScript;
      if (data.projectId) payload.projectId = data.projectId;
      if (data.landingPageUrl) payload.landingPageUrl = data.landingPageUrl;
      if (data.referenceUrls.length) payload.referenceUrls = data.referenceUrls;
      if (argyleFlow) {
        payload.argyleFlow = true;
        if (argyleEventId) payload.externalEventId = argyleEventId;
        if (argyleDraftId) payload.argyleDraftId = argyleDraftId;
      }

      // Build multipart form with files attached
      const body = new globalThis.FormData();
      body.append('data', JSON.stringify(payload));

      for (const att of data.attachments) {
        body.append('files', att.file, att.name);
        body.append('fileCategories', att.category);
      }

      const res = await fetch('/api/client-portal/campaigns/quick-create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to create campaign' }));
        throw new Error(err.message || 'Failed to create campaign');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const isResubmission = argyleFlow && argylePrefill?.status === 'rejected';
      setCreatedCampaign(data.campaign);
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['client-portal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-projects'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['argyle-events'] });
      queryClient.invalidateQueries({ queryKey: ['argyle-campaign-prefill', argyleEventId, argyleDraftId] });
      toast({
        title: isResubmission ? 'Resubmitted for review' : 'Campaign Submitted',
        description: isResubmission
          ? 'Your campaign has been resubmitted and is now pending admin review.'
          : 'Your campaign has been submitted for project approval.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // ── Validation ─────────────────────────────

  const validateStep = (s: number): boolean => {
    switch (s) {
      case 0: return form.channel !== '';
      case 1: return form.name.trim().length > 0 && form.objective.trim().length > 0;
      case 2: return argyleFlow ? !!form.targetLeadCount && form.targetLeadCount > 0 : true;
      case 3: return true;
      default: return true;
    }
  };

  const canProceed = validateStep(step);

  // ── Tag helpers ────────────────────────────

  const addTag = (
    field: 'targetIndustries' | 'targetTitles' | 'targetRegions',
    value: string,
    setter: (v: string) => void
  ) => {
    const trimmed = value.trim();
    if (trimmed && !form[field].includes(trimmed)) {
      setForm({ ...form, [field]: [...form[field], trimmed] });
    }
    setter('');
  };

  const removeTag = (
    field: 'targetIndustries' | 'targetTitles' | 'targetRegions',
    value: string
  ) => {
    setForm({ ...form, [field]: form[field].filter((t) => t !== value) });
  };

  // ── URL helpers ────────────────────────────

  const addUrl = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !form.referenceUrls.includes(trimmed)) {
      setForm({ ...form, referenceUrls: [...form.referenceUrls, trimmed] });
    }
    setUrlInput('');
  };

  const removeUrl = (value: string) => {
    setForm({ ...form, referenceUrls: form.referenceUrls.filter((u) => u !== value) });
  };

  // ── File upload helpers ────────────────────

  const handleFileSelect = (
    event: React.ChangeEvent,
    category: FileAttachment['category']
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `"${file.name}" exceeds 10MB limit`,
          variant: 'destructive',
        });
        continue;
      }

      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setForm((prev) => ({
        ...prev,
        attachments: [
          ...prev.attachments,
          { id: fileId, name: file.name, size: file.size, type: file.type, category, file },
        ],
      }));
    }

    event.target.value = '';
  };

  // ── Organization Intelligence helpers ────

  const populateFromOrganizationIntelligence = async () => {
    if (!organizationIntelligence?.organization) {
      toast({
        title: 'No Organization Intelligence',
        description: 'Please set up your organization profile first.',
        variant: 'destructive',
      });
      return;
    }

    setOrgIntelligenceLoading(true);
    try {
      const org = organizationIntelligence.organization;
      const updates: Partial = {};

      // Populate target industries from org intelligence
      if (org.icp?.industries) {
        const industries = Array.isArray(org.icp.industries)
          ? org.icp.industries
          : typeof org.icp.industries === 'string'
          ? org.icp.industries.split(',').map((i: string) => i.trim()).filter((i: string) => i)
          : [];
        if (industries.length > 0) {
          updates.targetIndustries = [...new Set([...form.targetIndustries, ...industries])];
        }
      } else if (org.identity?.industry) {
        if (!form.targetIndustries.includes(org.identity.industry)) {
          updates.targetIndustries = [...form.targetIndustries, org.identity.industry];
        }
      }

      // Populate target job titles from org ICP personas
      if (org.icp?.personas) {
        const personas = Array.isArray(org.icp.personas)
          ? org.icp.personas.map((p: any) => typeof p === 'string' ? p : p.title || '')
          : typeof org.icp.personas === 'string'
          ? org.icp.personas.split(',').map((p: string) => p.trim()).filter((p: string) => p)
          : [];
        const titles = personas.filter((t: string) => t && !form.targetTitles.includes(t));
        if (titles.length > 0) {
          updates.targetTitles = [...form.targetTitles, ...titles];
        }
      }

      // Populate target regions
      if (org.identity?.regions) {
        const regions = Array.isArray(org.identity.regions)
          ? org.identity.regions
          : typeof org.identity.regions === 'string'
          ? org.identity.regions.split(',').map((r: string) => r.trim()).filter((r: string) => r)
          : [];
        const newRegions = regions.filter((r: string) => r && !form.targetRegions.includes(r));
        if (newRegions.length > 0) {
          updates.targetRegions = [...form.targetRegions, ...newRegions];
        }
      }

      // Populate target audience from org description or ICP
      if (!form.targetAudience) {
        let audience = '';
        if (org.icp?.companySize) {
          audience = `${org.icp.companySize} companies`;
        }
        if (org.identity?.description) {
          audience += (audience ? ' - ' : '') + org.identity.description;
        }
        if (audience) {
          updates.targetAudience = audience.slice(0, 500); // Limit to textarea capacity
        }
      }

      // Populate success criteria if not set
      if (!form.successCriteria && org.offerings?.useCases) {
        const useCases = Array.isArray(org.offerings.useCases)
          ? org.offerings.useCases.slice(0, 2).join(', ')
          : typeof org.offerings.useCases === 'string'
          ? org.offerings.useCases.split(',').slice(0, 2).join(', ')
          : '';
        if (useCases) {
          updates.successCriteria = `Successfully execute ${useCases} use cases`;
        }
      }

      // Apply updates
      setForm(prev => ({ ...prev, ...updates }));
      setShowOrgIntelligenceOptions(false);
      toast({
        title: 'Organization Intelligence Applied',
        description: 'Campaign details populated from your organization profile.',
      });
    } catch (error) {
      console.error('Error populating from organization intelligence:', error);
      toast({
        title: 'Error',
        description: 'Failed to populate campaign details.',
        variant: 'destructive',
      });
    } finally {
      setOrgIntelligenceLoading(false);
    }
  };

  const removeAttachment = (id: string) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((a) => a.id !== id),
    }));
  };

  const getAttachmentsByCategory = (category: FileAttachment['category']) =>
    form.attachments.filter((a) => a.category === category);

  const hasAttachments = form.attachments.length > 0;

  // ── Render Steps ───────────────────────────

  const renderChannelStep = () => (
    
      
        Choose Your Campaign Channel
        
          Select how you want to reach your target audience. This is the only required choice.
        
      

       {
          if (argyleFlow) {
            setForm((prev) => ({ ...prev, channel: 'email' }));
            return;
          }
          setForm({ ...form, channel: v as FormData['channel'] });
        }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {/* Phone / Voice */}
        
          
          
            
          
          
            Phone Campaign
            
              AI-powered voice calls to engage prospects directly
            
          
          {form.channel === 'voice' && (
            Selected
          )}
        

        {/* Email */}
        
          
          
            
          
          
            Email Campaign
            
              Personalized email outreach with AI-generated content
            
          
          {form.channel === 'email' && (
            Selected
          )}
        

        {/* Combo */}
        
          
          
            
          
          
            Phone + Email
            
              Multi-channel outreach combining voice and email
            
          
          {form.channel === 'combo' && (
            Selected
          )}
        
      
      {argyleFlow && (
        
          This event-driven flow is locked to Email.
        
      )}
    
  );

  const renderBasicsStep = () => (
    
      
        Campaign Basics
        
          Give your campaign a name and describe what you want to achieve.
          * marks required fields.
        
      

      {/* Campaign Name */}
      
        
          Campaign Name *
        
         setForm({ ...form, name: e.target.value })}
          className="max-w-lg"
        />
      

      {/* Objective */}
      
        
          Campaign Objective *
        
         setForm({ ...form, objective: e.target.value })}
          rows={3}
          className="max-w-lg"
        />
        
          Describe what you want this campaign to accomplish
        
      

      {/* Description (optional) */}
      
        
          Additional Description (optional)
        
         setForm({ ...form, description: e.target.value })}
          rows={2}
          className="max-w-lg"
        />
      

      {/* Program Type & Pricing (optional) — only shown when client has custom pricing configured */}
      {programTypes.length > 0 && (
        
           Campaign Program & Pricing (optional)
        
        
          Select a program type to see per-lead pricing. Our team can help configure this later if needed.
        
        
          {programTypes.map((pt) => {
            const PtIcon = pt.icon;
            const isSelected = form.programType === pt.key;
            return (
               setForm({ ...form, programType: isSelected ? '' : pt.key })}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm group',
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted hover:border-primary/30'
                )}
              >
                
                  
                
                
                  {pt.label}
                  {pt.unit}
                
                
                  ${pt.price 
              
            );
          })}
        
      )}

      {/* Link to existing project (optional) */}
      {projects && projects.length > 0 && (
        
          
            Link to Project (optional)
          
           setForm({ ...form, projectId: v === 'new' ? '' : v })}
          >
            
              
            
            
              
                
                   Create new project automatically
                
              
              {projects.map((p) => (
                
                  
                    {p.name}
                    
                      {p.status}
                    
                  
                
              ))}
            
          
          
            Link to an existing project or we'll create one automatically
          
        
      )}

      {/* Channel-specific quick input */}
      {(form.channel === 'email' || form.channel === 'combo') && (
        
          
            Email Subject Line (optional)
          
           setForm({ ...form, emailSubject: e.target.value })}
            className="max-w-lg"
          />
        
      )}

      {(form.channel === 'voice' || form.channel === 'combo') && (
        
          
            Opening Call Script (optional)
          
           setForm({ ...form, callScript: e.target.value })}
            rows={3}
            className="max-w-lg"
          />
        
      )}
    
  );

  const renderDetailsStep = () => (
    
      
        Campaign Details
        
          All fields below are optional. Fill in what you can — our team will help configure the rest.
        
      

      {/* Organization Intelligence CTA */}
      {organizationIntelligence?.organization && (
        
          
            
              
              
                Organization Intelligence
                
                  Automatically populate campaign details from your organization profile.
                
              
            
            
              {orgInteligenceLoading ? (
                <>
                  
                  Loading...
                
              ) : (
                <>
                  
                  Populate
                
              )}
            
          
        
      )}

      
        {/* Left column */}
        
          {/* Target Audience */}
          
            
               Target Audience
            
             setForm({ ...form, targetAudience: e.target.value })}
              rows={2}
            />
          

          {/* Target Lead Count */}
          
            
               Target Lead Count
              {argyleFlow && *}
            
             setForm({ ...form, targetLeadCount: e.target.value ? parseInt(e.target.value) : undefined })}
            />
            {argyleFlow && (
              Required for event campaign launch.
            )}
          

          {/* Industries (tag input) */}
          
            
               Target Industries
            
            
               setIndustryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('targetIndustries', industryInput, setIndustryInput);
                  }
                }}
              />
               addTag('targetIndustries', industryInput, setIndustryInput)}
              >
                Add
              
            
            {form.targetIndustries.length > 0 && (
              
                {form.targetIndustries.map((t) => (
                  
                    {t}
                     removeTag('targetIndustries', t)} />
                  
                ))}
              
            )}
          

          {/* Job Titles (tag input) */}
          
            
               Target Job Titles
            
            
               setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('targetTitles', titleInput, setTitleInput);
                  }
                }}
              />
               addTag('targetTitles', titleInput, setTitleInput)}
              >
                Add
              
            
            {form.targetTitles.length > 0 && (
              
                {form.targetTitles.map((t) => (
                  
                    {t}
                     removeTag('targetTitles', t)} />
                  
                ))}
              
            )}
          
        

        {/* Right column */}
        
          {/* Regions (tag input) */}
          
            
               Target Regions
            
            
               setRegionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('targetRegions', regionInput, setRegionInput);
                  }
                }}
              />
               addTag('targetRegions', regionInput, setRegionInput)}
              >
                Add
              
            
            {form.targetRegions.length > 0 && (
              
                {form.targetRegions.map((t) => (
                  
                    {t}
                     removeTag('targetRegions', t)} />
                  
                ))}
              
            )}
          

          {/* Success Criteria */}
          
            
              Success Criteria
            
             setForm({ ...form, successCriteria: e.target.value })}
              rows={2}
            />
          

          {/* Budget */}
          
            
               Estimated Budget
            
             setForm({ ...form, budget: e.target.value ? parseFloat(e.target.value) : undefined })}
            />
          

          {/* Timeline */}
          
            
              
                 Start Date
              
               setForm({ ...form, startDate: e.target.value })}
              />
            
            
              
                 End Date
              
               setForm({ ...form, endDate: e.target.value })}
              />
            
          

          {/* Priority */}
          
            Priority
             setForm({ ...form, priority: v as FormData['priority'] })}
            >
              
                
              
              
                Low
                Normal
                High
                Urgent
              
            
          
        
      

      {/* ── File Uploads & URLs ─────────────────── */}
      

      
        Uploads & Resources
        
          Attach target lists, suppression lists, PDF assets, or reference URLs for your campaign. All uploads are optional.
        
      

      
        {/* Target Accounts List */}
        
          
             Target Accounts List
          
          
            
            CSV or Excel file with target accounts
            
              
                 Choose File
              
               handleFileSelect(e, 'target_accounts')}
              />
            
          
          {getAttachmentsByCategory('target_accounts').map((att) => (
            
              
              {att.name}
              {formatFileSize(att.size)}
               removeAttachment(att.id)}>
                
              
            
          ))}
        

        {/* Suppression List */}
        
          
             Suppression List
          
          
            
            Contacts or domains to exclude
            
              
                 Choose File
              
               handleFileSelect(e, 'suppression_list')}
              />
            
          
          {getAttachmentsByCategory('suppression_list').map((att) => (
            
              
              {att.name}
              {formatFileSize(att.size)}
               removeAttachment(att.id)}>
                
              
            
          ))}
        
      

      {/* PDF Assets / Documents */}
      
        
           PDF Assets & Documents
        
        
          
          Brochures, whitepapers, case studies, or other documents
          
            
               Choose Files
            
             handleFileSelect(e, 'asset')}
            />
          
        
        {getAttachmentsByCategory('asset').map((att) => (
          
            
            {att.name}
            {formatFileSize(att.size)}
             removeAttachment(att.id)}>
              
            
          
        ))}
      

      {/* Reference URLs */}
      
        
           Reference URLs
        
        
           setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addUrl(urlInput);
              }
            }}
          />
           addUrl(urlInput)}>
            Add
          
        
        {form.referenceUrls.map((url) => (
          
            
            
              {url}
            
             removeUrl(url)}>
              
            
          
        ))}
      

      {/* Landing Page URL */}
      
        
           Landing Page URL
        
         setForm({ ...form, landingPageUrl: e.target.value })}
          className="max-w-lg"
        />
        
          Where prospects should be directed after engagement
        
      
    
  );

  const renderReviewStep = () => {
    const channelLabel = form.channel === 'voice' ? 'Phone' : form.channel === 'email' ? 'Email' : 'Phone + Email';
    const channelIcon = form.channel === 'voice' ? Phone : form.channel === 'email' ? Mail : Layers;
    const ChannelIcon = channelIcon;

    return (
      
        
          Review & Submit
          
            Review your campaign details before submitting. Your campaign requires project approval before activation.
          
        

        {/* Approval notice */}
        
          
          
            Project Approval Required
            
              Both campaign creation and work orders require project approval. Your campaign will be submitted for review and activated once approved by the team.
            
          
        

        {/* Summary Cards */}
        
          {/* Campaign Info */}
          
            
              
                
                Campaign Overview
              
            
            
              
                Name
                {form.name}
              
              
                Channel
                {channelLabel}
              
              {form.programType && (() => {
                const pt = programTypes.find(p => p.key === form.programType);
                return pt ? (
                  
                    Program
                    
                      {pt.label} — ${pt.price 
                  
                ) : null;
              })()}
              {form.priority !== 'normal' && (
                
                  Priority
                  
                    {form.priority}
                  
                
              )}
              {form.projectId && (
                
                  Project
                  
                    {projects?.find(p => p.id === form.projectId)?.name || 'Linked'}
                  
                
              )}
            
          

          {/* Targeting */}
          
            
              
                
                Targeting (optional details)
              
            
            
              {form.targetLeadCount && (
                
                  Lead Count
                  {form.targetLeadCount.toLocaleString()}
                
              )}
              {form.targetIndustries.length > 0 && (
                
                  Industries
                  
                    {form.targetIndustries.map(t => (
                      {t}
                    ))}
                  
                
              )}
              {form.targetTitles.length > 0 && (
                
                  Titles
                  
                    {form.targetTitles.map(t => (
                      {t}
                    ))}
                  
                
              )}
              {form.budget && (
                
                  Budget
                  ${form.budget.toLocaleString()}
                
              )}
              {!form.targetLeadCount && form.targetIndustries.length === 0 && form.targetTitles.length === 0 && !form.budget && (
                
                  No targeting details provided — our team will configure this for you.
                
              )}
            
          
        

        {/* Objective */}
        
          
            Campaign Objective
          
          
            {form.objective}
            {form.successCriteria && (
              <>
                
                Success Criteria
                {form.successCriteria}
              
            )}
          
        

        {/* Channel-specific content */}
        {(form.emailSubject || form.emailBody || form.callScript) && (
          
            
              Content Preview
            
            
              {form.emailSubject && (
                
                  Email Subject
                  {form.emailSubject}
                
              )}
              {form.emailBody && (
                
                  Email Body
                  {form.emailBody}
                
              )}
              {form.callScript && (
                
                  Opening Script
                  {form.callScript}
                
              )}
            
          
        )}

        {/* Uploaded Files & URLs */}
        {(form.attachments.length > 0 || form.referenceUrls.length > 0 || form.landingPageUrl) && (
          
            
              
                
                Uploads & Resources
              
            
            
              {getAttachmentsByCategory('target_accounts').length > 0 && (
                
                  Target Accounts List
                  {getAttachmentsByCategory('target_accounts').map((att) => (
                    
                      
                      {att.name}
                      ({formatFileSize(att.size)})
                    
                  ))}
                
              )}
              {getAttachmentsByCategory('suppression_list').length > 0 && (
                
                  Suppression List
                  {getAttachmentsByCategory('suppression_list').map((att) => (
                    
                      
                      {att.name}
                      ({formatFileSize(att.size)})
                    
                  ))}
                
              )}
              {getAttachmentsByCategory('asset').length > 0 && (
                
                  PDF Assets & Documents
                  {getAttachmentsByCategory('asset').map((att) => (
                    
                      
                      {att.name}
                      ({formatFileSize(att.size)})
                    
                  ))}
                
              )}
              {form.referenceUrls.length > 0 && (
                
                  Reference URLs
                  {form.referenceUrls.map((url) => (
                    
                      
                      
                        {url}
                      
                    
                  ))}
                
              )}
              {form.landingPageUrl && (
                
                  Landing Page
                  
                    {form.landingPageUrl}
                  
                
              )}
            
          
        )}
      
    );
  };

  // ── Step Rendering ─────────────────────────

  const renderStep = () => {
    switch (step) {
      case 0: return renderChannelStep();
      case 1: return renderBasicsStep();
      case 2: return renderDetailsStep();
      case 3: return renderReviewStep();
      default: return null;
    }
  };

  // ── Success Dialog ─────────────────────────

  const handleSuccessClose = () => {
    setShowSuccess(false);
    navigate('/client-portal/dashboard?tab=work-orders');
  };

  // ── Main Layout ────────────────────────────

  if (argyleFlow && argylePrefillLoading) {
    return (
      
        
          
            
              
              Loading event campaign draft...
            
          
        
      
    );
  }

  return (
    
      
        {/* Header */}
        
          
            
              
              {argyleFlow ? 'Create Event Email Campaign' : 'Create Campaign'}
            
            
              {argyleFlow
                ? 'Prefilled from your upcoming event. Review, edit, set lead volume, and submit for approval.'
                : 'Launch a new email or phone campaign with simplified setup'}
            
          
           navigate(argyleFlow ? '/client-portal/dashboard?tab=argyle-events' : '/client-portal/dashboard?tab=campaigns')}
          >
             Back
          
        

        {argyleFlow && argylePrefill?.prefill?.eventSummary && (
          
            
              {argylePrefill.prefill.eventSummary.title || 'Upcoming Event'}
              
                {[argylePrefill.prefill.eventSummary.type, argylePrefill.prefill.eventSummary.date, argylePrefill.prefill.eventSummary.location]
                  .filter(Boolean)
                  .join(' • ') || 'Event metadata'}
              
            
          
        )}

        {argyleFlow && argylePrefill?.status === 'rejected' && !showSuccess && (
          
            
              Request Rejected
              {argylePrefill.rejectionReason ? (
                
                  Reason: {argylePrefill.rejectionReason}
                
              ) : (
                Please update the draft and resubmit.
              )}
            
          
        )}

        {/* Step Progress */}
        
          
            {STEPS.map((s, i) => {
              const StepIcon = s.icon;
              const isActive = i === step;
              const isComplete = i  { if (i 
                  
                    {isComplete ? (
                      
                    ) : (
                      
                    )}
                  
                  {s.label}
                
              );
            })}
          
          
        

        {/* Step Content */}
        
          
            {renderStep()}
          
          
             step > 0 ? setStep(step - 1) : navigate('/client-portal/dashboard?tab=campaigns')}
            >
              
              {step === 0 ? 'Cancel' : 'Back'}
            

            {step  setStep(step + 1)}
                disabled={!canProceed}
              >
                Next
                
              
            ) : (
               createMutation.mutate(form)}
                disabled={
                  createMutation.isPending ||
                  !form.name ||
                  !form.channel ||
                  !form.objective ||
                  (argyleFlow && (!form.targetLeadCount || form.targetLeadCount 
                {createMutation.isPending ? (
                  <>
                    
                    Submitting...
                  
                ) : (
                  <>
                    
                    Submit for Approval
                  
                )}
              
            )}
          
        

        {/* Info banner */}
        
          
          
            How it works
            
              1. Fill in campaign name, channel, and objective (required)
              2. Add targeting details if you have them ({argyleFlow ? 'target lead volume is required' : 'optional — our team can do this'})
              3. Submit — a project is created and sent for approval
              4. Once approved, our team activates your campaign
            
          
        
      

      {/* Success Dialog */}
      
        
          
            
              
                
              
            
            Campaign Submitted!
            
              Your campaign {createdCampaign?.name} has been submitted for project approval.
              You'll be notified once it's approved and activated.
            
          
          
            
              Order Number
              {createdCampaign?.orderNumber}
            
            
              Status
              {createdCampaign?.status}
            
            
              Channel
              {createdCampaign?.channel}
            
          
          
            
              View Work Orders
            
          
        
      
    
  );
}