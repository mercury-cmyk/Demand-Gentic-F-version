import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildCallFlowPromptSection,
  createCampaignTypeCallFlowPreset,
  getEnabledCallFlowSteps,
  normalizeCampaignCallFlow,
  type CampaignCallFlow,
  type CampaignCallFlowStep,
} from "@shared/call-flow";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  CircleOff,
  GripVertical,
  ListOrdered,
  Plus,
  RotateCcw,
  Trash2,
  Workflow,
} from "lucide-react";

interface CallFlowEditorProps {
  campaignType?: string | null;
  value?: CampaignCallFlow | null;
  onChange: (next: CampaignCallFlow) => void;
  title?: string;
  description?: string;
}

function reorderSteps(
  steps: CampaignCallFlowStep[],
  fromIndex: number,
  toIndex: number,
): CampaignCallFlowStep[] {
  if (toIndex = steps.length) return steps;
  const next = [...steps];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function CallFlowEditor({
  campaignType,
  value,
  onChange,
  title = "Call Flow Builder",
  description = "Define the exact sequence the agent should follow for this campaign, including which stages are active and which ones must be completed before moving on.",
}: CallFlowEditorProps) {
  const flow = normalizeCampaignCallFlow(value, campaignType);
  const enabledSteps = getEnabledCallFlowSteps(flow);
  const requiredSteps = enabledSteps.filter((step) => step.required);
  const customStepCount = flow.steps.filter((step) => step.key === "custom").length;
  const enabledOrder = new Map(enabledSteps.map((step, index) => [step.id, index + 1]));

  const updateFlow = (steps: CampaignCallFlowStep[]) => {
    onChange({
      ...flow,
      source: "customized",
      campaignType: campaignType || flow.campaignType || null,
      steps,
    });
  };

  const updateStep = (index: number, updates: Partial) => {
    const nextSteps = flow.steps.map((step, stepIndex) =>
      stepIndex === index
        ? {
            ...step,
            ...updates,
          }
        : step,
    );
    updateFlow(nextSteps);
  };

  const updateIncluded = (index: number, enabled: boolean) => {
    const step = flow.steps[index];
    updateStep(index, {
      enabled,
      required: enabled ? step.required : false,
    });
  };

  const updateRequired = (index: number, required: boolean) => {
    updateStep(index, {
      enabled: required ? true : flow.steps[index].enabled,
      required,
    });
  };

  const addCustomStep = () => {
    updateFlow([
      ...flow.steps,
      {
        id: `custom-${Date.now()}`,
        key: "custom",
        label: "Custom Step",
        description: "Additional stage for this campaign.",
        instructions: "Describe exactly what the agent should achieve in this stage before moving forward.",
        enabled: true,
        required: false,
      },
    ]);
  };

  const resetToPreset = () => {
    onChange(createCampaignTypeCallFlowPreset(campaignType || null));
  };

  return (
    
      
        
          
            
              
              {title}
            
            {description}
          
          
            {campaignType ? (
              
                {campaignType.replace(/_/g, " ")}
              
            ) : null}
            
              
              Apply Recommended Preset
            
          
        

        
          
            Runtime Stages
            {enabledSteps.length}
            Stages currently injected into the live prompt.
          
          
            Required Stages
            {requiredSteps.length}
            Required stages cannot be skipped once enabled.
          
          
            Custom Stages
            {customStepCount}
            Extra steps added on top of the campaign preset.
          
        

        
          
            
              Active Runtime Sequence
              
                SIP and TeXML prompts follow this order. Required stages are forced into the flow automatically.
              
            
            
              Highest priority at runtime
            
          

          {enabledSteps.length > 0 ? (
            
              {enabledSteps.map((step, index) => (
                
                  
                    
                      {index + 1}
                    
                    {step.label}
                    {step.required ? Required : null}
                  
                  {index  : null}
                
              ))}
            
          ) : (
            
              No runtime stages are enabled yet. Turn on at least one stage to generate a live call sequence.
            
          )}
        
      

      
        {flow.steps.map((step, index) => {
          const runtimePosition = enabledOrder.get(step.id);

          return (
            
              
                
                  
                    
                  

                  
                    {runtimePosition || index + 1}
                  

                  
                    
                      
                        
                           updateStep(index, { label: event.target.value })}
                            className="h-10 max-w-lg text-sm font-medium"
                          />
                          
                            
                              {step.key === "custom" ? "custom" : step.key.replace(/_/g, " ")}
                            
                            {step.enabled ? (
                              
                                
                                {runtimePosition ? `Live Step ${runtimePosition}` : "Live"}
                              
                            ) : (
                              
                                
                                Disabled
                              
                            )}
                            {step.required ? Required : Optional}
                          
                        
                        {step.description}
                        
                          {step.enabled
                            ? "This stage is part of the live runtime sequence and will be injected into the system prompt in this order."
                            : "Disabled stages stay editable here but are omitted from the runtime prompt until re-enabled."}
                        
                      

                      
                         updateFlow(reorderSteps(flow.steps, index, index - 1))}
                          disabled={index === 0}
                          title="Move stage up"
                        >
                          
                        
                         updateFlow(reorderSteps(flow.steps, index, index + 1))}
                          disabled={index === flow.steps.length - 1}
                          title="Move stage down"
                        >
                          
                        
                        {step.key === "custom" ? (
                           updateFlow(flow.steps.filter((candidate) => candidate.id !== step.id))}
                            title="Delete custom stage"
                          >
                            
                          
                        ) : null}
                      
                    

                    
                      
                        
                           updateIncluded(index, checked)} />
                          
                            Include In Flow
                            
                              Controls whether this stage appears in the runtime call sequence.
                            
                          
                        
                      

                      
                        
                           updateRequired(index, checked)} />
                          
                            Mark As Required
                            
                              Required stages are auto-included and must be completed before moving on.
                            
                          
                        
                      
                    

                    
                      Stage Guidance
                       updateStep(index, { instructions: event.target.value })}
                        rows={4}
                        placeholder="Describe what the agent should accomplish during this stage."
                      />
                    
                  
                
              
            
          );
        })}

        
          
            
              
              Add a campaign-specific stage
            
            
              Use a custom stage for service-specific instructions that are not covered by the default preset.
            
          
          
            
            Add Custom Stage
          
        

        
          
            
              Prompt Preview
              
                This is the stage-order block that gets injected into the live agent prompt.
              
            
            Runtime output
          
          
            {buildCallFlowPromptSection(flow) || "Enable at least one stage to generate a runtime prompt preview."}
          
        
      
    
  );
}

export default CallFlowEditor;