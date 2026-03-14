import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  ChevronLeft,
  Shield,
  Search,
  Users,
  ToggleLeft,
  ToggleRight,
  Clock,
  History,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  Loader2,
  ChevronsUpDown,
  Check,
  Megaphone,
  Filter,
  CalendarIcon,
  StickyNote,
  Pencil,
  Mail,
  Plus,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// ==================== Types ====================

interface ClientAccount {
  id: string;
  name: string;
  companyName: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
  activeGrantCount: number;
}

interface PermissionGrant {
  id: string;
  feature: string;
  scopeType: string;
  scopeValue: any;
  isEnabled: boolean;
  config: any;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  notes: string | null;
}

interface AccessSummary {
  totalGrants: number;
  activeGrants: number;
  enabledFeatures: string[];
  matchedPreset: string | null;
  campaignAccessCount: number;
  hasExpiringGrants: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  feature: string | null;
  scopeType: string | null;
  scopeValue: any;
  previousState: any;
  newState: any;
  performedBy: string | null;
  performedAt: string;
  notes: string | null;
}

interface FeatureCategory {
  label: string;
  features: string[];
}

interface Preset {
  label: string;
  description: string;
  features: string[];
}

interface CampaignGrant {
  campaignId: string | null;
  regularCampaignId: string | null;
  grantedBy: string | null;
  createdAt: string;
}

interface CampaignOption {
  id: string;
  name: string;
  type: 'regular' | 'verification';
  status?: string;
}

interface FeatureGrantMeta {
  title: string;
  description: string;
  includes: string[];
  scopeOptions?: string[];
  configFields?: { key: string; label: string; type: 'number'; default?: number }[];
}

