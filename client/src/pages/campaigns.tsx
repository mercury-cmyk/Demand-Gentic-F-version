import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, Phone, Plus, BarChart, Settings, Play, Pause, Edit, Trash2,
  MoreVertical, Zap, Search, ArrowUpRight, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Bot, Users, Mic, Globe, Archive, Copy, Send, RotateCcw
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatCard } from "@/components/shared/stat-card";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import { Progress } from "@/components/ui/progress";
import { CampaignPerformanceSnapshot, type CampaignPerformanceSnapshotData } from "@/components/campaigns/campaign-performance-snapshot";
import { PhoneCampaignPanel, type QueueStats } from "@/components/campaigns/phone-campaign-panel";
import { EmailCampaignPanel, type EmailStats } from "@/components/campaigns/email-campaign-panel";
import { AgentAssignmentDialog } from "@/components/campaigns/agent-assignment-dialog";
import { VoiceSelectionDialog } from "@/components/campaigns/voice-selection-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
// CampaignCreationWizard removed - now using telemarketing wizard page

export default function CampaignsPage() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const typeFromUrl = searchParams.get('type');

  const [activeTab, setActiveTab] = useState(typeFromUrl === 'phone' ? 'call' : typeFromUrl === 'email' ? 'email' : 'all');
  const [, setLocation] = useLocation();
  const { getToken, token, user } = useAuth();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "completed" | "cancelled" | "draft">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"live" | "archived">("live");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string | number>>(new Set());
  const [assignAgentsDialogOpen, setAssignAgentsDialogOpen] = useState(false);
  const [selectedCampaignForAgents, setSelectedCampaignForAgents] = useState<any>(null);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [selectedCampaignForVoice, setSelectedCampaignForVoice] = useState<any>(null);
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const rawRoles = (user as any)?.roles ?? user?.role;
  const roleList = Array.isArray(rawRoles) ? rawRoles : rawRoles ? [rawRoles] : [];
  const normalizedRoles = roleList
    .flatMap((role) => (typeof role === 'string' ? role.split(/[,\s]+/) : []))
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
  const isClientUser = normalizedRoles.includes('client_user');
  const canManageCampaigns = normalizedRoles.some((role) => role === 'admin' || role === 'campaign_manager');
  const canSelectVoice = canManageCampaigns || isClientUser;

  // Sync tab with URL parameter
  useEffect(() => {
    if (typeFromUrl === 'phone') {
      setActiveTab('call');
    } else if (typeFromUrl === 'email') {
      setActiveTab('email');
    }
  }, [typeFromUrl]);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const token = getToken();
      const response = await fetch(`/api/campaigns`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      if (!response.ok) throw new Error("Failed to fetch campaigns");
      return response.json();
    },
  });

  const phoneCampaignTypesForSnapshot = [
    'call', 'telemarketing', 'combo', 'sql',
    'content_syndication', 'appointment_generation', 'high_quality_leads',
    'live_webinar', 'on_demand_webinar', 'executive_dinner',
    'leadership_forum', 'conference'
  ];

  const { data: campaignSnapshots = {}, isLoading: snapshotsLoading } = useQuery<Record<string, CampaignPerformanceSnapshotData>>({
    queryKey: ["/api/campaigns", "batch-stats", campaigns.map((campaign: any) => campaign.id).join(",")],
    queryFn: async () => {
      const token = getToken();

      // Build type map for each campaign
      const types: Record<string, { isCall: boolean; isEmail: boolean }> = {};
      const campaignIds: string[] = [];
      for (const campaign of campaigns as any[]) {
        campaignIds.push(campaign.id);
        types[campaign.id] = {
          isEmail: campaign.type === "email" || campaign.type === "combo",
          isCall: phoneCampaignTypesForSnapshot.includes(campaign.type) || campaign.dialMode === 'ai_agent',
        };
      }

      // Single batch request instead of N parallel requests
      const response = await fetch('/api/campaigns/batch-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ campaignIds, types }),
      });

      if (!response.ok) throw new Error('Failed to fetch batch stats');
      const batchData = await response.json();

      // Transform batch response into snapshot format
      const snapshots: Record<string, CampaignPerformanceSnapshotData> = {};
      for (const id of campaignIds) {
        const data = batchData[id] || { call: null, email: null };
        snapshots[id] = {
          email: data.email ? {
            totalRecipients: data.email.totalRecipients || 0,
            delivered: data.email.delivered || 0,
            opens: data.email.opens || 0,
            clicks: data.email.clicks || 0,
            unsubscribes: data.email.unsubscribes || 0,
            spamComplaints: data.email.spamComplaints || 0,
          } : null,
          call: data.call ? {
            contactsInQueue: data.call.contactsInQueue || 0,
            callsMade: data.call.callsMade || 0,
            callsConnected: data.call.callsConnected || 0,
            leadsQualified: data.call.leadsQualified || 0,
            dncRequests: data.call.dncRequests || 0,
            notInterested: data.call.notInterested || 0,
            noAnswer: data.call.noAnswer || 0,
            voicemail: data.call.voicemail || 0,
          } : null,
        };
      }
      return snapshots;
    },
    enabled: campaigns.length > 0,
    refetchInterval: 30000, // Reduced from 15s to 30s to lower server load
    refetchIntervalInBackground: false, // Don't poll when tab is inactive
    staleTime: 20000,
  });

  // Fetch queue stats for phone campaigns (all types that support phone/AI calling)
  const phoneCampaignTypes = [
    'call', 'telemarketing', 'sql',
    'content_syndication', 'appointment_generation', 'high_quality_leads',
    'live_webinar', 'on_demand_webinar', 'executive_dinner',
    'leadership_forum', 'conference'
  ];
  const phoneCampaigns = campaigns.filter((c: any) =>
    phoneCampaignTypes.includes(c.type) || c.dialMode === 'ai_agent'
  );
  const { data: queueStats = {} } = useQuery<Record<string, QueueStats>>({
    queryKey: ["/api/campaigns/queue-stats", phoneCampaigns.map((c: any) => c.id).join(',')],
    queryFn: async () => {
      const stats: Record<string, QueueStats> = {};
      for (const campaign of phoneCampaigns) {
        const [statsRes, suppressionStatsRes] = await Promise.all([
          fetch(`/api/campaigns/${campaign.id}/queue/stats`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Cache-Control': 'no-cache',
            },
          }),
          fetch(`/api/campaigns/${campaign.id}/suppressions/stats`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Cache-Control': 'no-cache',
            },
          })
        ]);
        if (statsRes.ok) {
          const queueStatsData = await statsRes.json();
          const suppressionStats = suppressionStatsRes.ok ? await suppressionStatsRes.json() : null;

          stats[campaign.id] = {
            total: queueStatsData.total || 0,
            queued: queueStatsData.queued || 0,
            inProgress: queueStatsData.inProgress || 0,
            completed: queueStatsData.completed || 0,
            agents: queueStatsData.agents || 0,
            suppression: suppressionStats
          };
        }
      }
      return stats;
    },
    enabled: phoneCampaigns.length > 0 && !!token,
    refetchInterval: 20000, // Reduced from 10s to 20s to lower API load
    refetchIntervalInBackground: false, // Don't poll when tab is inactive
    staleTime: 10000,
  });

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === 'active' ? 'paused' : 'active';
      return await apiRequest('PATCH', `/api/campaigns/${id}`, { status: newStatus });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns/queue-stats"] });
      const newStatus = variables.status === 'active' ? 'paused' : 'active';
      toast({
        title: "Success",
        description: `Campaign ${newStatus === 'active' ? 'resumed' : 'paused'} successfully`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update campaign status",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaignId: number) => {
      const response = await apiRequest("DELETE", `/api/campaigns/${campaignId}`, undefined, { timeout: 120000 });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete campaign");
      }
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign deleted",
        description: "The campaign has been successfully deleted.",
      });
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (campaignId: string | number) => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/clone`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to duplicate campaign");
      }
      return response.json();
    },
    onSuccess: (newCampaign) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign duplicated",
        description: "A draft copy is ready for review and launch.",
      });
      navigateToCampaignEditor(newCampaign);
    },
    onError: (error: Error) => {
      toast({
        title: "Duplicate failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, isArchived }: { id: string | number; isArchived: boolean }) => {
      const response = await apiRequest("PATCH", `/api/campaigns/${id}`, { isArchived });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update campaign archive state");
      }
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: variables.isArchived ? "Campaign archived" : "Campaign restored",
        description: variables.isArchived
          ? "The campaign has been moved out of the live list."
          : "The campaign is back in the live list.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Archive update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const launchMutation = useMutation({
    mutationFn: async (campaignId: string | number) => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/launch`, undefined, { timeout: 120000 });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to launch campaign");
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign launched",
        description: "The draft campaign is now active.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Launch failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Start AI Calls mutation
  const startAiCallsMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await apiRequest("POST", "/api/ai-calls/batch-start", {
        campaignId,
        limit: 10,
        delayBetweenCalls: 3000,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to start AI calls");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "AI Calls Started",
        description: `Started ${data.callsInitiated || 0} AI calls. ${data.skipped || 0} contacts skipped.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Start AI Calls",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStartAiCallsClick = (campaign: any) => {
    if (confirm(`Start AI calls for "${campaign.name}"? Up to 10 contacts will be dialed.`)) {
      startAiCallsMutation.mutate(String(campaign.id));
    }
  };

  const handleDeleteClick = (campaign: any) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  const handleDuplicateClick = (campaign: any) => {
    duplicateMutation.mutate(campaign.id);
  };

  const handleArchiveToggle = (campaign: any) => {
    archiveMutation.mutate({
      id: campaign.id,
      isArchived: !Boolean(campaign.isArchived),
    });
  };

  const handleLaunchClick = (campaign: any) => {
    launchMutation.mutate(campaign.id);
  };

  const navigateToCampaignEditor = (campaign: any) => {
    if (campaign.type === 'call' || campaign.type === 'telemarketing' || campaign.type === 'appointment_generation' || campaign.type === 'content_syndication' || campaign.type === 'high_quality_leads' || campaign.type === 'live_webinar' || campaign.type === 'on_demand_webinar' || campaign.type === 'executive_dinner' || campaign.type === 'leadership_forum' || campaign.type === 'conference' || campaign.type === 'sql') {
      setLocation(`/campaigns/telemarketing/${campaign.id}/edit`);
    } else if (campaign.type === 'email') {
      setLocation(`/campaigns/email/${campaign.id}/edit`);
    } else {
      setLocation(`/campaigns/${campaign.type}/edit/${campaign.id}`);
    }
  };

  const handleDeleteConfirm = () => {
    if (campaignToDelete) {
      deleteMutation.mutate(campaignToDelete.id);
    }
  };

  const handleEditClick = (campaign: any) => {
    navigateToCampaignEditor(campaign);
  };

  const handleCreateLandingPageClick = (campaign: any) => {
    const params = new URLSearchParams();
    params.set("module", "landing-page");
    params.set("campaignId", String(campaign.id));
    if (campaign.problemIntelligenceOrgId) {
      params.set("organizationId", String(campaign.problemIntelligenceOrgId));
    }
    if (campaign.projectId) {
      params.set("clientProjectId", String(campaign.projectId));
    }
    setLocation(`/generative-studio?${params.toString()}`);
  };

  const toggleCampaignExpanded = (campaignId: string | number) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  };

  const handleAssignAgentsClick = (campaign: any) => {
    setSelectedCampaignForAgents(campaign);
    setAssignAgentsDialogOpen(true);
  };

  const handleSelectVoiceClick = (campaign: any) => {
    setSelectedCampaignForVoice(campaign);
    setVoiceDialogOpen(true);
  };

  // All campaign types that support phone/AI calling
  const PHONE_CAMPAIGN_TYPES = [
    'call', 'telemarketing', 'sql',
    'content_syndication', 'appointment_generation', 'high_quality_leads',
    'live_webinar', 'on_demand_webinar', 'executive_dinner',
    'leadership_forum', 'conference'
  ];
  const isPhoneCampaign = (campaign: any) =>
    PHONE_CAMPAIGN_TYPES.includes(campaign.type) || campaign.dialMode === 'ai_agent';
  const isEmailCampaign = (campaign: any) => campaign.type === 'email';

  const liveCampaigns = campaigns.filter((campaign: any) => !campaign.isArchived);
  const archivedCampaigns = campaigns.filter((campaign: any) => Boolean(campaign.isArchived));

  const filteredCampaigns = campaigns
    .filter((c: any) => {
      const matchesVisibility = visibilityFilter === "archived" ? Boolean(c.isArchived) : !c.isArchived;
      const matchesTab = activeTab === "all" ||
        c.type === activeTab ||
        (activeTab === "call" && (PHONE_CAMPAIGN_TYPES.includes(c.type) || c.dialMode === 'ai_agent'));
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesVisibility && matchesTab && matchesStatus && matchesSearch;
    })
    .sort((a: any, b: any) => {
      const statusWeight: Record<string, number> = {
        active: 0,
        paused: 1,
        draft: 2,
        scheduled: 3,
        completed: 4,
        cancelled: 5,
      };
      const statusDelta = (statusWeight[a.status] ?? 99) - (statusWeight[b.status] ?? 99);
      if (statusDelta !== 0) {
        return statusDelta;
      }

      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
      case "paused":
        return "border-amber-200 bg-amber-50 text-amber-700";
      case "completed":
        return "border-sky-200 bg-sky-50 text-sky-700";
      case "draft":
        return "border-slate-200 bg-slate-50 text-slate-700";
      case "cancelled":
        return "border-rose-200 bg-rose-50 text-rose-700";
      case "scheduled":
        return "border-indigo-200 bg-indigo-50 text-indigo-700";
      default:
        return "border-slate-200 bg-slate-50 text-slate-700";
    }
  };

  // Mock AI Insight Generator
  const getCampaignInsight = (campaign: any) => {
    // In a real app, this would come from the backend
    if (campaign.status === 'active') {
      if (campaign.type === 'email' && (campaign.opened / campaign.sent) > 0.3) {
        return { type: 'success', message: 'High engagement detected', score: 92 };
      }
      if (campaign.type === 'call' && (campaign.connected / campaign.calls) < 0.1) {
        return { type: 'warning', message: 'Low connect rate', score: 45 };
      }
    }
    return null;
  };

  const activeCampaignCount = liveCampaigns.filter((c: any) => c.status === "active").length;
  const activeEmailCount = liveCampaigns.filter((c: any) => isEmailCampaign(c) && c.status === "active").length;
  const activePhoneCount = liveCampaigns.filter((c: any) => isPhoneCampaign(c) && c.status === "active").length;
  const pausedCampaignCount = liveCampaigns.filter((c: any) => c.status === "paused").length;
  const draftCampaignCount = liveCampaigns.filter((c: any) => c.status === "draft").length;
  const archivedCampaignCount = archivedCampaigns.length;

  const campaignPerformanceRates = liveCampaigns
    .map((campaign: any) => {
      const snapshot = campaignSnapshots[String(campaign.id)];
      if (isEmailCampaign(campaign)) {
        const recipients = snapshot?.email?.totalRecipients ?? campaign.sent ?? 0;
        const opens = snapshot?.email?.opens ?? campaign.opened ?? 0;
        return recipients > 0 ? (opens / recipients) * 100 : null;
      }

      if (isPhoneCampaign(campaign)) {
        const attempts = snapshot?.call?.callsMade ?? campaign.calls ?? 0;
        const connected = snapshot?.call?.callsConnected ?? campaign.connected ?? 0;
        return attempts > 0 ? (connected / attempts) * 100 : null;
      }

      return null;
    })
    .filter((rate): rate is number => rate !== null);

  const avgPerformanceRate = campaignPerformanceRates.length > 0
    ? Math.round(campaignPerformanceRates.reduce((sum, rate) => sum + rate, 0) / campaignPerformanceRates.length)
    : 0;

  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      {/* Header Section */}
      <div className="relative overflow-hidden rounded-2xl border bg-card p-5 md:p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">
              Campaign Control Center
            </h1>
            <p className="text-muted-foreground mt-1">
              Keep live campaigns focused, move finished work into archive, and act from one clean operating surface.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700 text-xs">
                {liveCampaigns.length} live
              </Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                {activeCampaignCount} active
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">
                {pausedCampaignCount} paused
              </Badge>
              <Badge variant="outline" className="bg-background/80 text-xs">
                {archivedCampaignCount} archived
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canManageCampaigns && (
              <Button className="gap-2 shadow-sm" onClick={() => setLocation("/campaigns/create")}>
                <Plus className="w-4 h-4" />
                New Campaign
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Live Campaigns</p>
              <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-foreground">{liveCampaigns.length}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Current working set across all channels</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Active Email</p>
              <div className="h-9 w-9 rounded-full bg-cyan-50 text-cyan-700 flex items-center justify-center">
                <Mail className="h-4 w-4" />
              </div>
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-foreground">{activeEmailCount}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Email campaigns running now</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Active Phone</p>
              <div className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Phone className="h-4 w-4" />
              </div>
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-foreground">{activePhoneCount}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Dialer and AI campaigns live</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Drafts Ready</p>
              <div className="h-9 w-9 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center">
                <Send className="h-4 w-4" />
              </div>
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-foreground">{draftCampaignCount}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Draft campaigns awaiting launch</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Avg Performance</p>
              <div className="h-9 w-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center">
                <BarChart className="h-4 w-4" />
              </div>
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-foreground">{avgPerformanceRate}%</h3>
            <p className="mt-1 text-xs text-muted-foreground">Average open/connect rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card className="border border-border/70 shadow-sm bg-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full xl:w-auto">
                  <TabsList className="grid w-full grid-cols-3 xl:w-[420px] bg-muted/60">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="call">Phone</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="inline-flex rounded-xl border border-border/70 bg-muted/30 p-1">
                  <Button
                    variant={visibilityFilter === "live" ? "default" : "ghost"}
                    size="sm"
                    className="h-8 rounded-lg px-3"
                    onClick={() => setVisibilityFilter("live")}
                  >
                    Live
                    <span className="ml-2 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {liveCampaigns.length}
                    </span>
                  </Button>
                  <Button
                    variant={visibilityFilter === "archived" ? "default" : "ghost"}
                    size="sm"
                    className="h-8 rounded-lg px-3"
                    onClick={() => setVisibilityFilter("archived")}
                  >
                    Archived
                    <span className="ml-2 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {archivedCampaignCount}
                    </span>
                  </Button>
                </div>
              </div>

              <div className="relative w-full xl:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {(["all", "active", "paused", "draft", "completed", "cancelled"] as const).map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "outline"}
                    size="sm"
                    className="h-8 capitalize"
                    onClick={() => setStatusFilter(status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {filteredCampaigns.length} of {visibilityFilter === "archived" ? archivedCampaignCount : liveCampaigns.length} {visibilityFilter} campaigns
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {isLoading ? (
              <div className="grid gap-2">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-lg border border-border/60 bg-muted/30" />
                ))}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                <div className="flex justify-center mb-4">
                  <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium">No campaigns found</h3>
                <p className="text-sm mt-1">
                  {visibilityFilter === "archived"
                    ? "No archived campaigns match these filters."
                    : "Adjust your filters or create a new campaign to get started."}
                </p>
              </div>
            ) : (
              filteredCampaigns.map((campaign: any) => {
                const insight = getCampaignInsight(campaign);
                const isExpanded = expandedCampaigns.has(campaign.id);
                const isPhone = isPhoneCampaign(campaign);
                const isEmail = isEmailCampaign(campaign);
                const isArchived = Boolean(campaign.isArchived);
                const campaignQueueStats = isPhone ? queueStats[campaign.id] : undefined;
                const snapshot = campaignSnapshots[String(campaign.id)];
                const emailSnapshot = snapshot?.email || null;
                const callSnapshot = snapshot?.call || null;
                const emailStats: EmailStats | null = emailSnapshot || null;
                const emailRecipients = emailSnapshot?.totalRecipients ?? campaign.sent ?? 0;
                const emailOpens = emailSnapshot?.opens ?? campaign.opened ?? 0;
                const callStatsDefinition = 'Recipients = unique non-removed contacts targeted; Attempts = total dialer call attempts; RPC = connected calls (count); Qualified = approved leads or qualified call outcomes; DNC = do_not_call / dnc_request outcomes.';
                const emailStatsDefinition = 'Recipients = total recipients targeted; Delivered = delivered messages; Opened = unique opens; Clicked = unique clicks; Unsub = unsubscribes.';
                const engagementRate = emailRecipients > 0
                  ? Math.round((emailOpens / emailRecipients) * 100)
                  : 0;
                const canOpenEmailReports = isEmail && (campaign.status !== 'draft' || emailRecipients > 0);
                const emailProviderLabel = campaign.campaignProviderName
                  || (campaign.campaignProviderKey === 'brevo' ? 'Brevo' : campaign.campaignProviderKey || null);
                const callAttempts = callSnapshot?.callsMade ?? campaign.calls ?? 0;
                const callConnected = callSnapshot?.callsConnected ?? campaign.connected ?? 0;
                const connectRate = callAttempts > 0
                  ? Math.round((callConnected / callAttempts) * 100)
                  : 0;

                return (
                  <Collapsible
                    key={campaign.id}
                    open={isExpanded}
                    onOpenChange={() => toggleCampaignExpanded(campaign.id)}
                  >
                    <div className="group rounded-lg border border-border/70 bg-card transition-colors hover:bg-accent/5">
                      {/* Compact row header */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Type icon */}
                        <div className={`p-1.5 rounded-md ring-1 shrink-0 ${isEmail ? 'bg-cyan-50 text-cyan-600 ring-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-400 dark:ring-cyan-800' : 'bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-800'}`}>
                          {isEmail ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                        </div>

                        {/* Name + meta */}
                        <div className="min-w-0 flex-[2]">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground truncate leading-tight">{campaign.name}</h3>
                            {isArchived && (
                              <Badge variant="outline" className="border-border/80 bg-muted/40 text-[10px] uppercase tracking-wide">
                                Archived
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge variant="outline" className={`${getStatusColor(campaign.status)} capitalize text-[10px] h-5 px-1.5`}>
                              {campaign.status}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground capitalize">{isPhone ? 'Phone' : campaign.type}</span>
                            {isEmail && emailProviderLabel && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 px-1 h-4 ${campaign.campaignProviderKey === 'brevo' ? 'border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-300' : ''}`}
                              >
                                {campaign.campaignProviderKey === 'brevo' ? 'Brevo' : emailProviderLabel}
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              Updated {new Date(campaign.updatedAt || campaign.createdAt || Date.now()).toLocaleDateString()}
                            </span>
                            {isPhone && (campaign.dialMode === 'ai_agent' || campaign.dialMode === 'hybrid') && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1 h-4 border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-400 gap-0.5">
                                <Bot className="h-2.5 w-2.5" />
                                {campaign.dialMode === 'hybrid' ? 'Hybrid' : 'AI'}
                              </Badge>
                            )}
                            {isPhone && campaignQueueStats && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Users className="h-2.5 w-2.5" />
                                {campaignQueueStats.queued} queued
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Inline KPI metrics */}
                        <div className="hidden md:grid grid-cols-5 gap-x-4 flex-[3] shrink-0">
                          {isPhone ? (
                            <>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-foreground">{(callSnapshot?.contactsInQueue ?? campaignQueueStats?.total ?? 0).toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={callStatsDefinition}>Recipients</p>
                              </div>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">{callAttempts.toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={callStatsDefinition}>Attempts</p>
                              </div>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{callConnected.toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={callStatsDefinition}>RPC</p>
                              </div>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-violet-600 dark:text-violet-400">{(callSnapshot?.leadsQualified ?? 0).toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={callStatsDefinition}>Qualified</p>
                              </div>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-red-500 dark:text-red-400">{(callSnapshot?.dncRequests ?? 0).toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={callStatsDefinition}>DNC</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-foreground">{emailRecipients.toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={emailStatsDefinition}>Recipients</p>
                              </div>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">{(emailSnapshot?.delivered ?? 0).toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={emailStatsDefinition}>Delivered</p>
                              </div>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{emailOpens.toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={emailStatsDefinition}>Opened</p>
                              </div>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-violet-600 dark:text-violet-400">{(emailSnapshot?.clicks ?? 0).toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={emailStatsDefinition}>Clicked</p>
                              </div>
                              <div className="flex flex-col items-center">
                                <p className="text-sm font-bold tabular-nums text-red-500 dark:text-red-400">{(emailSnapshot?.unsubscribes ?? 0).toLocaleString()}</p>
                                <p className="text-[9px] uppercase tracking-wider text-muted-foreground" title={emailStatsDefinition}>Unsub</p>
                              </div>
                            </>
                          )}
                        </div>

                        {/* AI Insight pill (desktop) */}
                        {insight && (
                          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border text-[11px] shrink-0">
                            {insight.type === 'success' ? (
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            ) : (
                              <AlertCircle className="w-3 h-3 text-amber-500" />
                            )}
                            <span className="font-medium truncate max-w-[140px]">{insight.message}</span>
                          </div>
                        )}

                        {/* Actions cluster */}
                        <div className="flex items-center gap-1 shrink-0">
                          {canManageCampaigns && !isArchived && isEmail && campaign.status === 'draft' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(campaign);
                              }}
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                          )}
                          {canManageCampaigns && !isArchived && campaign.status === 'draft' && isEmail && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunchClick(campaign);
                              }}
                              disabled={launchMutation.isPending}
                            >
                              <Send className="h-3.5 w-3.5" />
                              Send
                            </Button>
                          )}
                          {canManageCampaigns && !isArchived && !isEmail && campaign.status === 'draft' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(campaign);
                              }}
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                          )}
                          {canManageCampaigns && !isArchived && (campaign.status === 'active' || campaign.status === 'paused') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStatusMutation.mutate({ id: campaign.id.toString(), status: campaign.status });
                              }}
                              disabled={toggleStatusMutation.isPending}
                            >
                              {campaign.status === 'active' ? (
                                <><Pause className="h-3.5 w-3.5" />Pause</>
                              ) : (
                                <><Play className="h-3.5 w-3.5" />Resume</>
                              )}
                            </Button>
                          )}
                          {canManageCampaigns && !isArchived && (campaign.status === 'completed' || campaign.status === 'cancelled') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateClick(campaign);
                              }}
                              disabled={duplicateMutation.isPending}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Duplicate
                            </Button>
                          )}
                          {canManageCampaigns && isArchived && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveToggle(campaign);
                              }}
                              disabled={archiveMutation.isPending}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </Button>
                          )}

                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0">
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                          </CollapsibleTrigger>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isEmail ? (
                                <>
                                  {canManageCampaigns && !isArchived && campaign.status === 'draft' && (
                                    <DropdownMenuItem onClick={() => handleEditClick(campaign)}>
                                      <Edit className="mr-2 h-3.5 w-3.5" />Edit email
                                    </DropdownMenuItem>
                                  )}
                                  {canManageCampaigns && !isArchived && campaign.status === 'draft' && (
                                    <DropdownMenuItem onClick={() => handleLaunchClick(campaign)} disabled={launchMutation.isPending}>
                                      <Send className="mr-2 h-3.5 w-3.5" />Send campaign
                                    </DropdownMenuItem>
                                  )}
                                  {canOpenEmailReports && (
                                    <DropdownMenuItem onClick={() => setLocation(`/campaigns/email/${campaign.id}/reports`)}>
                                      <BarChart className="mr-2 h-3.5 w-3.5" />View reports
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => setLocation(`/campaigns/${campaign.id}/suppressions`)}>
                                    <Settings className="mr-2 h-3.5 w-3.5" />Suppressions
                                  </DropdownMenuItem>
                                  {canManageCampaigns && (
                                    <DropdownMenuItem onClick={() => handleDuplicateClick(campaign)} disabled={duplicateMutation.isPending}>
                                      <Copy className="mr-2 h-3.5 w-3.5" />Duplicate
                                    </DropdownMenuItem>
                                  )}
                                  {canManageCampaigns && (
                                    <DropdownMenuItem onClick={() => handleArchiveToggle(campaign)} disabled={archiveMutation.isPending}>
                                      <Archive className="mr-2 h-3.5 w-3.5" />
                                      {isArchived ? "Restore to live" : "Archive"}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleCreateLandingPageClick(campaign)}>
                                    <Globe className="mr-2 h-3.5 w-3.5" />Create landing page
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  {canManageCampaigns && (
                                    <DropdownMenuItem onClick={() => handleEditClick(campaign)}>
                                      <Edit className="mr-2 h-3.5 w-3.5" />Edit
                                    </DropdownMenuItem>
                                  )}
                                  {canManageCampaigns && (
                                    <DropdownMenuItem onClick={() => handleDuplicateClick(campaign)} disabled={duplicateMutation.isPending}>
                                      <Copy className="mr-2 h-3.5 w-3.5" />Duplicate
                                    </DropdownMenuItem>
                                  )}
                                  {canManageCampaigns && (
                                    <DropdownMenuItem onClick={() => handleArchiveToggle(campaign)} disabled={archiveMutation.isPending}>
                                      <Archive className="mr-2 h-3.5 w-3.5" />
                                      {isArchived ? "Restore to live" : "Archive"}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleCreateLandingPageClick(campaign)}>
                                    <Globe className="mr-2 h-3.5 w-3.5" />Create landing page
                                  </DropdownMenuItem>
                                  {isPhone && (
                                    <>
                                      {canManageCampaigns && (campaign.dialMode === 'ai_agent' || campaign.dialMode === 'sql') && campaign.status === 'active' && (
                                        <DropdownMenuItem
                                          onClick={() => handleStartAiCallsClick(campaign)}
                                          disabled={startAiCallsMutation.isPending}
                                          className="text-green-600"
                                        >
                                          <Phone className="mr-2 h-3.5 w-3.5" />
                                          {startAiCallsMutation.isPending ? 'Starting...' : 'Start AI Calls'}
                                        </DropdownMenuItem>
                                      )}
                                      {canSelectVoice && (
                                        <DropdownMenuItem onClick={() => handleSelectVoiceClick(campaign)}>
                                          <Mic className="mr-2 h-3.5 w-3.5" />Select AI Voice
                                        </DropdownMenuItem>
                                      )}
                                      {canManageCampaigns && (
                                        <DropdownMenuItem onClick={() => handleAssignAgentsClick(campaign)}>
                                          <Users className="mr-2 h-3.5 w-3.5" />Assign Agents
                                        </DropdownMenuItem>
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                              {canManageCampaigns && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteClick(campaign)}>
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />Delete permanently
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Expandable Detail Panel */}
                      <CollapsibleContent>
                        <div className="border-t px-4 py-4 bg-muted/30">
                          {/* Performance Snapshot — now inside expandable */}
                          <div className="mb-4">
                            <CampaignPerformanceSnapshot
                              data={campaignSnapshots[String(campaign.id)]}
                              isLoading={snapshotsLoading}
                            />
                          </div>
                          {isPhone && (campaign as any).lastStallReason && campaign.status === 'active' && (
                            <Alert variant="warning" className="mb-3">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{(campaign as any).lastStallReason}</AlertDescription>
                            </Alert>
                          )}
                          {isPhone && (
                            <PhoneCampaignPanel
                              campaign={{
                                id: campaign.id,
                                name: campaign.name,
                                status: campaign.status,
                                dialMode: campaign.dialMode,
                                type: campaign.type,
                                maxConcurrentWorkers: campaign.maxConcurrentWorkers,
                                assignedVoices: campaign.assignedVoices,
                              }}
                              queueStats={campaignQueueStats}
                              onAssignAgents={canManageCampaigns ? () => handleAssignAgentsClick(campaign) : undefined}
                              onToggleStatus={canManageCampaigns ? () => toggleStatusMutation.mutate({
                                id: campaign.id.toString(),
                                status: campaign.status
                              }) : undefined}
                              isToggling={canManageCampaigns ? toggleStatusMutation.isPending : false}
                            />
                          )}
                          {isEmail && (
                            <EmailCampaignPanel
                              campaign={{
                                id: campaign.id,
                                name: campaign.name,
                                status: campaign.status,
                                senderName: campaign.senderName,
                                fromEmail: campaign.fromEmail,
                                replyToEmail: campaign.replyToEmail,
                                campaignProviderName: campaign.campaignProviderName,
                                campaignProviderKey: campaign.campaignProviderKey,
                              }}
                              emailStats={emailStats}
                              isLoading={snapshotsLoading}
                            />
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{campaignToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Agent Assignment Dialog */}
      <AgentAssignmentDialog
        open={assignAgentsDialogOpen}
        onOpenChange={setAssignAgentsDialogOpen}
        campaign={selectedCampaignForAgents}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/campaigns/queue-stats"] });
        }}
      />

      {/* Voice Selection Dialog */}
      <VoiceSelectionDialog
        open={voiceDialogOpen}
        onOpenChange={setVoiceDialogOpen}
        campaign={selectedCampaignForVoice}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
        }}
      />

        </div>
      </div>
    </div>
  );
}

