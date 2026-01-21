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
  const [generatedContext, setGeneratedContext] = useState<GeneratedContext | null>(null);
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
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetDialog();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4" />
          AI Regenerate Context
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            AI Context Regeneration
          </DialogTitle>
          <DialogDescription>
            Use AI to regenerate or improve your campaign context based on your instructions.
          </DialogDescription>
        </DialogHeader>

        {!showPreview ? (
          <div className="space-y-4 py-4">
            {/* Current Context Summary */}
            {hasExistingContext() && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">Current Context</Badge>
                      {currentContext.campaignObjective?.slice(0, 50)}...
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 p-3 bg-muted rounded-lg text-sm space-y-2">
                  {currentContext.campaignObjective && (
                    <div><strong>Objective:</strong> {currentContext.campaignObjective}</div>
                  )}
                  {currentContext.productServiceInfo && (
                    <div><strong>Product/Service:</strong> {currentContext.productServiceInfo.slice(0, 100)}...</div>
                  )}
                  {currentContext.talkingPoints?.length ? (
                    <div><strong>Talking Points:</strong> {currentContext.talkingPoints.length} points</div>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Instructions */}
            <div className="space-y-2">
              <Label htmlFor="instructions">Regeneration Instructions</Label>
              <Textarea
                id="instructions"
                placeholder="Describe how you want the context to be changed...

Examples:
- Make it more focused on enterprise customers
- Add emphasis on cost savings and ROI
- Simplify the language for non-technical audiences
- Focus on the security compliance aspects"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
              />
            </div>

            {/* Additional Context */}
            <div className="space-y-2">
              <Label htmlFor="additionalContext">Additional Context (Optional)</Label>
              <Textarea
                id="additionalContext"
                placeholder="Paste any additional information about your product, campaign goals, or target audience..."
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                rows={3}
              />
            </div>

            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Context
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Generated Preview */}
            <div className="flex items-center justify-between">
              <Badge variant="default" className="bg-green-600">
                Generated {generatedContext?.confidenceScore ? `(${generatedContext.confidenceScore}% confidence)` : ''}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate
              </Button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {generatedContext?.campaignObjective && (
                <div className="p-3 bg-muted rounded-lg">
                  <Label className="text-xs text-muted-foreground">Campaign Objective</Label>
                  <p className="text-sm mt-1">{generatedContext.campaignObjective}</p>
                </div>
              )}
              {generatedContext?.productServiceInfo && (
                <div className="p-3 bg-muted rounded-lg">
                  <Label className="text-xs text-muted-foreground">Product/Service Info</Label>
                  <p className="text-sm mt-1">{generatedContext.productServiceInfo}</p>
                </div>
              )}
              {generatedContext?.talkingPoints?.length ? (
                <div className="p-3 bg-muted rounded-lg">
                  <Label className="text-xs text-muted-foreground">Talking Points</Label>
                  <ul className="text-sm mt-1 space-y-1">
                    {generatedContext.talkingPoints.map((point, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {generatedContext?.targetAudienceDescription && (
                <div className="p-3 bg-muted rounded-lg">
                  <Label className="text-xs text-muted-foreground">Target Audience</Label>
                  <p className="text-sm mt-1">{generatedContext.targetAudienceDescription}</p>
                </div>
              )}
              {generatedContext?.successCriteria && (
                <div className="p-3 bg-muted rounded-lg">
                  <Label className="text-xs text-muted-foreground">Success Criteria</Label>
                  <p className="text-sm mt-1">{generatedContext.successCriteria}</p>
                </div>
              )}
            </div>

            {/* Refinement */}
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="refinement">Refine Results (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="refinement"
                  placeholder="e.g., Make it shorter, add more urgency..."
                  value={refinementInput}
                  onChange={(e) => setRefinementInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                />
                <Button 
                  variant="outline" 
                  onClick={handleRefine}
                  disabled={!refinementInput.trim() || isRefining}
                >
                  {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refine"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          {showPreview && generatedContext && (
            <Button onClick={handleApply} className="gap-2">
              <Check className="h-4 w-4" />
              Apply to Campaign
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
