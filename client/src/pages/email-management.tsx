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

    return rows.filter(Boolean) as Array<{ label: string; name: string; value: string }>;
  }, [domain]);

  if (!records.length) return null;

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      {records.map((record) => (
        <div key={`${record.label}-${record.name}`} className="rounded-lg border bg-background p-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <Badge variant="outline">{record.label}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(record.value);
                toast({ title: "Copied", description: `${record.label} value copied.` });
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="font-mono text-foreground">{record.name}</div>
            <div className="break-all font-mono">{record.value}</div>
          </div>
        </div>
      ))}
    </div>
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

  const [tab, setTab] = useState<EmailManagementTab>(initialTab);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [senderDialogOpen, setSenderDialogOpen] = useState(false);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [providerForm, setProviderForm] = useState(blankProviderForm);
  const [senderForm, setSenderForm] = useState(blankSenderForm);
  const [domainForm, setDomainForm] = useState(blankDomainForm);
  const [dnsExpandedId, setDnsExpandedId] = useState<number | null>(null);
  const [testProvider, setTestProvider] = useState<CampaignProvider | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [brevoProvider, setBrevoProvider] = useState<CampaignProvider | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") !== tab) {
      params.set("tab", tab);
      const next = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, "", next);
    }
  }, [tab]);

  const { data: overview } = useQuery<EmailManagementOverview>({
    queryKey: ["/api/email-management/overview"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/email-management/overview");
      return response.json();
    },
  });

  const { data: providers = [], isLoading: providersLoading } = useQuery<CampaignProvider[]>({
    queryKey: ["/api/email-management/providers"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/email-management/providers");
      return response.json();
    },
  });

  const { data: senderProfiles = [], isLoading: sendersLoading } = useQuery<ManagedSenderProfile[]>({
    queryKey: ["/api/email-management/sender-profiles"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/email-management/sender-profiles");
      return response.json();
    },
  });

  const { data: domains = [], isLoading: domainsLoading } = useQuery<ManagedDomain[]>({
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
      const payload: Record<string, unknown> = {
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
        html: "<p>This is a live provider test from campaign email management.</p>",
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
      return response.json() as Promise<BrevoActivationResult>;
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
    <div className="space-y-6 p-6">
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 text-white shadow-sm">
        <div className="grid gap-6 p-6 md:grid-cols-[1.4fr,0.9fr] md:p-8">
          <div className="space-y-4">
            <Badge className="w-fit border-white/20 bg-white/10 text-white hover:bg-white/10">
              Campaign Email Management
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Unified campaign email routing, domains, and senders</h1>
              <p className="max-w-2xl text-sm text-white/75">
                Manage Mailgun, Brevo, and Brainpool in one place, bind domains and senders safely, and switch default routing from the UI without scattering campaign email settings across multiple pages.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-white/10 bg-white/10 text-white">
              <CardHeader className="pb-2">
                <CardDescription className="text-white/65">Providers</CardDescription>
                <CardTitle className="text-3xl">{overview?.providerCount || 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-white/70">
                {overview?.healthyProviders || 0} healthy and routable
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/10 text-white">
              <CardHeader className="pb-2">
                <CardDescription className="text-white/65">Sender Bindings</CardDescription>
                <CardTitle className="text-3xl">{overview?.senderBindingCount || 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-white/70">
                {senderProfiles.length} sender identities managed
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/10 text-white">
              <CardHeader className="pb-2">
                <CardDescription className="text-white/65">Domain Bindings</CardDescription>
                <CardTitle className="text-3xl">{overview?.domainBindingCount || 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-white/70">
                {domains.length} domains with provider-aware DNS
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/10 text-white">
              <CardHeader className="pb-2">
                <CardDescription className="text-white/65">Default Provider</CardDescription>
                <CardTitle className="text-lg">
                  {providers.find((provider) => provider.id === overview?.defaultProviderId)?.name || "Environment fallback"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-white/70">
                Intelligent fallback remains available when explicit bindings are absent.
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as EmailManagementTab)} className="space-y-6">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="senders">Senders</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Campaign Providers</h2>
              <p className="text-sm text-muted-foreground">
                Mailgun and Brevo use API transport. Brainpool is configured through SMTP with provider-specific DNS guidance.
              </p>
            </div>
            <Button onClick={() => setProviderDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Provider
            </Button>
          </div>

          {providersLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading providers...
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {providers.map((provider) => (
                <Card key={provider.id} className="overflow-hidden">
                  <CardHeader className="gap-3 border-b bg-muted/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-lg">{provider.name}</CardTitle>
                          <Badge variant="outline">{formatProviderType(provider)}</Badge>
                          {provider.isDefault && <Badge>Default</Badge>}
                          {provider.source === "environment" && <Badge variant="secondary">Environment</Badge>}
                        </div>
                        <CardDescription>{provider.description || "Campaign routing provider"}</CardDescription>
                      </div>
                      <Badge variant="outline" className={getStatusTone(provider.healthStatus)}>
                        {provider.healthStatus}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Transport</div>
                        <div className="font-medium">{formatTransportLabel(provider.transport)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Default From</div>
                        <div className="font-medium">{provider.defaultFromEmail || "Not set"}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Rate Limit</div>
                        <div className="font-medium">{provider.sendingProfile.rateLimitPerMinute || 0}/min</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Daily Cap</div>
                        <div className="font-medium">{provider.sendingProfile.dailyCap || 0}/day</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {provider.transport === "smtp" ? (
                        <Badge variant="secondary">
                          {provider.smtpPasswordConfigured ? "SMTP secret stored" : "SMTP secret missing"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {provider.apiKeyConfigured ? "API key stored for runtime sends" : "API key missing"}
                        </Badge>
                      )}
                    </div>

                    {provider.lastHealthError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {provider.lastHealthError}
                      </div>
                    )}

                    {provider.dnsProfile.setupNotes && (
                      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                        {provider.dnsProfile.setupNotes}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {provider.providerKey === "brevo" && (
                        <>
                          <Button
                            onClick={() => activateBrevoMutation.mutate(provider.id)}
                            disabled={activateBrevoMutation.isPending}
                          >
                            {activateBrevoMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="mr-2 h-4 w-4" />
                            )}
                            Bring In + Activate
                          </Button>
                          <Button variant="outline" onClick={() => setBrevoProvider(provider)}>
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Brevo Infrastructure
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => verifyProviderMutation.mutate(provider.id)}
                        disabled={verifyProviderMutation.isPending}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Verify
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setTestProvider(provider);
                          setTestEmail("");
                        }}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Test Send
                      </Button>
                      {!provider.isDefault && provider.source === "database" && (
                        <Button
                          variant="outline"
                          onClick={() => setDefaultProviderMutation.mutate(provider.id)}
                          disabled={setDefaultProviderMutation.isPending}
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Set Default
                        </Button>
                      )}
                      {provider.source === "database" && (
                        <Button
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm(`Delete provider "${provider.name}"?`)) {
                              deleteProviderMutation.mutate(provider.id);
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="senders" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Sender Profiles</h2>
              <p className="text-sm text-muted-foreground">
                Bind a sender explicitly to Mailgun, Brevo, or Brainpool, or leave it on default routing.
              </p>
            </div>
            <Button onClick={() => setSenderDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Sender
            </Button>
          </div>

          {sendersLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sender profiles...
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {senderProfiles.map((profile) => (
                <Card key={profile.id}>
                  <CardHeader className="border-b bg-muted/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-lg">{profile.name}</CardTitle>
                          {profile.isDefault && <Badge>Default</Badge>}
                          {profile.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        <CardDescription>
                          {profile.fromName} &lt;{profile.fromEmail}&gt;
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          if (window.confirm(`Delete sender "${profile.name}"?`)) {
                            deleteSenderMutation.mutate(profile.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Reply-To</div>
                        <div className="font-medium">{profile.replyToEmail || profile.fromEmail}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Warmup</div>
                        <div className="font-medium capitalize">{profile.warmupStatus || "not started"}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Campaign Provider</Label>
                      <Select
                        value={profile.campaignProviderId || DEFAULT_PROVIDER_OPTION}
                        onValueChange={(value) => bindSenderMutation.mutate({ senderId: profile.id, providerId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DEFAULT_PROVIDER_OPTION}>Default routing</SelectItem>
                          {providers.map((provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                              {provider.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {profile.hasExplicitCampaignProviderBinding
                          ? `Explicitly routed through ${profile.campaignProvider?.name || "provider binding"}.`
                          : `Uses ${profile.campaignProvider?.name || "default provider"} through fallback routing.`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="domains" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Domain Management</h2>
              <p className="text-sm text-muted-foreground">
                Keep marketing domain DNS aligned with the selected provider and regenerate records when routing changes.
              </p>
            </div>
            <Button onClick={() => setDomainDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          </div>

          {domainsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading domains...
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map((domain) => {
                const fullyVerified =
                  domain.spfStatus === "verified" &&
                  domain.dkimStatus === "verified" &&
                  domain.dmarcStatus === "verified";

                return (
                  <Card key={domain.id}>
                    <CardHeader className="border-b bg-muted/20">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">{domain.domain}</CardTitle>
                            <Badge variant="outline">{domain.configuration?.domainPurpose || "marketing"}</Badge>
                            <Badge variant="outline" className={fullyVerified ? getStatusTone("verified") : getStatusTone("pending")}>
                              {fullyVerified ? "Verified" : "Needs attention"}
                            </Badge>
                          </div>
                          <CardDescription>
                            Routed through {domain.campaignProvider?.name || "default provider routing"}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => validateDomainMutation.mutate(domain.id)}
                            disabled={validateDomainMutation.isPending}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Validate
                          </Button>
                          <Button
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (window.confirm(`Delete domain "${domain.domain}"?`)) {
                                deleteDomainMutation.mutate(domain.id);
                              }
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl border p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">SPF</div>
                          <div className="mt-1 font-medium capitalize">{domain.spfStatus}</div>
                        </div>
                        <div className="rounded-xl border p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">DKIM</div>
                          <div className="mt-1 font-medium capitalize">{domain.dkimStatus}</div>
                        </div>
                        <div className="rounded-xl border p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">DMARC</div>
                          <div className="mt-1 font-medium capitalize">{domain.dmarcStatus}</div>
                        </div>
                        <div className="rounded-xl border p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Health Score</div>
                          <div className="mt-1 font-medium">{domain.healthScore ?? "Pending"}</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Provider Binding</Label>
                        <Select
                          value={domain.campaignProviderId || defaultProviderId}
                          onValueChange={(value) => bindDomainMutation.mutate({ domainId: domain.id, providerId: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {providers.map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Changing the provider regenerates the recommended DNS records for this domain.
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => setDnsExpandedId(dnsExpandedId === domain.id ? null : domain.id)}
                      >
                        <Globe className="mr-2 h-4 w-4" />
                        {dnsExpandedId === domain.id ? "Hide DNS Guidance" : "Show DNS Guidance"}
                      </Button>

                      {dnsExpandedId === domain.id && <DnsPreview domain={domain} />}

                      {domain.lastCheckedAt && (
                        <div className="text-xs text-muted-foreground">
                          Last checked {new Date(domain.lastCheckedAt).toLocaleString()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Campaign Provider</DialogTitle>
            <DialogDescription>
              Configure Mailgun, Brevo, Brainpool, or Custom SMTP for campaign email routing. API keys entered here are encrypted and used at runtime.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Provider Type</Label>
                <Select
                  value={providerForm.providerKey}
                  onValueChange={(value: CampaignProviderKey) =>
                    setProviderForm((current) => ({
                      ...current,
                      providerKey: value,
                      smtpSecure: value === "mailgun" ? false : current.smtpSecure,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mailgun">Mailgun API</SelectItem>
                    <SelectItem value="brevo">Brevo API</SelectItem>
                    <SelectItem value="brainpool">Brainpool SMTP</SelectItem>
                    <SelectItem value="custom">Custom SMTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provider Name</Label>
                <Input
                  value={providerForm.name}
                  onChange={(event) => setProviderForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Brevo Marketing Primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={providerForm.description}
                onChange={(event) => setProviderForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="What traffic this provider should handle, any deliverability constraints, and operational notes."
              />
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Default From Email</Label>
                <Input
                  value={providerForm.defaultFromEmail}
                  onChange={(event) => setProviderForm((current) => ({ ...current, defaultFromEmail: event.target.value }))}
                  placeholder="marketing@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Default From Name</Label>
                <Input
                  value={providerForm.defaultFromName}
                  onChange={(event) => setProviderForm((current) => ({ ...current, defaultFromName: event.target.value }))}
                  placeholder="DemandGentic"
                />
              </div>
              <div className="space-y-2">
                <Label>Reply-To</Label>
                <Input
                  value={providerForm.replyToEmail}
                  onChange={(event) => setProviderForm((current) => ({ ...current, replyToEmail: event.target.value }))}
                  placeholder="team@example.com"
                />
              </div>
            </div>

            {providerForm.providerKey === "mailgun" ? (
              <div className="grid gap-2 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Mailgun Domain</Label>
                  <Input
                    value={providerForm.apiDomain}
                    onChange={(event) => setProviderForm((current) => ({ ...current, apiDomain: event.target.value }))}
                    placeholder="mg.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={providerForm.apiKey}
                    onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder="key-..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select
                    value={providerForm.apiRegion}
                    onValueChange={(value) => setProviderForm((current) => ({ ...current, apiRegion: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">US</SelectItem>
                      <SelectItem value="EU">EU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : providerForm.providerKey === "brevo" ? (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Brevo API Key</Label>
                    <Input
                      type="password"
                      value={providerForm.apiKey}
                      onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder="xkeysib-..."
                    />
                  </div>
                  <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Runtime sends, provider verification, and test sends will use the API key saved here. Add DNS overrides below only if you want domain templates to match the exact records Brevo gives you.
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4" />
                    Optional Brevo DNS Overrides
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>SPF Include</Label>
                      <Input
                        value={providerForm.spfInclude}
                        onChange={(event) => setProviderForm((current) => ({ ...current, spfInclude: event.target.value }))}
                        placeholder="include:spf.brevo.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>DKIM Selector</Label>
                      <Input
                        value={providerForm.dkimSelector}
                        onChange={(event) => setProviderForm((current) => ({ ...current, dkimSelector: event.target.value }))}
                        placeholder="mail"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tracking Host</Label>
                      <Input
                        value={providerForm.trackingHost}
                        onChange={(event) => setProviderForm((current) => ({ ...current, trackingHost: event.target.value }))}
                        placeholder="track"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tracking Target</Label>
                      <Input
                        value={providerForm.trackingValue}
                        onChange={(event) => setProviderForm((current) => ({ ...current, trackingValue: event.target.value }))}
                        placeholder="Paste the exact Brevo tracking target"
                      />
                    </div>
                  </div>
                  <div className="mt-2 space-y-2">
                    <Label>DKIM Value / Target</Label>
                    <Textarea
                      rows={2}
                      value={providerForm.dkimValue}
                      onChange={(event) => setProviderForm((current) => ({ ...current, dkimValue: event.target.value }))}
                      placeholder="Paste the exact Brevo DKIM value or target"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>SMTP Host</Label>
                    <Input
                      value={providerForm.smtpHost}
                      onChange={(event) => setProviderForm((current) => ({ ...current, smtpHost: event.target.value }))}
                      placeholder="smtp.brainpool.example"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input
                      value={providerForm.smtpPort}
                      onChange={(event) => setProviderForm((current) => ({ ...current, smtpPort: event.target.value }))}
                      placeholder="587"
                    />
                  </div>
                  <div className="flex items-end gap-3 rounded-xl border px-3 py-2">
                    <Switch
                      checked={providerForm.smtpSecure}
                      onCheckedChange={(checked) => setProviderForm((current) => ({ ...current, smtpSecure: checked }))}
                    />
                    <div>
                      <div className="text-sm font-medium">Use TLS/SSL</div>
                      <div className="text-xs text-muted-foreground">Recommended when the provider supports it</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>SMTP Username</Label>
                    <Input
                      value={providerForm.smtpUsername}
                      onChange={(event) => setProviderForm((current) => ({ ...current, smtpUsername: event.target.value }))}
                      placeholder="smtp-user"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SMTP Password</Label>
                    <Input
                      type="password"
                      value={providerForm.smtpPassword}
                      onChange={(event) => setProviderForm((current) => ({ ...current, smtpPassword: event.target.value }))}
                      placeholder="SMTP password"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4" />
                    Advanced DNS Overrides
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>SPF Include</Label>
                      <Input
                        value={providerForm.spfInclude}
                        onChange={(event) => setProviderForm((current) => ({ ...current, spfInclude: event.target.value }))}
                        placeholder={providerForm.providerKey === "brainpool" ? "include:brainpool.example" : "include:provider.example"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>DKIM Selector</Label>
                      <Input
                        value={providerForm.dkimSelector}
                        onChange={(event) => setProviderForm((current) => ({ ...current, dkimSelector: event.target.value }))}
                        placeholder="bp1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tracking Host</Label>
                      <Input
                        value={providerForm.trackingHost}
                        onChange={(event) => setProviderForm((current) => ({ ...current, trackingHost: event.target.value }))}
                        placeholder="track"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tracking Target</Label>
                      <Input
                        value={providerForm.trackingValue}
                        onChange={(event) => setProviderForm((current) => ({ ...current, trackingValue: event.target.value }))}
                        placeholder={providerForm.providerKey === "brainpool" ? "track.brainpool.example" : "tracking.provider.example"}
                      />
                    </div>
                  </div>
                  <div className="mt-2 space-y-2">
                    <Label>DKIM Value / Target</Label>
                    <Textarea
                      rows={2}
                      value={providerForm.dkimValue}
                      onChange={(event) => setProviderForm((current) => ({ ...current, dkimValue: event.target.value }))}
                      placeholder={providerForm.providerKey === "brainpool" ? "CNAME target or TXT public key supplied by Brainpool" : "CNAME target or TXT public key supplied by this provider"}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
              <Switch
                checked={providerForm.isDefault}
                onCheckedChange={(checked) => setProviderForm((current) => ({ ...current, isDefault: checked }))}
              />
              <div>
                <div className="text-sm font-medium">Make default provider</div>
                <div className="text-xs text-muted-foreground">Unbound campaign senders and domains will inherit this route.</div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createProviderMutation.mutate()} disabled={createProviderMutation.isPending}>
              {createProviderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={senderDialogOpen} onOpenChange={setSenderDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Sender Profile</DialogTitle>
            <DialogDescription>
              Create a marketing sender and optionally pin it to a specific provider.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input
                value={senderForm.name}
                onChange={(event) => setSenderForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Pivotal Outbound Marketing"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label>From Name</Label>
                <Input
                  value={senderForm.fromName}
                  onChange={(event) => setSenderForm((current) => ({ ...current, fromName: event.target.value }))}
                  placeholder="DemandGentic"
                />
              </div>
              <div className="space-y-2">
                <Label>From Email</Label>
                <Input
                  value={senderForm.fromEmail}
                  onChange={(event) => setSenderForm((current) => ({ ...current, fromEmail: event.target.value }))}
                  placeholder="campaigns@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reply-To Email</Label>
              <Input
                value={senderForm.replyToEmail}
                onChange={(event) => setSenderForm((current) => ({ ...current, replyToEmail: event.target.value }))}
                placeholder="replies@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Provider Routing</Label>
              <Select
                value={senderForm.campaignProviderId}
                onValueChange={(value) => setSenderForm((current) => ({ ...current, campaignProviderId: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_PROVIDER_OPTION}>Default routing</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
                <Switch
                  checked={senderForm.isDefault}
                  onCheckedChange={(checked) => setSenderForm((current) => ({ ...current, isDefault: checked }))}
                />
                <div>
                  <div className="text-sm font-medium">Default sender</div>
                  <div className="text-xs text-muted-foreground">Used when a campaign has no explicit sender.</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
                <Switch
                  checked={senderForm.isActive}
                  onCheckedChange={(checked) => setSenderForm((current) => ({ ...current, isActive: checked }))}
                />
                <div>
                  <div className="text-sm font-medium">Active</div>
                  <div className="text-xs text-muted-foreground">Keep this identity available for routing.</div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSenderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createSenderMutation.mutate()} disabled={createSenderMutation.isPending}>
              {createSenderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Sender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={domainDialogOpen} onOpenChange={setDomainDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Sending Domain</DialogTitle>
            <DialogDescription>
              Generate provider-aware DNS records for a new marketing domain.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Domain</Label>
                <Input
                  value={domainForm.domain}
                  onChange={(event) => setDomainForm((current) => ({ ...current, domain: event.target.value }))}
                  placeholder="example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Subdomain</Label>
                <Input
                  value={domainForm.subdomain}
                  onChange={(event) => setDomainForm((current) => ({ ...current, subdomain: event.target.value }))}
                  placeholder="mail"
                />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Purpose</Label>
                <Select
                  value={domainForm.purpose}
                  onValueChange={(value: "marketing" | "transactional" | "both") =>
                    setDomainForm((current) => ({ ...current, purpose: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="transactional">Transactional</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={domainForm.providerId}
                  onValueChange={(value) => setDomainForm((current) => ({ ...current, providerId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Select
                  value={domainForm.region}
                  onValueChange={(value: "US" | "EU") => setDomainForm((current) => ({ ...current, region: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">US</SelectItem>
                    <SelectItem value="EU">EU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDomainDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createDomainMutation.mutate()} disabled={createDomainMutation.isPending}>
              {createDomainMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testProvider} onOpenChange={(open) => !open && setTestProvider(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Provider Test</DialogTitle>
            <DialogDescription>
              Send a live test message through {testProvider?.name || "the selected provider"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Destination Email</Label>
            <Input value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="you@example.com" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestProvider(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!testProvider) return;
                testSendMutation.mutate({ providerId: testProvider.id, to: testEmail });
              }}
              disabled={!testProvider || !testEmail || testSendMutation.isPending}
            >
              {testSendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BrevoInfrastructureDialog
        provider={brevoProvider}
        open={!!brevoProvider}
        onOpenChange={(open) => {
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
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 pt-6 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Add a campaign provider first. Mailgun or Brevo can stay as your default API route, and Brainpool can be added as an SMTP-backed secondary or primary provider.
          </CardContent>
        </Card>
      )}

      {!domainsLoading &&
        domains.length > 0 &&
        domains.every(
          (domain) =>
            domain.spfStatus === "verified" &&
            domain.dkimStatus === "verified" &&
            domain.dmarcStatus === "verified"
        ) && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-start gap-3 pt-6 text-sm text-green-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              All managed campaign domains are currently verified against their selected providers.
            </CardContent>
          </Card>
        )}

      {!sendersLoading &&
        !domainsLoading &&
        senderProfiles.length === 0 &&
        domains.length === 0 &&
        providers.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Mail className="h-10 w-10 text-muted-foreground" />
              <div>
                <div className="font-medium">Campaign email management is not configured yet.</div>
                <div className="text-sm text-muted-foreground">
                  Start by adding Mailgun, Brevo, or Brainpool, then bind senders and domains as needed.
                </div>
              </div>
              <Button onClick={() => setProviderDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Provider
              </Button>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
