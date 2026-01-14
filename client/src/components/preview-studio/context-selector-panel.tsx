import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Building2,
  User,
  Megaphone,
  Brain,
  MessageSquare,
  Phone,
  Check,
  ChevronsUpDown,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Target,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
}

interface Contact {
  id: string;
  fullName: string | null;
  jobTitle: string | null;
  email: string | null;
}

interface PreviewContext {
  sessionId: string;
  accountIntelligence: any;
  accountMessagingBrief: any;
  accountCallBrief: any;
  participantCallPlan: any;
  participantContext: any;
  account: Account | null;
  contact: Contact | null;
  campaign: Campaign | null;
}

interface ContextSelectorPanelProps {
  selectedCampaignId: string | null;
  selectedAccountId: string | null;
  selectedContactId: string | null;
  onSelectionChange: (selection: {
    campaignId: string | null;
    accountId: string | null;
    contactId: string | null;
  }) => void;
  previewContext?: PreviewContext;
  isLoading?: boolean;
}

export function ContextSelectorPanel({
  selectedCampaignId,
  selectedAccountId,
  selectedContactId,
  onSelectionChange,
  previewContext,
  isLoading,
}: ContextSelectorPanelProps) {
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const [contextExpanded, setContextExpanded] = useState(true);

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      const data = await response.json();
      return (data.campaigns || data || []).filter((c: Campaign) =>
        c.type === 'call' || c.type === 'combo'
      );
    },
  });

  // Fetch accounts with search
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['/api/accounts', accountSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountSearchQuery) params.set('search', accountSearchQuery);
      params.set('limit', '50');

      const response = await apiRequest('GET', `/api/accounts?${params.toString()}`);
      const data = await response.json();
      return data.accounts || data || [];
    },
    enabled: accountSearchOpen || !!selectedAccountId,
  });

  // Fetch contacts for selected account
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ['/api/contacts', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const params = new URLSearchParams();
      params.set('accountId', selectedAccountId);
      params.set('limit', '100');

      const response = await apiRequest('GET', `/api/contacts?${params.toString()}`);
      const data = await response.json();
      return data.contacts || data || [];
    },
    enabled: !!selectedAccountId,
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const selectedContact = contacts.find(c => c.id === selectedContactId);
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="flex flex-col h-full">
      {/* Selectors */}
      <div className="p-4 space-y-5">
        {/* Campaign Selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Megaphone className="h-4 w-4 text-primary" />
            Campaign
          </Label>
          <Select
            value={selectedCampaignId || ""}
            onValueChange={(value) =>
              onSelectionChange({
                campaignId: value || null,
                accountId: selectedAccountId,
                contactId: selectedContactId,
              })
            }
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select a campaign..." />
            </SelectTrigger>
            <SelectContent>
              {campaignsLoading ? (
                <div className="p-2">
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No call campaigns found
                </div>
              ) : (
                campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{campaign.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {campaign.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Account Selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-primary" />
            Account
          </Label>
          <Popover open={accountSearchOpen} onOpenChange={setAccountSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={accountSearchOpen}
                className="w-full justify-between h-10 font-normal"
              >
                {selectedAccount ? (
                  <span className="truncate">{selectedAccount.name}</span>
                ) : (
                  <span className="text-muted-foreground">Search accounts...</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search accounts..."
                  value={accountSearchQuery}
                  onValueChange={setAccountSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>No accounts found.</CommandEmpty>
                  <CommandGroup>
                    {accountsLoading ? (
                      <div className="p-2">
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : (
                      accounts.map((account) => (
                        <CommandItem
                          key={account.id}
                          value={account.name}
                          onSelect={() => {
                            onSelectionChange({
                              campaignId: selectedCampaignId,
                              accountId: account.id,
                              contactId: null,
                            });
                            setAccountSearchOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedAccountId === account.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{account.name}</span>
                            {account.domain && (
                              <span className="text-xs text-muted-foreground">{account.domain}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Contact Selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <User className="h-4 w-4 text-primary" />
            Contact
            <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Select
            value={selectedContactId || ""}
            onValueChange={(value) =>
              onSelectionChange({
                campaignId: selectedCampaignId,
                accountId: selectedAccountId,
                contactId: value || null,
              })
            }
            disabled={!selectedAccountId}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder={selectedAccountId ? "Select a contact..." : "Select account first"} />
            </SelectTrigger>
            <SelectContent>
              {contactsLoading ? (
                <div className="p-2">
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No contacts found
                </div>
              ) : (
                contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{contact.fullName || 'Unknown'}</span>
                      {contact.jobTitle && (
                        <span className="text-xs text-muted-foreground">{contact.jobTitle}</span>
                      )}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Context Summary */}
      <div className="flex-1 overflow-hidden">
        <Collapsible open={contextExpanded} onOpenChange={setContextExpanded}>
          <CollapsibleTrigger asChild>
            <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Context Summary
              </h3>
              <ChevronDown className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                contextExpanded && "rotate-180"
              )} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="h-[400px]">
              <div className="px-4 pb-4 space-y-3">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : previewContext ? (
                  <>
                    {/* Selected Context */}
                    {(previewContext.campaign || previewContext.account || previewContext.contact) && (
                      <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
                        <CardContent className="p-3 space-y-2">
                          {previewContext.campaign && (
                            <div className="flex items-center gap-2 text-sm">
                              <Megaphone className="h-3.5 w-3.5 text-primary" />
                              <span className="font-medium">{previewContext.campaign.name}</span>
                            </div>
                          )}
                          {previewContext.account && (
                            <div className="flex items-center gap-2 text-sm">
                              <Building2 className="h-3.5 w-3.5 text-primary" />
                              <span>{previewContext.account.name}</span>
                            </div>
                          )}
                          {previewContext.contact && (
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-3.5 w-3.5 text-primary" />
                              <span>{previewContext.contact.fullName}</span>
                              {previewContext.contact.jobTitle && (
                                <span className="text-muted-foreground">
                                  - {previewContext.contact.jobTitle}
                                </span>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Account Intelligence */}
                    {previewContext.accountIntelligence && (
                      <Card className="bg-muted/30">
                        <CardHeader className="py-2 px-3">
                          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                            <Brain className="h-3.5 w-3.5 text-primary" />
                            Account Intelligence
                            <Badge
                              variant={previewContext.accountIntelligence.confidence > 0.7 ? "default" : "secondary"}
                              className="text-xs ml-auto"
                            >
                              {Math.round((previewContext.accountIntelligence.confidence || 0) * 100)}%
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2 px-3">
                          {previewContext.accountIntelligence.problem_hypothesis && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {previewContext.accountIntelligence.problem_hypothesis}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Messaging Brief */}
                    {previewContext.accountMessagingBrief && (
                      <Card className="bg-muted/30">
                        <CardHeader className="py-2 px-3">
                          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5 text-primary" />
                            Messaging Brief
                            {previewContext.accountMessagingBrief.posture && (
                              <Badge variant="outline" className="text-xs ml-auto">
                                {previewContext.accountMessagingBrief.posture}
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2 px-3">
                          {previewContext.accountMessagingBrief.problem && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {previewContext.accountMessagingBrief.problem}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Call Brief */}
                    {previewContext.accountCallBrief && (
                      <Card className="bg-muted/30">
                        <CardHeader className="py-2 px-3">
                          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-primary" />
                            Call Brief
                            {previewContext.accountCallBrief.opening_posture && (
                              <Badge variant="outline" className="text-xs ml-auto">
                                {previewContext.accountCallBrief.opening_posture}
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2 px-3">
                          {previewContext.accountCallBrief.theme && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {previewContext.accountCallBrief.theme}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Participant Call Plan */}
                    {previewContext.participantCallPlan && (
                      <Card className="bg-muted/30">
                        <CardHeader className="py-2 px-3">
                          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5 text-primary" />
                            Call Plan
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2 px-3 space-y-2">
                          {previewContext.participantCallPlan.first_question && (
                            <div className="flex items-start gap-2">
                              <Lightbulb className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {previewContext.participantCallPlan.first_question}
                              </p>
                            </div>
                          )}
                          {previewContext.participantCallPlan.cta && (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">CTA:</span> {previewContext.participantCallPlan.cta}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* No context message */}
                    {!previewContext.accountIntelligence &&
                     !previewContext.accountMessagingBrief &&
                     !previewContext.accountCallBrief && (
                      <div className="text-center py-6">
                        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No AI context generated yet
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Select campaign and account to view context
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
