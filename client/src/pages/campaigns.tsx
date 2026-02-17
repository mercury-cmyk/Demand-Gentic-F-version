import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, Phone, Plus, BarChart, Settings, Play, Pause, Edit, Trash2,
  MoreVertical, Zap, Search, ArrowUpRight, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Bot, Users, Mic, Globe
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "completed" | "draft">("all");
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
    refetchInterval: 15000,
    staleTime: 10000,
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
    refetchInterval: 10000, // Refresh every 10 seconds (reduced from 2s to prevent server overload)
    staleTime: 5000,
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
      const response = await apiRequest("DELETE", `/api/campaigns/${campaignId}`);
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

  const handleDeleteConfirm = () => {
    if (campaignToDelete) {
      deleteMutation.mutate(campaignToDelete.id);
    }
  };

  const handleEditClick = (campaign: any) => {
    // All phone/telemarketing campaigns use the unified 12-step wizard in edit mode
    if (campaign.type === 'call' || campaign.type === 'telemarketing' || campaign.type === 'appointment_generation' || campaign.type === 'content_syndication' || campaign.type === 'high_quality_leads' || campaign.type === 'live_webinar' || campaign.type === 'on_demand_webinar' || campaign.type === 'executive_dinner' || campaign.type === 'leadership_forum' || campaign.type === 'conference' || campaign.type === 'sql') {
      setLocation(`/campaigns/telemarketing/${campaign.id}/edit`);
    } else if (campaign.type === 'email') {
      setLocation(`/campaigns/email/${campaign.id}/edit`);
    } else {
      setLocation(`/campaigns/${campaign.type}/edit/${campaign.id}`);
    }
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

  const filteredCampaigns = campaigns.filter((c: any) => {
    // Handle "call" tab to include all phone-based campaign types
    const matchesTab = activeTab === "all" ||
      c.type === activeTab ||
      (activeTab === "call" && (PHONE_CAMPAIGN_TYPES.includes(c.type) || c.dialMode === 'ai_agent'));
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesStatus && matchesSearch;
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

  const activeCampaignCount = campaigns.filter((c: any) => c.status === "active").length;
  const activeEmailCount = campaigns.filter((c: any) => isEmailCampaign(c) && c.status === "active").length;
  const activePhoneCount = campaigns.filter((c: any) => isPhoneCampaign(c) && c.status === "active").length;
  const pausedCampaignCount = campaigns.filter((c: any) => c.status === "paused").length;

  const campaignPerformanceRates = campaigns
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
              Campaign Lists
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage outreach pipelines, monitor performance, and take action fast.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-background/80 text-xs">
                {campaigns.length} total
              </Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                {activeCampaignCount} active
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">
                {pausedCampaignCount} paused
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Campaigns</p>
              <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-foreground">{campaigns.length}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Across all channels</p>
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
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full xl:w-auto">
                <TabsList className="grid w-full grid-cols-3 xl:w-[420px] bg-muted/60">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="email">Email</TabsTrigger>
                  <TabsTrigger value="call">Phone</TabsTrigger>
                </TabsList>
              </Tabs>

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
                {(["all", "active", "paused", "draft", "completed"] as const).map((status) => (
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
                Showing {filteredCampaigns.length} of {campaigns.length} campaigns
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading ? (
              <div className="grid gap-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-28 animate-pulse rounded-xl border border-border/60 bg-muted/30" />
                ))}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                <div className="flex justify-center mb-4">
                  <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium">No campaigns found</h3>
                <p className="text-sm mt-1">Adjust your filters or create a new campaign to get started.</p>
              </div>
            ) : (
              filteredCampaigns.map((campaign: any) => {
                const insight = getCampaignInsight(campaign);
                const isExpanded = expandedCampaigns.has(campaign.id);
                const isPhone = isPhoneCampaign(campaign);
                const isEmail = isEmailCampaign(campaign);
                const campaignQueueStats = isPhone ? queueStats[campaign.id] : undefined;
                const snapshot = campaignSnapshots[String(campaign.id)];
                const emailSnapshot = snapshot?.email || null;
                const callSnapshot = snapshot?.call || null;
                const emailStats: EmailStats | null = emailSnapshot || null;
                const emailRecipients = emailSnapshot?.totalRecipients ?? campaign.sent ?? 0;
                const emailOpens = emailSnapshot?.opens ?? campaign.opened ?? 0;
                const engagementRate = emailRecipients > 0
                  ? Math.round((emailOpens / emailRecipients) * 100)
                  : 0;
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
                    <div className="group rounded-2xl border border-border/70 bg-card transition-all duration-200 hover:border-primary/30 hover:shadow-md">
                      <div className="p-4 md:p-5">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          {/* Left: Info */}
                          <div className="flex items-start gap-4 min-w-[250px]">
                            <div className={`p-2.5 rounded-lg ring-1 ${isEmail ? 'bg-cyan-50 text-cyan-700 ring-cyan-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                              {isEmail ? <Mail className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                            </div>
                            <div>
                              <h3 className="font-semibold text-base text-foreground">{campaign.name}</h3>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                {campaign.startDate && (
                                  <>
                                    <span>Started {new Date(campaign.startDate).toLocaleDateString()}</span>
                                    <span>|</span>
                                  </>
                                )}
                                <span className="capitalize">{isPhone ? 'Phone' : campaign.type}</span>
                                {isPhone && (campaign.dialMode === 'ai_agent' || campaign.dialMode === 'hybrid') && (
                                  <>
                                    <span>|</span>
                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-cyan-300 text-cyan-700">
                                      <Bot className="h-3 w-3 mr-1" />
                                      {campaign.dialMode === 'hybrid' ? 'Hybrid' : 'AI Agent'}
                                    </Badge>
                                  </>
                                )}
                                {isPhone && campaignQueueStats && (
                                  <>
                                    <span>|</span>
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-muted/60">
                                      <Users className="h-3 w-3 mr-1" />
                                      {campaignQueueStats.queued} in queue
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Middle: Metrics & Status */}
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full md:w-auto items-center">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`${getStatusColor(campaign.status)} capitalize`}>
                                {campaign.status}
                              </Badge>
                            </div>

                            <div className="col-span-2 space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">
                                  {isEmail ? 'Engagement Rate' : 'Connect Rate'}
                                </span>
                                <span className="font-medium">
                                  {isEmail ? `${engagementRate}%` : `${connectRate}%`}
                                </span>
                              </div>
                              <Progress
                                value={isEmail ? engagementRate : connectRate}
                                className="h-2"
                              />
                            </div>
                          </div>

                          {/* Right: AI Insight & Actions */}
                          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                            {insight && (
                              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border text-xs">
                                {insight.type === 'success' ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                )}
                                <span className="font-medium">{insight.message}</span>
                                <div className="w-px h-3 bg-border mx-1" />
                                <ConfidenceIndicator score={insight.score} showBar={false} className="!gap-0" />
                              </div>
                            )}

                            {/* Quick Status Toggle */}
                            {canManageCampaigns && (campaign.status === 'active' || campaign.status === 'paused') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStatusMutation.mutate({ id: campaign.id.toString(), status: campaign.status });
                                }}
                                disabled={toggleStatusMutation.isPending}
                              >
                                {campaign.status === 'active' ? (
                                  <>
                                    <Pause className="h-4 w-4 mr-1" />
                                    Pause
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-1" />
                                    Resume
                                  </>
                                )}
                              </Button>
                            )}

                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 px-2">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canManageCampaigns && (
                                  <DropdownMenuItem onClick={() => handleEditClick(campaign)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleCreateLandingPageClick(campaign)}>
                                  <Globe className="mr-2 h-4 w-4" />
                                  Create Landing Page
                                </DropdownMenuItem>
                                {isPhone && (
                                  <>
                                    {/* Start AI Calls - only for active AI agent campaigns */}
                                    {canManageCampaigns && (campaign.dialMode === 'ai_agent' || campaign.dialMode === 'sql') && campaign.status === 'active' && (
                                      <DropdownMenuItem
                                        onClick={() => handleStartAiCallsClick(campaign)}
                                        disabled={startAiCallsMutation.isPending}
                                        className="text-green-600"
                                      >
                                        <Phone className="mr-2 h-4 w-4" />
                                        {startAiCallsMutation.isPending ? 'Starting...' : 'Start AI Calls'}
                                      </DropdownMenuItem>
                                    )}
                                    {canSelectVoice && (
                                      <DropdownMenuItem onClick={() => handleSelectVoiceClick(campaign)}>
                                        <Mic className="mr-2 h-4 w-4" />
                                        Select AI Voice
                                      </DropdownMenuItem>
                                    )}
                                    {canManageCampaigns && (
                                      <DropdownMenuItem onClick={() => handleAssignAgentsClick(campaign)}>
                                        <Users className="mr-2 h-4 w-4" />
                                        Assign Agents
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}
                                {canManageCampaigns && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteClick(campaign)}>
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Performance Snapshot - Always visible */}
                        <div className="mt-4">
                          <CampaignPerformanceSnapshot
                            data={campaignSnapshots[String(campaign.id)]}
                            isLoading={snapshotsLoading}
                          />
                        </div>
                      </div>

                      {/* Expandable Type-Specific Panel */}
                      <CollapsibleContent>
                        <div className="border-t px-4 py-4 bg-muted/30">
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

