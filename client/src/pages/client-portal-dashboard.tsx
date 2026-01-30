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
  Link as LinkIcon, Upload, Trash2, Mic, ShoppingCart, FileEdit, TestTube
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
} from '@/components/client-portal/campaigns';
import { CampaignSimulationPanel } from '@/components/client-portal/simulation/campaign-simulation-panel';
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
  
  // Project Creation State
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

  // Mutations
  const createProjectMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      description?: string; 
      requestedLeadCount?: number;
      landingPageUrl?: string;
      projectFileUrl?: string;
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
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
    { id: 'campaigns', label: 'My Campaigns', icon: Target, color: 'from-purple-500 to-pink-500' },
    { id: 'leads', label: 'Leads', icon: UserCheck, color: 'from-green-500 to-emerald-500' },
    { id: 'billing', label: 'Billing', icon: Receipt, color: 'from-indigo-500 to-purple-500' },
    { id: 'support', label: 'Support', icon: Headphones, color: 'from-slate-500 to-slate-600' },
  ];

  // AI Agent Tools - campaign-level features
  const aiAgentTools = [
    { id: 'simulate', label: 'Test AI Agent', icon: TestTube, color: 'from-violet-500 to-purple-500', description: 'Simulate calls with your campaign AI', onClick: () => setShowSimulationPanel(true) },
    { id: 'ai-reports', label: 'Campaign Reports', icon: BarChart3, color: 'from-amber-500 to-orange-500', description: 'AI-powered campaign analytics', onClick: () => setShowReportsPanel(true) },
    { id: 'email-gen', label: 'Email Templates', icon: Mail, color: 'from-blue-500 to-cyan-500', description: 'Generate campaign emails', onClick: () => setShowEmailGenerator(true) },
    { id: 'order', label: 'New Campaign', icon: ShoppingCart, color: 'from-green-500 to-emerald-500', description: 'Order a new campaign', onClick: () => setShowOrderPanel(true) },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      {/* Enterprise Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-300 ease-in-out fixed h-full z-50`}>
        {/* Workspace Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <h1 className="font-bold text-sm leading-none truncate">Client Portal</h1>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user.clientAccountName}</p>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(true)} className="h-8 w-8">
                <ChevronDown className="h-4 w-4 rotate-90" />
              </Button>
            )}
          </div>
          {sidebarCollapsed && (
            <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(false)} className="w-full mt-2 h-8">
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group relative ${
                activeTab === item.id
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
              }`}
            >
              {activeTab === item.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full" />
              )}
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                activeTab === item.id ? `bg-gradient-to-br ${item.color}` : 'bg-slate-100 dark:bg-slate-700'
              }`}>
                <item.icon className={`h-4 w-4 ${activeTab === item.id ? 'text-white' : 'text-slate-600 dark:text-slate-400'}`} />
              </div>
              {!sidebarCollapsed && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </button>
          ))}

          {/* AI Agent Hub Section */}
          {!sidebarCollapsed && (
            <div className="pt-4 pb-2">
              <div className="flex items-center gap-2 px-3">
                <Bot className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Agent Hub</span>
              </div>
              <p className="text-[10px] text-muted-foreground px-3 mt-1">Campaign-level AI tools</p>
            </div>
          )}

          {/* AI Agent Tools */}
          {aiAgentTools.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group text-slate-700 dark:text-slate-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-200"
              title={item.description}
            >
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${item.color} shadow-sm`}>
                <item.icon className="h-4 w-4 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 text-left">
                  <span className="text-sm font-medium truncate block">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground truncate block">{item.description}</span>
                </div>
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
          <div className="space-y-6">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Welcome back, {user.firstName}!</h2>
                  <p className="text-blue-100 mt-1">Here's what's happening with your campaigns today.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setShowOrderPanel(true)} className="gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Order Campaign
                  </Button>
                  <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => setShowSimulationPanel(true)}>
                    <Mic className="h-4 w-4 mr-2" />
                    Voice Simulation
                  </Button>
                  <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => setShowReportsPanel(true)}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Reports
                  </Button>
                  <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => setActiveTab('support')}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Contact Team
                  </Button>
                </div>
              </div>
            </div>

            {/* Enterprise KPI Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Leads Delivered MTD */}
              <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-green-500">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <UserCheck className="h-4 w-4 text-green-600" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Leads MTD</p>
                      </div>
                      <p className="text-3xl font-bold text-foreground">{leadsDeliveredMTD.toLocaleString()}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30">
                          <ArrowUpRight className="h-3 w-3 text-green-600" />
                          <span className="text-xs font-semibold text-green-700 dark:text-green-500">+{Math.round((leadsDeliveredMTD / Math.max(totalLeadsDelivered - leadsDeliveredMTD, 1)) * 100)}%</span>
                        </div>
                        <span className="text-xs text-muted-foreground">vs last month</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Acceptance Rate */}
              <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="h-4 w-4 text-blue-600" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Accept Rate</p>
                      </div>
                      <p className="text-3xl font-bold text-foreground">{acceptanceRate}%</p>
                      <div className="mt-2">
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-500"
                            style={{ width: `${acceptanceRate}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Industry avg: 78%</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* CPL */}
              <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-purple-500">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <DollarSign className="h-4 w-4 text-purple-600" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg CPL</p>
                      </div>
                      <p className="text-3xl font-bold text-foreground">{formatCurrency(averageCPL)}</p>
                      <div className="flex items-center gap-1 mt-2">
                        <span className="text-xs text-muted-foreground">vs</span>
                        <span className="text-xs font-semibold text-muted-foreground line-through">$65.00</span>
                        <span className="text-xs text-green-600 font-semibold">23% lower</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Active Campaigns */}
              <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-indigo-500">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-indigo-600" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active</p>
                      </div>
                      <p className="text-3xl font-bold text-foreground">{activeCampaigns}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {campaigns.length} total • {pendingOrders} pending
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Next Invoice */}
              <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-amber-500">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-4 w-4 text-amber-600" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next Invoice</p>
                      </div>
                      <p className="text-lg font-bold text-foreground">{nextInvoiceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {unpaidInvoices > 0 ? `${formatCurrency(unpaidInvoices)} pending` : 'No pending invoices'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Agentic Quick Actions */}
            <Card className="border-2 border-dashed border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">AI-Powered Tools</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Leverage AI to supercharge your campaign management</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2 hover:bg-white hover:shadow-md transition-all border-violet-200 hover:border-violet-400"
                        onClick={() => setShowSimulationPanel(true)}
                      >
                        <Mic className="h-3.5 w-3.5 text-violet-600" />
                        Voice Simulation
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2 hover:bg-white hover:shadow-md transition-all border-green-200 hover:border-green-400"
                        onClick={() => setShowOrderPanel(true)}
                      >
                        <ShoppingCart className="h-3.5 w-3.5 text-green-600" />
                        Order Campaign
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2 hover:bg-white hover:shadow-md transition-all border-amber-200 hover:border-amber-400"
                        onClick={() => setShowReportsPanel(true)}
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-amber-600" />
                        AI Reports
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2 hover:bg-white hover:shadow-md transition-all border-blue-200 hover:border-blue-400"
                        onClick={() => setShowEmailGenerator(true)}
                      >
                        <Mail className="h-3.5 w-3.5 text-blue-600" />
                        Email Generator
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Lead Delivery Trend</CardTitle>
                  <CardDescription>Monthly leads and verification stats</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={deliveryTrendData}>
                        <defs>
                          <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorVerified" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip />
                        <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#colorLeads)" name="Leads" />
                        <Area type="monotone" dataKey="verified" stroke="#10b981" fill="url(#colorVerified)" name="Verified" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Campaign Performance</CardTitle>
                  <CardDescription>Top campaigns by delivery</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={campaignPerformance} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                        <Tooltip />
                        <Bar dataKey="delivered" fill="#3b82f6" name="Delivered" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
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
                      <Button variant="link" onClick={() => setShowCreateDialog(true)}>
                        Create your first campaign
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
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Campaigns & Orders</h2>
                <p className="text-muted-foreground">Manage your campaigns, track progress, and view orders.</p>
              </div>
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                <Plus className="h-4 w-4" />
                Request Campaign
              </Button>
            </div>

            {/* Campaign Filters */}
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
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
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="delivering">Delivering</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={campaignTypeFilter} onValueChange={(val) => setCampaignTypeFilter(val)}>
                    <SelectTrigger className="w-full md:w-[180px] bg-white dark:bg-gray-950">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="voice">Voice Campaigns</SelectItem>
                      <SelectItem value="data">Data Only</SelectItem>
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

            {/* Campaign Requests (Projects) */}
            <div className="space-y-4">
               <h3 className="text-lg font-semibold flex items-center gap-2">
                 <Target className="h-5 w-5 text-primary" />
                 Campaign Requests
                 {filteredProjects.length > 0 && (
                   <Badge variant="secondary" className="ml-2">{filteredProjects.length}</Badge>
                 )}
               </h3>
               {projectsLoading ? (
                 <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
               ) : filteredProjects.length === 0 ? (
                 <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-8">
                       <p className="text-muted-foreground mb-4">
                         {projects.length === 0 ? 'No pending campaign requests.' : 'No campaigns match your filters.'}
                       </p>
                       {projects.length === 0 && (
                         <Button variant="outline" onClick={() => setShowCreateDialog(true)}>Create One</Button>
                       )}
                    </CardContent>
                 </Card>
               ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Leads</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProjects.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell>
                            <div className="font-medium">{project.name}</div>
                            {project.landingPageUrl && (
                              <a 
                                href={project.landingPageUrl} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <LinkIcon className="h-3 w-3" />
                                Landing Page
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[250px]">
                            <p className="text-sm text-muted-foreground truncate">
                              {project.description || "No description"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              {project.requestedLeadCount || '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={project.status === 'active' ? 'default' : 'secondary'}
                              className={
                                project.status === 'completed' ? 'bg-green-100 text-green-800' :
                                project.status === 'active' ? 'bg-blue-100 text-blue-800' :
                                project.status === 'approved' ? 'bg-purple-100 text-purple-800' :
                                project.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }
                            >
                              {project.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(project.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {project.status !== 'completed' && project.status !== 'delivered' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteProject(project.id, project.name)}
                                disabled={deleteProjectMutation.isPending}
                              >
                                {deleteProjectMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
               )}
            </div>

            <Separator />

            {/* Campaigns */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                Campaigns
                {filteredCampaigns.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{filteredCampaigns.length}</Badge>
                )}
              </h3>
              {campaignsLoading ? (
                 <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
              ) : filteredCampaigns.length === 0 ? (
                 <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-8">
                       <p className="text-muted-foreground">
                         {campaigns.length === 0 ? 'No active campaigns yet.' : 'No campaigns match your filters.'}
                       </p>
                       {campaigns.length === 0 && (
                         <p className="text-xs text-muted-foreground mt-1">Campaigns become active once approved.</p>
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

      {/* Voice Simulation Panel */}
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
    </div>
  );
}
