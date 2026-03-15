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
    <div className={className}>
      {/* Email Statistics Grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Delivered</p>
          </div>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {isLoading ? '-' : emailStats?.delivered || 0}
          </p>
          <p className="text-xs text-blue-600/70 dark:text-blue-400/70">{deliveryRate}% rate</p>
        </div>
        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-green-600 dark:text-green-400" />
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">Opens</p>
          </div>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
            {isLoading ? '-' : emailStats?.opens || 0}
          </p>
          <p className="text-xs text-green-600/70 dark:text-green-400/70">{openRate}% rate</p>
        </div>
        <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-900">
          <div className="flex items-center gap-2 mb-1">
            <MousePointerClick className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Clicks</p>
          </div>
          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
            {isLoading ? '-' : emailStats?.clicks || 0}
          </p>
          <p className="text-xs text-purple-600/70 dark:text-purple-400/70">{clickRate}% CTR</p>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-3 mb-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Open Rate</span>
            <span className="font-medium">{openRate}%</span>
          </div>
          <Progress value={openRate} className="h-2" />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Click-Through Rate</span>
            <span className="font-medium">{clickRate}%</span>
          </div>
          <Progress value={clickRate} className="h-2" />
        </div>
      </div>

      {/* Negative Metrics */}
      {emailStats && (emailStats.unsubscribes > 0 || emailStats.spamComplaints > 0) && (
        <div className="flex gap-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900 mb-4">
          {emailStats.unsubscribes > 0 && (
            <div className="flex items-center gap-2">
              <UserMinus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-amber-700 dark:text-amber-300">
                {emailStats.unsubscribes} unsubscribes
              </span>
            </div>
          )}
          {emailStats.spamComplaints > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">
                {emailStats.spamComplaints} spam complaints
              </span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Campaign Controls
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {campaign.status === 'draft' && 'Review the draft, then launch when the route is ready.'}
              {campaign.status === 'active' && 'Sending is live. Pause the run or review reporting as engagement updates.'}
              {campaign.status === 'paused' && 'The campaign is paused. Resume when the audience and content are ready.'}
              {(campaign.status === 'completed' || campaign.status === 'cancelled') && 'Create a fresh draft from this campaign to iterate without touching the original record.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {campaign.status === 'draft' && (
              <>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => launchMutation.mutate(campaign.id.toString())}
                  disabled={launchMutation.isPending}
                >
                  {launchMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Send Now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setLocation(`/campaigns/email/${campaign.id}/edit`)}
                >
                  <Edit className="h-4 w-4" />
                  Edit Draft
                </Button>
              </>
            )}

            {campaign.status === 'active' && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => pauseMutation.mutate(campaign.id.toString())}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
                Pause
              </Button>
            )}

            {campaign.status === 'paused' && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => resumeMutation.mutate(campaign.id.toString())}
                disabled={resumeMutation.isPending}
              >
                {resumeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Resume
              </Button>
            )}

            {(campaign.status === 'completed' || campaign.status === 'cancelled') && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => requeueMutation.mutate(campaign.id.toString())}
                disabled={requeueMutation.isPending}
              >
                {requeueMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Duplicate Draft
              </Button>
            )}

            {canOpenReports && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => setLocation(`/campaigns/email/${campaign.id}/reports`)}
              >
                <BarChart3 className="h-4 w-4" />
                Reports
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <MoreHorizontal className="h-4 w-4" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLocation(`/campaigns/${campaign.id}/suppressions`)}>
                  <Shield className="mr-2 h-4 w-4" />
                  Suppressions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation(`/campaigns/email/${campaign.id}/edit`)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Open Builder
                </DropdownMenuItem>
                {(campaign.status === 'active' || campaign.status === 'paused') && (
                  <>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={(event) => event.preventDefault()}
                        >
                          <StopCircle className="mr-2 h-4 w-4" />
                          Cancel Campaign
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Campaign?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently stop the campaign. Any remaining unsent emails will not be
                            delivered. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Running</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => cancelMutation.mutate(campaign.id.toString())}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Yes, Cancel Campaign
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
