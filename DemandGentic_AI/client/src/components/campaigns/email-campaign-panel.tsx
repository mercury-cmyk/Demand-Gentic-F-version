/**
 * Email Campaign Panel Component
 *
 * Email-specific functionality panel for campaign management.
 * Includes email stats, launch/pause controls, and suppression management.
 */

import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Play,
  Pause,
  StopCircle,
  RotateCcw,
  RefreshCw,
  Edit,
  Shield,
  BarChart3,
  Loader2,
  Mail,
  MousePointerClick,
  UserMinus,
  AlertTriangle,
  MoreHorizontal,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface EmailStats {
  totalRecipients: number;
  delivered: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  spamComplaints: number;
}

export interface EmailCampaignPanelProps {
  campaign: {
    id: string | number;
    name: string;
    status: string;
    senderName?: string | null;
    fromEmail?: string | null;
    replyToEmail?: string | null;
    campaignProviderName?: string | null;
    campaignProviderKey?: string | null;
  };
  emailStats?: EmailStats | null;
  isLoading?: boolean;
  className?: string;
}

export function EmailCampaignPanel({
  campaign,
  emailStats,
  isLoading,
  className,
}: EmailCampaignPanelProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Launch mutation
  const launchMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/campaigns/${id}/launch`, undefined, { timeout: 120000 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({
        title: 'Success',
        description: 'Campaign launched successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to launch campaign',
        variant: 'destructive',
      });
    },
  });

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('PATCH', `/api/campaigns/${id}`, { status: 'paused' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({
        title: 'Campaign Paused',
        description: 'Email sending has been paused. You can resume at any time.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to pause campaign',
        variant: 'destructive',
      });
    },
  });

  // Resume mutation
  const resumeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('PATCH', `/api/campaigns/${id}`, { status: 'active' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({
        title: 'Campaign Resumed',
        description: 'Email sending has resumed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to resume campaign',
        variant: 'destructive',
      });
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('PATCH', `/api/campaigns/${id}`, { status: 'cancelled' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({
        title: 'Campaign Cancelled',
        description: 'Campaign has been cancelled. Remaining emails will not be sent.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel campaign',
        variant: 'destructive',
      });
    },
  });

  // Requeue/Clone mutation
  const requeueMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/campaigns/${id}/clone`);
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      const newCampaign = await response.json();
      toast({
        title: 'Campaign Requeued',
        description: 'A new draft campaign has been created. You can edit and launch it.',
      });
      setLocation(`/campaigns/email/${newCampaign.id}/edit`);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to requeue campaign',
        variant: 'destructive',
      });
    },
  });

  // Calculate rates
  const openRate = emailStats?.totalRecipients
    ? Math.round((emailStats.opens / emailStats.totalRecipients) * 100)
    : 0;
  const clickRate = emailStats?.opens
    ? Math.round((emailStats.clicks / emailStats.opens) * 100)
    : 0;
  const deliveryRate = emailStats?.totalRecipients
    ? Math.round((emailStats.delivered / emailStats.totalRecipients) * 100)
    : 0;
  const canOpenReports = campaign.status !== 'draft' || Boolean(emailStats?.totalRecipients);

  return (
    
      {/* Email Statistics Grid */}
      
        
          
            
            Delivered
          
          
            {isLoading ? '-' : emailStats?.delivered || 0}
          
          {deliveryRate}% rate
        
        
          
            
            Opens
          
          
            {isLoading ? '-' : emailStats?.opens || 0}
          
          {openRate}% rate
        
        
          
            
            Clicks
          
          
            {isLoading ? '-' : emailStats?.clicks || 0}
          
          {clickRate}% CTR
        
      

      {/* Progress Bars */}
      
        
          
            Open Rate
            {openRate}%
          
          
        
        
          
            Click-Through Rate
            {clickRate}%
          
          
        
      

      {/* Negative Metrics */}
      {emailStats && (emailStats.unsubscribes > 0 || emailStats.spamComplaints > 0) && (
        
          {emailStats.unsubscribes > 0 && (
            
              
              
                {emailStats.unsubscribes} unsubscribes
              
            
          )}
          {emailStats.spamComplaints > 0 && (
            
              
              
                {emailStats.spamComplaints} spam complaints
              
            
          )}
        
      )}

      {(campaign.fromEmail || campaign.replyToEmail || campaign.campaignProviderName || campaign.campaignProviderKey) && (
        
          
            {(campaign.campaignProviderName || campaign.campaignProviderKey) && (
              
                {campaign.campaignProviderKey === 'brevo'
                  ? 'Brevo connected'
                  : campaign.campaignProviderName || campaign.campaignProviderKey}
              
            )}
          
          {campaign.fromEmail && (
            
              Sender: {campaign.senderName ? `${campaign.senderName} ` : ""}&lt;{campaign.fromEmail}&gt;
            
          )}
          {campaign.replyToEmail && (
            Reply-To: {campaign.replyToEmail}
          )}
        
      )}

      
        
          
            
              Campaign Controls
            
            
              {campaign.status === 'draft' && 'Review the draft, then launch when the route is ready.'}
              {campaign.status === 'active' && 'Sending is live. Pause the run or review reporting as engagement updates.'}
              {campaign.status === 'paused' && 'The campaign is paused. Resume when the audience and content are ready.'}
              {(campaign.status === 'completed' || campaign.status === 'cancelled') && 'Create a fresh draft from this campaign to iterate without touching the original record.'}
            
          
          
            {campaign.status === 'draft' && (
              <>
                 launchMutation.mutate(campaign.id.toString())}
                  disabled={launchMutation.isPending}
                >
                  {launchMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  Send Now
                
                 setLocation(`/campaigns/email/${campaign.id}/edit`)}
                >
                  
                  Edit Draft
                
              
            )}

            {campaign.status === 'active' && (
               pauseMutation.mutate(campaign.id.toString())}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  
                ) : (
                  
                )}
                Pause
              
            )}

            {campaign.status === 'paused' && (
               resumeMutation.mutate(campaign.id.toString())}
                disabled={resumeMutation.isPending}
              >
                {resumeMutation.isPending ? (
                  
                ) : (
                  
                )}
                Resume
              
            )}

            {(campaign.status === 'completed' || campaign.status === 'cancelled') && (
               requeueMutation.mutate(campaign.id.toString())}
                disabled={requeueMutation.isPending}
              >
                {requeueMutation.isPending ? (
                  
                ) : (
                  
                )}
                Duplicate Draft
              
            )}

            {canOpenReports && (
               setLocation(`/campaigns/email/${campaign.id}/reports`)}
              >
                
                Reports
              
            )}

            
              
                
                  
                  More
                
              
              
                 setLocation(`/campaigns/${campaign.id}/suppressions`)}>
                  
                  Suppressions
                
                 setLocation(`/campaigns/email/${campaign.id}/edit`)}>
                  
                  Open Builder
                
                {(campaign.status === 'active' || campaign.status === 'paused') && (
                  <>
                    
                    
                      
                         event.preventDefault()}
                        >
                          
                          Cancel Campaign
                        
                      
                      
                        
                          Cancel Campaign?
                          
                            This will permanently stop the campaign. Any remaining unsent emails will not be
                            delivered. This action cannot be undone.
                          
                        
                        
                          Keep Running
                           cancelMutation.mutate(campaign.id.toString())}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Yes, Cancel Campaign
                          
                        
                      
                    
                  
                )}
              
            
          
        
      
    
  );
}