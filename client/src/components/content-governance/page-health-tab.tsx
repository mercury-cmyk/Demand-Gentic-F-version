import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, HeartPulse, RefreshCw, Paintbrush, ExternalLink, AlertCircle } from "lucide-react";

interface PageHealthTabProps {
  organizationId: string;
}

interface PageHealth {
  id: string;
  title: string;
  slug: string;
  healthScore: number;
  daysSinceUpdate: number;
  totalMappings: number;
  staleFeatures: { id: string; name: string }[];
  lastUpdated: string;
}

function getHealthColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function getHealthBg(score: number): string {
  if (score >= 80) return "bg-green-50 border-green-200";
  if (score >= 50) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

export default function PageHealthTab({ organizationId }: PageHealthTabProps) {
  const [designDialog, setDesignDialog] = useState<{ pageId: string; pageTitle: string } | null>(null);
  const [designPrompt, setDesignPrompt] = useState("");
  const [refreshDialog, setRefreshDialog] = useState<{ pageId: string; pageTitle: string } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewContext, setPreviewContext] = useState<{ pageId: string; type: "refresh" | "design"; changeDescription: string; designPrompt?: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["content-governance", "health", organizationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/health/${organizationId}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const refreshMutation = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await apiRequest("POST", "/api/content-governance/refresh/generate", {
        publishedPageId: pageId,
        organizationId,
      });
      return res.json();
    },
    onSuccess: (result, pageId) => {
      setPreviewHtml(result.preview.updatedHtml);
      setPreviewContext({
        pageId,
        type: "refresh",
        changeDescription: result.preview.changeDescription,
      });
      setRefreshDialog(null);
    },
  });

  const designMutation = useMutation({
    mutationFn: async ({ pageId, prompt }: { pageId: string; prompt: string }) => {
      const res = await apiRequest("POST", "/api/content-governance/design/improve", {
        publishedPageId: pageId,
        designPrompt: prompt,
        organizationId,
      });
      return res.json();
    },
    onSuccess: (result, { pageId, prompt }) => {
      setPreviewHtml(result.preview.updatedHtml);
      setPreviewContext({
        pageId,
        type: "design",
        changeDescription: result.preview.changeDescription,
        designPrompt: prompt,
      });
      setDesignDialog(null);
      setDesignPrompt("");
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!previewContext || !previewHtml) return;
      const endpoint = previewContext.type === "refresh" ? "/api/content-governance/refresh/apply" : "/api/content-governance/design/apply";
      const res = await apiRequest("POST", endpoint, {
        publishedPageId: previewContext.pageId,
        updatedHtml: previewHtml,
        changeDescription: previewContext.changeDescription,
        designPrompt: previewContext.designPrompt,
      });
      return res.json();
    },
    onSuccess: () => {
      setPreviewHtml(null);
      setPreviewContext(null);
    },
  });

  const pages: PageHealth[] = data?.pages || [];
  const avgScore = data?.averageHealthScore || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calculating page health...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className={`text-2xl font-bold ${getHealthColor(avgScore)}`}>{avgScore}%</div>
            <div className="text-xs text-muted-foreground">Average Health Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold">{pages.length}</div>
            <div className="text-xs text-muted-foreground">Published Pages</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-yellow-600">{pages.filter(p => p.staleFeatures.length > 0).length}</div>
            <div className="text-xs text-muted-foreground">Pages Needing Refresh</div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Panel */}
      {previewHtml && previewContext && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {previewContext.type === "refresh" ? <RefreshCw className="h-4 w-4" /> : <Paintbrush className="h-4 w-4" />}
              {previewContext.type === "refresh" ? "Content Refresh Preview" : "Design Improvement Preview"}
            </CardTitle>
            <CardDescription>{previewContext.changeDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border rounded-lg bg-white overflow-hidden" style={{ height: 300 }}>
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                sandbox="allow-same-origin"
                title="Preview"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setPreviewHtml(null); setPreviewContext(null); }}>Discard</Button>
              <Button size="sm" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                {applyMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Apply Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Page Cards */}
      {pages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <HeartPulse className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No published pages to monitor.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pages.map((page) => (
            <Card key={page.id} className={`${getHealthBg(page.healthScore)}`}>
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm truncate">{page.title}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">/{page.slug}</CardDescription>
                  </div>
                  <div className={`text-lg font-bold ${getHealthColor(page.healthScore)}`}>{page.healthScore}%</div>
                </div>
              </CardHeader>
              <CardContent className="pb-3 space-y-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Updated {page.daysSinceUpdate}d ago</span>
                  <span>{page.totalMappings} features mapped</span>
                </div>
                {page.staleFeatures.length > 0 && (
                  <div className="flex items-start gap-1.5 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 text-yellow-600 mt-0.5 shrink-0" />
                    <span>Stale features: {page.staleFeatures.map(f => f.name).join(", ")}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setRefreshDialog({ pageId: page.id, pageTitle: page.title })}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Refresh Content
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setDesignDialog({ pageId: page.id, pageTitle: page.title })}
                  >
                    <Paintbrush className="h-3 w-3 mr-1" /> Improve Design
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Refresh Confirm Dialog */}
      <Dialog open={!!refreshDialog} onOpenChange={() => setRefreshDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Content Refresh</DialogTitle>
            <DialogDescription>
              AI will analyze "{refreshDialog?.pageTitle}" and update its content to incorporate the latest product features. You'll see a preview before anything goes live.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefreshDialog(null)}>Cancel</Button>
            <Button
              onClick={() => refreshDialog && refreshMutation.mutate(refreshDialog.pageId)}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Generate Refresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Design Improvement Dialog */}
      <Dialog open={!!designDialog} onOpenChange={() => { setDesignDialog(null); setDesignPrompt(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prompt-Based Design Improvement</DialogTitle>
            <DialogDescription>
              Describe how you want to change the visual design of "{designDialog?.pageTitle}". AI will only modify layout, colors, spacing, and styling — content stays the same.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={designPrompt}
            onChange={(e) => setDesignPrompt(e.target.value)}
            placeholder='e.g. "Make it more modern with a gradient hero section, increase whitespace, use larger CTA buttons"'
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDesignDialog(null); setDesignPrompt(""); }}>Cancel</Button>
            <Button
              onClick={() => designDialog && designMutation.mutate({ pageId: designDialog.pageId, prompt: designPrompt })}
              disabled={!designPrompt.trim() || designMutation.isPending}
            >
              {designMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Generate Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
