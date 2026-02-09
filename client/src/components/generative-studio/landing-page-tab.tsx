import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
}

export default function LandingPageTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
}: LandingPageTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [ctaGoal, setCtaGoal] = useState("");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/landing-page", data);
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
      organizationId,
      clientProjectId,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] h-full">
      {/* Left panel - Form */}
      <div className="border-r p-6 overflow-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Landing Page</h2>
            <p className="text-xs text-muted-foreground">Generate and publish landing pages</p>
          </div>
        </div>

        <GenerationForm
          contentType="Landing Page"
          brandKits={brandKits}
          orgIntelligence={orgIntelligence}
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
