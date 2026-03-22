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

// Layer configuration - Extended with full voice agent prompt layers
const LAYER_INFO: Record = {
  layer_0_foundation: {
    icon: Layers,
    label: "Layer 0: Foundation Knowledge",
    description: "Base agent capabilities, persona definition, and core behavioral instructions",
    color: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
    badgeColor: "bg-indigo-100 text-indigo-800",
  },
  layer_1_universal: {
    icon: Shield,
    label: "Layer 1: Universal Controls",
    description: "Voice control parameters, compliance rules, safety guardrails, and turn management",
    color: "bg-blue-500/10 text-blue-700 border-blue-200",
    badgeColor: "bg-blue-100 text-blue-800",
  },
  layer_2_organization: {
    icon: Building2,
    label: "Layer 2: Organization Context",
    description: "Organization defaults, brand standards, solution catalog, and competitive positioning",
    color: "bg-green-500/10 text-green-700 border-green-200",
    badgeColor: "bg-green-100 text-green-800",
  },
  layer_3_campaign: {
    icon: Target,
    label: "Layer 3: Campaign Knowledge",
    description: "Campaign-specific scripts, objectives, target audience, and messaging framework",
    color: "bg-purple-500/10 text-purple-700 border-purple-200",
    badgeColor: "bg-purple-100 text-purple-800",
  },
  layer_3_5_callflow: {
    icon: FileText,
    label: "Layer 3.5: Call Flow",
    description: "Deterministic call orchestration steps, state machine transitions, and conversation phases",
    color: "bg-orange-500/10 text-orange-700 border-orange-200",
    badgeColor: "bg-orange-100 text-orange-800",
  },
  layer_4_account: {
    icon: Building2,
    label: "Layer 4: Account Context",
    description: "Account research, company intelligence, call history, and prior interactions",
    color: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
    badgeColor: "bg-cyan-100 text-cyan-800",
  },
  layer_5_conversation: {
    icon: FileText,
    label: "Layer 5: Conversation State",
    description: "Live conversation tracking, turn management, intent detection, and state transitions",
    color: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    badgeColor: "bg-yellow-100 text-yellow-800",
  },
  layer_6_objection: {
    icon: Shield,
    label: "Layer 6: Objection Handling",
    description: "Objection detection patterns, response strategies, and counter-argument frameworks",
    color: "bg-red-500/10 text-red-700 border-red-200",
    badgeColor: "bg-red-100 text-red-800",
  },
  layer_7_routing: {
    icon: Target,
    label: "Layer 7: Routing & Escalation",
    description: "Transfer logic, escalation criteria, handoff procedures, and routing decisions",
    color: "bg-pink-500/10 text-pink-700 border-pink-200",
    badgeColor: "bg-pink-100 text-pink-800",
  },
};

