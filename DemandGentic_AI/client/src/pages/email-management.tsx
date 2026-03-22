import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { BrevoInfrastructureDialog } from "@/components/email/brevo-infrastructure-dialog";

type EmailManagementTab = "providers" | "senders" | "domains";
type CampaignProviderKey = "mailgun" | "brevo" | "brainpool" | "custom";
type CampaignProviderTransport = "mailgun_api" | "brevo_api" | "smtp";

interface CampaignProvider {
  id: string;
  providerKey: string;
  name: string;
  description: string | null;
  transport: CampaignProviderTransport;
  isEnabled: boolean;
  isDefault: boolean;
  priority: number;
  apiDomain: string | null;
  apiRegion: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  smtpUsername: string | null;
  defaultFromEmail: string | null;
  defaultFromName: string | null;
  replyToEmail: string | null;
  dnsProfile: {
    spfInclude?: string;
    dkimSelector?: string;
    dkimValue?: string;
    trackingHost?: string;
    trackingValue?: string;
    setupNotes?: string;
  };
  sendingProfile: {
    rateLimitPerMinute?: number;
    dailyCap?: number;
    warmupMode?: boolean;
  };
  healthStatus: string;
  lastHealthCheck: string | null;
  lastHealthError: string | null;
  apiKeyConfigured: boolean;
  smtpPasswordConfigured: boolean;
  source: "database" | "environment";
}

interface EmailManagementOverview {
  providers: CampaignProvider[];
  providerCount: number;
  healthyProviders: number;
  defaultProviderId: string | null;
  senderBindingCount: number;
  domainBindingCount: number;
}

interface BrevoActivationResult {
  providerId: string;
  providerName: string;
  materializedProvider: boolean;
  defaultProviderSet: boolean;
  defaultSenderSet: boolean;
  activatedSenderCount: number;
  activatedDomainCount: number;
  defaultSenderEmail: string | null;
  importedSenders: number;
  updatedSenders: number;
  importedDomains: number;
  updatedDomains: number;
  skipped: string[];
}

interface ManagedSenderProfile {
  id: string;
  name: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  isDefault: boolean | null;
  isActive: boolean | null;
  warmupStatus: string | null;
  campaignProviderId: string | null;
  campaignProvider: CampaignProvider | null;
  hasExplicitCampaignProviderBinding: boolean;
}

interface ManagedDomain {
  id: number;
  domain: string;
  spfStatus: "pending" | "verified" | "failed";
  dkimStatus: "pending" | "verified" | "failed";
  dmarcStatus: "pending" | "verified" | "failed";
  trackingDomainStatus: "pending" | "verified" | "failed";
  lastCheckedAt: string | null;
  createdAt: string;
  healthScore: number | null;
  warmupPhase: string;
  campaignProviderId: string | null;
  campaignProvider: CampaignProvider | null;
  configuration: {
    domainPurpose: string;
    subdomain: string | null;
    generatedSpfRecord: string | null;
    generatedDkimSelector: string | null;
    generatedDkimRecord: string | null;
    generatedDmarcRecord: string | null;
    generatedTrackingCname: string | null;
  } | null;
}

const DEFAULT_PROVIDER_OPTION = "default-routing";

const blankProviderForm = {
  providerKey: "mailgun" as CampaignProviderKey,
  name: "",
  description: "",
  isDefault: false,
  defaultFromEmail: "",
  defaultFromName: "",
  replyToEmail: "",
  apiDomain: "",
  apiKey: "",
  apiRegion: "US",
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
  spfInclude: "",
  dkimSelector: "",
  dkimValue: "",
  trackingHost: "",
  trackingValue: "",
};

const blankSenderForm = {
  name: "",
  fromName: "",
  fromEmail: "",
  replyToEmail: "",
  isDefault: false,
  isActive: true,
  campaignProviderId: DEFAULT_PROVIDER_OPTION,
};

const blankDomainForm = {
  domain: "",
  subdomain: "",
  purpose: "marketing" as "marketing" | "transactional" | "both",
  providerId: DEFAULT_PROVIDER_OPTION,
  region: "US" as "US" | "EU",
};

function getStatusTone(status: string) {
  if (status === "healthy" || status === "verified") {
    return "bg-green-100 text-green-800 border-green-200";
  }

  if (status === "degraded" || status === "failed") {
    return "bg-red-100 text-red-800 border-red-200";
  }

  return "bg-amber-100 text-amber-800 border-amber-200";
}

