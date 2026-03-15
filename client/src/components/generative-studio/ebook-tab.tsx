import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";
import ExportDialog from "./shared/export-dialog";
import PublishDialog from "./shared/publish-dialog";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface EbookTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
}

export default function EbookTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
}: EbookTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [chapterCount, setChapterCount] = useState("5");
  const [fullHtml, setFullHtml] = useState("");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/ebook", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });

      // Build preview HTML
      const chapters = data.content?.chapters || [];
      const html = `
        <div style="font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a;">
          <h1 style="font-size: 2.5em; margin-bottom: 10px;">${data.content?.title || ''}</h1>
          ${data.content?.subtitle ? `<p style="font-size: 1.2em; color: #666; margin-bottom: 40px;">${data.content.subtitle}</p>` : ''}

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 40px;">
            <h2 style="margin-top: 0;">Executive Summary</h2>
            <p>${data.content?.executiveSummary || ''}</p>
          </div>

          <div style="background: #f0f4ff; padding: 20px; border-radius: 8px; margin-bottom: 40px;">
            <h2 style="margin-top: 0;">Table of Contents</h2>
            ${chapters.map((ch: any, i: number) => `<p style="margin: 5px 0;"><strong>Chapter ${i + 1}:</strong> ${ch.title}</p>`).join('')}
          </div>

          ${chapters.map((ch: any, i: number) => `
            <div style="margin-bottom: 40px; page-break-before: always;">
              <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">Chapter ${i + 1}: ${ch.title}</h2>
              ${ch.contentHtml || ch.content || ''}
              ${ch.keyTakeaways?.length ? `
                <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin-top: 20px;">
                  <h4 style="margin-top: 0;">Key Takeaways</h4>
                  <ul>${ch.keyTakeaways.map((t: string) => `<li>${t}</li>`).join('')}</ul>
                </div>
              ` : ''}
            </div>
          `).join('')}

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="margin-top: 0;">Conclusion</h2>
            <p>${data.content?.conclusion || ''}</p>
          </div>
        </div>
      `;
      setFullHtml(html);
      toast({ title: "eBook generated!" });
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
      toast({ title: "eBook published!", description: `Available at ${data.url}` });
    },
    onError: (error: any) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerate = (params: Record<string, any>) => {
    generateMutation.mutate({
      ...params,
      chapterCount: parseInt(chapterCount),
      organizationId,
      clientProjectId,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] h-full">
      {/* Left panel - Form */}
      <div className="border-r bg-muted/10 p-5 overflow-auto">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-100 text-rose-600">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-none">eBook</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Multi-chapter eBooks</p>
          </div>
        </div>

        <GenerationForm
          contentType="eBook"
          brandKits={brandKits}
          orgIntelligence={orgIntelligence}
          onGenerate={handleGenerate}
          isGenerating={generateMutation.isPending}
          generateLabel="Generate eBook"
          disabled={!organizationId}
          extraFields={
            <div className="space-y-2">
              <Label>Number of Chapters</Label>
              <Select value={chapterCount} onValueChange={setChapterCount} disabled={!organizationId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Chapters</SelectItem>
                  <SelectItem value="5">5 Chapters</SelectItem>
                  <SelectItem value="7">7 Chapters</SelectItem>
                  <SelectItem value="10">10 Chapters</SelectItem>
                  <SelectItem value="12">12 Chapters</SelectItem>
                  <SelectItem value="15">15 Chapters</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />
      </div>

      {/* Right panel - Preview */}
      <div className="overflow-hidden">
        <ContentPreview
          content={result ? JSON.stringify(result.chapters || [], null, 2) : undefined}
          contentHtml={fullHtml || undefined}
          contentType="ebook"
          metadata={result ? {
            estimatedPageCount: result.estimatedPageCount,
            chapters: result.chapters,
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
        title={result?.title || "eBook"}
        contentType="ebook"
        organizationId={organizationId}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        content={result ? JSON.stringify(result, null, 2) : undefined}
        contentHtml={fullHtml}
        title={result?.title || "eBook"}
        contentType="ebook"
      />
    </div>
  );
}
