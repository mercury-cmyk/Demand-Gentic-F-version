import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, CheckCircle2, XCircle, AlertCircle, Copy, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DomainAuth } from "@shared/schema";

export function DomainAuthDialog() {
  const { toast } = useToast();
  const [newDomain, setNewDomain] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const { data: domains = [], isLoading, error } = useQuery({
    queryKey: ["/api/domain-auth"],
  });

  console.log("DomainAuthDialog: domains", domains);
  console.log("DomainAuthDialog: error", error);
  console.log("DomainAuthDialog: isLoading", isLoading);

  const createMutation = useMutation({
    mutationFn: async (domain: string) => {
      return await apiRequest("POST", "/api/domain-auth", { domain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/domain-auth"] });
      setNewDomain("");
      setIsAdding(false);
      toast({
        title: "Domain added",
        description: "Please configure your DNS records.",
      });
    },
    onError: (error: Error) => {
      // Parse error message
      let message = "Failed to add domain.";
      try {
        const parts = error.message.split(': ');
        if (parts.length > 1) {
           const jsonStr = parts.slice(1).join(': ');
           const data = JSON.parse(jsonStr);
           if (data.message) message = data.message;
        }
      } catch (e) {
        // ignore
      }
      
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/domain-auth/${id}/verify`);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/domain-auth"] });
      toast({
        title: "Verification completed",
        description: `SPF: ${data.spfStatus}, DKIM: ${data.dkimStatus}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Verification failed.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      console.log("[Domain Delete] Deleting domain with id:", id);
      return await apiRequest("DELETE", `/api/domain-auth/${id}`);
    },
    onSuccess: async () => {
      console.log("[Domain Delete] Success, refetching domains");
      await queryClient.invalidateQueries({ queryKey: ["/api/domain-auth"], refetchType: 'active' });
      await queryClient.refetchQueries({ queryKey: ["/api/domain-auth"] });
      toast({
        title: "Domain deleted",
        description: "The domain has been removed.",
      });
    },
    onError: (error) => {
      console.error("[Domain Delete] Error:", error);
      toast({
        title: "Error",
        description: "Failed to delete domain.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record = {
      verified: "default",
      pending: "secondary",
      failed: "destructive",
    };
    return {status};
  };

  return (
    
      
        Manage Domains
      
      
        
          Domain Authentication
          
            Manage your sender domains and verify DNS records (SPF, DKIM, DMARC).
          
        

        
          
            
              Add New Domain
               setNewDomain(e.target.value)}
              />
            
             createMutation.mutate(newDomain)} disabled={!newDomain || createMutation.isPending}>
              
              Add Domain
            
          

          
            
              
                
                  Domain
                  SPF
                  DKIM
                  DMARC
                  Actions
                
              
              
                {domains.length === 0 ? (
                  
                    
                      No domains added yet.
                    
                  
                ) : (
                  domains.map((domain) => (
                    
                      {domain.domain}
                      {getStatusBadge(domain.spfStatus)}
                      {getStatusBadge(domain.dkimStatus)}
                      {getStatusBadge(domain.dmarcStatus)}
                      
                         verifyMutation.mutate(domain.id)}
                          disabled={verifyMutation.isPending}
                        >
                          
                          Verify
                        
                         deleteMutation.mutate(domain.id)}
                          disabled={deleteMutation.isPending}
                        >
                          
                          Delete
                        
                      
                    
                  ))
                )}
              
            
          

          
            
              
              DNS Configuration Instructions (Mailgun)
            
            To verify your domain with Mailgun, add the following records to your DNS provider:
            
              SPF (TXT): v=spf1 include:mailgun.org ~all
              MX: mxa.mailgun.org (10), mxb.mailgun.org (10)
              DKIM (TXT): Check Mailgun dashboard for selector (e.g., pic._domainkey)
              DMARC (TXT): v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
            
          
        
      
    
  );
}