function formatProviderType(provider: CampaignProvider) {
  if (provider.providerKey === "brevo") return "Brevo";
  if (provider.providerKey === "brainpool") return "Brainpool";
  if (provider.providerKey === "mailgun") return "Mailgun";
  if (provider.providerKey === "custom") return "Custom SMTP";
  return provider.providerKey;
}

function formatTransportLabel(transport: CampaignProviderTransport) {
  if (transport === "mailgun_api") return "Mailgun API";
  if (transport === "brevo_api") return "Brevo API";
  return "SMTP";
}

function DnsPreview({ domain }: { domain: ManagedDomain }) {
  const { toast } = useToast();
  const records = useMemo(() => {
    if (!domain.configuration) return [];

    const rows = [
      domain.configuration.generatedSpfRecord
        ? {
            label: "SPF",
            name: domain.domain,
            value: domain.configuration.generatedSpfRecord,
          }
        : null,
      domain.configuration.generatedDkimRecord
        ? {
            label: "DKIM",
            name: `${domain.configuration.generatedDkimSelector || "mail"}._domainkey.${domain.domain}`,
            value: domain.configuration.generatedDkimRecord,
          }
        : null,
      domain.configuration.generatedDmarcRecord
        ? {
            label: "DMARC",
            name: `_dmarc.${domain.domain}`,
            value: domain.configuration.generatedDmarcRecord,
          }
        : null,
      domain.configuration.generatedTrackingCname
        ? {
            label: "Tracking",
            name: `${domain.campaignProvider?.dnsProfile?.trackingHost || "email"}.${domain.domain}`,
            value: domain.configuration.generatedTrackingCname,
          }
        : null,
    ];

    return rows.filter(Boolean) as Array;
  }, [domain]);

  if (!records.length) return null;

  return (
    
      {records.map((record) => (
        
          
            {record.label}
             {
                navigator.clipboard.writeText(record.value);
                toast({ title: "Copied", description: `${record.label} value copied.` });
              }}
            >
              
              Copy
            
          
          
            {record.name}
            {record.value}
          
        
      ))}
    
  );
}

