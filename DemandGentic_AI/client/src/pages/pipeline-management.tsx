import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageShell } from "@/components/patterns/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, TrendingUp, DollarSign, Target, BarChart3,
  ArrowUpRight, ArrowDownRight, ChevronRight, MoreVertical,
  Calendar, User, Building2, Percent, LayoutGrid, List, Trash2,
  AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Users, Sparkles
} from "lucide-react";
import { PipelineFormDialog } from "@/components/pipeline/pipeline-form-dialog";
import { OpportunityFormDialog } from "@/components/pipeline/opportunity-form-dialog";
import { PipelineAccountsPanel } from "@/components/pipeline/pipeline-accounts-panel";
import { BuyerJourneyBoard } from "@/components/pipeline/buyer-journey-board";
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
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState();
  const [viewMode, setViewMode] = useState('kanban');
  const [mainTab, setMainTab] = useState('opportunities');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pipelineToDelete, setPipelineToDelete] = useState(null);
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  // Fetch all pipelines
  const { data: allPipelines = [], isLoading: pipelinesLoading } = useQuery({
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
  const { data: opportunities = [], isLoading: oppsLoading } = useQuery({
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
    if (sortColumn !== column) return ;
    return sortDirection === 'asc' 
      ? 
      : ;
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
  }, {} as Record);

  if (pipelinesLoading) {
    return (
      
        
          Loading pipelines...
        
      
    );
  }

  if (allPipelines.length === 0) {
    return (
      
        
          
            
              
              No Pipelines Yet
              
                Create your first pipeline to start tracking sales opportunities
              
               setPipelineDialogOpen(true)} data-testid="button-create-first-pipeline">
                
                Create Your First Pipeline
              
            
          
        

        
      
    );
  }

  return (
    
      
        {/* Pipeline Selector & Actions */}
        
          
            
              {selectedPipeline?.name || 'Select Pipeline'}
            
            {selectedPipeline && (
              
                {selectedPipeline.category === 'direct_sales' ? 'Direct Sales' : 'Media Partnership'}
              
            )}
          
          
             setPipelineDialogOpen(true)}
              data-testid="button-manage-pipelines"
            >
              Manage Pipelines
            
            {mainTab === 'opportunities' && (
               {
                  setSelectedOpportunity(undefined);
                  setOpportunityDialogOpen(true);
                }}
                data-testid="button-new-opportunity"
              >
                
                New Opportunity
              
            )}
          
        

        {/* Main Tabs: Opportunities / Accounts / Journey */}
         setMainTab(v as any)} className="w-full">
          
            
              
                
                Opportunities
              
              
                
                Pipeline Accounts
              
              
                
                Buyer Journey
              
            

            {/* View Toggle - only for opportunities tab */}
            {mainTab === 'opportunities' && (
              
                 setViewMode('kanban')}
                  data-testid="button-view-kanban"
                  className="rounded-r-none"
                >
                  
                  Kanban
                
                 setViewMode('list')}
                  data-testid="button-view-list"
                  className="rounded-l-none"
                >
                  
                  List
                
              
            )}
          

          {/* Opportunities Tab Content */}
          
            {/* Metrics Dashboard */}
        
          
            
              Total Pipeline Value
              
            
            
              {formatCurrency(totalValue)}
              
                {opportunities.length} {opportunities.length === 1 ? 'opportunity' : 'opportunities'}
              
            
          

          
            
              Weighted Forecast
              
            
            
              {formatCurrency(weightedValue)}
              
                Based on probability
              
            
          

          
            
              Avg. Probability
              
            
            
              {avgProbability.toFixed(0)}%
              
                Across all deals
              
            
          

          
            
              Win Rate
              
            
            
              
                {opportunities.length > 0 
                  ? ((opportunities.filter(o => o.stage.toLowerCase().includes('won')).length / opportunities.length) * 100).toFixed(0)
                  : 0}%
              
              
                Closed won deals
              
            
          
        

        {/* Pipeline Selector Cards */}
        {allPipelines.length > 1 && (
          
            Switch Pipeline
            
              {allPipelines.map((pipeline) => (
                 setSelectedPipelineId(pipeline.id)}
                  data-testid={`card-pipeline-${pipeline.id}`}
                >
                  
                    
                      
                        {pipeline.name}
                        
                          {pipeline.description || 'No description'}
                        
                      
                      
                        
                          {pipeline.category === 'direct_sales' ? 'Sales' : 'Partnership'}
                        
                         {
                            e.stopPropagation();
                            handleDeletePipeline(pipeline);
                          }}
                          data-testid={`button-delete-pipeline-${pipeline.id}`}
                        >
                          
                        
                      
                    
                  
                
              ))}
            
          
        )}

        {/* View Content */}
        {viewMode === 'kanban' ? (
          /* Kanban Board */
          
            
              
                {stages.map((stage) => {
                  const stageOpps = opportunitiesByStage[stage] || [];
                  const stageValue = stageOpps.reduce((sum, opp) => sum + (Number(opp.amount) || 0), 0);
                  
                  return (
                    
                      
                        
                          
                            
                              
                              
                                {formatStageName(stage)}
                              
                            
                            
                              {stageOpps.length}
                            
                          
                          
                            {formatCurrency(stageValue)}
                          
                        
                        
                          {stageOpps.length === 0 ? (
                            
                              No opportunities
                            
                          ) : (
                            stageOpps.map((opp) => (
                               setLocation(`/opportunities/${opp.id}`)}
                                data-testid={`opportunity-card-${opp.id}`}
                              >
                                
                                  
                                    
                                      
                                        {opp.name}
                                      
                                      
                                        
                                        {opp.accountName || 'No Account'}
                                      
                                    
                                    
                                       e.stopPropagation()}>
                                        
                                          
                                        
                                      
                                       e.stopPropagation()}>
                                         {
                                          setSelectedOpportunity(opp);
                                          setOpportunityDialogOpen(true);
                                        }}>
                                          Edit
                                        
                                        {stages.filter(s => s !== stage).map((targetStage) => (
                                           moveMutation.mutate({ oppId: opp.id, stage: targetStage })}
                                          >
                                            Move to {formatStageName(targetStage)}
                                          
                                        ))}
                                      
                                    
                                  
                                
                                
                                  
                                    
                                      {formatCurrency(Number(opp.amount) || 0)}
                                    
                                    
                                      {opp.probability}%
                                    
                                  
                                  
                                  
                                    
                                      
                                      {opp.ownerName || 'Unassigned'}
                                    
                                    {opp.closeDate && (
                                      
                                        
                                        {new Date(opp.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      
                                    )}
                                  

                                  
                                    {opp.status}
                                  
                                
                              
                            ))
                          )}
                        
                      
                    
                  );
                })}
              
            
          
        ) : (
          /* List View */
          
            
              
                
                  
                     handleSort('name')}
                      data-testid="header-sort-name"
                    >
                      
                        Opportunity
                        {getSortIcon('name')}
                      
                    
                     handleSort('account')}
                      data-testid="header-sort-account"
                    >
                      
                        Account
                        {getSortIcon('account')}
                      
                    
                     handleSort('stage')}
                      data-testid="header-sort-stage"
                    >
                      
                        Stage
                        {getSortIcon('stage')}
                      
                    
                     handleSort('amount')}
                      data-testid="header-sort-amount"
                    >
                      
                        Amount
                        {getSortIcon('amount')}
                      
                    
                     handleSort('probability')}
                      data-testid="header-sort-probability"
                    >
                      
                        Probability
                        {getSortIcon('probability')}
                      
                    
                     handleSort('closeDate')}
                      data-testid="header-sort-closeDate"
                    >
                      
                        Close Date
                        {getSortIcon('closeDate')}
                      
                    
                     handleSort('owner')}
                      data-testid="header-sort-owner"
                    >
                      
                        Owner
                        {getSortIcon('owner')}
                      
                    
                     handleSort('status')}
                      data-testid="header-sort-status"
                    >
                      
                        Status
                        {getSortIcon('status')}
                      
                    
                    Actions
                  
                
                
                  {opportunities.length === 0 ? (
                    
                      
                        No opportunities found
                      
                    
                  ) : (
                    sortedOpportunities.map((opp) => (
                       setLocation(`/opportunities/${opp.id}`)}
                        data-testid={`row-opportunity-${opp.id}`}
                      >
                        {opp.name}
                        {opp.accountName || 'No Account'}
                        
                          
                            
                            {formatStageName(opp.stage)}
                          
                        
                        
                          {formatCurrency(Number(opp.amount) || 0)}
                        
                        
                          
                            {opp.probability}%
                          
                        
                        
                          {opp.closeDate 
                            ? new Date(opp.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        
                        {opp.ownerName || 'Unassigned'}
                        
                          
                            {opp.status}
                          
                        
                        
                          
                             e.stopPropagation()}>
                              
                                
                              
                            
                             e.stopPropagation()}>
                               {
                                setSelectedOpportunity(opp);
                                setOpportunityDialogOpen(true);
                              }}>
                                Edit
                              
                              {stages.map((targetStage) => (
                                targetStage !== opp.stage && (
                                   moveMutation.mutate({ oppId: opp.id, stage: targetStage })}
                                  >
                                    Move to {formatStageName(targetStage)}
                                  
                                )
                              ))}
                            
                          
                        
                      
                    ))
                  )}
                
              
            
          
        )}
          

          {/* Pipeline Accounts Tab Content */}
          
            {selectedPipeline && (
               {
                  queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipeline.id, "opportunities"] });
                }}
              />
            )}
          

          {/* Buyer Journey Tab Content */}
          
            {selectedPipeline && (
               {
                  queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipeline.id, "opportunities"] });
                }}
              />
            )}
          
        
      

      

      {selectedPipeline && (
         {
            setOpportunityDialogOpen(open);
            if (!open) setSelectedOpportunity(undefined);
          }}
          pipelineId={selectedPipeline.id}
          opportunity={selectedOpportunity}
        />
      )}

      
        
          
            
              
              Delete Pipeline
            
            
              Are you sure you want to delete {pipelineToDelete?.name}?
              This action cannot be undone and will remove all associated opportunities.
            
          
          
            Cancel
            
              {deletePipelineMutation.isPending ? "Deleting..." : "Delete Pipeline"}
            
          
        
      
    
  );
}