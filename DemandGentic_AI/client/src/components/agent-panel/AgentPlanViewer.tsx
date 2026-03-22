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
  args: Record;
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
  const [selectedSteps, setSelectedSteps] = useState>(
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
    
      
        
          
            
              
              Execution Plan
            
            
              
              {risk.label}
            
          
          
            Review the {plan.steps.length} steps below before approving.
          
        

        
          
            
              
                
                  {selectedSteps.size} of {plan.steps.length} steps selected
                
                {isExpanded ? (
                  
                ) : (
                  
                )}
              
            

            
              
                {plan.steps.map((step, index) => (
                   toggleStep(step.id)}
                    isLast={index === plan.steps.length - 1}
                  />
                ))}
              
            
          
        

        
          
            
            Cancel
          
          
            
            Approve & Execute
          
        
      
    
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
    
      {/* Step indicator */}
      
        {step.stepNumber}
      

      
        
          
            
              
                {step.tool}
              
              {step.isDestructive && (
                
              )}
            
            {step.description}
            {step.estimatedImpact && (
              
                Impact: {step.estimatedImpact}
              
            )}
          

          {Object.keys(step.args).length > 0 && (
             {
                e.stopPropagation();
                setShowArgs(!showArgs);
              }}
            >
              {showArgs ? (
                
              ) : (
                
              )}
            
          )}
        

        {showArgs && Object.keys(step.args).length > 0 && (
          
            {JSON.stringify(step.args, null, 2)}
          
        )}
      
    
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
    
      
        Execution Progress
        
          {completedSteps.length} / {steps.length} complete
        
      

      
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isFailed = failedSteps.includes(step.id);
          const isCurrent = index === currentStep;

          return (
            
              
                {isCompleted ? (
                  
                ) : isFailed ? (
                  
                ) : isCurrent ? (
                  
                    
                  
                ) : (
                  
                )}
              
              
                {step.description}
              
            
          );
        })}
      
    
  );
}