export default function PromptInspectorPage() {
  const { toast } = useToast();
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [expandedLayers, setExpandedLayers] = useState>(new Set(Object.keys(LAYER_INFO)));
  const [copiedSection, setCopiedSection] = useState(null);

  // Fetch campaigns for selector
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/campaigns?status=active,paused&type=telemarketing");
      return res.json();
    },
  });

  // Fetch knowledge blocks
  const { data: blocksData, isLoading: blocksLoading } = useQuery({
    queryKey: ["/api/knowledge-blocks"],
  });

  // Fetch unified knowledge hub (Layer 2)
  const { data: unifiedKnowledge, isLoading: knowledgeLoading } = useQuery({
    queryKey: ["/api/knowledge-hub"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/knowledge-hub");
      return res.json();
    },
  });

  // Fetch campaign-specific assembled prompt when campaign selected
  const { data: assembledPrompt, isLoading: assembledLoading, refetch: refetchAssembled } = useQuery({
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
  }, {} as Record);

  // Calculate tokens per layer
  const tokensByLayer = Object.entries(blocksByLayer).reduce((acc, [layer, layerBlocks]) => {
    acc[layer] = layerBlocks.reduce((sum, b) => sum + (b.tokenEstimate || 0), 0);
    return acc;
  }, {} as Record);

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
    
      {/* Header */}
      
        
          
            
            Prompt Inspector - Voice Agent Layers
          
          
            Full transparency into all 8 knowledge layers injected into voice agent prompts at runtime
          
        
        
          
            
              
            
            
              {campaigns.map((campaign) => (
                
                  {campaign.name}
                
              ))}
            
          
          {selectedCampaignId && (
             refetchAssembled()}>
              
              Refresh
            
          )}
        
      

      {/* Layer Hierarchy Overview */}
      
        
          Voice Agent Prompt Layer Hierarchy
          
            8 layers compose the full voice agent prompt. Layer 0 (Foundation) through Layer 7 (Routing). Higher-numbered layers provide more specific context.
          
        
        
          
            {Object.entries(LAYER_INFO).map(([key, info], index) => {
              const Icon = info.icon;
              const tokens = tokensByLayer[key] || 0;
              return (
                
                  
                    
                    {info.label.split(":")[0]}
                    {tokens > 0 && (
                      
                        ~{tokens} tokens
                      
                    )}
                  
                  {index 
                  )}
                
              );
            })}
          
        
      

      {/* Tabs: By Layer / Full Prompt */}
      
        
          
            
            View by Layer
          
          
            
            Full Assembled Prompt
          
        

        {/* By Layer View */}
        
          {isLoading ? (
            
              {[1, 2, 3, 4].map((i) => (
                
              ))}
            
          ) : (
            Object.entries(LAYER_INFO).map(([layerKey, layerInfo]) => {
              const Icon = layerInfo.icon;
              const layerBlocks = blocksByLayer[layerKey] || [];
              const isExpanded = expandedLayers.has(layerKey);
              const totalTokens = layerBlocks.reduce((sum, b) => sum + (b.tokenEstimate || 0), 0);

              return (
                
                   toggleLayer(layerKey)}>
                    
                      
                        
                          
                            {isExpanded ? (
                              
                            ) : (
                              
                            )}
                            
                            
                              {layerInfo.label}
                              
                                {layerInfo.description}
                              
                            
                          
                          
                            
                              {layerBlocks.length} blocks
                            
                            
                              ~{totalTokens} tokens
                            
                          
                        
                      
                    
                    
                      
                        {layerBlocks.length === 0 ? (
                          
                            No blocks configured for this layer
                          
                        ) : (
                          layerBlocks.map((block) => (
                            
                              
                                
                                  {block.name}
                                  
                                    {block.category}
                                  
                                
                                
                                  
                                    ~{block.tokenEstimate} tokens
                                  
                                   copyToClipboard(block.content, `block-${block.id}`)}
                                  >
                                    {copiedSection === `block-${block.id}` ? (
                                      
                                    ) : (
                                      
                                    )}
                                  
                                
                              
                              
                                
                                  {block.content}
                                
                              
                            
                          ))
                        )}
                      
                    
                  
                
              );
            })
          )}
        

        {/* Full Assembled Prompt */}
        
          {!selectedCampaignId ? (
            
              
                
                
                  Select a campaign above to view the full assembled prompt
                
              
            
          ) : assembledLoading ? (
            
          ) : assembledPrompt?.assembled ? (
            
              
                
                  
                    Assembled System Prompt
                    
                      This is exactly what the AI agent receives at runtime
                    
                  
                  
                    
                      
                      {assembledPrompt.assembled.promptHash}
                    
                    
                      ~{assembledPrompt.assembled.totalTokens} tokens
                    
                    
                      {copiedSection === "full" ? (
                        <>
                          
                          Copied
                        
                      ) : (
                        <>
                          
                          Copy All
                        
                      )}
                    
                  
                
              
              
                
                  
                    {assembledPrompt.assembled.prompt}
                  
                
                
                  Provider: {assembledPrompt.assembled.provider}
                  •
                  Source: {assembledPrompt.assembled.source}
                  •
                  Assembled: {new Date(assembledPrompt.assembled.assembledAt).toLocaleString()}
                
              
            
          ) : (
            
              
                
                  Failed to load assembled prompt
                
              
            
          )}
        
      

      {/* Quick Links */}
      
        
          
            
              Configure knowledge at:
            
            
              
                Agent Defaults
              
              {selectedCampaignId && (
                
                  Campaign Settings (L3)
                
              )}
            
          
        
      
    
  );
}