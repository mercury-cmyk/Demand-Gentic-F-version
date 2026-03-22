/**
 * AE Assignment Dialog
 *
 * Dialog for batch assigning pipeline accounts to Account Executives.
 * Supports manual, AI-recommended, and round-robin assignment methods.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User,
  Sparkles,
  RefreshCw,
  UserCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AeRecommendation {
  pipelineAccountId: string;
  accountName: string;
  recommendedAeId: string;
  recommendedAeName: string;
  confidence: number;
  reason: string;
  factors: {
    workloadBalance: number;
    industryMatch: boolean;
    sizeMatch: boolean;
    availableCapacity: number;
  };
}

interface AeUser {
  id: string;
  name: string;
  email: string;
}

interface AeWorkload {
  aeId: string;
  aeName: string;
  aeEmail: string;
  total: number;
  byStage: Record;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  selectedAccountIds: string[];
  onAssigned?: () => void;
}

type AssignmentMethod = "manual" | "ai_recommended" | "round_robin";

export function AeAssignmentDialog({
  open,
  onOpenChange,
  pipelineId,
  selectedAccountIds,
  onAssigned,
}: Props) {
  const { toast } = useToast();
  const [method, setMethod] = useState("ai_recommended");
  const [selectedAeId, setSelectedAeId] = useState("");
  const [notes, setNotes] = useState("");
  const [assignments, setAssignments] = useState
  >([]);

  // Fetch available AEs
  const { data: aeData } = useQuery({
    queryKey: ["/api/filters/options/users"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/filters/options/users");
      return response.json();
    },
    enabled: open,
  });

  // Fetch AE workload
  const { data: workloadData } = useQuery({
    queryKey: ["/api/pipeline-accounts/ae-workload", pipelineId],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/pipeline-accounts/ae-workload?pipelineId=${pipelineId}`
      );
      return response.json();
    },
    enabled: open,
  });

  // Fetch AI recommendations
  const {
    data: aiRecommendations,
    isLoading: isLoadingRecommendations,
    refetch: refetchRecommendations,
  } = useQuery({
    queryKey: ["/api/pipeline-accounts/ai-recommend", pipelineId, selectedAccountIds],
    queryFn: async () => {
      const availableAeIds = aeData?.data?.map((ae) => ae.id) || [];
      const response = await apiRequest("POST", "/api/pipeline-accounts/ai-recommend", {
        pipelineId,
        pipelineAccountIds: selectedAccountIds,
        availableAeIds,
      });
      return response.json();
    },
    enabled: open && method === "ai_recommended" && selectedAccountIds.length > 0 && !!aeData?.data?.length,
  });

  // Build workload map
  const workloadMap = (workloadData?.workload || []).reduce((acc, w) => {
    acc[w.aeId] = w;
    return acc;
  }, {} as Record);

  // Update assignments when method or recommendations change
  useEffect(() => {
    if (method === "manual" && selectedAeId) {
      setAssignments(
        selectedAccountIds.map((id) => ({ pipelineAccountId: id, aeId: selectedAeId }))
      );
    } else if (method === "ai_recommended" && aiRecommendations?.recommendations) {
      setAssignments(
        aiRecommendations.recommendations.map((rec) => ({
          pipelineAccountId: rec.pipelineAccountId,
          aeId: rec.recommendedAeId,
        }))
      );
    } else if (method === "round_robin" && aeData?.data) {
      // Round-robin distribution
      const aes = aeData.data;
      setAssignments(
        selectedAccountIds.map((id, index) => ({
          pipelineAccountId: id,
          aeId: aes[index % aes.length].id,
        }))
      );
    }
  }, [method, selectedAeId, aiRecommendations, aeData, selectedAccountIds]);

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async () => {
      const aiReasoningSummary =
        method === "ai_recommended" && aiRecommendations?.recommendations
          ? aiRecommendations.recommendations
              .map((r) => `${r.accountName}: ${r.reason}`)
              .join("; ")
          : undefined;

      return apiRequest("POST", `/api/pipelines/${pipelineId}/accounts/assign`, {
        assignments,
        assignmentMethod: method,
        aiReasoningSummary,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Assigned ${assignments.length} accounts to AE(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline-accounts/ae-workload"] });
      onOpenChange(false);
      onAssigned?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to assign accounts",
        variant: "destructive",
      });
    },
  });

  const getAeName = (aeId: string) => {
    return aeData?.data?.find((ae) => ae.id === aeId)?.name || "Unknown";
  };

  const getWorkloadColor = (total: number) => {
    if (total  {
    acc[a.aeId] = (acc[a.aeId] || 0) + 1;
    return acc;
  }, {} as Record);

  return (
    
      
        
          
            
            Assign Accounts to AE
          
          
            Assign {selectedAccountIds.length} account(s) to Account Executives for outreach and
            qualification.
          
        

        
          {/* Assignment Method */}
          
            Assignment Method
             setMethod(v as AssignmentMethod)}
              className="grid grid-cols-3 gap-3"
            >
              
                
                
                  
                  AI Recommended
                  
                    Smart matching based on workload & fit
                  
                
              

              
                
                
                  
                  Manual
                  
                    Assign all to one AE
                  
                
              

              
                
                
                  
                  Round Robin
                  
                    Distribute evenly
                  
                
              
            
          

          

          {/* Manual AE Selection */}
          {method === "manual" && (
            
              Select Account Executive
              
                
                  
                
                
                  {aeData?.data?.map((ae) => {
                    const workload = workloadMap[ae.id];
                    return (
                      
                        
                          {ae.name}
                          {workload && (
                            
                              {workload.total} accounts
                            
                          )}
                        
                      
                    );
                  })}
                
              
            
          )}

          {/* AI Recommendations Preview */}
          {method === "ai_recommended" && (
            
              
                
                  
                  AI Recommendations
                
                 refetchRecommendations()}
                  disabled={isLoadingRecommendations}
                >
                  
                  Refresh
                
              

              
                {isLoadingRecommendations ? (
                  
                    
                  
                ) : aiRecommendations?.recommendations?.length ? (
                  
                    {aiRecommendations.recommendations.map((rec) => (
                      
                        
                          
                            {rec.accountName}
                            {rec.reason}
                          
                          
                            
                              
                              {rec.recommendedAeName}
                            
                            = 70 ? "default" : "secondary"}
                              className="text-xs mt-1"
                            >
                              {rec.confidence}% confidence
                            
                          
                        
                      
                    ))}
                  
                ) : (
                  
                    
                    No recommendations available
                  
                )}
              
            
          )}

          {/* Assignment Preview */}
          {Object.keys(assignmentCounts).length > 0 && (
            
              
                
                Assignment Preview
              
              
                {Object.entries(assignmentCounts).map(([aeId, count]) => {
                  const currentWorkload = workloadMap[aeId]?.total || 0;
                  return (
                    
                      
                        
                          
                          {getAeName(aeId)}
                        
                        
                          +{count}
                          
                            {currentWorkload} → {currentWorkload + count}
                          
                        
                      
                    
                  );
                })}
              
            
          )}

          {/* Notes */}
          
            Notes (optional)
             setNotes(e.target.value)}
              rows={2}
            />
          
        

        
           onOpenChange(false)}>
            Cancel
          
           assignMutation.mutate()}
            disabled={
              assignMutation.isPending ||
              assignments.length === 0 ||
              (method === "manual" && !selectedAeId)
            }
          >
            {assignMutation.isPending ? (
              <>
                
                Assigning...
              
            ) : (
              <>
                
                Assign {assignments.length} Account(s)
              
            )}
          
        
      
    
  );
}