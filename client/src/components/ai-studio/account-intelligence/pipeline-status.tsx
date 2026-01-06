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
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted -z-10" />
      <div className="space-y-6">
        {steps.map((step, index) => (
          <div key={step.id} className="flex gap-4 items-start">
            <div className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background",
              step.status === "completed" && "border-primary bg-primary text-primary-foreground",
              step.status === "processing" && "border-primary",
              step.status === "error" && "border-destructive text-destructive"
            )}>
              {step.status === "completed" && <CheckCircle2 className="h-4 w-4" />}
              {step.status === "processing" && <Loader2 className="h-4 w-4 animate-spin" />}
              {step.status === "pending" && <Circle className="h-4 w-4 text-muted-foreground" />}
              {step.status === "error" && <AlertCircle className="h-4 w-4" />}
            </div>
            <div className="space-y-1 pt-1">
              <p className="text-sm font-medium leading-none">{step.label}</p>
              {step.description && (
                <p className="text-xs text-muted-foreground">{step.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
