import type { Account } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Link as LinkIcon, Plus, ListPlus, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AccountHeaderProps {
  account: Account;
}

export function AccountHeader({ account }: AccountHeaderProps) {
  const { toast } = useToast();
  const domain = account.websiteDomain || account.domain;

  const handleAction = (action: string) => {
    toast({
      title: `${action} triggered`,
      description: "Action wiring coming soon.",
    });
  };

  return (
    
      
        
          
            {account.name}
            {account.industryStandardized && (
              {account.industryStandardized}
            )}
          
          {domain && (
            
              
              {domain}
            
          )}
          {account.linkedinUrl && (
            
              
              LinkedIn Company Page
            
          )}
        
        
           handleAction("Add contact")}>
            
            Add Contact
          
           handleAction("Add tag")}
          >
            
            Add Tag
          
           handleAction("Add to list")}
          >
            
            Add to List
          
        
      
    
  );
}