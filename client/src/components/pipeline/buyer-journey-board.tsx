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
  stageCounts: Record<string, number>;
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
  const [aeFilter, setAeFilter] = useState<string>("all");
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null);

  // Fetch pipeline accounts
  const { data, isLoading } = useQuery<PipelineAccountsResponse>({
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
  }, {} as Record<string, PipelineAccount[]>);

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
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading buyer journey...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Buyer Journey Board</h3>
        <Select value={aeFilter} onValueChange={setAeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by AE" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All AEs</SelectItem>
            {uniqueAes.map((ae) => (
              <SelectItem key={ae.id} value={ae.id}>
                {ae.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {JOURNEY_STAGES.map((stageConfig) => {
            const stageAccounts = accountsByStage[stageConfig.value] || [];
            const Icon = stageConfig.icon;

            return (
              <div
                key={stageConfig.value}
                className="flex-shrink-0 w-72"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stageConfig.value)}
              >
                <Card className={cn(
                  "h-full transition-colors",
                  draggedAccountId && "border-dashed"
                )}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3 h-3 rounded-full", stageConfig.color)} />
                        <CardTitle className="text-sm font-semibold">
                          {stageConfig.label}
                        </CardTitle>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {stageAccounts.length}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <ScrollArea className="h-[500px] pr-2">
                      <div className="space-y-2">
                        {stageAccounts.length === 0 ? (
                          <div className="text-center py-8 text-xs text-muted-foreground">
                            No accounts
                          </div>
                        ) : (
                          stageAccounts
                            .sort((a, b) => b.priorityScore - a.priorityScore)
                            .map((account) => (
                              <Card
                                key={account.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, account.id)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                  "cursor-grab active:cursor-grabbing hover:shadow-md transition-all",
                                  draggedAccountId === account.id && "opacity-50"
                                )}
                              >
                                <CardHeader className="p-3 pb-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <CardTitle className="text-sm font-semibold line-clamp-1">
                                        {account.accountName}
                                      </CardTitle>
                                      {account.accountDomain && (
                                        <CardDescription className="text-xs mt-0.5 line-clamp-1">
                                          {account.accountDomain}
                                        </CardDescription>
                                      )}
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                          <MoreVertical className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {!account.assignedAeId && (
                                          <DropdownMenuItem
                                            onClick={() => onAssignClick?.([account.id])}
                                          >
                                            <UserPlus className="h-4 w-4 mr-2" />
                                            Assign to AE
                                          </DropdownMenuItem>
                                        )}

                                        <DropdownMenuSeparator />

                                        {JOURNEY_STAGES.filter(
                                          (s) => s.value !== account.journeyStage
                                        ).map((stage) => (
                                          <DropdownMenuItem
                                            key={stage.value}
                                            onClick={() =>
                                              moveStageMutation.mutate({
                                                id: account.id,
                                                stage: stage.value,
                                              })
                                            }
                                          >
                                            <ArrowRight className="h-4 w-4 mr-2" />
                                            Move to {stage.label}
                                          </DropdownMenuItem>
                                        ))}

                                        {account.journeyStage === "qualified" &&
                                          !account.convertedOpportunityId && (
                                            <>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                onClick={() => {
                                                  convertMutation.mutate(account.id);
                                                  onConvertClick?.(account.id);
                                                }}
                                                className="text-primary"
                                              >
                                                <Zap className="h-4 w-4 mr-2" />
                                                Convert to Opportunity
                                              </DropdownMenuItem>
                                            </>
                                          )}

                                        <DropdownMenuSeparator />

                                        <DropdownMenuItem
                                          onClick={() =>
                                            moveStageMutation.mutate({
                                              id: account.id,
                                              stage: "disqualified",
                                            })
                                          }
                                          className="text-destructive"
                                        >
                                          <XCircle className="h-4 w-4 mr-2" />
                                          Disqualify
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </CardHeader>

                                <CardContent className="p-3 pt-0 space-y-2">
                                  {/* AE */}
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    <span>{account.aeName || "Unassigned"}</span>
                                  </div>

                                  {/* Priority Score */}
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={cn(
                                          "h-full rounded-full",
                                          account.priorityScore >= 70
                                            ? "bg-green-500"
                                            : account.priorityScore >= 40
                                            ? "bg-yellow-500"
                                            : "bg-gray-400"
                                        )}
                                        style={{ width: `${account.priorityScore}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground w-8">
                                      {account.priorityScore}
                                    </span>
                                  </div>

                                  {/* AI Recommendation */}
                                  {account.aiRecommendation && (
                                    <div className="flex items-center gap-1 text-xs">
                                      <Sparkles className="h-3 w-3 text-purple-500" />
                                      <span className="truncate text-muted-foreground">
                                        {account.aiRecommendation}
                                      </span>
                                    </div>
                                  )}

                                  {/* Industry badge */}
                                  {account.accountIndustry && (
                                    <Badge variant="outline" className="text-xs">
                                      {account.accountIndustry}
                                    </Badge>
                                  )}

                                  {/* Converted badge */}
                                  {account.convertedOpportunityId && (
                                    <Badge className="text-xs bg-green-100 text-green-800">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Converted
                                    </Badge>
                                  )}
                                </CardContent>
                              </Card>
                            ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inactive Stages Summary */}
      <div className="flex gap-4">
        {INACTIVE_STAGES.map((stage) => {
          const count = accountsByStage[stage]?.length || 0;
          const config = stage === 'disqualified'
            ? { label: 'Disqualified', color: 'bg-red-100 text-red-800', icon: XCircle }
            : { label: 'On Hold', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
          const Icon = config.icon;

          return (
            <Badge key={stage} variant="outline" className={cn("px-3 py-1", config.color)}>
              <Icon className="h-3 w-3 mr-1" />
              {config.label}: {count}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
