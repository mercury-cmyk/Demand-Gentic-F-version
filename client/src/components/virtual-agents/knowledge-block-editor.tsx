/**
 * Knowledge Block Editor Component
 *
 * Modal for viewing and editing individual knowledge blocks.
 * Supports creating agent-specific overrides without modifying the base block.
 *
 * Features:
 * - View/edit block content
 * - Create agent-specific overrides
 * - View version history
 * - Restore previous versions
 * - Token count estimation
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Save,
  RotateCcw,
  History,
  AlertTriangle,
  FileText,
  Clock,
  User,
} from "lucide-react";
import { format } from "date-fns";

interface AssembledBlock {
  id: number;
  name: string;
  slug: string;
  layer: string;
  category: string;
  content: string;
  tokenEstimate: number;
  version: number;
  source: string;
  isOverridden: boolean;
}

interface BlockVersion {
  id: number;
  blockId: number;
  version: number;
  content: string;
  tokenEstimate: number;
  changeReason: string | null;
  changedBy: string | null;
  createdAt: string;
}

interface KnowledgeBlockEditorProps {
  block: AssembledBlock;
  agentId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// Simple token estimation (4 chars per token average)
function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).length;
  const chars = text.length;
  return Math.ceil(words * 0.75 + chars / 16);
}

export function KnowledgeBlockEditor({
  block,
  agentId,
  isOpen,
  onClose,
  onSaved,
}: KnowledgeBlockEditorProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"edit" | "history">("edit");
  const [content, setContent] = useState(block.content);
  const [changeReason, setChangeReason] = useState("");
  const [createOverride, setCreateOverride] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Reset state when block changes
  useEffect(() => {
    setContent(block.content);
    setChangeReason("");
    setCreateOverride(false);
    setIsDirty(false);
  }, [block]);

  // Calculate current token estimate
  const currentTokens = estimateTokens(content);
  const tokenDelta = currentTokens - block.tokenEstimate;

  // Fetch version history
  const { data: historyData, isLoading: historyLoading } = useQuery<{
    success: boolean;
    history: BlockVersion[];
  }>({
    queryKey: [`/api/knowledge-blocks/${block.id}/history`],
    enabled: isOpen && block.id > 0 && activeTab === "history",
  });

  // Update block mutation
  const updateBlockMutation = useMutation({
    mutationFn: async () => {
      const url = createOverride && agentId
        ? `/api/knowledge-blocks/agents/${agentId}/config/${block.id}`
        : `/api/knowledge-blocks/${block.id}`;

      const body = createOverride && agentId
        ? { overrideContent: content }
        : { content, changeReason: changeReason || "Content updated" };

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Saved",
        description: createOverride
          ? "Agent override created successfully"
          : "Knowledge block updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["knowledge-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["agent-knowledge"] });
      onSaved();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save changes",
        variant: "destructive",
      });
    },
  });

  // Restore version mutation
  const restoreVersionMutation = useMutation({
    mutationFn: async (version: number) => {
      const response = await fetch(`/api/knowledge-blocks/${block.id}/restore/${version}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Restored",
        description: "Block restored to previous version",
      });
      queryClient.invalidateQueries({ queryKey: ["knowledge-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-block-history"] });
      queryClient.invalidateQueries({ queryKey: ["agent-knowledge"] });
      onSaved();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore version",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateBlockMutation.mutate();
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setIsDirty(newContent !== block.content);
  };

  // Is this a virtual/system block that can't be edited directly?
  const isVirtualBlock = block.id < 0;
  const isSystemBlock = block.source === "system";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {block.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Badge variant="outline">{block.category}</Badge>
            <Badge variant="secondary">{block.layer.replace("layer_", "Layer ").replace("_", " ")}</Badge>
            <span>v{block.version}</span>
            {block.isOverridden && (
              <Badge variant="outline" className="text-orange-500 border-orange-500">
                Overridden
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "history")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="edit">Edit Content</TabsTrigger>
            <TabsTrigger value="history" disabled={isVirtualBlock}>
              <History className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="flex-1 flex flex-col min-h-0 mt-4">
            <div className="flex-1 min-h-0 space-y-4">
              {/* Warning for system blocks */}
              {isSystemBlock && !createOverride && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-500">System Block</p>
                    <p className="text-muted-foreground">
                      Changes to this block will affect all agents. Consider creating an
                      agent-specific override instead.
                    </p>
                  </div>
                </div>
              )}

              {/* Agent override option */}
              {agentId && !isVirtualBlock && (
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label>Create agent-specific override</Label>
                    <p className="text-xs text-muted-foreground">
                      Override this block for this agent only, without modifying the base content.
                    </p>
                  </div>
                  <Switch
                    checked={createOverride}
                    onCheckedChange={setCreateOverride}
                  />
                </div>
              )}

              {/* Content editor */}
              <div className="flex-1 min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <Label>Content</Label>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{currentTokens.toLocaleString()} tokens</span>
                    {tokenDelta !== 0 && (
                      <span className={tokenDelta > 0 ? "text-orange-500" : "text-green-500"}>
                        ({tokenDelta > 0 ? "+" : ""}{tokenDelta})
                      </span>
                    )}
                  </div>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  className="font-mono text-sm h-[300px] resize-none"
                  placeholder="Enter knowledge block content..."
                  disabled={isVirtualBlock}
                />
              </div>

              {/* Change reason */}
              {!createOverride && !isVirtualBlock && (
                <div>
                  <Label>Change Reason</Label>
                  <Input
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="Brief description of changes (optional)"
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-[400px]">
              {historyLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : historyData?.history && historyData.history.length > 0 ? (
                <div className="space-y-2 pr-4">
                  {historyData.history.map((version) => (
                    <div
                      key={version.id}
                      className="p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={version.version === block.version ? "default" : "outline"}>
                            v{version.version}
                          </Badge>
                          {version.version === block.version && (
                            <span className="text-xs text-muted-foreground">(current)</span>
                          )}
                        </div>
                        {version.version !== block.version && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => restoreVersionMutation.mutate(version.version)}
                            disabled={restoreVersionMutation.isPending}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Restore
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(version.createdAt), "MMM d, yyyy h:mm a")}
                        </span>
                        {version.changedBy && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {version.changedBy}
                          </span>
                        )}
                        <span>{version.tokenEstimate} tokens</span>
                      </div>
                      {version.changeReason && (
                        <p className="text-sm mt-2 text-muted-foreground">
                          {version.changeReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No version history available
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || updateBlockMutation.isPending || isVirtualBlock}
          >
            {updateBlockMutation.isPending ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {createOverride ? "Create Override" : "Save Changes"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
