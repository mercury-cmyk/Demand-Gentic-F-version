import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIReasoning } from "@/components/ui/ai-reasoning";

export type CampaignType = "email" | "telemarketing";

export interface CampaignWizardStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
}

interface CampaignWizardProps {
  campaignType: CampaignType;
  steps: CampaignWizardStep[];
  onComplete: (data: any) => void;
  onCancel: () => void;
  initialData?: any;
  title?: string;
}

export function CampaignWizard({ campaignType, steps, onComplete, onCancel, initialData, title }: CampaignWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [campaignData, setCampaignData] = useState<any>({
    type: campaignType,
    audience: {},
    content: {},
    scheduling: {},
    compliance: {},
    ...initialData, // Merge initial data for edit mode
  });

  const progress = ((currentStep + 1) / steps.length) * 100;
  const flowStages = ["Audience", "Messaging", "Agents", "Scheduling", "Compliance", "Launch"];
  const stageMap: Record<string, number> = {
    "client-project": 0,
    audience: 0,
    content: 1,
    "dial-mode": 2,
    scheduling: 3,
    compliance: 4,
    suppressions: 4,
    "qa-parameters": 4,
    summary: 5,
  };
  const currentStageIndex = stageMap[steps[currentStep]?.id] ?? Math.min(currentStep, flowStages.length - 1);

  const handleNext = (stepData: any) => {
    // Save step data
    setCampaignData((prev: any) => ({ ...prev, ...stepData }));

    // Mark step as completed
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep]);
    }

    // Move to next step or complete
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete({ ...campaignData, ...stepData });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    // Only allow navigation to completed steps or next step
    if (stepIndex <= currentStep || completedSteps.includes(stepIndex - 1)) {
      setCurrentStep(stepIndex);
    }
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card className="border border-border/60 bg-card/70 shadow-sm">
        <CardHeader className="px-6 pt-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  {title || (campaignType === "email" ? "New Email Campaign" : "New Telemarketing Campaign")}
                </CardTitle>
                <AIReasoning 
                  summary={`Step ${currentStep + 1}: ${steps[currentStep].title}`} 
                  details={steps[currentStep].description} 
                  type="instruction"
                />
              </div>
              <Badge variant="secondary" className="text-xs font-medium">
                {Math.round(progress)}% Ready
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {flowStages.map((stage, index) => (
                <div key={stage} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      index <= currentStageIndex
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {stage}
                  </span>
                  {index < flowStages.length - 1 && (
                    <span className="h-px w-6 bg-border/70" />
                  )}
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <Progress value={progress} className="h-1.5 bg-secondary/60" />

            {/* Step Indicators */}
            <div className="flex items-center justify-between">
              {steps.map((step, index) => {
                const isCompleted = completedSteps.includes(index);
                const isCurrent = index === currentStep;
                const isAccessible = index <= currentStep || completedSteps.includes(index - 1);

                return (
                  <button
                    key={step.id}
                    onClick={() => handleStepClick(index)}
                    disabled={!isAccessible}
                    className={cn(
                      "flex flex-col items-center gap-2 transition-opacity",
                      !isAccessible && "opacity-40 cursor-not-allowed",
                      isAccessible && !isCurrent && "hover-elevate cursor-pointer"
                    )}
                    data-testid={`step-indicator-${step.id}`}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center border transition-colors",
                        isCurrent && "border-primary bg-primary/10 text-primary",
                        isCompleted && !isCurrent && "border-success/30 bg-success/10 text-success",
                        !isCurrent && !isCompleted && "border-border/60 bg-muted/40 text-muted-foreground"
                      )}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span className="text-xs font-semibold">{index + 1}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-center max-w-[100px]">
                      <div className={cn("font-medium", isCurrent && "text-primary")}>
                        {step.title}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Current Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep].title}</CardTitle>
          <CardDescription>{steps[currentStep].description}</CardDescription>
        </CardHeader>
        <CardContent>
          <CurrentStepComponent
            data={campaignData}
            onNext={handleNext}
            onBack={handleBack}
            onChange={(newData: any) => setCampaignData((prev: any) => ({ ...prev, ...newData }))}
            campaignType={campaignType}
          />
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={currentStep === 0 ? onCancel : handleBack}
          data-testid="button-wizard-back"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          {currentStep === 0 ? "Cancel" : "Back"}
        </Button>

        <Badge variant="outline" className="text-xs font-medium">
          Step {currentStep + 1} of {steps.length}
        </Badge>
      </div>
    </div>
  );
}
