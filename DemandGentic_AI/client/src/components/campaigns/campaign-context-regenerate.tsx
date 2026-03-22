/**
 * Campaign Context AI Regeneration Component
 * 
 * Allows users to regenerate campaign context fields using AI
 * in the campaign edit page.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Check,
  Wand2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CampaignContextRegenerateProps {
  currentContext: {
    campaignObjective?: string;
    productServiceInfo?: string;
    talkingPoints?: string[];
    targetAudienceDescription?: string;
    successCriteria?: string;
  };
  onApply: (generated: {
    campaignObjective: string;
    productServiceInfo: string;
    talkingPoints: string[];
    targetAudienceDescription: string;
    successCriteria: string;
  }) => void;
  campaignName?: string;
}

interface GeneratedContext {
  campaignObjective: string;
  productServiceInfo: string;
  talkingPoints: string[];
  targetAudienceDescription: string;
  successCriteria: string;
  confidenceScore?: number;
}

export function CampaignContextRegenerate({ 
  currentContext, 
  onApply,
  campaignName 
}: CampaignContextRegenerateProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [generatedContext, setGeneratedContext] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // Input fields
  const [instructions, setInstructions] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [refinementInput, setRefinementInput] = useState("");

  const handleGenerate = async () => {
    if (!instructions.trim() && !additionalContext.trim() && !hasExistingContext()) {
      toast({
        title: "Input required",
        description: "Please provide instructions or additional context for regeneration",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const token = localStorage.getItem('authToken');
      
      // Build the raw content from existing context + new instructions
      let rawContent = "";
      
      if (currentContext.campaignObjective) {
        rawContent += `Current Objective: ${currentContext.campaignObjective}\n\n`;
      }
      if (currentContext.productServiceInfo) {
        rawContent += `Product/Service Info: ${currentContext.productServiceInfo}\n\n`;
      }
      if (currentContext.talkingPoints?.length) {
        rawContent += `Current Talking Points:\n${currentContext.talkingPoints.map(p => `- ${p}`).join('\n')}\n\n`;
      }
      if (currentContext.targetAudienceDescription) {
        rawContent += `Target Audience: ${currentContext.targetAudienceDescription}\n\n`;
      }
      if (currentContext.successCriteria) {
        rawContent += `Success Criteria: ${currentContext.successCriteria}\n\n`;
      }
      
      if (additionalContext.trim()) {
        rawContent += `\n\nAdditional Context:\n${additionalContext}\n`;
      }
      
      if (instructions.trim()) {
        rawContent += `\n\nRegeneration Instructions:\n${instructions}\n`;
      }

      const response = await fetch("/api/campaigns/ingest", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rawContent,
          contentType: "text",
          hints: {
            campaignName: campaignName,
            isRegeneration: true,
          },
        }),
      });

      const result = await response.json();

      if (result.success && result.campaign) {
        setGeneratedContext({
          campaignObjective: result.campaign.campaignObjective,
          productServiceInfo: result.campaign.productServiceInfo,
          talkingPoints: result.campaign.talkingPoints || [],
          targetAudienceDescription: result.campaign.targetAudienceDescription,
          successCriteria: result.campaign.successCriteria,
          confidenceScore: result.campaign.confidenceScore,
        });
        setShowPreview(true);
        toast({
          title: "Context generated!",
          description: `Generated with ${result.campaign.confidenceScore || 85}% confidence`,
        });
      } else {
        toast({
          title: "Generation failed",
          description: result.error || "Unable to generate context",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate context",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!generatedContext || !refinementInput.trim()) return;

    setIsRefining(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch("/api/campaigns/ingest/refine", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          campaign: {
            ...generatedContext,
            campaignName: campaignName || "Campaign",
          },
          refinementInstructions: refinementInput,
        }),
      });

      const result = await response.json();

      if (result.success && result.campaign) {
        setGeneratedContext({
          campaignObjective: result.campaign.campaignObjective,
          productServiceInfo: result.campaign.productServiceInfo,
          talkingPoints: result.campaign.talkingPoints || [],
          targetAudienceDescription: result.campaign.targetAudienceDescription,
          successCriteria: result.campaign.successCriteria,
          confidenceScore: result.campaign.confidenceScore,
        });
        setRefinementInput("");
        toast({
          title: "Context refined",
          description: "Applied your changes successfully",
        });
      } else {
        toast({
          title: "Refinement failed",
          description: result.error || "Unable to apply refinements",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to refine context",
        variant: "destructive",
      });
    } finally {
      setIsRefining(false);
    }
  };

  const handleApply = () => {
    if (!generatedContext) return;
    
    onApply({
      campaignObjective: generatedContext.campaignObjective,
      productServiceInfo: generatedContext.productServiceInfo,
      talkingPoints: generatedContext.talkingPoints,
      targetAudienceDescription: generatedContext.targetAudienceDescription,
      successCriteria: generatedContext.successCriteria,
    });
    
    setIsOpen(false);
    setShowPreview(false);
    setGeneratedContext(null);
    setInstructions("");
    setAdditionalContext("");
    
    toast({
      title: "Context applied",
      description: "Campaign context has been updated",
    });
  };

  const hasExistingContext = () => {
    return !!(
      currentContext.campaignObjective ||
      currentContext.productServiceInfo ||
      currentContext.talkingPoints?.length ||
      currentContext.targetAudienceDescription ||
      currentContext.successCriteria
    );
  };

  const resetDialog = () => {
    setShowPreview(false);
    setGeneratedContext(null);
    setInstructions("");
    setAdditionalContext("");
    setRefinementInput("");
  };

  return (
     {
      setIsOpen(open);
      if (!open) resetDialog();
    }}>
      
        
          
          AI Regenerate Context
        
      
      
        
          
            
            AI Context Regeneration
          
          
            Use AI to regenerate or improve your campaign context based on your instructions.
          
        

        {!showPreview ? (
          
            {/* Current Context Summary */}
            {hasExistingContext() && (
              
                
                  
                    
                      Current Context
                      {currentContext.campaignObjective?.slice(0, 50)}...
                    
                    
                  
                
                
                  {currentContext.campaignObjective && (
                    Objective: {currentContext.campaignObjective}
                  )}
                  {currentContext.productServiceInfo && (
                    Product/Service: {currentContext.productServiceInfo.slice(0, 100)}...
                  )}
                  {currentContext.talkingPoints?.length ? (
                    Talking Points: {currentContext.talkingPoints.length} points
                  ) : null}
                
              
            )}

            {/* Instructions */}
            
              Regeneration Instructions
               setInstructions(e.target.value)}
                rows={4}
              />
            

            {/* Additional Context */}
            
              Additional Context (Optional)
               setAdditionalContext(e.target.value)}
                rows={3}
              />
            

            
              {isGenerating ? (
                <>
                  
                  Generating...
                
              ) : (
                <>
                  
                  Generate Context
                
              )}
            
          
        ) : (
          
            {/* Generated Preview */}
            
              
                Generated {generatedContext?.confidenceScore ? `(${generatedContext.confidenceScore}% confidence)` : ''}
              
               setShowPreview(false)}>
                
                Regenerate
              
            

            
              {generatedContext?.campaignObjective && (
                
                  Campaign Objective
                  {generatedContext.campaignObjective}
                
              )}
              {generatedContext?.productServiceInfo && (
                
                  Product/Service Info
                  {generatedContext.productServiceInfo}
                
              )}
              {generatedContext?.talkingPoints?.length ? (
                
                  Talking Points
                  
                    {generatedContext.talkingPoints.map((point, i) => (
                      
                        •
                        {point}
                      
                    ))}
                  
                
              ) : null}
              {generatedContext?.targetAudienceDescription && (
                
                  Target Audience
                  {generatedContext.targetAudienceDescription}
                
              )}
              {generatedContext?.successCriteria && (
                
                  Success Criteria
                  {generatedContext.successCriteria}
                
              )}
            

            {/* Refinement */}
            
              Refine Results (Optional)
              
                 setRefinementInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                />
                
                  {isRefining ?  : "Refine"}
                
              
            
          
        )}

        
           setIsOpen(false)}>
            Cancel
          
          {showPreview && generatedContext && (
            
              
              Apply to Campaign
            
          )}
        
      
    
  );
}