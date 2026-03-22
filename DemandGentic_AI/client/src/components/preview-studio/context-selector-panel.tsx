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
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
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
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
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
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
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
    
      {/* Selectors */}
      
        {/* Campaign Selector */}
        
          
            
            Campaign
          
          
              onSelectionChange({
                campaignId: value || null,
                accountId: selectedAccountId,
                contactId: selectedContactId,
              })
            }
          >
            
              
            
            
              {campaignsLoading ? (
                
                  
                
              ) : campaigns.length === 0 ? (
                
                  No call campaigns found
                
              ) : (
                campaigns.map((campaign) => (
                  
                    
                      {campaign.name}
                      
                        {campaign.type}
                      
                    
                  
                ))
              )}
            
          
        

        {/* Account Selector */}
        
          
            
            Account
          
          
            
              
                {selectedAccount ? (
                  {selectedAccount.name}
                ) : (
                  Search accounts...
                )}
                
              
            
            
              
                
                
                  No accounts found.
                  
                    {accountsLoading ? (
                      
                        
                      
                    ) : (
                      accounts.map((account) => (
                         {
                            onSelectionChange({
                              campaignId: selectedCampaignId,
                              accountId: account.id,
                              contactId: null,
                            });
                            setAccountSearchOpen(false);
                          }}
                        >
                          
                          
                            {account.name}
                            {account.domain && (
                              {account.domain}
                            )}
                          
                        
                      ))
                    )}
                  
                
              
            
          
        

        {/* Contact Selector */}
        
          
            
            Contact
            (optional)
          
          
              onSelectionChange({
                campaignId: selectedCampaignId,
                accountId: selectedAccountId,
                contactId: value || null,
              })
            }
            disabled={!selectedAccountId}
          >
            
              
            
            
              {contactsLoading ? (
                
                  
                
              ) : contacts.length === 0 ? (
                
                  No contacts found
                
              ) : (
                contacts.map((contact) => (
                  
                    
                      {contact.fullName || 'Unknown'}
                      {contact.jobTitle && (
                        {contact.jobTitle}
                      )}
                    
                  
                ))
              )}
            
          
        
      

      

      {/* Context Summary */}
      
        
          
            
              
                
                AI Context Summary
              
              
            
          
          
            
              
                {isLoading ? (
                  
                    
                    
                    
                  
                ) : previewContext ? (
                  <>
                    {/* Selected Context */}
                    {(previewContext.campaign || previewContext.account || previewContext.contact) && (
                      
                        
                          {previewContext.campaign && (
                            
                              
                              {previewContext.campaign.name}
                            
                          )}
                          {previewContext.account && (
                            
                              
                              {previewContext.account.name}
                            
                          )}
                          {previewContext.contact && (
                            
                              
                              {previewContext.contact.fullName}
                              {previewContext.contact.jobTitle && (
                                
                                  - {previewContext.contact.jobTitle}
                                
                              )}
                            
                          )}
                        
                      
                    )}

                    {/* Account Intelligence */}
                    {previewContext.accountIntelligence && (
                      
                        
                          
                            
                            Account Intelligence
                             0.7 ? "default" : "secondary"}
                              className="text-xs ml-auto"
                            >
                              {Math.round((previewContext.accountIntelligence.confidence || 0) * 100)}%
                            
                          
                        
                        
                          {previewContext.accountIntelligence.problem_hypothesis && (
                            
                              {previewContext.accountIntelligence.problem_hypothesis}
                            
                          )}
                        
                      
                    )}

                    {/* Messaging Brief */}
                    {previewContext.accountMessagingBrief && (
                      
                        
                          
                            
                            Messaging Brief
                            {previewContext.accountMessagingBrief.posture && (
                              
                                {previewContext.accountMessagingBrief.posture}
                              
                            )}
                          
                        
                        
                          {previewContext.accountMessagingBrief.problem && (
                            
                              {previewContext.accountMessagingBrief.problem}
                            
                          )}
                        
                      
                    )}

                    {/* Call Brief */}
                    {previewContext.accountCallBrief && (
                      
                        
                          
                            
                            Call Brief
                            {previewContext.accountCallBrief.opening_posture && (
                              
                                {previewContext.accountCallBrief.opening_posture}
                              
                            )}
                          
                        
                        
                          {previewContext.accountCallBrief.theme && (
                            
                              {previewContext.accountCallBrief.theme}
                            
                          )}
                        
                      
                    )}

                    {/* Participant Call Plan */}
                    {previewContext.participantCallPlan && (
                      
                        
                          
                            
                            Call Plan
                          
                        
                        
                          {previewContext.participantCallPlan.first_question && (
                            
                              
                              
                                {previewContext.participantCallPlan.first_question}
                              
                            
                          )}
                          {previewContext.participantCallPlan.cta && (
                            
                              CTA: {previewContext.participantCallPlan.cta}
                            
                          )}
                        
                      
                    )}

                    {/* No context message */}
                    {!previewContext.accountIntelligence &&
                     !previewContext.accountMessagingBrief &&
                     !previewContext.accountCallBrief && (
                      
                        
                        
                          No AI context generated yet
                        
                      
                    )}
                  
                ) : (
                  
                    
                    
                      Select campaign and account to view context
                    
                  
                )}
              
            
          
        
      
    
  );
}