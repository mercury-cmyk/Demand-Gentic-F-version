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
    <div className={cn("w-full", className)} data-testid="stepper">
      {/* Progress bar */}
      <div className="relative mb-8">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            data-testid="stepper-progress-bar"
          />
        </div>
        <div className="absolute -top-1 left-0 w-full flex justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            const isUpcoming = index > currentStep;
            const isClickable = allowStepClick && (isCompleted || isCurrent);

            return (
              <div
                key={step.id}
                className="flex flex-col items-center"
                style={{ width: `${100 / steps.length}%` }}
              >
                <button
                  onClick={() => isClickable && onStepClick?.(index)}
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
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step labels */}
      <div className="flex justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <div
              key={step.id}
              className={cn(
                "flex flex-col items-center text-center transition-opacity",
                (isCompleted || isCurrent) && "opacity-100",
                isUpcoming && "opacity-50"
              )}
              style={{ width: `${100 / steps.length}%` }}
            >
              <p
                className={cn(
                  "text-sm font-medium mt-2",
                  isCurrent && "text-foreground",
                  (isCompleted || isUpcoming) && "text-muted-foreground"
                )}
                data-testid={`stepper-label-${index}`}
              >
                {step.label}
              </p>
              {step.description && (
                <p className="text-xs text-muted-foreground mt-1 px-2">
                  {step.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
    <div className={cn("flex items-center gap-2", className)} data-testid="compact-stepper">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={index} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                isCompleted && "bg-primary/10 text-primary",
                isCurrent && "bg-primary text-primary-foreground",
                !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
              )}
              data-testid={`compact-step-${index}`}
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-current text-background text-xs">
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="text-background">{index + 1}</span>
                )}
              </span>
              <span>{step}</span>
            </div>
            {index < steps.length - 1 && (
              <div className="w-8 h-px bg-border" />
            )}
          </div>
        );
      })}
    </div>
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
    <div className={cn("space-y-4", className)} data-testid="vertical-stepper">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isUpcoming = index > currentStep;
        const isClickable = allowStepClick && (isCompleted || isCurrent);

        return (
          <div key={step.id} className="relative">
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "absolute left-4 top-10 w-0.5 h-full -ml-px transition-colors",
                  isCompleted ? "bg-primary" : "bg-border"
                )}
              />
            )}
            <button
              onClick={() => isClickable && onStepClick?.(index)}
              disabled={!isClickable}
              className={cn(
                "flex items-start gap-4 w-full text-left transition-all rounded-lg p-3 -m-3",
                isClickable && "hover:bg-accent/50 cursor-pointer",
                !isClickable && "cursor-not-allowed"
              )}
              data-testid={`vertical-step-${index}`}
            >
              <div
                className={cn(
                  "relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-medium flex-shrink-0 transition-all",
                  isCompleted && "bg-primary border-primary text-primary-foreground",
                  isCurrent && "bg-background border-primary text-primary ring-4 ring-primary/20",
                  isUpcoming && "bg-muted border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isCurrent && "text-foreground",
                    (isCompleted || isUpcoming) && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {step.description}
                  </p>
                )}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
