import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageShell } from "@/components/patterns/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Plus, TrendingUp, DollarSign, Target, BarChart3, 
  ArrowUpRight, ArrowDownRight, ChevronRight, MoreVertical,
  Calendar, User, Building2, Percent, LayoutGrid, List, Trash2,
  AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react";
import { PipelineFormDialog } from "@/components/pipeline/pipeline-form-dialog";
import { OpportunityFormDialog } from "@/components/pipeline/opportunity-form-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Types
interface Pipeline {
  id: string;
  name: string;
  description?: string;
  category: 'media_partnership' | 'direct_sales';
  ownerId: string;
  defaultCurrency: string;
  stageOrder: string[];
  active: boolean;
  type: string;
}

interface Opportunity {
  id: string;
  pipelineId: string;
  accountId: string | null;
  accountName?: string;
  contactId?: string | null;
  ownerId?: string | null;
  ownerName?: string;
  name: string;
  stage: string;
  status: string;
  amount: string;
  currency: string;
  probability: number;
  closeDate: string | null;
  forecastCategory: string;
  flaggedForSla: boolean;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function PipelineManagementPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | undefined>();
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pipelineToDelete, setPipelineToDelete] = useState<Pipeline | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch all pipelines
  const { data: allPipelines = [], isLoading: pipelinesLoading } = useQuery<Pipeline[]>({
    queryKey: ["/api/pipelines"],
  });

  // Auto-select first pipeline when data loads
  useEffect(() => {
    if (!selectedPipelineId && allPipelines.length > 0) {
      setSelectedPipelineId(allPipelines[0].id);
    }
  }, [selectedPipelineId, allPipelines]);

  // Get selected pipeline
  const selectedPipeline = selectedPipelineId 
    ? allPipelines.find(p => p.id === selectedPipelineId)
    : allPipelines[0];

  // Fetch opportunities for selected pipeline
  const { data: opportunities = [], isLoading: oppsLoading } = useQuery<Opportunity[]>({
    queryKey: ["/api/pipelines", selectedPipeline?.id, "opportunities"],
    queryFn: async () => {
      if (!selectedPipeline?.id) return [];
      const response = await apiRequest("GET", `/api/pipelines/${selectedPipeline.id}/opportunities`);
      return await response.json();
    },
    enabled: !!selectedPipeline?.id,
  });

  // Move opportunity mutation
  const moveMutation = useMutation({
    mutationFn: async ({ oppId, stage }: { oppId: string; stage: string }) => {
      return await apiRequest("POST", `/api/opportunities/${oppId}/move`, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipeline?.id, "opportunities"] });
      toast({
        title: "Success",
        description: "Opportunity moved successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to move opportunity",
        variant: "destructive",
      });
    },
  });

  // Delete pipeline mutation
  const deletePipelineMutation = useMutation({
    mutationFn: async (pipelineId: string) => {
      return await apiRequest("DELETE", `/api/pipelines/${pipelineId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      setDeleteDialogOpen(false);
      setPipelineToDelete(null);
      // Reset selected pipeline if it was deleted
      if (selectedPipelineId === pipelineToDelete?.id) {
        setSelectedPipelineId(null);
      }
      toast({
        title: "Success",
        description: "Pipeline deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete pipeline",
        variant: "destructive",
      });
    },
  });

  const handleDeletePipeline = (pipeline: Pipeline) => {
    setPipelineToDelete(pipeline);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (pipelineToDelete) {
      deletePipelineMutation.mutate(pipelineToDelete.id);
    }
  };

  // Calculate metrics
  const totalValue = opportunities.reduce((sum, opp) => sum + (Number(opp.amount) || 0), 0);
  const weightedValue = opportunities.reduce((sum, opp) => {
    return sum + ((Number(opp.amount) || 0) * (opp.probability / 100));
  }, 0);
  const avgProbability = opportunities.length > 0
    ? opportunities.reduce((sum, opp) => sum + opp.probability, 0) / opportunities.length
    : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStageColor = (stage: string): string => {
    const lowerStage = stage.toLowerCase();
    if (lowerStage.includes('new') || lowerStage.includes('lead')) return 'bg-blue-500';
    if (lowerStage.includes('qualified') || lowerStage.includes('qualification')) return 'bg-cyan-500';
    if (lowerStage.includes('engaged') || lowerStage.includes('proposal')) return 'bg-purple-500';
    if (lowerStage.includes('negotiation')) return 'bg-orange-500';
    if (lowerStage.includes('closed won') || lowerStage.includes('closedwon')) return 'bg-green-500';
    if (lowerStage.includes('closed lost') || lowerStage.includes('closedlost')) return 'bg-red-500';
    return 'bg-gray-500';
  };

  const formatStageName = (stage: string): string => {
    // Handle camelCase and spaces
    return stage
      .replace(/([A-Z])/g, ' $1') // Add space before capitals
      .split(/[\s_-]+/) // Split on spaces, underscores, or hyphens
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  };

  // Sorting functionality
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Sort opportunities for list view
  const sortedOpportunities = [...opportunities].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    
    switch (sortColumn) {
      case 'name':
        return multiplier * a.name.localeCompare(b.name);
      case 'account':
        return multiplier * (a.accountName || '').localeCompare(b.accountName || '');
      case 'stage':
        return multiplier * a.stage.localeCompare(b.stage);
      case 'amount':
        return multiplier * ((Number(a.amount) || 0) - (Number(b.amount) || 0));
      case 'probability':
        return multiplier * (a.probability - b.probability);
      case 'closeDate':
        const dateA = a.closeDate ? new Date(a.closeDate).getTime() : 0;
        const dateB = b.closeDate ? new Date(b.closeDate).getTime() : 0;
        return multiplier * (dateA - dateB);
      case 'owner':
        return multiplier * (a.ownerName || '').localeCompare(b.ownerName || '');
      case 'status':
        return multiplier * a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });

  // Group opportunities by stage
  const stages = selectedPipeline?.stageOrder || [];
  const opportunitiesByStage = stages.reduce((acc, stage) => {
    acc[stage] = opportunities.filter(opp => opp.stage === stage);
    return acc;
  }, {} as Record<string, Opportunity[]>);

  if (pipelinesLoading) {
    return (
      <PageShell
        title="Pipeline Management"
        description="Comprehensive sales automation platform"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Pipeline Management" },
        ]}
      >
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Loading pipelines...</div>
        </div>
      </PageShell>
    );
  }

  if (allPipelines.length === 0) {
    return (
      <PageShell
        title="Pipeline Management"
        description="Comprehensive sales automation platform"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Pipeline Management" },
        ]}
      >
        <div className="flex items-center justify-center h-96">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Pipelines Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first pipeline to start tracking sales opportunities
              </p>
              <Button onClick={() => setPipelineDialogOpen(true)} data-testid="button-create-first-pipeline">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Pipeline
              </Button>
            </CardContent>
          </Card>
        </div>

        <PipelineFormDialog
          open={pipelineDialogOpen}
          onOpenChange={setPipelineDialogOpen}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Pipeline Management"
      description="Comprehensive sales automation platform"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Pipeline Management" },
      ]}
    >
      <div className="space-y-6 p-6">
        {/* Pipeline Selector & Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold" data-testid="text-pipeline-title">
              {selectedPipeline?.name || 'Select Pipeline'}
            </h2>
            {selectedPipeline && (
              <Badge variant="secondary" className="text-xs">
                {selectedPipeline.category === 'direct_sales' ? 'Direct Sales' : 'Media Partnership'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('kanban')}
                data-testid="button-view-kanban"
                className="rounded-r-none"
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Kanban
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                data-testid="button-view-list"
                className="rounded-l-none"
              >
                <List className="h-4 w-4 mr-2" />
                List
              </Button>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setPipelineDialogOpen(true)}
              data-testid="button-manage-pipelines"
            >
              Manage Pipelines
            </Button>
            <Button 
              onClick={() => {
                setSelectedOpportunity(undefined);
                setOpportunityDialogOpen(true);
              }} 
              data-testid="button-new-opportunity"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Opportunity
            </Button>
          </div>
        </div>

        {/* Metrics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-metric-total">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {opportunities.length} {opportunities.length === 1 ? 'opportunity' : 'opportunities'}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-weighted">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Weighted Forecast</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(weightedValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on probability
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-avg-prob">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Probability</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgProbability.toFixed(0)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all deals
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-conversion">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {opportunities.length > 0 
                  ? ((opportunities.filter(o => o.stage.toLowerCase().includes('won')).length / opportunities.length) * 100).toFixed(0)
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Closed won deals
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Selector Cards */}
        {allPipelines.length > 1 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Switch Pipeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {allPipelines.map((pipeline) => (
                <Card 
                  key={pipeline.id} 
                  className={cn(
                    "cursor-pointer transition-all hover-elevate active-elevate-2",
                    selectedPipeline?.id === pipeline.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedPipelineId(pipeline.id)}
                  data-testid={`card-pipeline-${pipeline.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">{pipeline.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {pipeline.description || 'No description'}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={selectedPipeline?.id === pipeline.id ? "default" : "secondary"} className="text-xs">
                          {pipeline.category === 'direct_sales' ? 'Sales' : 'Partnership'}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePipeline(pipeline);
                          }}
                          data-testid={`button-delete-pipeline-${pipeline.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* View Content */}
        {viewMode === 'kanban' ? (
          /* Kanban Board */
          <div className="relative">
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4 min-w-max">
                {stages.map((stage) => {
                  const stageOpps = opportunitiesByStage[stage] || [];
                  const stageValue = stageOpps.reduce((sum, opp) => sum + (Number(opp.amount) || 0), 0);
                  
                  return (
                    <div 
                      key={stage} 
                      className="flex-shrink-0 w-80"
                      data-testid={`column-${stage}`}
                    >
                      <Card className="h-full">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-3 h-3 rounded-full", getStageColor(stage))} />
                              <CardTitle className="text-sm font-semibold">
                                {formatStageName(stage)}
                              </CardTitle>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {stageOpps.length}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs mt-1">
                            {formatCurrency(stageValue)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {stageOpps.length === 0 ? (
                            <div className="text-center py-8 text-xs text-muted-foreground">
                              No opportunities
                            </div>
                          ) : (
                            stageOpps.map((opp) => (
                              <Card 
                                key={opp.id}
                                className="cursor-pointer hover-elevate active-elevate-2"
                                onClick={() => setLocation(`/opportunities/${opp.id}`)}
                                data-testid={`opportunity-card-${opp.id}`}
                              >
                                <CardHeader className="p-3 pb-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <CardTitle className="text-sm font-semibold line-clamp-1">
                                        {opp.name}
                                      </CardTitle>
                                      <CardDescription className="text-xs mt-0.5 line-clamp-1">
                                        <Building2 className="h-3 w-3 inline mr-1" />
                                        {opp.accountName || 'No Account'}
                                      </CardDescription>
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-6 w-6 flex-shrink-0"
                                          data-testid={`button-opportunity-menu-${opp.id}`}
                                        >
                                          <MoreVertical className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenuItem onClick={() => {
                                          setSelectedOpportunity(opp);
                                          setOpportunityDialogOpen(true);
                                        }}>
                                          Edit
                                        </DropdownMenuItem>
                                        {stages.filter(s => s !== stage).map((targetStage) => (
                                          <DropdownMenuItem 
                                            key={targetStage}
                                            onClick={() => moveMutation.mutate({ oppId: opp.id, stage: targetStage })}
                                          >
                                            Move to {formatStageName(targetStage)}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </CardHeader>
                                <CardContent className="p-3 pt-0 space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="font-semibold text-primary">
                                      {formatCurrency(Number(opp.amount) || 0)}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {opp.probability}%
                                    </Badge>
                                  </div>
                                  
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      <span className="truncate">{opp.ownerName || 'Unassigned'}</span>
                                    </div>
                                    {opp.closeDate && (
                                      <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>{new Date(opp.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                      </div>
                                    )}
                                  </div>

                                  <Badge variant="secondary" className="text-xs w-full justify-center">
                                    {opp.status}
                                  </Badge>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* List View */
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('name')}
                      data-testid="header-sort-name"
                    >
                      <div className="flex items-center">
                        Opportunity
                        {getSortIcon('name')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('account')}
                      data-testid="header-sort-account"
                    >
                      <div className="flex items-center">
                        Account
                        {getSortIcon('account')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('stage')}
                      data-testid="header-sort-stage"
                    >
                      <div className="flex items-center">
                        Stage
                        {getSortIcon('stage')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('amount')}
                      data-testid="header-sort-amount"
                    >
                      <div className="flex items-center">
                        Amount
                        {getSortIcon('amount')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('probability')}
                      data-testid="header-sort-probability"
                    >
                      <div className="flex items-center">
                        Probability
                        {getSortIcon('probability')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('closeDate')}
                      data-testid="header-sort-closeDate"
                    >
                      <div className="flex items-center">
                        Close Date
                        {getSortIcon('closeDate')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('owner')}
                      data-testid="header-sort-owner"
                    >
                      <div className="flex items-center">
                        Owner
                        {getSortIcon('owner')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('status')}
                      data-testid="header-sort-status"
                    >
                      <div className="flex items-center">
                        Status
                        {getSortIcon('status')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        No opportunities found
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedOpportunities.map((opp) => (
                      <TableRow 
                        key={opp.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setLocation(`/opportunities/${opp.id}`)}
                        data-testid={`row-opportunity-${opp.id}`}
                      >
                        <TableCell className="font-medium">{opp.name}</TableCell>
                        <TableCell>{opp.accountName || 'No Account'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full", getStageColor(opp.stage))} />
                            {formatStageName(opp.stage)}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-primary">
                          {formatCurrency(Number(opp.amount) || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {opp.probability}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {opp.closeDate 
                            ? new Date(opp.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </TableCell>
                        <TableCell>{opp.ownerName || 'Unassigned'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {opp.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                data-testid={`button-list-menu-${opp.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => {
                                setSelectedOpportunity(opp);
                                setOpportunityDialogOpen(true);
                              }}>
                                Edit
                              </DropdownMenuItem>
                              {stages.map((targetStage) => (
                                targetStage !== opp.stage && (
                                  <DropdownMenuItem 
                                    key={targetStage}
                                    onClick={() => moveMutation.mutate({ oppId: opp.id, stage: targetStage })}
                                  >
                                    Move to {formatStageName(targetStage)}
                                  </DropdownMenuItem>
                                )
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>

      <PipelineFormDialog
        open={pipelineDialogOpen}
        onOpenChange={setPipelineDialogOpen}
      />

      {selectedPipeline && (
        <OpportunityFormDialog
          open={opportunityDialogOpen}
          onOpenChange={(open) => {
            setOpportunityDialogOpen(open);
            if (!open) setSelectedOpportunity(undefined);
          }}
          pipelineId={selectedPipeline.id}
          opportunity={selectedOpportunity}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-pipeline">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Pipeline
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{pipelineToDelete?.name}</strong>?
              This action cannot be undone and will remove all associated opportunities.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deletePipelineMutation.isPending ? "Deleting..." : "Delete Pipeline"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
