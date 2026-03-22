import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

export interface StepItem {
  id: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepItem[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  allowStepClick?: boolean;
  className?: string;
}

export function Stepper({
  steps,
  currentStep,
  onStepClick,
  allowStepClick = false,
  className,
}: StepperProps) {
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    
      {/* Progress bar */}
      
        
          
        
        
          {steps.map((step, index) => {
            const isCompleted = index  currentStep;
            const isClickable = allowStepClick && (isCompleted || isCurrent);

            return (
              
                 isClickable && onStepClick?.(index)}
                  disabled={!isClickable}
                  className={cn(
                    "relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-medium transition-colors",
                    isCompleted && "bg-primary border-primary text-primary-foreground",
                    isCurrent && "bg-background border-primary text-primary ring-4 ring-primary/20",
                    isUpcoming && "bg-muted border-muted-foreground/30 text-muted-foreground",
                    isClickable && "cursor-pointer hover-elevate active-elevate-2",
                    !isClickable && "cursor-not-allowed"
                  )}
                  data-testid={`stepper-step-${index}`}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Step ${index + 1}: ${step.label}`}
                >
                  {isCompleted ? (
                    
                  ) : (
                    {index + 1}
                  )}
                
              
            );
          })}
        
      

      {/* Step labels */}
      
        {steps.map((step, index) => {
          const isCompleted = index  currentStep;

          return (
            
              
                {step.label}
              
              {step.description && (
                
                  {step.description}
                
              )}
            
          );
        })}
      
    
  );
}

// Compact stepper variant for smaller spaces
export interface CompactStepperProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

export function CompactStepper({
  steps,
  currentStep,
  className,
}: CompactStepperProps) {
  return (
    
      {steps.map((step, index) => {
        const isCompleted = index 
            
              
                {isCompleted ? (
                  
                ) : (
                  {index + 1}
                )}
              
              {step}
            
            {index 
            )}
          
        );
      })}
    
  );
}

// Vertical stepper for sidebar navigation
export interface VerticalStepperProps {
  steps: StepItem[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  allowStepClick?: boolean;
  className?: string;
}

export function VerticalStepper({
  steps,
  currentStep,
  onStepClick,
  allowStepClick = false,
  className,
}: VerticalStepperProps) {
  return (
    
      {steps.map((step, index) => {
        const isCompleted = index  currentStep;
        const isClickable = allowStepClick && (isCompleted || isCurrent);

        return (
          
            {index 
            )}
             isClickable && onStepClick?.(index)}
              disabled={!isClickable}
              className={cn(
                "flex items-start gap-4 w-full text-left transition-all rounded-lg p-3 -m-3",
                isClickable && "hover:bg-accent/50 cursor-pointer",
                !isClickable && "cursor-not-allowed"
              )}
              data-testid={`vertical-step-${index}`}
            >
              
                {isCompleted ? (
                  
                ) : (
                  {index + 1}
                )}
              
              
                
                  {step.label}
                
                {step.description && (
                  
                    {step.description}
                  
                )}
              
            
          
        );
      })}
    
  );
}