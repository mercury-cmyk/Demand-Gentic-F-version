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
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [provider, setProvider] = useState("openai");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showLayers, setShowLayers] = useState(true);

  // Fetch accounts for the campaign
  const { data: accountsData } = useQuery({
    queryKey: [`/api/knowledge-blocks/campaigns/${campaignId}/accounts`],
    enabled: !!campaignId,
  });

  // Fetch contacts for selected account
  const { data: contactsData } = useQuery({
    queryKey: [`/api/knowledge-blocks/accounts/${selectedAccountId}/contacts`],
    enabled: !!selectedAccountId,
  });

  // Fetch runtime prompt
  const { data: promptData, isLoading, refetch } = useQuery({
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
    
      
        
          
          Runtime Prompt Viewer
        
        
          Preview the exact system prompt that will be sent to the AI model for any account/contact combination.
        
      
      
        {/* Context Selection */}
        
          {/* Account Selector */}
          
            Account Context
            
              
                
              
              
                No account (base prompt only)
                {accounts.map((account) => (
                  
                    {account.name}
                  
                ))}
              
            
          

          {/* Contact Selector */}
          
            Contact Context
            
              
                
              
              
                No contact (account only)
                {contacts.map((contact) => (
                  
                    {contact.firstName} {contact.lastName} ({contact.email})
                  
                ))}
              
            
          

          {/* Provider Selector */}
          
            Voice Provider
             setProvider(v as "openai" | "google")}>
              
                OpenAI
                Gemini
              
            
          
        

        {/* Metadata Bar */}
        {runtime && (
          
            
              {runtime.source === "blocks" ? "Knowledge Blocks" : "Legacy"}
            
            
              
              {runtime.totalTokens.toLocaleString()} tokens
            
            |
            
              {runtime.promptHash}
            
            |
            
              
              {new Date(runtime.assembledAt).toLocaleTimeString()}
            
          
        )}

        {/* Layer Breakdown */}
        {runtime && (
          
            
              {showLayers ?  : }
              Prompt Layers
            
            
              
                {/* Knowledge Layer */}
                
                  
                    
                    Knowledge Blocks
                  
                  
                    Tokens: {runtime.layers.knowledge.tokens.toLocaleString()}
                    Source: {runtime.layers.knowledge.source}
                  
                

                {/* Account Layer */}
                
                  
                    
                    Account Context
                  
                  {runtime.layers.account ? (
                    
                      {runtime.layers.account.name}
                      {runtime.layers.account.domain}
                    
                  ) : (
                    Not selected
                  )}
                

                {/* Contact Layer */}
                
                  
                    
                    Contact Context
                  
                  {runtime.layers.contact ? (
                    
                      {runtime.layers.contact.name}
                      {runtime.layers.contact.email}
                    
                  ) : (
                    Not selected
                  )}
                
              
            
          
        )}

        {/* Actions */}
        
           refetch()}>
            
            Refresh
          
          
            {copiedPrompt ?  : }
            Copy Prompt
          
        

        {/* Prompt Content */}
        
          
            
            Full System Prompt
            {runtime && (
              
                {provider === "openai" ? "OpenAI Format" : "Gemini Format"}
              
            )}
          
          
            {isLoading ? (
              
                
                
                
                
              
            ) : (
              
                {runtime?.prompt || "No prompt available. Select an account/contact to preview the runtime prompt."}
              
            )}
          
        

        {/* Footer Info */}
        {runtime && (
          
            Campaign: {runtime.campaign.name} ({runtime.campaign.id})
          
        )}
      
    
  );
}