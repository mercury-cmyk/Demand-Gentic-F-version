/**
 * Client Portal — Simplified Campaign Creation
 *
 * Allows clients to create email or phone campaigns with minimal mandatory info.
 * Campaign creation is optional and requires project approval before execution.
 * Creates a project (pending) + work order in one step.
 */

import { useState } from 'react';
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
  Upload, File, Trash2, Link as LinkIcon, ShieldBan, Database, Paperclip
} from 'lucide-react';
import { cn } from '@/lib/utils';

const getToken = () => localStorage.getItem('clientPortalToken');

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DEFAULT_FORM: FormData = {
  name: '',
  channel: '',
  objective: '',
  description: '',
  campaignType: '',
  targetAudience: '',
  targetLeadCount: undefined,
  targetIndustries: [],
  targetTitles: [],
  targetRegions: [],
  successCriteria: '',
  startDate: '',
  endDate: '',
  budget: undefined,
  priority: 'normal',
  emailSubject: '',
  emailBody: '',
  callScript: '',
  projectId: '',
  attachments: [],
  referenceUrls: [],
  landingPageUrl: '',
};

// ── Steps ──────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'channel', label: 'Channel', icon: Megaphone },
  { id: 'basics', label: 'Basics', icon: FileText },
  { id: 'details', label: 'Details', icon: Target },
  { id: 'review', label: 'Review', icon: CheckCircle2 },
] as const;

// ── Component ──────────────────────────────────────────────────────────────

