/**
 * Runtime Prompt Viewer Component
 *
 * Shows the exact system prompt that will be sent to the AI at runtime
 * for a specific campaign, account, and contact combination.
 *
 * Features:
 * - Select account/contact to preview personalized prompt
 * - Toggle between OpenAI and Gemini provider formats
 * - View layer breakdown (knowledge blocks, account, contact)
 * - Copy full prompt to clipboard
 * - See token estimates per layer
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
  User,
  Building2,
  Layers,
  Target,
  FileText,
  Hash,
  Clock,
} from "lucide-react";

interface Account {
  id: string;
  name: string;
  domain: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  accountId: string;
}

interface RuntimePrompt {
  prompt: string;
  totalTokens: number;
  provider: string;
  source: "blocks" | "legacy";
  assembledAt: string;
  promptHash: string;
  layers: {
    knowledge: {
      tokens: number;
      source: string;
    };
    account: {
      id: string;
      name: string;
      domain: string;
    } | null;
    contact: {
      id: string;
      name: string;
      email: string;
    } | null;
  };
  campaign: {
    id: string;
    name: string;
  };
}

interface RuntimePromptViewerProps {
  campaignId: string;
}

export function RuntimePromptViewer({ campaignId }: RuntimePromptViewerProps) {
  const { toast } = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"openai" | "google">("openai");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showLayers, setShowLayers] = useState(true);

  // Fetch accounts for the campaign
  const { data: accountsData } = useQuery<{ accounts: Account[] }>({
    queryKey: [`/api/knowledge-blocks/campaigns/${campaignId}/accounts`],
    enabled: !!campaignId,
  });

  // Fetch contacts for selected account
  const { data: contactsData } = useQuery<{ contacts: Contact[] }>({
    queryKey: [`/api/knowledge-blocks/accounts/${selectedAccountId}/contacts`],
    enabled: !!selectedAccountId,
  });

  // Fetch runtime prompt
  const { data: promptData, isLoading, refetch } = useQuery<{
    success: boolean;
    runtime: RuntimePrompt;
  }>({
    queryKey: [
      `/api/knowledge-blocks/campaigns/${campaignId}/runtime-prompt?provider=${provider}${
        selectedAccountId ? `&accountId=${selectedAccountId}` : ""
      }${selectedContactId ? `&contactId=${selectedContactId}` : ""}`,
    ],
    enabled: !!campaignId,
  });

  const accounts = accountsData?.accounts || [];
  const contacts = contactsData?.contacts || [];
  const runtime = promptData?.runtime;

  const copyPrompt = async () => {
    if (!runtime?.prompt) return;
    await navigator.clipboard.writeText(runtime.prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
    toast({ title: "Copied", description: "Full prompt copied to clipboard" });
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId === "none" ? null : accountId);
    setSelectedContactId(null); // Reset contact when account changes
  };

  const handleContactChange = (contactId: string) => {
    setSelectedContactId(contactId === "none" ? null : contactId);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Runtime Prompt Viewer
        </CardTitle>
        <CardDescription>
          Preview the exact system prompt that will be sent to the AI model for any account/contact combination.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Context Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Account Selector */}
          <div>
            <Label className="text-xs mb-1 block">Account Context</Label>
            <Select value={selectedAccountId || "none"} onValueChange={handleAccountChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select account..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No account (base prompt only)</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contact Selector */}
          <div>
            <Label className="text-xs mb-1 block">Contact Context</Label>
            <Select
              value={selectedContactId || "none"}
              onValueChange={handleContactChange}
              disabled={!selectedAccountId}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedAccountId ? "Select contact..." : "Select account first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No contact (account only)</SelectItem>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.firstName} {contact.lastName} ({contact.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Provider Selector */}
          <div>
            <Label className="text-xs mb-1 block">Voice Provider</Label>
            <Tabs value={provider} onValueChange={(v) => setProvider(v as "openai" | "google")}>
              <TabsList className="w-full">
                <TabsTrigger value="openai" className="flex-1">OpenAI</TabsTrigger>
                <TabsTrigger value="google" className="flex-1">Gemini</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Metadata Bar */}
        {runtime && (
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <Badge variant={runtime.source === "blocks" ? "default" : "secondary"}>
              {runtime.source === "blocks" ? "Knowledge Blocks" : "Legacy"}
            </Badge>
            <span className="text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {runtime.totalTokens.toLocaleString()} tokens
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground font-mono text-xs">
              {runtime.promptHash}
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(runtime.assembledAt).toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Layer Breakdown */}
        {runtime && (
          <Collapsible open={showLayers} onOpenChange={setShowLayers}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
              {showLayers ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Prompt Layers
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Knowledge Layer */}
                <div className="border rounded-lg p-3 bg-blue-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="h-4 w-4 text-blue-500" />
                    <span className="font-medium text-sm">Knowledge Blocks</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Tokens: {runtime.layers.knowledge.tokens.toLocaleString()}</div>
                    <div>Source: {runtime.layers.knowledge.source}</div>
                  </div>
                </div>

                {/* Account Layer */}
                <div className={`border rounded-lg p-3 ${runtime.layers.account ? "bg-green-500/5" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className={`h-4 w-4 ${runtime.layers.account ? "text-green-500" : "text-muted-foreground"}`} />
                    <span className="font-medium text-sm">Account Context</span>
                  </div>
                  {runtime.layers.account ? (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>{runtime.layers.account.name}</div>
                      <div>{runtime.layers.account.domain}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Not selected</div>
                  )}
                </div>

                {/* Contact Layer */}
                <div className={`border rounded-lg p-3 ${runtime.layers.contact ? "bg-purple-500/5" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <User className={`h-4 w-4 ${runtime.layers.contact ? "text-purple-500" : "text-muted-foreground"}`} />
                    <span className="font-medium text-sm">Contact Context</span>
                  </div>
                  {runtime.layers.contact ? (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>{runtime.layers.contact.name}</div>
                      <div>{runtime.layers.contact.email}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Not selected</div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={copyPrompt} disabled={!runtime}>
            {copiedPrompt ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            Copy Prompt
          </Button>
        </div>

        {/* Prompt Content */}
        <div className="border rounded-lg">
          <div className="p-2 border-b bg-muted/30 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="text-sm font-medium">Full System Prompt</span>
            {runtime && (
              <Badge variant="outline" className="ml-auto text-xs">
                {provider === "openai" ? "OpenAI Format" : "Gemini Format"}
              </Badge>
            )}
          </div>
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap p-4">
                {runtime?.prompt || "No prompt available. Select an account/contact to preview the runtime prompt."}
              </pre>
            )}
          </ScrollArea>
        </div>

        {/* Footer Info */}
        {runtime && (
          <div className="text-xs text-muted-foreground">
            Campaign: <span className="font-medium">{runtime.campaign.name}</span> ({runtime.campaign.id})
          </div>
        )}
      </CardContent>
    </Card>
  );
}
