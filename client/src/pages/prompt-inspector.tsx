/**
 * Prompt Inspector Page
 * 
 * Unified view of ALL knowledge layers being injected into AI prompts.
 * Shows exactly what the AI agent receives at runtime.
 * 
 * Layers displayed:
 * - Layer 1: Universal Knowledge (Voice Control, Compliance)
 * - Layer 2: Organization Knowledge (Org defaults, standards)
 * - Layer 3.5: Call Flow (Deterministic orchestration)
 * - Layer 3: Campaign Context (Campaign-specific instructions)
 * 
 * Features:
 * - Select campaign to preview full assembled prompt
 * - View each layer's contribution separately
 * - Copy full prompt or individual sections
 * - Token estimation per layer
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Layers,
  Building2,
  Target,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Eye,
  Shield,
  RefreshCw,
  FileText,
  Hash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Types
interface KnowledgeBlock {
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
  blocks: KnowledgeBlock[];
  totalTokens: number;
  assembledAt: string;
  environment: string;
  agentId?: string;
  agentName?: string;
  campaignId?: string;
  campaignName?: string;
  promptHash: string;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface UnifiedKnowledge {
  sections: {
    id: string;
    category: string;
    title: string;
    content: string;
    priority: number;
    isActive: boolean;
  }[];
  version: number;
  updatedAt: string;
}

// Layer configuration
const LAYER_INFO = {
  layer_1_universal: {
    icon: Shield,
    label: "Layer 1: Universal (Voice Control)",
    description: "Core compliance, safety rules, and voice control parameters",
    color: "bg-blue-500/10 text-blue-700 border-blue-200",
    badgeColor: "bg-blue-100 text-blue-800",
  },
  layer_2_organization: {
    icon: Building2,
    label: "Layer 2: Organization Knowledge",
    description: "Org-level defaults, standards, and customizations",
    color: "bg-green-500/10 text-green-700 border-green-200",
    badgeColor: "bg-green-100 text-green-800",
  },
  layer_3_campaign: {
    icon: Target,
    label: "Layer 3: Campaign Context",
    description: "Campaign-specific instructions, scripts, and context",
    color: "bg-purple-500/10 text-purple-700 border-purple-200",
    badgeColor: "bg-purple-100 text-purple-800",
  },
};

export default function PromptInspectorPage() {
  const { toast } = useToast();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set(Object.keys(LAYER_INFO)));
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Fetch campaigns for selector
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/campaigns?status=active,paused&type=telemarketing");
      return res.json();
    },
  });

  // Fetch knowledge blocks
  const { data: blocksData, isLoading: blocksLoading } = useQuery<{ success: boolean; blocks: KnowledgeBlock[] }>({
    queryKey: ["/api/knowledge-blocks"],
  });

  // Fetch unified knowledge hub (Layer 2)
  const { data: unifiedKnowledge, isLoading: knowledgeLoading } = useQuery<UnifiedKnowledge>({
    queryKey: ["/api/knowledge-hub"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/knowledge-hub");
      return res.json();
    },
  });

  // Fetch campaign-specific assembled prompt when campaign selected
  const { data: assembledPrompt, isLoading: assembledLoading, refetch: refetchAssembled } = useQuery<{
    success: boolean;
    assembled: {
      prompt: string;
      totalTokens: number;
      provider: string;
      source: string;
      assembledAt: string;
      promptHash: string;
    };
  }>({
    queryKey: [`/api/knowledge-blocks/campaigns/${selectedCampaignId}/preview-prompt?provider=openai`],
    enabled: !!selectedCampaignId,
  });

  const campaigns = campaignsData?.campaigns || [];
  const blocks = blocksData?.blocks || [];

  // Group blocks by layer
  const blocksByLayer = blocks.reduce((acc, block) => {
    if (!acc[block.layer]) acc[block.layer] = [];
    acc[block.layer].push(block);
    return acc;
  }, {} as Record<string, KnowledgeBlock[]>);

  // Calculate tokens per layer
  const tokensByLayer = Object.entries(blocksByLayer).reduce((acc, [layer, layerBlocks]) => {
    acc[layer] = layerBlocks.reduce((sum, b) => sum + (b.tokenEstimate || 0), 0);
    return acc;
  }, {} as Record<string, number>);

  const toggleLayer = (layer: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string, sectionId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(sectionId);
      setTimeout(() => setCopiedSection(null), 2000);
      toast({ title: "Copied", description: "Content copied to clipboard" });
    } catch (err) {
      toast({ title: "Failed", description: "Could not copy to clipboard", variant: "destructive" });
    }
  };

  const copyFullPrompt = async () => {
    if (!assembledPrompt?.assembled?.prompt) return;
    await copyToClipboard(assembledPrompt.assembled.prompt, "full");
  };

  const isLoading = blocksLoading || knowledgeLoading;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="h-6 w-6" />
            Prompt Inspector
          </h1>
          <p className="text-muted-foreground mt-1">
            View all knowledge layers being injected into AI agent prompts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a campaign to preview..." />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCampaignId && (
            <Button variant="outline" size="sm" onClick={() => refetchAssembled()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Layer Hierarchy Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Knowledge Layer Hierarchy</CardTitle>
          <CardDescription>
            Higher layers override lower layers. Layer 1 is most authoritative.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            {Object.entries(LAYER_INFO).map(([key, info], index) => {
              const Icon = info.icon;
              const tokens = tokensByLayer[key] || 0;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${info.color}`}>
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{info.label.split(":")[0]}</span>
                    {tokens > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        ~{tokens} tokens
                      </Badge>
                    )}
                  </div>
                  {index < Object.keys(LAYER_INFO).length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs: By Layer / Full Prompt */}
      <Tabs defaultValue="layers" className="w-full">
        <TabsList>
          <TabsTrigger value="layers" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            View by Layer
          </TabsTrigger>
          <TabsTrigger value="full" className="flex items-center gap-2" disabled={!selectedCampaignId}>
            <FileText className="h-4 w-4" />
            Full Assembled Prompt
          </TabsTrigger>
        </TabsList>

        {/* By Layer View */}
        <TabsContent value="layers" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : (
            Object.entries(LAYER_INFO).map(([layerKey, layerInfo]) => {
              const Icon = layerInfo.icon;
              const layerBlocks = blocksByLayer[layerKey] || [];
              const isExpanded = expandedLayers.has(layerKey);
              const totalTokens = layerBlocks.reduce((sum, b) => sum + (b.tokenEstimate || 0), 0);

              return (
                <Card key={layerKey} className={`border-2 ${layerInfo.color.split(" ")[0]}`}>
                  <Collapsible open={isExpanded} onOpenChange={() => toggleLayer(layerKey)}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                            <Icon className="h-5 w-5" />
                            <div>
                              <CardTitle className="text-base">{layerInfo.label}</CardTitle>
                              <CardDescription className="text-sm">
                                {layerInfo.description}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={layerInfo.badgeColor}>
                              {layerBlocks.length} blocks
                            </Badge>
                            <Badge variant="secondary">
                              ~{totalTokens} tokens
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-3">
                        {layerBlocks.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">
                            No blocks configured for this layer
                          </p>
                        ) : (
                          layerBlocks.map((block) => (
                            <div
                              key={block.id}
                              className="border rounded-lg p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{block.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {block.category}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    ~{block.tokenEstimate} tokens
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(block.content, `block-${block.id}`)}
                                  >
                                    {copiedSection === `block-${block.id}` ? (
                                      <Check className="h-3 w-3" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                              <ScrollArea className="h-32">
                                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-2 rounded">
                                  {block.content}
                                </pre>
                              </ScrollArea>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Full Assembled Prompt */}
        <TabsContent value="full">
          {!selectedCampaignId ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Select a campaign above to view the full assembled prompt
                </p>
              </CardContent>
            </Card>
          ) : assembledLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : assembledPrompt?.assembled ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Assembled System Prompt</CardTitle>
                    <CardDescription>
                      This is exactly what the AI agent receives at runtime
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {assembledPrompt.assembled.promptHash}
                    </Badge>
                    <Badge variant="secondary">
                      ~{assembledPrompt.assembled.totalTokens} tokens
                    </Badge>
                    <Button variant="outline" size="sm" onClick={copyFullPrompt}>
                      {copiedSection === "full" ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy All
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] border rounded-lg">
                  <pre className="text-sm whitespace-pre-wrap font-mono p-4">
                    {assembledPrompt.assembled.prompt}
                  </pre>
                </ScrollArea>
                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Provider: {assembledPrompt.assembled.provider}</span>
                  <span>•</span>
                  <span>Source: {assembledPrompt.assembled.source}</span>
                  <span>•</span>
                  <span>Assembled: {new Date(assembledPrompt.assembled.assembledAt).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Failed to load assembled prompt
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Quick Links */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Configure knowledge at:
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/settings/knowledge-hub">Knowledge Hub (L2)</a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/settings/agent-defaults">Agent Defaults (L1)</a>
              </Button>
              {selectedCampaignId && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/campaigns/${selectedCampaignId}/edit`}>Campaign Settings (L3)</a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
