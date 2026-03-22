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
  const [campaignToDelete, setCampaignToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("live");
  const [expandedCampaigns, setExpandedCampaigns] = useState>(new Set());
  const [assignAgentsDialogOpen, setAssignAgentsDialogOpen] = useState(false);
  const [selectedCampaignForAgents, setSelectedCampaignForAgents] = useState(null);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [selectedCampaignForVoice, setSelectedCampaignForVoice] = useState(null);
  const [editCampaignId, setEditCampaignId] = useState(null);
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

  const { data: campaignSnapshots = {}, isLoading: snapshotsLoading } = useQuery>({
    queryKey: ["/api/campaigns", "batch-stats", campaigns.map((campaign: any) => campaign.id).join(",")],
    queryFn: async () => {
      const token = getToken();

      // Build type map for each campaign
      const types: Record = {};
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
      const snapshots: Record = {};
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
  const { data: queueStats = {} } = useQuery>({
    queryKey: ["/api/campaigns/queue-stats", phoneCampaigns.map((c: any) => c.id).join(',')],
    queryFn: async () => {
      const stats: Record = {};
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
      const statusWeight: Record = {
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
      if (campaign.type === 'call' && (campaign.connected / campaign.calls)  c.status === "active").length;
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
    
      
        
      {/* Header Section */}
      
        
        
        
          
            
              Campaign Control Center
            
            
              Keep live campaigns focused, move finished work into archive, and act from one clean operating surface.
            
            
              
                {liveCampaigns.length} live
              
              
                {activeCampaignCount} active
              
              
                {pausedCampaignCount} paused
              
              
                {archivedCampaignCount} archived
              
            
          
          
            {canManageCampaigns && (
               setLocation("/campaigns/create")}>
                
                New Campaign
              
            )}
          
        
      

      {/* Stats Overview */}
      
        
          
            
              Live Campaigns
              
                
              
            
            {liveCampaigns.length}
            Current working set across all channels
          
        

        
          
            
              Active Email
              
                
              
            
            {activeEmailCount}
            Email campaigns running now
          
        

        
          
            
              Active Phone
              
                
              
            
            {activePhoneCount}
            Dialer and AI campaigns live
          
        

        
          
            
              Drafts Ready
              
                
              
            
            {draftCampaignCount}
            Draft campaigns awaiting launch
          
        

        
          
            
              Avg Performance
              
                
              
            
            {avgPerformanceRate}%
            Average open/connect rate
          
        
      

      {/* Main Content */}
      
        
          
            
              
                
                  
                    All
                    Email
                    Phone
                  
                
                
                   setVisibilityFilter("live")}
                  >
                    Live
                    
                      {liveCampaigns.length}
                    
                  
                   setVisibilityFilter("archived")}
                  >
                    Archived
                    
                      {archivedCampaignCount}
                    
                  
                
              

              
                
                 setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              
            

            
              
                {(["all", "active", "paused", "draft", "completed", "cancelled"] as const).map((status) => (
                   setStatusFilter(status)}
                  >
                    {status}
                  
                ))}
              
              
                Showing {filteredCampaigns.length} of {visibilityFilter === "archived" ? archivedCampaignCount : liveCampaigns.length} {visibilityFilter} campaigns
              
            
          
        
        
          
            {isLoading ? (
              
                {[1, 2, 3].map((item) => (
                  
                ))}
              
            ) : filteredCampaigns.length === 0 ? (
              
                
                  
                
                No campaigns found
                
                  {visibilityFilter === "archived"
                    ? "No archived campaigns match these filters."
                    : "Adjust your filters or create a new campaign to get started."}
                
              
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
                   toggleCampaignExpanded(campaign.id)}
                  >
                    
                      {/* Compact row header */}
                      
                        {/* Type icon */}
                        
                          {isEmail ?  : }
                        

                        {/* Name + meta */}
                        
                          
                            {campaign.name}
                            {isArchived && (
                              
                                Archived
                              
                            )}
                          
                          
                            
                              {campaign.status}
                            
                            {isPhone ? 'Phone' : campaign.type}
                            {isEmail && emailProviderLabel && (
                              
                                {campaign.campaignProviderKey === 'brevo' ? 'Brevo' : emailProviderLabel}
                              
                            )}
                            
                              Updated {new Date(campaign.updatedAt || campaign.createdAt || Date.now()).toLocaleDateString()}
                            
                            {isPhone && (campaign.dialMode === 'ai_agent' || campaign.dialMode === 'hybrid') && (
                              
                                
                                {campaign.dialMode === 'hybrid' ? 'Hybrid' : 'AI'}
                              
                            )}
                            {isPhone && campaignQueueStats && (
                              
                                
                                {campaignQueueStats.queued} queued
                              
                            )}
                          
                        

                        {/* Inline KPI metrics */}
                        
                          {isPhone ? (
                            <>
                              
                                {(callSnapshot?.contactsInQueue ?? campaignQueueStats?.total ?? 0).toLocaleString()}
                                Recipients
                              
                              
                                {callAttempts.toLocaleString()}
                                Attempts
                              
                              
                                {callConnected.toLocaleString()}
                                RPC
                              
                              
                                {(callSnapshot?.leadsQualified ?? 0).toLocaleString()}
                                Qualified
                              
                              
                                {(callSnapshot?.dncRequests ?? 0).toLocaleString()}
                                DNC
                              
                            
                          ) : (
                            <>
                              
                                {emailRecipients.toLocaleString()}
                                Recipients
                              
                              
                                {(emailSnapshot?.delivered ?? 0).toLocaleString()}
                                Delivered
                              
                              
                                {emailOpens.toLocaleString()}
                                Opened
                              
                              
                                {(emailSnapshot?.clicks ?? 0).toLocaleString()}
                                Clicked
                              
                              
                                {(emailSnapshot?.unsubscribes ?? 0).toLocaleString()}
                                Unsub
                              
                            
                          )}
                        

                        {/* AI Insight pill (desktop) */}
                        {insight && (
                          
                            {insight.type === 'success' ? (
                              
                            ) : (
                              
                            )}
                            {insight.message}
                          
                        )}

                        {/* Actions cluster */}
                        
                          {canManageCampaigns && !isArchived && isEmail && campaign.status === 'draft' && (
                             {
                                e.stopPropagation();
                                handleEditClick(campaign);
                              }}
                            >
                              
                              Edit
                            
                          )}
                          {canManageCampaigns && !isArchived && campaign.status === 'draft' && isEmail && (
                             {
                                e.stopPropagation();
                                handleLaunchClick(campaign);
                              }}
                              disabled={launchMutation.isPending}
                            >
                              
                              Send
                            
                          )}
                          {canManageCampaigns && !isArchived && !isEmail && campaign.status === 'draft' && (
                             {
                                e.stopPropagation();
                                handleEditClick(campaign);
                              }}
                            >
                              
                              Edit
                            
                          )}
                          {canManageCampaigns && !isArchived && (campaign.status === 'active' || campaign.status === 'paused') && (
                             {
                                e.stopPropagation();
                                toggleStatusMutation.mutate({ id: campaign.id.toString(), status: campaign.status });
                              }}
                              disabled={toggleStatusMutation.isPending}
                            >
                              {campaign.status === 'active' ? (
                                <>Pause
                              ) : (
                                <>Resume
                              )}
                            
                          )}
                          {canManageCampaigns && !isArchived && (campaign.status === 'completed' || campaign.status === 'cancelled') && (
                             {
                                e.stopPropagation();
                                handleDuplicateClick(campaign);
                              }}
                              disabled={duplicateMutation.isPending}
                            >
                              
                              Duplicate
                            
                          )}
                          {canManageCampaigns && isArchived && (
                             {
                                e.stopPropagation();
                                handleArchiveToggle(campaign);
                              }}
                              disabled={archiveMutation.isPending}
                            >
                              
                              Restore
                            
                          )}

                          
                            
                              {isExpanded ?  : }
                            
                          

                          
                            
                              
                                
                              
                            
                            
                              {isEmail ? (
                                <>
                                  {canManageCampaigns && !isArchived && campaign.status === 'draft' && (
                                     handleEditClick(campaign)}>
                                      Edit email
                                    
                                  )}
                                  {canManageCampaigns && !isArchived && campaign.status === 'draft' && (
                                     handleLaunchClick(campaign)} disabled={launchMutation.isPending}>
                                      Send campaign
                                    
                                  )}
                                  {canOpenEmailReports && (
                                     setLocation(`/campaigns/email/${campaign.id}/reports`)}>
                                      View reports
                                    
                                  )}
                                   setLocation(`/campaigns/${campaign.id}/suppressions`)}>
                                    Suppressions
                                  
                                  {canManageCampaigns && (
                                     handleDuplicateClick(campaign)} disabled={duplicateMutation.isPending}>
                                      Duplicate
                                    
                                  )}
                                  {canManageCampaigns && (
                                     handleArchiveToggle(campaign)} disabled={archiveMutation.isPending}>
                                      
                                      {isArchived ? "Restore to live" : "Archive"}
                                    
                                  )}
                                   handleCreateLandingPageClick(campaign)}>
                                    Create landing page
                                  
                                
                              ) : (
                                <>
                                  {canManageCampaigns && (
                                     handleEditClick(campaign)}>
                                      Edit
                                    
                                  )}
                                  {canManageCampaigns && (
                                     handleDuplicateClick(campaign)} disabled={duplicateMutation.isPending}>
                                      Duplicate
                                    
                                  )}
                                  {canManageCampaigns && (
                                     handleArchiveToggle(campaign)} disabled={archiveMutation.isPending}>
                                      
                                      {isArchived ? "Restore to live" : "Archive"}
                                    
                                  )}
                                   handleCreateLandingPageClick(campaign)}>
                                    Create landing page
                                  
                                  {isPhone && (
                                    <>
                                      {canManageCampaigns && (campaign.dialMode === 'ai_agent' || campaign.dialMode === 'sql') && campaign.status === 'active' && (
                                         handleStartAiCallsClick(campaign)}
                                          disabled={startAiCallsMutation.isPending}
                                          className="text-green-600"
                                        >
                                          
                                          {startAiCallsMutation.isPending ? 'Starting...' : 'Start AI Calls'}
                                        
                                      )}
                                      {canSelectVoice && (
                                         handleSelectVoiceClick(campaign)}>
                                          Select AI Voice
                                        
                                      )}
                                      {canManageCampaigns && (
                                         handleAssignAgentsClick(campaign)}>
                                          Assign Agents
                                        
                                      )}
                                    
                                  )}
                                
                              )}
                              {canManageCampaigns && (
                                <>
                                  
                                   handleDeleteClick(campaign)}>
                                    Delete permanently
                                  
                                
                              )}
                            
                          
                        
                      

                      {/* Expandable Detail Panel */}
                      
                        
                          {/* Performance Snapshot — now inside expandable */}
                          
                            
                          
                          {isPhone && (campaign as any).lastStallReason && campaign.status === 'active' && (
                            
                              
                              {(campaign as any).lastStallReason}
                            
                          )}
                          {isPhone && (
                             handleAssignAgentsClick(campaign) : undefined}
                              onToggleStatus={canManageCampaigns ? () => toggleStatusMutation.mutate({
                                id: campaign.id.toString(),
                                status: campaign.status
                              }) : undefined}
                              isToggling={canManageCampaigns ? toggleStatusMutation.isPending : false}
                            />
                          )}
                          {isEmail && (
                            
                          )}
                        
                      
                    
                  
                );
              })
            )}
          
        
      

      {/* Delete Confirmation Dialog */}
      
        
          
            Delete Campaign
            
              Are you sure you want to delete "{campaignToDelete?.name}"? This action cannot be undone.
            
          
          
            Cancel
            
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            
          
        
      

      {/* Agent Assignment Dialog */}
       {
          queryClient.invalidateQueries({ queryKey: ["/api/campaigns/queue-stats"] });
        }}
      />

      {/* Voice Selection Dialog */}
       {
          queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
        }}
      />

        
      
    
  );
}