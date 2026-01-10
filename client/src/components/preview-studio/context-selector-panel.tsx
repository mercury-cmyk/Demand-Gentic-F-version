import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      const data = await response.json();
      // Filter to call/combo campaigns
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

  // Get selected account name for display
  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const selectedContact = contacts.find(c => c.id === selectedContactId);

  return (
    <div className="p-4 space-y-6">
      {/* Campaign Selector */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
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
          <SelectTrigger>
            <SelectValue placeholder="Select a campaign..." />
          </SelectTrigger>
          <SelectContent>
            {campaignsLoading ? (
              <div className="p-2">
                <Skeleton className="h-8 w-full" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">No call campaigns found</div>
            ) : (
              campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  <div className="flex items-center gap-2">
                    <span>{campaign.name}</span>
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

      {/* Account Selector (Searchable) */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Account
        </Label>
        <Popover open={accountSearchOpen} onOpenChange={setAccountSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={accountSearchOpen}
              className="w-full justify-between"
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
                            contactId: null, // Reset contact when account changes
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
                          <span>{account.name}</span>
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
        <Label className="flex items-center gap-2">
          <User className="h-4 w-4" />
          Contact
          <span className="text-xs text-muted-foreground">(optional)</span>
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
          <SelectTrigger>
            <SelectValue placeholder={selectedAccountId ? "Select a contact..." : "Select account first"} />
          </SelectTrigger>
          <SelectContent>
            {contactsLoading ? (
              <div className="p-2">
                <Skeleton className="h-8 w-full" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">No contacts found</div>
            ) : (
              contacts.map((contact) => (
                <SelectItem key={contact.id} value={contact.id}>
                  <div className="flex flex-col">
                    <span>{contact.fullName || 'Unknown'}</span>
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

      <Separator />

      {/* Context Summary */}
      <div className="space-y-4">
        <h3 className="font-medium text-sm">Context Summary</h3>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : previewContext ? (
          <div className="space-y-3">
            {/* Campaign Context */}
            <Card className="bg-muted/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1">
                  <Megaphone className="h-3 w-3" />
                  Campaign Context
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3">
                {previewContext.campaign && (
                  <div className="space-y-1 text-xs">
                    <div><span className="font-semibold">Name:</span> {previewContext.campaign.name || 'N/A'}</div>
                    <div><span className="font-semibold">Type:</span> {previewContext.campaign.type || 'N/A'}</div>
                  </div>
                )}
                {!previewContext.campaign && (
                  <p className="text-xs text-muted-foreground">Not available</p>
                )}
              </CardContent>
            </Card>

            {/* Contact Context */}
            <Card className="bg-muted/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Contact Context
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3">
                {previewContext.contact && (
                  <div className="space-y-1 text-xs">
                    <div><span className="font-semibold">Name:</span> {previewContext.contact.fullName || 'N/A'}</div>
                    <div><span className="font-semibold">Title:</span> {previewContext.contact.jobTitle || 'N/A'}</div>
                    <div><span className="font-semibold">Email:</span> {previewContext.contact.email || 'N/A'}</div>
                  </div>
                )}
                {!previewContext.contact && (
                  <p className="text-xs text-muted-foreground">Not available</p>
                )}
              </CardContent>
            </Card>

            {/* Account Intelligence */}
            <Card className="bg-muted/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  Account Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3">
                {previewContext.accountIntelligence ? (
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={previewContext.accountIntelligence.confidence > 0.7 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {Math.round((previewContext.accountIntelligence.confidence || 0) * 100)}% confidence
                      </Badge>
                    </div>
                    {previewContext.accountIntelligence.problem_hypothesis && (
                      <p className="text-muted-foreground line-clamp-2">
                        {previewContext.accountIntelligence.problem_hypothesis}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not generated</p>
                )}
              </CardContent>
            </Card>

            {/* Messaging Brief */}
            <Card className="bg-muted/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Messaging Brief
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3">
                {previewContext.accountMessagingBrief ? (
                  <div className="space-y-1 text-xs">
                    {previewContext.accountMessagingBrief.posture && (
                      <Badge variant="outline" className="text-xs">
                        {previewContext.accountMessagingBrief.posture}
                      </Badge>
                    )}
                    {previewContext.accountMessagingBrief.problem && (
                      <p className="text-muted-foreground line-clamp-2">
                        {previewContext.accountMessagingBrief.problem}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not generated</p>
                )}
              </CardContent>
            </Card>

            {/* Call Brief */}
            <Card className="bg-muted/50">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  Call Brief
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-3">
                {previewContext.accountCallBrief ? (
                  <div className="space-y-1 text-xs">
                    {previewContext.accountCallBrief.opening_posture && (
                      <Badge variant="outline" className="text-xs">
                        {previewContext.accountCallBrief.opening_posture}
                      </Badge>
                    )}
                    {previewContext.accountCallBrief.theme && (
                      <p className="text-muted-foreground line-clamp-2">
                        {previewContext.accountCallBrief.theme}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not generated</p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>Select campaign and account to view context</span>
          </div>
        )}
      </div>
    </div>
  );
}
