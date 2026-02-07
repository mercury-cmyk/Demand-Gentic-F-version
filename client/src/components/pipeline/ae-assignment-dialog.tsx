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
  byStage: Record<string, number>;
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
  const [method, setMethod] = useState<AssignmentMethod>("ai_recommended");
  const [selectedAeId, setSelectedAeId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [assignments, setAssignments] = useState<
    Array<{ pipelineAccountId: string; aeId: string }>
  >([]);

  // Fetch available AEs
  const { data: aeData } = useQuery<{ data: AeUser[] }>({
    queryKey: ["/api/filters/options/users"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/filters/options/users");
      return response.json();
    },
    enabled: open,
  });

  // Fetch AE workload
  const { data: workloadData } = useQuery<{ workload: AeWorkload[] }>({
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
  } = useQuery<{ recommendations: AeRecommendation[] }>({
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
  }, {} as Record<string, AeWorkload>);

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
    if (total < 10) return "text-green-600";
    if (total < 25) return "text-yellow-600";
    return "text-red-600";
  };

  // Count assignments per AE for preview
  const assignmentCounts = assignments.reduce((acc, a) => {
    acc[a.aeId] = (acc[a.aeId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Assign Accounts to AE
          </DialogTitle>
          <DialogDescription>
            Assign {selectedAccountIds.length} account(s) to Account Executives for outreach and
            qualification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Assignment Method */}
          <div className="space-y-3">
            <Label>Assignment Method</Label>
            <RadioGroup
              value={method}
              onValueChange={(v) => setMethod(v as AssignmentMethod)}
              className="grid grid-cols-3 gap-3"
            >
              <div>
                <RadioGroupItem value="ai_recommended" id="ai" className="peer sr-only" />
                <Label
                  htmlFor="ai"
                  className={cn(
                    "flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    method === "ai_recommended" && "border-primary"
                  )}
                >
                  <Sparkles className="h-5 w-5 mb-2 text-purple-500" />
                  <span className="text-sm font-medium">AI Recommended</span>
                  <span className="text-xs text-muted-foreground text-center mt-1">
                    Smart matching based on workload & fit
                  </span>
                </Label>
              </div>

              <div>
                <RadioGroupItem value="manual" id="manual" className="peer sr-only" />
                <Label
                  htmlFor="manual"
                  className={cn(
                    "flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    method === "manual" && "border-primary"
                  )}
                >
                  <User className="h-5 w-5 mb-2" />
                  <span className="text-sm font-medium">Manual</span>
                  <span className="text-xs text-muted-foreground text-center mt-1">
                    Assign all to one AE
                  </span>
                </Label>
              </div>

              <div>
                <RadioGroupItem value="round_robin" id="robin" className="peer sr-only" />
                <Label
                  htmlFor="robin"
                  className={cn(
                    "flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    method === "round_robin" && "border-primary"
                  )}
                >
                  <RefreshCw className="h-5 w-5 mb-2" />
                  <span className="text-sm font-medium">Round Robin</span>
                  <span className="text-xs text-muted-foreground text-center mt-1">
                    Distribute evenly
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Manual AE Selection */}
          {method === "manual" && (
            <div className="space-y-3">
              <Label>Select Account Executive</Label>
              <Select value={selectedAeId} onValueChange={setSelectedAeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an AE..." />
                </SelectTrigger>
                <SelectContent>
                  {aeData?.data?.map((ae) => {
                    const workload = workloadMap[ae.id];
                    return (
                      <SelectItem key={ae.id} value={ae.id}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{ae.name}</span>
                          {workload && (
                            <span className={cn("text-xs", getWorkloadColor(workload.total))}>
                              {workload.total} accounts
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* AI Recommendations Preview */}
          {method === "ai_recommended" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  AI Recommendations
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchRecommendations()}
                  disabled={isLoadingRecommendations}
                >
                  <RefreshCw
                    className={cn("h-4 w-4 mr-1", isLoadingRecommendations && "animate-spin")}
                  />
                  Refresh
                </Button>
              </div>

              <ScrollArea className="h-[200px] rounded-md border p-3">
                {isLoadingRecommendations ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : aiRecommendations?.recommendations?.length ? (
                  <div className="space-y-2">
                    {aiRecommendations.recommendations.map((rec) => (
                      <Card key={rec.pipelineAccountId} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{rec.accountName}</p>
                            <p className="text-xs text-muted-foreground">{rec.reason}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span className="text-sm font-medium">{rec.recommendedAeName}</span>
                            </div>
                            <Badge
                              variant={rec.confidence >= 70 ? "default" : "secondary"}
                              className="text-xs mt-1"
                            >
                              {rec.confidence}% confidence
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mb-2" />
                    <p className="text-sm">No recommendations available</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Assignment Preview */}
          {Object.keys(assignmentCounts).length > 0 && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Assignment Preview
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(assignmentCounts).map(([aeId, count]) => {
                  const currentWorkload = workloadMap[aeId]?.total || 0;
                  return (
                    <Card key={aeId} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{getAeName(aeId)}</span>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary">+{count}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {currentWorkload} → {currentWorkload + count}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this assignment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={
              assignMutation.isPending ||
              assignments.length === 0 ||
              (method === "manual" && !selectedAeId)
            }
          >
            {assignMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Assign {assignments.length} Account(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
