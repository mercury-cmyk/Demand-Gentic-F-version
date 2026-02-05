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
  config: Record<string, any> | null;
  status: StepStatus;
}

export const CAMPAIGN_STEPS: Omit<StepConfig, "config" | "status">[] = [
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
  onSaveEdit: (config: Record<string, any>) => void;
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
  const [editedConfig, setEditedConfig] = useState<string>("");
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
        return <Badge variant="secondary">Pending</Badge>;
      case "generating":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Generating
          </Badge>
        );
      case "ready":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
            Ready for Review
          </Badge>
        );
      case "editing":
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">
            <Edit2 className="h-3 w-3 mr-1" />
            Editing
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
            <Check className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
    }
  };

  return (
    <Card
      className={cn(
        "transition-all",
        isActive && "ring-2 ring-primary/50",
        step.status === "approved" && "bg-green-50/30"
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    step.status === "approved"
                      ? "bg-green-100 text-green-600"
                      : step.status === "ready" || step.status === "editing"
                      ? "bg-amber-100 text-amber-600"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-sm">{step.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {step.description}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge()}
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {step.status === "pending" && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-4">
                  Ask the agent to generate this configuration, or provide details in the chat.
                </p>
                <Button onClick={onGenerate} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate with AI
                    </>
                  )}
                </Button>
              </div>
            )}

            {step.status === "generating" && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" />
                <span className="text-sm text-muted-foreground">
                  AI is generating configuration...
                </span>
              </div>
            )}

            {(step.status === "ready" || step.status === "approved") && step.config && (
              <div className="space-y-4">
                <pre className="bg-muted/50 rounded-lg p-4 text-xs overflow-auto max-h-64">
                  {JSON.stringify(step.config, null, 2)}
                </pre>
                <div className="flex gap-2">
                  {step.status === "ready" && (
                    <>
                      <Button onClick={onApprove} className="flex-1">
                        <Check className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button variant="outline" onClick={handleStartEdit}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </>
                  )}
                  {step.status === "approved" && (
                    <Button variant="outline" onClick={handleStartEdit} className="w-full">
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Configuration
                    </Button>
                  )}
                </div>
              </div>
            )}

            {step.status === "editing" && (
              <div className="space-y-4">
                <Textarea
                  value={editedConfig}
                  onChange={(e) => setEditedConfig(e.target.value)}
                  className="font-mono text-xs min-h-[200px]"
                  placeholder="Edit configuration JSON..."
                />
                <div className="flex gap-2">
                  <Button onClick={handleSaveEdit} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={onCancelEdit}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

interface StepConfigurationPanelProps {
  steps: StepConfig[];
  currentStep: string;
  onGenerateStep: (stepId: string) => void;
  onApproveStep: (stepId: string) => void;
  onEditStep: (stepId: string) => void;
  onSaveStepEdit: (stepId: string, config: Record<string, any>) => void;
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
    <div className={cn("space-y-4", className)}>
      {/* Progress Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Campaign Configuration</CardTitle>
              <CardDescription>
                {approvedCount} of {totalSteps} sections approved
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(approvedCount / totalSteps) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium">
                {Math.round((approvedCount / totalSteps) * 100)}%
              </span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Step Cards */}
      <div className="space-y-3">
        {steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            isActive={currentStep === step.id}
            onGenerate={() => onGenerateStep(step.id)}
            onApprove={() => onApproveStep(step.id)}
            onEdit={() => onEditStep(step.id)}
            onSaveEdit={(config) => onSaveStepEdit(step.id, config)}
            onCancelEdit={() => onCancelStepEdit(step.id)}
            isGenerating={isGenerating && currentStep === step.id}
          />
        ))}
      </div>

      {/* Finalize Button */}
      <Card className={cn(canFinalize && "ring-2 ring-green-500/50 bg-green-50/30")}>
        <CardContent className="py-4">
          <Button
            onClick={onFinalize}
            disabled={!canFinalize}
            className="w-full"
            size="lg"
          >
            <ClipboardCheck className="h-5 w-5 mr-2" />
            {canFinalize
              ? "Create Campaign"
              : `Complete all sections to finalize (${approvedCount}/${totalSteps})`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default StepConfigurationPanel;
