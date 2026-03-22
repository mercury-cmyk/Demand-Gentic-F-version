import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  Loader2,
  Target,
  Users,
  Mic,
  Phone,
  FileText,
  ClipboardCheck,
  Sparkles,
  Save,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "pending" | "generating" | "ready" | "editing" | "approved";

export interface StepConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  config: Record | null;
  status: StepStatus;
}

export const CAMPAIGN_STEPS: Omit[] = [
  {
    id: "context",
    name: "Context",
    description: "Campaign objective, product info, success criteria",
    icon: Target,
  },
  {
    id: "audience",
    name: "Audience",
    description: "Target industries, titles, regions, and firmographics",
    icon: Users,
  },
  {
    id: "voice",
    name: "Voice",
    description: "AI voice selection for phone campaigns",
    icon: Mic,
  },
  {
    id: "phone",
    name: "Phone",
    description: "Phone number and caller ID configuration",
    icon: Phone,
  },
  {
    id: "content",
    name: "Content",
    description: "Scripts, email templates, and messaging",
    icon: FileText,
  },
];

interface StepCardProps {
  step: StepConfig;
  isActive: boolean;
  onGenerate: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onSaveEdit: (config: Record) => void;
  onCancelEdit: () => void;
  isGenerating?: boolean;
}

function StepCard({
  step,
  isActive,
  onGenerate,
  onApprove,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  isGenerating,
}: StepCardProps) {
  const [isOpen, setIsOpen] = useState(step.status !== "pending");
  const [editedConfig, setEditedConfig] = useState("");
  const Icon = step.icon;

  const handleStartEdit = () => {
    setEditedConfig(JSON.stringify(step.config, null, 2));
    onEdit();
  };

  const handleSaveEdit = () => {
    try {
      const parsed = JSON.parse(editedConfig);
      onSaveEdit(parsed);
    } catch (e) {
      // Invalid JSON, keep editing
    }
  };

  const getStatusBadge = () => {
    switch (step.status) {
      case "pending":
        return Pending;
      case "generating":
        return (
          
            
            Generating
          
        );
      case "ready":
        return (
          
            Ready for Review
          
        );
      case "editing":
        return (
          
            
            Editing
          
        );
      case "approved":
        return (
          
            
            Approved
          
        );
    }
  };

  return (
    
      
        
          
            
              
                
                  
                
                
                  {step.name}
                  
                    {step.description}
                  
                
              
              
                {getStatusBadge()}
                {isOpen ? (
                  
                ) : (
                  
                )}
              
            
          
        
        
          
            {step.status === "pending" && (
              
                
                  Ask the agent to generate this configuration, or provide details in the chat.
                
                
                  {isGenerating ? (
                    <>
                      
                      Generating...
                    
                  ) : (
                    <>
                      
                      Generate with AI
                    
                  )}
                
              
            )}

            {step.status === "generating" && (
              
                
                
                  AI is generating configuration...
                
              
            )}

            {(step.status === "ready" || step.status === "approved") && step.config && (
              
                
                  {JSON.stringify(step.config, null, 2)}
                
                
                  {step.status === "ready" && (
                    <>
                      
                        
                        Approve
                      
                      
                        
                        Edit
                      
                    
                  )}
                  {step.status === "approved" && (
                    
                      
                      Edit Configuration
                    
                  )}
                
              
            )}

            {step.status === "editing" && (
              
                 setEditedConfig(e.target.value)}
                  className="font-mono text-xs min-h-[200px]"
                  placeholder="Edit configuration JSON..."
                />
                
                  
                    
                    Save Changes
                  
                  
                    
                    Cancel
                  
                
              
            )}
          
        
      
    
  );
}

interface StepConfigurationPanelProps {
  steps: StepConfig[];
  currentStep: string;
  onGenerateStep: (stepId: string) => void;
  onApproveStep: (stepId: string) => void;
  onEditStep: (stepId: string) => void;
  onSaveStepEdit: (stepId: string, config: Record) => void;
  onCancelStepEdit: (stepId: string) => void;
  onFinalize: () => void;
  isGenerating?: boolean;
  canFinalize?: boolean;
  className?: string;
}

export function StepConfigurationPanel({
  steps,
  currentStep,
  onGenerateStep,
  onApproveStep,
  onEditStep,
  onSaveStepEdit,
  onCancelStepEdit,
  onFinalize,
  isGenerating,
  canFinalize,
  className,
}: StepConfigurationPanelProps) {
  const approvedCount = steps.filter((s) => s.status === "approved").length;
  const totalSteps = steps.length;

  return (
    
      {/* Progress Header */}
      
        
          
            
              Campaign Configuration
              
                {approvedCount} of {totalSteps} sections approved
              
            
            
              
                
              
              
                {Math.round((approvedCount / totalSteps) * 100)}%
              
            
          
        
      

      {/* Step Cards */}
      
        {steps.map((step) => (
           onGenerateStep(step.id)}
            onApprove={() => onApproveStep(step.id)}
            onEdit={() => onEditStep(step.id)}
            onSaveEdit={(config) => onSaveStepEdit(step.id, config)}
            onCancelEdit={() => onCancelStepEdit(step.id)}
            isGenerating={isGenerating && currentStep === step.id}
          />
        ))}
      

      {/* Finalize Button */}
      
        
          
            
            {canFinalize
              ? "Create Campaign"
              : `Complete all sections to finalize (${approvedCount}/${totalSteps})`}
          
        
      
    
  );
}

export default StepConfigurationPanel;