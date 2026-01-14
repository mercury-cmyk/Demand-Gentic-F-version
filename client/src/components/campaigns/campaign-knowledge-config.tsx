/**
 * Campaign Knowledge Configuration Component
 *
 * Allows configuring which knowledge blocks are active for a campaign
 * and setting provider-specific overrides (OpenAI vs Gemini).
 *
 * Features:
 * - Enable/disable knowledge blocks per campaign
 * - Set campaign-specific content overrides
 * - Set provider-specific overrides (OpenAI vs Google/Gemini)
 * - Preview assembled prompts per provider
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Layers,
  Building2,
  Target,
  ChevronDown,
  ChevronRight,
  Eye,
  Save,
  RefreshCw,
  Copy,
  Check,
  FileText,
  Settings,
  Play,
} from "lucide-react";
import { RuntimePromptViewer } from "./runtime-prompt-viewer";

interface KnowledgeBlock {
  id: number;
  name: string;
  slug: string;
  layer: string;
  category: string;
  content: string;
  tokenEstimate: number;
  version: number;
  isActive: boolean;
}

interface CampaignKnowledgeConfig {
  blockId: number;
  isEnabled: boolean;
  overrideContent: string | null;
  openaiOverride: string | null;
  googleOverride: string | null;
  priority: number;
}

interface BlockWithConfig {
  block: KnowledgeBlock;
  config: CampaignKnowledgeConfig | null;
}

interface AssembledPrompt {
  prompt: string;
  totalTokens: number;
  provider: "openai" | "google";
  source: "blocks" | "legacy";
  assembledAt: string;
  promptHash: string;
}

interface CampaignKnowledgeConfigProps {
  campaignId: string;
}

export function CampaignKnowledgeConfig({ campaignId }: CampaignKnowledgeConfigProps) {
  const { toast } = useToast();
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());
  const [editedConfigs, setEditedConfigs] = useState<Map<number, Partial<CampaignKnowledgeConfig>>>(new Map());
  const [previewProvider, setPreviewProvider] = useState<"openai" | "google">("openai");
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Fetch all knowledge blocks
  const { data: blocksData, isLoading: blocksLoading } = useQuery<{ success: boolean; blocks: KnowledgeBlock[] }>({
    queryKey: ["/api/knowledge-blocks"],
  });

  // Fetch campaign-specific configurations
  const { data: configsData, isLoading: configsLoading } = useQuery<{
    success: boolean;
    configs: { config: CampaignKnowledgeConfig; block: KnowledgeBlock }[];
  }>({
    queryKey: [`/api/knowledge-blocks/campaigns/${campaignId}/config`],
    enabled: !!campaignId,
  });

  // Fetch assembled prompt preview
  const { data: previewData, isLoading: previewLoading, refetch: refetchPreview } = useQuery<{
    success: boolean;
    assembled: AssembledPrompt;
  }>({
    queryKey: [`/api/knowledge-blocks/campaigns/${campaignId}/preview-prompt?provider=${previewProvider}`],
    enabled: !!campaignId,
  });

  // Save configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async ({ blockId, config }: { blockId: number; config: Partial<CampaignKnowledgeConfig> }) => {
      const response = await fetch(`/api/knowledge-blocks/campaigns/${campaignId}/config/${blockId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify(config),
        credentials: "include",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Knowledge block configuration updated" });
      queryClient.invalidateQueries({ queryKey: [`/api/knowledge-blocks/campaigns/${campaignId}/config`] });
      queryClient.invalidateQueries({ queryKey: [`/api/knowledge-blocks/campaigns/${campaignId}/preview-prompt`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  const blocks = blocksData?.blocks || [];
  const configsMap = new Map<number, CampaignKnowledgeConfig>();
  configsData?.configs?.forEach((c) => {
    configsMap.set(c.config.blockId, c.config);
  });

  // Group blocks by layer
  const blocksByLayer = blocks.reduce((acc, block) => {
    if (!acc[block.layer]) acc[block.layer] = [];
    acc[block.layer].push(block);
    return acc;
  }, {} as Record<string, KnowledgeBlock[]>);

  // Layer icons and labels
  const layerInfo: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    layer_1_universal: {
      icon: <Layers className="h-4 w-4" />,
      label: "Universal Knowledge",
      color: "text-blue-500",
    },
    layer_2_organization: {
      icon: <Building2 className="h-4 w-4" />,
      label: "Organization Context",
      color: "text-green-500",
    },
    layer_3_campaign: {
      icon: <Target className="h-4 w-4" />,
      label: "Campaign Context",
      color: "text-purple-500",
    },
  };

  const toggleBlock = (blockId: number) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const getBlockConfig = (blockId: number): Partial<CampaignKnowledgeConfig> => {
    const edited = editedConfigs.get(blockId);
    const saved = configsMap.get(blockId);
    return {
      isEnabled: edited?.isEnabled ?? saved?.isEnabled ?? true,
      overrideContent: edited?.overrideContent ?? saved?.overrideContent ?? null,
      openaiOverride: edited?.openaiOverride ?? saved?.openaiOverride ?? null,
      googleOverride: edited?.googleOverride ?? saved?.googleOverride ?? null,
    };
  };

  const updateBlockConfig = (blockId: number, updates: Partial<CampaignKnowledgeConfig>) => {
    setEditedConfigs((prev) => {
      const next = new Map(prev);
      const existing = next.get(blockId) || {};
      next.set(blockId, { ...existing, ...updates });
      return next;
    });
  };

  const saveBlockConfig = (blockId: number) => {
    const config = getBlockConfig(blockId);
    saveConfigMutation.mutate({ blockId, config });
    // Clear edited state after save
    setEditedConfigs((prev) => {
      const next = new Map(prev);
      next.delete(blockId);
      return next;
    });
  };

  const copyPrompt = async () => {
    if (!previewData?.assembled?.prompt) return;
    await navigator.clipboard.writeText(previewData.assembled.prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
    toast({ title: "Copied", description: "Prompt copied to clipboard" });
  };

  if (blocksLoading || configsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Knowledge Blocks Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Knowledge Blocks
          </CardTitle>
          <CardDescription>
            Configure which knowledge blocks are active for this campaign and set provider-specific overrides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {Object.entries(layerInfo).map(([layer, info]) => {
                const layerBlocks = blocksByLayer[layer] || [];
                if (layerBlocks.length === 0) return null;

                return (
                  <div key={layer} className="space-y-2">
                    <h3 className={`font-medium flex items-center gap-2 ${info.color}`}>
                      {info.icon}
                      {info.label}
                    </h3>
                    <div className="space-y-2 ml-6">
                      {layerBlocks.map((block) => {
                        const config = getBlockConfig(block.id);
                        const isExpanded = expandedBlocks.has(block.id);
                        const hasEdits = editedConfigs.has(block.id);

                        return (
                          <Collapsible key={block.id} open={isExpanded}>
                            <div className="border rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <CollapsibleTrigger
                                  className="flex items-center gap-2 flex-1 text-left"
                                  onClick={() => toggleBlock(block.id)}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                  <span className="font-medium">{block.name}</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {block.tokenEstimate} tokens
                                  </Badge>
                                  {hasEdits && (
                                    <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs">
                                      Unsaved
                                    </Badge>
                                  )}
                                </CollapsibleTrigger>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={config.isEnabled}
                                    onCheckedChange={(checked) =>
                                      updateBlockConfig(block.id, { isEnabled: checked })
                                    }
                                  />
                                  {hasEdits && (
                                    <Button
                                      size="sm"
                                      onClick={() => saveBlockConfig(block.id)}
                                      disabled={saveConfigMutation.isPending}
                                    >
                                      <Save className="h-3 w-3 mr-1" />
                                      Save
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <CollapsibleContent className="mt-4 space-y-4">
                                {/* Base Content Override */}
                                <div>
                                  <Label className="text-sm">Content Override (applies to all providers)</Label>
                                  <Textarea
                                    value={config.overrideContent || ""}
                                    onChange={(e) =>
                                      updateBlockConfig(block.id, {
                                        overrideContent: e.target.value || null,
                                      })
                                    }
                                    placeholder={block.content.slice(0, 200) + "..."}
                                    className="mt-1 font-mono text-xs h-24"
                                  />
                                </div>

                                {/* Provider-Specific Overrides */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-sm text-blue-600">OpenAI Override</Label>
                                    <Textarea
                                      value={config.openaiOverride || ""}
                                      onChange={(e) =>
                                        updateBlockConfig(block.id, {
                                          openaiOverride: e.target.value || null,
                                        })
                                      }
                                      placeholder="OpenAI-specific content (uses markdown formatting)"
                                      className="mt-1 font-mono text-xs h-20"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-sm text-green-600">Google/Gemini Override</Label>
                                    <Textarea
                                      value={config.googleOverride || ""}
                                      onChange={(e) =>
                                        updateBlockConfig(block.id, {
                                          googleOverride: e.target.value || null,
                                        })
                                      }
                                      placeholder="Gemini-specific content (uses XML-like tags)"
                                      className="mt-1 font-mono text-xs h-20"
                                    />
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Prompt Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Prompt Preview
          </CardTitle>
          <CardDescription>
            Preview the assembled prompt for each voice provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Tabs value={previewProvider} onValueChange={(v) => setPreviewProvider(v as "openai" | "google")}>
                <TabsList>
                  <TabsTrigger value="openai">OpenAI</TabsTrigger>
                  <TabsTrigger value="google">Google/Gemini</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => refetchPreview()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={copyPrompt}>
                  {copiedPrompt ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {previewData?.assembled && (
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="outline">
                  {previewData.assembled.source === "blocks" ? "Knowledge Blocks" : "Legacy"}
                </Badge>
                <span className="text-muted-foreground">
                  {previewData.assembled.totalTokens.toLocaleString()} tokens
                </span>
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground font-mono text-xs">
                  Hash: {previewData.assembled.promptHash}
                </span>
              </div>
            )}

            <ScrollArea className="h-[300px] border rounded-lg">
              {previewLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap p-4">
                  {previewData?.assembled?.prompt || "No prompt available"}
                </pre>
              )}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Runtime Prompt Viewer - Shows exact prompt per account/contact */}
      <RuntimePromptViewer campaignId={campaignId} />
    </div>
  );
}
