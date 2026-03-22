import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  isExecuting?: boolean;
}

const riskConfig = {
  low: {
    icon: ShieldCheck,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    label: 'Low Risk',
  },
  medium: {
    icon: Shield,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    label: 'Medium Risk',
  },
  high: {
    icon: ShieldAlert,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    label: 'High Risk',
  },
};

export function AgentPlanViewer({
  plan,
  onApprove,
  onReject,
  onModify,
  isExecuting,
}: AgentPlanViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex gap-3"
    >
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
        <Zap className="h-3.5 w-3.5 text-primary" />
      </div>

      {/* Plan card */}
      <div className="flex-1 max-w-[90%] space-y-1.5">
        <span className="text-[10px] font-medium text-muted-foreground/60 px-0.5">AgentC</span>

        <div className={cn(
          'rounded-2xl rounded-tl-md border overflow-hidden',
          risk.border,
          'bg-card shadow-sm'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/20">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold">Execution Plan</span>
              <span className="text-xs text-muted-foreground">
                {plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}
              </span>
            </div>
            <Badge variant="outline" className={cn('text-[10px] gap-1', risk.color, risk.bg)}>
              <RiskIcon className="h-3 w-3" />
              {risk.label}
            </Badge>
          </div>

          {/* Steps summary / expandable */}
          <div className="px-4 py-3">
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                  <span className="font-medium">
                    {isExpanded ? 'Hide' : 'View'} steps ({selectedSteps.size}/{plan.steps.length} selected)
                  </span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="mt-2 space-y-1">
                  {plan.steps.map((step) => {
                    const selected = selectedSteps.has(step.id);
                    return (
                      <div
                        key={step.id}
                        onClick={() => toggleStep(step.id)}
                        className={cn(
                          'flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-all text-xs',
                          selected
                            ? 'bg-muted/50 hover:bg-muted/70'
                            : 'opacity-40 hover:opacity-60'
                        )}
                      >
                        <div className={cn(
                          'w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5',
                          selected
                            ? step.isDestructive
                              ? 'bg-amber-500 text-white'
                              : 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {step.stepNumber}
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={step.isDestructive ? 'destructive' : 'secondary'}
                              className="text-[10px] px-1.5 py-0 h-4"
                            >
                              {step.tool}
                            </Badge>
                            {step.isDestructive && (
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                          {step.estimatedImpact && (
                            <p className="text-[10px] text-muted-foreground/60">Impact: {step.estimatedImpact}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border/30 bg-muted/10">
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={isExecuting}
              className="flex-1 h-8 text-xs"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={selectedSteps.size === 0 || isExecuting}
              className="flex-1 h-8 text-xs"
            >
              {isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isExecuting ? 'Executing...' : 'Approve & Execute'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
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
    <div className="space-y-1.5">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isFailed = failedSteps.includes(step.id);
        const isCurrent = index === currentStep;

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors',
              isCompleted && 'bg-emerald-50/50 dark:bg-emerald-950/20',
              isFailed && 'bg-red-50/50 dark:bg-red-950/20',
              isCurrent && 'bg-primary/5'
            )}
          >
            <div className="shrink-0">
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : isFailed ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : isCurrent ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className={cn(
                'font-medium',
                isCompleted && 'text-emerald-700 dark:text-emerald-300',
                isFailed && 'text-red-700 dark:text-red-300'
              )}>
                {step.description}
              </span>
            </div>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
              {step.tool}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
