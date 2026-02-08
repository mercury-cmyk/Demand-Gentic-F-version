/**
 * Campaign Auto-Generate Component
 * 
 * Allows users to paste or upload raw campaign details and have AI
 * automatically generate a structured campaign configuration.
 */

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Upload,
  FileText,
  Wand2,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  Lightbulb,
  Target,
  MessageSquare,
  Users,
  ShieldCheck,
  ClipboardList,
  RefreshCw,
  Loader2
} from "lucide-react";

// Campaign types matching the backend
type CampaignType =
  | 'appointment_setting'
  | 'content_syndication'
  | 'lead_qualification'
  | 'sql'
  | 'bant_leads'
  | 'data_validation'
  | 'high_quality_leads'
  | 'webinar_invite'
  | 'live_webinar'
  | 'on_demand_webinar'
  | 'executive_dinner';

// Human-readable labels for campaign types
const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  appointment_setting: 'Appointment Setting',
  content_syndication: 'Content Syndication',
  lead_qualification: 'Lead Qualification',
  sql: 'Sales Qualified Lead (SQL)',
  bant_leads: 'BANT Qualification',
  data_validation: 'Data Validation',
  high_quality_leads: 'High-Quality Leads',
  webinar_invite: 'Webinar Invitation',
  live_webinar: 'Live Webinar',
  on_demand_webinar: 'On-Demand Webinar',
  executive_dinner: 'Executive Dinner',
};

// Types matching the backend service
interface IngestedCampaign {
  campaignName: string;
  campaignType: CampaignType;
  campaignObjective: string;
  campaignContextBrief: string;
  productServiceInfo: string;
  talkingPoints: string[];
  targetAudienceDescription: string;
  successCriteria: string;
  campaignObjections: Array<{
    objection: string;
    response: string;
  }>;
  qualificationQuestions: Array<{
    question: string;
    type: 'text' | 'number' | 'boolean' | 'select';
    required: boolean;
    options?: string[];
  }>;
  callFlow: {
    openingApproach: string;
    valueProposition: string;
    closingStrategy: string;
    voicemailScript?: string;
  };
  complianceNotes: string[];
  estimatedCallDuration: number;
  confidenceScore: number;
  suggestedImprovements: string[];
}

interface CampaignAutoGenerateProps {
  onCampaignGenerated: (campaign: IngestedCampaign) => void;
  onApply: (data: {
    campaignType: CampaignType;
    campaignObjective: string;
    campaignContextBrief: string;
    productServiceInfo: string;
    talkingPoints: string[];
    targetAudienceDescription: string;
    successCriteria: string;
    campaignObjections: any[];
    qualificationQuestions: any[];
  }) => void;
  /** If campaign type was already selected in a previous step, hide it from preview */
  hideTypeFromPreview?: boolean;
}

