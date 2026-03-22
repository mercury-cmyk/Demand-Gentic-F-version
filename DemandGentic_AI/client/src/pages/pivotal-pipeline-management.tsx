import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPipelineOpportunitySchema, type Pipeline, type PipelineOpportunity } from "@shared/schema";

type Account = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, DollarSign, Calendar, User, Building2, LayoutGrid, List, TrendingUp, AlertCircle, Target } from "lucide-react";
import { z } from "zod";
import { StatCard } from "@/components/shared/stat-card";

type OpportunityWithRelations = PipelineOpportunity & {
  account?: { name: string } | null;
  contact?: { firstName: string; lastName: string } | null;
};

type ViewMode = "kanban" | "list" | "forecast";

export default function PivotalPipelineManagementPage() {
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [viewMode, setViewMode] = useState("kanban");
  const [draggedOpportunity, setDraggedOpportunity] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: pipelines = [] } = useQuery({
    queryKey: ["/api/pipelines"],
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: ["/api/pipelines", selectedPipelineId, "opportunities"],
    enabled: !!selectedPipelineId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["/api/accounts"],
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["/api/contacts"],
  });

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
  const stages = selectedPipeline?.stageOrder || [];

  const createMutation = useMutation({
    mutationFn: async (data: z.infer) => {
      return apiRequest("POST", "/api/opportunities", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "opportunities"] });
      toast({ title: "Success", description: "Opportunity created successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create opportunity", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ opportunityId, data }: { opportunityId: string; data: Partial }) => {
      return apiRequest("PUT", `/api/opportunities/${opportunityId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "opportunities"] });
      toast({ title: "Success", description: "Opportunity updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update opportunity", variant: "destructive" });
    },
  });

  const form = useForm>({
    resolver: zodResolver(insertPipelineOpportunitySchema),
    defaultValues: {
      pipelineId: selectedPipelineId,
      name: "",
      accountId: undefined,
      contactId: undefined,
      stage: stages[0] || "Prospecting",
      status: "open",
      amount: "0",
      currency: selectedPipeline?.defaultCurrency || "USD",
      probability: 0,
      forecastCategory: "Pipeline",
      flaggedForSla: false,
    },
  });

  // Reset form when pipeline changes
  useEffect(() => {
    if (selectedPipeline) {
      form.reset({
        pipelineId: selectedPipelineId,
        name: "",
        accountId: undefined,
        contactId: undefined,
        stage: stages[0] || "Prospecting",
        status: "open",
        amount: "0",
        currency: selectedPipeline.defaultCurrency || "USD",
        probability: 0,
        forecastCategory: "Pipeline",
        flaggedForSla: false,
      });
    }
  }, [selectedPipelineId, selectedPipeline, stages, form]);

  const handleDragStart = (opportunity: OpportunityWithRelations) => {
    setDraggedOpportunity(opportunity);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (newStage: string) => {
    if (draggedOpportunity && draggedOpportunity.stage !== newStage) {
      updateMutation.mutate({
        opportunityId: draggedOpportunity.id,
        data: { stage: newStage },
      });
    }
    setDraggedOpportunity(null);
  };

  const handleCreateOpportunity = (data: z.infer) => {
    createMutation.mutate({
      ...data,
      pipelineId: selectedPipelineId,
    });
  };

  const groupedOpportunities = stages.reduce((acc, stage) => {
    acc[stage] = opportunities.filter(opp => opp.stage === stage);
    return acc;
  }, {} as Record);

  // Helper function to safely parse amounts
  const safeParseAmount = (amount: string | null | undefined): number => {
    if (!amount) return 0;
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Calculate pipeline metrics
  const pipelineMetrics = useMemo(() => {
    const totalValue = opportunities.reduce((sum, opp) => sum + safeParseAmount(opp.amount), 0);
    const dealCount = opportunities.length;
    const avgProbability = dealCount > 0
      ? opportunities.reduce((sum, opp) => sum + (opp.probability || 0), 0) / dealCount
      : 0;
    const openDeals = opportunities.filter(opp => opp.status === "open").length;
    const wonDeals = opportunities.filter(opp => opp.status === "won").length;
    const winRate = dealCount > 0 ? (wonDeals / dealCount) * 100 : 0;
    
    // Calculate weighted value (amount * probability)
    const weightedValue = opportunities.reduce((sum, opp) => {
      const amount = safeParseAmount(opp.amount);
      const probability = (opp.probability || 0) / 100;
      return sum + (amount * probability);
    }, 0);

    return {
      totalValue,
      dealCount,
      avgProbability,
      openDeals,
      wonDeals,
      winRate,
      weightedValue,
    };
  }, [opportunities]);

  if (pipelines.length === 0) {
    return (
      
        
          
            No Pipelines Found
            
              Create a pipeline to start managing opportunities
            
          
        
      
    );
  }

  if (!selectedPipelineId && pipelines.length > 0) {
    setSelectedPipelineId(pipelines[0].id);
  }

  return (
    
      
        
          Pipeline Management
          Manage your sales pipeline and opportunities
        
        
          
            
              
              New Opportunity
            
          
          
            
              Create Opportunity
              Add a new opportunity to your pipeline
            
            
              
                 (
                    
                      Name
                      
                        
                      
                      
                    
                  )}
                />
                 (
                    
                      Account (Optional)
                       field.onChange(value === "none" ? undefined : value)} 
                        value={field.value || undefined}
                      >
                        
                          
                            
                          
                        
                        
                          None
                          {accounts.map((account) => (
                            
                              {account.name}
                            
                          ))}
                        
                      
                      
                    
                  )}
                />
                 (
                    
                      Contact (Optional)
                       field.onChange(value === "none" ? undefined : value)} 
                        value={field.value || undefined}
                      >
                        
                          
                            
                          
                        
                        
                          None
                          {contacts.map((contact) => (
                            
                              {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}
                            
                          ))}
                        
                      
                      
                    
                  )}
                />
                 (
                    
                      Stage
                      
                        
                          
                            
                          
                        
                        
                          {stages.map((stage) => (
                            
                              {stage}
                            
                          ))}
                        
                      
                      
                    
                  )}
                />
                 (
                    
                      Amount
                      
                        
                      
                      
                    
                  )}
                />
                 (
                    
                      Probability (%)
                      
                         field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-probability"
                        />
                      
                      
                    
                  )}
                />
                 (
                    
                      Notes
                      
                        
                      
                      
                    
                  )}
                />
                
                   setDialogOpen(false)} data-testid="button-cancel">
                    Cancel
                  
                  
                    {createMutation.isPending ? "Creating..." : "Create"}
                  
                
              
            
          
        
      

      
        
          
            
          
          
            {pipelines.map((pipeline) => (
              
                {pipeline.name}
              
            ))}
          
        
        {selectedPipeline && (
          
            {selectedPipeline.description || "No description"}
          
        )}
      

      {/* Pipeline Metrics Dashboard */}
      {selectedPipelineId && opportunities.length > 0 && (
        
          
          
          
          
        
      )}

      {/* Multi-View Pipeline Display */}
       setViewMode(value as ViewMode)} className="w-full">
        
          
            
            Kanban
          
          
            
            List
          
          
            
            Forecast
          
        

        {/* Kanban View */}
        
      
        {stages.map((stage) => (
           handleDrop(stage)}
          >
            
              
                {stage}
                {groupedOpportunities[stage]?.length || 0} opportunities
              
            

            
              {groupedOpportunities[stage]?.map((opportunity) => (
                 handleDragStart(opportunity)}
                  data-testid={`card-opportunity-${opportunity.id}`}
                >
                  
                    
                      {opportunity.name}
                    
                  
                  
                    
                      
                      
                        {opportunity.currency} {safeParseAmount(opportunity.amount).toLocaleString()}
                      
                    
                    {opportunity.account && (
                      
                        
                        
                          {opportunity.account.name}
                        
                      
                    )}
                    {opportunity.contact && (
                      
                        
                        
                          {[opportunity.contact.firstName, opportunity.contact.lastName].filter(Boolean).join(" ")}
                        
                      
                    )}
                    {opportunity.closeDate && (
                      
                        
                        
                          {new Date(opportunity.closeDate).toLocaleDateString()}
                        
                      
                    )}
                    
                      {opportunity.probability}% probability
                    
                  
                
              ))}
            
          
        ))}
      
        

        {/* List View */}
        
          
            
              All Opportunities
              {opportunities.length} opportunities in pipeline
            
            
              
                
                  
                    Name
                    Account
                    Stage
                    Value
                    Probability
                    Status
                  
                
                
                  {opportunities.map((opportunity) => (
                    
                      {opportunity.name}
                      {opportunity.account?.name || "-"}
                      
                        {opportunity.stage}
                      
                      {opportunity.currency} {safeParseAmount(opportunity.amount).toLocaleString()}
                      {opportunity.probability}%
                      
                        
                          {opportunity.status}
                        
                      
                    
                  ))}
                
              
            
          
        

        {/* Forecast View */}
        
          
            
              
                Pipeline by Stage
                Value distribution across stages
              
              
                
                  {stages.map((stage) => {
                    const stageOpps = groupedOpportunities[stage] || [];
                    const stageValue = stageOpps.reduce((sum, opp) => sum + safeParseAmount(opp.amount), 0);
                    const stageWeightedValue = stageOpps.reduce((sum, opp) => {
                      const amount = safeParseAmount(opp.amount);
                      const probability = (opp.probability || 0) / 100;
                      return sum + (amount * probability);
                    }, 0);
                    
                    return (
                      
                        
                          {stage}
                          {stageOpps.length} deals
                        
                        
                          Total: {selectedPipeline?.defaultCurrency || 'USD'} {stageValue.toLocaleString()}
                          Weighted: {selectedPipeline?.defaultCurrency || 'USD'} {stageWeightedValue.toLocaleString()}
                        
                      
                    );
                  })}
                
              
            

            
              
                Forecast Summary
                Weighted pipeline forecast
              
              
                
                  
                    Best Case
                    {selectedPipeline?.defaultCurrency || 'USD'} {pipelineMetrics.totalValue.toLocaleString()}
                  
                  
                    Most Likely
                    {selectedPipeline?.defaultCurrency || 'USD'} {pipelineMetrics.weightedValue.toLocaleString()}
                  
                  
                    Committed
                    
                      {selectedPipeline?.defaultCurrency || 'USD'} {opportunities.filter(o => o.probability >= 80).reduce((sum, o) => sum + safeParseAmount(o.amount), 0).toLocaleString()}
                    
                  
                
              
            
          
        
      
    
  );
}