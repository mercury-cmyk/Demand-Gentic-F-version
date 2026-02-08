import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Target,
  Package,
  ListChecks,
  Users,
  X,
} from "lucide-react";

export interface CampaignContextData {
  campaignObjective: string;
  campaignContextBrief?: string;
  productServiceInfo: string;
  talkingPoints: string[];
  targetAudienceDescription: string;
  successCriteria: string;
  campaignObjections?: Array<{ objection: string; response: string }>;
}

interface CampaignContextEditorProps {
  data: CampaignContextData;
  onChange: (data: CampaignContextData) => void;
  headerAction?: React.ReactNode;
}

export function CampaignContextEditor({
  data,
  onChange,
  headerAction,
}: CampaignContextEditorProps) {
  const [newTalkingPoint, setNewTalkingPoint] = useState("");

  const updateField = (field: keyof CampaignContextData, value: any) => {
    onChange({
      ...data,
      [field]: value
    });
  };

  const addTalkingPoint = () => {
    if (newTalkingPoint.trim()) {
      updateField("talkingPoints", [...(data.talkingPoints || []), newTalkingPoint.trim()]);
      setNewTalkingPoint("");
    }
  };

  const removeTalkingPoint = (index: number) => {
    updateField(
      "talkingPoints",
      (data.talkingPoints || []).filter((_, i) => i !== index)
    );
  };

  const addObjection = () => {
    const current = data.campaignObjections || [];
    updateField("campaignObjections", [...current, { objection: "", response: "" }]);
  };

  const removeObjection = (index: number) => {
    const current = data.campaignObjections || [];
    updateField("campaignObjections", current.filter((_, i) => i !== index));
  };

  const updateObjectionItem = (index: number, key: "objection" | "response", val: string) => {
    const current = [...(data.campaignObjections || [])];
    current[index] = { ...current[index], [key]: val };
    updateField("campaignObjections", current);
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <CardTitle>Campaign Context</CardTitle>
          </div>
          {headerAction}
        </div>
        <CardDescription>
          Define the campaign goals and context. This information will be displayed to agents during calls
          to help them understand the campaign objectives and have informed conversations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Campaign Objective */}
        <div className="space-y-2">
          <Label htmlFor="campaign-objective">Campaign Objective</Label>
          <Textarea
            id="campaign-objective"
            placeholder="e.g., Book qualified meetings with IT decision makers interested in cloud security solutions"
            value={data.campaignObjective || ""}
            onChange={(e) => updateField("campaignObjective", e.target.value)}
            rows={2}
            data-testid="textarea-campaign-objective"
          />
          <p className="text-xs text-muted-foreground">What is the primary goal of each call?</p>
        </div>

        {/* AI Agent Context Brief */}
        <div className="space-y-2">
          <Label htmlFor="campaign-context-brief" className="flex items-center gap-2">
            AI Agent Context Brief
            <span className="text-xs text-muted-foreground font-normal">(Recommended)</span>
          </Label>
          <Textarea
            id="campaign-context-brief"
            placeholder="e.g., We are Acme Security, a cloud security platform helping mid-market companies protect their infrastructure. Our solution reduces security incidents by 40% and provides 24/7 automated monitoring. We're calling IT leaders who have shown interest in security solutions to schedule a brief discovery call to understand their current security challenges."
            value={data.campaignContextBrief || ""}
            onChange={(e) => updateField("campaignContextBrief", e.target.value)}
            rows={4}
            className="bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800"
            data-testid="textarea-campaign-context-brief"
          />
          <p className="text-xs text-muted-foreground">
            A 3-5 sentence brief that gives the AI voice agent all the context it needs for intelligent conversations.
            Include: who you are, what you offer, why it matters, and what outcome you want.
          </p>
        </div>

        {/* Product/Service Info */}
        <div className="space-y-2">
          <Label htmlFor="product-service-info">
            <Package className="w-4 h-4 inline mr-1" />
            Product/Service Information
          </Label>
          <Textarea
            id="product-service-info"
            placeholder="Describe your product/service, key features, and value proposition..."
            value={data.productServiceInfo || ""}
            onChange={(e) => updateField("productServiceInfo", e.target.value)}
            rows={4}
            data-testid="textarea-product-info"
          />
        </div>

        {/* Key Talking Points */}
        <div className="space-y-3">
          <Label>
            <ListChecks className="w-4 h-4 inline mr-1" />
            Key Talking Points
          </Label>
          <p className="text-xs text-muted-foreground">
            Add the main points agents should emphasize during conversations.
          </p>
          <div className="space-y-2">
            {(data.talkingPoints || []).map((point, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <span className="flex-1 text-sm">{point}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTalkingPoint(index)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Reduces security incidents by 40%"
                value={newTalkingPoint}
                onChange={(e) => setNewTalkingPoint(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTalkingPoint())}
                data-testid="input-new-talking-point"
              />
              <Button variant="outline" onClick={addTalkingPoint} data-testid="button-add-talking-point">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Target Audience */}
        <div className="space-y-2">
          <Label htmlFor="target-audience">
            <Users className="w-4 h-4 inline mr-1" />
            Target Audience
          </Label>
          <Textarea
            id="target-audience"
            placeholder="e.g., CISOs and IT Directors at mid-market companies (500-5000 employees) in healthcare and finance"
            value={data.targetAudienceDescription || ""}
            onChange={(e) => updateField("targetAudienceDescription", e.target.value)}
            rows={2}
            data-testid="textarea-target-audience"
          />
          <p className="text-xs text-muted-foreground">Who are you trying to reach?</p>
        </div>

        {/* Success Criteria */}
        <div className="space-y-2">
          <Label htmlFor="success-criteria">Success Criteria</Label>
          <Textarea
            id="success-criteria"
            placeholder="e.g., Meeting booked with decision maker, or referral to correct contact"
            value={data.successCriteria || ""}
            onChange={(e) => updateField("successCriteria", e.target.value)}
            rows={2}
            data-testid="textarea-success-criteria"
          />
          <p className="text-xs text-muted-foreground">What counts as a successful call outcome?</p>
        </div>

        {/* Campaign Objections */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Common Objections & Responses</Label>
            <Button variant="outline" size="sm" onClick={addObjection} data-testid="button-add-objection">
              <Plus className="w-4 h-4 mr-2" />
              Add Objection
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Prepare agents with responses to common pushback.
          </p>
          
          <div className="space-y-4">
            {(data.campaignObjections || []).map((obj, index) => (
              <Card key={index} className="bg-muted/30">
                <CardContent className="p-3 space-y-3 relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeObjection(index)}
                    className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  
                  <div className="space-y-1">
                    <Label className="text-xs">Objection</Label>
                    <Input 
                      placeholder="e.g., Too expensive"
                      value={obj.objection}
                      onChange={(e) => updateObjectionItem(index, "objection", e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs">Response Strategy</Label>
                    <Textarea 
                      placeholder="e.g., Focus on ROI and long-term savings..."
                      value={obj.response}
                      onChange={(e) => updateObjectionItem(index, "response", e.target.value)}
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
            {(data.campaignObjections || []).length === 0 && (
              <div className="text-sm text-muted-foreground italic border border-dashed rounded p-4 text-center">
                No objections defined. Add common objections to help agents handle rejection.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
