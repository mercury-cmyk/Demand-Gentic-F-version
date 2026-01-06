import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bot, 
  UserCircle, 
  Plus, 
  Trash2, 
  Users,
  Loader2,
  Check
} from "lucide-react";
import { format } from "date-fns";

interface HumanAgent {
  id: string;
  name: string;
  type: 'human';
  assignedAt: string;
}

interface AIAgent {
  id: string;
  name: string;
  provider: string;
  type: 'ai';
  assignedAt: string;
}

interface CampaignAgents {
  humanAgents: HumanAgent[];
  aiAgents: AIAgent[];
  totalAgents: number;
}

interface AvailableHumanAgent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface AvailableVirtualAgent {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  isActive: boolean;
}

interface Props {
  campaignId: string;
}

export function HybridAgentAssignment({ campaignId }: Props) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedHumans, setSelectedHumans] = useState<string[]>([]);
  const [selectedAI, setSelectedAI] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: assignedAgents, isLoading: agentsLoading } = useQuery<CampaignAgents>({
    queryKey: ['/api/campaigns', campaignId, 'hybrid-agents'],
  });

  const { data: availableHumans = [] } = useQuery<AvailableHumanAgent[]>({
    queryKey: ['/api/users/agents'],
  });

  const { data: availableVirtual = [] } = useQuery<AvailableVirtualAgent[]>({
    queryKey: ['/api/virtual-agents'],
  });

  const assignMutation = useMutation({
    mutationFn: async (data: { humanAgentIds: string[]; virtualAgentIds: string[] }) => {
      const response = await apiRequest('POST', `/api/campaigns/${campaignId}/hybrid-agents`, data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'hybrid-agents'] });
      setIsAddDialogOpen(false);
      setSelectedHumans([]);
      setSelectedAI([]);
      toast({ 
        title: "Agents assigned", 
        description: `Assigned ${data.humanAgentsAssigned} human and ${data.virtualAgentsAssigned} AI agents` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to assign agents", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ agentId, agentType }: { agentId: string; agentType: 'human' | 'ai' }) => {
      const response = await apiRequest('DELETE', `/api/campaigns/${campaignId}/hybrid-agents/${agentId}?type=${agentType}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'hybrid-agents'] });
      toast({ title: "Agent removed from campaign" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove agent", description: error.message, variant: "destructive" });
    },
  });

  const handleAddAgents = () => {
    if (selectedHumans.length === 0 && selectedAI.length === 0) {
      toast({ title: "Select at least one agent", variant: "destructive" });
      return;
    }
    assignMutation.mutate({
      humanAgentIds: selectedHumans,
      virtualAgentIds: selectedAI,
    });
  };

  const toggleHuman = (id: string) => {
    setSelectedHumans(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAI = (id: string) => {
    setSelectedAI(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const assignedHumanIds = new Set(assignedAgents?.humanAgents.map(a => a.id) || []);
  const assignedAIIds = new Set(assignedAgents?.aiAgents.map(a => a.id) || []);

  const unassignedHumans = availableHumans.filter(h => !assignedHumanIds.has(h.id));
  const unassignedVirtual = availableVirtual.filter(v => v.isActive && !assignedAIIds.has(v.id));

  if (agentsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Campaign Agents</h3>
          <p className="text-sm text-muted-foreground">
            Assign human and AI agents to work on this campaign
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-agents">
              <Plus className="h-4 w-4 mr-2" />
              Add Agents
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Agents to Campaign</DialogTitle>
              <DialogDescription>
                Select human agents and AI virtual agents to assign to this campaign
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="human" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="human" data-testid="tab-human-agents">
                  <UserCircle className="h-4 w-4 mr-2" />
                  Human Agents ({selectedHumans.length})
                </TabsTrigger>
                <TabsTrigger value="ai" data-testid="tab-ai-agents">
                  <Bot className="h-4 w-4 mr-2" />
                  AI Agents ({selectedAI.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="human" className="mt-4">
                <ScrollArea className="h-[300px] pr-4">
                  {unassignedHumans.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No more human agents available</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {unassignedHumans.map(agent => (
                        <div 
                          key={agent.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                          onClick={() => toggleHuman(agent.id)}
                          data-testid={`agent-human-${agent.id}`}
                        >
                          <Checkbox 
                            checked={selectedHumans.includes(agent.id)}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => toggleHuman(agent.id)}
                          />
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                            <UserCircle className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">
                              {agent.firstName} {agent.lastName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {agent.email}
                            </div>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {agent.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="ai" className="mt-4">
                <ScrollArea className="h-[300px] pr-4">
                  {unassignedVirtual.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No more AI agents available</p>
                      <p className="text-xs mt-1">Create agents in Virtual Agents settings</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {unassignedVirtual.map(agent => (
                        <div 
                          key={agent.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                          onClick={() => toggleAI(agent.id)}
                          data-testid={`agent-virtual-${agent.id}`}
                        >
                          <Checkbox 
                            checked={selectedAI.includes(agent.id)}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => toggleAI(agent.id)}
                          />
                          <div className="h-9 w-9 rounded-full bg-chart-2/10 flex items-center justify-center">
                            <Bot className="h-5 w-5 text-chart-2" />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">{agent.name}</div>
                            {agent.description && (
                              <div className="text-sm text-muted-foreground truncate max-w-[250px]">
                                {agent.description}
                              </div>
                            )}
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {agent.provider}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddAgents}
                disabled={assignMutation.isPending || (selectedHumans.length === 0 && selectedAI.length === 0)}
                data-testid="button-confirm-add"
              >
                {assignMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Add {selectedHumans.length + selectedAI.length} Agent(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Human Agents</CardTitle>
            </div>
            <CardDescription>
              {assignedAgents?.humanAgents.length || 0} assigned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!assignedAgents?.humanAgents.length ? (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No human agents assigned</p>
              </div>
            ) : (
              <div className="space-y-2">
                {assignedAgents.humanAgents.map(agent => (
                  <div 
                    key={agent.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    data-testid={`assigned-human-${agent.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserCircle className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{agent.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Since {format(new Date(agent.assignedAt), 'MMM d')}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate({ agentId: agent.id, agentType: 'human' })}
                      disabled={removeMutation.isPending}
                      data-testid={`remove-human-${agent.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-chart-2" />
              <CardTitle className="text-base">AI Agents</CardTitle>
            </div>
            <CardDescription>
              {assignedAgents?.aiAgents.length || 0} assigned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!assignedAgents?.aiAgents.length ? (
              <div className="text-center py-6 text-muted-foreground">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No AI agents assigned</p>
              </div>
            ) : (
              <div className="space-y-2">
                {assignedAgents.aiAgents.map(agent => (
                  <div 
                    key={agent.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    data-testid={`assigned-ai-${agent.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-chart-2/10 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-chart-2" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{agent.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {agent.provider} - Since {format(new Date(agent.assignedAt), 'MMM d')}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate({ agentId: agent.id, agentType: 'ai' })}
                      disabled={removeMutation.isPending}
                      data-testid={`remove-ai-${agent.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
