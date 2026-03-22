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

type EmailCampaignListItem = Campaign & {
  senderName?: string | null;
  fromEmail?: string | null;
  replyToEmail?: string | null;
  campaignProviderName?: string | null;
  campaignProviderKey?: string | null;
};

export default function EmailCampaignsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['/api/campaigns'],
  });

  const emailCampaigns = campaigns?.filter((campaign) => campaign.type === 'email') || [];

  const { data: campaignSnapshots = {}, isLoading: snapshotsLoading } = useQuery>({
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
    refetchIntervalInBackground: false,
  });

  const { data: segments = [] } = useQuery({
    queryKey: ['/api/segments'],
  });

  const { data: lists = [] } = useQuery({
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
    const config: Record = {
      active: { variant: "default", className: "bg-green-500 hover:bg-green-600" },
      draft: { variant: "secondary" },
      completed: { variant: "outline" },
      paused: { variant: "outline", className: "bg-amber-100 text-amber-700 border-amber-300" },
      cancelled: { variant: "destructive" },
    };
    const { variant, className } = config[status] || { variant: "outline" as const };
    return {status};
  };

  const getProviderLabel = (campaign: EmailCampaignListItem) => {
    if (campaign.campaignProviderName) return campaign.campaignProviderName;
    if (campaign.campaignProviderKey === "brevo") return "Brevo";
    if (campaign.campaignProviderKey === "mailgun") return "Mailgun";
    if (!campaign.campaignProviderKey) return null;
    return campaign.campaignProviderKey;
  };

  const filteredCampaigns = emailCampaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    
      
        
          
            
              Email Campaigns
              
                Create, manage, and track your email marketing campaigns
              
            
            
              
                
                Create Campaign
              
            
          

          
            
              
               setSearchQuery(e.target.value)}
                data-testid="input-search-campaigns"
              />
            
          

      {campaignsLoading ? (
        
          {[1, 2, 3].map((i) => (
            
          ))}
        
      ) : filteredCampaigns.length > 0 ? (
        
          {filteredCampaigns.map((campaign) => (
            
              
                
                  
                    
                      {campaign.name}
                      {getStatusBadge(campaign.status)}
                    
                    {campaign.emailSubject && (
                      
                        Subject: {campaign.emailSubject}
                      
                    )}
                    
                      {getProviderLabel(campaign) && (
                        
                          {campaign.campaignProviderKey === "brevo" ? "Brevo connected" : getProviderLabel(campaign)}
                        
                      )}
                    
                    {(campaign.fromEmail || campaign.replyToEmail) && (
                      
                        {campaign.fromEmail && (
                          
                            Sender: {campaign.senderName ? `${campaign.senderName} ` : ""}
                            &lt;{campaign.fromEmail}&gt;
                          
                        )}
                        {campaign.replyToEmail && Reply-To: {campaign.replyToEmail}}
                      
                    )}
                  
                  
                    {/* Launch button - only for draft campaigns */}
                    {campaign.status === "draft" && (
                       launchMutation.mutate(campaign.id)}
                        disabled={launchMutation.isPending}
                        data-testid={`button-launch-campaign-${campaign.id}`}
                      >
                        {launchMutation.isPending ? (
                          
                        ) : (
                          
                        )}
                        Launch
                      
                    )}

                    {/* Pause button - only for active campaigns */}
                    {campaign.status === "active" && (
                       pauseMutation.mutate(campaign.id)}
                        disabled={pauseMutation.isPending}
                        data-testid={`button-pause-campaign-${campaign.id}`}
                        className="border-amber-300 text-amber-700 hover:bg-amber-50"
                      >
                        {pauseMutation.isPending ? (
                          
                        ) : (
                          
                        )}
                        Pause
                      
                    )}

                    {/* Resume button - only for paused campaigns */}
                    {campaign.status === "paused" && (
                       resumeMutation.mutate(campaign.id)}
                        disabled={resumeMutation.isPending}
                        data-testid={`button-resume-campaign-${campaign.id}`}
                      >
                        {resumeMutation.isPending ? (
                          
                        ) : (
                          
                        )}
                        Resume
                      
                    )}

                    {/* Cancel button - for active or paused campaigns */}
                    {(campaign.status === "active" || campaign.status === "paused") && (
                      
                        
                          
                            {cancelMutation.isPending ? (
                              
                            ) : (
                              
                            )}
                            Cancel
                          
                        
                        
                          
                            Cancel Campaign?
                            
                              This will permanently stop the campaign. Any remaining unsent emails will not be delivered. 
                              This action cannot be undone.
                            
                          
                          
                            Keep Running
                             cancelMutation.mutate(campaign.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Yes, Cancel Campaign
                            
                          
                        
                      
                    )}

                    {/* Edit button - for draft campaigns */}
                    {campaign.status === "draft" && (
                       setLocation(`/campaigns/email/${campaign.id}/edit`)}
                        data-testid={`button-edit-campaign-${campaign.id}`}
                      >
                        
                        Edit
                      
                    )}

                    {/* Requeue button - for cancelled or completed campaigns */}
                    {(campaign.status === "cancelled" || campaign.status === "completed") && (
                       requeueMutation.mutate(campaign.id)}
                        disabled={requeueMutation.isPending}
                        data-testid={`button-requeue-campaign-${campaign.id}`}
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        {requeueMutation.isPending ? (
                          
                        ) : (
                          
                        )}
                        Requeue
                      
                    )}

                    
                      
                        
                        Suppressions
                      
                    
                    
                      
                        
                        Stats
                      
                    
                  
                
              
              
                
                  
                    Type: {campaign.type} | Created: {new Date(campaign.createdAt).toLocaleDateString()}
                  
                  
                
              
            
          ))}
        
      ) : (
        
           {
              // Navigate using wouter by changing the href
              window.location.href = '/campaigns/email/create';
            }}
          />
        
      )}
        
      
    
  );
}