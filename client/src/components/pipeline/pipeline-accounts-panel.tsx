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
  stageCounts: Record<string, number>;
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
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [aeFilter, setAeFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [addAccountsDialogOpen, setAddAccountsDialogOpen] = useState(false);

  // Fetch pipeline accounts
  const { data, isLoading } = useQuery<PipelineAccountsResponse>({
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
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {JOURNEY_STAGES.filter(s => s.value !== 'disqualified' && s.value !== 'on_hold').map((stage) => {
          const count = data?.stageCounts?.[stage.value] || 0;
          const Icon = stage.icon;
          return (
            <Card
              key={stage.value}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                stageFilter === stage.value && "ring-2 ring-primary"
              )}
              onClick={() => setStageFilter(stageFilter === stage.value ? "all" : stage.value)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded", stage.color.replace('bg-', 'bg-opacity-20 text-'))}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stage.label}</p>
                    <p className="text-lg font-semibold">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Actions Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  {JOURNEY_STAGES.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={aeFilter} onValueChange={setAeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Assigned AE" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All AEs</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {uniqueAes.map((ae) => (
                    <SelectItem key={ae.id} value={ae.id}>
                      {ae.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <Badge variant="secondary" className="mr-2">
                    {selectedIds.size} selected
                  </Badge>
                  <Button
                    onClick={() => setAssignDialogOpen(true)}
                    size="sm"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign to AE
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddAccountsDialogOpen(true)}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Add Accounts
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accounts Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedIds.size === filteredAccounts.length && filteredAccounts.length > 0}
                    onCheckedChange={selectAll}
                  />
                </TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Assigned AE</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>AI Insight</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    Loading accounts...
                  </TableCell>
                </TableRow>
              ) : filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No accounts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map((account) => {
                  const stageConfig = getStageConfig(account.journeyStage);
                  const StageIcon = stageConfig.icon;

                  return (
                    <TableRow key={account.id} className="hover-elevate">
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(account.id)}
                          onCheckedChange={() => toggleSelect(account.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{account.accountName || "Unknown"}</p>
                            {account.accountDomain && (
                              <p className="text-xs text-muted-foreground">
                                {account.accountDomain}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.accountIndustry ? (
                          <Badge variant="outline">{account.accountIndustry}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", stageConfig.color)} />
                          <span className="text-sm">{stageConfig.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.aeName ? (
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span>{account.aeName}</span>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Unassigned
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "h-2 w-16 rounded-full bg-muted overflow-hidden"
                            )}
                          >
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
                          <span className="text-xs text-muted-foreground">
                            {account.priorityScore}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.aiRecommendation ? (
                          <div className="flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-purple-500" />
                            <span className="text-xs truncate max-w-[120px]">
                              {account.aiRecommendation}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(account.lastActivityAt)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedIds(new Set([account.id]));
                                setAssignDialogOpen(true);
                              }}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Assign to AE
                            </DropdownMenuItem>

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
                                    onClick={() => convertMutation.mutate(account.id)}
                                    className="text-primary"
                                  >
                                    <Zap className="h-4 w-4 mr-2" />
                                    Convert to Opportunity
                                  </DropdownMenuItem>
                                </>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Assignment Dialog */}
      <AeAssignmentDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        pipelineId={pipelineId}
        selectedAccountIds={Array.from(selectedIds)}
        onAssigned={() => {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
        }}
      />

      {/* Add Accounts Dialog */}
      <AddAccountsToPipelineDialog
        open={addAccountsDialogOpen}
        onOpenChange={setAddAccountsDialogOpen}
        pipelineId={pipelineId}
        onAdded={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "accounts"] });
        }}
      />
    </div>
  );
}
