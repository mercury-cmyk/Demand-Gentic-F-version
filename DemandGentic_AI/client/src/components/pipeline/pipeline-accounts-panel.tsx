/**
 * Pipeline Accounts Panel
 *
 * Top-of-funnel account management panel for the pipeline management page.
 * Shows accounts by journey stage with selection for batch assignment.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Search,
  UserPlus,
  Sparkles,
  MoreVertical,
  ArrowRight,
  Zap,
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AeAssignmentDialog } from "./ae-assignment-dialog";
import { AddAccountsToPipelineDialog } from "./add-accounts-to-pipeline-dialog";

// Types
interface PipelineAccount {
  id: string;
  pipelineId: string;
  accountId: string;
  accountName: string;
  accountDomain?: string;
  accountIndustry?: string;
  accountEmployees?: string;
  accountRevenue?: string;
  assignedAeId?: string;
  aeName?: string;
  aeEmail?: string;
  assignedAt?: string;
  journeyStage: string;
  stageChangedAt?: string;
  priorityScore: number;
  readinessScore: number;
  aiRecommendation?: string;
  aiRecommendedAeId?: string;
  aiRecommendationReason?: string;
  qualificationNotes?: string;
  lastActivityAt?: string;
  touchpointCount: number;
  convertedOpportunityId?: string;
  createdAt: string;
  updatedAt: string;
}

interface PipelineAccountsResponse {
  accounts: PipelineAccount[];
  stageCounts: Record;
  total: number;
}

interface Props {
  pipelineId: string;
  onConvertToOpportunity?: (accountId: string) => void;
}

// Journey stage configuration
const JOURNEY_STAGES = [
  { value: 'unassigned', label: 'Unassigned', color: 'bg-gray-500', icon: Clock },
  { value: 'assigned', label: 'Assigned', color: 'bg-blue-500', icon: User },
  { value: 'outreach', label: 'Outreach', color: 'bg-cyan-500', icon: Target },
  { value: 'engaged', label: 'Engaged', color: 'bg-purple-500', icon: Users },
  { value: 'qualifying', label: 'Qualifying', color: 'bg-orange-500', icon: TrendingUp },
  { value: 'qualified', label: 'Qualified', color: 'bg-green-500', icon: CheckCircle2 },
  { value: 'disqualified', label: 'Disqualified', color: 'bg-red-500', icon: XCircle },
  { value: 'on_hold', label: 'On Hold', color: 'bg-yellow-500', icon: Clock },
];

export function PipelineAccountsPanel({ pipelineId, onConvertToOpportunity }: Props) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [aeFilter, setAeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [addAccountsDialogOpen, setAddAccountsDialogOpen] = useState(false);

  // Fetch pipeline accounts
  const { data, isLoading } = useQuery({
    queryKey: ["/api/pipelines", pipelineId, "accounts", stageFilter, aeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (stageFilter !== "all") params.set("stage", stageFilter);
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
      toast({ title: "Success", description: "Account stage updated" });
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
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "opportunities"] });
      toast({ title: "Success", description: "Account converted to opportunity" });
      if (onConvertToOpportunity) onConvertToOpportunity(id);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to convert to opportunity",
        variant: "destructive",
      });
    },
  });

  // Filter accounts
  const filteredAccounts = (data?.accounts || []).filter((account) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      account.accountName?.toLowerCase().includes(query) ||
      account.accountDomain?.toLowerCase().includes(query) ||
      account.accountIndustry?.toLowerCase().includes(query) ||
      account.aeName?.toLowerCase().includes(query)
    );
  });

  // Selection handlers
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
    }
  };

  const getStageConfig = (stage: string) => {
    return JOURNEY_STAGES.find((s) => s.value === stage) || JOURNEY_STAGES[0];
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Get unique AEs for filter
  const uniqueAes = Array.from(
    new Map(
      (data?.accounts || [])
        .filter((a) => a.assignedAeId && a.aeName)
        .map((a) => [a.assignedAeId, { id: a.assignedAeId!, name: a.aeName! }])
    ).values()
  );

  return (
    
      {/* Summary Cards */}
      
        {JOURNEY_STAGES.filter(s => s.value !== 'disqualified' && s.value !== 'on_hold').map((stage) => {
          const count = data?.stageCounts?.[stage.value] || 0;
          const Icon = stage.icon;
          return (
             setStageFilter(stageFilter === stage.value ? "all" : stage.value)}
            >
              
                
                  
                    
                  
                  
                    {stage.label}
                    {count}
                  
                
              
            
          );
        })}
      

      {/* Actions Bar */}
      
        
          
            
              
                
                 setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              

              
                
                  
                
                
                  All Stages
                  {JOURNEY_STAGES.map((stage) => (
                    
                      {stage.label}
                    
                  ))}
                
              

              
                
                  
                
                
                  All AEs
                  Unassigned
                  {uniqueAes.map((ae) => (
                    
                      {ae.name}
                    
                  ))}
                
              
            

            
              {selectedIds.size > 0 && (
                <>
                  
                    {selectedIds.size} selected
                  
                   setAssignDialogOpen(true)}
                    size="sm"
                  >
                    
                    Assign to AE
                  
                
              )}

               setAddAccountsDialogOpen(true)}
              >
                
                Add Accounts
              
            
          
        
      

      {/* Accounts Table */}
      
        
          
            
              
                
                   0}
                    onCheckedChange={selectAll}
                  />
                
                Account
                Industry
                Stage
                Assigned AE
                Priority
                AI Insight
                Last Activity
                Actions
              
            
            
              {isLoading ? (
                
                  
                    Loading accounts...
                  
                
              ) : filteredAccounts.length === 0 ? (
                
                  
                    No accounts found
                  
                
              ) : (
                filteredAccounts.map((account) => {
                  const stageConfig = getStageConfig(account.journeyStage);
                  const StageIcon = stageConfig.icon;

                  return (
                    
                       e.stopPropagation()}>
                         toggleSelect(account.id)}
                        />
                      
                      
                        
                          
                            
                          
                          
                            {account.accountName || "Unknown"}
                            {account.accountDomain && (
                              
                                {account.accountDomain}
                              
                            )}
                          
                        
                      
                      
                        {account.accountIndustry ? (
                          {account.accountIndustry}
                        ) : (
                          "—"
                        )}
                      
                      
                        
                          
                          {stageConfig.label}
                        
                      
                      
                        {account.aeName ? (
                          
                            
                            {account.aeName}
                          
                        ) : (
                          
                            Unassigned
                          
                        )}
                      
                      
                        
                          
                            = 70
                                  ? "bg-green-500"
                                  : account.priorityScore >= 40
                                  ? "bg-yellow-500"
                                  : "bg-gray-400"
                              )}
                              style={{ width: `${account.priorityScore}%` }}
                            />
                          
                          
                            {account.priorityScore}
                          
                        
                      
                      
                        {account.aiRecommendation ? (
                          
                            
                            
                              {account.aiRecommendation}
                            
                          
                        ) : (
                          —
                        )}
                      
                      
                        
                          {formatDate(account.lastActivityAt)}
                        
                      
                      
                        
                          
                            
                              
                            
                          
                          
                             {
                                setSelectedIds(new Set([account.id]));
                                setAssignDialogOpen(true);
                              }}
                            >
                              
                              Assign to AE
                            

                            

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
                                  
                                   convertMutation.mutate(account.id)}
                                    className="text-primary"
                                  >
                                    
                                    Convert to Opportunity
                                  
                                
                              )}
                          
                        
                      
                    
                  );
                })
              )}
            
          
        
      

      {/* Assignment Dialog */}
       {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
        }}
      />

      {/* Add Accounts Dialog */}
       {
          queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
        }}
      />
    
  );
}