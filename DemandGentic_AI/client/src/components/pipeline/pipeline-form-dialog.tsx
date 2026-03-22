import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const pipelineSchema = z.object({
  name: z.string().min(1, "Pipeline name is required"),
  category: z.enum(["media_partnership", "direct_sales"]).default("direct_sales"),
  defaultCurrency: z.string().default("USD"),
  stageOrder: z.array(z.string()).min(1, "At least one stage is required"),
});

type PipelineFormData = z.infer;

interface PipelineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline?: any;
}

const DEFAULT_STAGES = [
  "qualification",
  "proposal",
  "negotiation",
  "closedWon",
  "closedLost",
];

export function PipelineFormDialog({
  open,
  onOpenChange,
  pipeline,
}: PipelineFormDialogProps) {
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const isEditing = !!pipeline;

  const form = useForm({
    resolver: zodResolver(pipelineSchema),
    defaultValues: {
      name: pipeline?.name || "",
      category: pipeline?.category || "direct_sales",
      defaultCurrency: pipeline?.defaultCurrency || "USD",
      stageOrder: pipeline?.stageOrder || DEFAULT_STAGES,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PipelineFormData) => {
      if (isEditing) {
        return await apiRequest("PUT", `/api/pipelines/${pipeline.id}`, data);
      }
      
      // SECURITY: Send only user input - server assigns id, ownerId, and tenantId
      // from authenticated session to prevent spoofing
      return await apiRequest("POST", "/api/pipelines", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines"] });
      toast({
        title: "Success",
        description: `Pipeline ${isEditing ? "updated" : "created"} successfully`,
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PipelineFormData) => {
    console.log("[PipelineForm] Submitting data:", JSON.stringify(data, null, 2));
    createMutation.mutate(data);
  };

  return (
    
      
        
          
            {isEditing ? "Edit Pipeline" : "Create Pipeline"}
          
          
            Configure your sales pipeline stages and settings
          
        

        
          
             (
                
                  Pipeline Category
                  
                    
                      
                        
                      
                    
                    
                      Direct Sales - Medium & Enterprise
                      Media & Data Partnerships - CPL/CPC
                    
                  
                  
                
              )}
            />

             (
                
                  Pipeline Name
                  
                    
                  
                  
                
              )}
            />

             (
                
                  Default Currency
                  
                    
                      
                        
                      
                    
                    
                      USD - US Dollar
                      EUR - Euro
                      GBP - British Pound
                      CAD - Canadian Dollar
                    
                  
                  
                
              )}
            />

            
               onOpenChange(false)}
              >
                Cancel
              
              
                {createMutation.isPending && (
                  
                )}
                {isEditing ? "Update" : "Create"} Pipeline
              
            
          
        
      
    
  );
}