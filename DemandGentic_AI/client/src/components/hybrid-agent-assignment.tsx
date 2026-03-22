import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Check,
  Phone,
  PhoneCall
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
  const [isTestCallDialogOpen, setIsTestCallDialogOpen] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [selectedTestAgent, setSelectedTestAgent] = useState(null);
  const [selectedHumans, setSelectedHumans] = useState([]);
  const [selectedAI, setSelectedAI] = useState([]);
  const { toast } = useToast();

  const { data: assignedAgents, isLoading: agentsLoading } = useQuery({
    queryKey: ['/api/campaigns', campaignId, 'hybrid-agents'],
  });

  const { data: availableHumans = [] } = useQuery({
    queryKey: ['/api/users/agents'],
  });

  const { data: availableVirtual = [] } = useQuery({
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
      const response = await apiRequest('DELETE', `/api/campaigns/${campaignId}/hybrid-agents/${agentType}/${agentId}`);
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

  // Test AI Agent Call mutation
  const testCallMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; virtualAgentId: string; campaignId: string }) => {
      const response = await apiRequest('POST', '/api/ai-calls/test-openai-realtime', data);
      return response.json();
    },
    onSuccess: (data) => {
      setIsTestCallDialogOpen(false);
      setTestPhoneNumber("");
      setSelectedTestAgent(null);
      toast({ 
        title: "Test Call Initiated", 
        description: `Calling ${testPhoneNumber}... Your phone should ring shortly!` 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Test Call Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleTestCall = () => {
    if (!testPhoneNumber || testPhoneNumber.length  {
    setSelectedTestAgent(agent);
    setIsTestCallDialogOpen(true);
  };

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
      
        
        
      
    );
  }

  return (
    
      
        
          Campaign Agents
          
            Assign human and AI agents to work on this campaign
          
        
        
          
            
              
              Add Agents
            
          
          
            
              Add Agents to Campaign
              
                Select human agents and AI virtual agents to assign to this campaign
              
            
            
            
              
                
                  
                  Human Agents ({selectedHumans.length})
                
                
                  
                  AI Agents ({selectedAI.length})
                
              
              
              
                
                  {unassignedHumans.length === 0 ? (
                    
                      
                      No more human agents available
                    
                  ) : (
                    
                      {unassignedHumans.map(agent => (
                         toggleHuman(agent.id)}
                          data-testid={`agent-human-${agent.id}`}
                        >
                           e.stopPropagation()}
                            onCheckedChange={() => toggleHuman(agent.id)}
                          />
                          
                            
                          
                          
                            
                              {agent.firstName} {agent.lastName}
                            
                            
                              {agent.email}
                            
                          
                          
                            {agent.role}
                          
                        
                      ))}
                    
                  )}
                
              
              
              
                
                  {unassignedVirtual.length === 0 ? (
                    
                      
                      No more AI agents available
                      Create agents in Virtual Agents settings
                    
                  ) : (
                    
                      {unassignedVirtual.map(agent => (
                         toggleAI(agent.id)}
                          data-testid={`agent-virtual-${agent.id}`}
                        >
                           e.stopPropagation()}
                            onCheckedChange={() => toggleAI(agent.id)}
                          />
                          
                            
                          
                          
                            {agent.name}
                            {agent.description && (
                              
                                {agent.description}
                              
                            )}
                          
                          
                            {agent.provider}
                          
                        
                      ))}
                    
                  )}
                
              
            
            
            
               setIsAddDialogOpen(false)}>
                Cancel
              
              
                {assignMutation.isPending ? (
                  
                ) : (
                  
                )}
                Add {selectedHumans.length + selectedAI.length} Agent(s)
              
            
          
        
      

      
        
          
            
              
              Human Agents
            
            
              {assignedAgents?.humanAgents.length || 0} assigned
            
          
          
            {!assignedAgents?.humanAgents.length ? (
              
                
                No human agents assigned
              
            ) : (
              
                {assignedAgents.humanAgents.map(agent => (
                  
                    
                      
                        
                      
                      
                        {agent.name}
                        
                          Since {format(new Date(agent.assignedAt), 'MMM d')}
                        
                      
                    
                     removeMutation.mutate({ agentId: agent.id, agentType: 'human' })}
                      disabled={removeMutation.isPending}
                      data-testid={`remove-human-${agent.id}`}
                    >
                      
                    
                  
                ))}
              
            )}
          
        

        
          
            
              
              AI Agents
            
            
              {assignedAgents?.aiAgents.length || 0} assigned
            
          
          
            {!assignedAgents?.aiAgents.length ? (
              
                
                No AI agents assigned
              
            ) : (
              
                {assignedAgents.aiAgents.map(agent => (
                  
                    
                      
                        
                      
                      
                        {agent.name}
                        
                          {agent.provider} - Since {format(new Date(agent.assignedAt), 'MMM d')}
                        
                      
                    
                    
                       openTestCallDialog(agent)}
                        disabled={testCallMutation.isPending}
                        data-testid={`test-ai-${agent.id}`}
                        title="Test AI Agent"
                      >
                        
                      
                       removeMutation.mutate({ agentId: agent.id, agentType: 'ai' })}
                        disabled={removeMutation.isPending}
                        data-testid={`remove-ai-${agent.id}`}
                      >
                        
                      
                    
                  
                ))}
              
            )}
          
        
      

      {/* Test AI Agent Call Dialog */}
      
        
          
            
              
              Test AI Agent
            
            
              Make a test call to verify AI agent scripts and voice quality
            
          
          
          {selectedTestAgent && (
            
              
                
                  
                
                
                  {selectedTestAgent.name}
                  
                    {selectedTestAgent.provider} Provider
                  
                
              
              
              
                Phone Number to Call
                 setTestPhoneNumber(e.target.value)}
                  data-testid="input-test-phone"
                />
                
                  Enter your phone number with country code. The AI agent will call you for testing.
                
              
            
          )}
          
          
             setIsTestCallDialogOpen(false)}>
              Cancel
            
            
              {testCallMutation.isPending ? (
                <>
                  
                  Calling...
                
              ) : (
                <>
                  
                  Make Test Call
                
              )}
            
          
        
      
    
  );
}