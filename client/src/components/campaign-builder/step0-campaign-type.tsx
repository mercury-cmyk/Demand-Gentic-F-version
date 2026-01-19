
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Step0Props {
  data: any;
  onNext: (data: any) => void;
}

export const CAMPAIGN_TYPES = [
  { value: "content_syndication", label: "Content Syndication", description: "Engage ideal buyers & obtain consent" },
  { value: "live_webinar", label: "Live Webinar", description: "Drive live webinar attendance" },
  { value: "on_demand_webinar", label: "On-Demand Webinar", description: "Promote on-demand content" },
  { value: "high_quality_leads", label: "High-Quality Leads", description: "Leads meeting strict quality criteria" },
  { value: "executive_dinner", label: "Executive Dinner", description: "Invite executives to dinner events" },
  { value: "leadership_forum", label: "Leadership Forum", description: "Engage senior leaders" },
  { value: "conference", label: "Conference", description: "Drive conference attendance/meetings" },
  { value: "sql", label: "Sales Qualified Lead (SQL)", description: "Identify sales-ready leads" },
  { value: "appointment_generation", label: "Appointment Generation", description: "Secure sales appointments" },
  { value: "lead_qualification", label: "Lead Qualification", description: "Gather info & classify leads" },
  { value: "data_validation", label: "Data Validation", description: "Verify contact/account data" },
  { value: "bant_leads", label: "BANT Leads", description: "Qualify against BANT criteria" },
];

export function Step0CampaignType({ data, onNext }: Step0Props) {
  const [selectedType, setSelectedType] = useState<string>(data?.type || "");

  const handleNext = () => {
    onNext({ ...data, type: selectedType });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Select Campaign Type</h2>
        <p className="text-muted-foreground">
          Choose the type of campaign to automatically configure agent behavior and objectives.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Type</CardTitle>
          <CardDescription>This selection determines the AI agent's strategy, intelligence rules, and success criteria.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Select a campaign type" />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <span className="font-medium">{type.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">- {type.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!selectedType}>
          Next Step
        </Button>
      </div>
    </div>
  );
}