const FEATURE_GRANT_META: Record<string, FeatureGrantMeta> = {
  // === CRM & Pipeline ===
  accounts_contacts: {
    title: 'Accounts & Contacts',
    description: 'Access to the client CRM — manage accounts and contacts assigned to their campaigns.',
    includes: ['View and search accounts & contacts', 'Create and edit account records', 'Create and edit contact records', 'Link contacts to campaigns for outreach'],
    scopeOptions: ['all', 'campaign'],
  },
  bulk_upload: {
    title: 'Bulk Upload',
    description: 'Import large batches of accounts and contacts via CSV/Excel files.',
    includes: ['CSV/Excel file upload interface', 'Column mapping and validation', 'Import progress tracking', 'Import history and error reports'],
    configFields: [{ key: 'maxRowsPerImport', label: 'Max rows per import', type: 'number', default: 10000 }],
  },
  pipeline_view: {
    title: 'Pipeline & Projects',
    description: 'Access to pipeline kanban boards, deal tracking, and project management.',
    includes: ['Project list and details', 'Campaign-to-project associations', 'Delivery links and milestones', 'Activity cost breakdowns per project'],
    scopeOptions: ['all', 'project'],
  },
  segments_lists: {
    title: 'Segments & Lists',
    description: 'Create and manage account/contact segments and target lists for campaign targeting.',
    includes: ['Segment builder with filters', 'Target list creation and management', 'Segment-to-campaign assignment'],
  },
  lead_forms: {
    title: 'Lead Forms',
    description: 'Create and manage lead capture forms for inbound lead generation.',
    includes: ['Form builder interface', 'Published form links', 'Form submission tracking'],
  },
  // === Campaigns & Execution ===
  campaign_creation: {
    title: 'Campaign Creation',
    description: 'Create new campaigns using the campaign wizard with AI agent configuration.',
    includes: ['Campaign wizard (multi-step)', 'AI agent configuration', 'Audience upload and selection', 'Script builder and approval', 'Campaign scheduling'],
    scopeOptions: ['all', 'project'],
  },
  campaign_reports: {
    title: 'Campaign Reports',
    description: 'View campaign performance dashboards, call stats, and outcome reports.',
    includes: ['Campaign list with status indicators', 'Call volume and disposition breakdowns', 'Lead conversion metrics', 'Campaign timeline and history'],
    scopeOptions: ['all', 'campaign'],
  },
  campaign_queue_view: {
    title: 'Campaign Queue',
    description: 'View live campaign queue status, pending calls, and order management.',
    includes: ['Live queue status dashboard', 'Pending/active/completed call counts', 'Order submission and tracking', 'Queue priority configuration'],
    scopeOptions: ['all', 'campaign'],
  },
  campaign_email_builder: {
    title: 'Email Campaign Builder',
    description: 'Design and build email campaigns with templates, sequences, and A/B testing.',
    includes: ['Drag-and-drop email builder', 'Template library access', 'Email sequence configuration', 'Send scheduling and throttling'],
  },
  campaign_test_mode: {
    title: 'Campaign Test Mode',
    description: 'Run campaigns in test/simulation mode before going live.',
    includes: ['Test call initiation', 'Simulated audience selection', 'Test results review', 'Go-live approval workflow'],
  },
  campaign_planner: {
    title: 'Campaign Planner',
    description: 'AI-powered campaign planning tool for multi-channel strategy.',
    includes: ['AI campaign recommendations', 'Channel mix optimization', 'Budget allocation suggestions', 'Timeline and milestone planning'],
  },
  // === Leads & Data Access ===
  qualified_leads_view: {
    title: 'Qualified Leads',
    description: 'View QA-approved qualified leads with AI scores and call evidence.',
    includes: ['QA-approved lead list', 'Lead detail cards with AI analysis', 'Call recording playback (if recordings enabled)', 'Lead status tracking'],
    scopeOptions: ['all', 'campaign'],
  },
  all_leads_view: {
    title: 'All Leads View',
    description: 'Full access to all leads including non-qualified, pending, and rejected.',
    includes: ['Complete lead database view', 'Advanced filtering and search', 'Disposition breakdown by lead', 'Lead source attribution'],
    scopeOptions: ['all', 'campaign'],
  },
  lead_export: {
    title: 'Lead Export',
    description: 'Export leads to CSV or Excel for external processing and CRM integration.',
    includes: ['Export to CSV/Excel', 'Custom field selection', 'Filtered export support', 'Export history and limits'],
    configFields: [{ key: 'maxExportRows', label: 'Max export rows', type: 'number', default: 5000 }],
  },
  ai_scores_view: {
    title: 'AI Scores & Analysis',
    description: 'View AI-generated scoring and analysis on leads and conversations.',
    includes: ['AI lead scoring breakdown', 'Sentiment and intent analysis', 'Engagement signals', 'Score trend history'],
  },
  // === Recordings & Transcripts ===
  call_recordings_playback: {
    title: 'Call Recordings Playback',
    description: 'Listen to call recordings from campaigns.',
    includes: ['In-browser audio player', 'Recording search and filter', 'Playback speed controls', 'Recording timeline with markers'],
    scopeOptions: ['all', 'campaign'],
  },
  call_recordings_download: {
    title: 'Call Recordings Download',
    description: 'Download call recording audio files for offline review.',
    includes: ['Individual recording downloads', 'Bulk download capability', 'Format selection (MP3/WAV)'],
    scopeOptions: ['all', 'campaign'],
    configFields: [{ key: 'maxDownloadsPerDay', label: 'Max downloads per day', type: 'number', default: 100 }],
  },
  transcripts_view: {
    title: 'Call Transcripts',
    description: 'View AI-generated call transcripts with speaker identification.',
    includes: ['Full conversation transcripts', 'Speaker identification (Agent/Prospect)', 'Keyword highlighting', 'Transcript search'],
    scopeOptions: ['all', 'campaign'],
  },
  // === AI & Intelligence ===
  ai_studio_dashboard: {
    title: 'AI Studio Dashboard',
    description: 'Central AI Studio hub — the Agentic Council, AI operator, and intelligence tools.',
    includes: ['The Agentic Council (AI agents)', 'AI operator chat interface', 'AI-powered campaign insights', 'Target market analysis'],
  },
  ai_studio_org_intelligence: {
    title: 'Organization Intelligence',
    description: 'AI-generated company intelligence: ICP, messaging, service catalog, and positioning.',
    includes: ['Company identity & offerings', 'Ideal Customer Profile (ICP)', 'Service catalog management', 'Competitive positioning', 'Outreach messaging frameworks'],
  },
  ai_studio_account_intelligence: {
    title: 'Account Intelligence',
    description: 'AI research engine for individual accounts and campaign targets.',
    includes: ['Account deep research', 'Company profile enrichment', 'Decision-maker identification', 'Engagement opportunity mapping'],
  },
  ai_studio_preview_studio: {
    title: 'Preview Studio',
    description: 'Test and preview AI agent behavior before launching campaigns.',
    includes: ['Live AI agent preview calls', 'Script testing interface', 'Agent behavior tuning', 'Preview session recordings'],
  },
  ai_studio_voice_training: {
    title: 'Voice Agent Training',
    description: 'Train and fine-tune AI voice agents for campaign conversations.',
    includes: ['Voice agent configuration', 'Training data management', 'Performance benchmarking', 'A/B voice testing'],
  },
  ai_studio_campaign_manager: {
    title: 'AI Campaign Manager',
    description: 'AI-assisted campaign management with automated optimization.',
    includes: ['AI-driven campaign adjustments', 'Performance prediction', 'Audience optimization', 'Budget reallocation suggestions'],
  },
  creative_studio: {
    title: 'Creative Studio',
    description: 'Generative AI studio for images, landing pages, emails, blog posts, and ebooks.',
    includes: ['AI image generation (Imagen 3)', 'Landing page generation', 'Email template generation', 'Blog post & ebook creation'],
    configFields: [{ key: 'maxGenerationsPerDay', label: 'Max generations/day', type: 'number', default: 50 }],
  },
  // === Disposition Intelligence ===
  disposition_overview: {
    title: 'Disposition Overview',
    description: 'Call disposition metrics, AI accuracy tracking, and outcome analysis.',
    includes: ['Disposition distribution charts', 'Call count by outcome', 'AI disposition accuracy rates', 'Trend analysis over time'],
    scopeOptions: ['all', 'campaign'],
  },
  disposition_conversation_quality: {
    title: 'Conversation Quality',
    description: 'Deep conversation quality analysis and scoring.',
    includes: ['Quality score breakdowns', 'Agent performance metrics', 'Script adherence analysis', 'Objection handling quality'],
    scopeOptions: ['all', 'campaign'],
  },
  disposition_showcase_calls: {
    title: 'Showcase Calls',
    description: 'Curated top-performing call recordings with transcripts and analysis.',
    includes: ['Best call highlight reel', 'Full transcript + recording', 'Quality annotations', 'Share-ready call links'],
    scopeOptions: ['all', 'campaign'],
  },
  disposition_reanalysis: {
    title: 'Disposition Reanalysis',
    description: 'Trigger AI reanalysis of call dispositions and correction workflows.',
    includes: ['Bulk reanalysis trigger', 'Correction request submission', 'Reanalysis comparison view', 'Override history tracking'],
  },
  disposition_potential_leads: {
    title: 'Potential Leads',
    description: 'AI-identified leads with strong buying signals that may have been missed.',
    includes: ['AI signal detection results', 'Lead scoring breakdown', 'Recommended follow-up actions', 'Conversion probability estimates'],
    scopeOptions: ['all', 'campaign'],
  },
  // === Analytics & Reports ===
  analytics_dashboard: {
    title: 'Analytics Dashboard',
    description: 'Main analytics hub with call reports, email metrics, and campaign performance.',
    includes: ['Call analytics with charts', 'Email engagement metrics', 'Conversion funnel analysis', 'Custom date range filtering'],
    scopeOptions: ['all', 'campaign', 'date_range'],
  },
  engagement_analytics: {
    title: 'Engagement Analytics',
    description: 'Email engagement metrics — opens, clicks, replies, and bounce rates.',
    includes: ['Email open rate tracking', 'Click-through analysis', 'Reply rate monitoring', 'Bounce and complaint reporting'],
    scopeOptions: ['all', 'campaign'],
  },
  call_reports: {
    title: 'Call Reports',
    description: 'Detailed call disposition reports and agent performance analysis.',
    includes: ['Call volume reports', 'Disposition breakdown tables', 'Time-of-day analysis', 'Agent performance comparison'],
    scopeOptions: ['all', 'campaign', 'date_range'],
  },
  reports_export: {
    title: 'Reports Export',
    description: 'Export analytics reports and dashboards to PDF, CSV, or Excel.',
    includes: ['PDF report generation', 'CSV/Excel data export', 'Scheduled report delivery', 'Custom report templates'],
  },
  // === Billing & Finance ===
  billing_invoices: {
    title: 'Billing & Invoices',
    description: 'View invoices, payment history, and billing configuration.',
    includes: ['Invoice list and details', 'Payment history', 'Billing configuration', 'Invoice PDF download'],
  },
  billing_cost_tracking: {
    title: 'Cost Tracking',
    description: 'Real-time cost tracking for calls, emails, and AI usage.',
    includes: ['Real-time cost dashboard', 'Cost breakdown by activity type', 'Monthly spend trends', 'Budget vs. actual comparison'],
  },
  // === Simulations ===
  voice_simulation: {
    title: 'Voice Simulation',
    description: 'Run voice call simulations to test AI agent conversations.',
    includes: ['Live voice simulation interface', 'Campaign-specific agent testing', 'Simulation recording & review', 'Script variation testing'],
    configFields: [{ key: 'maxSimulationsPerDay', label: 'Max simulations/day', type: 'number', default: 20 }],
  },
  email_simulation: {
    title: 'Email Simulation',
    description: 'Simulate email campaign delivery and preview rendering.',
    includes: ['Email preview rendering', 'Inbox placement testing', 'Subject line A/B testing', 'Send simulation with sample audience'],
  },
  simulations_unified: {
    title: 'Unified Simulations Hub',
    description: 'Central hub for all simulation types — voice, email, and multi-channel.',
    includes: ['Cross-channel simulation dashboard', 'Simulation history and comparison', 'Performance benchmarking', 'Simulation templates'],
  },
  // === Communication & Templates ===
  email_templates: {
    title: 'Email Templates',
    description: 'Create and manage email templates for campaigns and sequences.',
    includes: ['Template editor', 'Template library', 'Variable/personalization tokens', 'Template versioning'],
  },
  call_flows: {
    title: 'Call Flows',
    description: 'Define and manage AI agent call flows and conversation scripts.',
    includes: ['Call flow builder', 'Script editing and versioning', 'Branch logic configuration', 'Flow testing and simulation'],
  },
  voice_selection: {
    title: 'Voice Selection',
    description: 'Browse and select AI voices for campaign agents.',
    includes: ['Voice library browser', 'Voice preview/audition', 'Voice-to-campaign assignment', 'Custom voice configuration'],
  },
  // === Advanced & Integration ===
  work_orders: {
    title: 'Work Orders',
    description: 'Create and manage Direct Agentic Orders for campaign execution.',
    includes: ['Order creation form', 'Order status tracking', 'Event-linked orders', 'Order history and details'],
  },
  calendar_booking: {
    title: 'Calendar & Bookings',
    description: 'Configure booking types, manage bookings, and share scheduling links.',
    includes: ['Booking type management', 'Availability slot configuration', 'Booking link sharing', 'Booking history and upcoming'],
  },
  api_access: {
    title: 'API Access',
    description: 'Programmatic API access for integration with external systems.',
    includes: ['API key management', 'REST API endpoint access', 'Webhook configuration', 'Rate limit allocation'],
    configFields: [{ key: 'rateLimit', label: 'Requests per minute', type: 'number', default: 60 }],
  },
  webhook_notifications: {
    title: 'Webhook Notifications',
    description: 'Receive real-time webhook notifications for campaign events.',
    includes: ['Webhook endpoint configuration', 'Event type selection', 'Delivery logs and retry', 'Payload format customization'],
  },
  journey_pipeline: {
    title: 'Journey Pipeline',
    description: 'Lead journey tracking and follow-up management pipeline.',
    includes: ['Journey stage visualization', 'Follow-up task management', 'Lead progression tracking', 'Automated journey triggers'],
    scopeOptions: ['all', 'campaign'],
  },
  organization_intelligence: {
    title: 'Organization Intelligence',
    description: 'View and edit organization intelligence for campaign personalization.',
    includes: ['Organization profile editor', 'ICP and messaging management', 'Service catalog updates', 'Competitive intelligence'],
  },
  // === Email Access ===
  email_connect: {
    title: 'Email Connect',
    description: 'Allow clients to connect their personal or business email accounts for outbound sending.',
    includes: ['OAuth email integration (Google, Microsoft)', 'SMTP/IMAP custom email setup', 'Email signature configuration', 'Sender domain verification'],
  },
  email_inbox: {
    title: 'Email Inbox',
    description: 'Unified email inbox with send, receive, and reply capabilities inside the client portal.',
    includes: ['Thread-based inbox view', 'Compose and reply to emails', 'Email search and filtering', 'Attachment support', 'Contact syncing from CRM'],
  },
  ai_campaign_planner: {
    title: 'AI Campaign Planner',
    description: 'AI-powered full-funnel campaign planning from Organization Intelligence.',
    includes: ['Multi-channel campaign design', 'AI audience recommendations', 'Budget allocation AI', 'Campaign timeline generation'],
  },
  lead_journey_pipeline: {
    title: 'Lead Journey Pipeline',
    description: 'Follow-up management and journey tracking for campaign leads.',
    includes: ['Journey stage board', 'Follow-up scheduling', 'Lead re-engagement workflows', 'Pipeline analytics'],
    scopeOptions: ['all', 'campaign'],
  },
};

