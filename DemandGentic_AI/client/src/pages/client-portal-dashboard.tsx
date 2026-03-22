import { useState, useEffect, useMemo } from 'react'; // Sync
import { useLocation, useSearch } from 'wouter';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { clearClientPortalSession } from '@/lib/client-portal-session';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import {
  Building2, LogOut, Package, Plus, FileText, Users, Calendar, CalendarDays, ChevronRight,
  LayoutDashboard, Target, BarChart3, Download, CreditCard, MessageSquare,
  Phone, Mail, Send, Clock, CheckCircle, AlertCircle, TrendingDown, TrendingUp, Brain,
  FileDown, Headphones, Loader2, ArrowUpRight, ArrowDownRight, Sparkles,
  Megaphone, UserCheck, DollarSign, Receipt, HelpCircle, Settings, Bell,
  Filter, Search, RefreshCw, ExternalLink, Bot, X,
  Link as LinkIcon, Upload, Trash2, Mic, ShoppingCart, FileEdit, TestTube,
  ClipboardList, Palette, BookOpen, PhoneCall, MailCheck, Play,
  Contact2, Building, FileSpreadsheet, Globe, MapPin, Briefcase,
  Workflow, Shield, Puzzle, Pencil, Volume2, Crown, Cpu, Smile, Database,
  ArrowLeft, ArrowRight, Eye, Tag, Layers, AlertTriangle, Crosshair, MessageSquareText, List, FileBarChart2, ShieldCheck,
  MousePointerClick, ClipboardCheck, Handshake
} from 'lucide-react';
import { IntelligenceFlowDiagram } from '@/components/intelligence-flow-diagram';
import { useAgentPanelContextOptional } from '@/components/agent-panel';
import {
  CampaignCard,
  RequestLeadsDialog,
  CampaignCreationWizard,
  PreviewStudio,
  CampaignDetailView,
} from '@/components/client-portal/campaigns';
import { AgenticReportsPanel } from '@/components/client-portal/reports/agentic-reports-panel';
import { ArgyleEventsContent } from '@/pages/client-portal/argyle-events';
import { UkefReportsContent } from '@/pages/client-portal/ukef-reports';
import { UkefTranscriptQaContent } from '@/pages/client-portal/ukef-transcript-qa';
import { ClientEmailTemplateBuilder } from '@/components/client-portal/email/client-email-template-builder';
import { ActivityTimeline, type ActivityItem } from '@/components/patterns/activity-timeline';
import { extractColorsFromImage } from '@/lib/color-extractor';
import { AccountIntelligenceView } from '@/components/ai-studio/account-intelligence/account-intelligence-view';
import { ICPPositioningTab } from '@/components/ai-studio/org-intelligence/tabs/icp-positioning';
import { MessagingProofTab } from '@/components/ai-studio/org-intelligence/tabs/messaging-proof';
import { ServiceCatalogTab } from '@/components/ai-studio/org-intelligence/tabs/service-catalog-tab';
import { ProblemFrameworkTab } from '@/components/ai-studio/org-intelligence/tabs/problem-framework-tab';

import { UnifiedPipelineTab } from '@/components/unified-pipeline';
import { ReportingTab } from '@/components/client-portal/reporting/reporting-tab';

interface ClientUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  clientAccountId: string;
  clientAccountName: string;
  isOwner?: boolean;
}

interface CampaignEnabledFeatures {
  emailCampaignTest?: boolean;
  campaignQueueView?: boolean;
  previewStudio?: boolean;
  campaignCallTest?: boolean;
  voiceSelection?: boolean;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  clientStatus?: string | null;
  eligibleCount: number;
  totalContacts: number;
  verifiedCount: number;
  deliveredCount: number;
  type?: string;
  campaignType?: string;
  dialMode?: string;
  startDate?: string;
  endDate?: string;
  targetQualifiedLeads?: number;
  enabledFeatures?: CampaignEnabledFeatures | null;
  costPerLead?: string;
  orderNumber?: string;
  estimatedBudget?: string;
  approvedBudget?: string;
  callReport?: {
    callsMade: number;
    connected: number;
    qualified: number;
    voicemail: number;
    noAnswer: number;
    invalid: number;
  };
  stats?: {
    attempts: number;
    impressions: number;
    leads: number;
    targetAchieved: number;
    remaining: number;
    queueStats?: {
      total: number;
      remaining: number;
      completed: number;
      failed: number;
    };
    callReport?: {
      callsMade: number;
      connected: number;
      qualified: number;
      voicemail: number;
      noAnswer: number;
      invalid: number;
    };
  };
}

interface Order {
  id: string;
  orderNumber: string;
  campaignId: string;
  campaignName: string;
  requestedQuantity: number;
  approvedQuantity: number | null;
  deliveredQuantity: number;
  status: string;
  orderMonth: number;
  orderYear: number;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string | null;
  pdfUrl: string | null;
}

interface CostSummary {
  totalCost: number;
  monthlyTrend: { month: string; cost: number }[];
  byType: { type: string; total: number; count: number }[];
}

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  lastReplyAt: string | null;
}

interface TutorialVideo {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  embedUrl: string;
  provider: string;
  sortOrder: number;
  isActive: boolean;
}

interface ClientActivityLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record | null;
  createdAt: string;
}

interface AgenticCapability {
  name: string;
  description: string;
  features: string[];
}

interface AgenticCapabilitiesResponse {
  success: boolean;
  capabilities: Record;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  projectCode: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: string | null;
  budgetCurrency?: string | null;
  requestedLeadCount?: number | null;
  landingPageUrl: string | null;
  projectFileUrl: string | null;
  createdAt: string;
  campaignCount: number;
  totalCost: number;
}

interface Lead {
  id: number; // verificationContactId
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  location: string | null;
  employees: string | null;
  industry: string | null;
  keywords: string[] | null;
  campaignName: string | null;
  orderId: string;
  orderNumber: string;
  orderDate: string;
  linkedin?: string | null;
  notes?: string | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const statusColors: Record = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  in_review: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  approved_pending_setup: 'bg-blue-100 text-blue-800',
  sent: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  delivering: 'bg-purple-100 text-purple-800',
  delivered: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  rejected: 'bg-red-100 text-red-800',
  paused: 'bg-gray-100 text-gray-600',
};

// Tab aliases for backward compatibility with old URLs
const TAB_ALIASES: Record = {
  'agent': 'overview',
  'reports': 'analytics-reports',
  'agentic-demand': 'overview',
  'activations': 'campaigns',
  'analytics': 'overview',
  'leads': 'journey-pipeline',
  'engagement-triggers': 'unified-pipelines',
  'analytics-reports': 'reporting',
};

function resolveTab(tab: string | null): string {
  if (!tab) return 'overview';
  return TAB_ALIASES[tab] || tab;
}

function dedupeById(items: T[]): T[] {
  const seen = new Set();
  const unique: T[] = [];
  for (const item of items) {
    const rawId = item?.id;
    if (rawId === null || rawId === undefined) {
      unique.push(item);
      continue;
    }
    const id = String(rawId);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(item);
  }
  return unique;
}