export function CampaignAutoGenerate({ onCampaignGenerated, onApply, hideTypeFromPreview = false }: CampaignAutoGenerateProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [rawContent, setRawContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCampaign, setGeneratedCampaign] = useState<IngestedCampaign | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  
  // Optional hints
  const [companyName, setCompanyName] = useState("");
  const [productName, setProductName] = useState("");
  const [industry, setIndustry] = useState("");

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Support text files, markdown, PDFs (text extraction)
    if (file.type === "text/plain" || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
      const text = await file.text();
      setRawContent(text);
      toast({
        title: "File loaded",
        description: `Loaded ${file.name} (${text.length} characters)`,
      });
    } else {
      toast({
        title: "Unsupported file type",
        description: "Please upload a .txt or .md file",
        variant: "destructive",
      });
    }
  };

  const handleGenerate = async () => {
    if (rawContent.trim().length < 50) {
      toast({
        title: "More content needed",
        description: "Please provide at least 50 characters describing the campaign",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch("/api/campaigns/ingest", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rawContent,
          contentType: "text",
          industry: industry || undefined,
          hints: {
            companyName: companyName || undefined,
            productName: productName || undefined,
          },
        }),
      });

      const result = await response.json();

      if (result.success && result.campaign) {
        setGeneratedCampaign(result.campaign);
        setShowPreview(true);
        onCampaignGenerated(result.campaign);
        toast({
          title: "Campaign generated!",
          description: `Created "${result.campaign.campaignName}" with ${result.campaign.confidenceScore}% confidence`,
        });
      } else {
        toast({
          title: "Generation failed",
          description: result.error || "Unable to process campaign content",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate campaign",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!generatedCampaign || !refinementInput.trim()) return;

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
          campaign: generatedCampaign,
          refinementInstructions: refinementInput,
        }),
      });

      const result = await response.json();

      if (result.success && result.campaign) {
        setGeneratedCampaign(result.campaign);
        setRefinementInput("");
        toast({
          title: "Campaign refined",
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
        description: error.message || "Failed to refine campaign",
        variant: "destructive",
      });
    } finally {
      setIsRefining(false);
    }
  };

  const handleApply = () => {
    if (!generatedCampaign) return;

    onApply({
      campaignType: generatedCampaign.campaignType,
      campaignObjective: generatedCampaign.campaignObjective,
      campaignContextBrief: generatedCampaign.campaignContextBrief,
      productServiceInfo: generatedCampaign.productServiceInfo,
      talkingPoints: generatedCampaign.talkingPoints,
      targetAudienceDescription: generatedCampaign.targetAudienceDescription,
      successCriteria: generatedCampaign.successCriteria,
      campaignObjections: generatedCampaign.campaignObjections,
      qualificationQuestions: generatedCampaign.qualificationQuestions,
    });

    toast({
      title: "Campaign applied",
      description: "Generated content has been added to your campaign",
    });
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <CardTitle>AI Campaign Generator</CardTitle>
          <Badge variant="secondary" className="ml-2">Beta</Badge>
        </div>
        <CardDescription>
          Paste or upload your campaign brief and let AI automatically structure it for optimal call performance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!showPreview ? (
          <>
            {/* Input Section */}
            <Tabs defaultValue="paste" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="paste" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Paste Content
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload File
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="paste" className="mt-4">
                <Textarea
                  placeholder="Paste your campaign brief, product description, sales script, or any content describing what you want to accomplish...

Example:
We're launching a campaign to promote our new cloud security platform, SecureShield Pro. The target audience is IT Directors and CISOs at mid-market companies (500-2000 employees) in healthcare and finance. 

Key benefits:
- Reduces security incidents by 40%
- SOC2 and HIPAA compliant
- 24/7 automated threat monitoring

Goal: Book demo meetings with qualified decision makers who have budget authority and an active security initiative."
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
                <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                  <span>{rawContent.length} characters</span>
                  <span>Minimum 50 characters required</span>
                </div>
              </TabsContent>
              
              <TabsContent value="upload" className="mt-4">
                <div 
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to upload or drag and drop</p>
                  <p className="text-xs text-muted-foreground mt-1">TXT, MD files supported</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                {rawContent && (
                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Content loaded: {rawContent.length} characters</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Optional Hints */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Add context hints (optional)
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input
                      placeholder="e.g., Acme Corp"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Product/Service</Label>
                    <Input
                      placeholder="e.g., SecureShield Pro"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input
                      placeholder="e.g., Cybersecurity"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Generate Button */}
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating || rawContent.length < 50}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing content...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 mr-2" />
                  Generate Campaign Structure
                </>
              )}
            </Button>
          </>
        ) : generatedCampaign && (
          <>
            {/* Preview Section */}
            <div className="space-y-4">
              {/* Header with confidence */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{generatedCampaign.campaignName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Hide campaign type if already selected in previous step */}
                    {!hideTypeFromPreview && (
                      <Badge variant="outline" className="text-xs">
                        {CAMPAIGN_TYPE_LABELS[generatedCampaign.campaignType] || generatedCampaign.campaignType}
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      ~{generatedCampaign.estimatedCallDuration}s call duration
                    </span>
                  </div>
                </div>
                <Badge variant={generatedCampaign.confidenceScore >= 80 ? "default" : "secondary"}>
                  {generatedCampaign.confidenceScore}% confidence
                </Badge>
              </div>

              <Separator />

              {/* Campaign Sections */}
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {/* Objective */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Target className="w-4 h-4 text-primary" />
                      Campaign Objective
                    </div>
                    <p className="text-sm bg-muted p-3 rounded-lg">{generatedCampaign.campaignObjective}</p>
                  </div>

                  {/* Campaign Brief (AI Context) */}
                  {generatedCampaign.campaignContextBrief && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        AI Agent Context Brief
                      </div>
                      <p className="text-sm bg-purple-50 dark:bg-purple-950/20 p-3 rounded-lg border border-purple-200 dark:border-purple-800">
                        {generatedCampaign.campaignContextBrief}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        This brief gives the AI voice agent context for intelligent conversations.
                      </p>
                    </div>
                  )}

                  {/* Product Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="w-4 h-4 text-primary" />
                      Product/Service Info
                    </div>
                    <p className="text-sm bg-muted p-3 rounded-lg">{generatedCampaign.productServiceInfo}</p>
                  </div>

                  {/* Talking Points */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      Key Talking Points ({generatedCampaign.talkingPoints.length})
                    </div>
                    <div className="space-y-1">
                      {generatedCampaign.talkingPoints.map((point, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm bg-muted p-2 rounded">
                          <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Target Audience */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="w-4 h-4 text-primary" />
                      Target Audience
                    </div>
                    <p className="text-sm bg-muted p-3 rounded-lg">{generatedCampaign.targetAudienceDescription}</p>
                  </div>

                  {/* Success Criteria */}
                  {generatedCampaign.successCriteria && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Check className="w-4 h-4 text-green-500" />
                        Success Criteria (Qualification Signals)
                      </div>
                      <p className="text-sm bg-green-50 dark:bg-green-950/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                        {generatedCampaign.successCriteria}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        When these criteria are met, the AI will mark the lead as qualified.
                      </p>
                    </div>
                  )}

                  {/* Objections */}
                  {generatedCampaign.campaignObjections.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        Common Objections ({generatedCampaign.campaignObjections.length})
                      </div>
                      <div className="space-y-2">
                        {generatedCampaign.campaignObjections.map((obj, idx) => (
                          <div key={idx} className="bg-muted p-3 rounded-lg space-y-1">
                            <p className="text-sm font-medium text-orange-600">"{obj.objection}"</p>
                            <p className="text-sm text-muted-foreground">→ {obj.response}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Qualification Questions */}
                  {generatedCampaign.qualificationQuestions.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ClipboardList className="w-4 h-4 text-primary" />
                        Qualification Questions ({generatedCampaign.qualificationQuestions.length})
                      </div>
                      <div className="space-y-1">
                        {generatedCampaign.qualificationQuestions.map((q, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm bg-muted p-2 rounded">
                            <Badge variant="outline" className="text-xs">{q.type}</Badge>
                            <span>{q.question}</span>
                            {q.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Compliance Notes */}
                  {generatedCampaign.complianceNotes.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        Compliance Notes
                      </div>
                      <div className="space-y-1">
                        {generatedCampaign.complianceNotes.map((note, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm bg-green-50 dark:bg-green-950/20 p-2 rounded">
                            <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                            <span>{note}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Improvements */}
                  {generatedCampaign.suggestedImprovements.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Lightbulb className="w-4 h-4 text-yellow-500" />
                        Suggested Improvements
                      </div>
                      <div className="space-y-1">
                        {generatedCampaign.suggestedImprovements.map((imp, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded">
                            <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                            <span>{imp}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <Separator />

              {/* Refinement Input */}
              <div className="space-y-2">
                <Label className="text-sm">Refine this campaign</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Make the talking points shorter, add more objection handling..."
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    disabled={isRefining}
                  />
                  <Button 
                    variant="outline" 
                    onClick={handleRefine}
                    disabled={isRefining || !refinementInput.trim()}
                  >
                    {isRefining ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowPreview(false)}
                  className="flex-1"
                >
                  Start Over
                </Button>
                <Button 
                  onClick={handleApply}
                  className="flex-1"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Apply to Campaign
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
