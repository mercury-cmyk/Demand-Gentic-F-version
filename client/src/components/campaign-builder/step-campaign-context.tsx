/**
 * Step - Campaign Context
 *
 * Captures the core campaign context required for AI agent conversations:
 * - Organization association (Problem Intelligence Org)
 * - Campaign objective
 * - Talking points / key messages
 * - Product/service info, target audience, objections
 *
 * Supports AI-powered context generation from Organization Intelligence.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  CheckCircle2,
  Users,
  Package,
  ShieldAlert,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CampaignOrganization {
  id: string;
  name: string;
  industry?: string;
}

interface GeneratedContext {
  campaignObjective: string;
  talkingPoints: string[];
  successCriteria: string;
  productServiceInfo: string;
  targetAudienceDescription: string;
  campaignObjections: Array<{ objection: string; response: string }>;
}

interface StepCampaignContextProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function StepCampaignContext({ data, onNext, onBack }: StepCampaignContextProps) {
  const { toast } = useToast();

  // Organization selection
  const [selectedOrgId, setSelectedOrgId] = useState<string>(data?.organizationId || "");

  // Core fields
  const [campaignObjective, setCampaignObjective] = useState<string>(data?.campaignObjective || "");
  const [talkingPoints, setTalkingPoints] = useState<string[]>(
    data?.talkingPoints?.length > 0 ? data.talkingPoints : [""]
  );
  const [successCriteria, setSuccessCriteria] = useState<string>(data?.successCriteria || "");

  // Extended fields (populated by AI or manual)
  const [productServiceInfo, setProductServiceInfo] = useState<string>(data?.productServiceInfo || "");
  const [targetAudienceDescription, setTargetAudienceDescription] = useState<string>(data?.targetAudienceDescription || "");
  const [campaignObjections, setCampaignObjections] = useState<Array<{ objection: string; response: string }>>(
    data?.campaignObjections?.length > 0 ? data.campaignObjections : []
  );

  // AI generation state
  const [aiGenerated, setAiGenerated] = useState(false);

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

  // AI context generation mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/campaign-manager/generate-context", {
        organizationId: selectedOrgId,
        campaignType: data?.type || "call",
        campaignName: data?.name,
        existingObjective: campaignObjective.trim() || undefined,
        existingTalkingPoints: talkingPoints.filter(tp => tp.trim().length > 0),
      }, { timeout: 45000 });
      return res.json();
    },
    onSuccess: (result: { success: boolean; generated: GeneratedContext; organizationName: string }) => {
      if (!result.success || !result.generated) {
        toast({ title: "Generation failed", description: "AI returned an unexpected response.", variant: "destructive" });
        return;
      }

      const g = result.generated;

      // Apply generated fields
      if (g.campaignObjective) setCampaignObjective(g.campaignObjective);
      if (g.talkingPoints?.length > 0) setTalkingPoints(g.talkingPoints);
      if (g.successCriteria) setSuccessCriteria(g.successCriteria);
      if (g.productServiceInfo) setProductServiceInfo(g.productServiceInfo);
      if (g.targetAudienceDescription) setTargetAudienceDescription(g.targetAudienceDescription);
      if (g.campaignObjections?.length > 0) setCampaignObjections(g.campaignObjections);

      setAiGenerated(true);
      toast({
        title: "Context Generated",
        description: `AI generated campaign context from ${result.organizationName}'s intelligence. Review and edit as needed.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate campaign context. Please try again.",
        variant: "destructive",
      });
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

  // Talking point helpers
  const addTalkingPoint = () => setTalkingPoints([...talkingPoints, ""]);
  const removeTalkingPoint = (index: number) => {
    if (talkingPoints.length > 1) setTalkingPoints(talkingPoints.filter((_, i) => i !== index));
  };
  const updateTalkingPoint = (index: number, value: string) => {
    const updated = [...talkingPoints];
    updated[index] = value;
    setTalkingPoints(updated);
  };

  // Objection helpers
  const addObjection = () => setCampaignObjections([...campaignObjections, { objection: "", response: "" }]);
  const removeObjection = (index: number) => setCampaignObjections(campaignObjections.filter((_, i) => i !== index));
  const updateObjection = (index: number, field: "objection" | "response", value: string) => {
    const updated = [...campaignObjections];
    updated[index] = { ...updated[index], [field]: value };
    setCampaignObjections(updated);
  };

  // Validation
  const isValid = campaignObjective.trim().length > 0;

  const handleNext = () => {
    const validTalkingPoints = talkingPoints.filter((tp) => typeof tp === "string" && tp.trim().length > 0);
    const validObjections = campaignObjections.filter((o) => o.objection.trim().length > 0);

    onNext({
      organizationId: selectedOrgId || null,
      campaignObjective: campaignObjective.trim(),
      talkingPoints: validTalkingPoints.length > 0 ? validTalkingPoints : null,
      successCriteria: successCriteria.trim() || null,
      productServiceInfo: productServiceInfo.trim() || null,
      targetAudienceDescription: targetAudienceDescription.trim() || null,
      campaignObjections: validObjections.length > 0 ? validObjections : null,
    });
  };

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

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

      {/* Organization Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building className="h-5 w-5" />
                Campaign Organization
                <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">Recommended</Badge>
              </CardTitle>
              <CardDescription>
                Select the organization this campaign is for. This provides context-aware intelligence during calls.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an organization (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None - Generic Context</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                    {org.industry && ` (${org.industry})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* AI Generate Button — visible when org is selected */}
          {selectedOrgId && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Wand2 className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-900">
                    AI Context Generation
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Auto-generate campaign objective, talking points, target audience, product info, and objection handling — all grounded in{" "}
                    <span className="font-semibold">{selectedOrg?.name || "the organization"}</span>'s intelligence data.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="shrink-0 bg-blue-600 hover:bg-blue-700"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-1.5" />
                      Generate with AI
                    </>
                  )}
                </Button>
              </div>
              {aiGenerated && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded px-2.5 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Context generated from organization intelligence. All fields below have been populated — review and edit as needed.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Objective */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5" />
            Campaign Objective
            <Badge variant="destructive" className="text-xs">Required</Badge>
          </CardTitle>
          <CardDescription>
            What is the primary goal of this campaign? This guides the AI agent&apos;s conversation strategy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="e.g., Book qualified meetings with IT decision makers at mid-market companies"
            value={campaignObjective}
            onChange={(e) => setCampaignObjective(e.target.value)}
            className="min-h-[100px]"
          />

          {/* Quick templates */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground flex items-center gap-1">
              <Lightbulb className="h-3 w-3" />
              Quick Templates
            </Label>
            <div className="flex flex-wrap gap-2">
              {getObjectiveTemplates().map((template, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-1 px-2"
                  onClick={() => setCampaignObjective(template)}
                >
                  {template.substring(0, 50)}...
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product / Service Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5" />
            Product / Service Info
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </CardTitle>
          <CardDescription>
            Describe the product or service being promoted. The AI agent uses this during conversations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g., Our AI-powered demand generation platform helps B2B companies book more qualified meetings through intelligent outbound calling, email automation, and real-time conversation intelligence."
            value={productServiceInfo}
            onChange={(e) => setProductServiceInfo(e.target.value)}
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      {/* Target Audience */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Target Audience
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </CardTitle>
          <CardDescription>
            Who is the ideal prospect for this campaign? Include titles, industries, and company size.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g., VP of Sales, CROs, and Demand Gen Directors at mid-market B2B SaaS companies (200-5000 employees) struggling with pipeline generation and outbound conversion rates."
            value={targetAudienceDescription}
            onChange={(e) => setTargetAudienceDescription(e.target.value)}
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      {/* Talking Points */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" />
            Key Talking Points
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </CardTitle>
          <CardDescription>
            What are the key messages or value propositions the AI should convey?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {talkingPoints.map((point, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
              <Input
                placeholder={`e.g., "We help companies reduce costs by 40% through automation"`}
                value={point}
                onChange={(e) => updateTalkingPoint(index, e.target.value)}
                className="flex-1"
              />
              {talkingPoints.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeTalkingPoint(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={addTalkingPoint}
            className="mt-2"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Talking Point
          </Button>
        </CardContent>
      </Card>

      {/* Success Criteria */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5" />
            Success Criteria
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </CardTitle>
          <CardDescription>
            How do you define a successful call outcome?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="e.g., Meeting booked with decision maker"
            value={successCriteria}
            onChange={(e) => setSuccessCriteria(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              "Meeting booked with decision maker",
              "Demo scheduled",
              "Lead qualified for sales",
              "Contact information captured",
              "Interest confirmed for follow-up",
            ].map((criteria, i) => (
              <Button
                key={i}
                variant="ghost"
                size="sm"
                className="text-xs h-auto py-1 px-2"
                onClick={() => setSuccessCriteria(criteria)}
              >
                {criteria}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Objection Handling */}
      {campaignObjections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-5 w-5" />
              Objection Handling
              <Badge variant="secondary" className="text-xs">AI Generated</Badge>
            </CardTitle>
            <CardDescription>
              Common objections and recommended responses for the AI agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {campaignObjections.map((obj, index) => (
              <div key={index} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium text-muted-foreground mt-2 w-6">{index + 1}.</span>
                  <div className="flex-1 space-y-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Objection</Label>
                      <Input
                        value={obj.objection}
                        onChange={(e) => updateObjection(index, "objection", e.target.value)}
                        placeholder="e.g., We already have a solution for this"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Recommended Response</Label>
                      <Textarea
                        value={obj.response}
                        onChange={(e) => updateObjection(index, "response", e.target.value)}
                        placeholder="e.g., I understand — many of our clients felt the same way initially..."
                        className="min-h-[60px]"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive mt-2"
                    onClick={() => removeObjection(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={addObjection}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Objection
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add objection button when no objections exist yet */}
      {campaignObjections.length === 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={addObjection}
          className="w-full"
        >
          <ShieldAlert className="h-4 w-4 mr-2" />
          Add Objection Handling (Optional)
        </Button>
      )}

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
