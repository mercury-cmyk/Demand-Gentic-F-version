import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  Edit3,
  Globe,
  Loader2,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";

interface CampaignProvider {
  id: string;
  name: string;
  source: "database" | "environment";
}

interface BrevoInfrastructureOverview {
  provider: {
    id: string;
    name: string;
    source: "database" | "environment";
  };
  capabilities: {
    canManageSenders: boolean;
    canManageDomains: boolean;
    canManageDedicatedIpAssignments: boolean;
    canProvisionDedicatedIps: boolean;
  };
  stats: {
    senderCount: number;
    domainCount: number;
    dedicatedIpCount: number;
    matchedLocalSenders: number;
    matchedLocalDomains: number;
  };
  senders: Array;
  domains: Array;
    localMatch: {
      id: string | number;
      label: string;
      providerId: string | null;
      providerName: string | null;
    } | null;
  }>;
  dedicatedIps: Array;
  sectionErrors: {
    senders: string | null;
    domains: string | null;
    dedicatedIps: string | null;
  };
  syncedAt: string;
}

const emptySenderForm = {
  id: null as string | null,
  name: "",
  email: "",
  ips: "",
};

const emptyDomainForm = {
  domain: "",
};

function toneForFlag(value: boolean | null) {
  if (value === true) return "bg-green-100 text-green-800 border-green-200";
  if (value === false) return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function BrevoInfrastructureDialog({
  provider,
  open,
  onOpenChange,
  onSynced,
}: {
  provider: CampaignProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSynced: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [senderForm, setSenderForm] = useState(emptySenderForm);
  const [domainForm, setDomainForm] = useState(emptyDomainForm);
  const [tab, setTab] = useState("senders");

  useEffect(() => {
    if (!open) {
      setSenderForm(emptySenderForm);
      setDomainForm(emptyDomainForm);
      setTab("senders");
    }
  }, [open]);

  const overviewQuery = useQuery({
    queryKey: ["/api/email-management/providers", provider?.id, "brevo", "overview"],
    enabled: open && !!provider,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/email-management/providers/${provider!.id}/brevo/overview`);
      return response.json();
    },
  });

  const refreshOverview = () => {
    if (!provider) return;
    queryClient.invalidateQueries({
      queryKey: ["/api/email-management/providers", provider.id, "brevo", "overview"],
    });
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/email-management/providers/${provider!.id}/brevo/sync-to-dashboard`);
      return response.json();
    },
    onSuccess: (result: {
      importedSenders: number;
      updatedSenders: number;
      importedDomains: number;
      updatedDomains: number;
      skipped: string[];
    }) => {
      refreshOverview();
      onSynced();
      toast({
        title: "Brevo assets synced",
        description: `${result.importedSenders + result.updatedSenders} senders and ${result.importedDomains + result.updatedDomains} domains processed.`,
      });
      if (result.skipped.length) {
        toast({
          title: "Some assets were skipped",
          description: result.skipped[0],
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const saveSenderMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: senderForm.name,
        email: senderForm.email,
        ips: senderForm.ips
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };

      if (senderForm.id) {
        await apiRequest("PUT", `/api/email-management/providers/${provider!.id}/brevo/senders/${senderForm.id}`, payload);
        return;
      }

      await apiRequest("POST", `/api/email-management/providers/${provider!.id}/brevo/senders`, payload);
    },
    onSuccess: () => {
      setSenderForm(emptySenderForm);
      refreshOverview();
      toast({
        title: senderForm.id ? "Brevo sender updated" : "Brevo sender created",
        description: "The Brevo sender record has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sender save failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteSenderMutation = useMutation({
    mutationFn: async (senderId: string) => {
      await apiRequest("DELETE", `/api/email-management/providers/${provider!.id}/brevo/senders/${senderId}`);
    },
    onSuccess: () => {
      refreshOverview();
      toast({ title: "Brevo sender deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const validateSenderMutation = useMutation({
    mutationFn: async ({ senderId, otp }: { senderId: string; otp: string }) => {
      await apiRequest("POST", `/api/email-management/providers/${provider!.id}/brevo/senders/${senderId}/validate`, { otp });
    },
    onSuccess: () => {
      refreshOverview();
      toast({ title: "Brevo sender validated" });
    },
    onError: (error: Error) => {
      toast({ title: "Validation failed", description: error.message, variant: "destructive" });
    },
  });

  const createDomainMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/email-management/providers/${provider!.id}/brevo/domains`, domainForm);
    },
    onSuccess: () => {
      setDomainForm(emptyDomainForm);
      refreshOverview();
      toast({ title: "Brevo domain created" });
    },
    onError: (error: Error) => {
      toast({ title: "Domain create failed", description: error.message, variant: "destructive" });
    },
  });

  const authenticateDomainMutation = useMutation({
    mutationFn: async (domainName: string) => {
      await apiRequest("POST", `/api/email-management/providers/${provider!.id}/brevo/domains/${encodeURIComponent(domainName)}/authenticate`);
    },
    onSuccess: () => {
      refreshOverview();
      toast({ title: "Brevo domain authentication started" });
    },
    onError: (error: Error) => {
      toast({ title: "Authentication failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: async (domainName: string) => {
      await apiRequest("DELETE", `/api/email-management/providers/${provider!.id}/brevo/domains/${encodeURIComponent(domainName)}`);
    },
    onSuccess: () => {
      refreshOverview();
      toast({ title: "Brevo domain deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const overview = overviewQuery.data;

  return (
    
      
        
          Brevo Infrastructure
          
            Manage Brevo senders, sender domains, verification, and dedicated IP assignments inside the email governance dashboard for {provider?.name || "this provider"}.
          
        

        {overviewQuery.isLoading ? (
          
            
            Loading Brevo assets...
          
        ) : (
          
            
              
                
                  
                    Brevo Senders
                    {overview?.stats.senderCount || 0}
                  
                  
                    {overview?.stats.matchedLocalSenders || 0} already match dashboard sender profiles.
                  
                
                
                  
                    Brevo Domains
                    {overview?.stats.domainCount || 0}
                  
                  
                    {overview?.stats.matchedLocalDomains || 0} already match dashboard domain records.
                  
                
                
                  
                    Dedicated IPs
                    {overview?.stats.dedicatedIpCount || 0}
                  
                  
                    Change active IP assignment by editing a sender below.
                  
                
                
                  
                    Provider Source
                    {overview?.provider.source || provider?.source || "database"}
                  
                  
                    {overview?.provider.source === "environment"
                      ? "Environment-backed providers can manage Brevo live, but explicit local governance bindings require a saved provider."
                      : "Saved providers support explicit local sender/domain governance bindings."}
                  
                
              

              
                 refreshOverview()} disabled={overviewQuery.isFetching}>
                  
                  Refresh
                
                 syncMutation.mutate()} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ?  : }
                  Sync To Dashboard
                
              

              {(overview?.sectionErrors.senders || overview?.sectionErrors.domains || overview?.sectionErrors.dedicatedIps) && (
                
                  
                    {overview.sectionErrors.senders && {overview.sectionErrors.senders}}
                    {overview.sectionErrors.domains && {overview.sectionErrors.domains}}
                    {overview.sectionErrors.dedicatedIps && {overview.sectionErrors.dedicatedIps}}
                  
                
              )}

              
                
                  Senders
                  Domains
                  Dedicated IPs
                

                
                  
                    
                      {senderForm.id ? "Edit Brevo Sender" : "Create Brevo Sender"}
                      
                        Assign one or more dedicated IPs by comma-separating the IP values.
                      
                    
                    
                      
                        Name
                         setSenderForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="DemandGentic Marketing"
                        />
                      
                      
                        Email
                         setSenderForm((current) => ({ ...current, email: event.target.value }))}
                          placeholder="campaigns@example.com"
                        />
                      
                      
                        Dedicated IPs
                         setSenderForm((current) => ({ ...current, ips: event.target.value }))}
                          placeholder="1.2.3.4, 5.6.7.8"
                        />
                      
                    
                    
                      {senderForm.id && (
                         setSenderForm(emptySenderForm)}>
                          Cancel Edit
                        
                      )}
                       saveSenderMutation.mutate()}
                        disabled={!senderForm.name || !senderForm.email || saveSenderMutation.isPending}
                      >
                        {saveSenderMutation.isPending && }
                        {senderForm.id ? "Save Sender" : "Create Sender"}
                      
                    
                  

                  
                    {overview?.senders.map((sender) => (
                      
                        
                          
                            
                              
                                {sender.name}
                                
                                  {sender.verified ? "Verified" : "Needs verification"}
                                
                                
                                  {sender.active === false ? "Inactive" : "Active"}
                                
                              
                              {sender.email}
                            
                             {
                                if (window.confirm(`Delete Brevo sender "${sender.email}"?`)) {
                                  deleteSenderMutation.mutate(sender.id);
                                }
                              }}
                            >
                              
                            
                          
                        
                        
                          
                            
                              Domain
                              {sender.domain || "Unknown"}
                            
                            
                              Assigned IPs
                              {sender.ips.length ? sender.ips.join(", ") : "Shared / none assigned"}
                            
                          

                          {sender.localMatch ? (
                            
                              Matched dashboard sender: {sender.localMatch.label}
                              {sender.localMatch.providerName ? ` (${sender.localMatch.providerName})` : ""}
                            
                          ) : (
                            
                              No dashboard sender profile currently matches this Brevo sender. Use "Sync To Dashboard" to import it into governance settings.
                            
                          )}

                          
                            
                                setSenderForm({
                                  id: sender.id,
                                  name: sender.name,
                                  email: sender.email,
                                  ips: sender.ips.join(", "),
                                })
                              }
                            >
                              
                              Edit
                            
                             {
                                const otp = window.prompt(`Enter the Brevo OTP for ${sender.email}`);
                                if (otp) {
                                  validateSenderMutation.mutate({ senderId: sender.id, otp });
                                }
                              }}
                            >
                              
                              Validate OTP
                            
                          
                        
                      
                    ))}
                  

                  {overview && overview.senders.length === 0 && (
                    
                      
                        
                        No Brevo senders found for this provider yet.
                      
                    
                  )}
                

                
                  
                    
                      Create Brevo Domain
                      
                        Create the sender domain in Brevo first, then authenticate it and sync it into the local domain governance inventory.
                      
                    
                    
                      
                        Domain
                         setDomainForm({ domain: event.target.value })}
                          placeholder="mail.example.com"
                        />
                      
                      
                         createDomainMutation.mutate()}
                          disabled={!domainForm.domain || createDomainMutation.isPending}
                        >
                          {createDomainMutation.isPending && }
                          Create Domain
                        
                      
                    
                  

                  
                    {overview?.domains.map((domain) => (
                      
                        
                          
                            
                              
                                {domain.domain}
                                
                                  {domain.authenticated ? "Authenticated" : "Pending auth"}
                                
                                
                                  {domain.verified ? "Verified" : domain.status || "Pending"}
                                
                              
                              
                                {domain.localMatch
                                  ? `Matched to dashboard domain ${domain.localMatch.label}`
                                  : "Not yet represented in the local domain dashboard"}
                              
                            
                             {
                                if (window.confirm(`Delete Brevo domain "${domain.domain}"?`)) {
                                  deleteDomainMutation.mutate(domain.domain);
                                }
                              }}
                            >
                              
                            
                          
                        
                        
                          {domain.dnsRecords.length > 0 ? (
                            
                              {domain.dnsRecords.map((record) => (
                                
                                  
                                    {record.type}
                                    {record.status && {record.status}}
                                  
                                  {record.name}
                                  {record.value}
                                
                              ))}
                            
                          ) : (
                            
                              Brevo did not return DNS record details for this domain in the current response. Use Authenticate after DNS is in place, then Refresh.
                            
                          )}

                          
                             authenticateDomainMutation.mutate(domain.domain)}
                              disabled={authenticateDomainMutation.isPending}
                            >
                              
                              Authenticate
                            
                          
                        
                      
                    ))}
                  

                  {overview && overview.domains.length === 0 && (
                    
                      
                        
                        No Brevo sender domains found for this provider yet.
                      
                    
                  )}
                

                
                  
                    
                      Dedicated IP governance
                      
                        The documented Brevo API surface we verified supports listing dedicated IPs and assigning them to senders through sender create/update. We did not verify an endpoint that provisions brand-new dedicated IPs, so "add/change IP" in this dashboard is handled as sender IP assignment.
                      
                    
                  

                  
                    {overview?.dedicatedIps.map((entry) => (
                      
                        
                          
                            
                              {entry.ip}
                              {entry.name || entry.domain || "Dedicated IP"}
                            
                            {entry.status || "available"}
                          
                        
                        
                          
                            
                              Warmup
                              {entry.warmupStatus || "Unknown"}
                            
                            
                              Weight
                              {entry.weight ?? "Not set"}
                            
                          
                          
                          
                            Edit a sender in the Senders tab to assign or change this IP for outbound Brevo traffic.
                          
                        
                      
                    ))}
                  

                  {overview && overview.dedicatedIps.length === 0 && (
                    
                      
                        
                        No Brevo dedicated IPs were returned for this account or this API plan.
                      
                    
                  )}
                
              

              {overview?.syncedAt && (
                
                  Last refreshed {new Date(overview.syncedAt).toLocaleString()}
                
              )}
            
          
        )}
      
    
  );
}