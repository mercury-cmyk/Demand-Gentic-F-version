import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Brain,
  Building2,
  User,
  Megaphone,
  Phone,
  ChevronDown,
  Copy,
  Check,
  MessageSquare,
  Hash,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface AssembledPromptResponse {
  systemPrompt: string;
  firstMessage: string;
  sections: {
    foundation: string;
    campaign: string;
    account: string;
    contact: string;
    callPlan: string;
  };
  tokenCount: number;
}

interface PromptInspectorPanelProps {
  campaignId: string | null;
  accountId: string | null;
  contactId: string | null;
}

function PromptSection({
  title,
  icon: Icon,
  content,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  content: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!content || content.trim() === '') {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{title}</span>
              <Badge variant="outline" className="text-xs">
                ~{Math.ceil(content.length / 4)} tokens
              </Badge>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                isOpen && "transform rotate-180"
              )}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-8"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <ScrollArea className="h-[300px]">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
                {content}
              </pre>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function PromptInspectorPanel({
  campaignId,
  accountId,
  contactId,
}: PromptInspectorPanelProps) {
  const [copied, setCopied] = useState(false);

  const { data: promptData, isLoading, error } = useQuery<AssembledPromptResponse>({
    queryKey: ['/api/preview-studio/assembled-prompt', campaignId, accountId, contactId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaignId', campaignId);
      if (accountId) params.set('accountId', accountId);
      if (contactId) params.set('contactId', contactId);

      const response = await apiRequest('GET', `/api/preview-studio/assembled-prompt?${params.toString()}`);
      return response.json();
    },
    enabled: !!(campaignId && accountId),
  });

  const handleCopyFull = async () => {
    if (promptData?.systemPrompt) {
      await navigator.clipboard.writeText(promptData.systemPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !promptData) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Could Not Load Prompt</h2>
          <p className="text-muted-foreground">
            Failed to assemble the system prompt for this context.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Brain className="h-5 w-5" />
                Assembled System Prompt
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Hash className="h-3 w-3" />
                Total: ~{promptData.tokenCount.toLocaleString()} tokens
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleCopyFull}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Full Prompt
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* First Message */}
      {promptData.firstMessage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" />
              Opening Message
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-primary/5 rounded-lg">
              <p className="text-sm italic">"{promptData.firstMessage}"</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prompt Sections */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground">Prompt Sections</h3>

        <PromptSection
          title="Foundation / Agent Base"
          icon={Brain}
          content={promptData.sections.foundation}
          defaultOpen={true}
        />

        <PromptSection
          title="Campaign Context"
          icon={Megaphone}
          content={promptData.sections.campaign}
        />

        <PromptSection
          title="Account Intelligence"
          icon={Building2}
          content={promptData.sections.account}
        />

        <PromptSection
          title="Contact Context"
          icon={User}
          content={promptData.sections.contact}
        />

        <PromptSection
          title="Call Plan"
          icon={Phone}
          content={promptData.sections.callPlan}
        />
      </div>

      {/* Full Prompt (Collapsed by Default) */}
      <Collapsible>
        <div className="border rounded-lg">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Full Assembled Prompt</span>
                <Badge variant="secondary" className="text-xs">Raw</Badge>
              </div>
              <ChevronDown className="h-4 w-4" />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator />
            <ScrollArea className="h-[500px]">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words bg-muted/30">
                {promptData.systemPrompt}
              </pre>
            </ScrollArea>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