export default function EmailManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialTab = (() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "senders" || tab === "domains" || tab === "providers") {
      return tab;
    }
    return "providers";
  })();

  const [tab, setTab] = useState(initialTab);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [senderDialogOpen, setSenderDialogOpen] = useState(false);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [providerForm, setProviderForm] = useState(blankProviderForm);
  const [senderForm, setSenderForm] = useState(blankSenderForm);
  const [domainForm, setDomainForm] = useState(blankDomainForm);
  const [dnsExpandedId, setDnsExpandedId] = useState(null);
  const [testProvider, setTestProvider] = useState(null);
  const [testEmail, setTestEmail] = useState("");
  const [brevoProvider, setBrevoProvider] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") !== tab) {
      params.set("tab", tab);
      const next = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, "", next);
    }
  }, [tab]);

  const { data: overview } = useQuery({
    queryKey: ["/api/email-management/overview"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/email-management/overview");
      return response.json();
    },
  });

  const { data: providers = [], isLoading: providersLoading } = useQuery({
    queryKey: ["/api/email-management/providers"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/email-management/providers");
      return response.json();
    },
  });

  const { data: senderProfiles = [], isLoading: sendersLoading } = useQuery({
    queryKey: ["/api/email-management/sender-profiles"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/email-management/sender-profiles");
      return response.json();
    },
  });

  const { data: domains = [], isLoading: domainsLoading } = useQuery({
    queryKey: ["/api/email-management/domains"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/email-management/domains");
      return response.json();
    },
  });

  const defaultProviderId =
    overview?.defaultProviderId ||
    providers.find((provider) => provider.isDefault)?.id ||
    DEFAULT_PROVIDER_OPTION;

  const refreshProviders = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/email-management/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/email-management/providers"] });
  };

  const refreshSenders = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/email-management/sender-profiles"] });
  };

  const refreshDomains = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/email-management/domains"] });
  };

  const createProviderMutation = useMutation({
    mutationFn: async () => {
      const payload: Record = {
        providerKey: providerForm.providerKey,
        name: providerForm.name,
        description: providerForm.description,
        isDefault: providerForm.isDefault,
        isEnabled: true,
        defaultFromEmail: providerForm.defaultFromEmail || undefined,
        defaultFromName: providerForm.defaultFromName || undefined,
        replyToEmail: providerForm.replyToEmail || undefined,
      };

      if (providerForm.providerKey === "mailgun") {
        payload.transport = "mailgun_api";
        payload.apiDomain = providerForm.apiDomain;
        payload.apiKey = providerForm.apiKey;
        payload.apiRegion = providerForm.apiRegion;
      } else if (providerForm.providerKey === "brevo") {
        payload.transport = "brevo_api";
        payload.apiKey = providerForm.apiKey;
      } else {
        payload.transport = "smtp";
        payload.smtpHost = providerForm.smtpHost;
        payload.smtpPort = Number(providerForm.smtpPort);
        payload.smtpSecure = providerForm.smtpSecure;
        payload.smtpUsername = providerForm.smtpUsername;
        payload.smtpPassword = providerForm.smtpPassword;
      }

      if (
        providerForm.spfInclude ||
        providerForm.dkimSelector ||
        providerForm.dkimValue ||
        providerForm.trackingHost ||
        providerForm.trackingValue
      ) {
        payload.dnsProfile = {
          spfInclude: providerForm.spfInclude || undefined,
          dkimSelector: providerForm.dkimSelector || undefined,
          dkimValue: providerForm.dkimValue || undefined,
          trackingHost: providerForm.trackingHost || undefined,
          trackingValue: providerForm.trackingValue || undefined,
        };
      }

      const response = await apiRequest("POST", "/api/email-management/providers", payload);
      return response.json();
    },
    onSuccess: () => {
      refreshProviders();
      setProviderDialogOpen(false);
      setProviderForm(blankProviderForm);
      toast({ title: "Provider added", description: "Campaign email provider created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Provider error", description: error.message, variant: "destructive" });
    },
  });

  const verifyProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await apiRequest("POST", `/api/email-management/providers/${providerId}/verify`);
      return response.json();
    },
    onSuccess: () => {
      refreshProviders();
      toast({ title: "Verification complete", description: "Provider health check finished." });
    },
    onError: (error: Error) => {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    },
  });

  const setDefaultProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await apiRequest("POST", `/api/email-management/providers/${providerId}/set-default`);
      return response.json();
    },
    onSuccess: () => {
      refreshProviders();
      refreshSenders();
      refreshDomains();
      toast({ title: "Default provider updated", description: "Campaign routing will use the new default." });
    },
    onError: (error: Error) => {
      toast({ title: "Default update failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await apiRequest("DELETE", `/api/email-management/providers/${providerId}`);
      return response.json();
    },
    onSuccess: () => {
      refreshProviders();
      refreshSenders();
      refreshDomains();
      toast({ title: "Provider removed", description: "Provider and its explicit bindings were removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const testSendMutation = useMutation({
    mutationFn: async ({ providerId, to }: { providerId: string; to: string }) => {
      const response = await apiRequest("POST", `/api/email-management/providers/${providerId}/test-send`, {
        to,
        subject: "DemandGentic campaign email provider test",
        html: "This is a live provider test from campaign email management.",
      });
      return response.json();
    },
    onSuccess: () => {
      setTestProvider(null);
      setTestEmail("");
      toast({ title: "Test email sent", description: "Check the destination inbox for delivery." });
    },
    onError: (error: Error) => {
      toast({ title: "Test send failed", description: error.message, variant: "destructive" });
    },
  });

  const activateBrevoMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await apiRequest("POST", `/api/email-management/providers/${providerId}/brevo/activate-for-campaigns`, {
        makeDefaultProvider: true,
        makeDefaultSender: true,
      });
      return response.json() as Promise;
    },
    onSuccess: (result) => {
      refreshProviders();
      refreshSenders();
      refreshDomains();
      toast({
        title: "Brevo activated for campaigns",
        description: `${result.activatedSenderCount} senders and ${result.activatedDomainCount} domains are now governed for campaign routing.`,
      });

      if (result.skipped.length) {
        toast({
          title: "Some Brevo assets were skipped",
          description: result.skipped[0],
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Brevo activation failed", description: error.message, variant: "destructive" });
    },
  });

  const createSenderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/email-management/sender-profiles", {
        name: senderForm.name,
        fromName: senderForm.fromName,
        fromEmail: senderForm.fromEmail,
        replyToEmail: senderForm.replyToEmail || undefined,
        isDefault: senderForm.isDefault,
        isActive: senderForm.isActive,
        campaignProviderId:
          senderForm.campaignProviderId === DEFAULT_PROVIDER_OPTION
            ? null
            : senderForm.campaignProviderId,
      });
      return response.json();
    },
    onSuccess: () => {
      refreshSenders();
      setSenderDialogOpen(false);
      setSenderForm(blankSenderForm);
      toast({ title: "Sender created", description: "Sender profile added to campaign email management." });
    },
    onError: (error: Error) => {
      toast({ title: "Sender error", description: error.message, variant: "destructive" });
    },
  });

  const bindSenderMutation = useMutation({
    mutationFn: async ({ senderId, providerId }: { senderId: string; providerId: string }) => {
      const response = await apiRequest("POST", `/api/email-management/sender-profiles/${senderId}/provider-binding`, {
        providerId: providerId === DEFAULT_PROVIDER_OPTION ? null : providerId,
      });
      return response.json();
    },
    onSuccess: () => {
      refreshSenders();
      refreshProviders();
      toast({ title: "Sender routing updated", description: "Sender profile routing has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Routing update failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteSenderMutation = useMutation({
    mutationFn: async (senderId: string) => {
      const response = await apiRequest("DELETE", `/api/email-management/sender-profiles/${senderId}`);
      return response.json();
    },
    onSuccess: () => {
      refreshSenders();
      toast({ title: "Sender removed", description: "Sender profile deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const createDomainMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/email-management/domains", {
        domain: domainForm.domain,
        subdomain: domainForm.subdomain || undefined,
        purpose: domainForm.purpose,
        providerId: domainForm.providerId === DEFAULT_PROVIDER_OPTION ? null : domainForm.providerId,
        region: domainForm.region,
      });
      return response.json();
    },
    onSuccess: () => {
      refreshDomains();
      setDomainDialogOpen(false);
      setDomainForm({ ...blankDomainForm, providerId: defaultProviderId, region: "US" });
      toast({ title: "Domain added", description: "Domain created with provider-aware DNS guidance." });
    },
    onError: (error: Error) => {
      toast({ title: "Domain error", description: error.message, variant: "destructive" });
    },
  });

  const bindDomainMutation = useMutation({
    mutationFn: async ({ domainId, providerId }: { domainId: number; providerId: string }) => {
      const response = await apiRequest("POST", `/api/email-management/domains/${domainId}/provider-binding`, {
        providerId: providerId === DEFAULT_PROVIDER_OPTION ? null : providerId,
        regenerateRecords: true,
      });
      return response.json();
    },
    onSuccess: () => {
      refreshDomains();
      refreshProviders();
      toast({
        title: "Domain routing updated",
        description: "Provider binding changed and DNS records were regenerated.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Binding failed", description: error.message, variant: "destructive" });
    },
  });

  const validateDomainMutation = useMutation({
    mutationFn: async (domainId: number) => {
      const response = await apiRequest("POST", `/api/email-management/domains/${domainId}/validate`);
      return response.json();
    },
    onSuccess: () => {
      refreshDomains();
      toast({ title: "Validation complete", description: "DNS records were checked against the selected provider." });
    },
    onError: (error: Error) => {
      toast({ title: "Validation failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: async (domainId: number) => {
      const response = await apiRequest("DELETE", `/api/email-management/domains/${domainId}`);
      return response.json();
    },
    onSuccess: () => {
      refreshDomains();
      toast({ title: "Domain removed", description: "Domain configuration deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    setDomainForm((current) => {
      if (current.providerId !== DEFAULT_PROVIDER_OPTION) return current;
      if (defaultProviderId === DEFAULT_PROVIDER_OPTION) return current;
      return { ...current, providerId: defaultProviderId };
    });
  }, [defaultProviderId]);

  return (
    
      
        
          
            
              Campaign Email Management
            
            
              Unified campaign email routing, domains, and senders
              
                Manage Mailgun, Brevo, and Brainpool in one place, bind domains and senders safely, and switch default routing from the UI without scattering campaign email settings across multiple pages.
              
            
          
          
            
              
                Providers
                {overview?.providerCount || 0}
              
              
                {overview?.healthyProviders || 0} healthy and routable
              
            
            
              
                Sender Bindings
                {overview?.senderBindingCount || 0}
              
              
                {senderProfiles.length} sender identities managed
              
            
            
              
                Domain Bindings
                {overview?.domainBindingCount || 0}
              
              
                {domains.length} domains with provider-aware DNS
              
            
            
              
                Default Provider
                
                  {providers.find((provider) => provider.id === overview?.defaultProviderId)?.name || "Environment fallback"}
                
              
              
                Intelligent fallback remains available when explicit bindings are absent.
              
            
          
        
      

       setTab(value as EmailManagementTab)} className="space-y-6">
        
          Providers
          Senders
          Domains
        

        
          
            
              Campaign Providers
              
                Mailgun and Brevo use API transport. Brainpool is configured through SMTP with provider-specific DNS guidance.
              
            
             setProviderDialogOpen(true)}>
              
              Add Provider
            
          

          {providersLoading ? (
            
              
              Loading providers...
            
          ) : (
            
              {providers.map((provider) => (
                
                  
                    
                      
                        
                          {provider.name}
                          {formatProviderType(provider)}
                          {provider.isDefault && Default}
                          {provider.source === "environment" && Environment}
                        
                        {provider.description || "Campaign routing provider"}
                      
                      
                        {provider.healthStatus}
                      
                    
                  
                  
                    
                      
                        Transport
                        {formatTransportLabel(provider.transport)}
                      
                      
                        Default From
                        {provider.defaultFromEmail || "Not set"}
                      
                      
                        Rate Limit
                        {provider.sendingProfile.rateLimitPerMinute || 0}/min
                      
                      
                        Daily Cap
                        {provider.sendingProfile.dailyCap || 0}/day
                      
                    

                    
                      {provider.transport === "smtp" ? (
                        
                          {provider.smtpPasswordConfigured ? "SMTP secret stored" : "SMTP secret missing"}
                        
                      ) : (
                        
                          {provider.apiKeyConfigured ? "API key stored for runtime sends" : "API key missing"}
                        
                      )}
                    

                    {provider.lastHealthError && (
                      
                        {provider.lastHealthError}
                      
                    )}

                    {provider.dnsProfile.setupNotes && (
                      
                        {provider.dnsProfile.setupNotes}
                      
                    )}

                    
                      {provider.providerKey === "brevo" && (
                        <>
                           activateBrevoMutation.mutate(provider.id)}
                            disabled={activateBrevoMutation.isPending}
                          >
                            {activateBrevoMutation.isPending ? (
                              
                            ) : (
                              
                            )}
                            Bring In + Activate
                          
                           setBrevoProvider(provider)}>
                            
                            Brevo Infrastructure
                          
                        
                      )}
                       verifyProviderMutation.mutate(provider.id)}
                        disabled={verifyProviderMutation.isPending}
                      >
                        
                        Verify
                      
                       {
                          setTestProvider(provider);
                          setTestEmail("");
                        }}
                      >
                        
                        Test Send
                      
                      {!provider.isDefault && provider.source === "database" && (
                         setDefaultProviderMutation.mutate(provider.id)}
                          disabled={setDefaultProviderMutation.isPending}
                        >
                          
                          Set Default
                        
                      )}
                      {provider.source === "database" && (
                         {
                            if (window.confirm(`Delete provider "${provider.name}"?`)) {
                              deleteProviderMutation.mutate(provider.id);
                            }
                          }}
                        >
                          
                          Delete
                        
                      )}
                    
                  
                
              ))}
            
          )}
        

        
          
            
              Sender Profiles
              
                Bind a sender explicitly to Mailgun, Brevo, or Brainpool, or leave it on default routing.
              
            
             setSenderDialogOpen(true)}>
              
              Add Sender
            
          

          {sendersLoading ? (
            
              
              Loading sender profiles...
            
          ) : (
            
              {senderProfiles.map((profile) => (
                
                  
                    
                      
                        
                          {profile.name}
                          {profile.isDefault && Default}
                          {profile.isActive ? Active : Inactive}
                        
                        
                          {profile.fromName} &lt;{profile.fromEmail}&gt;
                        
                      
                       {
                          if (window.confirm(`Delete sender "${profile.name}"?`)) {
                            deleteSenderMutation.mutate(profile.id);
                          }
                        }}
                      >
                        
                      
                    
                  
                  
                    
                      
                        Reply-To
                        {profile.replyToEmail || profile.fromEmail}
                      
                      
                        Warmup
                        {profile.warmupStatus || "not started"}
                      
                    

                    
                      Campaign Provider
                       bindSenderMutation.mutate({ senderId: profile.id, providerId: value })}
                      >
                        
                          
                        
                        
                          Default routing
                          {providers.map((provider) => (
                            
                              {provider.name}
                            
                          ))}
                        
                      
                      
                        {profile.hasExplicitCampaignProviderBinding
                          ? `Explicitly routed through ${profile.campaignProvider?.name || "provider binding"}.`
                          : `Uses ${profile.campaignProvider?.name || "default provider"} through fallback routing.`}
                      
                    
                  
                
              ))}
            
          )}
        

        
          
            
              Domain Management
              
                Keep marketing domain DNS aligned with the selected provider and regenerate records when routing changes.
              
            
             setDomainDialogOpen(true)}>
              
              Add Domain
            
          

          {domainsLoading ? (
            
              
              Loading domains...
            
          ) : (
            
              {domains.map((domain) => {
                const fullyVerified =
                  domain.spfStatus === "verified" &&
                  domain.dkimStatus === "verified" &&
                  domain.dmarcStatus === "verified";

                return (
                  
                    
                      
                        
                          
                            {domain.domain}
                            {domain.configuration?.domainPurpose || "marketing"}
                            
                              {fullyVerified ? "Verified" : "Needs attention"}
                            
                          
                          
                            Routed through {domain.campaignProvider?.name || "default provider routing"}
                          
                        
                        
                           validateDomainMutation.mutate(domain.id)}
                            disabled={validateDomainMutation.isPending}
                          >
                            
                            Validate
                          
                           {
                              if (window.confirm(`Delete domain "${domain.domain}"?`)) {
                                deleteDomainMutation.mutate(domain.id);
                              }
                            }}
                          >
                            
                            Delete
                          
                        
                      
                    
                    
                      
                        
                          SPF
                          {domain.spfStatus}
                        
                        
                          DKIM
                          {domain.dkimStatus}
                        
                        
                          DMARC
                          {domain.dmarcStatus}
                        
                        
                          Health Score
                          {domain.healthScore ?? "Pending"}
                        
                      

                      
                        Provider Binding
                         bindDomainMutation.mutate({ domainId: domain.id, providerId: value })}
                        >
                          
                            
                          
                          
                            {providers.map((provider) => (
                              
                                {provider.name}
                              
                            ))}
                          
                        
                        
                          Changing the provider regenerates the recommended DNS records for this domain.
                        
                      

                       setDnsExpandedId(dnsExpandedId === domain.id ? null : domain.id)}
                      >
                        
                        {dnsExpandedId === domain.id ? "Hide DNS Guidance" : "Show DNS Guidance"}
                      

                      {dnsExpandedId === domain.id && }

                      {domain.lastCheckedAt && (
                        
                          Last checked {new Date(domain.lastCheckedAt).toLocaleString()}
                        
                      )}
                    
                  
                );
              })}
            
          )}
        
      

      
        
          
            Add Campaign Provider
            
              Configure Mailgun, Brevo, Brainpool, or Custom SMTP for campaign email routing. API keys entered here are encrypted and used at runtime.
            
          

          
            
              
                Provider Type
                
                    setProviderForm((current) => ({
                      ...current,
                      providerKey: value,
                      smtpSecure: value === "mailgun" ? false : current.smtpSecure,
                    }))
                  }
                >
                  
                    
                  
                  
                    Mailgun API
                    Brevo API
                    Brainpool SMTP
                    Custom SMTP
                  
                
              
              
                Provider Name
                 setProviderForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Brevo Marketing Primary"
                />
              
            

            
              Description
               setProviderForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="What traffic this provider should handle, any deliverability constraints, and operational notes."
              />
            

            
              
                Default From Email
                 setProviderForm((current) => ({ ...current, defaultFromEmail: event.target.value }))}
                  placeholder="marketing@example.com"
                />
              
              
                Default From Name
                 setProviderForm((current) => ({ ...current, defaultFromName: event.target.value }))}
                  placeholder="DemandGentic"
                />
              
              
                Reply-To
                 setProviderForm((current) => ({ ...current, replyToEmail: event.target.value }))}
                  placeholder="team@example.com"
                />
              
            

            {providerForm.providerKey === "mailgun" ? (
              
                
                  Mailgun Domain
                   setProviderForm((current) => ({ ...current, apiDomain: event.target.value }))}
                    placeholder="mg.example.com"
                  />
                
                
                  API Key
                   setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder="key-..."
                  />
                
                
                  Region
                   setProviderForm((current) => ({ ...current, apiRegion: value }))}
                  >
                    
                      
                    
                    
                      US
                      EU
                    
                  
                
              
            ) : providerForm.providerKey === "brevo" ? (
              <>
                
                  
                    Brevo API Key
                     setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder="xkeysib-..."
                    />
                  
                  
                    Runtime sends, provider verification, and test sends will use the API key saved here. Add DNS overrides below only if you want domain templates to match the exact records Brevo gives you.
                  
                

                
                  
                    
                    Optional Brevo DNS Overrides
                  
                  
                    
                      SPF Include
                       setProviderForm((current) => ({ ...current, spfInclude: event.target.value }))}
                        placeholder="include:spf.brevo.com"
                      />
                    
                    
                      DKIM Selector
                       setProviderForm((current) => ({ ...current, dkimSelector: event.target.value }))}
                        placeholder="mail"
                      />
                    
                    
                      Tracking Host
                       setProviderForm((current) => ({ ...current, trackingHost: event.target.value }))}
                        placeholder="track"
                      />
                    
                    
                      Tracking Target
                       setProviderForm((current) => ({ ...current, trackingValue: event.target.value }))}
                        placeholder="Paste the exact Brevo tracking target"
                      />
                    
                  
                  
                    DKIM Value / Target
                     setProviderForm((current) => ({ ...current, dkimValue: event.target.value }))}
                      placeholder="Paste the exact Brevo DKIM value or target"
                    />
                  
                
              
            ) : (
              <>
                
                  
                    SMTP Host
                     setProviderForm((current) => ({ ...current, smtpHost: event.target.value }))}
                      placeholder="smtp.brainpool.example"
                    />
                  
                  
                    Port
                     setProviderForm((current) => ({ ...current, smtpPort: event.target.value }))}
                      placeholder="587"
                    />
                  
                  
                     setProviderForm((current) => ({ ...current, smtpSecure: checked }))}
                    />
                    
                      Use TLS/SSL
                      Recommended when the provider supports it
                    
                  
                

                
                  
                    SMTP Username
                     setProviderForm((current) => ({ ...current, smtpUsername: event.target.value }))}
                      placeholder="smtp-user"
                    />
                  
                  
                    SMTP Password
                     setProviderForm((current) => ({ ...current, smtpPassword: event.target.value }))}
                      placeholder="SMTP password"
                    />
                  
                

                
                  
                    
                    Advanced DNS Overrides
                  
                  
                    
                      SPF Include
                       setProviderForm((current) => ({ ...current, spfInclude: event.target.value }))}
                        placeholder={providerForm.providerKey === "brainpool" ? "include:brainpool.example" : "include:provider.example"}
                      />
                    
                    
                      DKIM Selector
                       setProviderForm((current) => ({ ...current, dkimSelector: event.target.value }))}
                        placeholder="bp1"
                      />
                    
                    
                      Tracking Host
                       setProviderForm((current) => ({ ...current, trackingHost: event.target.value }))}
                        placeholder="track"
                      />
                    
                    
                      Tracking Target
                       setProviderForm((current) => ({ ...current, trackingValue: event.target.value }))}
                        placeholder={providerForm.providerKey === "brainpool" ? "track.brainpool.example" : "tracking.provider.example"}
                      />
                    
                  
                  
                    DKIM Value / Target
                     setProviderForm((current) => ({ ...current, dkimValue: event.target.value }))}
                      placeholder={providerForm.providerKey === "brainpool" ? "CNAME target or TXT public key supplied by Brainpool" : "CNAME target or TXT public key supplied by this provider"}
                    />
                  
                
              
            )}

            
               setProviderForm((current) => ({ ...current, isDefault: checked }))}
              />
              
                Make default provider
                Unbound campaign senders and domains will inherit this route.
              
            
          

          
             setProviderDialogOpen(false)}>
              Cancel
            
             createProviderMutation.mutate()} disabled={createProviderMutation.isPending}>
              {createProviderMutation.isPending && }
              Save Provider
            
          
        
      

      
        
          
            Add Sender Profile
            
              Create a marketing sender and optionally pin it to a specific provider.
            
          

          
            
              Profile Name
               setSenderForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Pivotal Outbound Marketing"
              />
            
            
              
                From Name
                 setSenderForm((current) => ({ ...current, fromName: event.target.value }))}
                  placeholder="DemandGentic"
                />
              
              
                From Email
                 setSenderForm((current) => ({ ...current, fromEmail: event.target.value }))}
                  placeholder="campaigns@example.com"
                />
              
            
            
              Reply-To Email
               setSenderForm((current) => ({ ...current, replyToEmail: event.target.value }))}
                placeholder="replies@example.com"
              />
            
            
              Provider Routing
               setSenderForm((current) => ({ ...current, campaignProviderId: value }))}
              >
                
                  
                
                
                  Default routing
                  {providers.map((provider) => (
                    
                      {provider.name}
                    
                  ))}
                
              
            
            
              
                 setSenderForm((current) => ({ ...current, isDefault: checked }))}
                />
                
                  Default sender
                  Used when a campaign has no explicit sender.
                
              
              
                 setSenderForm((current) => ({ ...current, isActive: checked }))}
                />
                
                  Active
                  Keep this identity available for routing.
                
              
            
          

          
             setSenderDialogOpen(false)}>
              Cancel
            
             createSenderMutation.mutate()} disabled={createSenderMutation.isPending}>
              {createSenderMutation.isPending && }
              Save Sender
            
          
        
      

      
        
          
            Add Sending Domain
            
              Generate provider-aware DNS records for a new marketing domain.
            
          

          
            
              
                Domain
                 setDomainForm((current) => ({ ...current, domain: event.target.value }))}
                  placeholder="example.com"
                />
              
              
                Subdomain
                 setDomainForm((current) => ({ ...current, subdomain: event.target.value }))}
                  placeholder="mail"
                />
              
            
            
              
                Purpose
                
                    setDomainForm((current) => ({ ...current, purpose: value }))
                  }
                >
                  
                    
                  
                  
                    Marketing
                    Transactional
                    Both
                  
                
              
              
                Provider
                 setDomainForm((current) => ({ ...current, providerId: value }))}
                >
                  
                    
                  
                  
                    {providers.map((provider) => (
                      
                        {provider.name}
                      
                    ))}
                  
                
              
              
                Region
                 setDomainForm((current) => ({ ...current, region: value }))}
                >
                  
                    
                  
                  
                    US
                    EU
                  
                
              
            
          

          
             setDomainDialogOpen(false)}>
              Cancel
            
             createDomainMutation.mutate()} disabled={createDomainMutation.isPending}>
              {createDomainMutation.isPending && }
              Save Domain
            
          
        
      

       !open && setTestProvider(null)}>
        
          
            Send Provider Test
            
              Send a live test message through {testProvider?.name || "the selected provider"}.
            
          
          
            Destination Email
             setTestEmail(event.target.value)} placeholder="you@example.com" />
          
          
             setTestProvider(null)}>
              Cancel
            
             {
                if (!testProvider) return;
                testSendMutation.mutate({ providerId: testProvider.id, to: testEmail });
              }}
              disabled={!testProvider || !testEmail || testSendMutation.isPending}
            >
              {testSendMutation.isPending && }
              Send Test
            
          
        
      

       {
          if (!open) {
            setBrevoProvider(null);
          }
        }}
        onSynced={() => {
          refreshProviders();
          refreshSenders();
          refreshDomains();
        }}
      />

      {!providersLoading && providers.length === 0 && (
        
          
            
            Add a campaign provider first. Mailgun or Brevo can stay as your default API route, and Brainpool can be added as an SMTP-backed secondary or primary provider.
          
        
      )}

      {!domainsLoading &&
        domains.length > 0 &&
        domains.every(
          (domain) =>
            domain.spfStatus === "verified" &&
            domain.dkimStatus === "verified" &&
            domain.dmarcStatus === "verified"
        ) && (
          
            
              
              All managed campaign domains are currently verified against their selected providers.
            
          
        )}

      {!sendersLoading &&
        !domainsLoading &&
        senderProfiles.length === 0 &&
        domains.length === 0 &&
        providers.length === 0 && (
          
            
              
              
                Campaign email management is not configured yet.
                
                  Start by adding Mailgun, Brevo, or Brainpool, then bind senders and domains as needed.
                
              
               setProviderDialogOpen(true)}>
                
                Add First Provider
              
            
          
        )}
    
  );
}