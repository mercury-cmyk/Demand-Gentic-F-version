/**
 * Prompt Preview Panel Component
 *
 * Shows the exact prompt that will be sent to the model at runtime.
 * Allows selecting a campaign and contact for full variable resolution.
 *
 * Features:
 * - View assembled prompt with layer annotations
 * - Select campaign for full context
 * - Preview variable substitution with sample contact
 * - Copy prompt to clipboard
 * - Export as JSON
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Check,
  RefreshCw,
  Download,
  Eye,
  FileText,
  Layers,
  Building2,
  Target,
  Server,
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  type: string;
}

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

interface AssembledKnowledge {
  blocks: AssembledBlock[];
  totalTokens: number;
  assembledAt: string;
  environment: "local" | "staging" | "production";
  agentId?: string;
  agentName?: string;
  campaignId?: string;
  campaignName?: string;
  promptHash: string;
}

interface PromptPreviewPanelProps {
  agentId: string;
  agentName?: string;
}

export function PromptPreviewPanel({ agentId, agentName }: PromptPreviewPanelProps) {
  const { toast } = useToast();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [viewMode, setViewMode] = useState<"annotated" | "raw">("annotated");

  // Fetch available campaigns
  const { data: campaignsData } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["/api/campaigns"],
  });

  // Fetch effective prompt
  const effectivePromptUrl = selectedCampaignId
    ? `/api/knowledge-blocks/agents/${agentId}/effective-prompt?campaignId=${selectedCampaignId}`
    : `/api/knowledge-blocks/agents/${agentId}/effective-knowledge`;

  const { data, isLoading, error, refetch } = useQuery<{
    success: boolean;
    knowledge: AssembledKnowledge;
  }>({
    queryKey: [effectivePromptUrl],
    enabled: !!agentId,
  });

  const knowledge = data?.knowledge;
  const campaigns = campaignsData?.campaigns || [];

  // Layer icons
  const layerIcons: Record<string, React.ReactNode> = {
    layer_1_universal: <Layers className="h-4 w-4 text-blue-500" />,
    layer_2_organization: <Building2 className="h-4 w-4 text-green-500" />,
    layer_3_campaign: <Target className="h-4 w-4 text-purple-500" />,
  };

  // Copy full prompt to clipboard
  const copyFullPrompt = async () => {
    if (!knowledge) return;
    const fullPrompt = knowledge.blocks.map((b) => b.content).join("\n\n");
    await navigator.clipboard.writeText(fullPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
    toast({
      title: "Copied",
      description: "Full prompt copied to clipboard",
    });
  };

  // Export as JSON
  const exportAsJson = () => {
    if (!knowledge) return;
    const json = JSON.stringify(knowledge, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-${agentId}-prompt-${knowledge.promptHash}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Exported",
      description: "Prompt exported as JSON",
    });
  };

  // Environment badge color
  const envColor: Record<string, string> = {
    local: "bg-yellow-500",
    staging: "bg-blue-500",
    production: "bg-green-500",
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500 mb-2">Failed to load prompt preview</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs mb-1 block">Campaign Context</Label>
          <Select
            value={selectedCampaignId || "none"}
            onValueChange={(v) => setSelectedCampaignId(v === "none" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select campaign for full context" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No campaign (default knowledge only)</SelectItem>
              {campaigns
                .filter((c) => c.type === "call" || c.type === "telemarketing")
                .map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "annotated" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("annotated")}
          >
            Annotated
          </Button>
          <Button
            variant={viewMode === "raw" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("raw")}
          >
            Raw
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={copyFullPrompt}>
            {copiedPrompt ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={exportAsJson}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Metadata bar */}
      {knowledge && (
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <Badge variant="outline" className={`${envColor[knowledge.environment]} text-white`}>
            {knowledge.environment}
          </Badge>
          <span className="text-muted-foreground">
            {knowledge.totalTokens.toLocaleString()} tokens
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">{knowledge.blocks.length} blocks</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground font-mono text-xs">
            Hash: {knowledge.promptHash}
          </span>
          {knowledge.campaignName && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className="text-purple-500">{knowledge.campaignName}</span>
            </>
          )}
        </div>
      )}

      {/* Prompt content */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" />
            {selectedCampaignId ? "Full Effective Prompt" : "Default Knowledge Preview"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            {knowledge && viewMode === "annotated" ? (
              <div className="space-y-1 p-4">
                {knowledge.blocks.map((block, index) => (
                  <div key={block.id || index} className="border-b last:border-b-0 pb-3 mb-3">
                    {/* Block header */}
                    <div className="flex items-center gap-2 mb-2">
                      {layerIcons[block.layer] || <FileText className="h-4 w-4" />}
                      <span className="font-medium text-sm">{block.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {block.tokenEstimate} tokens
                      </Badge>
                      {block.isOverridden && (
                        <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs">
                          Override
                        </Badge>
                      )}
                    </div>
                    {/* Block content */}
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded overflow-x-auto">
                      {block.content}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap p-4">
                {knowledge?.blocks.map((b) => b.content).join("\n\n")}
              </pre>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Footer */}
      {knowledge && (
        <div className="text-xs text-muted-foreground text-right">
          Assembled at: {new Date(knowledge.assembledAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
