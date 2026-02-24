import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Mail, Play, BarChart3, Loader2, Shield, Pause, StopCircle, RotateCcw, Edit, RefreshCw } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CampaignPerformanceSnapshot, type CampaignPerformanceSnapshotData } from "@/components/campaigns/campaign-performance-snapshot";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  type Campaign, 
  type Segment,
  type List,
} from "@shared/schema";

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

export default function EmailCampaignsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
  });

  const emailCampaigns = campaigns?.filter((campaign) => campaign.type === 'email') || [];

  const { data: campaignSnapshots = {}, isLoading: snapshotsLoading } = useQuery<Record<string, CampaignPerformanceSnapshotData>>({
    queryKey: ['/api/campaigns', 'email-snapshots', emailCampaigns.map((campaign) => campaign.id).join(',')],
    queryFn: async () => {
      const snapshots = await Promise.all(
        emailCampaigns.map(async (campaign) => {
          const snapshot: CampaignPerformanceSnapshotData = { email: null, call: null };
          try {
            const response = await apiRequest('GET', `/api/campaigns/${campaign.id}/email-stats`);
            const emailStats: EmailStatsResponse = await response.json();
            snapshot.email = {
              totalRecipients: emailStats.totalSent || 0,
              delivered: emailStats.delivered || 0,
              opens: emailStats.uniqueOpens ?? emailStats.opened ?? 0,
              clicks: emailStats.uniqueClicks ?? emailStats.clicked ?? 0,
              unsubscribes: emailStats.unsubscribed || 0,
              spamComplaints: emailStats.spamComplaints || 0,
            };
          } catch (error) {
            console.error('Failed to load email stats snapshot', error);
          }
          return [campaign.id, snapshot] as const;
        })
      );

      return Object.fromEntries(snapshots);
    },
    enabled: emailCampaigns.length > 0,
    refetchInterval: 10000,
  });

  const { data: segments = [] } = useQuery<Segment[]>({
    queryKey: ['/api/segments'],
  });

  const { data: lists = [] } = useQuery<List[]>({
    queryKey: ['/api/lists'],
  });

  const launchMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/campaigns/${id}/launch`, undefined, { timeout: 120000 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Campaign launched successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to launch campaign",
        variant: "destructive",
      });
    },
  });

  // Pause campaign mutation
  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('PATCH', `/api/campaigns/${id}`, { status: 'paused' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'], refetchType: 'active' });
      toast({
        title: "Campaign Paused",
        description: "Email sending has been paused. You can resume at any time.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to pause campaign",
        variant: "destructive",
      });
    },
  });

  // Resume campaign mutation
  const resumeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('PATCH', `/api/campaigns/${id}`, { status: 'active' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'], refetchType: 'active' });
      toast({
        title: "Campaign Resumed",
        description: "Email sending has resumed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resume campaign",
        variant: "destructive",
      });
    },
  });

  // Cancel campaign mutation
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('PATCH', `/api/campaigns/${id}`, { status: 'cancelled' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'], refetchType: 'active' });
      toast({
        title: "Campaign Cancelled",
        description: "Campaign has been cancelled. Remaining emails will not be sent.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel campaign",
        variant: "destructive",
      });
    },
  });

  // Requeue/Clone campaign mutation - creates a new draft from cancelled/completed campaign
  const requeueMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/campaigns/${id}/clone`);
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'], refetchType: 'active' });
      const newCampaign = await response.json();
      toast({
        title: "Campaign Requeued",
        description: "A new draft campaign has been created. You can edit and launch it.",
      });
      // Navigate to edit the new campaign
      setLocation(`/campaigns/email/${newCampaign.id}/edit`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to requeue campaign",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
      active: { variant: "default", className: "bg-green-500 hover:bg-green-600" },
      draft: { variant: "secondary" },
      completed: { variant: "outline" },
      paused: { variant: "outline", className: "bg-amber-100 text-amber-700 border-amber-300" },
      cancelled: { variant: "destructive" },
    };
    const { variant, className } = config[status] || { variant: "outline" as const };
    return <Badge variant={variant} className={className} data-testid={`badge-status-${status}`}>{status}</Badge>;
  };

  const filteredCampaigns = emailCampaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-email-campaigns">Email Campaigns</h1>
              <p className="text-muted-foreground mt-1">
                Create, manage, and track your email marketing campaigns
              </p>
            </div>
            <Button asChild data-testid="button-create-email-campaign">
              <Link href="/campaigns/email/create">
                <Plus className="mr-2 h-4 w-4" />
                Create Campaign
              </Link>
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search campaigns..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-campaigns"
              />
            </div>
          </div>

      {campaignsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : filteredCampaigns.length > 0 ? (
        <div className="grid gap-4">
          {filteredCampaigns.map((campaign) => (
            <Card key={campaign.id} className="hover-elevate" data-testid={`card-campaign-${campaign.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</CardTitle>
                      {getStatusBadge(campaign.status)}
                    </div>
                    {campaign.emailSubject && (
                      <p className="text-sm text-muted-foreground" data-testid={`text-campaign-subject-${campaign.id}`}>
                        Subject: {campaign.emailSubject}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {/* Launch button - only for draft campaigns */}
                    {campaign.status === "draft" && (
                      <Button 
                        size="sm" 
                        onClick={() => launchMutation.mutate(campaign.id)}
                        disabled={launchMutation.isPending}
                        data-testid={`button-launch-campaign-${campaign.id}`}
                      >
                        {launchMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        Launch
                      </Button>
                    )}

                    {/* Pause button - only for active campaigns */}
                    {campaign.status === "active" && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => pauseMutation.mutate(campaign.id)}
                        disabled={pauseMutation.isPending}
                        data-testid={`button-pause-campaign-${campaign.id}`}
                        className="border-amber-300 text-amber-700 hover:bg-amber-50"
                      >
                        {pauseMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Pause className="mr-2 h-4 w-4" />
                        )}
                        Pause
                      </Button>
                    )}

                    {/* Resume button - only for paused campaigns */}
                    {campaign.status === "paused" && (
                      <Button 
                        size="sm" 
                        onClick={() => resumeMutation.mutate(campaign.id)}
                        disabled={resumeMutation.isPending}
                        data-testid={`button-resume-campaign-${campaign.id}`}
                      >
                        {resumeMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-2 h-4 w-4" />
                        )}
                        Resume
                      </Button>
                    )}

                    {/* Cancel button - for active or paused campaigns */}
                    {(campaign.status === "active" || campaign.status === "paused") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            disabled={cancelMutation.isPending}
                            data-testid={`button-cancel-campaign-${campaign.id}`}
                          >
                            {cancelMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <StopCircle className="mr-2 h-4 w-4" />
                            )}
                            Cancel
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Campaign?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently stop the campaign. Any remaining unsent emails will not be delivered. 
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Running</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => cancelMutation.mutate(campaign.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Yes, Cancel Campaign
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {/* Edit button - for draft campaigns */}
                    {campaign.status === "draft" && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setLocation(`/campaigns/email/${campaign.id}/edit`)}
                        data-testid={`button-edit-campaign-${campaign.id}`}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    )}

                    {/* Requeue button - for cancelled or completed campaigns */}
                    {(campaign.status === "cancelled" || campaign.status === "completed") && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => requeueMutation.mutate(campaign.id)}
                        disabled={requeueMutation.isPending}
                        data-testid={`button-requeue-campaign-${campaign.id}`}
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        {requeueMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Requeue
                      </Button>
                    )}

                    <Link href={`/campaigns/${campaign.id}/suppressions`}>
                      <Button variant="outline" size="sm" data-testid={`button-manage-suppressions-${campaign.id}`}>
                        <Shield className="mr-2 h-4 w-4" />
                        Suppressions
                      </Button>
                    </Link>
                    <Link href={`/campaigns/email/${campaign.id}/reports`}>
                      <Button variant="outline" size="sm" data-testid={`button-view-stats-${campaign.id}`}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Stats
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Type: {campaign.type} | Created: {new Date(campaign.createdAt).toLocaleDateString()}
                  </div>
                  <CampaignPerformanceSnapshot
                    data={campaignSnapshots[String(campaign.id)]}
                    isLoading={snapshotsLoading}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12">
          <EmptyState
            icon={Mail}
            title="No email campaigns yet"
            description="Create your first email campaign to start engaging your audience."
            actionLabel="Create Campaign"
            onAction={() => {
              // Navigate using wouter by changing the href
              window.location.href = '/campaigns/email/create';
            }}
          />
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
