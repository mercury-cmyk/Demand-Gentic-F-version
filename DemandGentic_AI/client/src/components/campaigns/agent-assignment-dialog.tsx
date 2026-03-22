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
  const [selectedAgentIds, setSelectedAgentIds] = useState([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset selection when dialog opens/closes or campaign changes
  useEffect(() => {
    if (open) {
      setSelectedAgentIds([]);
    }
  }, [open, campaign?.id]);

  // Fetch available agents
  const { data: agents = [], isLoading: agentsLoading } = useQuery({
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
    
      
        
          Assign Agents to Campaign
          
            Select agents to assign to{' '}
            {campaign?.name || 'this campaign'}. Agents
            assigned to other campaigns will be automatically reassigned.
          
        

        
          
            Available Agents
            {agentsLoading ? (
              
                
                
                
              
            ) : agents.length === 0 ? (
              
                No agents available
                Create agents in Settings to assign them to campaigns.
              
            ) : (
              
                {agents.map(agent => {
                  const isSelected = selectedAgentIds.includes(agent.id);
                  const isAssignedToOther =
                    agent.currentAssignment &&
                    agent.currentAssignment.campaignId !== campaign?.id;

                  return (
                    
                       toggleAgentSelection(agent.id)}
                      />
                      
                        
                          {agent.firstName} {agent.lastName}
                        
                        @{agent.username}
                        {agent.currentAssignment && (
                          
                            
                            
                              Currently assigned to: {agent.currentAssignment.campaignName}
                            
                            {isAssignedToOther && (
                               {
                                  e.stopPropagation();
                                  releaseAgentMutation.mutate({
                                    campaignId: agent.currentAssignment!.campaignId.toString(),
                                    agentId: agent.id,
                                  });
                                }}
                                disabled={releaseAgentMutation.isPending}
                              >
                                Release
                              
                            )}
                          
                        )}
                      
                      {isSelected && }
                    
                  );
                })}
              
            )}
            
              Selected: {selectedAgentIds.length} agent{selectedAgentIds.length !== 1 ? 's' : ''}
            
          
        

        
           onOpenChange(false)}>
            Cancel
          
          
            {assignAgentsMutation.isPending ? 'Assigning...' : 'Assign Agents'}
          
        
      
    
  );
}