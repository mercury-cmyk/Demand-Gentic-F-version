/**
 * Phone Campaign Panel Component
 *
 * Phone-specific functionality panel for campaign management.
 * Includes queue statistics, agent assignment, and AI call controls.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  UserPlus,
  Phone,
  PhoneOutgoing,
  Play,
  Pause,
  Bot,
  Loader2,
  AlertCircle,
  BarChart,
  RefreshCw,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export interface QueueStats {
  total: number;
  queued: number;
  inProgress: number;
  completed: number;
  removed: number;
  removedBreakdown: Record<string, number>;
  agents: number;
  suppression?: {
    totalSuppressed: number;
    suppressionRate: number;
    suppressedByAccount: number;
    suppressedByContact: number;
    suppressedByDomain: number;
    suppressedByEmail: number;
  };
}

export interface PhoneCampaignPanelProps {
  campaign: {
    id: string | number;
    name: string;
    status: string;
    dialMode?: string;
  };
  queueStats?: QueueStats;
  onAssignAgents?: () => void;
  onToggleStatus?: () => void;
  isToggling?: boolean;
  className?: string;
}

export function PhoneCampaignPanel({
  campaign,
  queueStats,
  onAssignAgents,
  onToggleStatus,
  isToggling,
  className,
}: PhoneCampaignPanelProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAiAgent = campaign.dialMode === 'ai_agent' || campaign.dialMode === 'sql';

  // Sync Queue mutation - re-populates queue from assigned audience list
  const syncQueueMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await apiRequest('POST', `/api/campaigns/${campaignId}/queue/populate`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/queue-stats'] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}/queue`] });
      toast({
        title: 'Queue Synced',
        description: data.message || `Enqueued ${data.enqueuedCount || 0} contacts.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Queue Sync Failed',
        description: error.message || 'Failed to sync queue from audience list',
        variant: 'destructive',
      });
    },
  });

  const handleSyncQueue = () => {
    if (confirm('Sync queue from audience list? This will add any missing contacts to the queue.')) {
      syncQueueMutation.mutate(campaign.id.toString());
    }
  };

  // AI Calls mutation
  const startAiCallsMutation = useMutation({
    mutationFn: async ({ campaignId, limit }: { campaignId: string; limit: number }) => {
      return await apiRequest('POST', '/api/ai-calls/batch-start', {
        campaignId,
        limit,
        delayBetweenCalls: 3000,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/queue-stats'] });
      toast({
        title: 'AI Calls Started',
        description: `Started ${data.callsInitiated || 0} AI calls. ${data.skipped || 0} contacts skipped.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error Starting AI Calls',
        description: error.message || 'Failed to start AI calls',
        variant: 'destructive',
      });
    },
  });

  const handleStartAiCalls = () => {
    if (confirm('Start AI calls for up to 10 contacts from the queue?')) {
      startAiCallsMutation.mutate({
        campaignId: campaign.id.toString(),
        limit: 10,
      });
    }
  };

  const completedPercent = queueStats?.total
    ? Math.round((queueStats.completed / queueStats.total) * 100)
    : 0;

  return (
    <div className={className}>
      {/* Queue Statistics Grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">In Queue</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {queueStats?.queued || 0}
          </p>
        </div>
        <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
          <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">In Progress</p>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
            {queueStats?.inProgress || 0}
          </p>
        </div>
        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">Completed</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
            {queueStats?.completed || 0}
          </p>
        </div>
        <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Filtered Out</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
            {queueStats?.removed || 0}
          </p>
        </div>
      </div>

      {/* Removed/Filtered Breakdown */}
      {queueStats?.removed > 0 && queueStats.removedBreakdown && Object.keys(queueStats.removedBreakdown).length > 0 && (
        <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">
              Filtered Contacts Breakdown
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(queueStats.removedBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between">
                  <span className="text-orange-600/80 dark:text-orange-400/80 capitalize">
                    {reason.replace(/_/g, ' ')}:
                  </span>
                  <span className="font-medium text-orange-700 dark:text-orange-300">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-4 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Queue Progress</span>
          <span className="font-medium">{completedPercent}%</span>
        </div>
        <Progress value={completedPercent} className="h-2" />
      </div>

      {/* Agents & Total Queue Info */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-4">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {queueStats?.agents || 0} Agent{queueStats?.agents !== 1 ? 's' : ''} Assigned
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{queueStats?.total || 0} Total in Queue Table</span>
        </div>
      </div>

      {/* Suppression Statistics */}
      {queueStats?.suppression && queueStats.suppression.totalSuppressed > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                Suppression Matches
              </span>
            </div>
            <Badge variant="destructive" className="text-xs">
              {queueStats.suppression.totalSuppressed} contacts (
              {Math.round(queueStats.suppression.suppressionRate * 100)}%)
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {queueStats.suppression.suppressedByAccount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-red-600/80 dark:text-red-400/80">By Account:</span>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {queueStats.suppression.suppressedByAccount}
                </span>
              </div>
            )}
            {queueStats.suppression.suppressedByContact > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-red-600/80 dark:text-red-400/80">By Contact:</span>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {queueStats.suppression.suppressedByContact}
                </span>
              </div>
            )}
            {queueStats.suppression.suppressedByDomain > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-red-600/80 dark:text-red-400/80">By Domain:</span>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {queueStats.suppression.suppressedByDomain}
                </span>
              </div>
            )}
            {queueStats.suppression.suppressedByEmail > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-red-600/80 dark:text-red-400/80">By Email:</span>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {queueStats.suppression.suppressedByEmail}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLocation(`/campaigns/${campaign.id}/queue`)}
        >
          <Users className="w-4 h-4 mr-2" />
          View Queue
        </Button>

        {onAssignAgents && (
          <Button size="sm" variant="outline" onClick={onAssignAgents}>
            <UserPlus className="w-4 h-4 mr-2" />
            Assign Agents
          </Button>
        )}

        {onToggleStatus && (
          <Button size="sm" variant="outline" onClick={onToggleStatus} disabled={isToggling}>
            {campaign.status === 'active' ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Resume
              </>
            )}
          </Button>
        )}

        {isAiAgent && campaign.status === 'active' && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleStartAiCalls}
            disabled={startAiCallsMutation.isPending}
          >
            {startAiCallsMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <PhoneOutgoing className="w-4 h-4 mr-2" />
            )}
            Start AI Calls
          </Button>
        )}

        {isAiAgent && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLocation(`/campaigns/${campaign.id}/test`)}
          >
            <Bot className="w-4 h-4 mr-2" />
            Test AI Agent
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncQueue}
          disabled={syncQueueMutation.isPending}
        >
          {syncQueueMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Sync Queue
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setLocation(`/reports?campaign=${campaign.id}`)}
        >
          <BarChart className="w-4 h-4 mr-2" />
          Reports
        </Button>
      </div>
    </div>
  );
}