// ==================== Component ====================

export default function IamClientAccessControl() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [revokeAllDialogOpen, setRevokeAllDialogOpen] = useState(false);

  // Preset edit dialog state
  const [editPresetDialogOpen, setEditPresetDialogOpen] = useState(false);
  const [editPresetKey, setEditPresetKey] = useState<string | null>(null);
  const [editPresetLabel, setEditPresetLabel] = useState('');
  const [editPresetDescription, setEditPresetDescription] = useState('');
  const [editPresetFeatures, setEditPresetFeatures] = useState<Set<string>>(new Set());

  // Campaign grant dialog state
  const [campaignGrantDialogOpen, setCampaignGrantDialogOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');

  // Scoped grant dialog state
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantDialogFeature, setGrantDialogFeature] = useState<string | null>(null);
  const [grantScopeType, setGrantScopeType] = useState<string>('all');
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [grantNotes, setGrantNotes] = useState('');
  const [grantConfig, setGrantConfig] = useState<Record<string, any>>({});

  // Audit filters
  const [auditFeatureFilter, setAuditFeatureFilter] = useState<string>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');

  // ==================== Queries ====================

  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['/api/iam/client-access/clients', clientSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (clientSearch) params.set('search', clientSearch);
      const res = await apiRequest('GET', `/api/iam/client-access/clients?${params}`);
      return res.json();
    },
  });

  const { data: categories } = useQuery<Record<string, FeatureCategory>>({
    queryKey: ['/api/iam/client-access/meta/categories'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/iam/client-access/meta/categories');
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: presets } = useQuery<Record<string, Preset>>({
    queryKey: ['/api/iam/client-access/meta/presets'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/iam/client-access/meta/presets');
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery<PermissionGrant[]>({
    queryKey: ['/api/iam/client-access', selectedClientId, 'permissions'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/iam/client-access/${selectedClientId}/permissions`);
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  const { data: summary } = useQuery<AccessSummary>({
    queryKey: ['/api/iam/client-access', selectedClientId, 'summary'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/iam/client-access/${selectedClientId}/summary`);
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['/api/iam/client-access', selectedClientId, 'audit', auditOffset, auditFeatureFilter, auditActionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '25', offset: String(auditOffset) });
      if (auditFeatureFilter) params.set('feature', auditFeatureFilter);
      if (auditActionFilter) params.set('action', auditActionFilter);
      const res = await apiRequest('GET', `/api/iam/client-access/${selectedClientId}/audit?${params}`);
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  // Campaign access query
  const { data: campaignGrants, isLoading: campaignsLoading } = useQuery<CampaignGrant[]>({
    queryKey: ['/api/iam/client-access', selectedClientId, 'campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/iam/client-access/${selectedClientId}/campaigns`);
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  // All campaigns for selector
  const { data: allCampaignsData } = useQuery<{ regular: CampaignOption[]; verification: CampaignOption[] }>({
    queryKey: ['/api/iam/client-access/meta/campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/iam/client-access/meta/campaigns');
      return res.json();
    },
  });

  // ==================== Mutations ====================

  const invalidateClient = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/iam/client-access', selectedClientId] });
    queryClient.invalidateQueries({ queryKey: ['/api/iam/client-access/clients'] });
  };

  const grantMutation = useMutation({
    mutationFn: async (payload: { feature: string; scopeType?: string; expiresAt?: string; notes?: string; config?: Record<string, any> }) => {
      await apiRequest('POST', `/api/iam/client-access/${selectedClientId}/grant`, payload);
    },
    onSuccess: () => {
      invalidateClient();
      setGrantDialogOpen(false);
      setGrantDialogFeature(null);
      setGrantScopeType('all');
      setGrantExpiresAt('');
      setGrantNotes('');
      setGrantConfig({});
    },
    onError: () => toast({ title: 'Failed to grant feature', variant: 'destructive' }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (grantId: string) => {
      await apiRequest('DELETE', `/api/iam/client-access/grants/${grantId}`);
    },
    onSuccess: () => invalidateClient(),
    onError: () => toast({ title: 'Failed to revoke feature', variant: 'destructive' }),
  });

  const applyPresetMutation = useMutation({
    mutationFn: async (preset: string) => {
      await apiRequest('POST', `/api/iam/client-access/${selectedClientId}/apply-preset`, { preset });
    },
    onSuccess: (_, preset) => {
      invalidateClient();
      setPresetDialogOpen(false);
      toast({ title: `Applied "${presets?.[preset]?.label}" preset` });
    },
    onError: () => toast({ title: 'Failed to apply preset', variant: 'destructive' }),
  });

  const bulkRevokeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/iam/client-access/${selectedClientId}/bulk-revoke`, {
        reason: 'Admin bulk revoke from Client Access Control page',
      });
    },
    onSuccess: () => {
      invalidateClient();
      setRevokeAllDialogOpen(false);
      toast({ title: 'All features revoked' });
    },
    onError: () => toast({ title: 'Failed to revoke all features', variant: 'destructive' }),
  });

  const updatePresetMutation = useMutation({
    mutationFn: async (payload: { key: string; label?: string; description?: string; features?: string[] }) => {
      const { key, ...body } = payload;
      await apiRequest('PUT', `/api/iam/client-access/meta/presets/${key}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/client-access/meta/presets'] });
      setEditPresetDialogOpen(false);
      toast({ title: 'Preset updated successfully' });
    },
    onError: () => toast({ title: 'Failed to update preset', variant: 'destructive' }),
  });

  const grantCampaignMutation = useMutation({
    mutationFn: async (payload: { campaignId: string; campaignType: 'regular' | 'verification' }) => {
      await apiRequest('POST', `/api/iam/client-access/${selectedClientId}/campaigns/grant`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/client-access', selectedClientId, 'campaigns'] });
      invalidateClient();
      setCampaignGrantDialogOpen(false);
      setSelectedCampaignId('');
      toast({ title: 'Campaign access granted' });
    },
    onError: (err: any) => {
      const msg = err?.message?.includes('409') ? 'Campaign access already granted' : 'Failed to grant campaign access';
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const revokeCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      await apiRequest('DELETE', `/api/iam/client-access/${selectedClientId}/campaigns/${campaignId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/client-access', selectedClientId, 'campaigns'] });
      invalidateClient();
      toast({ title: 'Campaign access revoked' });
    },
    onError: () => toast({ title: 'Failed to revoke campaign access', variant: 'destructive' }),
  });

  // ==================== Derived State ====================

  const enabledFeaturesSet = useMemo(() => {
    if (!permissions) return new Set<string>();
    return new Set(
      permissions
        .filter((g) => g.isEnabled && !g.revokedAt)
        .map((g) => g.feature)
    );
  }, [permissions]);

  const grantIdByFeature = useMemo(() => {
    if (!permissions) return new Map<string, string>();
    const map = new Map<string, string>();
    permissions
      .filter((g) => g.isEnabled && !g.revokedAt)
      .forEach((g) => map.set(g.feature, g.id));
    return map;
  }, [permissions]);

  const grantDetailsByFeature = useMemo(() => {
    if (!permissions) return new Map<string, PermissionGrant>();
    const map = new Map<string, PermissionGrant>();
    permissions
      .filter((g) => g.isEnabled && !g.revokedAt)
      .forEach((g) => map.set(g.feature, g));
    return map;
  }, [permissions]);

  const selectedClient = clientsData?.clients?.find((c: ClientAccount) => c.id === selectedClientId);

  // ==================== Handlers ====================

  function handleToggleFeature(feature: string) {
    if (enabledFeaturesSet.has(feature)) {
      const grantId = grantIdByFeature.get(feature);
      if (grantId) revokeMutation.mutate(grantId);
    } else {
      // Open feature-specific grant dialog
      setGrantDialogFeature(feature);
      setGrantScopeType('all');
      setGrantExpiresAt('');
      setGrantNotes('');
      setGrantConfig({});
      setGrantDialogOpen(true);
    }
  }

  function handleConfirmGrant() {
    if (!grantDialogFeature) return;
    const payload: { feature: string; scopeType?: string; expiresAt?: string; notes?: string; config?: Record<string, any> } = {
      feature: grantDialogFeature,
    };
    if (grantScopeType !== 'all') payload.scopeType = grantScopeType;
    if (grantExpiresAt) payload.expiresAt = new Date(grantExpiresAt).toISOString();
    if (grantNotes.trim()) payload.notes = grantNotes.trim();
    if (Object.keys(grantConfig).length > 0) payload.config = grantConfig;
    grantMutation.mutate(payload);
  }

  function handleOpenEditPreset(key: string) {
    const preset = presets?.[key];
    if (!preset) return;
    setEditPresetKey(key);
    setEditPresetLabel(preset.label);
    setEditPresetDescription(preset.description);
    setEditPresetFeatures(new Set(preset.features));
    setEditPresetDialogOpen(true);
  }

  function handleSavePreset() {
    if (!editPresetKey) return;
    updatePresetMutation.mutate({
      key: editPresetKey,
      label: editPresetLabel,
      description: editPresetDescription,
      features: Array.from(editPresetFeatures),
    });
  }

  function togglePresetFeature(feature: string) {
    setEditPresetFeatures(prev => {
      const next = new Set(prev);
      if (next.has(feature)) next.delete(feature);
      else next.add(feature);
      return next;
    });
  }

  // ==================== Derived: Feature-specific grant dialog ====================

  const featureMeta = grantDialogFeature ? FEATURE_GRANT_META[grantDialogFeature] : null;
  const featureScopeOpts = featureMeta?.scopeOptions || ['all'];

  // ==================== Render ====================

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/iam">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Client Access Control</h1>
          <p className="text-muted-foreground">
            Manage per-client feature permissions — default deny, grant individually
          </p>
        </div>
      </div>

      {/* Client Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1 max-w-md">
              <label className="text-sm font-medium mb-1.5 block">Select Client</label>
              <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientPopoverOpen}
                    className="w-full justify-between h-10 font-normal"
                  >
                    {selectedClient ? (
                      <span className="flex items-center gap-2 truncate">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {selectedClient.companyName || selectedClient.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Choose a client account...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[460px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search clients..."
                      value={clientSearch}
                      onValueChange={setClientSearch}
                    />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>
                        {clientsLoading ? 'Loading...' : 'No clients found.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {clientsData?.clients?.map((c: ClientAccount) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setSelectedClientId(c.id);
                              setAuditOffset(0);
                              setClientPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${selectedClientId === c.id ? 'opacity-100' : 'opacity-0'}`}
                            />
                            <Building2 className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate">{c.companyName || c.name}</span>
                            <Badge variant={c.isActive ? 'default' : 'secondary'} className="ml-2 text-xs shrink-0">
                              {c.activeGrantCount} grants
                            </Badge>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* No client selected */}
      {!selectedClientId && (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Select a client account above to manage their feature access</p>
          </CardContent>
        </Card>
      )}

      {/* Client Detail */}
      {selectedClientId && (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{summary.activeGrants}</p>
                      <p className="text-xs text-muted-foreground">Active Grants</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Shield className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{summary.campaignAccessCount}</p>
                      <p className="text-xs text-muted-foreground">Campaign Grants</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Zap className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {summary.matchedPreset
                          ? presets?.[summary.matchedPreset]?.label || summary.matchedPreset
                          : 'Custom'}
                      </p>
                      <p className="text-xs text-muted-foreground">Current Preset</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {summary.hasExpiringGrants && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-yellow-500/10">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Expiring Soon</p>
                        <p className="text-xs text-muted-foreground">Some grants expire within 7 days</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="permissions">
            <TabsList>
              <TabsTrigger value="permissions">
                <Shield className="h-4 w-4 mr-2" />
                Permissions
              </TabsTrigger>
              <TabsTrigger value="campaigns">
                <Megaphone className="h-4 w-4 mr-2" />
                Campaigns
              </TabsTrigger>
              <TabsTrigger value="presets">
                <Zap className="h-4 w-4 mr-2" />
                Presets
              </TabsTrigger>
              <TabsTrigger value="audit">
                <History className="h-4 w-4 mr-2" />
                Audit Log
              </TabsTrigger>
            </TabsList>

            {/* ========== Permissions Tab ========== */}
            <TabsContent value="permissions" className="space-y-4">
              {/* Actions bar */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Toggle features on/off for{' '}
                  <span className="font-medium text-foreground">
                    {selectedClient?.companyName || selectedClient?.name || 'this client'}
                  </span>
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRevokeAllDialogOpen(true)}
                  disabled={!summary?.activeGrants}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Revoke All
                </Button>
              </div>

              {permissionsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i}>
                      <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
                      <CardContent className="space-y-3">
                        {[1, 2, 3].map((j) => <Skeleton key={j} className="h-8 w-full" />)}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                categories &&
                Object.entries(categories).map(([catKey, cat]) => (
                  <Card key={catKey}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{cat.label}</CardTitle>
                      <CardDescription>
                        {cat.features.filter((f) => enabledFeaturesSet.has(f)).length} / {cat.features.length} enabled
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {cat.features.map((feature) => {
                          const enabled = enabledFeaturesSet.has(feature);
                          const grant = grantDetailsByFeature.get(feature);
                          const isToggling =
                            (grantMutation.isPending && (grantMutation.variables as any)?.feature === feature) ||
                            (revokeMutation.isPending && revokeMutation.variables === grantIdByFeature.get(feature));
                          return (
                            <div
                              key={feature}
                              className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {enabled ? (
                                  <ToggleRight className="h-4 w-4 text-green-500 shrink-0" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                <span className="text-sm font-medium">
                                  {feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                </span>
                                {enabled && grant?.scopeType && grant.scopeType !== 'all' && (
                                  <Badge variant="outline" className="text-xs shrink-0">
                                    {grant.scopeType.replace(/_/g, ' ')}
                                  </Badge>
                                )}
                                {enabled && grant?.expiresAt && (
                                  <Badge variant="secondary" className="text-xs shrink-0">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {new Date(grant.expiresAt).toLocaleDateString()}
                                  </Badge>
                                )}
                                {enabled && grant?.notes && (
                                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground shrink-0" title={grant.notes} />
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isToggling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                <Switch
                                  checked={enabled}
                                  onCheckedChange={() => handleToggleFeature(feature)}
                                  disabled={isToggling}
                                  aria-label={`Toggle ${feature}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* ========== Campaigns Tab ========== */}
            <TabsContent value="campaigns" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Campaign access grants for{' '}
                  <span className="font-medium text-foreground">
                    {selectedClient?.companyName || selectedClient?.name || 'this client'}
                  </span>
                  . These are the campaigns this client can view and interact with.
                </p>
                <Button size="sm" onClick={() => setCampaignGrantDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Grant Campaign
                </Button>
              </div>
              {campaignsLoading ? (
                <Card>
                  <CardContent className="py-8 space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Campaign Access</CardTitle>
                    <CardDescription>
                      {campaignGrants?.length ?? 0} campaign{(campaignGrants?.length ?? 0) !== 1 ? 's' : ''} accessible
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(!campaignGrants || campaignGrants.length === 0) ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No campaign access grants yet. Click "Grant Campaign" above to assign campaigns.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campaign</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Granted By</TableHead>
                            <TableHead>Since</TableHead>
                            <TableHead className="w-[80px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {campaignGrants.map((grant, i) => {
                            const cid = grant.campaignId || grant.regularCampaignId || '';
                            const type = grant.campaignId ? 'verification' : 'regular';
                            // Try to resolve campaign name from allCampaignsData
                            const allList = type === 'verification'
                              ? allCampaignsData?.verification
                              : allCampaignsData?.regular;
                            const matchedCampaign = allList?.find(c => c.id === cid);
                            return (
                              <TableRow key={i}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">{matchedCampaign?.name || 'Unknown Campaign'}</span>
                                    <span className="font-mono text-xs text-muted-foreground">{cid || '—'}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {type === 'verification' ? 'Verification' : 'Regular'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {grant.grantedBy || 'System'}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {new Date(grant.createdAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => { if (cid) revokeCampaignMutation.mutate(cid); }}
                                    disabled={revokeCampaignMutation.isPending}
                                    aria-label="Revoke campaign access"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ========== Presets Tab ========== */}
            <TabsContent value="presets" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Apply a preset to quickly configure access for{' '}
                <span className="font-medium text-foreground">
                  {selectedClient?.companyName || selectedClient?.name || 'this client'}
                </span>
                . This will replace all current grants.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {presets &&
                  Object.entries(presets).map(([key, preset]) => {
                    const isActive = summary?.matchedPreset === key;
                    return (
                      <Card
                        key={key}
                        className={isActive ? 'border-primary' : 'hover:border-muted-foreground/30 transition-colors'}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{preset.label}</CardTitle>
                            <div className="flex items-center gap-1.5">
                              {isActive && <Badge>Active</Badge>}
                              {key !== 'full_access' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => { e.stopPropagation(); handleOpenEditPreset(key); }}
                                  title="Edit preset"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <CardDescription>{preset.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              {preset.features.length} features
                            </span>
                            <Button
                              size="sm"
                              variant={isActive ? 'secondary' : 'default'}
                              disabled={isActive || applyPresetMutation.isPending}
                              onClick={() => {
                                setSelectedPreset(key);
                                setPresetDialogOpen(true);
                              }}
                            >
                              {applyPresetMutation.isPending && applyPresetMutation.variables === key ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <Zap className="h-4 w-4 mr-1" />
                              )}
                              {isActive ? 'Current' : 'Apply'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </TabsContent>

            {/* ========== Audit Tab ========== */}
            <TabsContent value="audit" className="space-y-4">
              {/* Audit Filters */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="w-48">
                  <Label className="text-xs text-muted-foreground mb-1 block">Action Type</Label>
                  <Select
                    value={auditActionFilter}
                    onValueChange={(v) => { setAuditActionFilter(v === '_all' ? '' : v); setAuditOffset(0); }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All actions</SelectItem>
                      <SelectItem value="grant">Grant</SelectItem>
                      <SelectItem value="revoke">Revoke</SelectItem>
                      <SelectItem value="modify">Modify</SelectItem>
                      <SelectItem value="bulk_grant">Bulk Grant</SelectItem>
                      <SelectItem value="bulk_revoke">Bulk Revoke</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-56">
                  <Label className="text-xs text-muted-foreground mb-1 block">Feature</Label>
                  <Input
                    placeholder="Filter by feature..."
                    className="h-9"
                    value={auditFeatureFilter}
                    onChange={(e) => { setAuditFeatureFilter(e.target.value); setAuditOffset(0); }}
                  />
                </div>
                {(auditActionFilter || auditFeatureFilter) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => { setAuditActionFilter(''); setAuditFeatureFilter(''); setAuditOffset(0); }}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Clear
                  </Button>
                )}
              </div>

              {auditLoading ? (
                <Card>
                  <CardContent className="py-8 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Access Changes</CardTitle>
                    <CardDescription>
                      {auditData?.total ?? 0} total entries
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(!auditData?.entries || auditData.entries.length === 0) ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No audit entries yet
                      </p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Action</TableHead>
                              <TableHead>Feature</TableHead>
                              <TableHead>Details</TableHead>
                              <TableHead>When</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {auditData.entries.map((entry: AuditEntry) => (
                              <TableRow key={entry.id}>
                                <TableCell>
                                  <AuditActionBadge action={entry.action} />
                                </TableCell>
                                <TableCell className="text-sm">
                                  {entry.feature
                                    ? entry.feature.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                                    : '—'}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                                  {entry.notes || '—'}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {new Date(entry.performedAt).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {/* Pagination */}
                        <div className="flex items-center justify-between pt-4">
                          <p className="text-sm text-muted-foreground">
                            Showing {auditOffset + 1}–{Math.min(auditOffset + 25, auditData.total)} of {auditData.total}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={auditOffset === 0}
                              onClick={() => setAuditOffset(Math.max(0, auditOffset - 25))}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={auditOffset + 25 >= (auditData?.total ?? 0)}
                              onClick={() => setAuditOffset(auditOffset + 25)}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* ========== Campaign Grant Dialog ========== */}
      <Dialog open={campaignGrantDialogOpen} onOpenChange={setCampaignGrantDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Grant Campaign Access</DialogTitle>
            <DialogDescription>
              Select a campaign to grant access to{' '}
              <span className="font-medium">{selectedClient?.companyName || selectedClient?.name || 'this client'}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Campaign</Label>
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a campaign..." />
                </SelectTrigger>
                <SelectContent>
                  {allCampaignsData?.regular && allCampaignsData.regular.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Regular Campaigns</div>
                      {allCampaignsData.regular.map((c) => (
                        <SelectItem key={`r-${c.id}`} value={`regular:${c.id}`}>
                          <div className="flex items-center gap-2">
                            <span>{c.name}</span>
                            {c.status && (
                              <Badge variant="outline" className="text-xs">{c.status}</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {allCampaignsData?.verification && allCampaignsData.verification.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Verification Campaigns</div>
                      {allCampaignsData.verification.map((c) => (
                        <SelectItem key={`v-${c.id}`} value={`verification:${c.id}`}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignGrantDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedCampaignId || grantCampaignMutation.isPending}
              onClick={() => {
                const [type, id] = selectedCampaignId.split(':') as ['regular' | 'verification', string];
                grantCampaignMutation.mutate({ campaignId: id, campaignType: type });
              }}
            >
              {grantCampaignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Preset Confirmation Dialog ========== */}
      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Preset: {selectedPreset && presets?.[selectedPreset]?.label}</DialogTitle>
            <DialogDescription>
              This will revoke all current grants and replace them with the preset's features.
              This action is logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          {selectedPreset && presets?.[selectedPreset] && (
            <div className="text-sm space-y-2">
              <p className="font-medium">{presets[selectedPreset].features.length} features will be granted:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {presets[selectedPreset].features.map((f) => (
                  <Badge key={f} variant="secondary" className="mr-1 mb-1">
                    {f.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPresetDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedPreset && applyPresetMutation.mutate(selectedPreset)}
              disabled={applyPresetMutation.isPending}
            >
              {applyPresetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Apply Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Revoke All Confirmation Dialog ========== */}
      <Dialog open={revokeAllDialogOpen} onOpenChange={setRevokeAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke All Access</DialogTitle>
            <DialogDescription>
              This will immediately revoke all {summary?.activeGrants ?? 0} active feature grants for{' '}
              {selectedClient?.companyName || selectedClient?.name || 'this client'}.
              The client will have zero platform access. This action is logged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeAllDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkRevokeMutation.mutate()}
              disabled={bulkRevokeMutation.isPending}
            >
              {bulkRevokeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Revoke All Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Edit Preset Dialog ========== */}
      <Dialog open={editPresetDialogOpen} onOpenChange={setEditPresetDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Preset: {editPresetLabel}</DialogTitle>
            <DialogDescription>
              Customize which features are included in this preset. Changes apply to future preset applications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Label & Description */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Preset Name</Label>
                <Input
                  className="mt-1.5"
                  value={editPresetLabel}
                  onChange={(e) => setEditPresetLabel(e.target.value)}
                  placeholder="e.g. Standard Client"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Description</Label>
                <Input
                  className="mt-1.5"
                  value={editPresetDescription}
                  onChange={(e) => setEditPresetDescription(e.target.value)}
                  placeholder="Brief description..."
                />
              </div>
            </div>

            <Separator />

            {/* Feature Toggles by Category */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Included Features</Label>
                <span className="text-xs text-muted-foreground">{editPresetFeatures.size} selected</span>
              </div>
              <ScrollArea className="h-[400px] border rounded-lg p-3">
                <div className="space-y-4">
                  {categories && Object.entries(categories).map(([catKey, cat]) => {
                    const catSelected = cat.features.filter(f => editPresetFeatures.has(f)).length;
                    return (
                      <div key={catKey}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-foreground">{cat.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {catSelected}/{cat.features.length}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {cat.features.map(feature => {
                            const meta = FEATURE_GRANT_META[feature];
                            return (
                              <label
                                key={feature}
                                className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                              >
                                <Checkbox
                                  checked={editPresetFeatures.has(feature)}
                                  onCheckedChange={() => togglePresetFeature(feature)}
                                />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm">{meta?.title || feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPresetDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePreset}
              disabled={updatePresetMutation.isPending || editPresetFeatures.size === 0}
            >
              {updatePresetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Feature-Specific Grant Dialog ========== */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {featureMeta?.title || grantDialogFeature?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </DialogTitle>
            <DialogDescription>
              {featureMeta?.description || 'Configure access for this feature.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* What's Included */}
            {featureMeta?.includes && (
              <div>
                <Label className="text-sm font-medium">What's Included</Label>
                <ul className="mt-1.5 space-y-1">
                  {featureMeta.includes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator />

            {/* Scope — only show if feature has multiple scope options */}
            {featureScopeOpts.length > 1 && (
              <div>
                <Label className="text-sm font-medium">Access Scope</Label>
                <Select value={grantScopeType} onValueChange={setGrantScopeType}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {featureScopeOpts.includes('all') && <SelectItem value="all">All (Full Access)</SelectItem>}
                    {featureScopeOpts.includes('campaign') && <SelectItem value="campaign">Campaign-scoped</SelectItem>}
                    {featureScopeOpts.includes('project') && <SelectItem value="project">Project-scoped</SelectItem>}
                    {featureScopeOpts.includes('date_range') && <SelectItem value="date_range">Date range</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Feature-specific config fields */}
            {featureMeta?.configFields?.map((field) => (
              <div key={field.key}>
                <Label className="text-sm font-medium">{field.label}</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  placeholder={field.default?.toString()}
                  value={grantConfig[field.key] ?? ''}
                  onChange={(e) => setGrantConfig(prev => ({ ...prev, [field.key]: Number(e.target.value) || undefined }))}
                />
                {field.default && (
                  <p className="text-xs text-muted-foreground mt-1">Default: {field.default.toLocaleString()}</p>
                )}
              </div>
            ))}

            {/* Expiry */}
            <div>
              <Label className="text-sm font-medium">Expires At (optional)</Label>
              <Input
                type="datetime-local"
                className="mt-1.5"
                value={grantExpiresAt}
                onChange={(e) => setGrantExpiresAt(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div>
              <Label className="text-sm font-medium">Notes (optional)</Label>
              <Textarea
                className="mt-1.5"
                placeholder="Why is this being granted?"
                maxLength={500}
                rows={2}
                value={grantNotes}
                onChange={(e) => setGrantNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmGrant}
              disabled={grantMutation.isPending}
            >
              {grantMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Grant Feature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Sub-Components ====================

function AuditActionBadge({ action }: { action: string }) {
  const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    grant: { label: 'Grant', variant: 'default' },
    revoke: { label: 'Revoke', variant: 'destructive' },
    modify: { label: 'Modify', variant: 'secondary' },
    bulk_grant: { label: 'Bulk Grant', variant: 'default' },
    bulk_revoke: { label: 'Bulk Revoke', variant: 'destructive' },
  };
  const info = variants[action] || { label: action, variant: 'outline' as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}