export default function ClientPortalCampaignCreate() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({ ...DEFAULT_FORM });
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdCampaign, setCreatedCampaign] = useState<any>(null);
  const [industryInput, setIndustryInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [regionInput, setRegionInput] = useState('');
  const [urlInput, setUrlInput] = useState('');

  // Fetch existing projects for linking
  const { data: projects } = useQuery<Project[]>({
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
      const payload: Record<string, unknown> = {
        name: data.name,
        channel: data.channel,
        objective: data.objective,
      };
      // Optional fields — only include if provided
      if (data.description) payload.description = data.description;
      if (data.campaignType) payload.campaignType = data.campaignType;
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
      setCreatedCampaign(data.campaign);
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['client-portal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-projects'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-work-orders'] });
      toast({
        title: 'Campaign Submitted',
        description: 'Your campaign has been submitted for project approval.',
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
      case 2: return true; // Details are all optional
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
    event: React.ChangeEvent<HTMLInputElement>,
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Choose Your Campaign Channel</h2>
        <p className="text-muted-foreground text-sm">
          Select how you want to reach your target audience. This is the only required choice.
        </p>
      </div>

      <RadioGroup
        value={form.channel}
        onValueChange={(v) => setForm({ ...form, channel: v as FormData['channel'] })}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {/* Phone / Voice */}
        <Label
          htmlFor="channel-voice"
          className={cn(
            'flex flex-col items-center gap-3 rounded-xl border-2 p-6 cursor-pointer transition-all hover:shadow-md',
            form.channel === 'voice'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-muted hover:border-primary/30'
          )}
        >
          <RadioGroupItem value="voice" id="channel-voice" className="sr-only" />
          <div className={cn(
            'rounded-full p-4',
            form.channel === 'voice' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            <Phone className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-base">Phone Campaign</p>
            <p className="text-xs text-muted-foreground mt-1">
              AI-powered voice calls to engage prospects directly
            </p>
          </div>
          {form.channel === 'voice' && (
            <Badge variant="default" className="mt-1">Selected</Badge>
          )}
        </Label>

        {/* Email */}
        <Label
          htmlFor="channel-email"
          className={cn(
            'flex flex-col items-center gap-3 rounded-xl border-2 p-6 cursor-pointer transition-all hover:shadow-md',
            form.channel === 'email'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-muted hover:border-primary/30'
          )}
        >
          <RadioGroupItem value="email" id="channel-email" className="sr-only" />
          <div className={cn(
            'rounded-full p-4',
            form.channel === 'email' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            <Mail className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-base">Email Campaign</p>
            <p className="text-xs text-muted-foreground mt-1">
              Personalized email outreach with AI-generated content
            </p>
          </div>
          {form.channel === 'email' && (
            <Badge variant="default" className="mt-1">Selected</Badge>
          )}
        </Label>

        {/* Combo */}
        <Label
          htmlFor="channel-combo"
          className={cn(
            'flex flex-col items-center gap-3 rounded-xl border-2 p-6 cursor-pointer transition-all hover:shadow-md',
            form.channel === 'combo'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-muted hover:border-primary/30'
          )}
        >
          <RadioGroupItem value="combo" id="channel-combo" className="sr-only" />
          <div className={cn(
            'rounded-full p-4',
            form.channel === 'combo' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            <Layers className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-base">Phone + Email</p>
            <p className="text-xs text-muted-foreground mt-1">
              Multi-channel outreach combining voice and email
            </p>
          </div>
          {form.channel === 'combo' && (
            <Badge variant="default" className="mt-1">Selected</Badge>
          )}
        </Label>
      </RadioGroup>
    </div>
  );

  const renderBasicsStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Campaign Basics</h2>
        <p className="text-muted-foreground text-sm">
          Give your campaign a name and describe what you want to achieve.
          <span className="text-red-500 ml-1">*</span> marks required fields.
        </p>
      </div>

      {/* Campaign Name */}
      <div className="space-y-2">
        <Label htmlFor="name" className="font-medium">
          Campaign Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          placeholder="e.g., Q1 Enterprise Outreach"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="max-w-lg"
        />
      </div>

      {/* Objective */}
      <div className="space-y-2">
        <Label htmlFor="objective" className="font-medium">
          Campaign Objective <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="objective"
          placeholder="e.g., Generate qualified leads for our new SaaS product among enterprise IT decision-makers..."
          value={form.objective}
          onChange={(e) => setForm({ ...form, objective: e.target.value })}
          rows={3}
          className="max-w-lg"
        />
        <p className="text-xs text-muted-foreground">
          Describe what you want this campaign to accomplish
        </p>
      </div>

      {/* Description (optional) */}
      <div className="space-y-2">
        <Label htmlFor="description" className="font-medium">
          Additional Description <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Textarea
          id="description"
          placeholder="Any additional context about this campaign..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="max-w-lg"
        />
      </div>

      {/* Link to existing project (optional) */}
      {projects && projects.length > 0 && (
        <div className="space-y-2">
          <Label className="font-medium">
            Link to Project <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Select
            value={form.projectId || 'new'}
            onValueChange={(v) => setForm({ ...form, projectId: v === 'new' ? '' : v })}
          >
            <SelectTrigger className="max-w-lg">
              <SelectValue placeholder="Create new project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">
                <span className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" /> Create new project automatically
                </span>
              </SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    {p.name}
                    <Badge variant="outline" className="text-[10px] ml-1">
                      {p.status}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Link to an existing project or we'll create one automatically
          </p>
        </div>
      )}

      {/* Channel-specific quick input */}
      {(form.channel === 'email' || form.channel === 'combo') && (
        <div className="space-y-2">
          <Label htmlFor="emailSubject" className="font-medium">
            Email Subject Line <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="emailSubject"
            placeholder="e.g., Unlock 3x pipeline growth with AI..."
            value={form.emailSubject}
            onChange={(e) => setForm({ ...form, emailSubject: e.target.value })}
            className="max-w-lg"
          />
        </div>
      )}

      {(form.channel === 'voice' || form.channel === 'combo') && (
        <div className="space-y-2">
          <Label htmlFor="callScript" className="font-medium">
            Opening Call Script <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Textarea
            id="callScript"
            placeholder="e.g., Hi [Name], this is [Agent] from [Company]. I'm reaching out because..."
            value={form.callScript}
            onChange={(e) => setForm({ ...form, callScript: e.target.value })}
            rows={3}
            className="max-w-lg"
          />
        </div>
      )}
    </div>
  );

  const renderDetailsStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Campaign Details</h2>
        <p className="text-muted-foreground text-sm">
          All fields below are <strong>optional</strong>. Fill in what you can — our team will help configure the rest.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Target Audience */}
          <div className="space-y-2">
            <Label htmlFor="targetAudience" className="font-medium flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Target Audience
            </Label>
            <Textarea
              id="targetAudience"
              placeholder="e.g., VP/Director of IT at mid-market SaaS companies (500-2000 employees)"
              value={form.targetAudience}
              onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
              rows={2}
            />
          </div>

          {/* Target Lead Count */}
          <div className="space-y-2">
            <Label htmlFor="targetLeadCount" className="font-medium flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Target Lead Count
            </Label>
            <Input
              id="targetLeadCount"
              type="number"
              placeholder="e.g., 500"
              value={form.targetLeadCount ?? ''}
              onChange={(e) => setForm({ ...form, targetLeadCount: e.target.value ? parseInt(e.target.value) : undefined })}
            />
          </div>

          {/* Industries (tag input) */}
          <div className="space-y-2">
            <Label className="font-medium flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Target Industries
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Technology"
                value={industryInput}
                onChange={(e) => setIndustryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('targetIndustries', industryInput, setIndustryInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag('targetIndustries', industryInput, setIndustryInput)}
              >
                Add
              </Button>
            </div>
            {form.targetIndustries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.targetIndustries.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag('targetIndustries', t)} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Job Titles (tag input) */}
          <div className="space-y-2">
            <Label className="font-medium flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Target Job Titles
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., CTO, VP Engineering"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('targetTitles', titleInput, setTitleInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag('targetTitles', titleInput, setTitleInput)}
              >
                Add
              </Button>
            </div>
            {form.targetTitles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.targetTitles.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag('targetTitles', t)} />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Regions (tag input) */}
          <div className="space-y-2">
            <Label className="font-medium flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Target Regions
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., North America"
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('targetRegions', regionInput, setRegionInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag('targetRegions', regionInput, setRegionInput)}
              >
                Add
              </Button>
            </div>
            {form.targetRegions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.targetRegions.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag('targetRegions', t)} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Success Criteria */}
          <div className="space-y-2">
            <Label htmlFor="successCriteria" className="font-medium">
              Success Criteria
            </Label>
            <Textarea
              id="successCriteria"
              placeholder="e.g., 50+ qualified meetings booked, 15% response rate..."
              value={form.successCriteria}
              onChange={(e) => setForm({ ...form, successCriteria: e.target.value })}
              rows={2}
            />
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <Label htmlFor="budget" className="font-medium flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Estimated Budget
            </Label>
            <Input
              id="budget"
              type="number"
              placeholder="e.g., 5000"
              value={form.budget ?? ''}
              onChange={(e) => setForm({ ...form, budget: e.target.value ? parseFloat(e.target.value) : undefined })}
            />
          </div>

          {/* Timeline */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="font-medium flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Start Date
              </Label>
              <Input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="font-medium flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> End Date
              </Label>
              <Input
                id="endDate"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="font-medium">Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => setForm({ ...form, priority: v as FormData['priority'] })}
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
        </div>
      </div>

      {/* ── File Uploads & URLs ─────────────────── */}
      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-1">Uploads & Resources</h3>
        <p className="text-muted-foreground text-xs mb-4">
          Attach target lists, suppression lists, PDF assets, or reference URLs for your campaign. All uploads are optional.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Target Accounts List */}
        <div className="space-y-3">
          <Label className="font-medium flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> Target Accounts List
          </Label>
          <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">CSV or Excel file with target accounts</p>
            <label className="cursor-pointer">
              <Button type="button" variant="outline" size="sm" asChild>
                <span><Paperclip className="h-3.5 w-3.5 mr-1" /> Choose File</span>
              </Button>
              <input
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileSelect(e, 'target_accounts')}
              />
            </label>
          </div>
          {getAttachmentsByCategory('target_accounts').map((att) => (
            <div key={att.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded-md px-3 py-2">
              <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate flex-1">{att.name}</span>
              <span className="text-muted-foreground text-xs">{formatFileSize(att.size)}</span>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeAttachment(att.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        {/* Suppression List */}
        <div className="space-y-3">
          <Label className="font-medium flex items-center gap-1.5">
            <ShieldBan className="h-3.5 w-3.5" /> Suppression List
          </Label>
          <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">Contacts or domains to exclude</p>
            <label className="cursor-pointer">
              <Button type="button" variant="outline" size="sm" asChild>
                <span><Paperclip className="h-3.5 w-3.5 mr-1" /> Choose File</span>
              </Button>
              <input
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls,.txt"
                onChange={(e) => handleFileSelect(e, 'suppression_list')}
              />
            </label>
          </div>
          {getAttachmentsByCategory('suppression_list').map((att) => (
            <div key={att.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded-md px-3 py-2">
              <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate flex-1">{att.name}</span>
              <span className="text-muted-foreground text-xs">{formatFileSize(att.size)}</span>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeAttachment(att.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* PDF Assets / Documents */}
      <div className="space-y-3">
        <Label className="font-medium flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" /> PDF Assets & Documents
        </Label>
        <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-2">Brochures, whitepapers, case studies, or other documents</p>
          <label className="cursor-pointer">
            <Button type="button" variant="outline" size="sm" asChild>
              <span><Paperclip className="h-3.5 w-3.5 mr-1" /> Choose Files</span>
            </Button>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.pptx,.ppt"
              multiple
              onChange={(e) => handleFileSelect(e, 'asset')}
            />
          </label>
        </div>
        {getAttachmentsByCategory('asset').map((att) => (
          <div key={att.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded-md px-3 py-2">
            <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate flex-1">{att.name}</span>
            <span className="text-muted-foreground text-xs">{formatFileSize(att.size)}</span>
            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeAttachment(att.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Reference URLs */}
      <div className="space-y-3">
        <Label className="font-medium flex items-center gap-1.5">
          <LinkIcon className="h-3.5 w-3.5" /> Reference URLs
        </Label>
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com/resource"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addUrl(urlInput);
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => addUrl(urlInput)}>
            Add
          </Button>
        </div>
        {form.referenceUrls.map((url) => (
          <div key={url} className="flex items-center gap-2 text-sm bg-muted/50 rounded-md px-3 py-2">
            <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <a href={url} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-primary hover:underline">
              {url}
            </a>
            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeUrl(url)}>
              <X className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Landing Page URL */}
      <div className="space-y-2">
        <Label htmlFor="landingPageUrl" className="font-medium flex items-center gap-1.5">
          <LinkIcon className="h-3.5 w-3.5" /> Landing Page URL
        </Label>
        <Input
          id="landingPageUrl"
          placeholder="https://yourcompany.com/landing-page"
          value={form.landingPageUrl}
          onChange={(e) => setForm({ ...form, landingPageUrl: e.target.value })}
          className="max-w-lg"
        />
        <p className="text-xs text-muted-foreground">
          Where prospects should be directed after engagement
        </p>
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const channelLabel = form.channel === 'voice' ? 'Phone' : form.channel === 'email' ? 'Email' : 'Phone + Email';
    const channelIcon = form.channel === 'voice' ? Phone : form.channel === 'email' ? Mail : Layers;
    const ChannelIcon = channelIcon;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">Review & Submit</h2>
          <p className="text-muted-foreground text-sm">
            Review your campaign details before submitting. Your campaign requires project approval before activation.
          </p>
        </div>

        {/* Approval notice */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300 text-sm">Project Approval Required</p>
            <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
              Both campaign creation and work orders require project approval. Your campaign will be submitted for review and activated once approved by the team.
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Campaign Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ChannelIcon className="h-4 w-4" />
                Campaign Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Channel</span>
                <Badge variant="outline">{channelLabel}</Badge>
              </div>
              {form.priority !== 'normal' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge variant={form.priority === 'urgent' ? 'destructive' : 'secondary'}>
                    {form.priority}
                  </Badge>
                </div>
              )}
              {form.projectId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project</span>
                  <span className="font-medium text-xs">
                    {projects?.find(p => p.id === form.projectId)?.name || 'Linked'}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Targeting */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Targeting (optional details)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {form.targetLeadCount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lead Count</span>
                  <span className="font-medium">{form.targetLeadCount.toLocaleString()}</span>
                </div>
              )}
              {form.targetIndustries.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">Industries</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {form.targetIndustries.map(t => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {form.targetTitles.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">Titles</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {form.targetTitles.map(t => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {form.budget && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Budget</span>
                  <span className="font-medium">${form.budget.toLocaleString()}</span>
                </div>
              )}
              {!form.targetLeadCount && form.targetIndustries.length === 0 && form.targetTitles.length === 0 && !form.budget && (
                <p className="text-muted-foreground text-xs italic">
                  No targeting details provided — our team will configure this for you.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Objective */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Campaign Objective</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{form.objective}</p>
            {form.successCriteria && (
              <>
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground mb-1">Success Criteria</p>
                <p className="text-sm">{form.successCriteria}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Channel-specific content */}
        {(form.emailSubject || form.emailBody || form.callScript) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Content Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {form.emailSubject && (
                <div>
                  <p className="text-xs text-muted-foreground">Email Subject</p>
                  <p className="font-medium">{form.emailSubject}</p>
                </div>
              )}
              {form.emailBody && (
                <div>
                  <p className="text-xs text-muted-foreground">Email Body</p>
                  <p className="whitespace-pre-wrap">{form.emailBody}</p>
                </div>
              )}
              {form.callScript && (
                <div>
                  <p className="text-xs text-muted-foreground">Opening Script</p>
                  <p className="whitespace-pre-wrap">{form.callScript}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Uploaded Files & URLs */}
        {(form.attachments.length > 0 || form.referenceUrls.length > 0 || form.landingPageUrl) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Uploads & Resources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {getAttachmentsByCategory('target_accounts').length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Target Accounts List</p>
                  {getAttachmentsByCategory('target_accounts').map((att) => (
                    <div key={att.id} className="flex items-center gap-2">
                      <File className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{att.name}</span>
                      <span className="text-muted-foreground text-xs">({formatFileSize(att.size)})</span>
                    </div>
                  ))}
                </div>
              )}
              {getAttachmentsByCategory('suppression_list').length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Suppression List</p>
                  {getAttachmentsByCategory('suppression_list').map((att) => (
                    <div key={att.id} className="flex items-center gap-2">
                      <File className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{att.name}</span>
                      <span className="text-muted-foreground text-xs">({formatFileSize(att.size)})</span>
                    </div>
                  ))}
                </div>
              )}
              {getAttachmentsByCategory('asset').length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">PDF Assets & Documents</p>
                  {getAttachmentsByCategory('asset').map((att) => (
                    <div key={att.id} className="flex items-center gap-2">
                      <File className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{att.name}</span>
                      <span className="text-muted-foreground text-xs">({formatFileSize(att.size)})</span>
                    </div>
                  ))}
                </div>
              )}
              {form.referenceUrls.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reference URLs</p>
                  {form.referenceUrls.map((url) => (
                    <div key={url} className="flex items-center gap-2">
                      <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                        {url}
                      </a>
                    </div>
                  ))}
                </div>
              )}
              {form.landingPageUrl && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Landing Page</span>
                  <a href={form.landingPageUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate max-w-[250px]">
                    {form.landingPageUrl}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
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

  return (
    <ClientPortalLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Create Campaign
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Launch a new email or phone campaign with simplified setup
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/client-portal/dashboard?tab=campaigns')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>

        {/* Step Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const StepIcon = s.icon;
              const isActive = i === step;
              const isComplete = i < step;
              return (
                <button
                  key={s.id}
                  onClick={() => { if (i < step) setStep(i); }}
                  className={cn(
                    'flex items-center gap-2 text-sm transition-colors',
                    isActive && 'text-primary font-semibold',
                    isComplete && 'text-green-600 cursor-pointer hover:text-green-700',
                    !isActive && !isComplete && 'text-muted-foreground'
                  )}
                >
                  <div className={cn(
                    'rounded-full p-1.5',
                    isActive && 'bg-primary/10',
                    isComplete && 'bg-green-100 dark:bg-green-900/30',
                    !isActive && !isComplete && 'bg-muted'
                  )}>
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </div>
                  <span className="hidden md:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="pt-6 pb-4 px-6">
            {renderStep()}
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4">
            <Button
              variant="outline"
              onClick={() => step > 0 ? setStep(step - 1) : navigate('/client-portal/dashboard?tab=campaigns')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.name || !form.channel || !form.objective}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Submit for Approval
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How it works</p>
            <ul className="space-y-1 text-xs">
              <li>1. Fill in campaign name, channel, and objective (required)</li>
              <li>2. Add targeting details if you have them (optional — our team can do this)</li>
              <li>3. Submit — a project is created and sent for approval</li>
              <li>4. Once approved, our team activates your campaign</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={handleSuccessClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <DialogTitle className="text-center">Campaign Submitted!</DialogTitle>
            <DialogDescription className="text-center">
              Your campaign <strong>{createdCampaign?.name}</strong> has been submitted for project approval.
              You'll be notified once it's approved and activated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm px-2">
            <div className="flex justify-between text-muted-foreground">
              <span>Order Number</span>
              <span className="font-mono font-medium text-foreground">{createdCampaign?.orderNumber}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Status</span>
              <Badge variant="outline">{createdCampaign?.status}</Badge>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Channel</span>
              <Badge>{createdCampaign?.channel}</Badge>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button className="w-full" onClick={handleSuccessClose}>
              View Work Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPortalLayout>
  );
}
