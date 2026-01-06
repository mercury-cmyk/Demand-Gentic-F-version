import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Mail, Phone, Plus, BarChart, Settings, Play, Pause, Edit, Trash2, 
  MoreVertical, Zap, Search, ArrowUpRight, AlertCircle, CheckCircle2 
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
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/shared/stat-card";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import { Progress } from "@/components/ui/progress";
import { CampaignPerformanceSnapshot, type CampaignPerformanceSnapshotData } from "@/components/campaigns/campaign-performance-snapshot";

type EmailStatsResponse = {
  totalSent: number;
  delivered: number;
  opened: number;
  uniqueOpens: number;
  clicked: number;
  uniqueClicks: number;
  unsubscribed: number;
  spamComplaints: number;
};

type CallStatsResponse = {
  contactsInQueue: number;
  callsMade: number;
  callsConnected: number;
  leadsQualified: number;
  dncRequests: number;
  notInterested: number;
};

export default function CampaignsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [, setLocation] = useLocation();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  const { data: campaignSnapshots = {}, isLoading: snapshotsLoading } = useQuery<Record<string, CampaignPerformanceSnapshotData>>({
    queryKey: ["/api/campaigns", "performance-snapshots", campaigns.map((campaign: any) => campaign.id).join(",")],
    queryFn: async () => {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const snapshots = await Promise.all(
        campaigns.map(async (campaign: any) => {
          const snapshot: CampaignPerformanceSnapshotData = { email: null, call: null };
          const isEmail = campaign.type === "email" || campaign.type === "combo";
          const isCall = campaign.type === "call" || campaign.type === "telemarketing" || campaign.type === "combo";

          if (isEmail) {
            const response = await fetch(`/api/campaigns/${campaign.id}/email-stats`, { headers });
            if (response.ok) {
              const emailStats: EmailStatsResponse = await response.json();
              snapshot.email = {
                totalRecipients: emailStats.totalSent || 0,
                delivered: emailStats.delivered || 0,
                opens: emailStats.uniqueOpens ?? emailStats.opened ?? 0,
                clicks: emailStats.uniqueClicks ?? emailStats.clicked ?? 0,
                unsubscribes: emailStats.unsubscribed || 0,
                spamComplaints: emailStats.spamComplaints || 0,
              };
            }
          }

          if (isCall) {
            const response = await fetch(`/api/campaigns/${campaign.id}/call-stats`, { headers });
            if (response.ok) {
              const callStats: CallStatsResponse = await response.json();
              snapshot.call = {
                contactsInQueue: callStats.contactsInQueue || 0,
                callsMade: callStats.callsMade || 0,
                callsConnected: callStats.callsConnected || 0,
                leadsQualified: callStats.leadsQualified || 0,
                dncRequests: callStats.dncRequests || 0,
                notInterested: callStats.notInterested || 0,
              };
            }
          }

          return [campaign.id, snapshot] as const;
        })
      );

      return Object.fromEntries(snapshots);
    },
    enabled: campaigns.length > 0,
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
    if (campaign.type === 'call' || campaign.type === 'telemarketing') {
      setLocation(`/campaigns/phone/${campaign.id}/edit`);
    } else {
      setLocation(`/campaigns/${campaign.type}/edit/${campaign.id}`);
    }
  };

  const filteredCampaigns = campaigns.filter((c: any) => {
    const matchesTab = activeTab === "all" || c.type === activeTab;
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/20";
      case "paused":
        return "bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20";
      case "completed":
        return "bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20";
      case "draft":
        return "bg-gray-500/10 text-gray-600 border-gray-200 hover:bg-gray-500/20";
      default:
        return "bg-gray-500/10 text-gray-600 border-gray-200";
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

  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="min-h-screen bg-background p-6 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">
            Campaigns
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor your outreach initiatives
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2 shadow-sm">
                <Plus className="w-4 h-4" />
                New Campaign
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Select Campaign Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLocation("/campaigns/email/create")}>
                <Mail className="mr-2 h-4 w-4" />
                Email Campaign
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/campaigns/telemarketing/create")}>
                <Phone className="mr-2 h-4 w-4" />
                Phone Campaign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Campaigns"
          value={campaigns.length}
          icon={Zap}
          description="All time"
        />
        <StatCard
          title="Active Email"
          value={campaigns.filter((c: any) => c.type === "email" && c.status === "active").length}
          icon={Mail}
          trend={{ value: 5, isPositive: true }}
        />
        <StatCard
          title="Active Phone"
          value={campaigns.filter((c: any) => c.type === "call" && c.status === "active").length}
          icon={Phone}
          trend={{ value: 2, isPositive: true }}
        />
        <StatCard
          title="Avg Performance"
          value="28%"
          icon={BarChart}
          description="Open/Connect rate"
        />
      </div>

      {/* Main Content */}
      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
              <TabsList className="grid w-full grid-cols-3 md:w-[400px]">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="call">Phone</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredCampaigns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                <div className="flex justify-center mb-4">
                  <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium">No campaigns found</h3>
                <p className="text-sm mt-1">Try creating a new campaign to get started.</p>
              </div>
            ) : (
              filteredCampaigns.map((campaign: any) => {
                const insight = getCampaignInsight(campaign);
                
                return (
                  <div 
                    key={campaign.id} 
                    className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-all duration-200 hover:shadow-md"
                  >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex items-start gap-4 min-w-[250px]">
                      <div className={`p-2.5 rounded-lg ${campaign.type === 'email' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                        {campaign.type === "email" ? <Mail className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                      </div>
                      <div>
                        <h3 className="font-semibold text-base text-foreground">{campaign.name}</h3>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>Started {new Date(campaign.startDate).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="capitalize">{campaign.type === 'call' ? 'Phone' : campaign.type}</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Metrics & Status */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full md:w-auto items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getStatusColor(campaign.status)}>
                          {campaign.status}
                        </Badge>
                      </div>
                      
                      <div className="col-span-2 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {campaign.type === 'email' ? 'Engagement Rate' : 'Connect Rate'}
                          </span>
                          <span className="font-medium">
                            {campaign.type === 'email' 
                              ? `${campaign.sent && campaign.opened ? Math.round((campaign.opened / campaign.sent) * 100) : 0}%`
                              : `${campaign.calls && campaign.connected ? Math.round((campaign.connected / campaign.calls) * 100) : 0}%`
                            }
                          </span>
                        </div>
                        <Progress 
                          value={campaign.type === 'email' 
                            ? (campaign.opened / campaign.sent) * 100 
                            : (campaign.connected / campaign.calls) * 100
                          } 
                          className="h-2" 
                        />
                      </div>
                    </div>

                    {/* Right: AI Insight & Actions */}
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
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

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditClick(campaign)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteClick(campaign)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <CampaignPerformanceSnapshot
                    data={campaignSnapshots[String(campaign.id)]}
                    isLoading={snapshotsLoading}
                  />
                </div>
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
        </div>
      </div>
    </div>
  );
}
