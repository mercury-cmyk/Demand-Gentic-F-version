import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";
import PublishDialog from "./shared/publish-dialog";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface LandingPageTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
  campaignId?: string;
}

export default function LandingPageTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
  campaignId,
}: LandingPageTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [ctaGoal, setCtaGoal] = useState("");
  const [thankYouPageUrl, setThankYouPageUrl] = useState("/thank-you");
  const [assetUrl, setAssetUrl] = useState("");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const { data: campaignDetails } = useQuery<any>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/campaigns/${campaignId}`);
      return res.json();
    },
  });

  const prefilledPrompt = campaignDetails
    ? [
        campaignDetails.campaignObjective ? `Campaign objective: ${campaignDetails.campaignObjective}` : null,
        campaignDetails.productServiceInfo ? `Product / service details: ${campaignDetails.productServiceInfo}` : null,
        campaignDetails.targetAudienceDescription ? `Target audience: ${campaignDetails.targetAudienceDescription}` : null,
        campaignDetails.campaignContextBrief ? `Campaign context brief: ${campaignDetails.campaignContextBrief}` : null,
        Array.isArray(campaignDetails.talkingPoints) && campaignDetails.talkingPoints.length > 0
          ? `Talking points: ${campaignDetails.talkingPoints.join("; ")}`
          : null,
        Array.isArray(campaignDetails.campaignObjections) && campaignDetails.campaignObjections.length > 0
          ? `Common objections and responses: ${campaignDetails.campaignObjections.map((item: any) => {
              if (item?.objection || item?.response) {
                return `${item?.objection || "Objection"}: ${item?.response || ""}`.trim();
              }
              return String(item);
            }).join("; ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const prefilledAdditionalContext = campaignDetails
    ? [
        campaignDetails.successCriteria ? `Success criteria: ${campaignDetails.successCriteria}` : null,
        campaignDetails.landingPageUrl ? `Existing landing page URL (for reference): ${campaignDetails.landingPageUrl}` : null,
        campaignDetails.projectFileUrl ? `Project brief / file URL (for reference): ${campaignDetails.projectFileUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const derivedAssetUrl = campaignDetails?.projectFileUrl || "";

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "POST",
        "/api/generative-studio/generate/landing-page",
        data,
        { timeout: 180000 }
      );
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });
      toast({ title: "Landing page generated!" });
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/generative-studio/publish/${projectId}`, {
        ...data,
        organizationId,
        clientProjectId,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setPublishOpen(false);
      toast({ title: "Landing page published!", description: `Available at ${data.url}` });
    },
    onError: (error: any) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  const saveAsAssetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/generative-studio/save-as-asset/${projectId}`, {
        organizationId,
        clientProjectId,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to content library!" });
    },
  });

  const handleGenerate = (params: Record<string, any>) => {
    generateMutation.mutate({
      ...params,
      ctaGoal: ctaGoal || undefined,
      thankYouPageUrl: thankYouPageUrl || '/thank-you',
      assetUrl: assetUrl || derivedAssetUrl || undefined,
      organizationId,
      clientProjectId,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] h-full">
      {/* Left panel - Form */}
      <div className="border-r bg-muted/10 p-5 overflow-auto">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-none">Landing Page</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Generate and publish pages</p>
          </div>
        </div>

        <GenerationForm
          contentType="Landing Page"
          brandKits={brandKits}
          orgIntelligence={orgIntelligence}
          initialValues={campaignDetails ? {
            title: `${campaignDetails.name || "Campaign"} Landing Page`,
            prompt: prefilledPrompt,
            targetAudience: campaignDetails.targetAudienceDescription || undefined,
            industry: campaignDetails.industry || orgIntelligence?.identity?.industry?.value || undefined,
            additionalContext: prefilledAdditionalContext || undefined,
          } : undefined}
          initialValuesKey={campaignId}
          onGenerate={handleGenerate}
          isGenerating={generateMutation.isPending}
          generateLabel="Generate Landing Page"
          disabled={!organizationId}
          extraFields={
            <div className="space-y-2">
              <Label>CTA Goal</Label>
              <Input
                placeholder="e.g., Book a demo, Sign up for free trial"
                value={ctaGoal}
                onChange={(e) => setCtaGoal(e.target.value)}
                disabled={!organizationId}
              />

              <Label>Thank You Page URL</Label>
              <Input
                placeholder="e.g., /thank-you or https://example.com/thank-you"
                value={thankYouPageUrl}
                onChange={(e) => setThankYouPageUrl(e.target.value)}
                disabled={!organizationId}
              />

              <Label>Asset Download/View URL</Label>
              <Input
                placeholder="e.g., https://example.com/assets/ebook.pdf"
                value={assetUrl || derivedAssetUrl}
                onChange={(e) => setAssetUrl(e.target.value)}
                disabled={!organizationId}
              />
            </div>
          }
        />
      </div>

      {/* Right panel - Preview */}
      <div className="overflow-hidden">
        <ContentPreview
          content={result?.html}
          contentHtml={result?.html}
          contentType="landing_page"
          metadata={result ? { metaTitle: result.metaTitle, metaDescription: result.metaDescription } : undefined}
          projectId={projectId || undefined}
          status={projectId ? "generated" : undefined}
          onPublish={() => setPublishOpen(true)}
          onSaveAsAsset={projectId ? () => saveAsAssetMutation.mutate() : undefined}
        />
      </div>

      {/* Publish Dialog */}
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublish={(data) => publishMutation.mutate(data)}
        isPublishing={publishMutation.isPending}
        title={result?.title || "Landing Page"}
        contentType="landing_page"
      />
    </div>
  );
}
