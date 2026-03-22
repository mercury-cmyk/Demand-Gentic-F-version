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
  const [expandedBlocks, setExpandedBlocks] = useState>(new Set());
  const [editedConfigs, setEditedConfigs] = useState>>(new Map());
  const [previewProvider, setPreviewProvider] = useState("openai");
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Fetch all knowledge blocks
  const { data: blocksData, isLoading: blocksLoading } = useQuery({
    queryKey: ["/api/knowledge-blocks"],
  });

  // Fetch campaign-specific configurations
  const { data: configsData, isLoading: configsLoading } = useQuery({
    queryKey: [`/api/knowledge-blocks/campaigns/${campaignId}/config`],
    enabled: !!campaignId,
  });

  // Fetch assembled prompt preview
  const { data: previewData, isLoading: previewLoading, refetch: refetchPreview } = useQuery({
    queryKey: [`/api/knowledge-blocks/campaigns/${campaignId}/preview-prompt?provider=${previewProvider}`],
    enabled: !!campaignId,
  });

  // Save configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async ({ blockId, config }: { blockId: number; config: Partial }) => {
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
  const configsMap = new Map();
  configsData?.configs?.forEach((c) => {
    configsMap.set(c.config.blockId, c.config);
  });

  // Group blocks by layer
  const blocksByLayer = blocks.reduce((acc, block) => {
    if (!acc[block.layer]) acc[block.layer] = [];
    acc[block.layer].push(block);
    return acc;
  }, {} as Record);

  // Layer icons and labels
  const layerInfo: Record = {
    layer_1_universal: {
      icon: ,
      label: "Universal Knowledge",
      color: "text-blue-500",
    },
    layer_2_organization: {
      icon: ,
      label: "Organization Context",
      color: "text-green-500",
    },
    layer_3_campaign: {
      icon: ,
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

  const getBlockConfig = (blockId: number): Partial => {
    const edited = editedConfigs.get(blockId);
    const saved = configsMap.get(blockId);
    return {
      isEnabled: edited?.isEnabled ?? saved?.isEnabled ?? true,
      overrideContent: edited?.overrideContent ?? saved?.overrideContent ?? null,
      openaiOverride: edited?.openaiOverride ?? saved?.openaiOverride ?? null,
      googleOverride: edited?.googleOverride ?? saved?.googleOverride ?? null,
    };
  };

  const updateBlockConfig = (blockId: number, updates: Partial) => {
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
      
        
        
      
    );
  }

  return (
    
      {/* Knowledge Blocks Configuration */}
      
        
          
            
            Knowledge Blocks
          
          
            Configure which knowledge blocks are active for this campaign and set provider-specific overrides.
          
        
        
          
            
              {Object.entries(layerInfo).map(([layer, info]) => {
                const layerBlocks = blocksByLayer[layer] || [];
                if (layerBlocks.length === 0) return null;

                return (
                  
                    
                      {info.icon}
                      {info.label}
                    
                    
                      {layerBlocks.map((block) => {
                        const config = getBlockConfig(block.id);
                        const isExpanded = expandedBlocks.has(block.id);
                        const hasEdits = editedConfigs.has(block.id);

                        return (
                          
                            
                              
                                 toggleBlock(block.id)}
                                >
                                  {isExpanded ? (
                                    
                                  ) : (
                                    
                                  )}
                                  {block.name}
                                  
                                    {block.tokenEstimate} tokens
                                  
                                  {hasEdits && (
                                    
                                      Unsaved
                                    
                                  )}
                                
                                
                                  
                                      updateBlockConfig(block.id, { isEnabled: checked })
                                    }
                                  />
                                  {hasEdits && (
                                     saveBlockConfig(block.id)}
                                      disabled={saveConfigMutation.isPending}
                                    >
                                      
                                      Save
                                    
                                  )}
                                
                              

                              
                                {/* Base Content Override */}
                                
                                  Content Override (applies to all providers)
                                  
                                      updateBlockConfig(block.id, {
                                        overrideContent: e.target.value || null,
                                      })
                                    }
                                    placeholder={block.content.slice(0, 200) + "..."}
                                    className="mt-1 font-mono text-xs h-24"
                                  />
                                

                                {/* Provider-Specific Overrides */}
                                
                                  
                                    OpenAI Override
                                    
                                        updateBlockConfig(block.id, {
                                          openaiOverride: e.target.value || null,
                                        })
                                      }
                                      placeholder="OpenAI-specific content (uses markdown formatting)"
                                      className="mt-1 font-mono text-xs h-20"
                                    />
                                  
                                  
                                    Google/Gemini Override
                                    
                                        updateBlockConfig(block.id, {
                                          googleOverride: e.target.value || null,
                                        })
                                      }
                                      placeholder="Gemini-specific content (uses XML-like tags)"
                                      className="mt-1 font-mono text-xs h-20"
                                    />
                                  
                                
                              
                            
                          
                        );
                      })}
                    
                  
                );
              })}
            
          
        
      

      {/* Prompt Preview */}
      
        
          
            
            Prompt Preview
          
          
            Preview the assembled prompt for each voice provider.
          
        
        
          
            
               setPreviewProvider(v as "openai" | "google")}>
                
                  OpenAI
                  Google/Gemini
                
              

              
                 refetchPreview()}>
                  
                
                
                  {copiedPrompt ?  : }
                
              
            

            {previewData?.assembled && (
              
                
                  {previewData.assembled.source === "blocks" ? "Knowledge Blocks" : "Legacy"}
                
                
                  {previewData.assembled.totalTokens.toLocaleString()} tokens
                
                |
                
                  Hash: {previewData.assembled.promptHash}
                
              
            )}

            
              {previewLoading ? (
                
              ) : (
                
                  {previewData?.assembled?.prompt || "No prompt available"}
                
              )}
            
          
        
      

      {/* Runtime Prompt Viewer - Shows exact prompt per account/contact */}
      
    
  );
}