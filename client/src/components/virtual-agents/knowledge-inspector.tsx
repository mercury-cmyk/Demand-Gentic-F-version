/**
 * Knowledge Inspector Component
 *
 * Displays the effective runtime knowledge for an agent, showing all
 * knowledge blocks that will be injected into the agent's prompt.
 *
 * Features:
 * - View all knowledge blocks organized by layer
 * - See token counts per block and total
 * - Enable/disable blocks per agent
 * - Edit block content or create overrides
 * - View version history
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  History,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Layers,
  Server,
  Building2,
  Target,
} from "lucide-react";
import { KnowledgeBlockEditor } from "./knowledge-block-editor";

// Types matching server response
interface AssembledBlock {
  id: number;
  name: string;
  slug: string;
  layer: string;
  category: string;
  content: string;
  tokenEstimate: number;
  version: number;
  source: "system" | "organization" | "campaign" | "custom" | "override";
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

interface KnowledgeInspectorProps {
  agentId: string;
  agentName?: string;
  campaignId?: string;
}

export function KnowledgeInspector({ agentId, agentName, campaignId }: KnowledgeInspectorProps) {
  const { toast } = useToast();
  const [expandedLayers, setExpandedLayers] = useState<string[]>(["layer_1_universal"]);
  const [editingBlock, setEditingBlock] = useState<AssembledBlock | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Fetch effective knowledge for the agent
  const url = campaignId
    ? `/api/knowledge-blocks/agents/${agentId}/effective-prompt?campaignId=${campaignId}`
    : `/api/knowledge-blocks/agents/${agentId}/effective-knowledge`;

  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; knowledge: AssembledKnowledge }>({
    queryKey: [url],
    enabled: !!agentId,
  });

  const knowledge = data?.knowledge;

  // Group blocks by layer
  const blocksByLayer = knowledge?.blocks.reduce((acc, block) => {
    if (!acc[block.layer]) acc[block.layer] = [];
    acc[block.layer].push(block);
    return acc;
  }, {} as Record<string, AssembledBlock[]>) || {};

  // Layer metadata
  const layerInfo: Record<string, { name: string; icon: React.ReactNode; description: string }> = {
    layer_1_universal: {
      name: "Universal Knowledge",
      icon: <Layers className="h-4 w-4" />,
      description: "Foundation knowledge for all agents",
    },
    layer_2_organization: {
      name: "Organization Intelligence",
      icon: <Building2 className="h-4 w-4" />,
      description: "Organization-specific context",
    },
    layer_3_campaign: {
      name: "Campaign Context",
      icon: <Target className="h-4 w-4" />,
      description: "Campaign-specific context",
    },
  };

  // Toggle layer expansion
  const toggleLayer = (layer: string) => {
    setExpandedLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]
    );
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

  // Environment badge color
  const envColor = {
    local: "bg-yellow-500",
    staging: "bg-blue-500",
    production: "bg-green-500",
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500 mb-2">Failed to load knowledge blocks</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!knowledge) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>No knowledge blocks configured</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with metadata */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {campaignId ? "Full Effective Prompt" : "Default Knowledge"}
          </h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className={`${envColor[knowledge.environment]} text-white`}>
              {knowledge.environment}
            </Badge>
            <span>{knowledge.totalTokens.toLocaleString()} tokens</span>
            <span>Hash: {knowledge.promptHash}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={copyFullPrompt}>
            {copiedPrompt ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy Full Prompt
          </Button>
        </div>
      </div>

      {/* Knowledge blocks by layer */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-4 pr-4">
          {Object.entries(blocksByLayer).map(([layer, blocks]) => {
            const info = layerInfo[layer] || {
              name: layer,
              icon: <Layers className="h-4 w-4" />,
              description: "",
            };
            const layerTokens = blocks.reduce((sum, b) => sum + b.tokenEstimate, 0);
            const isExpanded = expandedLayers.includes(layer);

            return (
              <Collapsible key={layer} open={isExpanded} onOpenChange={() => toggleLayer(layer)}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          {info.icon}
                          <CardTitle className="text-base">{info.name}</CardTitle>
                          <Badge variant="secondary">{blocks.length} blocks</Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {layerTokens.toLocaleString()} tokens
                        </span>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-2">
                      {blocks.map((block) => (
                        <div
                          key={block.id}
                          className="flex items-start justify-between p-3 rounded-lg border bg-background hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{block.name}</span>
                              {block.isOverridden && (
                                <Badge variant="outline" className="text-orange-500 border-orange-500">
                                  Overridden
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {block.source}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{block.tokenEstimate} tokens</span>
                              <span>v{block.version}</span>
                              <span className="truncate max-w-[300px]">{block.slug}</span>
                            </div>
                            {/* Preview content */}
                            <pre className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded max-h-24 overflow-y-auto whitespace-pre-wrap">
                              {block.content.slice(0, 300)}
                              {block.content.length > 300 && "..."}
                            </pre>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditingBlock(block)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>

      {/* Summary footer */}
      <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
        <span>
          Assembled at: {new Date(knowledge.assembledAt).toLocaleString()}
        </span>
        <span>
          {knowledge.blocks.length} blocks | {knowledge.totalTokens.toLocaleString()} total tokens
        </span>
      </div>

      {/* Block editor modal */}
      {editingBlock && (
        <KnowledgeBlockEditor
          block={editingBlock}
          agentId={agentId}
          isOpen={!!editingBlock}
          onClose={() => setEditingBlock(null)}
          onSaved={() => {
            setEditingBlock(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
