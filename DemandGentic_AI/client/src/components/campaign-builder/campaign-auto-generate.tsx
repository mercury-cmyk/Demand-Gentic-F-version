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
const CAMPAIGN_TYPE_LABELS: Record = {
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
  campaignObjections: Array;
  qualificationQuestions: Array;
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
  const fileInputRef = useRef(null);
  
  const [rawContent, setRawContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCampaign, setGeneratedCampaign] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  
  // Optional hints
  const [companyName, setCompanyName] = useState("");
  const [productName, setProductName] = useState("");
  const [industry, setIndustry] = useState("");

  const handleFileUpload = async (event: React.ChangeEvent) => {
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
    if (rawContent.trim().length  {
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
    
      
        
          
          AI Campaign Generator
          Beta
        
        
          Paste or upload your campaign brief and let AI automatically structure it for optimal call performance.
        
      
      
        {!showPreview ? (
          <>
            {/* Input Section */}
            
              
                
                  
                  Paste Content
                
                
                  
                  Upload File
                
              
              
              
                 setRawContent(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
                
                  {rawContent.length} characters
                  Minimum 50 characters required
                
              
              
              
                 fileInputRef.current?.click()}
                >
                  
                  Click to upload or drag and drop
                  TXT, MD files supported
                  
                
                {rawContent && (
                  
                    Content loaded: {rawContent.length} characters
                  
                )}
              
            

            {/* Optional Hints */}
            
              
                
                  
                    
                    Add context hints (optional)
                  
                  
                
              
              
                
                  
                    Company Name
                     setCompanyName(e.target.value)}
                    />
                  
                  
                    Product/Service
                     setProductName(e.target.value)}
                    />
                  
                  
                    Industry
                     setIndustry(e.target.value)}
                    />
                  
                
              
            

            {/* Generate Button */}
            
              {isGenerating ? (
                <>
                  
                  Analyzing content...
                
              ) : (
                <>
                  
                  Generate Campaign Structure
                
              )}
            
          
        ) : generatedCampaign && (
          <>
            {/* Preview Section */}
            
              {/* Header with confidence */}
              
                
                  {generatedCampaign.campaignName}
                  
                    {/* Hide campaign type if already selected in previous step */}
                    {!hideTypeFromPreview && (
                      
                        {CAMPAIGN_TYPE_LABELS[generatedCampaign.campaignType] || generatedCampaign.campaignType}
                      
                    )}
                    
                      ~{generatedCampaign.estimatedCallDuration}s call duration
                    
                  
                
                = 80 ? "default" : "secondary"}>
                  {generatedCampaign.confidenceScore}% confidence
                
              

              

              {/* Campaign Sections */}
              
                
                  {/* Objective */}
                  
                    
                      
                      Campaign Objective
                    
                    {generatedCampaign.campaignObjective}
                  

                  {/* Campaign Brief (AI Context) */}
                  {generatedCampaign.campaignContextBrief && (
                    
                      
                        
                        AI Agent Context Brief
                      
                      
                        {generatedCampaign.campaignContextBrief}
                      
                      
                        This brief gives the AI voice agent context for intelligent conversations.
                      
                    
                  )}

                  {/* Product Info */}
                  
                    
                      
                      Product/Service Info
                    
                    {generatedCampaign.productServiceInfo}
                  

                  {/* Talking Points */}
                  
                    
                      
                      Key Talking Points ({generatedCampaign.talkingPoints.length})
                    
                    
                      {generatedCampaign.talkingPoints.map((point, idx) => (
                        
                          
                          {point}
                        
                      ))}
                    
                  

                  {/* Target Audience */}
                  
                    
                      
                      Target Audience
                    
                    {generatedCampaign.targetAudienceDescription}
                  

                  {/* Success Criteria */}
                  {generatedCampaign.successCriteria && (
                    
                      
                        
                        Success Criteria (Qualification Signals)
                      
                      
                        {generatedCampaign.successCriteria}
                      
                      
                        When these criteria are met, the AI will mark the lead as qualified.
                      
                    
                  )}

                  {/* Objections */}
                  {generatedCampaign.campaignObjections.length > 0 && (
                    
                      
                        
                        Common Objections ({generatedCampaign.campaignObjections.length})
                      
                      
                        {generatedCampaign.campaignObjections.map((obj, idx) => (
                          
                            "{obj.objection}"
                            → {obj.response}
                          
                        ))}
                      
                    
                  )}

                  {/* Qualification Questions */}
                  {generatedCampaign.qualificationQuestions.length > 0 && (
                    
                      
                        
                        Qualification Questions ({generatedCampaign.qualificationQuestions.length})
                      
                      
                        {generatedCampaign.qualificationQuestions.map((q, idx) => (
                          
                            {q.type}
                            {q.question}
                            {q.required && Required}
                          
                        ))}
                      
                    
                  )}

                  {/* Compliance Notes */}
                  {generatedCampaign.complianceNotes.length > 0 && (
                    
                      
                        
                        Compliance Notes
                      
                      
                        {generatedCampaign.complianceNotes.map((note, idx) => (
                          
                            
                            {note}
                          
                        ))}
                      
                    
                  )}

                  {/* Suggested Improvements */}
                  {generatedCampaign.suggestedImprovements.length > 0 && (
                    
                      
                        
                        Suggested Improvements
                      
                      
                        {generatedCampaign.suggestedImprovements.map((imp, idx) => (
                          
                            
                            {imp}
                          
                        ))}
                      
                    
                  )}
                
              

              

              {/* Refinement Input */}
              
                Refine this campaign
                
                   setRefinementInput(e.target.value)}
                    disabled={isRefining}
                  />
                  
                    {isRefining ? (
                      
                    ) : (
                      
                    )}
                  
                
              

              {/* Action Buttons */}
              
                 setShowPreview(false)}
                  className="flex-1"
                >
                  Start Over
                
                
                  
                  Apply to Campaign
                
              
            
          
        )}
      
    
  );
}