export default function ClientPortalDashboard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const { toast } = useToast();
  const agentPanel = useAgentPanelContextOptional();
  const [user, setUser] = useState(null);

  // URL-driven tab system
  const tabFromUrl = urlParams.get('tab');
  const [activeTab, setActiveTabState] = useState(resolveTab(tabFromUrl));
  const [targetMarketTab, setTargetMarketTab] = useState('accounts');
  const [showSupportDialog, setShowSupportDialog] = useState(false);

  // Sync activeTab with URL changes (sidebar navigation)
  useEffect(() => {
    const resolved = resolveTab(tabFromUrl);
    if (resolved !== activeTab) {
      setActiveTabState(resolved);
    }
  }, [tabFromUrl]);

  // Update URL when activeTab changes internally
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchString);
    params.set('tab', tab);
    params.delete('leadsView');
    window.history.replaceState(null, '', `/client-portal/dashboard?${params.toString()}`);
  };
  
  // Queue View State
  const [showQueueDialog, setShowQueueDialog] = useState(false);
  const [queueCampaignId, setQueueCampaignId] = useState(null);

  // Email Test State
  const [showEmailTestDialog, setShowEmailTestDialog] = useState(false);
  const [testEmailCampaignId, setTestEmailCampaignId] = useState(null);


  // Work Order Request State (managed campaigns by Pivotal team)
  const [showWorkOrderDialog, setShowWorkOrderDialog] = useState(false);
  const [workOrderStep, setWorkOrderStep] = useState(1);
  
  // Temp inputs for tag fields
  const [geoInput, setGeoInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');

  const [newWorkOrder, setNewWorkOrder] = useState({
    campaignType: '' as string,
    campaignGoals: '',
    productServices: '',
    talkingPoints: '',
    qualifications: '',
    successCriteria: '',
    requiredLeads: '',
    desiredTimeline: '',
    deadline: '',
    additionalInstructions: '',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
    landingPageUrl: '',
    projectFileUrl: '',
    fileName: '',
    // Audience Targeting
    targetGeo: [] as string[],
    targetTitles: [] as string[],
    targetIndustries: [] as string[],
    targetRevenue: [] as string[],
    targetEmployeeSize: [] as string[],
  });

  // ArgyleEvent interface definition
  interface ArgyleEvent {
    id: string;
    externalId: string;
    sourceUrl: string;
    title: string;
    community: string | null;
    eventType: string | null;
    location: string | null;
    startAtIso: string | null;
    startAtHuman: string | null;
    needsDateReview: boolean;
    lastSyncedAt: string;
    draft?: {
      id: string;
      status: string;
      leadCount: number | null;
      draftFields: Record;
      sourceFields: Record | null;
    } | null;
  }

  // Argyle Event Selection (Link Drafts)
  const [selectedArgyleEventId, setSelectedArgyleEventId] = useState('none');
  // Feature access state (loaded later from API)
  const [enabledFeatures, setEnabledFeatures] = useState([
    'accounts_contacts', 'bulk_upload', 'campaign_creation', 'email_templates',
    'call_flows', 'voice_selection', 'calendar_booking', 'analytics_dashboard', 'reports_export'
  ]);

  // Fetch Argyle Events (if feature enabled/client authorized)
  const { data: argyleEventsData } = useQuery({
    queryKey: ['argyle-events'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/client-portal/argyle-events/events');
        return await res.json();
      } catch (e) {
        return { events: [] };
      }
    },
    enabled: enabledFeatures.includes('argyle_events'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  
  const argyleEvents = argyleEventsData?.events || [];
  const hasDrafts = argyleEvents.some(e => e.draft && e.draft.status !== 'submitted');

  // Create Project Mutation (Work Order)
  const createWorkOrderMutation = useMutation({
    mutationFn: async (data: typeof newWorkOrder) => {
      // Format description with all targeting details
      const targetingDetails = [
        `GEO: ${data.targetGeo.join(', ')}`,
        `TITLES: ${data.targetTitles.join(', ')}`,
        `INDUSTRIES: ${data.targetIndustries.join(', ')}`,
        `REVENUE: ${data.targetRevenue.join(', ')}`,
        `EMPLOYEE SIZE: ${data.targetEmployeeSize.join(', ')}`
      ].join('\n');

      const fullDescription = `CAMPAIGN OBJECTIVE/CONTEXT:\n${data.campaignGoals}\n\nPRODUCT/SERVICES:\n${data.productServices}\n\nKEY TALKING POINTS:\n${data.talkingPoints}\n\nQUALIFICATIONS:\n${data.qualifications}\n\nSUCCESS CRITERIA:\n${data.successCriteria}\n\nTARGET AUDIENCE:\n${targetingDetails}\n\nTIMELINE:\n${data.desiredTimeline}\n\nPRIORITY:\n${data.priority}\n\nINSTRUCTIONS:\n${data.additionalInstructions}`;

      // Map Work Order fields to Project Request schema
      return apiRequest('POST', '/api/client-portal/projects', {
        name: `${getProgramTypeLabel(data.campaignType)} Request`,
        description: fullDescription,
        requestedLeadCount: parseInt(data.requiredLeads.replace(/\D/g, '') || '0'),
        endDate: data.deadline || undefined,
        startDate: new Date().toISOString(),
        budgetCurrency: 'USD',
        landingPageUrl: data.landingPageUrl || undefined,
        projectFileUrl: data.projectFileUrl || undefined,
      });
    },
    onSuccess: () => {
      toast({ 
        title: 'Work Order Submitted', 
        description: 'Your project request has been submitted for review.' 
      });
      setShowWorkOrderDialog(false);
      setWorkOrderStep(1);
      
      // Reset form
      setNewWorkOrder({
        campaignType: '',
        campaignGoals: '',
        productServices: '',
        talkingPoints: '',
        qualifications: '',
        successCriteria: '',
        requiredLeads: '',
        desiredTimeline: '',
        deadline: '',
        additionalInstructions: '',
        priority: 'normal',
        landingPageUrl: '',
        projectFileUrl: '',
        fileName: '',
        targetGeo: [],
        targetTitles: [],
        targetIndustries: [],
        targetRevenue: [],
        targetEmployeeSize: [],
      });

      // Refresh projects list to show the new order
      queryClient.invalidateQueries({ queryKey: ['client-portal-projects'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Submission Failed', 
        description: error.message || 'Failed to submit work order.',
        variant: 'destructive',
      });
    }
  });

  const getProgramTypeLabel = (type: string) => {
    switch (type) {
      case 'appointment_setting': return 'Appointment Setting';
      case 'event_reg_digital_ungated': return 'Event Reg - Digital (Ungated)';
      case 'event_reg_digital_gated': return 'Event Reg - Digital (Gated)';
      case 'in_person_events': return 'In-Person Events';
      case 'data_hygiene_enrichment': return 'Data Hygiene';
      case 'call_campaign': return 'Call Campaign';
      case 'email_campaign': return 'Email Campaign';
      case 'combined': return 'Combined';
      case 'data_enrichment': return 'Data Enrichment';
      default: return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  // Self-Service Campaign Creation State
  const [showCampaignCreator, setShowCampaignCreator] = useState(false);
  const [campaignCreatorStep, setCampaignCreatorStep] = useState(1);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    objectives: '',
    successCriteria: '',
    talkingPoints: '',
    context: '',
    selectedAgentId: '',
    selectedVoiceId: '',
    audienceType: 'own' as 'own' | 'managed',
    selectedAccountIds: [] as string[],
    selectedContactIds: [] as string[],
    managedAudienceRequest: '',
  });
  
  // Project Creation State (legacy - keeping for backward compatibility)
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    requestedLeads: '',
    landingPageUrl: '',
    projectFileUrl: '',
    fileName: '', // For display only
    projectType: 'custom' as 'call_campaign' | 'email_campaign' | 'data_enrichment' | 'verification' | 'combo' | 'custom',
  });

  // Lead drawer state
  const [selectedLead, setSelectedLead] = useState(null);
  const [showLeadDrawer, setShowLeadDrawer] = useState(false);
  
  // Campaign filters
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all');
  const [campaignSearchQuery, setCampaignSearchQuery] = useState('');
  const [campaignTypeFilter, setCampaignTypeFilter] = useState('all');
  
  // Lead filters
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [leadStatusFilter, setLeadStatusFilter] = useState('all');
  
  // Report view toggle
  const [reportViewType, setReportViewType] = useState('executive');
  
  // (sidebar state removed - now handled by ClientPortalLayout)

  // Campaign Creation Wizard State (new wizard)
  const [showCampaignWizard, setShowCampaignWizard] = useState(false);
  const [showPreviewStudio, setShowPreviewStudio] = useState(false);

  // Request leads dialog state
  const [showRequestLeadsDialog, setShowRequestLeadsDialog] = useState(false);
  const [selectedCampaignForRequest, setSelectedCampaignForRequest] = useState(undefined);

  // New agentic panels state
  const [showReportsPanel, setShowReportsPanel] = useState(false);
  const [showEmailGenerator, setShowEmailGenerator] = useState(false);
  // Voice Selection state (client-facing)
  const [showClientVoiceSelect, setShowClientVoiceSelect] = useState(false);
  const [clientVoiceCampaignId, setClientVoiceCampaignId] = useState('');
  const [clientSelectedVoice, setClientSelectedVoice] = useState('Kore');
  const [clientSelectedProvider, setClientSelectedProvider] = useState('google');

  // Testing panels state
  const [showTestCallPanel, setShowTestCallPanel] = useState(false);
  const [showTestEmailPanel, setShowTestEmailPanel] = useState(false);
  const [testCallData, setTestCallData] = useState({
    useManualData: false,
    manualData: { companyName: '', contactName: '', phone: '', email: '' }
  });
  const [testEmailData, setTestEmailData] = useState({
    useManualData: false,
    manualData: { companyName: '', contactName: '', email: '' },
    recipientEmail: ''
  });

  // Selected campaign state
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  // Preview Studio state
  const [testCallCampaign, setTestCallCampaign] = useState('');
  const [testEmailTemplate, setTestEmailTemplate] = useState('');
  const [testDataSource, setTestDataSource] = useState('crm');
  const [selectedCrmContact, setSelectedCrmContact] = useState('');
  const [selectedCrmAccount, setSelectedCrmAccount] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [manualTestData, setManualTestData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    title: ''
  });

  // Preview Studio - Campaign Context State
  const [previewCampaignId, setPreviewCampaignId] = useState('');
  const [previewAccountId, setPreviewAccountId] = useState('');
  const [previewContactId, setPreviewContactId] = useState('');
  const [previewAudienceAccounts, setPreviewAudienceAccounts] = useState([]);
  const [previewAudienceContacts, setPreviewAudienceContacts] = useState([]);
  const [previewActiveTab, setPreviewActiveTab] = useState('voice');
  const [selectedScenario, setSelectedScenario] = useState('cold');

  // Business Profile state
  const [businessProfile, setBusinessProfile] = useState(null);
  const [extractedColors, setExtractedColors] = useState([]);
  const [isExtractingColors, setIsExtractingColors] = useState(false);

  // Organization Intelligence state
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  // CRM state
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [crmSearchQuery, setCrmSearchQuery] = useState('');

  const [crmViewMode, setCrmViewMode] = useState('table');
  const [crmSelectedItems, setCrmSelectedItems] = useState([]);
  const [crmDetailItem, setCrmDetailItem] = useState(null);
  const [crmDetailType, setCrmDetailType] = useState('account');
  const [showCrmDetail, setShowCrmDetail] = useState(false);
  const [crmFilterIndustry, setCrmFilterIndustry] = useState('');
  const [editingContact, setEditingContact] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  const [newContact, setNewContact] = useState({ 
    firstName: '', 
    lastName: '', 
    email: '', 
    phone: '', 
    mobile: '',
    company: '', 
    title: '', 
    department: '',
    linkedinUrl: '',
    crmAccountId: '',
    status: 'active',
    emailOptOut: false,
    phoneOptOut: false
  });
  const [newAccount, setNewAccount] = useState({ 
    name: '', // Changed from companyName 
    industry: '', 
    website: '', 
    phone: '', 
    city: '',
    state: '',
    country: '',
    employees: '',
    annualRevenue: '',
    accountType: '',
    description: '' 
  });
  const [bulkUploadFile, setBulkUploadFile] = useState(null);
  const [bulkUploadType, setBulkUploadType] = useState('contacts');

  useEffect(() => {
    const storedUser = localStorage.getItem('clientPortalUser');
    if (!storedUser) {
      setLocation('/client-portal/login');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, []);

  const getToken = () => localStorage.getItem('clientPortalToken');

  const authHeaders = {
    headers: { Authorization: `Bearer ${getToken()}` },
  };

  // Queries
  const { data: campaignsRaw = [], isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery({
    queryKey: ['client-portal-campaigns', user?.clientAccountId],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    enabled: !!user,
  });
  const campaigns = useMemo(() => dedupeById(campaignsRaw), [campaignsRaw]);

  // Batch-stats for call/email metrics on campaign cards
  const PHONE_TYPES = ['call', 'telemarketing', 'sql', 'content_syndication', 'appointment_generation', 'appointment_setting',
    'high_quality_leads', 'live_webinar', 'on_demand_webinar', 'executive_dinner',
    'leadership_forum', 'conference'];

  const { data: campaignSnapshots = {} } = useQuery>({
    queryKey: ['client-portal-batch-stats', campaigns.map((c) => c.id).join(',')],
    queryFn: async () => {
      const types: Record = {};
      const campaignIds: string[] = [];
      for (const c of campaigns) {
        campaignIds.push(c.id);
        const ct = (c.campaignType || c.type || '').toLowerCase();
        types[c.id] = {
          isEmail: ct === 'email' || ct === 'combo',
          isCall: PHONE_TYPES.includes(ct) || c.dialMode === 'ai_agent',
        };
      }
      const res = await fetch('/api/client-portal/campaigns/batch-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders.headers,
        },
        body: JSON.stringify({ campaignIds, types }),
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: campaigns.length > 0 && !!user,
    refetchInterval: 30000, // Reduced from 15s to 30s to lower server load
    refetchIntervalInBackground: false, // Don't poll when tab is inactive
    staleTime: 20000,
  });

  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['client-portal-orders', user?.clientAccountId],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/orders', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['client-portal-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/invoices', authHeaders);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const { data: costSummary } = useQuery({
    queryKey: ['client-portal-costs'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/summary', authHeaders);
      if (!res.ok) return { totalCost: 0, monthlyTrend: [], byType: [] };
      return res.json();
    },
    enabled: !!user,
  });

  const { data: dashboardPricingData } = useQuery;
    hasCustomPricing: boolean;
  }>({
    queryKey: ['client-portal-dashboard-pricing'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/campaign-pricing', authHeaders);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
  });

  const { data: projects = [], isLoading: projectsLoading, refetch: refetchProjects } = useQuery({
    queryKey: ['client-portal-projects'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/projects', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: tutorialVideosData, isLoading: tutorialVideosLoading } = useQuery({
    queryKey: ['client-portal-tutorial-videos', user?.clientAccountId],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/tutorial-videos', authHeaders);
      if (!res.ok) return { videos: [], count: 0 };
      return res.json();
    },
    enabled: !!user,
  });

  // Work Orders derived from real projects data
  const workOrders = (projects || []).map((p: Project) => ({
    id: p.projectCode || p.id.slice(0, 12),
    type: p.name?.replace(/ Request$/, '') || 'Campaign',
    goals: p.description?.split('\n')[0]?.replace(/^CAMPAIGN OBJECTIVE.*?:\s*/i, '').slice(0, 200) || p.name || '',
    leads: p.requestedLeadCount ? p.requestedLeadCount.toLocaleString() : 'N/A',
    deadline: p.endDate ? new Date(p.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'TBD',
    status: p.status === 'pending' || p.status === 'draft' ? 'pending'
          : p.status === 'active' ? 'in_progress'
          : p.status === 'completed' ? 'completed'
          : p.status === 'rejected' ? 'rejected'
          : p.status,
    created: new Date(p.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    budgetAmount: p.budgetAmount ? parseFloat(p.budgetAmount) : 0,
  }));

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['client-portal-leads'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/leads', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['client-portal-activity'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/activity', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch activity log');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: voiceOptions = [] } = useQuery({
    queryKey: ['client-portal-voice-options'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns/voice-options', authHeaders);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch the client's own linked organization (not all orgs)
  const { data: clientOrgData } = useQuery({
    queryKey: ['client-portal-org-intelligence'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/organization-intelligence', authHeaders);
      if (!res.ok) return { organization: null };
      return res.json();
    },
    enabled: !!user,
  });

  // Auto-set selectedOrgId from client's linked org
  useEffect(() => {
    if (clientOrgData?.organization?.id && !selectedOrgId) {
      setSelectedOrgId(clientOrgData.organization.id);
    }
  }, [clientOrgData?.organization?.id, selectedOrgId]);

  // Feature access query — key includes tenant for cache isolation
  const { data: featuresData } = useQuery({
    queryKey: ['client-portal-features', user?.clientAccountId],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/features', authHeaders);
      if (!res.ok) return { enabledFeatures: [
        'accounts_contacts', 'bulk_upload', 'campaign_creation', 'email_templates',
        'call_flows', 'voice_selection', 'calendar_booking', 'analytics_dashboard', 'reports_export'
      ] };
      return res.json();
    },
    enabled: !!user,
  });

  // Update enabled features when data loads
  useEffect(() => {
    if (featuresData?.enabledFeatures?.length) {
      setEnabledFeatures(featuresData.enabledFeatures);
    }
  }, [featuresData]);

  // Agent capabilities (loaded only when AgentX tab is active)
  const {
    data: agenticCapabilitiesData,
    isLoading: agenticCapabilitiesLoading,
    error: agenticCapabilitiesError,
    refetch: refetchAgenticCapabilities,
  } = useQuery({
    queryKey: ['client-portal-agentic-capabilities', user?.clientAccountId],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/agentic/capabilities', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch agent capabilities');
      return res.json();
    },
    enabled: !!user && activeTab === 'agent-x',
    staleTime: 10 * 60 * 1000,
  });

  // Argyle events feature status check � key includes tenant for cache isolation
  const { data: argyleFeatureStatus } = useQuery({
    queryKey: ['argyle-events-feature-status', user?.clientAccountId],
    queryFn: async () => {
      try {
        const res = await fetch('/api/client-portal/argyle-events/feature-status', authHeaders);
        if (!res.ok) return { enabled: false };
        return await res.json();
      } catch {
        return { enabled: false };
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // UKEF campaign reports feature probe — only called for UKEF tenant
  const isUkef = user?.clientAccountId === '67b6f74d-0894-46c4-bf86-1dd047b57dd8';
  const { data: ukefReportsProbe } = useQuery({
    queryKey: ['ukef-reports-feature-probe', user?.clientAccountId],
    queryFn: async () => {
      try {
        const res = await fetch('/api/client-portal/ukef-reports/summary', authHeaders);
        if (!res.ok) return { enabled: false };
        return { enabled: true };
      } catch {
        return { enabled: false };
      }
    },
    enabled: !!user && isUkef,
    staleTime: 5 * 60 * 1000,
  });
  const ukefReportsEnabled = ukefReportsProbe?.enabled ?? false;

  // UKEF transcript QA feature probe — only called for UKEF tenant
  const { data: ukefTranscriptQaProbe } = useQuery({
    queryKey: ['ukef-tqa-feature-probe', user?.clientAccountId],
    queryFn: async () => {
      try {
        const res = await fetch('/api/client-portal/ukef-transcript-qa/status', authHeaders);
        if (!res.ok) return { enabled: false };
        return { enabled: true };
      } catch {
        return { enabled: false };
      }
    },
    enabled: !!user && isUkef,
    staleTime: 5 * 60 * 1000,
  });
  const ukefTranscriptQaEnabled = ukefTranscriptQaProbe?.enabled ?? false;

  // Business profile query
  const { data: businessProfileData, isLoading: profileLoading } = useQuery({
    queryKey: ['client-portal-business-profile'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/business-profile', authHeaders);
      if (!res.ok) return { profile: null, clientName: '', needsSetup: true };
      return res.json();
    },
    enabled: !!user,
  });
  const isArgyleClient =
    user?.clientAccountName?.trim().toLowerCase() === 'argyle' ||
    businessProfileData?.clientName?.trim().toLowerCase() === 'argyle';

  // Sync business profile data to local state for editing
  useEffect(() => {
    if (businessProfileData?.profile) {
      setBusinessProfile(businessProfileData.profile);
    }
  }, [businessProfileData]);


  // Campaign-assigned Accounts query (accounts from client's campaigns via campaignQueue)
  const { data: crmAccountsData, isLoading: crmAccountsLoading, refetch: refetchCrmAccounts } = useQuery({
    queryKey: ['client-portal-campaign-accounts', crmSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (crmSearchQuery) params.set('search', crmSearchQuery);
      const res = await fetch(`/api/client-portal/crm/campaign-accounts?${params}`, authHeaders);
      if (!res.ok) return { accounts: [], total: 0 };
      return res.json();
    },
    enabled: !!user,
  });

  // Campaign-assigned Contacts query (contacts from client's campaigns via campaignQueue)
  const { data: crmContactsData, isLoading: crmContactsLoading, refetch: refetchCrmContacts } = useQuery({
    queryKey: ['client-portal-campaign-contacts', crmSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (crmSearchQuery) params.set('search', crmSearchQuery);
      const res = await fetch(`/api/client-portal/crm/campaign-contacts?${params}`, authHeaders);
      if (!res.ok) return { contacts: [], total: 0 };
      return res.json();
    },
    enabled: !!user,
  });

  // Campaign-assigned Stats query
  const { data: crmStatsData } = useQuery({
    queryKey: ['client-portal-campaign-stats'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/crm/campaign-stats', authHeaders);
      if (!res.ok) return { totalAccounts: 0, totalContacts: 0, optedOutContacts: 0 };
      return res.json();
    },
    enabled: !!user,
  });

  // Available voices query
  const { data: voicesData } = useQuery({
    queryKey: ['client-portal-available-voices'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/available-voices', authHeaders);
      if (!res.ok) return { voices: [] };
      return res.json();
    },
    enabled: !!user,
  });

  // Bookings state
  const [showCreateBookingType, setShowCreateBookingType] = useState(false);
  const [newBookingType, setNewBookingType] = useState({ name: '', slug: '', duration: 30, description: '', color: '#3b82f6' });
  const [bookingsFilter, setBookingsFilter] = useState('upcoming');
  const { data: clientBookings = [], isLoading: bookingsLoading, refetch: refetchBookings } = useQuery({
    queryKey: ['client-portal-bookings', bookingsFilter],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/bookings?filter=${bookingsFilter}`, authHeaders);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  // Booking types query
  const { data: clientBookingTypes = [], isLoading: bookingTypesLoading, refetch: refetchBookingTypes } = useQuery({
    queryKey: ['client-portal-booking-types'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/bookings/types', authHeaders);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  // Create booking type mutation
  const createBookingTypeMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string; duration: number; description: string; color: string }) => {
      const res = await fetch('/api/client-portal/bookings/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create booking type'); }
      return res.json();
    },
    onSuccess: () => {
      refetchBookingTypes();
      setShowCreateBookingType(false);
      setNewBookingType({ name: '', slug: '', duration: 30, description: '', color: '#3b82f6' });
      toast({ title: 'Booking type created!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create booking type', description: error.message, variant: 'destructive' });
    },
  });

  // Preview Studio - Campaign audience query
  const { data: previewAudienceData, isLoading: previewAudienceLoading, refetch: refetchPreviewAudience } = useQuery({
    queryKey: ['client-portal-preview-audience', previewCampaignId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/campaigns/${previewCampaignId}/preview-audience`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch preview audience');
      return res.json();
    },
    enabled: !!user && !!previewCampaignId,
  });

  // Update preview audience state when data loads
  useEffect(() => {
    if (previewAudienceData) {
      setPreviewAudienceAccounts(dedupeById(previewAudienceData.accounts || []));
      setPreviewAudienceContacts(dedupeById(previewAudienceData.contacts || []));
      // Reset selections when campaign changes
      setPreviewAccountId('');
      setPreviewContactId('');
    }
  }, [previewAudienceData]);

  // Filter contacts by selected account
  const filteredPreviewContacts = previewAccountId 
    ? previewAudienceContacts.filter(c => c.company === previewAudienceAccounts.find(a => a.id === previewAccountId)?.name)
    : previewAudienceContacts;

  // Get selected contact data for preview
  const selectedPreviewContact = previewAudienceContacts.find(c => c.id === previewContactId);
  const selectedPreviewAccount = previewAudienceAccounts.find(a => a.id === previewAccountId);

  // Helper function to check if feature is enabled
  const hasFeature = (feature: string) => enabledFeatures.includes(feature);

  // Derived CRM data
  const crmAccounts = useMemo(
    () => dedupeById(crmAccountsData?.accounts || []),
    [crmAccountsData]
  );
  const crmContacts = useMemo(
    () => dedupeById(crmContactsData?.contacts || []),
    [crmContactsData]
  );
  const availableVoices = voicesData?.voices || [];

  // Mutations
  const createProjectMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      description?: string; 
      requestedLeadCount?: number;
      landingPageUrl?: string;
      projectFileUrl?: string;
      projectType?: string;
    }) => {
      const res = await fetch('/api/client-portal/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create project');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-projects'] });
      setShowCreateDialog(false);
      setNewProject({
        name: '',
        description: '',
        requestedLeads: '',
        landingPageUrl: '',
        projectFileUrl: '',
        fileName: '',
        projectType: 'custom'
      });
      toast({ title: 'Campaign request created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create campaign request', variant: 'destructive' });
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch(`/api/client-portal/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (!res.ok) throw new Error('Failed to delete project');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-projects'] });
      toast({ title: 'Campaign request deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete campaign request', variant: 'destructive' });
    },
  });

  // Save business profile mutation
  const saveBusinessProfileMutation = useMutation({
    mutationFn: async (data: {
      legalBusinessName: string;
      dbaName?: string | null;
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      customUnsubscribeUrl?: string | null;
      website?: string | null;
      phone?: string | null;
      supportEmail?: string | null;
      logoUrl?: string | null;
      brandColor?: string | null;
    }) => {
      const res = await fetch('/api/client-portal/settings/business-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to save business profile');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-business-profile'] });
      toast({ title: 'Business profile saved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save business profile', description: error.message, variant: 'destructive' });
    },
  });


  // CRM: Add/Edit Contact mutation
  const addContactMutation = useMutation({
    mutationFn: async (data: any) => {
      const isEdit = !!data.id;
      const url = isEdit ? `/api/client-portal/crm/contacts/${data.id}` : '/api/client-portal/crm/contacts';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save contact'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-stats'] });
      setShowAddContactDialog(false);
      setEditingContact(null);
      setNewContact({ firstName: '', lastName: '', email: '', phone: '', mobile: '', company: '', title: '', department: '', linkedinUrl: '', crmAccountId: '', status: 'active', emailOptOut: false, phoneOptOut: false });
      toast({ title: editingContact ? 'Contact updated' : 'Contact added successfully' });
    },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  // CRM: Add/Edit Account mutation
  const addAccountMutation = useMutation({
    mutationFn: async (data: any) => {
      const isEdit = !!data.id;
      const url = isEdit ? `/api/client-portal/crm/accounts/${data.id}` : '/api/client-portal/crm/accounts';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save account'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-stats'] });
      setShowAddAccountDialog(false);
      setEditingAccount(null);
      setNewAccount({ name: '', industry: '', website: '', phone: '', city: '', state: '', country: '', employees: '', annualRevenue: '', accountType: '', description: '' });
      toast({ title: editingAccount ? 'Account updated' : 'Account added successfully' });
    },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  // CRM: Delete Contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client-portal/crm/contacts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete contact'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-stats'] });
      toast({ title: 'Contact deleted' });
    },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  // CRM: Delete Account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/client-portal/crm/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete account'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-stats'] });
      toast({ title: 'Account deleted' });
    },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  // CRM: Link contact to account mutation
  const linkContactMutation = useMutation({
    mutationFn: async ({ contactId, accountId }: { contactId: string; accountId: string | null }) => {
      const res = await fetch(`/api/client-portal/crm/contacts/${contactId}/link-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to link contact'); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-contacts'] });
      toast({ title: data.message || 'Contact linked' });
    },
    onError: (error: Error) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
  });

  // CRM: Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/client-portal/crm/bulk-import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to import'); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-crm-accounts'] });
      setShowBulkUploadDialog(false);
      setBulkUploadFile(null);
      toast({ title: 'Import complete', description: `${data.imported || 0} records imported` });
    },
    onError: (error: Error) => toast({ title: 'Import failed', description: error.message, variant: 'destructive' }),
  });

  // CRM: Handle bulk CSV upload
  const handleBulkImport = () => {
    if (!bulkUploadFile) return;
    const fd = new FormData();
    fd.append('file', bulkUploadFile);
    fd.append('type', bulkUploadType);
    bulkImportMutation.mutate(fd);
  };


  // CRM: View detail
  const handleViewCrmDetail = (item: any, type: 'account' | 'contact') => {
    setCrmDetailItem(item);
    setCrmDetailType(type);
    setShowCrmDetail(true);
  };

  // CRM: Toggle selection
  const toggleCrmSelection = (id: string) => {
    setCrmSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // CRM: Select all
  const toggleSelectAll = (items: any[]) => {
    if (crmSelectedItems.length === items.length) {
      setCrmSelectedItems([]);
    } else {
      setCrmSelectedItems(items.map(i => i.id));
    }
  };

  // Handler for saving business profile
  const handleSaveBusinessProfile = () => {
    if (!businessProfile) return;
    
    saveBusinessProfileMutation.mutate({
      legalBusinessName: businessProfile.legalBusinessName || '',
      dbaName: businessProfile.dbaName || null,
      addressLine1: businessProfile.streetAddress || businessProfile.addressLine1 || '',
      addressLine2: businessProfile.addressLine2 || null,
      city: businessProfile.city || '',
      state: businessProfile.state || '',
      postalCode: businessProfile.postalCode || '',
      country: businessProfile.country || 'United States',
      customUnsubscribeUrl: businessProfile.customUnsubscribeUrl || null,
      website: businessProfile.website || null,
      phone: businessProfile.phone || null,
      supportEmail: businessProfile.supportEmail || null,
      logoUrl: businessProfile.logoUrl || null,
      brandColor: businessProfile.brandColor || null,
    });
  };

  const handleExtractColorsFromLogo = async () => {
    const logoUrl = businessProfile?.logoUrl;
    if (!logoUrl) return;
    setIsExtractingColors(true);
    setExtractedColors([]);
    try {
      const colors = await extractColorsFromImage(logoUrl, 6);
      setExtractedColors(colors.map((c) => ({ hex: c.hex, percentage: c.percentage })));
      // Auto-apply the most dominant color as brand color
      if (colors.length > 0) {
        setBusinessProfile((prev: any) => ({ ...prev, brandColor: colors[0].hex }));
      }
    } catch {
      toast({ title: 'Could not extract colors', description: 'Make sure the logo URL is accessible and points to an image (PNG, JPG, SVG).', variant: 'destructive' });
    } finally {
      setIsExtractingColors(false);
    }
  };

  const handleDeleteProject = (projectId: string, projectName: string) => {
    if (window.confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      deleteProjectMutation.mutate(projectId);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Get presigned URL
      const res = await fetch('/api/s3/upload-url', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}` 
        },
        body: JSON.stringify({ 
          filename: file.name, 
          contentType: file.type,
          folder: 'uploads' 
        }),
      });
      
      if (!res.ok) throw new Error('Failed to get upload URL');
      const { url, key } = await res.json();

      // Upload to S3
      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload file');

      setNewProject(prev => ({ 
        ...prev, 
        projectFileUrl: key,
        fileName: file.name
      }));
      toast({ title: 'File uploaded successfully' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateProject = () => {
    if (!newProject.name.trim()) {
      toast({ title: 'Campaign Name is required', variant: 'destructive' });
      return;
    }
    createProjectMutation.mutate({
      name: newProject.name,
      description: newProject.description || undefined,
      requestedLeadCount: newProject.requestedLeads ? parseInt(newProject.requestedLeads) : undefined,
      landingPageUrl: newProject.landingPageUrl || undefined,
      projectFileUrl: newProject.projectFileUrl || undefined,
      projectType: newProject.projectType,
    });
  };

  const handleLogout = () => {
    clearClientPortalSession();
    setLocation('/client-portal/login');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const label = status === 'approved_pending_setup'
      ? 'Approved - Pending setup'
      : status === 'in_review'
      ? 'Pending Approval'
      : status.charAt(0).toUpperCase() + status.slice(1);
    return (
      
        {label}
      
    );
  };

  const openRequestLeadsDialog = (campaignId?: string) => {
    setSelectedCampaignForRequest(campaignId);
    setShowRequestLeadsDialog(true);
  };

  const closeRequestLeadsDialog = () => {
    setShowRequestLeadsDialog(false);
    setSelectedCampaignForRequest(undefined);
  };

  const openCampaignPreviewStudio = (campaignId?: string, mode: 'voice' | 'phone' | 'email' = 'voice') => {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    params.set('mode', mode);
    const query = params.toString();
    setLocation(`/client-portal/preview-studio${query ? `?${query}` : ''}`);
  };

  const activityConfig: Record = {
    project_created: { title: 'Campaign Request Submitted', type: 'campaign', status: 'info' },
    requested_additional_leads: { title: 'Additional Leads Requested', type: 'campaign', status: 'info' },
  };

  const activityItems: ActivityItem[] = (activityData?.activities || []).map((activity) => {
    const details = activity.details || {};
    const config = activityConfig[activity.action] || {
      title: activity.action.replace(/_/g, ' '),
      type: 'custom' as ActivityItem['type'],
    };
    const title = config.title;
    const description =
      activity.action === 'requested_additional_leads'
        ? `Requested ${details.requestedQuantity?.toLocaleString?.() || details.requestedQuantity || 'additional'} leads for ${details.campaignName || 'a campaign'}.`
        : activity.action === 'project_created'
          ? `Campaign request created for ${details.name || 'a new campaign'}.`
          : undefined;

    const metadata = activity.action === 'requested_additional_leads'
      ? {
          campaign: details.campaignName,
          quantity: details.requestedQuantity,
          priority: details.priority,
        }
      : activity.action === 'project_created'
        ? {
            requested_leads: details.requestedLeadCount,
          }
        : undefined;

    return {
      id: activity.id,
      type: config.type,
      title,
      description,
      timestamp: activity.createdAt,
      status: config.status,
      metadata,
    };
  });

  const projectStatusSteps = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'active', label: 'In Progress' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'completed', label: 'Completed' },
  ];

  const getProjectStatusStep = (status?: string) => {
    const normalized = (status || 'pending').toLowerCase();
    const index = projectStatusSteps.findIndex((step) => step.key === normalized);
    return index === -1 ? 1 : index + 1;
  };

  // Calculate metrics
  const totalLeadsDelivered = campaigns.reduce((sum, c) => sum + (c.deliveredCount || 0), 0);
  const totalEligible = campaigns.reduce((sum, c) => sum + (c.eligibleCount || 0), 0);
  const totalSpent = costSummary?.totalCost || 0;
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.totalAmount - i.amountPaid, 0);

  // Client-facing core performance KPIs
  const totalAudience = totalEligible;
  const totalImpressions = campaigns.reduce(
    (sum, c) =>
      sum +
      Number(
        c.stats?.impressions ??
        c.stats?.attempts ??
        c.callReport?.callsMade ??
        0,
      ),
    0,
  );
  const totalLeads = totalLeadsDelivered;
  const impressionToLeadRate = totalImpressions > 0
    ? Number(((totalLeads / totalImpressions) * 100).toFixed(1))
    : 0;
  const totalOrderedLeads = orders.reduce(
    (sum, o) => sum + (o.approvedQuantity ?? o.requestedQuantity ?? 0),
    0,
  );
  const remainingOrderedLeads = Math.max(
    totalOrderedLeads - orders.reduce((sum, o) => sum + (o.deliveredQuantity || 0), 0),
    0,
  );
  const averageCPL = totalLeadsDelivered > 0 ? Math.round(totalSpent / totalLeadsDelivered) : 0;
  
  // Filter campaigns
  // Filter campaigns
  const filteredCampaigns = campaigns.filter(campaign => {
    const effectiveStatus = campaign.clientStatus || campaign.status;
    const matchesStatus = campaignStatusFilter === 'all' || effectiveStatus === campaignStatusFilter;
    const matchesSearch = !campaignSearchQuery || 
      campaign.name.toLowerCase().includes(campaignSearchQuery.toLowerCase());
    
    // Type filtering logic
    let matchesType = true;
    if (campaignTypeFilter !== 'all') {
        const type = (campaign.type || campaign.campaignType || '').toLowerCase();
        if (campaignTypeFilter === 'voice') matchesType = type.includes('voice') || type.includes('call') || type.includes('phone') || type.includes('appointment');
        else if (campaignTypeFilter === 'email') matchesType = type.includes('email') || type.includes('mail');
        else if (campaignTypeFilter === 'combined') matchesType = type.includes('combo') || type.includes('hybrid');
        else if (campaignTypeFilter === 'data') matchesType = type.includes('data');
    }

    return matchesStatus && matchesSearch && matchesType;
  });

  // Aggregate call stats from batch-stats snapshots
  const callCampaignReportTotals = filteredCampaigns.reduce((acc, campaign) => {
    const snap = campaignSnapshots[campaign.id]?.call;
    if (snap) {
      acc.recipients += Number(snap.contactsInQueue || 0);
      acc.callsMade += Number(snap.callsMade || 0);
      acc.connected += Number(snap.callsConnected || 0);
      acc.qualified += Number(snap.leadsQualified || 0);
      acc.dnc += Number(snap.dncRequests || 0);
    } else {
      // Fallback to campaign-level callReport
      const report = campaign.callReport || campaign.stats?.callReport;
      if (report) {
        acc.callsMade += Number(report.callsMade || 0);
        acc.connected += Number(report.connected || 0);
        acc.qualified += Number(report.qualified || 0);
      }
    }
    return acc;
  }, { recipients: 0, callsMade: 0, connected: 0, qualified: 0, dnc: 0 });

  // Aggregate email stats from batch-stats snapshots
  const emailCampaignReportTotals = filteredCampaigns.reduce((acc, campaign) => {
    const snap = campaignSnapshots[campaign.id]?.email;
    if (snap) {
      acc.recipients += Number(snap.totalRecipients || 0);
      acc.delivered += Number(snap.delivered || 0);
      acc.opens += Number(snap.opens || 0);
      acc.clicks += Number(snap.clicks || 0);
      acc.unsubs += Number(snap.unsubscribes || 0);
    }
    return acc;
  }, { recipients: 0, delivered: 0, opens: 0, clicks: 0, unsubs: 0 });
  
  // Filter projects (campaign requests)
  const filteredProjects = projects.filter(project => {
    const matchesSearch = !campaignSearchQuery || 
      project.name.toLowerCase().includes(campaignSearchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(campaignSearchQuery.toLowerCase());
    return matchesSearch;
  });
  
  // Filter leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !leadSearchQuery || 
      `${lead.firstName} ${lead.lastName} ${lead.company} ${lead.email}`.toLowerCase().includes(leadSearchQuery.toLowerCase());
    return matchesSearch;
  });

  // Mock data for charts (will be replaced with real data)
  const deliveryTrendData = [
    { month: 'Jan', leads: 120, verified: 95 },
    { month: 'Feb', leads: 180, verified: 150 },
    { month: 'Mar', leads: 250, verified: 210 },
    { month: 'Apr', leads: 320, verified: 280 },
    { month: 'May', leads: 280, verified: 240 },
    { month: 'Jun', leads: 350, verified: 310 },
  ];

  const campaignPerformance = campaigns.slice(0, 5).map((c, i) => ({
    name: c.name.length > 20 ? c.name.substring(0, 20) + '...' : c.name,
    delivered: c.deliveredCount || 0,
    verified: c.verifiedCount || 0,
  }));

  if (!user) {
    return (
      
        
      
    );
  }

  // Main navigation items - clean and unique
  // Core navigation modules - available to all clients by default
  const navItems: { id: string; label: string; icon: any; color: string; action?: () => void; featureRequired?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
    { id: 'campaign-order', label: 'Agentic Order', icon: ClipboardList, color: 'from-orange-500 to-amber-500' },
    { id: 'campaigns', label: 'Campaigns', icon: Target, color: 'from-purple-500 to-pink-500' },
    { id: 'accounts', label: 'Accounts', icon: Building2, color: 'from-rose-500 to-pink-500' },
    { id: 'contacts', label: 'Contacts', icon: Users, color: 'from-sky-500 to-cyan-500' },
    { id: 'intelligence', label: 'Intelligence', icon: Brain, color: 'from-violet-500 to-purple-500' },
    { id: 'leads', label: 'Leads', icon: UserCheck, color: 'from-green-500 to-emerald-500' },
    { id: 'bookings', label: 'Bookings', icon: Calendar, color: 'from-teal-500 to-green-500' },
    { id: 'billing', label: 'Billing', icon: Receipt, color: 'from-indigo-500 to-purple-500' },
    { id: 'support', label: 'Support', icon: Headphones, color: 'from-slate-500 to-slate-600' },
    { id: 'settings', label: 'Settings', icon: Settings, color: 'from-gray-500 to-slate-500' },
  ];

  // Conditionally add Argyle events nav item (as a dashboard tab, not a separate page)
  if (argyleFeatureStatus?.enabled) {
    // Insert before Billing
    const billingIdx = navItems.findIndex(i => i.id === 'billing');
    navItems.splice(billingIdx >= 0 ? billingIdx : navItems.length - 2, 0, {
      id: 'argyle-events',
      label: 'Upcoming Events',
      icon: CalendarDays,
      color: 'from-emerald-500 to-teal-500',
    });
  }

  // Conditionally add UKEF campaign reports tab (feature-flagged + client-gated)
  if (ukefReportsEnabled) {
    const billingIdx2 = navItems.findIndex(i => i.id === 'billing');
    navItems.splice(billingIdx2 >= 0 ? billingIdx2 : navItems.length - 2, 0, {
      id: 'ukef-reports',
      label: 'Campaign Reports',
      icon: FileBarChart2,
      color: 'from-sky-500 to-blue-600',
    });
  }

  // Conditionally add UKEF transcript QA tab (feature-flagged + client-gated)
  if (ukefTranscriptQaEnabled) {
    const billingIdx3 = navItems.findIndex(i => i.id === 'billing');
    navItems.splice(billingIdx3 >= 0 ? billingIdx3 : navItems.length - 2, 0, {
      id: 'ukef-transcript-qa',
      label: 'Transcript QA',
      icon: ShieldCheck,
      color: 'from-violet-500 to-purple-600',
    });
  }


  return (
    
      
          {/* Sub-Navigation for Target Markets */}
          {activeTab === 'target-markets' && (
            
               
                 
                    
                       Accounts
                       Contacts
                       Segments
                    
                 
               

               {targetMarketTab === 'accounts' && (() => {
          const accounts = crmAccounts || [];
          const filteredAccounts = accounts.filter((a: any) => {
            if (crmFilterIndustry && a.industry !== crmFilterIndustry) return false;
            if (crmSearchQuery) {
              const q = crmSearchQuery.toLowerCase();
              return [a.name, a.industry, a.website].some(f => f?.toLowerCase()?.includes(q));
            }
            return true;
          });
          const allIndustries = [...new Set(accounts.map((a: any) => a.industry).filter(Boolean))];
          const currentItems = filteredAccounts.slice(0, 20); // Limit visibility to 20 assigned accounts

          return (
          
            {/* Header with stats */}
            
              
                
                  Accounts
                
                
                  Accounts assigned to your campaigns and targeting
                
                {filteredAccounts.length > 20 && (
                  
                    Showing top 20 of {filteredAccounts.length} assigned accounts
                  
                )}
              
              
                 {
                  const items = filteredAccounts;
                  const headers = 'Company Name,Industry,Website';
                  const rows = items.map((i: any) => `${i.name},${i.industry},${i.website}`);
                  const csv = [headers, ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `accounts.csv`; a.click();
                  toast({ title: 'Exported', description: `${items.length} accounts exported to CSV` });
                }}>
                  
                  Export
                
              
            

            {/* Stats row */}
            
              
                Total Accounts
                {crmStatsData?.totalAccounts ?? accounts.length}
              
              
                Total Contacts
                {crmStatsData?.totalContacts ?? 0}
              
              
                Industries
                {allIndustries.length}
              
              
                Campaigns
                {campaigns?.length ?? 0}
              
            

            {/* Filters + View Toggle */}
            
              
                
                  
                   setCrmSearchQuery(e.target.value)} />
                
                {allIndustries.length > 0 && (
                  
                    
                    
                      All Industries
                      {allIndustries.map(ind => {ind as string})}
                    
                  
                )}
              
              
                 setCrmViewMode('table')}>
                  
                
                 setCrmViewMode('card')}>
                  
                
              
            

            {/* Bulk Actions Bar */}
            {crmSelectedItems.length > 0 && (
              
                {crmSelectedItems.length} selected
                 setCrmSelectedItems([])}>Deselect All
                 {
                  if (!window.confirm(`Delete ${crmSelectedItems.length} accounts?`)) return;
                  crmSelectedItems.forEach(id => deleteAccountMutation.mutate(id));
                  setCrmSelectedItems([]);
                }}>
                   Delete
                
              
            )}

            {/* Content - ACCOUNTS */}
            {crmAccountsLoading ? (
              
            ) : filteredAccounts.length === 0 ? (
              
                
                  
                  No Accounts Found
                  Accounts will appear here once they are assigned to your campaigns
                
              
            ) : crmViewMode === 'table' ? (
              
                
                  
                    
                      
                        
                          
                             0} onChange={() => toggleSelectAll(currentItems)} />
                          
                          Company
                          Industry
                          Type
                          Website
                          Contacts
                          Actions
                        
                      
                      
                        {currentItems.map((account: any) => (
                           handleViewCrmDetail(account, 'account')}>
                             e.stopPropagation()}>
                               toggleCrmSelection(account.id)} />
                            
                            
                              
                                {account.name?.[0]}
                                {account.name}
                              
                            
                            {account.industry && {account.industry}}
                            {account.accountType || '-'}
                            {account.website}
                            {account.contactCount || 0}
                             e.stopPropagation()}>
                               handleViewCrmDetail(account, 'account')}>
                               { setEditingAccount(account); setShowAddAccountDialog(true); }}>
                               {
                                if (window.confirm(`Are you sure you want to delete account "${account.name}"?`)) {
                                  deleteAccountMutation.mutate(account.id);
                                }
                              }}>
                            
                          
                        ))}
                      
                    
                  
                
              
            ) : (
              
                {currentItems.map((account: any) => (
                   handleViewCrmDetail(account, 'account')}>
                    
                      
                        
                          {account.name?.[0]}
                          
                            {account.name}
                            {account.industry && {account.industry}}
                          
                        
                         { e.stopPropagation(); toggleCrmSelection(account.id); }} />
                      
                    
                    
                      {account.website && {account.website}}
                      {account.phone && {account.phone}}
                      {account.contactCount || 0} contacts
                    
                  
                ))}
              
            )}
          
          );
        })()}


               {targetMarketTab === 'contacts' && (() => {
          const contacts = crmContacts || [];
          const accounts = crmAccounts || [];
          const filteredContacts = contacts.filter((c: any) => {
            if (crmFilterIndustry && c.industry !== crmFilterIndustry) return false;
            if (crmSearchQuery) {
              const q = crmSearchQuery.toLowerCase();
              return [c.firstName, c.lastName, c.email, c.company, c.title, c.phone].some(f => f?.toLowerCase()?.includes(q));
            }
            return true;
          });
          const allIndustries = [...new Set(contacts.map((c: any) => c.industry).filter(Boolean))];
          const currentItems = filteredContacts.slice(0, 50); // Limit visibility to 50 assigned contacts

          return (
          
            {/* Header with stats */}
            
              
                
                  Contacts
                
                
                  Contacts assigned to your campaigns
                
                {filteredContacts.length > 50 && (
                  
                    Showing top 50 of {filteredContacts.length} assigned contacts
                  
                )}
              
              
                 {
                  const items = filteredContacts;
                  const headers = 'First Name,Last Name,Email,Phone,Company,Title';
                  const rows = items.map((i: any) => `${i.firstName},${i.lastName},${i.email},${i.phone},${i.company},${i.title}`);
                  const csv = [headers, ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `contacts.csv`; a.click();
                  toast({ title: 'Exported', description: `${items.length} contacts exported to CSV` });
                }}>
                  
                  Export
                
              
            

            {/* Stats row */}
            
              
                Total Accounts
                {crmStatsData?.totalAccounts ?? 0}
              
              
                Total Contacts
                {crmStatsData?.totalContacts ?? contacts.length}
              
              
                Industries
                {allIndustries.length}
              
              
                Campaigns
                {campaigns?.length ?? 0}
              
            

            {/* Filters + View Toggle */}
            
              
                
                  
                   setCrmSearchQuery(e.target.value)} />
                
                {allIndustries.length > 0 && (
                  
                    
                    
                      All Industries
                      {allIndustries.map(ind => {ind as string})}
                    
                  
                )}
              
              
                 setCrmViewMode('table')}>
                  
                
                 setCrmViewMode('card')}>
                  
                
              
            

            {/* Bulk Actions Bar */}
            {crmSelectedItems.length > 0 && (
              
                {crmSelectedItems.length} selected
                 setCrmSelectedItems([])}>Deselect All
                 {
                  if (!window.confirm(`Delete ${crmSelectedItems.length} contacts?`)) return;
                  crmSelectedItems.forEach(id => deleteContactMutation.mutate(id));
                  setCrmSelectedItems([]);
                }}>
                   Delete
                
              
            )}

            {/* Content - CONTACTS */}
            {crmContactsLoading ? (
              
            ) : filteredContacts.length === 0 ? (
              
                
                  
                  No Contacts Found
                  Contacts will appear here once they are assigned to your campaigns
                
              
            ) : crmViewMode === 'table' ? (
              
                
                  
                    
                      
                        
                          
                             0} onChange={() => toggleSelectAll(currentItems)} />
                          
                          Name
                          Email
                          Phone
                          Company
                          Title
                          Actions
                        
                      
                      
                        {currentItems.map((contact: any) => (
                           handleViewCrmDetail(contact, 'contact')}>
                             e.stopPropagation()}>
                               toggleCrmSelection(contact.id)} />
                            
                            
                              
                                
                                  {contact.firstName?.[0]}{contact.lastName?.[0]}
                                
                                {contact.firstName} {contact.lastName}
                              
                            
                            {contact.email}
                            {contact.phone}
                            {contact.company}
                            {contact.title}
                             e.stopPropagation()}>
                               handleViewCrmDetail(contact, 'contact')}>
                               { setEditingContact(contact); setShowAddContactDialog(true); }}>
                               {
                                if (window.confirm(`Are you sure you want to delete contact "${contact.firstName} ${contact.lastName}"?`)) {
                                  deleteContactMutation.mutate(contact.id);
                                }
                              }}>
                            
                          
                        ))}
                      
                    
                  
                
              
            ) : (
              
                {currentItems.map((contact: any) => (
                   handleViewCrmDetail(contact, 'contact')}>
                    
                      
                        
                          
                            {contact.firstName?.[0]}{contact.lastName?.[0]}
                          
                          
                            {contact.firstName} {contact.lastName}
                            {contact.title && {contact.title}}
                          
                        
                         { e.stopPropagation(); toggleCrmSelection(contact.id); }} />
                      
                    
                    
                      {contact.email && {contact.email}}
                      {contact.phone && {contact.phone}}
                      {contact.company && {contact.company}}
                    
                  
                ))}
              
            )}
          
          );
        })()}

               {targetMarketTab === 'segments' && (
                 
                    
                      
                      Segments & Lists
                      Create and manage audience segments for targeted outreach.
                      Coming Soon
                    
                 
               )}
            
          )}

        {/* ==================== OVERVIEW TAB (Dashboard KPIs) ==================== */}
        {activeTab === 'overview' && (
          
            {/* Executive Header */}
            
              
                
                  
                    Executive Overview
                  
                  
                    Updated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  
                
                
                  Welcome back, {user.firstName}
                
                
                  Performance overview for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
                
              
              
              
                 setActiveTab('agent-x')}
                >
                  
                  Open AgentX
                
                 setShowReportsPanel(true)}
                >
                  
                  Generate Report
                
              
            

            {/* Enterprise KPI Tiles - Refreshed */}
            
              {/* Total Audience */}
                
                
                   
                     
                         
                      
                   
                   
                      Total Audience
                      {totalAudience.toLocaleString()}
                   
                
              

              {/* Impressions */}
                
                
                   
                     
                         
                      
                   
                   
                      Impressions
                      {totalImpressions.toLocaleString()}
                   
                
              

              {/* Leads */}
                
                
                   
                     
                         
                      
                   
                   
                      Leads
                      {totalLeads.toLocaleString()}
                   
                
              

              {/* Impression -> Lead Conversion */}
                
                
                   
                     
                         
                      
                   
                   
                      Impression to Lead CVR
                      {impressionToLeadRate}%
                   
                
              

              {/* Remaining Ordered Leads */}
              
                
                  
                    
                      
                    
                  
                  
                    Remaining
                    {remainingOrderedLeads.toLocaleString()}
                  
                
              
            

            {/* AI Tools Section */}
            
                 {/* Main Chart Area */}
                 
                    
                        
                            Campaign Performance
                            
                                
                                    
                                
                                
                                    This Month
                                    Last Month
                                    Last Quarter
                                
                            
                        
                    
                    
                         
                            
                            Performance Analytics Visualization
                            Loading complex dataset...
                         
                    
                 

                 {/* AI Actions */}
                 
                    
                         
                             
                             Quick Actions
                         
                    
                    
                        
                              setShowReportsPanel(true)} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group">
                                
                                    
                                
                                
                                    Generate Reports
                                    AI-driven analytics reports
                                
                                
                            
                              setShowEmailGenerator(true)} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group">
                                
                                    
                                
                                
                                    Email Generator
                                    Generate emails with AI
                                
                                
                            
                        
                    
                 
            



            {/* How Our AI Engages Your Prospects (Argyle only) */}
            {isArgyleClient && (
              
            )}

            {/* Client Tutorial Videos */}
            
              
                
                  
                    
                    Training Videos
                  
                  Watch your team's assigned onboarding and workflow tutorials.
                
                {tutorialVideosData?.count ? (
                  
                    {tutorialVideosData.count} available
                  
                ) : null}
              
              
                {tutorialVideosLoading ? (
                  
                    
                  
                ) : (tutorialVideosData?.videos?.length || 0) > 0 ? (
                  
                    {tutorialVideosData!.videos.map((video) => (
                      
                        
                          
                        
                        
                          
                            {video.title}
                            {video.provider.replace('_', ' ')}
                          
                          {video.description ? (
                            {video.description}
                          ) : null}
                          
                            
                              Open source video
                              
                            
                          
                        
                      
                    ))}
                  
                ) : (
                  
                    
                    No training videos have been assigned for your account yet.
                  
                )}
              
            

            {/* Recent Activity */}
            
              
                
                  
                    Recent Orders
                    Your latest contact orders
                  
                   setActiveTab('journey-pipeline')}>
                    View All 
                  
                
                
                  {orders.length === 0 ? (
                    
                      
                      No orders yet
                    
                  ) : (
                    
                      {orders.slice(0, 5).map((order) => (
                        
                          
                            
                              
                            
                            
                              {order.orderNumber}
                              {order.campaignName}
                            
                          
                          
                            {getStatusBadge(order.status)}
                            
                              {order.deliveredQuantity}/{order.requestedQuantity} delivered
                            
                          
                        
                      ))}
                    
                  )}
                
              

              
                
                  
                    Your Campaigns
                    Quick access to campaigns
                  
                   setActiveTab('campaigns')}>
                    View All 
                  
                
                
                  {campaigns.length === 0 ? (
                    
                      
                      No campaigns assigned yet
                      Contact your account manager
                    
                  ) : (
                    
                      {campaigns.slice(0, 5).map((campaign) => (
                         {
                            openRequestLeadsDialog(campaign.id);
                          }}
                        >
                          
                            
                              
                            
                            
                              {campaign.name}
                              
                                {campaign.eligibleCount?.toLocaleString() || 0} eligible
                                •
                                {campaign.deliveredCount?.toLocaleString() || 0} delivered
                              
                            
                          
                          
                            {getStatusBadge(campaign.clientStatus || campaign.status || 'active')}
                            
                          
                        
                      ))}
                    
                  )}
                
              
            

            

            {/* Activity & Requests */}
            
              
                
                Activity & Requests
                {(activityData?.activities?.length || 0) > 0 && (
                  {activityData?.activities?.length}
                )}
              
              
                
                  {activityLoading ? (
                    
                  ) : (
                    
                      
                    
                  )}
                
              
            
          
        )}

        {/* ==================== VERTEX AI / AGENT X TAB ==================== */}
        {activeTab === 'agent-x' && (
          
            
              
                
                AgentX
              
              
                Autonomous Agents & Workflow Automation
              
            

            {agenticCapabilitiesLoading ? (
              
                
                  
                  Loading agent capabilities...
                
              
            ) : agenticCapabilitiesError ? (
              
                
                  
                  Unable to load capabilities
                  
                    We could not fetch AgentX capabilities from the client portal API.
                  
                   refetchAgenticCapabilities()}>
                    
                    Retry
                  
                
              
            ) : (
              
                
                  {Object.entries(agenticCapabilitiesData?.capabilities || {}).map(([key, capability]) => (
                    
                      
                        {capability.name}
                        {capability.description}
                      
                      
                        
                          {(capability.features || []).map((feature) => (
                            
                              {feature}
                            
                          ))}
                        
                      
                    
                  ))}
                

                {Object.keys(agenticCapabilitiesData?.capabilities || {}).length === 0 && (
                  
                    
                      
                      No capabilities returned for this account yet.
                    
                  
                )}
              
            )}
          
        )}

        {/* ==================== CAMPAIGNS TAB ==================== */}
        {activeTab === 'campaigns' && (
          

            {/* Page header + filters inline */}
            
              
                
                  
                  Campaign Portfolio
                  {filteredCampaigns.length > 0 && (
                    {filteredCampaigns.length}
                  )}
                
                Live dialer stats match your admin view — sourced from the same data.
              
              
                
                  
                   setCampaignSearchQuery(e.target.value)}
                  />
                
                 setCampaignStatusFilter(val)}>
                  
                    
                      
                      
                    
                  
                  
                    All Statuses
                    Active
                    Paused
                    Pending Setup
                    Pending Approval
                    Completed
                  
                
                 setCampaignTypeFilter(val)}>
                  
                    
                  
                  
                    All Types
                    Voice
                    Email
                    Combined
                    Data
                  
                
                {(campaignSearchQuery || campaignStatusFilter !== 'all' || campaignTypeFilter !== 'all') && (
                   { setCampaignSearchQuery(''); setCampaignStatusFilter('all'); setCampaignTypeFilter('all'); }}>
                    
                  
                )}
              
            

            {/* Aggregate call stats bar */}
            {callCampaignReportTotals.callsMade > 0 && (
              
                
                  
                  Call Campaigns
                
                
                  {[
                    { label: 'Recipients', value: callCampaignReportTotals.recipients, color: 'text-slate-700 dark:text-slate-200' },
                    { label: 'Attempts', value: callCampaignReportTotals.callsMade, color: 'text-blue-600 dark:text-blue-400' },
                    { label: 'RPC', value: callCampaignReportTotals.connected, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Qualified', value: callCampaignReportTotals.qualified, color: 'text-violet-600 dark:text-violet-400' },
                    { label: 'DNC', value: callCampaignReportTotals.dnc, color: 'text-red-500 dark:text-red-400' },
                  ].map(({ label, value, color }) => (
                    
                      {value.toLocaleString()}
                      {label}
                    
                  ))}
                
              
            )}

            {/* Aggregate email stats bar */}
            {emailCampaignReportTotals.recipients > 0 && (
              
                
                  
                  Email Campaigns
                
                
                  {[
                    { label: 'Recipients', value: emailCampaignReportTotals.recipients, color: 'text-slate-700 dark:text-slate-200' },
                    { label: 'Delivered', value: emailCampaignReportTotals.delivered, color: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Opened', value: emailCampaignReportTotals.opens, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Clicked', value: emailCampaignReportTotals.clicks, color: 'text-violet-600 dark:text-violet-400' },
                    { label: 'Unsub', value: emailCampaignReportTotals.unsubs, color: 'text-red-500 dark:text-red-400' },
                  ].map(({ label, value, color }) => (
                    
                      {value.toLocaleString()}
                      {label}
                    
                  ))}
                
              
            )}

            {/* Preview Studio notice */}
            
              
              
                Campaign testing lives in Preview Studio
                
                  Use Test Call and Test Email buttons on each campaign card — all in one consistent workflow.
                
              
            

            {/* Campaign cards */}
            {campaignsLoading ? (
              
            ) : filteredCampaigns.length === 0 ? (
              
                
                  
                
                
                  {campaigns.length === 0 ? 'No campaigns yet' : 'No matching campaigns'}
                
                
                  {campaigns.length === 0
                    ? 'Submit a campaign request and our team will configure and launch your AI-powered outreach.'
                    : 'Try adjusting your search or filters to see more results.'}
                
              
            ) : (
              
                {filteredCampaigns.map((campaign) => {
                  const snap = campaignSnapshots[campaign.id];
                  return (
                     openRequestLeadsDialog(campaignId)}
                      onOpenPreviewStudio={(campaignId, mode) => openCampaignPreviewStudio(campaignId, mode || 'voice')}
                      onSelectVoice={(campaignId) => {
                        setClientVoiceCampaignId(campaignId);
                        setShowClientVoiceSelect(true);
                      }}
                      onViewQueue={(campaignId) => {
                        setQueueCampaignId(campaignId);
                        setShowQueueDialog(true);
                      }}
                    />
                  );
                })}
              
            )}

          
        )}
        {/* ==================== REPORTS TAB ==================== */}
        {(activeTab === 'reports' || activeTab === 'analytics-reports') && (
          
            
              
                Reports & Analytics
                Track your campaign performance and ROI
              
              
                
                  
                    
                  
                  
                    Last 7 days
                    Last 30 days
                    Last 90 days
                    Last year
                  
                
                
                  
                  Export Report
                
              
            

            {/* Report Cards */}
            
              
                
                  
                    
                      Total Leads
                      {totalLeadsDelivered.toLocaleString()}
                    
                    
                      
                      +12%
                    
                  
                
              
              
                
                  
                    
                      Verified Rate
                      87.5%
                    
                    
                      
                      +3%
                    
                  
                
              
              
                
                  
                    
                      Cost per Lead
                      {averageCPL > 0 ? `$${averageCPL.toLocaleString()}` : '-'}
                    
                  
                
              
              
                
                  
                    
                      Avg. Delivery Time
                      2.3 days
                    
                    
                      
                      -18%
                    
                  
                
              
            

            {/* Charts */}
            
              
                
                  Monthly Lead Delivery
                
                
                  
                    
                      
                        
                          
                            
                            
                          
                        
                        
                        
                        
                        
                        
                      
                    
                  
                
              

              
                
                  Cost Breakdown
                
                
                  
                    
                      
                         ({ name: t.type, value: t.total })) || [
                            { name: 'Leads', value: 4500 },
                            { name: 'Verification', value: 1200 },
                            { name: 'AI Calls', value: 800 },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {(costSummary?.byType || [{ name: 'Leads' }, { name: 'Verification' }, { name: 'AI Calls' }]).map((_, i) => (
                            
                          ))}
                        
                         formatCurrency(value as number)} />
                        
                      
                    
                  
                
              
            
          
        )}

        {/* ==================== ARGYLE EVENTS TAB ==================== */}
        {activeTab === 'argyle-events' && argyleFeatureStatus?.enabled && (
          
            
          
        )}

        {/* ==================== UKEF CAMPAIGN REPORTS TAB ==================== */}
        {activeTab === 'ukef-reports' && ukefReportsEnabled && (
          
            
          
        )}

        {/* ==================== UKEF TRANSCRIPT QA TAB ==================== */}
        {activeTab === 'ukef-transcript-qa' && ukefTranscriptQaEnabled && (
          
            
          
        )}


        {/* ==================== UNIFIED PIPELINES TAB ==================== */}
        {activeTab === 'unified-pipelines' && user?.clientAccountId && (
          
            
          
        )}

{/* ==================== REPORTING TAB ==================== */}
        {activeTab === 'reporting' && user?.clientAccountId && (
          
            
          
        )}

{/* ==================== BILLING TAB ==================== */}
        {activeTab === 'billing' && (
          
            
              
                Billing & Invoices
                View your invoices and payment history
              
            

            {/* Billing Summary */}
            
              
                
                  Billing Summary
                
                
                  
                    
                      
                      {formatCurrency(totalSpent)}
                      Total Spent
                    
                    
                      
                      {invoices.length}
                      Total Invoices
                    
                    
                      
                      {formatCurrency(unpaidInvoices)}
                      Outstanding Balance
                    
                  
                
              

              
                
                  Payment Methods
                
                
                  
                    
                      
                      
                        Wire Transfer
                        NET 30
                      
                    
                    Default
                  
                  
                    
                    Add Payment Method
                  
                
              
            

            {/* Your Pricing - Quick View */}
            {dashboardPricingData?.hasCustomPricing && (
              
                
                  
                    
                      
                        
                      
                      Your Pricing
                    
                    
                      Custom Plan
                    
                  
                
                
                  
                    {Object.entries(dashboardPricingData.pricing)
                      .filter(([, config]) => config.isEnabled)
                      .sort(([, a], [, b]) => a.pricePerLead - b.pricePerLead)
                      .map(([type, config]) => {
                        let icon = ;
                        let colorClass = "text-slate-600 bg-slate-50 border-slate-200";
                         
                        if (type === 'event_registration_digital_ungated') {
                          icon = ;
                          colorClass = "text-blue-600 bg-blue-50 border-blue-100";
                        } else if (type === 'event_registration_digital_gated') {
                          icon = ;
                          colorClass = "text-violet-600 bg-violet-50 border-violet-100";
                        } else if (type === 'in_person_event') {
                          icon = ;
                          colorClass = "text-amber-600 bg-amber-50 border-amber-100";
                        } else if (type === 'appointment_generation') {
                          icon = ;
                          colorClass = "text-emerald-600 bg-emerald-50 border-emerald-100";
                        }

                        return (
                          
                            
                              
                                {icon}
                              
                              
                                {config.label}
                                Per Lead
                              
                            
                            {formatCurrency(config.pricePerLead)}
                          
                        );
                      })}
                  
                
              
            )}

            {/* Invoices Table */}
            
              
                Invoices
              
              
                {invoices.length === 0 ? (
                  
                    
                    No Invoices Yet
                    Your invoices will appear here once generated
                  
                ) : (
                  
                    
                      
                        
                          Invoice #
                          Period
                          Amount
                          Paid
                          Due Date
                          Status
                          Actions
                        
                      
                      
                        {invoices.map((invoice) => (
                          
                            {invoice.invoiceNumber}
                            
                              {new Date(invoice.billingPeriodStart).toLocaleDateString()} - {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                            
                            {formatCurrency(invoice.totalAmount)}
                            {formatCurrency(invoice.amountPaid)}
                            
                              {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}
                            
                            {getStatusBadge(invoice.status)}
                            
                              
                                
                                  
                                
                                {invoice.pdfUrl && (
                                  
                                    
                                      
                                    
                                  
                                )}
                              
                            
                          
                        ))}
                      
                    
                  
                )}
              
            
          
        )}

        {/* ==================== SUPPORT TAB ==================== */}
        {activeTab === 'support' && (
          
            
              
                Support & Contact
                Get help from our team
              
               setShowSupportDialog(true)}>
                
                New Support Request
              
            

            
              {/* Contact Cards */}
              
                
                  
                    
                  
                  Email Support
                  Get help via email. We typically respond within 2-4 hours.
                  
                    
                      support@pivotal-b2b.com
                    
                  
                
              

              
                
                  
                    
                  
                  Phone Support
                  Speak directly with your account manager during business hours.
                  
                    
                      +1 (555) 123-4567
                    
                  
                
              

              
                
                  
                    
                  
                  Schedule a Call
                  Book a call with your dedicated account manager.
                  
                    Schedule Meeting
                    
                  
                
              
            

            {/* Account Manager */}
            
              
                Your Account Team
                Your dedicated support contacts
              
              
                
                  
                    
                      ZM
                    
                    
                      Zahid Mohammadi
                      CEO
                      
                        
                          
                            
                          
                        
                        
                          
                        
                        
                          
                        
                      
                    
                  
                  
                    
                      TH
                    
                    
                      Tabasum Hamdard
                      Client Success Director
                      
                        
                          
                            
                          
                        
                        
                          
                        
                        
                          
                        
                      
                    
                  
                
              
            

            {/* FAQ */}
            
              
                Frequently Asked Questions
              
              
                {[
                  { q: 'How do I download my delivered leads?', a: 'Go to Leads & Delivery tab, find your completed order, and click the download button.' },
                  { q: 'What is the typical delivery time?', a: 'Most orders are delivered within 2-5 business days depending on volume and campaign complexity.' },
                  { q: 'How are leads verified?', a: 'Our AI-powered verification system validates contact information through multiple data sources and real-time validation.' },
                  { q: 'Can I request a custom campaign?', a: 'Yes! Go to Campaigns tab and click "Request New Campaign" to submit your requirements.' },
                ].map((faq, i) => (
                  
                    
                      
                      
                        {faq.q}
                        {faq.a}
                      
                    
                  
                ))}
              
            
          
        )}

        {/* ==================== WORK ORDERS TAB ==================== */}
        {activeTab === 'work-orders' && (
          
            
              
                Direct Agentic Orders
                Request campaigns to be managed and executed by our team
              
               setLocation('/client-portal/create-campaign')} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                
                Create New Campaign
              
            

            {/* Info Banner */}
            
              
                
                  
                    
                  
                  
                    How Campaign Requests Work
                    
                      Create a new campaign to request that our team runs it on your behalf. Select your program type, set goals and targeting, and our team handles execution from start to finish.
                    
                  
                
              
            

            
              
                
                  
                    
                      Pending Review
                      {workOrders.filter(o => o.status === 'pending').length}
                    
                    
                      
                    
                  
                
              
              
                
                  
                    
                      In Progress
                      {workOrders.filter(o => o.status === 'in_progress').length}
                    
                    
                      
                    
                  
                
              
              
                
                  
                    
                      Completed
                      {workOrders.filter(o => o.status === 'completed').length}
                    
                    
                      
                    
                  
                
              
              
                
                  
                    
                      Total Value
                      ${workOrders.reduce((sum, o) => sum + (o.budgetAmount || 0), 0).toLocaleString()}
                    
                    
                      
                    
                  
                
              
            

            {/* Work Orders Table */}
            
              
                
                  Your Direct Agentic Orders
                  
                    
                    
                      
                        
                      
                      
                        All Status
                        Pending Review
                        Approved
                        In Progress
                        Completed
                      
                    
                  
                
              
              
                
                  
                    
                      
                        Order #
                        Campaign Type
                        Goals
                        Leads Requested
                        Deadline
                        Status
                        Created
                        Actions
                      
                    
                    
                      {workOrders.length === 0 ? (
                        
                          
                            {projectsLoading ? 'Loading orders...' : 'No orders yet. Submit your first Direct Agentic Order to get started.'}
                          
                        
                      ) : workOrders.map((order) => (
                        
                          {order.id}
                          
                            
                              {order.type}
                            
                          
                          {order.goals}
                          {order.leads}
                          {order.deadline}
                          
                            
                              {order.status === 'in_progress' ? 'In Progress' :
                               order.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            
                          
                          {order.created}
                          
                            
                          
                        
                      ))}
                    
                  
                
              
            
          
        )}

        {/* ==================== CRM TAB ==================== */}
        {activeTab === 'accounts' && (() => {
          const accounts = crmAccounts || [];
          const filteredAccounts = accounts.filter((a: any) => {
            if (crmFilterIndustry && a.industry !== crmFilterIndustry) return false;
            if (crmSearchQuery) {
              const q = crmSearchQuery.toLowerCase();
              return [a.name, a.industry, a.website].some(f => f?.toLowerCase()?.includes(q));
            }
            return true;
          });
          const allIndustries = [...new Set(accounts.map((a: any) => a.industry).filter(Boolean))];
          const currentItems = filteredAccounts;

          return (
          
            {/* Header with stats */}
            
              
                
                  Accounts
                
                
                  Accounts assigned to your campaigns and targeting
                
              
              
                 {
                  const items = filteredAccounts;
                  const headers = 'Company Name,Industry,Website';
                  const rows = items.map((i: any) => `${i.name},${i.industry},${i.website}`);
                  const csv = [headers, ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `accounts.csv`; a.click();
                  toast({ title: 'Exported', description: `${items.length} accounts exported to CSV` });
                }}>
                  
                  Export
                
              
            

            {/* Stats row */}
            
              
                Total Accounts
                {crmStatsData?.totalAccounts ?? accounts.length}
              
              
                Total Contacts
                {crmStatsData?.totalContacts ?? 0}
              
              
                Industries
                {allIndustries.length}
              
              
                Campaigns
                {campaigns?.length ?? 0}
              
            

            {/* Filters + View Toggle */}
            
              
                
                  
                   setCrmSearchQuery(e.target.value)} />
                
                {allIndustries.length > 0 && (
                  
                    
                    
                      All Industries
                      {allIndustries.map(ind => {ind as string})}
                    
                  
                )}
              
              
                 setCrmViewMode('table')}>
                  
                
                 setCrmViewMode('card')}>
                  
                
              
            

            {/* Bulk Actions Bar */}
            {crmSelectedItems.length > 0 && (
              
                {crmSelectedItems.length} selected
                 setCrmSelectedItems([])}>Deselect All
                 {
                  if (!window.confirm(`Delete ${crmSelectedItems.length} accounts?`)) return;
                  crmSelectedItems.forEach(id => deleteAccountMutation.mutate(id));
                  setCrmSelectedItems([]);
                }}>
                   Delete
                
              
            )}

            {/* Content - ACCOUNTS */}
            {crmAccountsLoading ? (
              
            ) : filteredAccounts.length === 0 ? (
              
                
                  
                  No Accounts Found
                  Accounts will appear here once they are assigned to your campaigns
                
              
            ) : crmViewMode === 'table' ? (
              
                
                  
                    
                      
                        
                          
                             0} onChange={() => toggleSelectAll(filteredAccounts)} />
                          
                          Company
                          Industry
                          Type
                          Website
                          Contacts
                          Actions
                        
                      
                      
                        {filteredAccounts.map((account: any) => (
                           handleViewCrmDetail(account, 'account')}>
                             e.stopPropagation()}>
                               toggleCrmSelection(account.id)} />
                            
                            
                              
                                {account.name?.[0]}
                                {account.name}
                              
                            
                            {account.industry && {account.industry}}
                            {account.accountType || '-'}
                            {account.website}
                            {account.contactCount || 0}
                             e.stopPropagation()}>
                               handleViewCrmDetail(account, 'account')}>
                               { setEditingAccount(account); setShowAddAccountDialog(true); }}>
                               {
                                if (window.confirm(`Are you sure you want to delete account "${account.name}"?`)) {
                                  deleteAccountMutation.mutate(account.id);
                                }
                              }}>
                            
                          
                        ))}
                      
                    
                  
                
              
            ) : (
              
                {filteredAccounts.map((account: any) => (
                   handleViewCrmDetail(account, 'account')}>
                    
                      
                        
                          {account.name?.[0]}
                          
                            {account.name}
                            {account.industry && {account.industry}}
                          
                        
                         { e.stopPropagation(); toggleCrmSelection(account.id); }} />
                      
                    
                    
                      {account.website && {account.website}}
                      {account.phone && {account.phone}}
                      {account.contactCount || 0} contacts
                    
                  
                ))}
              
            )}
          
          );
        })()}

        {/* ==================== CONTACTS TAB ==================== */}
        {activeTab === 'contacts' && (() => {
          const contacts = crmContacts || [];
          const accounts = crmAccounts || [];
          const filteredContacts = contacts.filter((c: any) => {
            if (crmFilterIndustry && c.industry !== crmFilterIndustry) return false;
            if (crmSearchQuery) {
              const q = crmSearchQuery.toLowerCase();
              return [c.firstName, c.lastName, c.email, c.company, c.title, c.phone].some(f => f?.toLowerCase()?.includes(q));
            }
            return true;
          });
          const allIndustries = [...new Set(contacts.map((c: any) => c.industry).filter(Boolean))];
          const currentItems = filteredContacts;

          return (
          
            {/* Header with stats */}
            
              
                
                  Contacts
                
                
                  Contacts assigned to your campaigns
                
              
              
                 {
                  const items = filteredContacts;
                  const headers = 'First Name,Last Name,Email,Phone,Company,Title';
                  const rows = items.map((i: any) => `${i.firstName},${i.lastName},${i.email},${i.phone},${i.company},${i.title}`);
                  const csv = [headers, ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `contacts.csv`; a.click();
                  toast({ title: 'Exported', description: `${items.length} contacts exported to CSV` });
                }}>
                  
                  Export
                
              
            

            {/* Stats row */}
            
              
                Total Accounts
                {crmStatsData?.totalAccounts ?? 0}
              
              
                Total Contacts
                {crmStatsData?.totalContacts ?? contacts.length}
              
              
                Industries
                {allIndustries.length}
              
              
                Campaigns
                {campaigns?.length ?? 0}
              
            

            {/* Filters + View Toggle */}
            
              
                
                  
                   setCrmSearchQuery(e.target.value)} />
                
                {allIndustries.length > 0 && (
                  
                    
                    
                      All Industries
                      {allIndustries.map(ind => {ind as string})}
                    
                  
                )}
              
              
                 setCrmViewMode('table')}>
                  
                
                 setCrmViewMode('card')}>
                  
                
              
            

            {/* Bulk Actions Bar */}
            {crmSelectedItems.length > 0 && (
              
                {crmSelectedItems.length} selected
                 setCrmSelectedItems([])}>Deselect All
                 {
                  if (!window.confirm(`Delete ${crmSelectedItems.length} contacts?`)) return;
                  crmSelectedItems.forEach(id => deleteContactMutation.mutate(id));
                  setCrmSelectedItems([]);
                }}>
                   Delete
                
              
            )}

            {/* Content - CONTACTS */}
            {crmContactsLoading ? (
              
            ) : filteredContacts.length === 0 ? (
              
                
                  
                  No Contacts Found
                  Contacts will appear here once they are assigned to your campaigns
                
              
            ) : crmViewMode === 'table' ? (
              
                
                  
                    
                      
                        
                          
                             0} onChange={() => toggleSelectAll(filteredContacts)} />
                          
                          Name
                          Email
                          Phone
                          Company
                          Title
                          Actions
                        
                      
                      
                        {filteredContacts.map((contact: any) => (
                           handleViewCrmDetail(contact, 'contact')}>
                             e.stopPropagation()}>
                               toggleCrmSelection(contact.id)} />
                            
                            
                              
                                
                                  {contact.firstName?.[0]}{contact.lastName?.[0]}
                                
                                {contact.firstName} {contact.lastName}
                              
                            
                            {contact.email}
                            {contact.phone}
                            {contact.company}
                            {contact.title}
                             e.stopPropagation()}>
                               handleViewCrmDetail(contact, 'contact')}>
                               { setEditingContact(contact); setShowAddContactDialog(true); }}>
                               {
                                if (window.confirm(`Are you sure you want to delete contact "${contact.firstName} ${contact.lastName}"?`)) {
                                  deleteContactMutation.mutate(contact.id);
                                }
                              }}>
                            
                          
                        ))}
                      
                    
                  
                
              
            ) : (
              
                {filteredContacts.map((contact: any) => (
                   handleViewCrmDetail(contact, 'contact')}>
                    
                      
                        
                          
                            {contact.firstName?.[0]}{contact.lastName?.[0]}
                          
                          
                            {contact.firstName} {contact.lastName}
                            {contact.title && {contact.title}}
                          
                        
                         { e.stopPropagation(); toggleCrmSelection(contact.id); }} />
                      
                    
                    
                      {contact.email && {contact.email}}
                      {contact.phone && {contact.phone}}
                      {contact.company && {contact.company}}
                    
                  
                ))}
              
            )}
          
          );
        })()}

        {/* ==================== INTELLIGENCE TAB ==================== */}
        {activeTab === 'intelligence' && (
          
            
              
                Organization Intelligence
                
                  The foundation layer for all AI behavior - teaching the AI how your organization thinks and operates.
                
              
            

            {/* 3-Pillar Intelligence Visualization (Argyle only) */}
            {isArgyleClient && (
              
            )}

            
              
                
                Organization Intelligence Hub
                
                  Analyze your organization's profile, ICP, messaging, and competitive positioning with advanced multi-model AI research.
                
                 setLocation('/client-portal/intelligence')}
                >
                  
                  Open Intelligence Hub
                
              
            
          
        )}

        {/* ==================== BOOKINGS TAB ==================== */}
        {activeTab === 'bookings' && (
          
            {/* Header */}
            
              
                
                  
                  Bookings
                
                Manage meetings, booking types, and availability
              
              
                 refetchBookings()}>
                  
                  Refresh
                
                 setShowCreateBookingType(true)}>
                  
                  New Booking Type
                
              
            

            {/* Stats Row */}
            
              
                
                  
                    
                      Active Booking Types
                      {(clientBookingTypes || []).filter((t: any) => t.isActive).length}
                    
                    
                      
                    
                  
                
              
              
                
                  
                    
                      Upcoming
                      {clientBookings.filter((b: any) => new Date(b.startTime) >= new Date() && b.status === 'confirmed').length}
                    
                    
                      
                    
                  
                
              
              
                
                  
                    
                      Total Bookings
                      {clientBookings.length}
                    
                    
                      
                    
                  
                
              
            

            {/* Booking Types Cards */}
            
              Your Booking Types
              
                {(clientBookingTypes || []).filter((t: any) => t.isActive).map((type: any) => (
                  
                    
                    
                      
                        {type.name}
                        {type.duration}m
                      
                      {type.description && (
                        {type.description}
                      )}
                    
                    
                      
                        
                        /{type.slug}
                      
                      
                         {
                            const url = `${window.location.origin}/book/${user?.email?.split('@')[0] || 'user'}/${type.slug}`;
                            navigator.clipboard.writeText(url);
                            toast({ title: 'Link copied!', description: 'Booking link copied to clipboard' });
                          }}
                        >
                          
                          Copy Link
                        
                         {
                            try {
                              const res = await fetch(`/api/client-portal/bookings/types/${type.id}`, {
                                method: 'DELETE',
                                headers: { Authorization: `Bearer ${getToken()}` },
                              });
                              if (res.ok) {
                                toast({ title: 'Booking type deleted' });
                                refetchBookingTypes();
                              }
                            } catch {
                              toast({ title: 'Failed to delete', variant: 'destructive' });
                            }
                          }}
                        >
                          
                        
                      
                    
                  
                ))}
                {/* Add New Card */}
                 setShowCreateBookingType(true)}
                >
                  
                    
                      
                    
                    Create Booking Type
                    Set up a new meeting type
                  
                
              
            

            {/* Bookings List */}
            
              
                
                  
                    Scheduled Meetings
                    {clientBookings.length} booking{clientBookings.length !== 1 ? 's' : ''}
                  
                  
                    {(['upcoming', 'past', 'all'] as const).map((f) => (
                       setBookingsFilter(f)}
                      >
                        {f}
                      
                    ))}
                  
                
              
              
                {bookingsLoading ? (
                  
                    
                  
                ) : clientBookings.length === 0 ? (
                  
                    
                    No {bookingsFilter !== 'all' ? bookingsFilter : ''} bookings
                    Bookings will appear here when meetings are scheduled
                  
                ) : (
                  
                    {clientBookings.map((booking: any) => {
                      const startDate = new Date(booking.startTime);
                      const endDate = new Date(booking.endTime);
                      const isPast = startDate 
                          {/* Date badge */}
                          
                            
                              {startDate.toLocaleDateString('en-US', { month: 'short' })}
                            
                            
                              {startDate.getDate()}
                            
                            
                              {startDate.toLocaleDateString('en-US', { weekday: 'short' })}
                            
                          

                          {/* Info */}
                          
                            
                              {booking.guestName}
                              
                                {isConfirmed && }
                                {booking.status}
                              
                            
                            
                              
                                
                                {booking.guestEmail}
                              
                              
                                
                                {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              
                              {booking.bookingTypeName && (
                                {booking.bookingTypeName}
                              )}
                            
                            {booking.guestNotes && (
                              "{booking.guestNotes}"
                            )}
                          

                          {/* Actions */}
                          
                            {booking.meetingUrl && (
                              
                                
                                  
                                  Join
                                
                              
                            )}
                            {!isPast && isConfirmed && (
                               {
                                  try {
                                    const res = await fetch(`/api/client-portal/bookings/${booking.id}/cancel`, {
                                      method: 'PUT',
                                      ...authHeaders,
                                    });
                                    if (res.ok) {
                                      toast({ title: 'Booking cancelled' });
                                      refetchBookings();
                                    }
                                  } catch {
                                    toast({ title: 'Failed to cancel', variant: 'destructive' });
                                  }
                                }}
                              >
                                
                                Cancel
                              
                            )}
                          
                        
                      );
                    })}
                  
                )}
              
            

            {/* Create Booking Type Dialog */}
            
              
                
                  
                    
                    Create Booking Type
                  
                  Set up a new meeting type for people to book with you
                
                
                  
                    Meeting Name *
                     {
                        const name = e.target.value;
                        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                        setNewBookingType(prev => ({ ...prev, name, slug }));
                      }}
                    />
                  
                  
                    URL Slug
                    
                      /book/.../
                       setNewBookingType(prev => ({ ...prev, slug: e.target.value }))}
                        className="font-mono text-sm"
                      />
                    
                  
                  
                    
                      Duration (minutes)
                       setNewBookingType(prev => ({ ...prev, duration: parseInt(v) }))}
                      >
                        
                          
                        
                        
                          15 minutes
                          30 minutes
                          45 minutes
                          60 minutes
                          90 minutes
                        
                      
                    
                    
                      Color
                      
                         setNewBookingType(prev => ({ ...prev, color: e.target.value }))}
                          className="h-9 w-12 rounded border cursor-pointer"
                        />
                         setNewBookingType(prev => ({ ...prev, color: e.target.value }))}
                          className="font-mono text-sm flex-1"
                          placeholder="#3b82f6"
                        />
                      
                    
                  
                  
                    Description
                     setNewBookingType(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  
                
                
                   setShowCreateBookingType(false)}>Cancel
                   createBookingTypeMutation.mutate(newBookingType)}
                    disabled={!newBookingType.name || !newBookingType.slug || createBookingTypeMutation.isPending}
                  >
                    {createBookingTypeMutation.isPending && }
                    Create Booking Type
                  
                
              
            
          
        )}

        {/* ==================== SERVICE CATALOG TAB ==================== */}
        {activeTab === 'service-catalog' && (
          
            
              
                
                Service Catalog
              
              Define and manage your service offerings
            
            
          
        )}

        {/* ==================== PROBLEM FRAMEWORK TAB ==================== */}
        {activeTab === 'problem-framework' && (
          
            
              
                
                Problem Framework
              
              Map problems your services solve to drive intelligent outreach
            
            
          
        )}

        {/* ==================== ICP & POSITIONING TAB ==================== */}
        {activeTab === 'icp-positioning' && (
          
            
              
                
                ICP & Positioning
              
              Define your ideal customer profile and competitive positioning
            
            
          
        )}

        {/* ==================== MESSAGING & PROOF TAB ==================== */}
        {activeTab === 'messaging-proof' && (
          
            
              
                
                Messaging & Proof
              
              Craft messaging frameworks and proof points for your outreach
            
            
          
        )}

        {/* ==================== SETTINGS TAB ==================== */}
        {activeTab === 'settings' && (
          
            
              
                
                Settings
              
              Manage your business profile, branding, and preferences
            

            
              
                Business Profile
                Branding
                Compliance
                Integrations
              

              
                
                  
                    
                      
                      Business Information
                    
                    
                      This information is used for compliance and appears in email footers
                    
                  
                  
                    
                      
                        Legal Business Name *
                         setBusinessProfile((prev: any) => ({ ...prev, legalBusinessName: e.target.value }))}
                        />
                      
                      
                        DBA / Trade Name
                         setBusinessProfile((prev: any) => ({ ...prev, dbaName: e.target.value }))}
                        />
                      
                    

                    

                    
                      
                        Website
                        
                          
                           setBusinessProfile((prev: any) => ({ ...prev, website: e.target.value }))}
                            className="pl-10"
                          />
                        
                      
                      
                        Phone
                        
                          
                           setBusinessProfile((prev: any) => ({ ...prev, phone: e.target.value }))}
                            className="pl-10"
                          />
                        
                      
                    

                    
                      Support Email
                      
                        
                         setBusinessProfile((prev: any) => ({ ...prev, supportEmail: e.target.value }))}
                          className="pl-10"
                        />
                      
                    

                    

                    
                      Street Address *
                       setBusinessProfile((prev: any) => ({ ...prev, streetAddress: e.target.value, addressLine1: e.target.value }))}
                      />
                    

                    
                      
                        City *
                         setBusinessProfile((prev: any) => ({ ...prev, city: e.target.value }))}
                        />
                      
                      
                        State / Province *
                         setBusinessProfile((prev: any) => ({ ...prev, state: e.target.value }))}
                        />
                      
                      
                        Postal Code *
                         setBusinessProfile((prev: any) => ({ ...prev, postalCode: e.target.value }))}
                        />
                      
                    

                    
                      Country *
                       setBusinessProfile((prev: any) => ({ ...prev, country: value }))}
                      >
                        
                          
                        
                        
                          United States
                          Canada
                          United Kingdom
                          Australia
                        
                      
                    

                    
                      {saveBusinessProfileMutation.isPending && }
                      Save Business Profile
                    
                  
                
              

              
                {/* Brand Identity — Logo + Color Extraction */}
                
                  
                    
                      
                      Brand Identity
                    
                    
                      Visual identity and brand colors
                    
                  
                  
                    {/* Logo Section */}
                    
                      Brand Logo
                      
                        
                          
                            {businessProfile?.logoUrl ? (
                              
                            ) : (
                              
                                
                                No logo
                              
                            )}
                          
                        
                        
                          
                            Logo URL
                             {
                                setBusinessProfile((prev: any) => ({ ...prev, logoUrl: e.target.value }));
                                setExtractedColors([]);
                              }}
                            />
                            
                              Paste a URL to your company logo (PNG, SVG, or JPG recommended). Square or horizontal logos work best.
                            
                          
                          
                            {businessProfile?.logoUrl && (
                              <>
                                
                                  {isExtractingColors ? (
                                    
                                  ) : (
                                    
                                  )}
                                  Extract Brand Colors
                                
                                 {
                                    setBusinessProfile((prev: any) => ({ ...prev, logoUrl: '' }));
                                    setExtractedColors([]);
                                  }}
                                >
                                  
                                  Remove Logo
                                
                              
                            )}
                          
                        
                      
                    

                    {/* Extracted Colors from Logo */}
                    {extractedColors.length > 0 && (
                      
                        Colors Extracted from Logo
                        
                          
                            {extractedColors.map((color, idx) => (
                               setBusinessProfile((prev: any) => ({ ...prev, brandColor: color.hex }))}
                                title={`${color.hex} (${color.percentage}%)`}
                              >
                                {idx === 0 && (
                                  
                                    
                                  
                                )}
                              
                            ))}
                          
                          
                            Click any color to set it as your brand color. The dominant color has been auto-selected.
                          
                        
                      
                    )}

                    

                    {/* Brand Color Picker */}
                    
                      Brand Color
                      
                        Your primary brand color used throughout emails, buttons, and accents
                      
                      
                         setBusinessProfile((prev: any) => ({ ...prev, brandColor: e.target.value }))}
                          className="h-12 w-16 rounded-lg border cursor-pointer"
                        />
                        
                          Hex Color Code
                           setBusinessProfile((prev: any) => ({ ...prev, brandColor: e.target.value }))}
                            placeholder="#3B82F6"
                            className="font-mono max-w-[200px]"
                          />
                        
                      

                      {/* Quick Presets */}
                      
                        Quick Presets
                        
                          {[
                            { color: '#3B82F6', name: 'Blue' },
                            { color: '#8B5CF6', name: 'Purple' },
                            { color: '#EC4899', name: 'Pink' },
                            { color: '#EF4444', name: 'Red' },
                            { color: '#F97316', name: 'Orange' },
                            { color: '#EAB308', name: 'Yellow' },
                            { color: '#22C55E', name: 'Green' },
                            { color: '#14B8A6', name: 'Teal' },
                            { color: '#06B6D4', name: 'Cyan' },
                            { color: '#6366F1', name: 'Indigo' },
                            { color: '#1E293B', name: 'Dark' },
                            { color: '#64748B', name: 'Slate' },
                          ].map((preset) => (
                             setBusinessProfile((prev: any) => ({ ...prev, brandColor: preset.color }))}
                              title={preset.name}
                            />
                          ))}
                        
                      
                    

                    

                    {/* Brand Preview */}
                    
                      Preview
                      
                        
                          {businessProfile?.logoUrl ? (
                            
                          ) : (
                            
                              
                                {(businessProfile?.legalBusinessName || 'Co')[0]?.toUpperCase()}
                              
                            
                          )}
                          {businessProfile?.dbaName || businessProfile?.legalBusinessName || 'Your Company'}
                        
                        
                          
                            Primary Button
                          
                          
                            Outline Button
                          
                        
                        
                      
                    

                    
                      {saveBusinessProfileMutation.isPending && }
                      Save Brand Settings
                    
                  
                
              

              
                
                  
                    
                      
                      Compliance Settings
                    
                    
                      Configure email unsubscribe and compliance settings
                    
                  
                  
                    
                      Custom Unsubscribe URL
                       setBusinessProfile((prev: any) => ({ ...prev, customUnsubscribeUrl: e.target.value }))}
                      />
                      
                        If set, this URL will be used in email footers instead of the default unsubscribe link
                      
                    

                    
                      Email Footer Preview
                      
                        {businessProfile?.legalBusinessName || 'Your Company Name'}
                        {businessProfile?.streetAddress || businessProfile?.addressLine1 || '123 Business St'}
                        
                          {businessProfile?.city || 'City'}, {businessProfile?.state || 'ST'} {businessProfile?.postalCode || '00000'}
                        
                        
                          {businessProfile?.customUnsubscribeUrl ? 'Unsubscribe' : 'Unsubscribe from this list'}
                        
                      
                    

                    
                      {saveBusinessProfileMutation.isPending && }
                      Save Compliance Settings
                    
                  
                
              

              
                
                  
                    
                      
                      Integrations
                    
                    
                      Connect third-party services
                    
                  
                  
                    
                      
                      No integrations available yet.
                      Contact your account manager for custom integrations.
                    
                  
                
              
            
          
        )}
      {/* ==================== DIALOGS ==================== */}

      {/* Add Contact Dialog */}
       { 
        setShowAddContactDialog(open); 
        if (!open) { 
          setEditingContact(null); 
          setNewContact({ 
            firstName: '', lastName: '', email: '', phone: '', mobile: '',
            company: '', title: '', department: '', linkedinUrl: '', 
            crmAccountId: '', status: 'active', emailOptOut: false, phoneOptOut: false 
          }); 
        } 
      }}>
        
          
            {editingContact ? 'Edit Contact' : 'Add New Contact'}
            Fill in the contact details below
          
          
            First Name * editingContact ? setEditingContact({ ...editingContact, firstName: e.target.value }) : setNewContact(p => ({ ...p, firstName: e.target.value }))} />
            Last Name * editingContact ? setEditingContact({ ...editingContact, lastName: e.target.value }) : setNewContact(p => ({ ...p, lastName: e.target.value }))} />
            
            Email editingContact ? setEditingContact({ ...editingContact, email: e.target.value }) : setNewContact(p => ({ ...p, email: e.target.value }))} />
            Title editingContact ? setEditingContact({ ...editingContact, title: e.target.value }) : setNewContact(p => ({ ...p, title: e.target.value }))} />
            
            Phone editingContact ? setEditingContact({ ...editingContact, phone: e.target.value }) : setNewContact(p => ({ ...p, phone: e.target.value }))} />
            Mobile editingContact ? setEditingContact({ ...editingContact, mobile: e.target.value }) : setNewContact(p => ({ ...p, mobile: e.target.value }))} />
            
            Department editingContact ? setEditingContact({ ...editingContact, department: e.target.value }) : setNewContact(p => ({ ...p, department: e.target.value }))} />
            Status
               editingContact ? setEditingContact({ ...editingContact, status: v }) : setNewContact(p => ({ ...p, status: v }))}>
                
                
                  Active
                  Inactive
                  Lead
                
              
            

            LinkedIn URL editingContact ? setEditingContact({ ...editingContact, linkedinUrl: e.target.value }) : setNewContact(p => ({ ...p, linkedinUrl: e.target.value }))} />
            
            
              Linked Account
               editingContact ? setEditingContact({ ...editingContact, crmAccountId: v }) : setNewContact(p => ({ ...p, crmAccountId: v }))}>
                
                
                  No Account
                  {crmAccounts.map((acc: any) => (
                    {acc.name || acc.companyName}
                  ))}
                
              
            

            
                editingContact ? setEditingContact({ ...editingContact, emailOptOut: e.target.checked }) : setNewContact(p => ({ ...p, emailOptOut: e.target.checked }))} 
               />
               Opt-out of Emails
            
            
                editingContact ? setEditingContact({ ...editingContact, phoneOptOut: e.target.checked }) : setNewContact(p => ({ ...p, phoneOptOut: e.target.checked }))}
               />
               Opt-out of Calls
            
          
          
             { setShowAddContactDialog(false); setEditingContact(null); }}>Cancel
             addContactMutation.mutate(editingContact || newContact)} disabled={addContactMutation.isPending}>
              {addContactMutation.isPending && }
              {editingContact ? 'Save Changes' : 'Add Contact'}
            
          
        
      

      {/* Add Account Dialog */}
       { 
        setShowAddAccountDialog(open); 
        if (!open) { 
          setEditingAccount(null); 
          setNewAccount({ 
            name: '', industry: '', website: '', phone: '', 
            city: '', state: '', country: '', 
            employees: '', annualRevenue: '', accountType: '', description: '' 
          }); 
        } 
      }}>
        
          
            {editingAccount ? 'Edit Account' : 'Add New Account'}
            Fill in the company details below
          
          
            Company Name * editingAccount ? setEditingAccount({ ...editingAccount, name: e.target.value }) : setNewAccount(p => ({ ...p, name: e.target.value }))} />
            
            
              Industry editingAccount ? setEditingAccount({ ...editingAccount, industry: e.target.value }) : setNewAccount(p => ({ ...p, industry: e.target.value }))} />
              Account Type
                  editingAccount ? setEditingAccount({ ...editingAccount, accountType: v }) : setNewAccount(p => ({ ...p, accountType: v }))}>
                  
                  
                    Prospect
                    Customer
                    Partner
                    Vendor
                  
                
              
            

            
               Employees editingAccount ? setEditingAccount({ ...editingAccount, employees: e.target.value }) : setNewAccount(p => ({ ...p, employees: e.target.value }))} placeholder="e.g. 100-500" />
               Annual Revenue editingAccount ? setEditingAccount({ ...editingAccount, annualRevenue: e.target.value }) : setNewAccount(p => ({ ...p, annualRevenue: e.target.value }))} placeholder="e.g. $1M - $5M" />
            

            
              Website editingAccount ? setEditingAccount({ ...editingAccount, website: e.target.value }) : setNewAccount(p => ({ ...p, website: e.target.value }))} />
              Phone editingAccount ? setEditingAccount({ ...editingAccount, phone: e.target.value }) : setNewAccount(p => ({ ...p, phone: e.target.value }))} />
            

            
              City editingAccount ? setEditingAccount({ ...editingAccount, city: e.target.value }) : setNewAccount(p => ({ ...p, city: e.target.value }))} />
              State editingAccount ? setEditingAccount({ ...editingAccount, state: e.target.value }) : setNewAccount(p => ({ ...p, state: e.target.value }))} />
              Country editingAccount ? setEditingAccount({ ...editingAccount, country: e.target.value }) : setNewAccount(p => ({ ...p, country: e.target.value }))} />
            
          
          
             { setShowAddAccountDialog(false); setEditingAccount(null); }}>Cancel
             addAccountMutation.mutate(editingAccount || newAccount)} disabled={addAccountMutation.isPending}>
              {addAccountMutation.isPending && }
              {editingAccount ? 'Save Changes' : 'Add Account'}
            
          
        
      

      {/* Bulk Import Dialog */}
      
        
          
            Import CSV
            Upload a CSV file to bulk import {bulkUploadType}
          
          
            
               setBulkUploadType('contacts')}>Contacts
               setBulkUploadType('accounts')}>Accounts
            
            
              
              Choose a CSV file to upload
               setBulkUploadFile(e.target.files?.[0] || null)} />
            
            {bulkUploadFile && Selected: {bulkUploadFile.name}}
            
              Expected columns:
              {bulkUploadType === 'contacts' ? 'firstName, lastName, email, phone, company, title' : 'companyName, industry, website, phone'}
            
          
          
             setShowBulkUploadDialog(false)}>Cancel
            
              {bulkImportMutation.isPending && }
              Import
            
          
        
      

      {/* CRM Detail View Dialog */}
      
        
          
            
              {crmDetailType === 'contact' ? (
                {crmDetailItem?.firstName?.[0]}{crmDetailItem?.lastName?.[0]}
              ) : (
                {crmDetailItem?.name?.[0]}
              )}
              
                {crmDetailType === 'contact' ? `${crmDetailItem?.firstName} ${crmDetailItem?.lastName}` : crmDetailItem?.name}
                {crmDetailType === 'contact' && crmDetailItem?.title && {crmDetailItem.title} {crmDetailItem.department ? `• ${crmDetailItem.department}` : ''}}
                {crmDetailType === 'account' && crmDetailItem?.industry && {crmDetailItem.industry}}
              
            
          
          {crmDetailItem && (
            
              
                {crmDetailType === 'contact' ? (
                  <>
                    Email{crmDetailItem.email || '—'}
                    Phone{crmDetailItem.phone || '—'}
                    Mobile{crmDetailItem.mobile || '—'}
                    Company{crmDetailItem.company || '—'}
                    
                    Status{crmDetailItem.status}
                    
                    {crmDetailItem.linkedinUrl && LinkedIn{crmDetailItem.linkedinUrl}}
                    
                    {(crmDetailItem.emailOptOut || crmDetailItem.phoneOptOut) && (
                      
                        {crmDetailItem.emailOptOut && Email Opt-out}
                        {crmDetailItem.phoneOptOut && Phone Opt-out}
                      
                    )}
                  
                ) : (
                  <>
                    Website{crmDetailItem.website ? {crmDetailItem.website} : '—'}
                    Type{crmDetailItem.accountType || '—'}
                    
                    Employees{crmDetailItem.employees || '—'}
                    Revenue{crmDetailItem.annualRevenue || '—'}
                    
                    Phone{crmDetailItem.phone || '—'}
                    Contacts{crmDetailItem.contactCount || 0}
                    
                    {(crmDetailItem.city || crmDetailItem.state || crmDetailItem.country) && (
                      Location{[crmDetailItem.city, crmDetailItem.state, crmDetailItem.country].filter(Boolean).join(', ')}
                    )}
                    
                    {crmDetailItem.description && Description{crmDetailItem.description}}
                  
                )}
              
              {crmDetailItem.createdAt && (
                
                  Added {new Date(crmDetailItem.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                
              )}
            
          )}
        
      

      {/* Campaign creation dialog is handled by showCreateDialog */}

      {/* Request Additional Leads Dialog */}
      

      {/* Create Project / Campaign Request Dialog */}
      
        
          
            Create New Campaign Request
            
              Set up a new campaign request. You can attach assets and specify budget.
            
          
          
            
              Campaign Name *
               setNewProject(prev => ({ ...prev, name: e.target.value }))}
              />
            
            
            
              Description (Target Audience, Goals)
               setNewProject(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            

            
              Project Type
              
                  setNewProject(prev => ({ ...prev, projectType: value }))
                }
              >
                
                  
                
                
                  Call Campaign
                  Email Campaign
                  Data Enrichment
                  Verification
                  Combined (Multi-channel)
                  Custom
                
              
            

            
              
                Number of Leads Needed
                
                  
                   setNewProject(prev => ({ ...prev, requestedLeads: e.target.value }))}
                  />
                
              
              
                Landing Page URL
                
                   
                    setNewProject(prev => ({ ...prev, landingPageUrl: e.target.value }))}
                   />
                
              
            

            
              Project Files (Assets/list/Briefs)
               
                  
                    {isUploading ?  : }
                    {isUploading ? 'Uploading...' : 'Upload File'}
                    
                  
                  {newProject.fileName && (
                    
                      
                        
                        {newProject.fileName}
                      
                       setNewProject(prev => ({ ...prev, projectFileUrl: '', fileName: '' }))}
                      >
                        
                      
                    
                  )}
               
               Upload any relevant documents (PDF, Excel, Images).
            

          
          
             setShowCreateDialog(false)}>Cancel
            
              {createProjectMutation.isPending && }
              Submit Request
            
          
        
      


      {/* Self-Service Campaign Creator Wizard */}
       { setShowCampaignCreator(open); if (!open) setCampaignCreatorStep(1); }}>
        
          
            
              
                
              
              
                Create New Campaign
                
                  Step {campaignCreatorStep} of 4 — {campaignCreatorStep === 1 ? 'Campaign Basics' : campaignCreatorStep === 2 ? 'Talking Points & Context' : campaignCreatorStep === 3 ? 'AI Configuration' : 'Audience Selection'}
                
              
            
          

          {/* Progress Indicator */}
          
            {[1, 2, 3, 4].map((step) => (
              
                = step 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                }`}>
                  {campaignCreatorStep > step ?  : step}
                
                {step  step ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              
            ))}
          

          
            {/* Step 1: Campaign Basics */}
            {campaignCreatorStep === 1 && (
              <>
                
                  Campaign Name *
                   setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  />
                

                
                  Campaign Objectives *
                   setNewCampaign(prev => ({ ...prev, objectives: e.target.value }))}
                    rows={3}
                  />
                

                
                  Success Criteria
                   setNewCampaign(prev => ({ ...prev, successCriteria: e.target.value }))}
                    rows={2}
                  />
                
              
            )}

            {/* Step 2: Talking Points & Context */}
            {campaignCreatorStep === 2 && (
              <>
                
                  Talking Points *
                   setNewCampaign(prev => ({ ...prev, talkingPoints: e.target.value }))}
                    rows={5}
                  />
                  Include key messages, value propositions, and objection handling points.
                

                
                  Campaign Context
                   setNewCampaign(prev => ({ ...prev, context: e.target.value }))}
                    rows={4}
                  />
                  Provide background information to help the AI understand your offering.
                
              
            )}

            {/* Step 3: AI Configuration */}
            {campaignCreatorStep === 3 && (
              <>
                
                  Select AI Agent
                  
                    {[
                      { id: 'professional', name: 'Professional Agent', desc: 'Formal, business-focused communication', icon: Briefcase },
                      { id: 'friendly', name: 'Friendly Agent', desc: 'Warm, conversational approach', icon: Smile },
                      { id: 'technical', name: 'Technical Expert', desc: 'Detailed, solution-oriented', icon: Cpu },
                      { id: 'executive', name: 'Executive Outreach', desc: 'C-suite focused messaging', icon: Crown },
                    ].map((agent) => (
                       setNewCampaign(prev => ({ ...prev, selectedAgentId: agent.id }))}
                      >
                        
                          
                            
                          
                          
                            {agent.name}
                            {agent.desc}
                          
                        
                      
                    ))}
                  
                

                

                
                  Select AI Voice
                  
                    {[
                      { id: 'sarah', name: 'Sarah', gender: 'Female', accent: 'American' },
                      { id: 'james', name: 'James', gender: 'Male', accent: 'American' },
                      { id: 'emma', name: 'Emma', gender: 'Female', accent: 'British' },
                      { id: 'michael', name: 'Michael', gender: 'Male', accent: 'British' },
                      { id: 'sofia', name: 'Sofia', gender: 'Female', accent: 'Neutral' },
                      { id: 'david', name: 'David', gender: 'Male', accent: 'Neutral' },
                    ].map((voice) => (
                       setNewCampaign(prev => ({ ...prev, selectedVoiceId: voice.id }))}
                      >
                        
                          
                            
                          
                          {voice.name}
                          {voice.gender} • {voice.accent}
                        
                      
                    ))}
                  
                  
                    
                    Preview Selected Voice
                  
                
              
            )}

            {/* Step 4: Audience Selection */}
            {campaignCreatorStep === 4 && (
              <>
                
                  Audience Source
                  
                     setNewCampaign(prev => ({ ...prev, audienceType: 'own' }))}
                    >
                      
                        
                          
                            
                          
                          
                            My CRM Contacts
                            Use accounts & contacts from your CRM
                          
                        
                        {newCampaign.audienceType === 'own' && (
                          
                            Select from your accounts and contacts in the CRM tab.
                            0 contacts selected
                          
                        )}
                      
                    

                     setNewCampaign(prev => ({ ...prev, audienceType: 'managed' }))}
                    >
                      
                        
                          
                            
                          
                          
                            Managed Audience
                            Request our team to source leads
                          
                        
                      
                    
                  
                

                {newCampaign.audienceType === 'managed' && (
                  
                    Describe Your Target Audience
                     setNewCampaign(prev => ({ ...prev, managedAudienceRequest: e.target.value }))}
                      rows={5}
                    />
                    Our team will source leads matching your criteria.
                  
                )}

                {newCampaign.audienceType === 'own' && (
                  
                    
                      
                      
                        Select contacts from your CRM to include in this campaign
                      
                       { setActiveTab('crm'); setShowCampaignCreator(false); }}>
                        Go to CRM to Select Contacts
                      
                    
                  
                )}
              
            )}
          

          
            
              {campaignCreatorStep > 1 && (
                 setCampaignCreatorStep(prev => prev - 1)}>
                  
                  Previous
                
              )}
            
            
               { setShowCampaignCreator(false); setCampaignCreatorStep(1); }}>Cancel
              {campaignCreatorStep  setCampaignCreatorStep(prev => prev + 1)}
                  disabled={
                    (campaignCreatorStep === 1 && (!newCampaign.name || !newCampaign.objectives)) ||
                    (campaignCreatorStep === 2 && !newCampaign.talkingPoints)
                  }
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  Next Step
                  
                
              ) : (
                 {
                    toast({ title: 'Campaign Created!', description: 'Your campaign has been created and is ready for launch.' });
                    setShowCampaignCreator(false);
                    setCampaignCreatorStep(1);
                    setNewCampaign({
                      name: '',
                      objectives: '',
                      successCriteria: '',
                      talkingPoints: '',
                      context: '',
                      selectedAgentId: '',
                      selectedVoiceId: '',
                      audienceType: 'own',
                      selectedAccountIds: [],
                      selectedContactIds: [],
                      managedAudienceRequest: '',
                    });
                  }}
                  disabled={newCampaign.audienceType === 'managed' && !newCampaign.managedAudienceRequest}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  
                  Create Campaign
                
              )}
            
          
        
      

      {/* Support Dialog */}
      
        
          
            New Support Request
            
              Describe your issue and we'll get back to you as soon as possible
            
          
          
            
              Subject
              
            
            
              Category
              
                
                  
                
                
                  Billing & Payments
                  Lead Delivery
                  Data Quality
                  Technical Issue
                  Other
                
              
            
            
              Description
              
            
          
          
             setShowSupportDialog(false)}>Cancel
             {
              toast({ title: 'Support request submitted! We\'ll respond within 24 hours.' });
              setShowSupportDialog(false);
            }}>
              
              Submit Request
            
          
        
      

      {/* Lead Detail Drawer */}
      
        
          
            Lead Details
            
              Comprehensive information for this delivered lead
            
          
          {selectedLead && (
            
              {/* Contact Information */}
              
                Contact Information
                
                  
                    Full Name
                    {selectedLead.firstName} {selectedLead.lastName}
                  
                  
                    Title
                    {selectedLead.title || 'N/A'}
                  
                  
                    Company
                    {selectedLead.company || 'N/A'}
                  
                  
                    Email
                    {selectedLead.email}
                  
                  
                    Phone
                    {selectedLead.phone || 'N/A'}
                  
                  
                    LinkedIn
                    {selectedLead.linkedin ? (
                      
                        View Profile
                      
                    ) : (
                      N/A
                    )}
                  
                
              

              

              {/* Campaign Information */}
              
                Campaign & Delivery
                
                  
                    Campaign Name
                    {selectedLead.campaignName || 'N/A'}
                  
                  
                    Order Date
                    {new Date(selectedLead.orderDate).toLocaleDateString()}
                  
                  
                    Contact Status
                    Approved
                  
                  
                    Verification
                    
                      
                      Verified
                    
                  
                
              

              

              {/* Additional Notes */}
              {selectedLead.notes && (
                <>
                  
                    Notes
                    {selectedLead.notes}
                  
                  
                
              )}

              {/* Actions */}
              
                
                  
                  Send Email
                
                
                  
                  Call Contact
                
                
                  
                  Open in CRM
                
              
            
          )}
          
             setShowLeadDrawer(false)}>Close
          
        
      

      {/* AI Reports Panel */}
      

      {/* Email Template Builder - Same structure as main email campaigns */}
      

      {/* AgentX is now universal - provided by AgentSidePanel in ClientPortalLayout */}

      {/* ==================== VOICE SELECTION DIALOG ==================== */}
      
        
          
            
              
              Select Voice
            
            
              Choose a voice for your AI agent on campaign: {campaigns.find(c => c.id === clientVoiceCampaignId)?.name || ''}
            
          
          
            {/* Provider Selection - Hidden (Defaulting to Live Voice / Google) */}
           {/* 
            
              Voice Provider
              
                
                  
                
                
                  Live Voice (Recommended)
                  OpenAI Realtime
                
              
            
           */}

            {/* Voice Grid */}
            
              Select Voice
              
                {(clientSelectedProvider === 'google' 
                  ? (voiceOptions.length > 0 ? voiceOptions.map(v => ({ value: v.id, label: v.name, desc: v.description })) : [
                  { value: 'Kore', label: 'Kore', desc: 'Firm & Professional (Default)' },
                  { value: 'Fenrir', label: 'Fenrir', desc: 'Excitable & Persuasive' },
                  { value: 'Charon', label: 'Charon', desc: 'Informative & Authoritative' },
                  { value: 'Aoede', label: 'Aoede', desc: 'Breezy & Friendly' },
                ]) 
                  : [
                  { value: 'alloy', label: 'Alloy', desc: 'Neutral & Balanced' },
                  { value: 'echo', label: 'Echo', desc: 'Warm & Engaging' },
                  { value: 'fable', label: 'Fable', desc: 'Expressive & Dynamic' },
                  { value: 'onyx', label: 'Onyx', desc: 'Deep & Authoritative' },
                  { value: 'nova', label: 'Nova', desc: 'Friendly & Upbeat' },
                  { value: 'shimmer', label: 'Shimmer', desc: 'Clear & Professional' },
                ]).map((voice) => (
                   setClientSelectedVoice(voice.value)}
                  >
                    
                      
                        
                      
                      
                        {voice.label}
                        {voice.desc}
                      
                      {clientSelectedVoice === voice.value && (
                        
                      )}
                    
                  
                ))}
              
            

            {/* Voice Preview */}
            {clientSelectedVoice && (
              
                 {
                    try {
                      const response = await apiRequest('POST', `/api/client-portal/campaigns/voice-preview`, {
                        voiceId: clientSelectedVoice,
                        provider: clientSelectedProvider,
                        text: 'Hello! This is a preview of the voice you selected. I will be making professional B2B outreach calls.',
                      });
                      const audioBlob = await response.blob();
                      const audioUrl = URL.createObjectURL(audioBlob);
                      const audio = new Audio(audioUrl);
                      audio.play();
                      audio.onended = () => URL.revokeObjectURL(audioUrl);
                    } catch (error) {
                      toast({
                        title: 'Preview failed',
                        description: error instanceof Error ? error.message : 'Could not play voice preview',
                        variant: 'destructive'
                      });
                    }
                  }}
                >
                  
                  Preview Voice
                
                
                  Listen to {clientSelectedVoice} before applying
                
              
            )}

            {/* Recommendation */}
            
              💡 Voice Recommendation
              
                Kore (default) — Soft, friendly, professional. Ideal for B2B sales calls.
                Charon — Calm, authoritative. Good for executive outreach.
                Aoede — Bright, energetic. Suitable for high-volume prospecting.
              
            
          

          
             setShowClientVoiceSelect(false)}>Cancel
             {
                try {
                  await apiRequest('PATCH', `/api/client-portal/campaigns/${clientVoiceCampaignId}/voice`, {
                    voice: clientSelectedVoice,
                    provider: clientSelectedProvider,
                  });
                  toast({
                    title: 'Voice Updated',
                    description: `Voice changed to ${clientSelectedVoice} for this campaign.`,
                  });
                  setShowClientVoiceSelect(false);
                  queryClient.invalidateQueries({ queryKey: ['/api/client/campaigns'] });
                } catch (error) {
                  toast({
                    title: 'Update Failed',
                    description: error instanceof Error ? error.message : 'Could not update voice',
                    variant: 'destructive'
                  });
                }
              }}
            >
              
              Apply Voice
            
          
        
      
      
      
      
    
  );
}

