/**
 * Agent Assignment Dialog Component
 *
 * Reusable dialog for assigning agents to campaigns.
 * Supports multi-agent selection and shows current assignments.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  currentAssignment?: {
    campaignId: string | number;
    campaignName: string;
  };
}

export interface AgentAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: {
    id: string | number;
    name: string;
  } | null;
  onSuccess?: () => void;
}

export function AgentAssignmentDialog({
  open,
  onOpenChange,
  campaign,
  onSuccess,
}: AgentAssignmentDialogProps) {
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset selection when dialog opens/closes or campaign changes
  useEffect(() => {
    if (open) {
      setSelectedAgentIds([]);
    }
  }, [open, campaign?.id]);

  // Fetch available agents
  const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ['/api/agents'],
    enabled: open,
  });

  // Assign agents mutation
  const assignAgentsMutation = useMutation({
    mutationFn: async ({ campaignId, agentIds }: { campaignId: string; agentIds: string[] }) => {
      return await apiRequest('POST', `/api/campaigns/${campaignId}/agents`, { agentIds });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/queue-stats'] });

      const messages = ['Agents assigned successfully'];
      if (data.queuePopulated) {
        messages.push(
          `Queue populated with ${data.totalQueueItemsCreated || data.contactsEnqueued || 0} contacts`
        );
      }
      if (data.queueItemsAssigned > 0) {
        messages.push(`${data.queueItemsAssigned} contacts assigned to agents`);
      }

      toast({
        title: 'Success',
        description: messages.join('. '),
      });

      onOpenChange(false);
      setSelectedAgentIds([]);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign agents',
        variant: 'destructive',
      });
    },
  });

  // Release agent mutation
  const releaseAgentMutation = useMutation({
    mutationFn: async ({ campaignId, agentId }: { campaignId: string; agentId: string }) => {
      return await apiRequest('DELETE', `/api/campaigns/${campaignId}/agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/queue-stats'] });
      toast({
        title: 'Agent Released',
        description: 'Agent has been released from the campaign.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to release agent',
        variant: 'destructive',
      });
    },
  });

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]
    );
  };

  const handleAssign = () => {
    if (!campaign) return;

    if (selectedAgentIds.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one agent',
        variant: 'destructive',
      });
      return;
    }

    assignAgentsMutation.mutate({
      campaignId: campaign.id.toString(),
      agentIds: selectedAgentIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign Agents to Campaign</DialogTitle>
          <DialogDescription>
            Select agents to assign to{' '}
            <span className="font-medium">{campaign?.name || 'this campaign'}</span>. Agents
            assigned to other campaigns will be automatically reassigned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Available Agents</Label>
            {agentsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No agents available</p>
                <p className="text-sm mt-1">Create agents in Settings to assign them to campaigns.</p>
              </div>
            ) : (
              <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                {agents.map(agent => {
                  const isSelected = selectedAgentIds.includes(agent.id);
                  const isAssignedToOther =
                    agent.currentAssignment &&
                    agent.currentAssignment.campaignId !== campaign?.id;

                  return (
                    <div
                      key={agent.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`agent-${agent.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleAgentSelection(agent.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <Label htmlFor={`agent-${agent.id}`} className="font-medium cursor-pointer">
                          {agent.firstName} {agent.lastName}
                        </Label>
                        <p className="text-xs text-muted-foreground truncate">@{agent.username}</p>
                        {agent.currentAssignment && (
                          <div className="flex items-center gap-2 mt-1">
                            <AlertCircle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                            <span className="text-xs text-muted-foreground truncate">
                              Currently assigned to: {agent.currentAssignment.campaignName}
                            </span>
                            {isAssignedToOther && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-2 text-xs flex-shrink-0"
                                onClick={e => {
                                  e.stopPropagation();
                                  releaseAgentMutation.mutate({
                                    campaignId: agent.currentAssignment!.campaignId.toString(),
                                    agentId: agent.id,
                                  });
                                }}
                                disabled={releaseAgentMutation.isPending}
                              >
                                Release
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Selected: {selectedAgentIds.length} agent{selectedAgentIds.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={assignAgentsMutation.isPending || selectedAgentIds.length === 0}
          >
            {assignAgentsMutation.isPending ? 'Assigning...' : 'Assign Agents'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
