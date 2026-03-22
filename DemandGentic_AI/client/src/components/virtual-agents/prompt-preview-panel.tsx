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
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [viewMode, setViewMode] = useState("annotated");

  // Fetch available campaigns
  const { data: campaignsData } = useQuery({
    queryKey: ["/api/campaigns"],
  });

  // Fetch effective prompt
  const effectivePromptUrl = selectedCampaignId
    ? `/api/knowledge-blocks/agents/${agentId}/effective-prompt?campaignId=${selectedCampaignId}`
    : `/api/knowledge-blocks/agents/${agentId}/effective-knowledge`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [effectivePromptUrl],
    enabled: !!agentId,
  });

  const knowledge = data?.knowledge;
  const campaigns = campaignsData?.campaigns || [];

  // Layer icons
  const layerIcons: Record = {
    layer_1_universal: ,
    layer_2_organization: ,
    layer_3_campaign: ,
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
  const envColor: Record = {
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
      
        Failed to load prompt preview
         refetch()}>
          
          Retry
        
      
    );
  }

  return (
    
      {/* Controls */}
      
        
          Campaign Context
           setSelectedCampaignId(v === "none" ? null : v)}
          >
            
              
            
            
              No campaign (default knowledge only)
              {campaigns
                .filter((c) => c.type === "call" || c.type === "telemarketing")
                .map((campaign) => (
                  
                    {campaign.name}
                  
                ))}
            
          
        

        
           setViewMode("annotated")}
          >
            Annotated
          
           setViewMode("raw")}
          >
            Raw
          
        

        
           refetch()}>
            
          
          
            {copiedPrompt ?  : }
          
          
            
          
        
      

      {/* Metadata bar */}
      {knowledge && (
        
          
            {knowledge.environment}
          
          
            {knowledge.totalTokens.toLocaleString()} tokens
          
          |
          {knowledge.blocks.length} blocks
          |
          
            Hash: {knowledge.promptHash}
          
          {knowledge.campaignName && (
            <>
              |
              {knowledge.campaignName}
            
          )}
        
      )}

      {/* Prompt content */}
      
        
          
            
            {selectedCampaignId ? "Full Effective Prompt" : "Default Knowledge Preview"}
          
        
        
          
            {knowledge && viewMode === "annotated" ? (
              
                {knowledge.blocks.map((block, index) => (
                  
                    {/* Block header */}
                    
                      {layerIcons[block.layer] || }
                      {block.name}
                      
                        {block.tokenEstimate} tokens
                      
                      {block.isOverridden && (
                        
                          Override
                        
                      )}
                    
                    {/* Block content */}
                    
                      {block.content}
                    
                  
                ))}
              
            ) : (
              
                {knowledge?.blocks.map((b) => b.content).join("\n\n")}
              
            )}
          
        
      

      {/* Footer */}
      {knowledge && (
        
          Assembled at: {new Date(knowledge.assembledAt).toLocaleString()}
        
      )}
    
  );
}