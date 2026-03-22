/**
 * Agent Prompt Viewer Component
 *
 * Shows runtime prompts for Email, Research, and Voice agents by provider.
 * Allows selecting between different AI providers and viewing their
 * system prompts, user prompt templates, and parameters.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Eye,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Mail,
  Search,
  Phone,
  Hash,
  Clock,
  Cpu,
  Thermometer,
  FileText,
  Code,
} from "lucide-react";

interface AgentPromptPreview {
  provider: string;
  model: string;
  systemPrompt: string;
  userPromptTemplate: string;
  sampleUserPrompt?: string;
  parameters: {
    temperature: number;
    maxTokens: number;
    responseFormat?: string;
  };
  tokenEstimate: number;
  promptHash: string;
  assembledAt: string;
  context?: {
    accountId?: string;
    accountName?: string;
    campaignId?: string;
    campaignName?: string;
  };
}

interface MultiProviderPromptPreview {
  agentType: 'email' | 'research' | 'voice';
  providers: Record;
  assembledAt: string;
}

interface AgentPromptViewerProps {
  agentType: 'email' | 'research' | 'voice';
  accountId?: string;
  campaignId?: string;
  organizationName?: string;
  websiteUrl?: string;
  industry?: string;
  agentId?: string;
}

export function AgentPromptViewer({
  agentType,
  accountId,
  campaignId,
  organizationName,
  websiteUrl,
  industry,
  agentId,
}: AgentPromptViewerProps) {
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [copiedSection, setCopiedSection] = useState(null);
  const [expandedSections, setExpandedSections] = useState>(
    new Set(["systemPrompt", "userPrompt"])
  );

  // Build query params based on agent type
  const queryParams = new URLSearchParams();
  if (accountId) queryParams.append("accountId", accountId);
  if (campaignId) queryParams.append("campaignId", campaignId);
  if (organizationName) queryParams.append("organizationName", organizationName);
  if (websiteUrl) queryParams.append("websiteUrl", websiteUrl);
  if (industry) queryParams.append("industry", industry);
  if (agentId) queryParams.append("agentId", agentId);

  const queryString = queryParams.toString();
  const endpoint = `/api/agent-prompts/${agentType}${queryString ? `?${queryString}` : ""}`;

  // Fetch prompts
  const { data, isLoading, error, refetch } = useQuery;
    assembledAt: string;
  }>({
    queryKey: [endpoint],
  });

  const providers = data?.providers || {};
  const providerList = Object.keys(providers);

  // Set default provider when data loads
  if (!selectedProvider && providerList.length > 0) {
    setSelectedProvider(providerList[0]);
  }

  const currentPrompt = selectedProvider ? providers[selectedProvider] : null;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
    toast({ title: "Copied", description: `${section} copied to clipboard` });
  };

  // Provider icons and colors
  const providerInfo: Record = {
    deepseek: { color: "text-purple-500", name: "DeepSeek" },
    openai: { color: "text-green-500", name: agentType === 'voice' ? "OpenAI Realtime" : "OpenAI" },
    gemini: { color: "text-blue-500", name: agentType === 'voice' ? "Live Voice" : "Google Gemini" },
    claude: { color: "text-orange-500", name: "Anthropic Claude" },
  };

  // Agent type labels and icons
  const agentTypeInfo: Record = {
    email: { label: "Email Agent", icon:  },
    research: { label: "Research Agent", icon:  },
    voice: { label: "Voice Agent", icon:  },
  };

  if (isLoading) {
    return (
      
        
          
          
        
        
          
          
        
      
    );
  }

  if (error) {
    return (
      
        
          Failed to load agent prompts
           refetch()}>
            
            Retry
          
        
      
    );
  }

  return (
    
      
        
          {agentTypeInfo[agentType]?.icon}
          {agentTypeInfo[agentType]?.label || agentType} Prompts
        
        
          View runtime prompts by AI provider. Select a provider to see the exact
          system prompt and user prompt template.
        
      
      
        {/* Provider Selection */}
        
          
            AI Provider
            
              
                {providerList.map((provider) => (
                  
                    {providerInfo[provider]?.name || provider}
                  
                ))}
              
            
          

          
             refetch()}>
              
            
          
        

        {/* Metadata Bar */}
        {currentPrompt && (
          
            
              
              {currentPrompt.model}
            
            
              
              {currentPrompt.tokenEstimate.toLocaleString()} tokens
            
            |
            
              
              temp: {currentPrompt.parameters.temperature}
            
            |
            
              {currentPrompt.promptHash}
            
            {currentPrompt.parameters.responseFormat && (
              <>
                |
                
                  {currentPrompt.parameters.responseFormat}
                
              
            )}
          
        )}

        {/* Context Info */}
        {currentPrompt?.context && (
          
            {currentPrompt.context.accountName && (
              Account: {currentPrompt.context.accountName}
            )}
            {currentPrompt.context.campaignName && (
              <>
                |
                Campaign: {currentPrompt.context.campaignName}
              
            )}
          
        )}

        {/* Prompt Content */}
        {currentPrompt && (
          
            {/* System Prompt */}
             toggleSection("systemPrompt")}
            >
              
                
                  
                    {expandedSections.has("systemPrompt") ? (
                      
                    ) : (
                      
                    )}
                    
                    System Prompt
                  
                   {
                      e.stopPropagation();
                      copyToClipboard(currentPrompt.systemPrompt, "System Prompt");
                    }}
                  >
                    {copiedSection === "System Prompt" ? (
                      
                    ) : (
                      
                    )}
                  
                
                
                  
                    
                      {currentPrompt.systemPrompt}
                    
                  
                
              
            

            {/* User Prompt Template */}
             toggleSection("userPrompt")}
            >
              
                
                  
                    {expandedSections.has("userPrompt") ? (
                      
                    ) : (
                      
                    )}
                    
                    User Prompt Template
                  
                   {
                      e.stopPropagation();
                      copyToClipboard(
                        currentPrompt.userPromptTemplate,
                        "User Prompt Template"
                      );
                    }}
                  >
                    {copiedSection === "User Prompt Template" ? (
                      
                    ) : (
                      
                    )}
                  
                
                
                  
                    
                      {currentPrompt.userPromptTemplate}
                    
                  
                
              
            

            {/* Sample User Prompt */}
            {currentPrompt.sampleUserPrompt && (
               toggleSection("samplePrompt")}
              >
                
                  
                    
                      {expandedSections.has("samplePrompt") ? (
                        
                      ) : (
                        
                      )}
                      
                      Sample User Prompt
                      
                        Preview
                      
                    
                     {
                        e.stopPropagation();
                        copyToClipboard(
                          currentPrompt.sampleUserPrompt!,
                          "Sample User Prompt"
                        );
                      }}
                    >
                      {copiedSection === "Sample User Prompt" ? (
                        
                      ) : (
                        
                      )}
                    
                  
                  
                    
                      
                        {currentPrompt.sampleUserPrompt}
                      
                    
                  
                
              
            )}

            {/* Parameters */}
            
              
                
                Model Parameters
              
              
                
                  Temperature:
                  
                    {currentPrompt.parameters.temperature}
                  
                
                
                  Max Tokens:
                  
                    {currentPrompt.parameters.maxTokens.toLocaleString()}
                  
                
                {currentPrompt.parameters.responseFormat && (
                  
                    Format:
                    
                      {currentPrompt.parameters.responseFormat}
                    
                  
                )}
              
            
          
        )}

        {/* Footer */}
        {data && (
          
            
            Assembled at: {new Date(data.assembledAt).toLocaleString()}
          
        )}
      
    
  );
}