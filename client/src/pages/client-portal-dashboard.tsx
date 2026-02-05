import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  Building2, LogOut, Package, Plus, FileText, Users, Calendar, ChevronRight,
  LayoutDashboard, Target, BarChart3, Download, CreditCard, MessageSquare,
  Phone, Mail, Send, Clock, CheckCircle, AlertCircle, TrendingUp, TrendingDown, Brain,
  FileDown, Eye, Headphones, Loader2, ArrowUpRight, ArrowDownRight, Sparkles,
  Megaphone, UserCheck, DollarSign, Receipt, HelpCircle, Settings, Bell,
  ChevronDown, Filter, Search, RefreshCw, ExternalLink, Zap, Bot, X,
  Link as LinkIcon, Upload, Trash2, Mic, ShoppingCart, FileEdit, TestTube,
  ClipboardList, Palette, BookOpen, PhoneCall, MailCheck, Play, Wand2,
  Contact2, Building, FileSpreadsheet, Globe, MapPin, Briefcase,
  Workflow, Shield, Puzzle, Pencil, Volume2, Crown, Cpu, Smile, Database,
  ArrowLeft, ArrowRight
} from 'lucide-react';
import { ClientAgentButton, ClientAgentPanel } from '@/components/client-portal/agent/client-agent-chat';
import {
  QualifiedLeadsTable,
  LeadDetailModal,
  EnhancedLeadDetailModal,
  ExportLeadsDialog,
} from '@/components/client-portal/leads';
import {
  CampaignCard,
  RequestLeadsDialog,
  CampaignCreationWizard,
  PreviewStudio,
} from '@/components/client-portal/campaigns';
import { SimulationStudioPanel as CampaignSimulationPanel } from '@/components/client-portal/simulation-studio/simulation-studio-panel';
import { AgenticReportsPanel } from '@/components/client-portal/reports/agentic-reports-panel';
import { AgenticCampaignOrderPanel } from '@/components/client-portal/orders/agentic-campaign-order-panel';
import { ClientEmailTemplateBuilder } from '@/components/client-portal/email/client-email-template-builder';
import { ActivityTimeline, type ActivityItem } from '@/components/patterns/activity-timeline';

interface ClientUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  clientAccountId: string;
  clientAccountName: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  eligibleCount: number;
  totalContacts: number;
  verifiedCount: number;
  deliveredCount: number;
  type?: string;
  campaignType?: string;
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

interface ClientActivityLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: Record<string, any> | null;
  createdAt: string;
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

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
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