function CampaignQueueDialog({ open, onOpenChange, campaignId }: { open: boolean; onOpenChange: (open: boolean) => void; campaignId: string | null }) {
  const { data: queueData, isLoading, error } = useQuery({
     queryKey: ['campaign-queue', campaignId],
     queryFn: async () => {
         if (!campaignId) return { total: 0, items: [] };
         const token = localStorage.getItem('clientPortalToken');
         const res = await fetch(`/api/client-portal/campaigns/${campaignId}/queue`, {
            headers: { Authorization: `Bearer ${token}` },
         });
         if (!res.ok) {
           const err = await res.json().catch(() => ({}));
           throw new Error(err.message || 'Failed to fetch queue');
         }
         return res.json();
     },
     enabled: !!campaignId && open
  });

  const queue = queueData?.items || [];
  const totalCount = queueData?.total || 0;

  return (
    
      
        
          Campaign Queue (Preview)
          
             {totalCount > 0 ? (
               <>Showing {Math.min(queue.length, 50)} of {totalCount} contacts in queue
             ) : (
               <>Next 50 contacts in queue
             )}
          
        
        
           {isLoading ? (
             
           ) : error ? (
             
               
               {(error as Error).message || 'Failed to load queue'}
             
           ) : (
             
             
                
                   
                      Contact
                      Phone
                      Status
                   
                
                
                   {queue.length === 0 ? (
                      Queue is empty
                   ) : (
                      queue.map((item: any) => (
                        
                           
                             
                               {item.contactName || 'Unknown'}
                               {item.companyName && {item.companyName}}
                             
                           
                           {item.phoneNumber || '-'}
                           {item.status}
                        
                      ))
                   )}
                
             
             
           )}
        
      
    
  );
}