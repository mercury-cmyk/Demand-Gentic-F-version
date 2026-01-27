
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAMPAIGN_TYPES, getCampaignTypesForChannel } from "@/lib/campaign-types";

interface Step0Props {
  data: any;
  onNext: (data: any) => void;
  /** Channel filter - only show types that support this channel */
  channel?: 'email' | 'voice';
}

// Re-export for backward compatibility
export { CAMPAIGN_TYPES } from "@/lib/campaign-types";

export function Step0CampaignType({ data, onNext, channel }: Step0Props) {
  const [selectedType, setSelectedType] = useState<string>(data?.type || "");

  // Get campaign types filtered by channel if specified
  const availableTypes = channel
    ? getCampaignTypesForChannel(channel).map(({ value, label, description }) => ({ value, label, description }))
    : CAMPAIGN_TYPES;

  const handleNext = () => {
    onNext({ ...data, type: selectedType });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Select Campaign Type</h2>
        <p className="text-muted-foreground">
          Choose the type of campaign to automatically configure {channel === 'voice' ? 'agent behavior' : 'email strategy'} and objectives.
          {channel && (
            <span className="block mt-1 text-sm">
              Campaign types are standardized across email and voice channels for consistent strategy.
            </span>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Type</CardTitle>
          <CardDescription>
            This selection determines the {channel === 'voice' ? "AI agent's strategy, intelligence rules, and success criteria" : 'email tone, messaging approach, and call-to-action strategy'}.
            Both email and voice campaigns follow the same strategic intent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Select a campaign type" />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((type) => (
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
