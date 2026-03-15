import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, History, RotateCcw, Eye, Paintbrush, RefreshCw, ArrowUpDown } from "lucide-react";

interface VersionHistoryTabProps {
  organizationId: string;
}

interface PageVersion {
  id: string;
  publishedPageId: string;
  versionNumber: number;
  htmlContent: string;
  cssContent: string | null;
  changeDescription: string | null;
  changeTrigger: string;
  designPrompt: string | null;
  createdBy: string | null;
  createdAt: string;
}

const TRIGGER_BADGES: Record<string, { color: string; icon: any; label: string }> = {
  manual: { color: "bg-gray-100 text-gray-700", icon: ArrowUpDown, label: "Manual" },
  ai_refresh: { color: "bg-blue-100 text-blue-700", icon: RefreshCw, label: "AI Refresh" },
  design_update: { color: "bg-purple-100 text-purple-700", icon: Paintbrush, label: "Design Update" },
  rollback: { color: "bg-yellow-100 text-yellow-700", icon: RotateCcw, label: "Rollback" },
};

export default function VersionHistoryTab({ organizationId }: VersionHistoryTabProps) {
  const queryClient = useQueryClient();
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [previewVersion, setPreviewVersion] = useState<PageVersion | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState<PageVersion | null>(null);

  const { data: healthData } = useQuery({
    queryKey: ["content-governance", "health", organizationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/health/${organizationId}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: ["content-governance", "versions", selectedPageId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/versions/${selectedPageId}`);
      return res.json();
    },
    enabled: !!selectedPageId,
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ pageId, versionId }: { pageId: string; versionId: string }) => {
      const res = await apiRequest("POST", `/api/content-governance/versions/${pageId}/rollback/${versionId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-governance", "versions"] });
      queryClient.invalidateQueries({ queryKey: ["content-governance", "health"] });
      setRollbackConfirm(null);
    },
  });

  const pages = healthData?.pages || [];
  const versions: PageVersion[] = versionsData?.versions || [];

  return (
    <div className="space-y-4">
      {/* Page Selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedPageId} onValueChange={setSelectedPageId}>
          <SelectTrigger className="w-[350px]">
            <SelectValue placeholder="Select a published page..." />
          </SelectTrigger>
          <SelectContent>
            {pages.map((page: any) => (
              <SelectItem key={page.id} value={page.id}>
                {page.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedPageId && (
          <span className="text-xs text-muted-foreground">{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {!selectedPageId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">Select a page to view its version history.</p>
          </CardContent>
        </Card>
      ) : versionsLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading versions...
        </div>
      ) : versions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No version history for this page yet.</p>
            <p className="text-xs mt-1">Versions are created automatically when pages are republished, refreshed, or have design updates applied.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {versions.map((version) => {
            const trigger = TRIGGER_BADGES[version.changeTrigger] || TRIGGER_BADGES.manual;
            const TriggerIcon = trigger.icon;

            return (
              <Card key={version.id}>
                <CardContent className="pt-3 pb-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Version {version.versionNumber}</span>
                        <Badge className={`text-[10px] ${trigger.color}`}>
                          <TriggerIcon className="h-2.5 w-2.5 mr-0.5" />
                          {trigger.label}
                        </Badge>
                      </div>
                      {version.changeDescription && (
                        <p className="text-xs text-muted-foreground mt-1">{version.changeDescription}</p>
                      )}
                      {version.designPrompt && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">Prompt: "{version.designPrompt}"</p>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(version.createdAt).toLocaleDateString()} {new Date(version.createdAt).toLocaleTimeString()}
                        {version.createdBy && ` by ${version.createdBy}`}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setPreviewVersion(version)}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setRollbackConfirm(version)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Rollback
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewVersion} onOpenChange={() => setPreviewVersion(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version {previewVersion?.versionNumber} Preview</DialogTitle>
            <DialogDescription>{previewVersion?.changeDescription}</DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg bg-white overflow-hidden" style={{ height: 500 }}>
            <iframe
              srcDoc={previewVersion?.htmlContent || ""}
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
              title="Version Preview"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Rollback Confirm Dialog */}
      <Dialog open={!!rollbackConfirm} onOpenChange={() => setRollbackConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rollback</DialogTitle>
            <DialogDescription>
              This will restore the page to Version {rollbackConfirm?.versionNumber}. The current page content will be saved as a new version before the rollback is applied.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rollbackConfirm && rollbackMutation.mutate({ pageId: rollbackConfirm.publishedPageId, versionId: rollbackConfirm.id })}
              disabled={rollbackMutation.isPending}
            >
              {rollbackMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Rollback to Version {rollbackConfirm?.versionNumber}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
