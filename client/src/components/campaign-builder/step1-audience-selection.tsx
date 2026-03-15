import { useState, useEffect } from "react"; // Added useEffect import
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, FileText, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampaignAudienceSelector, type AudienceSelection } from "@/components/campaigns/CampaignAudienceSelector";
import { SUPER_ORG_ID, SUPER_ORG_NAME } from "@shared/schema";

interface Step1Props {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  campaignType: "email" | "telemarketing";
}

// Renamed Step1AudienceSelection to match the original component name and updated prop type.
export function Step1AudienceSelection({ data, onNext, campaignType }: Step1Props) {
  // Campaign Name
  const [campaignName, setCampaignName] = useState(data.name || "");

  // Organization selection for problem intelligence
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(SUPER_ORG_ID);

  useEffect(() => {
    if (selectedOrgId !== SUPER_ORG_ID) {
      setSelectedOrgId(SUPER_ORG_ID);
    }
  }, [selectedOrgId]);

  const [audienceData, setAudienceData] = useState<AudienceSelection>({
    source: data.audience?.source || "filters",
    selectedSegments: data.audience?.selectedSegments || [],
    selectedLists: data.audience?.selectedLists || [],
    selectedDomainSets: data.audience?.selectedDomainSets || [],
    excludedSegments: data.audience?.excludedSegments || [],
    excludedLists: data.audience?.excludedLists || [],
    filterGroup: data.audience?.filterGroup,
    estimatedCount: data.audience?.estimatedCount || 0
  });

  const handleNext = () => {
    console.log('Campaign audience data:', audienceData); // Debug log

    onNext({
      name: campaignName,
      organizationId: selectedOrgId,
      audience: audienceData,
    });
  };

  const hasValidAudience = () => {
    const { source, selectedSegments = [], selectedLists = [], selectedDomainSets = [], filterGroup } = audienceData;
    if (source === "segment" && selectedSegments.length > 0) return true;
    if (source === "list" && selectedLists.length > 0) return true;
    if (source === "domain_set" && selectedDomainSets.length > 0) return true;
    if (source === "filters" && filterGroup && filterGroup.conditions.length > 0) return true;
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Campaign Name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Campaign Name
          </CardTitle>
          <CardDescription>Give your campaign a descriptive name</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Name</Label>
              <Input
                id="campaign-name"
                data-testid="input-campaign-name"
                placeholder={campaignType === "email" ? "e.g., Q4 Product Launch Email" : "e.g., Q4 Outbound Dialer Campaign"}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-select" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Organization
              </Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2.5">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{SUPER_ORG_NAME}</span>
                <Badge variant="secondary" className="ml-auto">Super Organization</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Admin campaigns always use the super organization for problem intelligence and service catalog matching
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <CampaignAudienceSelector
        value={audienceData}
        onChange={setAudienceData}
        organizationId={selectedOrgId || undefined}
      />

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          size="lg"
          data-testid="button-next-step"
          disabled={!campaignName.trim() || !hasValidAudience()}
        >
          Continue to Content Setup
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
