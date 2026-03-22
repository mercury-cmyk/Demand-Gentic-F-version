/**
 * Buyer Journey Board
 *
 * Kanban-style board for visualizing and managing accounts through the buyer journey.
 * Supports drag-and-drop between stages.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  User,
  MoreVertical,
  Sparkles,
  ArrowRight,
  Zap,
  Clock,
  Target,
  Users,
  TrendingUp,
  CheckCircle2,
  XCircle,
  UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Types
interface PipelineAccount {
  id: string;
  pipelineId: string;
  accountId: string;
  accountName: string;
  accountDomain?: string;
  accountIndustry?: string;
  assignedAeId?: string;
  aeName?: string;
  journeyStage: string;
  priorityScore: number;
  readinessScore: number;
  aiRecommendation?: string;
  touchpointCount: number;
  convertedOpportunityId?: string;
  lastActivityAt?: string;
}

interface PipelineAccountsResponse {
  accounts: PipelineAccount[];
  stageCounts: Record;
  total: number;
}

interface Props {
  pipelineId: string;
  onAssignClick?: (accountIds: string[]) => void;
  onConvertClick?: (accountId: string) => void;
}

// Journey stage configuration
const JOURNEY_STAGES = [
  { value: 'unassigned', label: 'Unassigned', color: 'bg-gray-500', borderColor: 'border-gray-500', icon: Clock },
  { value: 'assigned', label: 'Assigned', color: 'bg-blue-500', borderColor: 'border-blue-500', icon: User },
  { value: 'outreach', label: 'Outreach', color: 'bg-cyan-500', borderColor: 'border-cyan-500', icon: Target },
  { value: 'engaged', label: 'Engaged', color: 'bg-purple-500', borderColor: 'border-purple-500', icon: Users },
  { value: 'qualifying', label: 'Qualifying', color: 'bg-orange-500', borderColor: 'border-orange-500', icon: TrendingUp },
  { value: 'qualified', label: 'Qualified', color: 'bg-green-500', borderColor: 'border-green-500', icon: CheckCircle2 },
];

// Exclude disqualified and on_hold from main board
const INACTIVE_STAGES = ['disqualified', 'on_hold'];

export function BuyerJourneyBoard({ pipelineId, onAssignClick, onConvertClick }: Props) {
  const { toast } = useToast();
  const [aeFilter, setAeFilter] = useState("all");
  const [draggedAccountId, setDraggedAccountId] = useState(null);

  // Fetch pipeline accounts
  const { data, isLoading } = useQuery({
    queryKey: ["/api/pipelines", pipelineId, "accounts", "all", aeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (aeFilter !== "all") params.set("aeId", aeFilter);
      const response = await apiRequest(
        "GET",
        `/api/pipelines/${pipelineId}/accounts?${params.toString()}`
      );
      return response.json();
    },
    enabled: !!pipelineId,
  });

  // Move stage mutation
  const moveStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      return apiRequest("POST", `/api/pipeline-accounts/${id}/move`, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update stage",
        variant: "destructive",
      });
    },
  });

  // Convert to opportunity mutation
  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/pipeline-accounts/${id}/convert`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "opportunities"] });
      toast({ title: "Success", description: "Account converted to opportunity" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to convert",
        variant: "destructive",
      });
    },
  });

  // Group accounts by stage
  const accountsByStage = (data?.accounts || []).reduce((acc, account) => {
    const stage = account.journeyStage;
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(account);
    return acc;
  }, {} as Record);

  // Get unique AEs for filter
  const uniqueAes = Array.from(
    new Map(
      (data?.accounts || [])
        .filter((a) => a.assignedAeId && a.aeName)
        .map((a) => [a.assignedAeId, { id: a.assignedAeId!, name: a.aeName! }])
    ).values()
  );

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, accountId: string) => {
    setDraggedAccountId(accountId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    if (draggedAccountId) {
      const account = data?.accounts.find((a) => a.id === draggedAccountId);
      if (account && account.journeyStage !== targetStage) {
        moveStageMutation.mutate({ id: draggedAccountId, stage: targetStage });
      }
    }
    setDraggedAccountId(null);
  };

  const handleDragEnd = () => {
    setDraggedAccountId(null);
  };

  const getStageConfig = (stage: string) => {
    return JOURNEY_STAGES.find((s) => s.value === stage) || JOURNEY_STAGES[0];
  };

  if (isLoading) {
    return (
      
        Loading buyer journey...
      
    );
  }

  return (
    
      {/* Filter Bar */}
      
        Buyer Journey Board
        
          
            
          
          
            All AEs
            {uniqueAes.map((ae) => (
              
                {ae.name}
              
            ))}
          
        
      

      {/* Kanban Board */}
      
        
          {JOURNEY_STAGES.map((stageConfig) => {
            const stageAccounts = accountsByStage[stageConfig.value] || [];
            const Icon = stageConfig.icon;

            return (
               handleDrop(e, stageConfig.value)}
              >
                
                  
                    
                      
                        
                        
                          {stageConfig.label}
                        
                      
                      
                        {stageAccounts.length}
                      
                    
                  

                  
                    
                      
                        {stageAccounts.length === 0 ? (
                          
                            No accounts
                          
                        ) : (
                          stageAccounts
                            .sort((a, b) => b.priorityScore - a.priorityScore)
                            .map((account) => (
                               handleDragStart(e, account.id)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                  "cursor-grab active:cursor-grabbing hover:shadow-md transition-all",
                                  draggedAccountId === account.id && "opacity-50"
                                )}
                              >
                                
                                  
                                    
                                      
                                        {account.accountName}
                                      
                                      {account.accountDomain && (
                                        
                                          {account.accountDomain}
                                        
                                      )}
                                    
                                    
                                      
                                        
                                          
                                        
                                      
                                      
                                        {!account.assignedAeId && (
                                           onAssignClick?.([account.id])}
                                          >
                                            
                                            Assign to AE
                                          
                                        )}

                                        

                                        {JOURNEY_STAGES.filter(
                                          (s) => s.value !== account.journeyStage
                                        ).map((stage) => (
                                          
                                              moveStageMutation.mutate({
                                                id: account.id,
                                                stage: stage.value,
                                              })
                                            }
                                          >
                                            
                                            Move to {stage.label}
                                          
                                        ))}

                                        {account.journeyStage === "qualified" &&
                                          !account.convertedOpportunityId && (
                                            <>
                                              
                                               {
                                                  convertMutation.mutate(account.id);
                                                  onConvertClick?.(account.id);
                                                }}
                                                className="text-primary"
                                              >
                                                
                                                Convert to Opportunity
                                              
                                            
                                          )}

                                        

                                        
                                            moveStageMutation.mutate({
                                              id: account.id,
                                              stage: "disqualified",
                                            })
                                          }
                                          className="text-destructive"
                                        >
                                          
                                          Disqualify
                                        
                                      
                                    
                                  
                                

                                
                                  {/* AE */}
                                  
                                    
                                    {account.aeName || "Unassigned"}
                                  

                                  {/* Priority Score */}
                                  
                                    
                                      = 70
                                            ? "bg-green-500"
                                            : account.priorityScore >= 40
                                            ? "bg-yellow-500"
                                            : "bg-gray-400"
                                        )}
                                        style={{ width: `${account.priorityScore}%` }}
                                      />
                                    
                                    
                                      {account.priorityScore}
                                    
                                  

                                  {/* AI Recommendation */}
                                  {account.aiRecommendation && (
                                    
                                      
                                      
                                        {account.aiRecommendation}
                                      
                                    
                                  )}

                                  {/* Industry badge */}
                                  {account.accountIndustry && (
                                    
                                      {account.accountIndustry}
                                    
                                  )}

                                  {/* Converted badge */}
                                  {account.convertedOpportunityId && (
                                    
                                      
                                      Converted
                                    
                                  )}
                                
                              
                            ))
                        )}
                      
                    
                  
                
              
            );
          })}
        
      

      {/* Inactive Stages Summary */}
      
        {INACTIVE_STAGES.map((stage) => {
          const count = accountsByStage[stage]?.length || 0;
          const config = stage === 'disqualified'
            ? { label: 'Disqualified', color: 'bg-red-100 text-red-800', icon: XCircle }
            : { label: 'On Hold', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
          const Icon = config.icon;

          return (
            
              
              {config.label}: {count}
            
          );
        })}
      
    
  );
}