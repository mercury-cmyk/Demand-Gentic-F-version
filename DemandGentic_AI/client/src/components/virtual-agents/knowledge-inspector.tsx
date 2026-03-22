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
  const [expandedLayers, setExpandedLayers] = useState(["layer_1_universal"]);
  const [editingBlock, setEditingBlock] = useState(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Fetch effective knowledge for the agent
  const url = campaignId
    ? `/api/knowledge-blocks/agents/${agentId}/effective-prompt?campaignId=${campaignId}`
    : `/api/knowledge-blocks/agents/${agentId}/effective-knowledge`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [url],
    enabled: !!agentId,
  });

  const knowledge = data?.knowledge;

  // Group blocks by layer
  const blocksByLayer = knowledge?.blocks.reduce((acc, block) => {
    if (!acc[block.layer]) acc[block.layer] = [];
    acc[block.layer].push(block);
    return acc;
  }, {} as Record) || {};

  // Layer metadata
  const layerInfo: Record = {
    layer_1_universal: {
      name: "Universal Knowledge",
      icon: ,
      description: "Foundation knowledge for all agents",
    },
    layer_2_organization: {
      name: "Organization Intelligence",
      icon: ,
      description: "Organization-specific context",
    },
    layer_3_campaign: {
      name: "Campaign Context",
      icon: ,
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
      
        
        
        
      
    );
  }

  if (error) {
    return (
      
        Failed to load knowledge blocks
         refetch()}>
          
          Retry
        
      
    );
  }

  if (!knowledge) {
    return (
      
        No knowledge blocks configured
      
    );
  }

  return (
    
      {/* Header with metadata */}
      
        
          
            
            {campaignId ? "Full Effective Prompt" : "Default Knowledge"}
          
          
            
              {knowledge.environment}
            
            {knowledge.totalTokens.toLocaleString()} tokens
            Hash: {knowledge.promptHash}
          
        
        
           refetch()}>
            
            Refresh
          
          
            {copiedPrompt ? (
              
            ) : (
              
            )}
            Copy Full Prompt
          
        
      

      {/* Knowledge blocks by layer */}
      
        
          {Object.entries(blocksByLayer).map(([layer, blocks]) => {
            const info = layerInfo[layer] || {
              name: layer,
              icon: ,
              description: "",
            };
            const layerTokens = blocks.reduce((sum, b) => sum + b.tokenEstimate, 0);
            const isExpanded = expandedLayers.includes(layer);

            return (
               toggleLayer(layer)}>
                
                  
                    
                      
                        
                          {isExpanded ? (
                            
                          ) : (
                            
                          )}
                          {info.icon}
                          {info.name}
                          {blocks.length} blocks
                        
                        
                          {layerTokens.toLocaleString()} tokens
                        
                      
                    
                  

                  
                    
                      {blocks.map((block) => (
                        
                          
                            
                              {block.name}
                              {block.isOverridden && (
                                
                                  Overridden
                                
                              )}
                              
                                {block.source}
                              
                            
                            
                              {block.tokenEstimate} tokens
                              v{block.version}
                              {block.slug}
                            
                            {/* Preview content */}
                            
                              {block.content.slice(0, 300)}
                              {block.content.length > 300 && "..."}
                            
                          
                          
                             setEditingBlock(block)}
                            >
                              
                            
                          
                        
                      ))}
                    
                  
                
              
            );
          })}
        
      

      {/* Summary footer */}
      
        
          Assembled at: {new Date(knowledge.assembledAt).toLocaleString()}
        
        
          {knowledge.blocks.length} blocks | {knowledge.totalTokens.toLocaleString()} total tokens
        
      

      {/* Block editor modal */}
      {editingBlock && (
         setEditingBlock(null)}
          onSaved={() => {
            setEditingBlock(null);
            refetch();
          }}
        />
      )}
    
  );
}