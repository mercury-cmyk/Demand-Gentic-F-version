import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface PlanStep {
  id: string;
  stepNumber: number;
  tool: string;
  description: string;
  args: Record<string, any>;
  isDestructive: boolean;
  estimatedImpact?: string;
}

interface ExecutionPlan {
  id: string;
  steps: PlanStep[];
  riskLevel: 'low' | 'medium' | 'high';
  status: string;
}

interface AgentPlanViewerProps {
  plan: ExecutionPlan;
  onApprove: () => void;
  onReject: () => void;
  onModify?: (modifications: any) => void;
}

const riskConfig = {
  low: {
    icon: ShieldCheck,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    label: 'Low Risk',
  },
  medium: {
    icon: Shield,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    label: 'Medium Risk',
  },
  high: {
    icon: ShieldAlert,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    label: 'High Risk',
  },
};

export function AgentPlanViewer({
  plan,
  onApprove,
  onReject,
  onModify,
}: AgentPlanViewerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(
    new Set(plan.steps.map((s) => s.id))
  );

  const risk = riskConfig[plan.riskLevel];
  const RiskIcon = risk.icon;

  const toggleStep = (stepId: string) => {
    const newSelected = new Set(selectedSteps);
    if (newSelected.has(stepId)) {
      newSelected.delete(stepId);
    } else {
      newSelected.add(stepId);
    }
    setSelectedSteps(newSelected);
  };

  const handleApprove = () => {
    // If any steps were deselected, pass modifications
    const removedSteps = plan.steps
      .filter((s) => !selectedSteps.has(s.id))
      .map((s) => s.id);

    if (removedSteps.length > 0 && onModify) {
      onModify({ removedSteps });
    }
    onApprove();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className={cn('border-2', risk.borderColor)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Play className="h-4 w-4 text-primary" />
              Execution Plan
            </CardTitle>
            <Badge
              variant="outline"
              className={cn('flex items-center gap-1', risk.color, risk.bgColor)}
            >
              <RiskIcon className="h-3 w-3" />
              {risk.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Review the {plan.steps.length} steps below before approving.
          </p>
        </CardHeader>

        <CardContent className="pb-3">
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between mb-2"
              >
                <span className="text-sm font-medium">
                  {selectedSteps.size} of {plan.steps.length} steps selected
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="space-y-2">
                {plan.steps.map((step, index) => (
                  <PlanStepItem
                    key={step.id}
                    step={step}
                    isSelected={selectedSteps.has(step.id)}
                    onToggle={() => toggleStep(step.id)}
                    isLast={index === plan.steps.length - 1}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>

        <CardFooter className="flex justify-between gap-2 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
            className="flex-1"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={selectedSteps.size === 0}
            className="flex-1"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Approve & Execute
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

// Individual Step Item
interface PlanStepItemProps {
  step: PlanStep;
  isSelected: boolean;
  onToggle: () => void;
  isLast: boolean;
}

function PlanStepItem({ step, isSelected, onToggle, isLast }: PlanStepItemProps) {
  const [showArgs, setShowArgs] = useState(false);

  return (
    <div
      className={cn(
        'relative pl-6 pb-3',
        !isLast && 'border-l-2 border-muted ml-2'
      )}
    >
      {/* Step indicator */}
      <div
        className={cn(
          'absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold cursor-pointer transition-colors',
          isSelected
            ? step.isDestructive
              ? 'bg-amber-500 text-white'
              : 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
        onClick={onToggle}
      >
        {step.stepNumber}
      </div>

      <div
        className={cn(
          'ml-3 p-2 rounded-md transition-colors cursor-pointer',
          isSelected ? 'bg-muted/50' : 'bg-muted/20 opacity-50'
        )}
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant={step.isDestructive ? 'destructive' : 'secondary'}
                className="text-xs shrink-0"
              >
                {step.tool}
              </Badge>
              {step.isDestructive && (
                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
              )}
            </div>
            <p className="text-sm mt-1">{step.description}</p>
            {step.estimatedImpact && (
              <p className="text-xs text-muted-foreground mt-1">
                Impact: {step.estimatedImpact}
              </p>
            )}
          </div>

          {Object.keys(step.args).length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setShowArgs(!showArgs);
              }}
            >
              {showArgs ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>

        {showArgs && Object.keys(step.args).length > 0 && (
          <div className="mt-2 p-2 bg-background rounded text-xs font-mono overflow-x-auto">
            <pre>{JSON.stringify(step.args, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// Step Progress Component (for showing execution progress)
interface AgentStepProgressProps {
  steps: PlanStep[];
  currentStep: number;
  completedSteps: string[];
  failedSteps: string[];
}

export function AgentStepProgress({
  steps,
  currentStep,
  completedSteps,
  failedSteps,
}: AgentStepProgressProps) {
  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Execution Progress</span>
        <span className="text-xs text-muted-foreground">
          {completedSteps.length} / {steps.length} complete
        </span>
      </div>

      <div className="space-y-1">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isFailed = failedSteps.includes(step.id);
          const isCurrent = index === currentStep;

          return (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-2 p-2 rounded text-sm',
                isCurrent && 'bg-primary/10',
                isCompleted && 'opacity-60'
              )}
            >
              <div className="w-5 h-5 flex items-center justify-center">
                {isCompleted ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : isFailed ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : isCurrent ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Play className="h-4 w-4 text-primary" />
                  </motion.div>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                )}
              </div>
              <span className={cn(isCurrent && 'font-medium')}>
                {step.description}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
