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
  providers: Record<string, AgentPromptPreview>;
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
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
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
  const { data, isLoading, error, refetch } = useQuery<{
    success: boolean;
    agentType: string;
    providers: Record<string, AgentPromptPreview>;
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
  const providerInfo: Record<string, { color: string; name: string }> = {
    deepseek: { color: "text-purple-500", name: "DeepSeek" },
    openai: { color: "text-green-500", name: agentType === 'voice' ? "OpenAI Realtime" : "OpenAI" },
    gemini: { color: "text-blue-500", name: agentType === 'voice' ? "Live Voice" : "Google Gemini" },
    claude: { color: "text-orange-500", name: "Anthropic Claude" },
  };

  // Agent type labels and icons
  const agentTypeInfo: Record<string, { label: string; icon: React.ReactNode }> = {
    email: { label: "Email Agent", icon: <Mail className="h-5 w-5" /> },
    research: { label: "Research Agent", icon: <Search className="h-5 w-5" /> },
    voice: { label: "Voice Agent", icon: <Phone className="h-5 w-5" /> },
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-red-500 mb-2">Failed to load agent prompts</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {agentTypeInfo[agentType]?.icon}
          {agentTypeInfo[agentType]?.label || agentType} Prompts
        </CardTitle>
        <CardDescription>
          View runtime prompts by AI provider. Select a provider to see the exact
          system prompt and user prompt template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider Selection */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs mb-1 block">AI Provider</Label>
            <Tabs
              value={selectedProvider || ""}
              onValueChange={setSelectedProvider}
            >
              <TabsList className="w-full">
                {providerList.map((provider) => (
                  <TabsTrigger
                    key={provider}
                    value={provider}
                    className={`flex-1 ${providerInfo[provider]?.color || ""}`}
                  >
                    {providerInfo[provider]?.name || provider}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Metadata Bar */}
        {currentPrompt && (
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <Badge variant="outline" className="flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              {currentPrompt.model}
            </Badge>
            <span className="text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {currentPrompt.tokenEstimate.toLocaleString()} tokens
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground flex items-center gap-1">
              <Thermometer className="h-3 w-3" />
              temp: {currentPrompt.parameters.temperature}
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground font-mono text-xs">
              {currentPrompt.promptHash}
            </span>
            {currentPrompt.parameters.responseFormat && (
              <>
                <span className="text-muted-foreground">|</span>
                <Badge variant="secondary" className="text-xs">
                  {currentPrompt.parameters.responseFormat}
                </Badge>
              </>
            )}
          </div>
        )}

        {/* Context Info */}
        {currentPrompt?.context && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {currentPrompt.context.accountName && (
              <span>Account: {currentPrompt.context.accountName}</span>
            )}
            {currentPrompt.context.campaignName && (
              <>
                <span>|</span>
                <span>Campaign: {currentPrompt.context.campaignName}</span>
              </>
            )}
          </div>
        )}

        {/* Prompt Content */}
        {currentPrompt && (
          <div className="space-y-3">
            {/* System Prompt */}
            <Collapsible
              open={expandedSections.has("systemPrompt")}
              onOpenChange={() => toggleSection("systemPrompt")}
            >
              <div className="border rounded-lg">
                <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    {expandedSections.has("systemPrompt") ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">System Prompt</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(currentPrompt.systemPrompt, "System Prompt");
                    }}
                  >
                    {copiedSection === "System Prompt" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-[300px] border-t">
                    <pre className="text-xs font-mono whitespace-pre-wrap p-4 bg-muted/30">
                      {currentPrompt.systemPrompt}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* User Prompt Template */}
            <Collapsible
              open={expandedSections.has("userPrompt")}
              onOpenChange={() => toggleSection("userPrompt")}
            >
              <div className="border rounded-lg">
                <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    {expandedSections.has("userPrompt") ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <Code className="h-4 w-4 text-green-500" />
                    <span className="font-medium">User Prompt Template</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(
                        currentPrompt.userPromptTemplate,
                        "User Prompt Template"
                      );
                    }}
                  >
                    {copiedSection === "User Prompt Template" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-[200px] border-t">
                    <pre className="text-xs font-mono whitespace-pre-wrap p-4 bg-muted/30">
                      {currentPrompt.userPromptTemplate}
                    </pre>
                  </ScrollArea>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Sample User Prompt */}
            {currentPrompt.sampleUserPrompt && (
              <Collapsible
                open={expandedSections.has("samplePrompt")}
                onOpenChange={() => toggleSection("samplePrompt")}
              >
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {expandedSections.has("samplePrompt") ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Eye className="h-4 w-4 text-purple-500" />
                      <span className="font-medium">Sample User Prompt</span>
                      <Badge variant="secondary" className="text-xs">
                        Preview
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(
                          currentPrompt.sampleUserPrompt!,
                          "Sample User Prompt"
                        );
                      }}
                    >
                      {copiedSection === "Sample User Prompt" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ScrollArea className="h-[200px] border-t">
                      <pre className="text-xs font-mono whitespace-pre-wrap p-4 bg-muted/30">
                        {currentPrompt.sampleUserPrompt}
                      </pre>
                    </ScrollArea>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {/* Parameters */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="h-4 w-4 text-gray-500" />
                <span className="font-medium text-sm">Model Parameters</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Temperature:</span>
                  <span className="ml-2 font-mono">
                    {currentPrompt.parameters.temperature}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Tokens:</span>
                  <span className="ml-2 font-mono">
                    {currentPrompt.parameters.maxTokens.toLocaleString()}
                  </span>
                </div>
                {currentPrompt.parameters.responseFormat && (
                  <div>
                    <span className="text-muted-foreground">Format:</span>
                    <span className="ml-2 font-mono">
                      {currentPrompt.parameters.responseFormat}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {data && (
          <div className="text-xs text-muted-foreground text-right flex items-center justify-end gap-1">
            <Clock className="h-3 w-3" />
            Assembled at: {new Date(data.assembledAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
