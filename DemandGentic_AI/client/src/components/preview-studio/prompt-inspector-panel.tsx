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
  icon: React.ComponentType;
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
    
      
        
          
            
              
              {title}
              
                ~{Math.ceil(content.length / 4)} tokens
              
            
            
          
        
        
          
          
            
              {copied ? (
                
              ) : (
                
              )}
            
            
              
                {content}
              
            
          
        
      
    
  );
}

export function PromptInspectorPanel({
  campaignId,
  accountId,
  contactId,
}: PromptInspectorPanelProps) {
  const [copied, setCopied] = useState(false);

  const { data: promptData, isLoading, error } = useQuery({
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
      
        
        
        
        
      
    );
  }

  if (error || !promptData) {
    return (
      
        
          
          Could Not Load Prompt
          
            Failed to assemble the system prompt for this context.
          
        
      
    );
  }

  return (
    
      {/* Summary Card */}
      
        
          
            
              
                
                Assembled System Prompt
              
              
                
                Total: ~{promptData.tokenCount.toLocaleString()} tokens
              
            
            
              {copied ? (
                <>
                  
                  Copied
                
              ) : (
                <>
                  
                  Copy Full Prompt
                
              )}
            
          
        
      

      {/* First Message */}
      {promptData.firstMessage && (
        
          
            
              
              Opening Message
            
          
          
            
              "{promptData.firstMessage}"
            
          
        
      )}

      {/* Prompt Sections */}
      
        Prompt Sections

        

        

        

        

        
      

      {/* Full Prompt (Collapsed by Default) */}
      
        
          
            
              
                
                Full Assembled Prompt
                Raw
              
              
            
          
          
            
            
              
                {promptData.systemPrompt}
              
            
          
        
      
    
  );
}