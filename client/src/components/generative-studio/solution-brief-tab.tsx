import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Briefcase } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";
import ExportDialog from "./shared/export-dialog";
import PublishDialog from "./shared/publish-dialog";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface SolutionBriefTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
}

export default function SolutionBriefTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
}: SolutionBriefTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [problemStatement, setProblemStatement] = useState("");
  const [fullHtml, setFullHtml] = useState("");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/solution-brief", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });

      // Build preview HTML
      const sections = data.content?.sections || [];
      const metrics = data.content?.keyMetrics || [];
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a;">
          <h1 style="font-size: 2em; color: #0f172a; margin-bottom: 20px;">${data.content?.title || ''}</h1>

          <div style="background: linear-gradient(135deg, #eff6ff, #f0f9ff); padding: 24px; border-radius: 12px; margin-bottom: 32px; border-left: 4px solid #2563eb;">
            <h2 style="margin-top: 0; color: #1e40af; font-size: 1.2em;">Executive Summary</h2>
            <p style="line-height: 1.7; color: #334155;">${data.content?.executiveSummary || ''}</p>
          </div>

          ${metrics.length > 0 ? `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
              ${metrics.map((m: any) => `
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                  <p style="font-size: 1.8em; font-weight: 700; color: #2563eb; margin: 0;">${m.value}</p>
                  <p style="font-weight: 600; margin: 4px 0; color: #0f172a;">${m.label}</p>
                  <p style="font-size: 0.85em; color: #64748b; margin: 0;">${m.description || ''}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${sections.map((s: any) => `
            <div style="margin-bottom: 32px;">
              <h2 style="color: #0f172a; font-size: 1.4em; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">${s.heading}</h2>
              <div style="line-height: 1.7; color: #334155;">${s.contentHtml || s.content || ''}</div>
            </div>
          `).join('')}

          ${data.content?.callToAction ? `
            <div style="background: #2563eb; color: white; padding: 24px; border-radius: 12px; text-align: center; margin-top: 40px;">
              <p style="font-size: 1.2em; font-weight: 600; margin: 0;">${data.content.callToAction}</p>
            </div>
          ` : ''}
        </div>
      `;
      setFullHtml(html);
      toast({ title: "Solution brief generated!" });
    },
    onError: (error: any) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
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
      toast({ title: "Solution brief published!", description: `Available at ${data.url}` });
    },
    onError: (error: any) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerate = (params: Record<string, any>) => {
    generateMutation.mutate({
      ...params,
      problemStatement: problemStatement || undefined,
      organizationId,
      clientProjectId,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] h-full">
      {/* Left panel - Form */}
      <div className="border-r bg-muted/10 p-5 overflow-auto">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-100 text-teal-600">
            <Briefcase className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-none">Solution Brief</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Professional solution briefs</p>
          </div>
        </div>

        <GenerationForm
          contentType="Solution Brief"
          brandKits={brandKits}
          orgIntelligence={orgIntelligence}
          onGenerate={handleGenerate}
          isGenerating={generateMutation.isPending}
          generateLabel="Generate Solution Brief"
          disabled={!organizationId}
          extraFields={
            <div className="space-y-2">
              <Label>Problem Statement</Label>
              <Textarea
                placeholder="Describe the business problem or challenge this solution addresses..."
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
                rows={3}
                disabled={!organizationId}
              />
            </div>
          }
        />
      </div>

      {/* Right panel - Preview */}
      <div className="overflow-hidden">
        <ContentPreview
          content={result ? JSON.stringify(result.sections || [], null, 2) : undefined}
          contentHtml={fullHtml || undefined}
          contentType="solution_brief"
          metadata={result ? {
            sections: result.sections,
          } : undefined}
          projectId={projectId || undefined}
          status={projectId ? "generated" : undefined}
          onPublish={projectId ? () => setPublishOpen(true) : undefined}
          onExport={() => setExportOpen(true)}
          onSaveAsAsset={projectId ? () => saveAsAssetMutation.mutate() : undefined}
        />
      </div>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublish={(data) => publishMutation.mutate(data)}
        isPublishing={publishMutation.isPending}
        title={result?.title || "Solution Brief"}
        contentType="solution_brief"
        organizationId={organizationId}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        content={result ? JSON.stringify(result, null, 2) : undefined}
        contentHtml={fullHtml}
        title={result?.title || "Solution Brief"}
        contentType="solution_brief"
      />
    </div>
  );
}
