import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, X } from "lucide-react";
import GenerationForm from "./shared/generation-form";
import ContentPreview from "./shared/content-preview";
import PublishDialog from "./shared/publish-dialog";
import ExportDialog from "./shared/export-dialog";

import type { OrgIntelligenceProfile } from "@/pages/generative-studio";

interface BlogPostTabProps {
  brandKits?: any[];
  orgIntelligence?: OrgIntelligenceProfile | null;
  organizationId?: string;
  clientProjectId?: string;
}

export default function BlogPostTab({
  brandKits,
  orgIntelligence,
  organizationId,
  clientProjectId,
}: BlogPostTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [targetLength, setTargetLength] = useState("medium");
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/generative-studio/generate/blog-post", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setResult(data.content);
      setProjectId(data.projectId);
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });
      toast({ title: "Blog post generated!" });
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
      toast({ title: "Blog post published!", description: `Available at ${data.url}` });
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
      keywords: keywords.length > 0 ? keywords : undefined,
      targetLength: targetLength || undefined,
      organizationId,
      clientProjectId,
    });
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] h-full">
      {/* Left panel - Form */}
      <div className="border-r bg-muted/10 p-5 overflow-auto">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-100 text-orange-600">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-none">Blog Post</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">SEO-optimized blog posts</p>
          </div>
        </div>

        <GenerationForm
          contentType="Blog Post"
          brandKits={brandKits}
          orgIntelligence={orgIntelligence}
          onGenerate={handleGenerate}
          isGenerating={generateMutation.isPending}
          generateLabel="Generate Blog Post"
          disabled={!organizationId}
          extraFields={
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Target Length</Label>
                <Select value={targetLength} onValueChange={setTargetLength} disabled={!organizationId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (800-1,200 words)</SelectItem>
                    <SelectItem value="medium">Medium (1,500-2,500 words)</SelectItem>
                    <SelectItem value="long">Long (3,000-5,000 words)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>SEO Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add keyword..."
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                    disabled={!organizationId}
                  />
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {keywords.map((kw) => (
                      <Badge key={kw} variant="secondary" className="gap-1">
                        {kw}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => setKeywords(keywords.filter((k) => k !== kw))}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          }
        />
      </div>

      {/* Right panel - Preview */}
      <div className="overflow-hidden">
        <ContentPreview
          content={result?.content}
          contentHtml={result?.contentHtml}
          contentType="blog_post"
          metadata={result ? {
            seoTitle: result.seoTitle,
            seoDescription: result.seoDescription,
            estimatedReadTime: result.estimatedReadTime,
          } : undefined}
          projectId={projectId || undefined}
          status={projectId ? "generated" : undefined}
          onPublish={() => setPublishOpen(true)}
          onExport={() => setExportOpen(true)}
          onSaveAsAsset={projectId ? () => saveAsAssetMutation.mutate() : undefined}
        />
      </div>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublish={(data) => publishMutation.mutate(data)}
        isPublishing={publishMutation.isPending}
        title={result?.title || "Blog Post"}
        contentType="blog_post"
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        content={result?.content}
        contentHtml={result?.contentHtml}
        title={result?.title || "Blog Post"}
        contentType="blog_post"
      />
    </div>
  );
}
