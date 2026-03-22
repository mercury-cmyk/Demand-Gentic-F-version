/**
 * Step - Content & Context (Unified)
 *
 * Combined step that captures:
 * - Organization association
 * - Campaign objective
 * - Talking points / key messages
 * - AI-generated or manual call script
 * - Success criteria
 * - Document upload for AI extraction
 *
 * This simplifies the wizard by combining Campaign Context and Call Script into one step.
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Target,
  Building,
  MessageSquare,
  Plus,
  X,
  Lightbulb,
  Sparkles,
  Wand2,
  FileText,
  CheckCircle2,
  Upload,
  FileUp,
  AlertCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CallFlowEditor } from "@/components/campaigns/CallFlowEditor";
import { normalizeCampaignCallFlow, type CampaignCallFlow } from "@shared/call-flow";

interface CampaignOrganization {
  id: string;
  name: string;
  industry?: string;
}

interface StepContentContextProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function StepContentContext({ data, onNext, onBack }: StepContentContextProps) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  // Input mode: 'manual' or 'document'
  const [inputMode, setInputMode] = useState('manual');

  // Document upload state
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [documentExtractionError, setDocumentExtractionError] = useState(null);

  // Organization selection
  const [selectedOrgId, setSelectedOrgId] = useState(data?.organizationId || "");

  // Campaign objective
  const [campaignObjective, setCampaignObjective] = useState(data?.campaignObjective || "");

  // Talking points
  const [talkingPoints, setTalkingPoints] = useState(
    data?.talkingPoints?.length > 0 ? data.talkingPoints : [""]
  );

  // Success criteria
  const [successCriteria, setSuccessCriteria] = useState(data?.successCriteria || "");

  // Product/Service Info
  const [productServiceInfo, setProductServiceInfo] = useState(data?.productServiceInfo || "");

  // Target Audience Description
  const [targetAudienceDescription, setTargetAudienceDescription] = useState(data?.targetAudienceDescription || "");

  // Common objections
  const [commonObjections, setCommonObjections] = useState(
    data?.campaignObjections?.length > 0 ? data.campaignObjections : []
  );

  // Content mode: 'ai' or 'manual'
  const [contentMode, setContentMode] = useState(data?.content?.script ? 'manual' : 'ai');

  // Call script (for manual mode or AI-generated)
  const [callScript, setCallScript] = useState(data?.content?.script || "");
  const [callFlow, setCallFlow] = useState(
    () => normalizeCampaignCallFlow(data?.callFlow, data?.type)
  );

  // AI Generation state
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setCallFlow(normalizeCampaignCallFlow(data?.callFlow, data?.type));
  }, [data?.callFlow, data?.type]);

  // Handle document upload and AI extraction
  const handleDocumentUpload = async (event: React.ChangeEvent) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF, Word document, or text file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Maximum file size is 10MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingDocument(true);
    setDocumentExtractionError(null);
    setUploadedFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('document', file);

      // Get auth token for the request
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      // Note: Do NOT set Content-Type for FormData - browser sets it automatically with boundary

      const response = await fetch('/api/documents/extract-campaign-context', {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to extract document content');
      }

      const result = await response.json();
      const ctx = result.extractedContext;

      // Populate fields from extracted context
      if (ctx.campaignObjective) {
        setCampaignObjective(ctx.campaignObjective);
      }
      if (ctx.productServiceInfo) {
        setProductServiceInfo(ctx.productServiceInfo);
      }
      if (ctx.talkingPoints?.length > 0) {
        setTalkingPoints(ctx.talkingPoints);
      }
      if (ctx.targetAudienceDescription) {
        setTargetAudienceDescription(ctx.targetAudienceDescription);
      }
      if (ctx.successCriteria) {
        setSuccessCriteria(ctx.successCriteria);
      }
      if (ctx.commonObjections?.length > 0) {
        setCommonObjections(ctx.commonObjections.map((o: any) =>
          typeof o === 'string' ? o : `${o.objection}: ${o.response}`
        ));
      }
      if (ctx.suggestedOpeningStatement) {
        setCallScript(ctx.suggestedOpeningStatement);
      }

      toast({
        title: "Document Processed",
        description: "AI has extracted campaign context from your document. Review and adjust as needed.",
      });

      // Switch to manual mode to show extracted content
      setInputMode('manual');

    } catch (error) {
      console.error('[Document Upload] Error:', error);
      setDocumentExtractionError(error instanceof Error ? error.message : 'Failed to process document');
      toast({
        title: "Extraction Failed",
        description: error instanceof Error ? error.message : "Could not extract content from document.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingDocument(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Fetch available organizations
  const { data: organizations = [], isLoading: orgsLoading } = useQuery({
    queryKey: ["campaign-organizations"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/campaign-organizations");
        if (!res.ok) return [];
        const result = await res.json();
        return result.organizations || result || [];
      } catch {
        return [];
      }
    },
  });

  // Objective templates based on campaign type
  const getObjectiveTemplates = () => {
    const type = data?.type || "call";
    const templates: Record = {
      appointment_generation: [
        "Book qualified meetings with decision makers at target accounts",
        "Schedule product demonstrations with IT leadership",
        "Secure discovery calls with procurement teams",
      ],
      high_quality_leads: [
        "Qualify inbound leads and determine sales-readiness",
        "Identify decision-making authority and budget timeline",
        "Capture buying signals and project requirements",
      ],
      live_webinar: [
        "Register qualified prospects for the upcoming webinar",
        "Confirm attendance and capture relevant attendee details",
        "Generate interest in the webinar topic and speakers",
      ],
      content_syndication: [
        "Follow up on content downloads and qualify interest level",
        "Understand how the content relates to their current challenges",
        "Advance engaged leads to next stage in funnel",
      ],
      executive_dinner: [
        "Secure RSVP for exclusive executive networking event",
        "Confirm attendance and capture dietary preferences",
        "Build anticipation for the event experience",
      ],
      call: [
        "Engage prospects and advance to next stage",
        "Qualify interest and capture contact preferences",
        "Identify pain points and potential solutions",
      ],
    };
    return templates[type] || templates.call;
  };

  // Add a new talking point
  const addTalkingPoint = () => {
    setTalkingPoints([...talkingPoints, ""]);
  };

  // Remove a talking point
  const removeTalkingPoint = (index: number) => {
    if (talkingPoints.length > 1) {
      setTalkingPoints(talkingPoints.filter((_, i) => i !== index));
    }
  };

  // Update a talking point
  const updateTalkingPoint = (index: number, value: string) => {
    const updated = [...talkingPoints];
    updated[index] = value;
    setTalkingPoints(updated);
  };

  // Generate AI content
  const handleGenerateContent = async () => {
    if (!campaignObjective.trim()) {
      toast({
        title: "Objective Required",
        description: "Please enter a campaign objective before generating content.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const res = await apiRequest('POST', '/api/ai/generate-call-script', {
        campaignType: data?.type || 'call',
        objective: campaignObjective,
        talkingPoints: talkingPoints.filter(tp => typeof tp === 'string' && tp.trim()),
        productServiceInfo,
        targetAudience: targetAudienceDescription,
      });

      if (!res.ok) throw new Error('Failed to generate content');

      const result = await res.json();

      if (result.script) {
        setCallScript(result.script);
        setContentMode('manual'); // Switch to manual to show generated script
        toast({
          title: "Content Generated",
          description: "AI has generated a call script based on your inputs.",
        });
      }

      // Also populate suggested talking points if returned
      if (result.suggestedTalkingPoints?.length > 0 && talkingPoints.filter(tp => typeof tp === 'string' && tp.trim()).length === 0) {
        setTalkingPoints(result.suggestedTalkingPoints);
      }
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Could not generate content. Please try again or write manually.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Validation
  const isValid = campaignObjective.trim().length > 0;

  const handleNext = () => {
    // Filter out empty talking points
    const validTalkingPoints = talkingPoints.filter((tp) => typeof tp === 'string' && tp.trim().length > 0);
    const validObjections = commonObjections.filter((o) => typeof o === 'string' && o.trim().length > 0);

    onNext({
      organizationId: selectedOrgId || null,
      campaignObjective: campaignObjective.trim(),
      talkingPoints: validTalkingPoints.length > 0 ? validTalkingPoints : null,
      successCriteria: successCriteria.trim() || null,
      productServiceInfo: productServiceInfo.trim() || null,
      targetAudienceDescription: targetAudienceDescription.trim() || null,
      campaignObjections: validObjections.length > 0 ? validObjections : null,
      callFlow,
      content: {
        script: callScript.trim() || null,
      },
    });
  };

  return (
    
      {/* Header */}
      
        
          
          Content & Context
        
        
          Define your campaign objective and provide context for AI-powered conversations.
        
      

      {/* Organization Selection - Required/Prominent */}
      
        
          
            
            Campaign Organization
            Recommended
          
          
            Select the organization this campaign is for. This provides context-aware intelligence during calls.
          
        
        
          {orgsLoading ? (
            
              
              Loading organizations...
            
          ) : organizations.length === 0 ? (
            
              No organizations available. You can proceed without one.
            
          ) : (
             setSelectedOrgId(val === "none" ? "" : val)}>
              
                
              
              
                None - Generic Context
                {organizations.map((org) => (
                  
                    {org.name}
                    {org.industry && ` (${org.industry})`}
                  
                ))}
              
            
          )}
        
      

      {/* Document Upload - AI Extraction */}
      
        
          
            
            Import from Document
            AI-Powered
          
          
            Upload a campaign brief, product document, or script. AI will extract all relevant campaign context automatically.
          
        
        
          

          
             fileInputRef.current?.click()}
              disabled={isUploadingDocument}
              className="flex-1"
            >
              {isUploadingDocument ? (
                <>
                  
                  Processing Document...
                
              ) : (
                <>
                  
                  Upload Document (PDF, DOCX, TXT)
                
              )}
            

            {uploadedFileName && !isUploadingDocument && (
              
                
                {uploadedFileName}
              
            )}
          

          {documentExtractionError && (
            
              
              {documentExtractionError}
            
          )}

          
            Supported formats: PDF, Word (.docx, .doc), Text (.txt), Markdown (.md). Max size: 10MB.
          
        
      

      {/* Campaign Objective - Prominent */}
      
        
          
            
            Campaign Objective
            Required
          
          
            What is the primary goal of this campaign?
          
        
        
           setCampaignObjective(e.target.value)}
            className="min-h-[80px]"
          />

          {/* Quick templates */}
          
            {getObjectiveTemplates().map((template, i) => (
               setCampaignObjective(template)}
              >
                
                {template.substring(0, 40)}...
              
            ))}
          
        
      

      {/* Talking Points & Success Criteria */}
      
        {/* Talking Points */}
        
          
            
              
              Key Talking Points
            
          
          
            {talkingPoints.map((point, index) => (
              
                {index + 1}.
                 updateTalkingPoint(index, e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
                {talkingPoints.length > 1 && (
                   removeTalkingPoint(index)}
                  >
                    
                  
                )}
              
            ))}
            
              
              Add Point
            
          
        

        {/* Success Criteria & Product Info */}
        
          
            
              
              Success Criteria
            
          
          
             setSuccessCriteria(e.target.value)}
              className="h-8 text-sm"
            />
            
              {["Meeting booked", "Demo scheduled", "Lead qualified", "Interest confirmed"].map((c, i) => (
                 setSuccessCriteria(c)}
                >
                  {c}
                
              ))}
            
          
        
      

      {/* Product/Service & Target Audience */}
      
        
          
            
            Context for AI
          
          
            Provide additional context to help the AI have more relevant conversations.
          
        
        
          
            
              Product/Service Description
               setProductServiceInfo(e.target.value)}
                className="min-h-[80px] text-sm"
              />
            
            
              Target Audience
               setTargetAudienceDescription(e.target.value)}
                className="min-h-[80px] text-sm"
              />
            
          
        
      

      

      {/* AI Content Generation */}
      
        
          
            
              
              Call Script
            
            
              AI Generate
               setContentMode(checked ? 'ai' : 'manual')}
              />
            
          
        
        
          {contentMode === 'ai' ? (
            
              
                
                  
                  
                    AI-Powered Script Generation
                    
                      The AI will generate a call script based on your objective, talking points, and context.
                      This is used when the call flow requires specific scripted responses.
                    
                  
                
              
              
                {isGenerating ? (
                  <>
                    
                    Generating...
                  
                ) : (
                  <>
                    
                    Generate Call Script
                  
                )}
              
              {callScript && (
                
                  Generated Script
                   setCallScript(e.target.value)}
                    className="min-h-[150px] mt-2 text-sm"
                    placeholder="Generated script will appear here..."
                  />
                
              )}
            
          ) : (
            
              Call Script (Optional)
               setCallScript(e.target.value)}
                className="min-h-[150px] text-sm"
              />
              
                If no script is provided, the AI will dynamically generate responses using your objective and talking points.
              
            
          )}
        
      

      {/* Navigation */}
      
        
          Back
        
        
          Continue
        
      
    
  );
}