export default function ClientPortalDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<ClientUser | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  
  // Work Order Request State (managed campaigns by Pivotal team)
  const [showWorkOrderDialog, setShowWorkOrderDialog] = useState(false);
  const [newWorkOrder, setNewWorkOrder] = useState({
    campaignType: '' as 'call_campaign' | 'email_campaign' | 'combined' | 'data_enrichment' | 'custom',
    campaignGoals: '',
    requiredLeads: '',
    desiredTimeline: '',
    deadline: '',
    additionalInstructions: '',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
  });

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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showLeadDrawer, setShowLeadDrawer] = useState(false);
  
  // Campaign filters
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<string>('all');
  const [campaignSearchQuery, setCampaignSearchQuery] = useState<string>('');
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<string>('all');
  
  // Lead filters
  const [leadSearchQuery, setLeadSearchQuery] = useState<string>('');
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('all');
  
  // Report view toggle
  const [reportViewType, setReportViewType] = useState<'executive' | 'detailed'>('executive');
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Campaign Creation Wizard State (new wizard)
  const [showCampaignWizard, setShowCampaignWizard] = useState(false);
  const [showPreviewStudio, setShowPreviewStudio] = useState(false);

  // Qualified Leads state
  const [selectedQualifiedLeadId, setSelectedQualifiedLeadId] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Request leads dialog state
  const [showRequestLeadsDialog, setShowRequestLeadsDialog] = useState(false);
  const [selectedCampaignForRequest, setSelectedCampaignForRequest] = useState<string | undefined>(undefined);

  // New agentic panels state
  const [showSimulationPanel, setShowSimulationPanel] = useState(false);
  const [showReportsPanel, setShowReportsPanel] = useState(false);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [showEmailGenerator, setShowEmailGenerator] = useState(false);
  const [selectedCampaignForSimulation, setSelectedCampaignForSimulation] = useState<string | undefined>(undefined);
  const [showAgentChat, setShowAgentChat] = useState(false);

  // Testing panels state
  const [showTestCallPanel, setShowTestCallPanel] = useState(false);
  const [showTestEmailPanel, setShowTestEmailPanel] = useState(false);
  const [testCallData, setTestCallData] = useState<{
    campaignId?: string;
    useManualData: boolean;
    contactId?: string;
    accountId?: string;
    manualData: { companyName: string; contactName: string; phone: string; email: string };
  }>({
    useManualData: false,
    manualData: { companyName: '', contactName: '', phone: '', email: '' }
  });
  const [testEmailData, setTestEmailData] = useState<{
    templateId?: string;
    useManualData: boolean;
    contactId?: string;
    accountId?: string;
    manualData: { companyName: string; contactName: string; email: string };
    recipientEmail: string;
  }>({
    useManualData: false,
    manualData: { companyName: '', contactName: '', email: '' },
    recipientEmail: ''
  });

  // Preview Studio state
  const [testCallCampaign, setTestCallCampaign] = useState('');
  const [testEmailTemplate, setTestEmailTemplate] = useState('');
  const [testDataSource, setTestDataSource] = useState<'crm' | 'manual'>('crm');
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
  const [previewCampaignId, setPreviewCampaignId] = useState<string>('');
  const [previewAccountId, setPreviewAccountId] = useState<string>('');
  const [previewContactId, setPreviewContactId] = useState<string>('');
  const [previewAudienceAccounts, setPreviewAudienceAccounts] = useState<any[]>([]);
  const [previewAudienceContacts, setPreviewAudienceContacts] = useState<any[]>([]);
  const [previewActiveTab, setPreviewActiveTab] = useState<'voice' | 'email'>('voice');
  const [selectedScenario, setSelectedScenario] = useState<string>('cold');
  const [simulationMode, setSimulationMode] = useState<'text' | 'voice'>('text');

  // Business Profile state
  const [businessProfile, setBusinessProfile] = useState<any>(null);

  // Organization Intelligence state
  const [orgIntelligence, setOrgIntelligence] = useState<any>(null);
  const [orgIntelligenceExpanded, setOrgIntelligenceExpanded] = useState<string | null>(null);
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDomain, setNewOrgDomain] = useState('');
  const [newOrgIndustry, setNewOrgIndustry] = useState('');

  // CRM state
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [crmSearchQuery, setCrmSearchQuery] = useState('');
  const [crmActiveTab, setCrmActiveTab] = useState<'accounts' | 'contacts'>('accounts');

  // Feature access state (will be loaded from API)
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([
    'accounts_contacts', 'bulk_upload', 'campaign_creation', 'email_templates',
    'call_flows', 'voice_selection', 'calendar_booking', 'analytics_dashboard', 'reports_export'
  ]);

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
  const { data: campaigns = [], isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery<Campaign[]>({
    queryKey: ['client-portal-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery<Order[]>({
    queryKey: ['client-portal-orders'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/orders', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['client-portal-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/invoices', authHeaders);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const { data: costSummary } = useQuery<CostSummary>({
    queryKey: ['client-portal-costs'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/summary', authHeaders);
      if (!res.ok) return { totalCost: 0, monthlyTrend: [], byType: [] };
      return res.json();
    },
    enabled: !!user,
  });

  const { data: projects = [], isLoading: projectsLoading, refetch: refetchProjects } = useQuery<Project[]>({
    queryKey: ['client-portal-projects'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/projects', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ['client-portal-leads'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/leads', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery<{
    activities: ClientActivityLog[];
    total: number;
  }>({
    queryKey: ['client-portal-activity'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/activity', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch activity log');
      return res.json();
    },
    enabled: !!user,
  });

  // Feature access query
  const { data: featuresData } = useQuery<{ enabledFeatures: string[] }>({
    queryKey: ['client-portal-features'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/features', authHeaders);
      if (!res.ok) return { enabledFeatures: [] };
      return res.json();
    },
    enabled: !!user,
  });

  // Update enabled features when data loads
  useEffect(() => {
    if (featuresData?.enabledFeatures) {
      setEnabledFeatures(featuresData.enabledFeatures);
    }
  }, [featuresData]);

  // Business profile query
  const { data: businessProfileData, isLoading: profileLoading } = useQuery<{
    profile: any;
    clientName: string;
    needsSetup: boolean;
  }>({
    queryKey: ['client-portal-business-profile'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/business-profile', authHeaders);
      if (!res.ok) return { profile: null, clientName: '', needsSetup: true };
      return res.json();
    },
    enabled: !!user,
  });

  // Sync business profile data to local state for editing
  useEffect(() => {
    if (businessProfileData?.profile) {
      setBusinessProfile(businessProfileData.profile);
    }
  }, [businessProfileData]);

  // Organization Intelligence query
  const { data: orgIntelligenceData, isLoading: orgIntelLoading, refetch: refetchOrgIntel } = useQuery<{
    organization: any;
    campaigns: any[];
    isPrimary: boolean;
    message?: string;
  }>({
    queryKey: ['client-portal-org-intelligence'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/organization-intelligence', authHeaders);
      if (!res.ok) return { organization: null, campaigns: [], isPrimary: false };
      return res.json();
    },
    enabled: !!user,
  });

  // Sync org intelligence data to local state for editing
  useEffect(() => {
    if (orgIntelligenceData?.organization) {
      setOrgIntelligence(orgIntelligenceData.organization);
    }
  }, [orgIntelligenceData]);

  // CRM Accounts query
  const { data: crmAccountsData, isLoading: crmAccountsLoading, refetch: refetchCrmAccounts } = useQuery<{
    accounts: any[];
    total: number;
  }>({
    queryKey: ['client-portal-crm-accounts', crmSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (crmSearchQuery) params.set('search', crmSearchQuery);
      const res = await fetch(`/api/client-portal/crm/accounts?${params}`, authHeaders);
      if (!res.ok) return { accounts: [], total: 0 };
      return res.json();
    },
    enabled: !!user && enabledFeatures.includes('accounts_contacts'),
  });

  // CRM Contacts query
  const { data: crmContactsData, isLoading: crmContactsLoading, refetch: refetchCrmContacts } = useQuery<{
    contacts: any[];
    total: number;
  }>({
    queryKey: ['client-portal-crm-contacts', crmSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (crmSearchQuery) params.set('search', crmSearchQuery);
      const res = await fetch(`/api/client-portal/crm/contacts?${params}`, authHeaders);
      if (!res.ok) return { contacts: [], total: 0 };
      return res.json();
    },
    enabled: !!user && enabledFeatures.includes('accounts_contacts'),
  });

  // Available voices query
  const { data: voicesData } = useQuery<{ voices: any[] }>({
    queryKey: ['client-portal-available-voices'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/available-voices', authHeaders);
      if (!res.ok) return { voices: [] };
      return res.json();
    },
    enabled: !!user,
  });

  // Preview Studio - Campaign audience query
  const { data: previewAudienceData, isLoading: previewAudienceLoading, refetch: refetchPreviewAudience } = useQuery<{
    campaign: { id: string; name: string; status: string; type: string };
    accounts: { id: string; name: string; website?: string; industry?: string; contactCount?: number }[];
    contacts: { id: string; firstName: string; lastName: string; email: string; phone?: string; title?: string; company?: string }[];
    totalAccountsAvailable: number;
    totalContactsAvailable: number;
  }>({
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
      setPreviewAudienceAccounts(previewAudienceData.accounts || []);
      setPreviewAudienceContacts(previewAudienceData.contacts || []);
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
  const crmAccounts = crmAccountsData?.accounts || [];
  const crmContacts = crmContactsData?.contacts || [];
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

  // Save organization intelligence mutation
  const saveOrgIntelMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/client-portal/settings/organization-intelligence', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to save organization intelligence');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-org-intelligence'] });
      toast({ title: 'Organization intelligence saved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save organization intelligence', description: error.message, variant: 'destructive' });
    },
  });

  // Handler for saving organization intelligence
  const handleSaveOrgIntelligence = () => {
    if (!orgIntelligence) return;
    saveOrgIntelMutation.mutate({
      identity: orgIntelligence.identity,
      offerings: orgIntelligence.offerings,
      icp: orgIntelligence.icp,
      positioning: orgIntelligence.positioning,
      outreach: orgIntelligence.outreach,
    });
  };

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async (data: { name: string; domain?: string; industry?: string }) => {
      const res = await fetch('/api/client-portal/settings/organization-intelligence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create organization');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-org-intelligence'] });
      setShowCreateOrgDialog(false);
      setNewOrgName('');
      setNewOrgDomain('');
      setNewOrgIndustry('');
      toast({ title: 'Organization created successfully', description: 'You can now fill in your organization intelligence.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create organization', description: error.message, variant: 'destructive' });
    },
  });

  // Handler for creating organization
  const handleCreateOrganization = () => {
    if (!newOrgName.trim()) return;
    createOrgMutation.mutate({
      name: newOrgName.trim(),
      domain: newOrgDomain.trim() || undefined,
      industry: newOrgIndustry.trim() || undefined,
    });
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
    });
  };

  const handleDeleteProject = (projectId: string, projectName: string) => {
    if (window.confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      deleteProjectMutation.mutate(projectId);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    localStorage.removeItem('clientPortalToken');
    localStorage.removeItem('clientPortalUser');
    setLocation('/client-portal/login');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge className={statusColors[status] || 'bg-gray-100 text-gray-800'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
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

  const activityConfig: Record<string, { title: string; type: ActivityItem['type']; status?: ActivityItem['status'] }> = {
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
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const pendingOrders = orders.filter(o => o.status === 'submitted' || o.status === 'approved').length;
  const totalSpent = costSummary?.totalCost || 0;
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.totalAmount - i.amountPaid, 0);
  
  // MTD Metrics (Mock - would calculate from actual data)
  const leadsDeliveredMTD = Math.floor(totalLeadsDelivered * 0.3); // Mock: 30% delivered this month
  const acceptanceRate = totalLeadsDelivered > 0 ? Math.round((totalLeadsDelivered / totalEligible) * 100) : 0;
  const averageCPL = totalLeadsDelivered > 0 ? Math.round(totalSpent / totalLeadsDelivered) : 0;
  
  // Next invoice date (Mock - first day of next month)
  const nextInvoiceDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  
  // Filter campaigns
  // Filter campaigns
  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesStatus = campaignStatusFilter === 'all' || campaign.status === campaignStatusFilter;
    const matchesSearch = !campaignSearchQuery || 
      campaign.name.toLowerCase().includes(campaignSearchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });
  
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Main navigation items - clean and unique
  // Core navigation modules - available to all clients by default
  // Note: Accounts & Contacts removed - now accessed via Campaign Context in Preview Studio
  const navItems: { id: string; label: string; icon: any; color: string; action?: () => void; featureRequired?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
    { id: 'campaign-order', label: 'Agentic Order', icon: ClipboardList, color: 'from-orange-500 to-amber-500', action: () => setShowOrderPanel(true) },
    { id: 'campaigns', label: 'Campaigns', icon: Target, color: 'from-purple-500 to-pink-500' },
    { id: 'studio', label: 'Simulations', icon: Eye, color: 'from-cyan-500 to-blue-500' },
    { id: 'leads', label: 'Leads', icon: UserCheck, color: 'from-green-500 to-emerald-500' },
    { id: 'billing', label: 'Billing', icon: Receipt, color: 'from-indigo-500 to-purple-500' },
    { id: 'support', label: 'Support', icon: Headphones, color: 'from-slate-500 to-slate-600' },
    { id: 'settings', label: 'Settings', icon: Settings, color: 'from-gray-500 to-slate-500' },
  ];

  return (
    <div className="flex h-screen bg-[#F8F9FA] dark:bg-[#0B1120] font-sans">
      {/* Enterprise Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-20' : 'w-72'} bg-white dark:bg-slate-900/95 border-r border-slate-200/60 dark:border-slate-800 flex flex-col transition-all duration-300 ease-sidebar fixed h-full z-50 shadow-sm`}>
        {/* Workspace Header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between w-full">
            <div className={`flex items-center gap-3.5 ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
                <Zap className="h-4 w-4 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <h1 className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white leading-none">Client Portal</h1>
                  <p className="text-[11px] text-slate-500 font-medium truncate mt-1">{user.clientAccountName}</p>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(true)} className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-50">
                <ChevronDown className="h-4 w-4 rotate-90" />
              </Button>
            )}
          </div>
          {sidebarCollapsed && (
            <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(false)} className="w-full mt-2 h-8 text-slate-400">
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-0.5 overflow-y-auto">
          {navItems
            .filter(item => !item.featureRequired || hasFeature(item.featureRequired))
            .map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.action) {
                  item.action();
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group relative duration-200 ${
                activeTab === item.id && !item.action
                  ? 'bg-indigo-50/80 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
                activeTab === item.id && !item.action ? 'bg-white shadow-sm ring-1 ring-black/5 dark:bg-indigo-500/20 dark:ring-white/10' : 'bg-transparent group-hover:bg-white group-hover:shadow-sm group-hover:ring-1 group-hover:ring-black/5 dark:group-hover:bg-slate-800'
              }`}>
                <item.icon className={`h-4 w-4 transition-colors ${activeTab === item.id && !item.action ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 group-hover:text-indigo-600 dark:text-slate-400'}`} />
              </div>
              {!sidebarCollapsed && (
                <span className="text-sm truncate tracking-tight">{item.label}</span>
              )}
              {activeTab === item.id && !item.action && !sidebarCollapsed && (
                <div className="absolute right-2 h-1.5 w-1.5 rounded-full bg-indigo-600" />
              )}
            </button>
          ))}
        </nav>

        {/* Pinned CTA - Talk to AI Agent */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30">
          <Button
            className={`w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all ${
              sidebarCollapsed ? 'px-0' : 'gap-2'
            }`}
            onClick={() => setShowAgentChat(true)}
          >
            <Brain className="h-4 w-4" />
            {!sidebarCollapsed && (
              <div className="flex flex-col items-start">
                <span className="font-semibold">Talk to AI Agent</span>
                <span className="text-[10px] opacity-80">Get help with your campaigns</span>
              </div>
            )}
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col ${sidebarCollapsed ? 'ml-20' : 'ml-64'} transition-all duration-300`}>
        {/* Top Header Bar */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-16 flex items-center px-6 sticky top-0 z-40">
          <div className="flex-1 flex items-center gap-4">
            <h2 className="text-lg font-semibold">{navItems.find(i => i.id === activeTab)?.label}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium leading-none">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
        {/* ==================== DASHBOARD TAB ==================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 max-w-7xl mx-auto pb-10">
            {/* Minimal Welcome Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <h2 className="text-3xl font-light tracking-tight text-slate-900 dark:text-white">
                  Welcome back, <span className="font-semibold">{user.firstName}</span>
                </h2>
                <p className="text-slate-500 dark:text-slate-400 font-light text-lg">
                  Here's your campaign performance overview for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                 <Button onClick={() => setShowOrderPanel(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-10 px-5">
                    <Plus className="h-4 w-4 mr-2" />
                    New Order
                  </Button>
                  <Button variant="outline" className="border-slate-200 hover:bg-slate-50 text-slate-700 h-10 px-5 shadow-sm bg-white" onClick={() => setShowSimulationPanel(true)}>
                    <Mic className="h-4 w-4 mr-2 text-indigo-500" />
                    Simulate
                  </Button>
                  <Button variant="outline" className="border-slate-200 hover:bg-slate-50 text-slate-700 h-10 px-5 shadow-sm bg-white" onClick={() => setShowReportsPanel(true)}>
                    <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                    Insights
                  </Button>
              </div>
            </div>

            {/* Enterprise KPI Tiles - Refreshed */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
              {/* Leads Delivered MTD */}
              <Card className="group hover:border-emerald-200 transition-all duration-300 shadow-sm border-slate-200/60 hover:shadow-md bg-white dark:bg-slate-800">
                <CardContent className="p-5">
                   <div className="flex justify-between items-start mb-4">
                      <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center">
                         <UserCheck className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <ArrowUpRight className="h-3 w-3" />
                         12.5%
                      </span>
                   </div>
                   <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Leads MTD</p>
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{leadsDeliveredMTD.toLocaleString()}</h3>
                   </div>
                </CardContent>
              </Card>

              {/* Acceptance Rate */}
              <Card className="group hover:border-blue-200 transition-all duration-300 shadow-sm border-slate-200/60 hover:shadow-md bg-white dark:bg-slate-800">
                <CardContent className="p-5">
                   <div className="flex justify-between items-start mb-4">
                      <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center">
                         <Target className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-500 flex items-center mt-1">
                        Avg 78%
                      </span>
                   </div>
                   <div className="space-y-2">
                       <div className="flex justify-between items-end">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Accept Rate</p>
                            <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{acceptanceRate}%</h3>
                          </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${acceptanceRate}%` }} />
                      </div>
                   </div>
                </CardContent>
              </Card>

              {/* CPL */}
              <Card className="group hover:border-purple-200 transition-all duration-300 shadow-sm border-slate-200/60 hover:shadow-md bg-white dark:bg-slate-800">
                <CardContent className="p-5">
                   <div className="flex justify-between items-start mb-4">
                      <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 flex items-center justify-center">
                         <DollarSign className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                         23%
                      </span>
                   </div>
                   <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Avg Cost Per Lead</p>
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{formatCurrency(averageCPL)}</h3>
                   </div>
                </CardContent>
              </Card>

              {/* Active Campaigns */}
              <Card className="group hover:border-indigo-200 transition-all duration-300 shadow-sm border-slate-200/60 hover:shadow-md bg-white dark:bg-slate-800">
                <CardContent className="p-5">
                   <div className="flex justify-between items-start mb-4">
                      <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center">
                         <Package className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400">
                        {pendingOrders} pending
                      </span>
                   </div>
                   <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Campaigns</p>
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{activeCampaigns}</h3>
                   </div>
                </CardContent>
              </Card>

              {/* Next Invoice */}
              <Card className="group hover:border-amber-200 transition-all duration-300 shadow-sm border-slate-200/60 hover:shadow-md bg-white dark:bg-slate-800">
                <CardContent className="p-5">
                   <div className="flex justify-between items-start mb-4">
                      <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center">
                         <Calendar className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-500 mt-1">
                         Next Bill
                      </span>
                   </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{nextInvoiceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                      <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                        {unpaidInvoices > 0 ? formatCurrency(unpaidInvoices) : 'Paid'}
                      </h3>
                   </div>
                </CardContent>
              </Card>
            </div>

            {/* AI Tools Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
                 {/* Main Chart Area */}
                 <Card className="lg:col-span-2 shadow-sm border-slate-200/60 bg-white dark:bg-slate-800">
                    <CardHeader className="pb-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-medium text-slate-800 dark:text-slate-100">Campaign Performance</CardTitle>
                            <Select defaultValue="this_month">
                                <SelectTrigger className="w-[140px] h-8 text-xs bg-slate-50 border-slate-200 shadow-none">
                                    <SelectValue placeholder="Period" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="this_month">This Month</SelectItem>
                                    <SelectItem value="last_month">Last Month</SelectItem>
                                    <SelectItem value="last_quarter">Last Quarter</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                         <div className="h-[250px] w-full flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                            <BarChart3 className="h-10 w-10 text-slate-300 mb-2" />
                            <p className="text-sm text-slate-500 font-medium">Performance Analytics Visualization</p>
                            <span className="text-xs text-slate-400">Loading complex dataset...</span>
                         </div>
                    </CardContent>
                 </Card>

                 {/* AI Actions */}
                 <Card className="shadow-sm border-slate-200/60 bg-white dark:bg-slate-800 flex flex-col">
                    <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                         <CardTitle className="text-lg font-medium flex items-center gap-2 text-slate-800 dark:text-slate-100">
                             <Sparkles className="h-4 w-4 text-indigo-500" />
                             Quick Actions
                         </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            <button onClick={() => setShowSimulationPanel(true)} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group">
                                <div className="h-10 w-10 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                    <Mic className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm text-slate-900 dark:text-white">Voice Simulation</p>
                                    <p className="text-xs text-slate-500">Test your AI agent's voice</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-300 ml-auto group-hover:text-violet-500 transition-colors" />
                            </button>
                             <button onClick={() => setShowOrderPanel(true)} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group">
                                <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                    <ShoppingCart className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm text-slate-900 dark:text-white">New Campaign Order</p>
                                    <p className="text-xs text-slate-500">Purchase new leads or services</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-300 ml-auto group-hover:text-emerald-500 transition-colors" />
                            </button>
                             <button onClick={() => setShowReportsPanel(true)} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group">
                                <div className="h-10 w-10 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                    <BarChart3 className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm text-slate-900 dark:text-white">Generate Reports</p>
                                    <p className="text-xs text-slate-500">AI-driven analytics reports</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-300 ml-auto group-hover:text-amber-500 transition-colors" />
                            </button>
                             <button onClick={() => setShowEmailGenerator(true)} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left group">
                                <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                    <Mail className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm text-slate-900 dark:text-white">Email Generator</p>
                                    <p className="text-xs text-slate-500">Generate emails with AI</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-300 ml-auto group-hover:text-blue-500 transition-colors" />
                            </button>
                        </div>
                    </CardContent>
                 </Card>
            </div>



            {/* Recent Activity */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Recent Orders</CardTitle>
                    <CardDescription>Your latest contact orders</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('leads')}>
                    View All <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p>No orders yet</p>
                      <Button variant="link" onClick={() => setShowOrderPanel(true)}>
                        Submit your first campaign request
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orders.slice(0, 5).map((order) => (
                        <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                              <Package className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{order.orderNumber}</p>
                              <p className="text-xs text-muted-foreground">{order.campaignName}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(order.status)}
                            <p className="text-xs text-muted-foreground mt-1">
                              {order.deliveredQuantity}/{order.requestedQuantity} delivered
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Your Campaigns</CardTitle>
                    <CardDescription>Quick access to campaigns</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('campaigns')}>
                    View All <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {campaigns.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p>No campaigns assigned yet</p>
                      <p className="text-sm">Contact your account manager</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {campaigns.slice(0, 5).map((campaign) => (
                        <div
                          key={campaign.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => {
                            openRequestLeadsDialog(campaign.id);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <Target className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{campaign.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{campaign.eligibleCount?.toLocaleString() || 0} eligible</span>
                                <span>•</span>
                                <span>{campaign.deliveredCount?.toLocaleString() || 0} delivered</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(campaign.status || 'active')}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Activity & Requests */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-600" />
                Activity & Requests
                {(activityData?.activities?.length || 0) > 0 && (
                  <Badge variant="secondary" className="ml-2">{activityData?.activities?.length}</Badge>
                )}
              </h3>
              <Card className="border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20">
                <CardContent className="p-6">
                  {activityLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                  ) : (
                    <ScrollArea className="h-[320px] pr-3">
                      <ActivityTimeline
                        items={activityItems}
                        showAvatar={false}
                        compact
                      />
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ==================== CAMPAIGNS TAB ==================== */}
        {activeTab === 'campaigns' && (
          <div className="space-y-6 md:space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Campaigns</h2>
                <p className="text-muted-foreground w-full md:w-auto">View and manage your AI-powered campaigns</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreviewCampaignId('');
                    setShowPreviewStudio(true);
                  }}
                  className="gap-2 w-full sm:w-auto"
                >
                  <Play className="h-4 w-4" />
                  Preview Studio
                </Button>
                <Button
                  onClick={() => setShowOrderPanel(true)}
                  className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 w-full sm:w-auto"
                >
                  <Bot className="h-4 w-4" />
                  New Campaign Request
                </Button>
              </div>
            </div>

            {/* Agentic Campaign Order Banner */}
            <Card className="border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 dark:border-violet-800">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg">
                    <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="flex-1 space-y-3 w-full">
                    <div>
                      <h4 className="font-semibold text-lg text-violet-800 dark:text-violet-300">Submit a Campaign Request</h4>
                      <p className="text-sm text-violet-700 dark:text-violet-400 mt-1 leading-relaxed">
                        Describe your campaign goals, target audience, budget, and timeline - our AI agent will capture all the details. The DemandGentic team will configure and launch your campaign with our best-in-class AI voice agents.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="w-full sm:w-auto bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-md hover:shadow-lg transition-all"
                      onClick={() => setShowOrderPanel(true)}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Submit Campaign Request
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Campaign Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Active Campaigns */}
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Campaigns</p>
                      <p className="text-3xl font-bold text-green-600">{filteredCampaigns.filter(c => c.status === 'active').length}</p>
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {filteredCampaigns.filter(c => c.status === 'active' && (c.type === 'email' || c.campaignType === 'email')).length}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {filteredCampaigns.filter(c => c.status === 'active' && (c.type === 'phone' || c.type === 'call' || c.campaignType === 'phone' || c.campaignType === 'call')).length}
                        </span>
                      </div>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                      <Zap className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Impressions - Email & Phone */}
              <Card className="border-blue-200 dark:border-blue-800">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Impressions</p>
                      <p className="text-3xl font-bold text-blue-600">{totalLeadsDelivered.toLocaleString()}</p>
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {Math.floor(totalLeadsDelivered * 0.6).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {Math.floor(totalLeadsDelivered * 0.4).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                      <BarChart3 className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Qualified Leads */}
              <Card className="border-purple-200 dark:border-purple-800">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Qualified Leads</p>
                      <p className="text-3xl font-bold text-purple-600">{Math.floor(totalLeadsDelivered * 0.042).toLocaleString()}</p>
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {Math.floor(totalLeadsDelivered * 0.042 * 0.55).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {Math.floor(totalLeadsDelivered * 0.042 * 0.45).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                      <UserCheck className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Conversion Rate */}
              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Conversion Rate</p>
                      <p className="text-3xl font-bold text-amber-600">4.2%</p>
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          3.8%
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          4.7%
                        </span>
                      </div>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Campaign Filters */}
            <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search campaigns..." 
                      className="pl-9 bg-white dark:bg-gray-950"
                      value={campaignSearchQuery}
                      onChange={(e) => setCampaignSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={campaignStatusFilter} onValueChange={(val) => setCampaignStatusFilter(val)}>
                    <SelectTrigger className="w-full md:w-[180px] bg-white dark:bg-gray-950">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        <SelectValue placeholder="Status" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={campaignTypeFilter} onValueChange={(val) => setCampaignTypeFilter(val)}>
                    <SelectTrigger className="w-full md:w-[180px] bg-white dark:bg-gray-950">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="voice">Voice Campaigns</SelectItem>
                      <SelectItem value="email">Email Campaigns</SelectItem>
                      <SelectItem value="combined">Combined</SelectItem>
                      <SelectItem value="data">Data Enrichment</SelectItem>
                    </SelectContent>
                  </Select>
                  {(campaignSearchQuery || campaignStatusFilter !== 'all' || campaignTypeFilter !== 'all') && (
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => {
                        setCampaignSearchQuery('');
                        setCampaignStatusFilter('all');
                        setCampaignTypeFilter('all');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Your Campaigns */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-600" />
                Your Campaigns
                {filteredCampaigns.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{filteredCampaigns.length}</Badge>
                )}
              </h3>
              {campaignsLoading ? (
                 <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
              ) : filteredCampaigns.length === 0 ? (
                 <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <div className="h-16 w-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
                        <Target className="h-8 w-8 text-purple-600" />
                      </div>
                      <h4 className="font-semibold text-lg mb-2">No campaigns yet</h4>
                       <p className="text-muted-foreground text-center mb-4 max-w-md">
                         {campaigns.length === 0 ? 'Submit a campaign request and our team will configure and launch your AI-powered outreach.' : 'No campaigns match your current filters.'}
                       </p>
                       {campaigns.length === 0 && (
                         <Button onClick={() => setShowOrderPanel(true)} className="bg-gradient-to-r from-violet-600 to-purple-600">
                           <Bot className="h-4 w-4 mr-2" />
                           Submit Your First Request
                         </Button>
                       )}
                    </CardContent>
                 </Card>
              ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredCampaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onRequestMoreLeads={(campaignId) => openRequestLeadsDialog(campaignId)}
                  />
                ))}
              </div>
              )}
            </div>

          </div>
        )}


        {/* ==================== LEADS TAB ==================== */}
        {activeTab === 'leads' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Qualified Leads</h2>
                <p className="text-muted-foreground">QA-approved leads from your campaigns with recordings and transcripts</p>
              </div>
            </div>

            {/* QA-Approved Leads Table */}
            <QualifiedLeadsTable
              onViewDetails={(leadId) => setSelectedQualifiedLeadId(leadId)}
              onExport={() => setShowExportDialog(true)}
            />
          </div>
        )}

        {/* ==================== REPORTS TAB ==================== */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Reports & Analytics</h2>
                <p className="text-muted-foreground">Track your campaign performance and ROI</p>
              </div>
              <div className="flex gap-2">
                <Select defaultValue="30d">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="1y">Last year</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline">
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              </div>
            </div>

            {/* Report Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Leads</p>
                      <p className="text-2xl font-bold">{totalLeadsDelivered.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center text-green-600 text-sm">
                      <ArrowUpRight className="h-4 w-4" />
                      +12%
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Verified Rate</p>
                      <p className="text-2xl font-bold">87.5%</p>
                    </div>
                    <div className="flex items-center text-green-600 text-sm">
                      <ArrowUpRight className="h-4 w-4" />
                      +3%
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Cost per Lead</p>
                      <p className="text-2xl font-bold">{averageCPL > 0 ? `$${averageCPL.toLocaleString()}` : '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg. Delivery Time</p>
                      <p className="text-2xl font-bold">2.3 days</p>
                    </div>
                    <div className="flex items-center text-green-600 text-sm">
                      <ArrowDownRight className="h-4 w-4" />
                      -18%
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Lead Delivery</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={deliveryTrendData}>
                        <defs>
                          <linearGradient id="colorLeads2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#colorLeads2)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cost Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={costSummary?.byType?.map((t, i) => ({ name: t.type, value: t.total })) || [
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
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value as number)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ==================== BILLING TAB ==================== */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Billing & Invoices</h2>
                <p className="text-muted-foreground">View your invoices and payment history</p>
              </div>
            </div>

            {/* Billing Summary */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Billing Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-3 gap-6">
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
                      <p className="text-sm text-muted-foreground">Total Spent</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <Receipt className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-2xl font-bold">{invoices.length}</p>
                      <p className="text-sm text-muted-foreground">Total Invoices</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-600" />
                      <p className="text-2xl font-bold text-amber-600">{formatCurrency(unpaidInvoices)}</p>
                      <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Wire Transfer</p>
                        <p className="text-xs text-muted-foreground">NET 30</p>
                      </div>
                    </div>
                    <Badge variant="outline">Default</Badge>
                  </div>
                  <Button variant="outline" className="w-full" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Payment Method
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Invoices Table */}
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <div className="text-center py-12">
                    <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold mb-2">No Invoices Yet</h3>
                    <p className="text-muted-foreground">Your invoices will appear here once generated</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-mono text-sm">{invoice.invoiceNumber}</TableCell>
                            <TableCell>
                              {new Date(invoice.billingPeriodStart).toLocaleDateString()} - {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(invoice.totalAmount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(invoice.amountPaid)}</TableCell>
                            <TableCell>
                              {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {invoice.pdfUrl && (
                                  <Button variant="ghost" size="sm" asChild>
                                    <a href={invoice.pdfUrl} target="_blank" rel="noopener">
                                      <Download className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== SUPPORT TAB ==================== */}
        {activeTab === 'support' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Support & Contact</h2>
                <p className="text-muted-foreground">Get help from our team</p>
              </div>
              <Button onClick={() => setShowSupportDialog(true)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                New Support Request
              </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Contact Cards */}
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="h-14 w-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                    <Mail className="h-7 w-7 text-blue-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Email Support</h3>
                  <p className="text-sm text-muted-foreground mb-4">Get help via email. We typically respond within 2-4 hours.</p>
                  <Button variant="outline" className="w-full" asChild>
                    <a href="mailto:support@pivotal-b2b.com">
                      support@pivotal-b2b.com
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                    <Phone className="h-7 w-7 text-green-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Phone Support</h3>
                  <p className="text-sm text-muted-foreground mb-4">Speak directly with your account manager during business hours.</p>
                  <Button variant="outline" className="w-full" asChild>
                    <a href="tel:+1-555-123-4567">
                      +1 (555) 123-4567
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="h-14 w-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-4">
                    <Headphones className="h-7 w-7 text-purple-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Schedule a Call</h3>
                  <p className="text-sm text-muted-foreground mb-4">Book a call with your dedicated account manager.</p>
                  <Button variant="outline" className="w-full">
                    Schedule Meeting
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Account Manager */}
            <Card>
              <CardHeader>
                <CardTitle>Your Account Team</CardTitle>
                <CardDescription>Your dedicated support contacts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg border">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">ZM</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">Zahid Mohammadi</p>
                      <p className="text-sm text-muted-foreground">CEO</p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="ghost" size="sm" asChild>
                          <a href="mailto:zahid.m@pivotal-b2b.com">
                            <Mail className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-lg border">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-green-100 text-green-700">TH</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">Tabasum Hamdard</p>
                      <p className="text-sm text-muted-foreground">Client Success Director</p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="ghost" size="sm" asChild>
                          <a href="mailto:tabasum.hamdard@pivotal-b2b.com">
                            <Mail className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { q: 'How do I download my delivered leads?', a: 'Go to Leads & Delivery tab, find your completed order, and click the download button.' },
                  { q: 'What is the typical delivery time?', a: 'Most orders are delivered within 2-5 business days depending on volume and campaign complexity.' },
                  { q: 'How are leads verified?', a: 'Our AI-powered verification system validates contact information through multiple data sources and real-time validation.' },
                  { q: 'Can I request a custom campaign?', a: 'Yes! Go to Campaigns tab and click "Request New Campaign" to submit your requirements.' },
                ].map((faq, i) => (
                  <div key={i} className="p-4 rounded-lg border">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">{faq.q}</p>
                        <p className="text-sm text-muted-foreground mt-1">{faq.a}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== WORK ORDERS TAB ==================== */}
        {activeTab === 'work-orders' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Direct Agentic Orders</h2>
                <p className="text-muted-foreground">Request campaigns to be managed and executed by our team</p>
              </div>
              <Button onClick={() => setShowWorkOrderDialog(true)} className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600">
                <Plus className="h-4 w-4 mr-2" />
                Submit New Direct Agentic Order
              </Button>
            </div>

            {/* Info Banner */}
            <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 dark:border-orange-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-orange-800 dark:text-orange-300">What are Direct Agentic Orders?</h4>
                    <p className="text-sm text-orange-700 dark:text-orange-400 mt-1">
                      Direct Agentic Orders allow you to request that our team runs campaigns on your behalf. You specify the campaign type, goals, lead requirements, and timeline — and our team handles execution from start to finish.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Review</p>
                      <p className="text-2xl font-bold">1</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">In Progress</p>
                      <p className="text-2xl font-bold">2</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <Target className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p className="text-2xl font-bold">12</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Value</p>
                      <p className="text-2xl font-bold">$24,500</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Work Orders Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Your Direct Agentic Orders</CardTitle>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Search orders..." className="w-[200px]" />
                    <Select defaultValue="all">
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Campaign Type</TableHead>
                        <TableHead>Goals</TableHead>
                        <TableHead>Leads Requested</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-mono font-medium">WO-2026-003</TableCell>
                        <TableCell><Badge variant="outline" className="bg-violet-50">Call Campaign</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">Q1 Enterprise Outreach - IT Decision Makers</TableCell>
                        <TableCell>500</TableCell>
                        <TableCell>Feb 28, 2026</TableCell>
                        <TableCell><Badge className="bg-blue-100 text-blue-700">Pending Review</Badge></TableCell>
                        <TableCell>Feb 1, 2026</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono font-medium">WO-2026-002</TableCell>
                        <TableCell><Badge variant="outline" className="bg-blue-50">Email Campaign</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">Product Launch Announcement</TableCell>
                        <TableCell>1,000</TableCell>
                        <TableCell>Feb 15, 2026</TableCell>
                        <TableCell><Badge className="bg-amber-100 text-amber-700">In Progress</Badge></TableCell>
                        <TableCell>Jan 25, 2026</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono font-medium">WO-2026-001</TableCell>
                        <TableCell><Badge variant="outline" className="bg-green-50">Combined</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">Multi-channel ABM Campaign</TableCell>
                        <TableCell>250</TableCell>
                        <TableCell>Jan 31, 2026</TableCell>
                        <TableCell><Badge className="bg-green-100 text-green-700">Completed</Badge></TableCell>
                        <TableCell>Jan 10, 2026</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== PREVIEW STUDIO TAB ==================== */}
        {activeTab === 'studio' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Simulation Studio</h2>
                <p className="text-muted-foreground">Test and experience your AI agents in action</p>
              </div>
            </div>

            {/* Main Layout - Clean Single Entry Point */}
            <div className="grid lg:grid-cols-12 gap-6">
              {/* Left: Campaign Selection */}
              <div className="lg:col-span-4 space-y-4">
                <Card className="border-2 border-violet-200 dark:border-violet-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-violet-600" />
                      Select Campaign
                    </CardTitle>
                    <CardDescription>Choose the campaign to simulate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Select value={previewCampaignId} onValueChange={setPreviewCampaignId}>
                      <SelectTrigger className="w-full h-12">
                        <SelectValue placeholder="Choose a campaign..." />
                      </SelectTrigger>
                      <SelectContent>
                        {campaigns.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            <div className="flex items-center justify-between w-full gap-3">
                              <span className="truncate">{c.name}</span>
                              <Badge variant="outline" className={`text-xs shrink-0 ${
                                c.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                                c.status === 'paused' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-gray-50 text-gray-600 border-gray-200'
                              }`}>
                                {c.status}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                {/* Email Template Generation */}
                <Card className="border-2 border-indigo-200 dark:border-indigo-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-indigo-600" />
                        Email Templates
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                     <div
                        onClick={() => setShowEmailGenerator(true)}
                        className="p-4 rounded-xl cursor-pointer transition-all border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm">Generate AI Email Sequences</h4>
                            <p className="text-xs text-muted-foreground">Create personalized outreach</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Simulation Options */}
              <div className="lg:col-span-8 space-y-4">
                {/* Voice Simulation Card */}
                <Card
                  className={`border-2 cursor-pointer transition-all hover:shadow-lg ${
                    previewCampaignId
                      ? 'border-violet-300 hover:border-violet-400'
                      : 'border-slate-200 opacity-60'
                  }`}
                  onClick={() => {
                    if (previewCampaignId) {
                      setSelectedCampaignForSimulation(previewCampaignId);
                      setShowSimulationPanel(true);
                    }
                  }}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-6">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200">
                        <Phone className="h-8 w-8 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold mb-2">Voice & Text Simulation</h3>
                        <p className="text-muted-foreground mb-4">
                          Experience your AI agent with realistic voice conversations or text chat.
                          Select from multiple voice personas and test different scenarios.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="bg-violet-100 text-violet-700">Voice Call</Badge>
                          <Badge variant="secondary" className="bg-violet-100 text-violet-700">Text Chat</Badge>
                          <Badge variant="secondary" className="bg-violet-100 text-violet-700">Email Preview</Badge>
                          <Badge variant="secondary" className="bg-violet-100 text-violet-700">Multiple Voices</Badge>
                        </div>
                      </div>
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                        disabled={!previewCampaignId}
                      >
                        <Play className="h-5 w-5 mr-2" />
                        Launch
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* What You'll Experience */}
                <Card className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border-violet-200 dark:border-violet-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                      What you'll experience:
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-slate-900/50">
                        <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                          <Brain className="h-4 w-4 text-violet-600" />
                        </div>
                        <span className="text-sm">AI agent with campaign intelligence</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-slate-900/50">
                        <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                          <Volume2 className="h-4 w-4 text-violet-600" />
                        </div>
                        <span className="text-sm">Multiple voice personas (male/female)</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-slate-900/50">
                        <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                          <Building className="h-4 w-4 text-violet-600" />
                        </div>
                        <span className="text-sm">Account & contact context aware</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-slate-900/50">
                        <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                          <Zap className="h-4 w-4 text-violet-600" />
                        </div>
                        <span className="text-sm">Real-time objection handling</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Help Text */}
                {!previewCampaignId && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">Select a Campaign</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">Choose a campaign from the dropdown to start simulating your AI agent.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== CRM TAB ==================== */}
        {activeTab === 'crm' && hasFeature('accounts_contacts') && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Accounts & Contacts</h2>
                <p className="text-muted-foreground">Manage your CRM data for campaigns</p>
              </div>
              <div className="flex gap-2">
                {hasFeature('bulk_upload') && (
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Bulk Import
                  </Button>
                )}
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </div>
            </div>

            <Tabs defaultValue="contacts" className="w-full">
              <TabsList>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
              </TabsList>

              <TabsContent value="contacts" className="mt-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Contacts</CardTitle>
                      <div className="flex items-center gap-2">
                        <Input placeholder="Search contacts..." className="w-[250px]" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(crmContacts || []).length === 0 ? (
                      <div className="text-center py-12">
                        <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="font-semibold mb-2">No Contacts Yet</h3>
                        <p className="text-muted-foreground mb-4">Add contacts manually or import from a file</p>
                        <div className="flex justify-center gap-2">
                          <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Contact
                          </Button>
                          {hasFeature('bulk_upload') && (
                            <Button variant="outline">
                              <Upload className="h-4 w-4 mr-2" />
                              Import CSV
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Company</TableHead>
                              <TableHead>Title</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(crmContacts || []).map((contact: any) => (
                              <TableRow key={contact.id}>
                                <TableCell className="font-medium">
                                  {contact.firstName} {contact.lastName}
                                </TableCell>
                                <TableCell>{contact.email}</TableCell>
                                <TableCell>{contact.phone}</TableCell>
                                <TableCell>{contact.company}</TableCell>
                                <TableCell>{contact.title}</TableCell>
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="accounts" className="mt-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Accounts</CardTitle>
                      <div className="flex items-center gap-2">
                        <Input placeholder="Search accounts..." className="w-[250px]" />
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Account
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(crmAccounts || []).length === 0 ? (
                      <div className="text-center py-12">
                        <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="font-semibold mb-2">No Accounts Yet</h3>
                        <p className="text-muted-foreground mb-4">Create accounts to organize your contacts</p>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Account
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Company Name</TableHead>
                              <TableHead>Industry</TableHead>
                              <TableHead>Website</TableHead>
                              <TableHead>Contacts</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(crmAccounts || []).map((account: any) => (
                              <TableRow key={account.id}>
                                <TableCell className="font-medium">{account.companyName}</TableCell>
                                <TableCell>{account.industry}</TableCell>
                                <TableCell>{account.website}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary">{account.contactCount || 0}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* ==================== SETTINGS TAB ==================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Settings</h2>
              <p className="text-muted-foreground">Manage your business profile and preferences</p>
            </div>

            <Tabs defaultValue="business-profile" className="w-full">
              <TabsList>
                <TabsTrigger value="business-profile">Business Profile</TabsTrigger>
                <TabsTrigger value="organization-intelligence">Organization Intelligence</TabsTrigger>
                <TabsTrigger value="compliance">Compliance</TabsTrigger>
                <TabsTrigger value="integrations">Integrations</TabsTrigger>
              </TabsList>

              <TabsContent value="business-profile" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Business Information
                    </CardTitle>
                    <CardDescription>
                      This information is used for compliance and appears in email footers
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Legal Business Name *</Label>
                        <Input
                          placeholder="Your Company, LLC"
                          value={businessProfile?.legalBusinessName || ''}
                          onChange={(e) => setBusinessProfile((prev: any) => ({ ...prev, legalBusinessName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>DBA / Trade Name</Label>
                        <Input
                          placeholder="Your Brand Name"
                          value={businessProfile?.dbaName || ''}
                          onChange={(e) => setBusinessProfile((prev: any) => ({ ...prev, dbaName: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Street Address *</Label>
                      <Input
                        placeholder="123 Business St, Suite 100"
                        value={businessProfile?.streetAddress || ''}
                        onChange={(e) => setBusinessProfile((prev: any) => ({ ...prev, streetAddress: e.target.value }))}
                      />
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>City *</Label>
                        <Input
                          placeholder="New York"
                          value={businessProfile?.city || ''}
                          onChange={(e) => setBusinessProfile((prev: any) => ({ ...prev, city: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>State / Province *</Label>
                        <Input
                          placeholder="NY"
                          value={businessProfile?.state || ''}
                          onChange={(e) => setBusinessProfile((prev: any) => ({ ...prev, state: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Postal Code *</Label>
                        <Input
                          placeholder="10001"
                          value={businessProfile?.postalCode || ''}
                          onChange={(e) => setBusinessProfile((prev: any) => ({ ...prev, postalCode: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Country *</Label>
                      <Select
                        value={businessProfile?.country || 'US'}
                        onValueChange={(value) => setBusinessProfile((prev: any) => ({ ...prev, country: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="US">United States</SelectItem>
                          <SelectItem value="CA">Canada</SelectItem>
                          <SelectItem value="GB">United Kingdom</SelectItem>
                          <SelectItem value="AU">Australia</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button 
                      className="mt-4" 
                      onClick={handleSaveBusinessProfile}
                      disabled={saveBusinessProfileMutation.isPending || !businessProfile?.legalBusinessName || !businessProfile?.streetAddress || !businessProfile?.city || !businessProfile?.state || !businessProfile?.postalCode}
                    >
                      {saveBusinessProfileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Business Profile
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Organization Intelligence Tab */}
              <TabsContent value="organization-intelligence" className="mt-4">
                <div className="space-y-4">
                  {/* Header with organization info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        Organization Intelligence
                      </CardTitle>
                      <CardDescription>
                        Define your organization's context to power AI agents in campaigns. This information helps AI understand your business.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {orgIntelLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : !orgIntelligence ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No organization linked to your account.</p>
                          <p className="text-sm mt-1 mb-4">Create your organization to power AI agents with your business context.</p>
                          <Button onClick={() => setShowCreateOrgDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Organization
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Building2 className="h-8 w-8 text-primary" />
                            <div>
                              <h3 className="font-semibold">{orgIntelligence.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {orgIntelligence.domain && <span className="mr-2">{orgIntelligence.domain}</span>}
                                {orgIntelligence.industry && <Badge variant="outline" className="text-xs">{orgIntelligence.industry}</Badge>}
                              </p>
                            </div>
                          </div>
                          {orgIntelligenceData?.campaigns && orgIntelligenceData.campaigns.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium">{orgIntelligenceData.campaigns.length}</span> campaign{orgIntelligenceData.campaigns.length !== 1 ? 's' : ''} using this organization
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {orgIntelligence && (
                    <>
                      {/* Identity Section */}
                      <Card>
                        <CardHeader 
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setOrgIntelligenceExpanded(orgIntelligenceExpanded === 'identity' ? null : 'identity')}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building className="h-5 w-5 text-blue-500" />
                              <CardTitle className="text-base">Company Identity</CardTitle>
                            </div>
                            <ChevronDown className={`h-5 w-5 transition-transform ${orgIntelligenceExpanded === 'identity' ? 'rotate-180' : ''}`} />
                          </div>
                          <CardDescription>Legal name, description, industry, and company size</CardDescription>
                        </CardHeader>
                        {orgIntelligenceExpanded === 'identity' && (
                          <CardContent className="space-y-4">
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Legal Name</Label>
                                <Input
                                  value={orgIntelligence.identity?.legalName || ''}
                                  onChange={(e) => setOrgIntelligence((prev: any) => ({
                                    ...prev,
                                    identity: { ...prev.identity, legalName: e.target.value }
                                  }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Industry</Label>
                                <Input
                                  value={orgIntelligence.identity?.industry || ''}
                                  onChange={(e) => setOrgIntelligence((prev: any) => ({
                                    ...prev,
                                    identity: { ...prev.identity, industry: e.target.value }
                                  }))}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Textarea
                                rows={3}
                                value={orgIntelligence.identity?.description || ''}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  identity: { ...prev.identity, description: e.target.value }
                                }))}
                                placeholder="Brief description of your organization..."
                              />
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Number of Employees</Label>
                                <Input
                                  value={orgIntelligence.identity?.employees || ''}
                                  onChange={(e) => setOrgIntelligence((prev: any) => ({
                                    ...prev,
                                    identity: { ...prev.identity, employees: e.target.value }
                                  }))}
                                  placeholder="e.g., 50-100"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Founded Year</Label>
                                <Input
                                  type="number"
                                  value={orgIntelligence.identity?.foundedYear || ''}
                                  onChange={(e) => setOrgIntelligence((prev: any) => ({
                                    ...prev,
                                    identity: { ...prev.identity, foundedYear: parseInt(e.target.value) || null }
                                  }))}
                                />
                              </div>
                            </div>
                          </CardContent>
                        )}
                      </Card>

                      {/* Offerings Section */}
                      <Card>
                        <CardHeader 
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setOrgIntelligenceExpanded(orgIntelligenceExpanded === 'offerings' ? null : 'offerings')}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Package className="h-5 w-5 text-green-500" />
                              <CardTitle className="text-base">Products & Services</CardTitle>
                            </div>
                            <ChevronDown className={`h-5 w-5 transition-transform ${orgIntelligenceExpanded === 'offerings' ? 'rotate-180' : ''}`} />
                          </div>
                          <CardDescription>Core products, use cases, problems solved, and differentiators</CardDescription>
                        </CardHeader>
                        {orgIntelligenceExpanded === 'offerings' && (
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <Label>Core Products/Services (one per line)</Label>
                              <Textarea
                                rows={3}
                                value={(orgIntelligence.offerings?.coreProducts || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  offerings: { ...prev.offerings, coreProducts: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="Enter each product or service on a new line..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Problems We Solve (one per line)</Label>
                              <Textarea
                                rows={3}
                                value={(orgIntelligence.offerings?.problemsSolved || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  offerings: { ...prev.offerings, problemsSolved: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="List the problems your products/services solve..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Key Differentiators (one per line)</Label>
                              <Textarea
                                rows={3}
                                value={(orgIntelligence.offerings?.differentiators || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  offerings: { ...prev.offerings, differentiators: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="What makes you different from competitors..."
                              />
                            </div>
                          </CardContent>
                        )}
                      </Card>

                      {/* ICP Section */}
                      <Card>
                        <CardHeader 
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setOrgIntelligenceExpanded(orgIntelligenceExpanded === 'icp' ? null : 'icp')}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Target className="h-5 w-5 text-purple-500" />
                              <CardTitle className="text-base">Ideal Customer Profile (ICP)</CardTitle>
                            </div>
                            <ChevronDown className={`h-5 w-5 transition-transform ${orgIntelligenceExpanded === 'icp' ? 'rotate-180' : ''}`} />
                          </div>
                          <CardDescription>Target industries, company size, and buyer personas</CardDescription>
                        </CardHeader>
                        {orgIntelligenceExpanded === 'icp' && (
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <Label>Target Industries (one per line)</Label>
                              <Textarea
                                rows={3}
                                value={(orgIntelligence.icp?.industries || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  icp: { ...prev.icp, industries: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="e.g., Healthcare, Financial Services, Manufacturing..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Target Company Size</Label>
                              <Input
                                value={orgIntelligence.icp?.companySize || ''}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  icp: { ...prev.icp, companySize: e.target.value }
                                }))}
                                placeholder="e.g., 100-500 employees, Enterprise 1000+"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Common Objections We Hear (one per line)</Label>
                              <Textarea
                                rows={3}
                                value={(orgIntelligence.icp?.objections || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  icp: { ...prev.icp, objections: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="e.g., Too expensive, We already have a solution..."
                              />
                            </div>
                          </CardContent>
                        )}
                      </Card>

                      {/* Positioning Section */}
                      <Card>
                        <CardHeader 
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setOrgIntelligenceExpanded(orgIntelligenceExpanded === 'positioning' ? null : 'positioning')}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Megaphone className="h-5 w-5 text-orange-500" />
                              <CardTitle className="text-base">Positioning & Messaging</CardTitle>
                            </div>
                            <ChevronDown className={`h-5 w-5 transition-transform ${orgIntelligenceExpanded === 'positioning' ? 'rotate-180' : ''}`} />
                          </div>
                          <CardDescription>Value proposition, one-liner, and competitive positioning</CardDescription>
                        </CardHeader>
                        {orgIntelligenceExpanded === 'positioning' && (
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <Label>One-Liner / Elevator Pitch</Label>
                              <Input
                                value={orgIntelligence.positioning?.oneLiner || ''}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  positioning: { ...prev.positioning, oneLiner: e.target.value }
                                }))}
                                placeholder="We help [target] achieve [outcome] by [method]"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Value Proposition</Label>
                              <Textarea
                                rows={3}
                                value={orgIntelligence.positioning?.valueProposition || ''}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  positioning: { ...prev.positioning, valueProposition: e.target.value }
                                }))}
                                placeholder="Detailed value proposition statement..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Competitors (one per line)</Label>
                              <Textarea
                                rows={2}
                                value={(orgIntelligence.positioning?.competitors || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  positioning: { ...prev.positioning, competitors: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="List main competitors..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Why Choose Us (one per line)</Label>
                              <Textarea
                                rows={3}
                                value={(orgIntelligence.positioning?.whyUs || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  positioning: { ...prev.positioning, whyUs: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="Reasons customers should choose you over competitors..."
                              />
                            </div>
                          </CardContent>
                        )}
                      </Card>

                      {/* Outreach Section */}
                      <Card>
                        <CardHeader 
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setOrgIntelligenceExpanded(orgIntelligenceExpanded === 'outreach' ? null : 'outreach')}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <PhoneCall className="h-5 w-5 text-cyan-500" />
                              <CardTitle className="text-base">Outreach Guidance</CardTitle>
                            </div>
                            <ChevronDown className={`h-5 w-5 transition-transform ${orgIntelligenceExpanded === 'outreach' ? 'rotate-180' : ''}`} />
                          </div>
                          <CardDescription>Email angles, call openers, and objection handling</CardDescription>
                        </CardHeader>
                        {orgIntelligenceExpanded === 'outreach' && (
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <Label>Email Angles / Hooks (one per line)</Label>
                              <Textarea
                                rows={3}
                                value={(orgIntelligence.outreach?.emailAngles || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  outreach: { ...prev.outreach, emailAngles: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="Effective email subject lines and opening hooks..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Call Openers (one per line)</Label>
                              <Textarea
                                rows={3}
                                value={(orgIntelligence.outreach?.callOpeners || []).join('\n')}
                                onChange={(e) => setOrgIntelligence((prev: any) => ({
                                  ...prev,
                                  outreach: { ...prev.outreach, callOpeners: e.target.value.split('\n').filter(Boolean) }
                                }))}
                                placeholder="Effective ways to open sales calls..."
                              />
                            </div>
                          </CardContent>
                        )}
                      </Card>

                      {/* Save Button */}
                      <div className="flex justify-end">
                        <Button 
                          onClick={handleSaveOrgIntelligence}
                          disabled={saveOrgIntelMutation.isPending}
                          size="lg"
                        >
                          {saveOrgIntelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Save Organization Intelligence
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="compliance" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Compliance Settings
                    </CardTitle>
                    <CardDescription>
                      Configure email unsubscribe and compliance settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Custom Unsubscribe URL</Label>
                      <Input
                        placeholder="https://yourdomain.com/unsubscribe"
                        value={businessProfile?.customUnsubscribeUrl || ''}
                        onChange={(e) => setBusinessProfile((prev: any) => ({ ...prev, customUnsubscribeUrl: e.target.value }))}
                      />
                      <p className="text-sm text-muted-foreground">
                        If set, this URL will be used in email footers instead of the default unsubscribe link
                      </p>
                    </div>

                    <div className="p-4 rounded-lg border bg-muted/30">
                      <h4 className="font-medium mb-2">Email Footer Preview</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>{businessProfile?.legalBusinessName || 'Your Company Name'}</p>
                        <p>{businessProfile?.streetAddress || '123 Business St'}</p>
                        <p>
                          {businessProfile?.city || 'City'}, {businessProfile?.state || 'ST'} {businessProfile?.postalCode || '00000'}
                        </p>
                        <p className="text-blue-600 underline cursor-pointer">
                          {businessProfile?.customUnsubscribeUrl ? 'Unsubscribe' : 'Unsubscribe from this list'}
                        </p>
                      </div>
                    </div>

                    <Button 
                      className="mt-4" 
                      onClick={handleSaveBusinessProfile}
                      disabled={saveBusinessProfileMutation.isPending}
                    >
                      {saveBusinessProfileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Compliance Settings
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="integrations" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Puzzle className="h-5 w-5" />
                      Integrations
                    </CardTitle>
                    <CardDescription>
                      Connect third-party services
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <Puzzle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No integrations available yet.</p>
                      <p className="text-sm">Contact your account manager for custom integrations.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
      </div>
      {/* End Main Content Area */}

      {/* ==================== DIALOGS ==================== */}

      {/* Campaign creation dialog is handled by showCreateDialog */}

      {/* Request Additional Leads Dialog */}
      <RequestLeadsDialog
        open={showRequestLeadsDialog}
        onClose={closeRequestLeadsDialog}
        campaigns={campaigns}
        preselectedCampaignId={selectedCampaignForRequest}
      />

      {/* Create Project / Campaign Request Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create New Campaign Request</DialogTitle>
            <DialogDescription>
              Set up a new campaign request. You can attach assets and specify budget.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name *</Label>
              <Input
                id="name"
                placeholder="e.g. Q4 Marketing Outreach"
                value={newProject.name}
                onChange={(e) => setNewProject(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description (Target Audience, Goals)</Label>
              <Textarea
                id="description"
                placeholder="Describe your ideal customer profile and campaign goals..."
                value={newProject.description}
                onChange={(e) => setNewProject(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectType">Project Type</Label>
              <Select
                value={newProject.projectType}
                onValueChange={(value: 'call_campaign' | 'email_campaign' | 'data_enrichment' | 'verification' | 'combo' | 'custom') =>
                  setNewProject(prev => ({ ...prev, projectType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call_campaign">Call Campaign</SelectItem>
                  <SelectItem value="email_campaign">Email Campaign</SelectItem>
                  <SelectItem value="data_enrichment">Data Enrichment</SelectItem>
                  <SelectItem value="verification">Verification</SelectItem>
                  <SelectItem value="combo">Combined (Multi-channel)</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="requestedLeads">Number of Leads Needed</Label>
                <div className="relative">
                  <Users className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="requestedLeads"
                    type="number"
                    className="pl-9"
                    placeholder="e.g. 500"
                    value={newProject.requestedLeads}
                    onChange={(e) => setNewProject(prev => ({ ...prev, requestedLeads: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="landingPage">Landing Page URL</Label>
                <div className="relative">
                   <LinkIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                   <Input 
                      id="landingPage" 
                      className="pl-9"
                      placeholder="https://example.com"
                      value={newProject.landingPageUrl} 
                      onChange={(e) => setNewProject(prev => ({ ...prev, landingPageUrl: e.target.value }))}
                   />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Project Files (Assets/list/Briefs)</Label>
               <div className="flex items-center gap-4">
                  <Button variant="outline" className="relative cursor-pointer" disabled={isUploading}>
                    {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {isUploading ? 'Uploading...' : 'Upload File'}
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                  </Button>
                  {newProject.fileName && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {newProject.fileName}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => setNewProject(prev => ({ ...prev, projectFileUrl: '', fileName: '' }))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
               </div>
               <p className="text-xs text-muted-foreground">Upload any relevant documents (PDF, Excel, Images).</p>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateProject} disabled={createProjectMutation.isPending || isUploading}>
              {createProjectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Work Order Request Dialog */}
      <Dialog open={showWorkOrderDialog} onOpenChange={setShowWorkOrderDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle>Submit Work Order Request</DialogTitle>
                <DialogDescription>
                  Request our team to run a campaign on your behalf
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="wo-campaignType">Campaign Type *</Label>
              <Select
                value={newWorkOrder.campaignType}
                onValueChange={(val: 'call_campaign' | 'email_campaign' | 'combined' | 'data_enrichment' | 'custom') =>
                  setNewWorkOrder(prev => ({ ...prev, campaignType: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call_campaign">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-violet-500" />
                      Call Campaign
                    </div>
                  </SelectItem>
                  <SelectItem value="email_campaign">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-500" />
                      Email Campaign
                    </div>
                  </SelectItem>
                  <SelectItem value="combined">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-green-500" />
                      Combined (Multi-channel)
                    </div>
                  </SelectItem>
                  <SelectItem value="data_enrichment">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-amber-500" />
                      Data Enrichment
                    </div>
                  </SelectItem>
                  <SelectItem value="custom">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-gray-500" />
                      Custom Request
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wo-goals">Campaign Goals *</Label>
              <Textarea
                id="wo-goals"
                placeholder="Describe what you want to achieve with this campaign (e.g., schedule demos with IT decision makers, generate qualified leads for enterprise software...)"
                value={newWorkOrder.campaignGoals}
                onChange={(e) => setNewWorkOrder(prev => ({ ...prev, campaignGoals: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wo-leads">Required Number of Leads</Label>
                <div className="relative">
                  <Users className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="wo-leads"
                    type="text"
                    className="pl-9"
                    placeholder="e.g. 500"
                    value={newWorkOrder.requiredLeads}
                    onChange={(e) => setNewWorkOrder(prev => ({ ...prev, requiredLeads: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wo-priority">Priority</Label>
                <Select
                  value={newWorkOrder.priority}
                  onValueChange={(val: 'low' | 'normal' | 'high' | 'urgent') =>
                    setNewWorkOrder(prev => ({ ...prev, priority: val }))
                  }
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wo-timeline">Desired Timeline</Label>
                <div className="relative">
                  <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="wo-timeline"
                    className="pl-9"
                    placeholder="e.g. 2 weeks, 1 month"
                    value={newWorkOrder.desiredTimeline}
                    onChange={(e) => setNewWorkOrder(prev => ({ ...prev, desiredTimeline: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wo-deadline">Deadline</Label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="wo-deadline"
                    type="date"
                    className="pl-9"
                    value={newWorkOrder.deadline}
                    onChange={(e) => setNewWorkOrder(prev => ({ ...prev, deadline: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wo-instructions">Additional Instructions</Label>
              <Textarea
                id="wo-instructions"
                placeholder="Any specific requirements, target industries, geographic focus, exclusions, or other details our team should know..."
                value={newWorkOrder.additionalInstructions}
                onChange={(e) => setNewWorkOrder(prev => ({ ...prev, additionalInstructions: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkOrderDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => {
                toast({ title: 'Work Order Submitted', description: 'Your request has been submitted. Our team will review it shortly.' });
                setShowWorkOrderDialog(false);
                setNewWorkOrder({
                  campaignType: '' as 'call_campaign' | 'email_campaign' | 'combined' | 'data_enrichment' | 'custom',
                  campaignGoals: '',
                  requiredLeads: '',
                  desiredTimeline: '',
                  deadline: '',
                  additionalInstructions: '',
                  priority: 'normal',
                });
              }}
              disabled={!newWorkOrder.campaignType || !newWorkOrder.campaignGoals}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            >
              <Send className="h-4 w-4 mr-2" />
              Submit Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Self-Service Campaign Creator Wizard */}
      <Dialog open={showCampaignCreator} onOpenChange={(open) => { setShowCampaignCreator(open); if (!open) setCampaignCreatorStep(1); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Target className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle>Create New Campaign</DialogTitle>
                <DialogDescription>
                  Step {campaignCreatorStep} of 4 — {campaignCreatorStep === 1 ? 'Campaign Basics' : campaignCreatorStep === 2 ? 'Talking Points & Context' : campaignCreatorStep === 3 ? 'AI Configuration' : 'Audience Selection'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Progress Indicator */}
          <div className="flex items-center justify-between px-2 py-4">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  campaignCreatorStep >= step 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                }`}>
                  {campaignCreatorStep > step ? <CheckCircle className="h-4 w-4" /> : step}
                </div>
                {step < 4 && (
                  <div className={`w-16 h-1 mx-2 rounded ${
                    campaignCreatorStep > step ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            ))}
          </div>

          <div className="space-y-5 py-4">
            {/* Step 1: Campaign Basics */}
            {campaignCreatorStep === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="camp-name">Campaign Name *</Label>
                  <Input
                    id="camp-name"
                    placeholder="e.g. Q1 Enterprise Outreach"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="camp-objectives">Campaign Objectives *</Label>
                  <Textarea
                    id="camp-objectives"
                    placeholder="What do you want to achieve with this campaign? (e.g., Generate qualified demos, schedule meetings with IT directors, introduce new product to existing customers...)"
                    value={newCampaign.objectives}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, objectives: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="camp-criteria">Success Criteria</Label>
                  <Textarea
                    id="camp-criteria"
                    placeholder="How will you measure success? (e.g., 50+ qualified leads, 20% response rate, 10 booked demos per week...)"
                    value={newCampaign.successCriteria}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, successCriteria: e.target.value }))}
                    rows={2}
                  />
                </div>
              </>
            )}

            {/* Step 2: Talking Points & Context */}
            {campaignCreatorStep === 2 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="camp-talking">Talking Points *</Label>
                  <Textarea
                    id="camp-talking"
                    placeholder="Key messages the AI should convey:&#10;• Main value proposition&#10;• Key differentiators&#10;• Call-to-action&#10;• Objection handling points"
                    value={newCampaign.talkingPoints}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, talkingPoints: e.target.value }))}
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground">Include key messages, value propositions, and objection handling points.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="camp-context">Campaign Context</Label>
                  <Textarea
                    id="camp-context"
                    placeholder="Additional context for the AI:&#10;• Industry background&#10;• Product/service details&#10;• Target audience characteristics&#10;• Competitive landscape"
                    value={newCampaign.context}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, context: e.target.value }))}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">Provide background information to help the AI understand your offering.</p>
                </div>
              </>
            )}

            {/* Step 3: AI Configuration */}
            {campaignCreatorStep === 3 && (
              <>
                <div className="space-y-3">
                  <Label>Select AI Agent</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'professional', name: 'Professional Agent', desc: 'Formal, business-focused communication', icon: Briefcase },
                      { id: 'friendly', name: 'Friendly Agent', desc: 'Warm, conversational approach', icon: Smile },
                      { id: 'technical', name: 'Technical Expert', desc: 'Detailed, solution-oriented', icon: Cpu },
                      { id: 'executive', name: 'Executive Outreach', desc: 'C-suite focused messaging', icon: Crown },
                    ].map((agent) => (
                      <Card 
                        key={agent.id}
                        className={`cursor-pointer transition-all hover:border-purple-300 ${
                          newCampaign.selectedAgentId === agent.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20' : ''
                        }`}
                        onClick={() => setNewCampaign(prev => ({ ...prev, selectedAgentId: agent.id }))}
                      >
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            newCampaign.selectedAgentId === agent.id ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-gray-100 dark:bg-gray-800'
                          }`}>
                            <agent.icon className={`h-5 w-5 ${newCampaign.selectedAgentId === agent.id ? 'text-purple-600' : 'text-gray-500'}`} />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{agent.name}</p>
                            <p className="text-xs text-muted-foreground">{agent.desc}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>Select AI Voice</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'sarah', name: 'Sarah', gender: 'Female', accent: 'American' },
                      { id: 'james', name: 'James', gender: 'Male', accent: 'American' },
                      { id: 'emma', name: 'Emma', gender: 'Female', accent: 'British' },
                      { id: 'michael', name: 'Michael', gender: 'Male', accent: 'British' },
                      { id: 'sofia', name: 'Sofia', gender: 'Female', accent: 'Neutral' },
                      { id: 'david', name: 'David', gender: 'Male', accent: 'Neutral' },
                    ].map((voice) => (
                      <Card 
                        key={voice.id}
                        className={`cursor-pointer transition-all hover:border-purple-300 ${
                          newCampaign.selectedVoiceId === voice.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20' : ''
                        }`}
                        onClick={() => setNewCampaign(prev => ({ ...prev, selectedVoiceId: voice.id }))}
                      >
                        <CardContent className="p-3 text-center">
                          <div className={`h-10 w-10 rounded-full mx-auto mb-2 flex items-center justify-center ${
                            newCampaign.selectedVoiceId === voice.id ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-gray-100 dark:bg-gray-800'
                          }`}>
                            <Mic className={`h-5 w-5 ${newCampaign.selectedVoiceId === voice.id ? 'text-purple-600' : 'text-gray-500'}`} />
                          </div>
                          <p className="font-medium text-sm">{voice.name}</p>
                          <p className="text-xs text-muted-foreground">{voice.gender} • {voice.accent}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    <Volume2 className="h-4 w-4 mr-2" />
                    Preview Selected Voice
                  </Button>
                </div>
              </>
            )}

            {/* Step 4: Audience Selection */}
            {campaignCreatorStep === 4 && (
              <>
                <div className="space-y-3">
                  <Label>Audience Source</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Card 
                      className={`cursor-pointer transition-all hover:border-purple-300 ${
                        newCampaign.audienceType === 'own' ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20' : ''
                      }`}
                      onClick={() => setNewCampaign(prev => ({ ...prev, audienceType: 'own' }))}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            newCampaign.audienceType === 'own' ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-gray-100 dark:bg-gray-800'
                          }`}>
                            <Users className={`h-5 w-5 ${newCampaign.audienceType === 'own' ? 'text-purple-600' : 'text-gray-500'}`} />
                          </div>
                          <div>
                            <p className="font-semibold">My CRM Contacts</p>
                            <p className="text-xs text-muted-foreground">Use accounts & contacts from your CRM</p>
                          </div>
                        </div>
                        {newCampaign.audienceType === 'own' && (
                          <div className="pt-3 border-t space-y-2">
                            <p className="text-xs font-medium">Select from your accounts and contacts in the CRM tab.</p>
                            <Badge variant="outline" className="bg-purple-50">0 contacts selected</Badge>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card 
                      className={`cursor-pointer transition-all hover:border-orange-300 ${
                        newCampaign.audienceType === 'managed' ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : ''
                      }`}
                      onClick={() => setNewCampaign(prev => ({ ...prev, audienceType: 'managed' }))}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            newCampaign.audienceType === 'managed' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-gray-800'
                          }`}>
                            <ClipboardList className={`h-5 w-5 ${newCampaign.audienceType === 'managed' ? 'text-orange-600' : 'text-gray-500'}`} />
                          </div>
                          <div>
                            <p className="font-semibold">Managed Audience</p>
                            <p className="text-xs text-muted-foreground">Request our team to source leads</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {newCampaign.audienceType === 'managed' && (
                  <div className="space-y-2 pt-4">
                    <Label htmlFor="managed-audience">Describe Your Target Audience</Label>
                    <Textarea
                      id="managed-audience"
                      placeholder="Describe your ideal customer profile:&#10;• Industry/verticals&#10;• Company size&#10;• Job titles/roles&#10;• Geographic focus&#10;• Any exclusions"
                      value={newCampaign.managedAudienceRequest}
                      onChange={(e) => setNewCampaign(prev => ({ ...prev, managedAudienceRequest: e.target.value }))}
                      rows={5}
                    />
                    <p className="text-xs text-muted-foreground">Our team will source leads matching your criteria.</p>
                  </div>
                )}

                {newCampaign.audienceType === 'own' && (
                  <Card className="border-dashed bg-slate-50 dark:bg-slate-900">
                    <CardContent className="p-6 text-center">
                      <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground mb-3">
                        Select contacts from your CRM to include in this campaign
                      </p>
                      <Button variant="outline" onClick={() => { setActiveTab('crm'); setShowCampaignCreator(false); }}>
                        Go to CRM to Select Contacts
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              {campaignCreatorStep > 1 && (
                <Button variant="outline" onClick={() => setCampaignCreatorStep(prev => prev - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowCampaignCreator(false); setCampaignCreatorStep(1); }}>Cancel</Button>
              {campaignCreatorStep < 4 ? (
                <Button 
                  onClick={() => setCampaignCreatorStep(prev => prev + 1)}
                  disabled={
                    (campaignCreatorStep === 1 && (!newCampaign.name || !newCampaign.objectives)) ||
                    (campaignCreatorStep === 2 && !newCampaign.talkingPoints)
                  }
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  Next Step
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={() => {
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
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create Campaign
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Support Dialog */}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Support Request</DialogTitle>
            <DialogDescription>
              Describe your issue and we'll get back to you as soon as possible
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject</Label>
              <Input placeholder="Brief description of your issue" />
            </div>
            <div>
              <Label>Category</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billing">Billing & Payments</SelectItem>
                  <SelectItem value="delivery">Lead Delivery</SelectItem>
                  <SelectItem value="quality">Data Quality</SelectItem>
                  <SelectItem value="technical">Technical Issue</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea placeholder="Provide details about your issue..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSupportDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast({ title: 'Support request submitted! We\'ll respond within 24 hours.' });
              setShowSupportDialog(false);
            }}>
              <Send className="h-4 w-4 mr-2" />
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Drawer */}
      <Dialog open={showLeadDrawer} onOpenChange={setShowLeadDrawer}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
            <DialogDescription>
              Comprehensive information for this delivered lead
            </DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-6">
              {/* Contact Information */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Full Name</Label>
                    <p className="font-medium">{selectedLead.firstName} {selectedLead.lastName}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Title</Label>
                    <p className="font-medium">{selectedLead.title || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Company</Label>
                    <p className="font-medium">{selectedLead.company || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="font-medium text-blue-600">{selectedLead.email}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <p className="font-medium">{selectedLead.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">LinkedIn</Label>
                    {selectedLead.linkedin ? (
                      <a href={selectedLead.linkedin} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                        View Profile
                      </a>
                    ) : (
                      <p className="font-medium">N/A</p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Campaign Information */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Campaign & Delivery</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Campaign Name</Label>
                    <p className="font-medium">{selectedLead.campaignName || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Order Date</Label>
                    <p className="font-medium">{new Date(selectedLead.orderDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Contact Status</Label>
                    <Badge variant="default" className="mt-1">Approved</Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Verification</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">Verified</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Additional Notes */}
              {selectedLead.notes && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notes</h3>
                    <p className="text-sm text-muted-foreground">{selectedLead.notes}</p>
                  </div>
                  <Separator />
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
                <Button className="flex-1" variant="outline">
                  <Phone className="h-4 w-4 mr-2" />
                  Call Contact
                </Button>
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in CRM
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeadDrawer(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Qualified Lead Detail Modal - Enhanced with Comments */}
      <EnhancedLeadDetailModal
        leadId={selectedQualifiedLeadId}
        open={!!selectedQualifiedLeadId}
        onClose={() => setSelectedQualifiedLeadId(null)}
      />

      {/* Export Leads Dialog */}
      <ExportLeadsDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />

      {/* Unified Simulation Studio Panel
          Single entry point for all simulation: Voice, Text, Email
          Supports multiple voice personas (male/female) with proper context awareness
      */}
      <CampaignSimulationPanel
        open={showSimulationPanel}
        onOpenChange={setShowSimulationPanel}
        campaignId={selectedCampaignForSimulation}
      />

      {/* AI Reports Panel */}
      <AgenticReportsPanel
        open={showReportsPanel}
        onOpenChange={setShowReportsPanel}
      />

      {/* Campaign Order Panel */}
      <AgenticCampaignOrderPanel
        open={showOrderPanel}
        onOpenChange={setShowOrderPanel}
        onOrderCreated={() => {
          // Optionally refresh data after order creation
          queryClient.invalidateQueries({ queryKey: ['client-campaigns'] });
        }}
      />

      {/* Email Template Builder - Same structure as main email campaigns */}
      <ClientEmailTemplateBuilder
        open={showEmailGenerator}
        onOpenChange={setShowEmailGenerator}
      />

      {/* AI Agent Panel - Opens from sidebar */}
      <ClientAgentPanel
        open={showAgentChat}
        onOpenChange={setShowAgentChat}
        onNavigate={setActiveTab}
      />

      {/* AI Agent Button - Floating assistant */}
      <ClientAgentButton onNavigate={setActiveTab} />

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrgDialog} onOpenChange={setShowCreateOrgDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Create Organization
            </DialogTitle>
            <DialogDescription>
              Set up your organization to power AI agents with your business context.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name *</Label>
              <Input
                id="org-name"
                placeholder="Your Company Name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-domain">Website Domain</Label>
              <Input
                id="org-domain"
                placeholder="yourcompany.com"
                value={newOrgDomain}
                onChange={(e) => setNewOrgDomain(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-industry">Industry</Label>
              <Input
                id="org-industry"
                placeholder="e.g., Technology, Healthcare, Finance"
                value={newOrgIndustry}
                onChange={(e) => setNewOrgIndustry(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOrgDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateOrganization}
              disabled={createOrgMutation.isPending || !newOrgName.trim()}
            >
              {createOrgMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
