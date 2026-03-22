import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/patterns/page-shell";
import { KanbanBoard, DefaultKanbanCard } from "@/components/patterns/kanban-board";
import { Button } from "@/components/ui/button";
import { Plus, Settings } from "lucide-react";
import { PipelineFormDialog } from "@/components/pipeline/pipeline-form-dialog";
import { OpportunityFormDialog } from "@/components/pipeline/opportunity-form-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function PipelineKanbanPage() {
  const { toast } = useToast();
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");

  const { data: pipelines = [] } = useQuery({
    queryKey: ["/api/pipelines"],
  });

  const selectedPipeline = pipelines.find((p: any) => p.id === selectedPipelineId) || pipelines[0];

  const { data: opportunities = [] } = useQuery({
    queryKey: [`/api/pipelines/${selectedPipeline?.id}/opportunities`],
    enabled: !!selectedPipeline,
  });

  // Group opportunities by stage
  const columns = selectedPipeline?.stageOrder?.map((stage: string) => ({
    id: stage,
    title: stage.charAt(0).toUpperCase() + stage.slice(1).replace(/([A-Z])/g, ' $1'),
    color: getStageColor(stage),
    items: opportunities.filter((opp: any) => opp.stage === stage),
  })) || [];

  const handleColumnChange = async (
    itemId: string,
    fromColumnId: string,
    toColumnId: string
  ) => {
    try {
      await apiRequest("POST", `/api/opportunities/${itemId}/move`, {
        stage: toColumnId,
      });

      toast({
        title: "Success",
        description: "Opportunity moved successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    
           setPipelineDialogOpen(true)}>
            
            Manage Pipelines
          
           setOpportunityDialogOpen(true)}>
            
            New Opportunity
          
        
      }
    >
      
        {selectedPipeline ? (
           opp.id}
            renderCard={({ item: opp }) => (
              
                    {opp.ownerName || "Unassigned"}
                    
                      {new Date(opp.closeDate).toLocaleDateString()}
                    
                  
                }
              />
            )}
          />
        ) : (
          
            
              No pipelines configured
               setPipelineDialogOpen(true)}>
                Create Your First Pipeline
              
            
          
        )}
      

      

      {selectedPipeline && (
        
      )}
    
  );
}

function getStageColor(stage: string): string {
  const colors: Record = {
    qualification: "#60a5fa",
    proposal: "#fbbf24",
    negotiation: "#f97316",
    closedWon: "#22c55e",
    closedLost: "#ef4444",
  };
  return colors[stage] || "#94a3b8";
}