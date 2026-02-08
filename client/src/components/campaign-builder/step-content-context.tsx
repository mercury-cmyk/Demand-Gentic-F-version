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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Input mode: 'manual' or 'document'
  const [inputMode, setInputMode] = useState<'manual' | 'document'>('manual');

  // Document upload state
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [documentExtractionError, setDocumentExtractionError] = useState<string | null>(null);

  // Organization selection
  const [selectedOrgId, setSelectedOrgId] = useState<string>(data?.organizationId || "");

  // Campaign objective
  const [campaignObjective, setCampaignObjective] = useState<string>(data?.campaignObjective || "");

  // Talking points
  const [talkingPoints, setTalkingPoints] = useState<string[]>(
    data?.talkingPoints?.length > 0 ? data.talkingPoints : [""]
  );

  // Success criteria
  const [successCriteria, setSuccessCriteria] = useState<string>(data?.successCriteria || "");

  // Product/Service Info
  const [productServiceInfo, setProductServiceInfo] = useState<string>(data?.productServiceInfo || "");

  // Target Audience Description
  const [targetAudienceDescription, setTargetAudienceDescription] = useState<string>(data?.targetAudienceDescription || "");

  // Common objections
  const [commonObjections, setCommonObjections] = useState<string[]>(
    data?.campaignObjections?.length > 0 ? data.campaignObjections : []
  );

  // Content mode: 'ai' or 'manual'
  const [contentMode, setContentMode] = useState<'ai' | 'manual'>(data?.content?.script ? 'manual' : 'ai');

  // Call script (for manual mode or AI-generated)
  const [callScript, setCallScript] = useState<string>(data?.content?.script || "");

  // AI Generation state
  const [isGenerating, setIsGenerating] = useState(false);

  // Handle document upload and AI extraction
  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
  const { data: organizations = [], isLoading: orgsLoading } = useQuery<CampaignOrganization[]>({
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
    const templates: Record<string, string[]> = {
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
        talkingPoints: talkingPoints.filter(tp => tp.trim()),
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
      if (result.suggestedTalkingPoints?.length > 0 && talkingPoints.filter(tp => tp.trim()).length === 0) {
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
    const validTalkingPoints = talkingPoints.filter((tp) => tp.trim().length > 0);
    const validObjections = commonObjections.filter((o) => o.trim().length > 0);

    onNext({
      organizationId: selectedOrgId || null,
      campaignObjective: campaignObjective.trim(),
      talkingPoints: validTalkingPoints.length > 0 ? validTalkingPoints : null,
      successCriteria: successCriteria.trim() || null,
      productServiceInfo: productServiceInfo.trim() || null,
      targetAudienceDescription: targetAudienceDescription.trim() || null,
      campaignObjections: validObjections.length > 0 ? validObjections : null,
      content: {
        script: callScript.trim() || null,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          Content & Context
        </h2>
        <p className="text-muted-foreground">
          Define your campaign objective and provide context for AI-powered conversations.
        </p>
      </div>

      {/* Organization Selection - Required/Prominent */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building className="h-4 w-4 text-primary" />
            Campaign Organization
            <Badge variant="secondary" className="text-xs">Recommended</Badge>
          </CardTitle>
          <CardDescription>
            Select the organization this campaign is for. This provides context-aware intelligence during calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orgsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading organizations...
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No organizations available. You can proceed without one.
            </div>
          ) : (
            <Select value={selectedOrgId || "none"} onValueChange={(val) => setSelectedOrgId(val === "none" ? "" : val)}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select an organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None - Generic Context</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                    {org.industry && ` (${org.industry})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Document Upload - AI Extraction */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileUp className="h-4 w-4" />
            Import from Document
            <Badge variant="outline" className="text-xs">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            Upload a campaign brief, product document, or script. AI will extract all relevant campaign context automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md"
            onChange={handleDocumentUpload}
            className="hidden"
            id="document-upload"
          />

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingDocument}
              className="flex-1"
            >
              {isUploadingDocument ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing Document...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document (PDF, DOCX, TXT)
                </>
              )}
            </Button>

            {uploadedFileName && !isUploadingDocument && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="truncate max-w-[200px]">{uploadedFileName}</span>
              </div>
            )}
          </div>

          {documentExtractionError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{documentExtractionError}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">
            Supported formats: PDF, Word (.docx, .doc), Text (.txt), Markdown (.md). Max size: 10MB.
          </p>
        </CardContent>
      </Card>

      {/* Campaign Objective - Prominent */}
      <Card className="border-primary/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" />
            Campaign Objective
            <Badge variant="destructive" className="text-xs">Required</Badge>
          </CardTitle>
          <CardDescription>
            What is the primary goal of this campaign?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="e.g., Book qualified meetings with IT decision makers at mid-market companies"
            value={campaignObjective}
            onChange={(e) => setCampaignObjective(e.target.value)}
            className="min-h-[80px]"
          />

          {/* Quick templates */}
          <div className="flex flex-wrap gap-1.5">
            {getObjectiveTemplates().map((template, i) => (
              <Button
                key={i}
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setCampaignObjective(template)}
              >
                <Lightbulb className="h-3 w-3 mr-1" />
                {template.substring(0, 40)}...
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Talking Points & Success Criteria */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Talking Points */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4" />
              Key Talking Points
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {talkingPoints.map((point, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-4">{index + 1}.</span>
                <Input
                  placeholder="Value proposition or key message"
                  value={point}
                  onChange={(e) => updateTalkingPoint(index, e.target.value)}
                  className="flex-1 h-8 text-sm"
                />
                {talkingPoints.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeTalkingPoint(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addTalkingPoint}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Point
            </Button>
          </CardContent>
        </Card>

        {/* Success Criteria & Product Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Success Criteria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="e.g., Meeting booked with decision maker"
              value={successCriteria}
              onChange={(e) => setSuccessCriteria(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {["Meeting booked", "Demo scheduled", "Lead qualified", "Interest confirmed"].map((c, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => setSuccessCriteria(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product/Service & Target Audience */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Context for AI
          </CardTitle>
          <CardDescription>
            Provide additional context to help the AI have more relevant conversations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Product/Service Description</Label>
              <Textarea
                placeholder="Describe your product or service..."
                value={productServiceInfo}
                onChange={(e) => setProductServiceInfo(e.target.value)}
                className="min-h-[80px] text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Target Audience</Label>
              <Textarea
                placeholder="Describe who you're targeting..."
                value={targetAudienceDescription}
                onChange={(e) => setTargetAudienceDescription(e.target.value)}
                className="min-h-[80px] text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Content Generation */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4" />
              Call Script
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">AI Generate</Label>
              <Switch
                checked={contentMode === 'ai'}
                onCheckedChange={(checked) => setContentMode(checked ? 'ai' : 'manual')}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contentMode === 'ai' ? (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">AI-Powered Script Generation</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The AI will generate a call script based on your objective, talking points, and context.
                      This is used when the call flow requires specific scripted responses.
                    </p>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleGenerateContent}
                disabled={isGenerating || !campaignObjective.trim()}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate Call Script
                  </>
                )}
              </Button>
              {callScript && (
                <div className="mt-4">
                  <Label className="text-sm">Generated Script</Label>
                  <Textarea
                    value={callScript}
                    onChange={(e) => setCallScript(e.target.value)}
                    className="min-h-[150px] mt-2 text-sm"
                    placeholder="Generated script will appear here..."
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm">Call Script (Optional)</Label>
              <Textarea
                placeholder="Enter a custom call script or leave blank to use AI-generated responses based on your context..."
                value={callScript}
                onChange={(e) => setCallScript(e.target.value)}
                className="min-h-[150px] text-sm"
              />
              <p className="text-xs text-muted-foreground">
                If no script is provided, the AI will dynamically generate responses using your objective and talking points.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext} disabled={!isValid}>
          Continue
        </Button>
      </div>
    </div>
  );
}
