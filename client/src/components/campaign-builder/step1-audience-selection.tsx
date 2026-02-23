import { useState, useEffect } from "react"; // Added useEffect import
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, FileText, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { InlineOrgCreator } from "@/components/campaigns/inline-org-creator";
import { CampaignAudienceSelector, type AudienceSelection } from "@/components/campaigns/CampaignAudienceSelector";

interface Organization {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  isDefault: boolean;
  organizationType?: "super" | "client" | "campaign";
}

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
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(data.organizationId || null);

  // Fetch organizations for dropdown
  const { data: orgsData } = useQuery<{ organizations: Organization[] }>({
    queryKey: ["/api/organizations/dropdown"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/organizations/dropdown");
      return res.json();
    },
  });
  const organizations = orgsData?.organizations || [];
  const selectedOrgExists = !!selectedOrgId && organizations.some((org) => org.id === selectedOrgId);
  const effectiveSelectedOrgValue = selectedOrgExists ? selectedOrgId! : "none";

  // Auto-select default org on first load
  useEffect(() => {
    if (selectedOrgId && organizations.length > 0 && !organizations.some((o) => o.id === selectedOrgId)) {
      setSelectedOrgId(null);
      return;
    }

    if (!selectedOrgId && !data.organizationId && organizations.length > 0) {
      const superOrg = organizations.find((o) => o.organizationType === "super");
      const defaultOrg = organizations.find((o) => o.isDefault);
      const fallbackOrg = superOrg || defaultOrg || organizations[0];
      setSelectedOrgId(fallbackOrg.id);
    }
  }, [organizations, selectedOrgId, data.organizationId]);

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
              <div className="flex gap-2">
                <Select
                  value={effectiveSelectedOrgValue}
                  onValueChange={(value) => setSelectedOrgId(value === "none" ? null : value)}
                >
                  <SelectTrigger id="organization-select" data-testid="select-organization" className="flex-1">
                    <SelectValue placeholder="Select organization..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No organization</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        <div className="flex items-center gap-2">
                          <span>{org.name}</span>
                          {org.isDefault && (
                            <Badge variant="secondary" className="text-[10px] h-4">
                              Default
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InlineOrgCreator
                  onOrgCreated={(orgId) => setSelectedOrgId(orgId)}
                  triggerVariant="button"
                  triggerSize="default"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for problem intelligence and service catalog matching
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <CampaignAudienceSelector 
        value={audienceData} 
        onChange={setAudienceData} 
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
