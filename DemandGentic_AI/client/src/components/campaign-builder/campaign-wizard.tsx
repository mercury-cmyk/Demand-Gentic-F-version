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
  component: React.ComponentType;
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
  const [completedSteps, setCompletedSteps] = useState([]);
  const [campaignData, setCampaignData] = useState({
    type: campaignType,
    audience: {},
    content: {},
    scheduling: {},
    compliance: {},
    ...initialData, // Merge initial data for edit mode
  });

  const progress = ((currentStep + 1) / steps.length) * 100;
  const flowStages = ["Audience", "Messaging", "Agents", "Scheduling", "Compliance", "Launch"];
  const stageMap: Record = {
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
    if (currentStep  {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    // Only allow navigation to completed steps or next step
    if (stepIndex 
      {/* Progress Header */}
      
        
          
            
              
                
                  {title || (campaignType === "email" ? "New Email Campaign" : "New Telemarketing Campaign")}
                
                
              
              
                {Math.round(progress)}% Ready
              
            

            
              {flowStages.map((stage, index) => (
                
                  
                    {stage}
                  
                  {index 
                  )}
                
              ))}
            

            {/* Progress Bar */}
            

            {/* Step Indicators */}
            
              {steps.map((step, index) => {
                const isCompleted = completedSteps.includes(index);
                const isCurrent = index === currentStep;
                const isAccessible = index  handleStepClick(index)}
                    disabled={!isAccessible}
                    className={cn(
                      "flex flex-col items-center gap-2 transition-opacity",
                      !isAccessible && "opacity-40 cursor-not-allowed",
                      isAccessible && !isCurrent && "hover-elevate cursor-pointer"
                    )}
                    data-testid={`step-indicator-${step.id}`}
                  >
                    
                      {isCompleted ? (
                        
                      ) : (
                        {index + 1}
                      )}
                    
                    
                      
                        {step.title}
                      
                    
                  
                );
              })}
            
          
        
      

      {/* Current Step Content */}
      
        
          {steps[currentStep].title}
          {steps[currentStep].description}
        
        
           setCampaignData((prev: any) => ({ ...prev, ...newData }))}
            campaignType={campaignType}
          />
        
      

      {/* Navigation Buttons */}
      
        
          
          {currentStep === 0 ? "Cancel" : "Back"}
        

        
          Step {currentStep + 1} of {steps.length}
        
      
    
  );
}