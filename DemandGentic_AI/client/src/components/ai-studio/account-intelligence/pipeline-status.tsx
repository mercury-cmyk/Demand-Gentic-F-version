import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStep {
  id: string;
  label: string;
  status: "pending" | "processing" | "completed" | "error";
  description?: string;
}

interface PipelineStatusProps {
  steps: PipelineStep[];
}

export function PipelineStatus({ steps }: PipelineStatusProps) {
  return (
    
      
      
        {steps.map((step, index) => (
          
            
              {step.status === "completed" && }
              {step.status === "processing" && }
              {step.status === "pending" && }
              {step.status === "error" && }
            
            
              {step.label}
              {step.description && (
                {step.description}
              )}
            
          
        ))}
      
    
  );
}