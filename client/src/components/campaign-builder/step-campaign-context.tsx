/**
 * Step - Campaign Context
 *
 * Captures the core campaign context required for AI agent conversations:
 * - Organization association (Problem Intelligence Org)
 * - Campaign objective
 * - Talking points / key messages
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface CampaignOrganization {
  id: string;
  name: string;
  industry?: string;
}

interface StepCampaignContextProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

export function StepCampaignContext({ data, onNext, onBack }: StepCampaignContextProps) {
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

  // Validation
  const isValid = campaignObjective.trim().length > 0;

  const handleNext = () => {
    // Filter out empty talking points
    const validTalkingPoints = talkingPoints.filter((tp) => tp.trim().length > 0);

    onNext({
      organizationId: selectedOrgId || null,
      campaignObjective: campaignObjective.trim(),
      talkingPoints: validTalkingPoints.length > 0 ? validTalkingPoints : null,
      successCriteria: successCriteria.trim() || null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          Campaign Context
        </h2>
        <p className="text-muted-foreground">
          Define what your AI agent should accomplish and the key messages to convey.
        </p>
      </div>

      {/* Organization Selection (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building className="h-5 w-5" />
            Problem Intelligence Organization
            <Badge variant="secondary" className="text-xs">Optional</Badge>
          </CardTitle>
          <CardDescription>
            Link to an organization for context-aware intelligence during calls.
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
