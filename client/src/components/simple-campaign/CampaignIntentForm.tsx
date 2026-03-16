import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  FolderOpen,
  Globe,
  Loader2,
  Mail,
  Radar,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

const DEFAULT_PROVIDER_OPTION = "default-routing";
const AUTO_DOMAIN_OPTION = "auto-domain";

interface CampaignProvider {
  id: string;
  providerKey: string;
  name: string;
  transport: "mailgun_api" | "brevo_api" | "smtp";
  isEnabled: boolean;
  isDefault: boolean;
  healthStatus: string;
  replyToEmail: string | null;
}

interface ManagedDomain {
  id: number;
  domain: string;
  spfStatus: "pending" | "verified" | "failed";
  dkimStatus: "pending" | "verified" | "failed";
  dmarcStatus: "pending" | "verified" | "failed";
  trackingDomainStatus: "pending" | "verified" | "failed";
  healthScore: number | null;
  campaignProviderId: string | null;
}

interface ManagedSenderProfile {
  id: string;
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  replyToEmail: string | null;
  isDefault: boolean | null;
  isActive: boolean | null;
  isVerified: boolean | null;
  warmupStatus: string | null;
  domainAuthId: number | null;
  campaignProviderId: string | null;
  campaignProvider: CampaignProvider | null;
}

interface ClientAccount {
  id: string;
  name: string;
  companyName?: string;
}

interface ClientProject {
  id: string;
  name: string;
  status: string;
  description?: string;
  landingPageUrl?: string;
  campaignOrganizationId?: string;
  projectType?: string;
  externalEventId?: string | null;
  clientAccountId?: string;
}

export interface CampaignIntent {
  campaignName: string;
  senderProfileId: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
  preheader: string;
  campaignProviderId?: string | null;
  campaignProviderName?: string | null;
  campaignProviderKey?: string | null;
  domainAuthId?: number | null;
  domainName?: string | null;
  clientAccountId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  projectDescription?: string;
  projectLandingPageUrl?: string;
  campaignOrganizationId?: string;
}

interface CampaignIntentFormProps {
  initialData?: Partial<CampaignIntent>;
  onNext: (data: CampaignIntent) => void;
  onCancel: () => void;
}

function toneForStatus(status?: string | null) {
  if (status === "healthy" || status === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed" || status === "degraded") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function providerLabel(provider?: CampaignProvider | null) {
  if (!provider) return "Default routing";
  if (provider.providerKey === "mailgun") return "Mailgun";
  if (provider.providerKey === "brevo") return "Brevo";
  if (provider.providerKey === "brainpool") return "Brainpool";
  return provider.name;
}

function domainReady(domain?: ManagedDomain | null) {
  if (!domain) return false;
  return domain.spfStatus === "verified" && domain.dkimStatus === "verified" && domain.dmarcStatus === "verified";
}

function warmupLabel(status?: string | null) {
  if (status === "completed") return "Warm-up complete";
  if (status === "in_progress") return "Warm-up in progress";
  if (status === "paused") return "Warm-up paused";
  return "Warm-up not started";
}

export function CampaignIntentForm({ initialData, onNext, onCancel }: CampaignIntentFormProps) {
  const { toast } = useToast();

  const [campaignName, setCampaignName] = useState(initialData?.campaignName || "");
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [preheader, setPreheader] = useState(initialData?.preheader || "");
  const [replyToEmail, setReplyToEmail] = useState(initialData?.replyToEmail || "");

  const [providers, setProviders] = useState<CampaignProvider[]>([]);
  const [domains, setDomains] = useState<ManagedDomain[]>([]);
  const [senders, setSenders] = useState<ManagedSenderProfile[]>([]);
  const [loadingRouting, setLoadingRouting] = useState(true);

  const [selectedProviderId, setSelectedProviderId] = useState(initialData?.campaignProviderId || DEFAULT_PROVIDER_OPTION);
  const [selectedDomainId, setSelectedDomainId] = useState(initialData?.domainAuthId ? String(initialData.domainAuthId) : AUTO_DOMAIN_OPTION);
  const [senderProfileId, setSenderProfileId] = useState(initialData?.senderProfileId || "");

  const [clientAccounts, setClientAccounts] = useState<ClientAccount[]>([]);
  const [clientProjects, setClientProjects] = useState<ClientProject[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(initialData?.clientAccountId || "");
  const [selectedProjectId, setSelectedProjectId] = useState(initialData?.projectId || "");
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  const selectedProject = useMemo(
    () => clientProjects.find((project) => project.id === selectedProjectId) || null,
    [clientProjects, selectedProjectId]
  );

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) || null,
    [providers, selectedProviderId]
  );

  const availableDomains = useMemo(
    () => selectedProviderId === DEFAULT_PROVIDER_OPTION
      ? domains
      : domains.filter((domain) => domain.campaignProviderId === selectedProviderId),
    [domains, selectedProviderId]
  );

  const selectedDomain = useMemo(
    () => (selectedDomainId === AUTO_DOMAIN_OPTION ? null : domains.find((domain) => String(domain.id) === selectedDomainId) || null),
    [domains, selectedDomainId]
  );

  const availableSenders = useMemo(() => {
    // First try strict filtering (matching provider + domain)
    const strict = senders.filter((sender) => {
      if (sender.isActive === false) return false;
      if (selectedProviderId !== DEFAULT_PROVIDER_OPTION && sender.campaignProviderId !== selectedProviderId) return false;
      if (selectedDomainId !== AUTO_DOMAIN_OPTION && String(sender.domainAuthId || "") !== selectedDomainId) return false;
      return true;
    });
    // If strict filtering returns results, use them
    if (strict.length > 0) return strict;
    // Fallback: show all active senders regardless of provider/domain binding
    // This prevents empty sender dropdowns when provider-sender mapping is incomplete
    return senders.filter((sender) => sender.isActive !== false);
  }, [selectedDomainId, selectedProviderId, senders]);

  const selectedSender = useMemo(
    () => senders.find((sender) => sender.id === senderProfileId) || null,
    [senders, senderProfileId]
  );

  const providerSummary = selectedProvider || selectedSender?.campaignProvider || providers.find((provider) => provider.isDefault) || null;
  const domainSummary = selectedDomain || domains.find((domain) => domain.id === selectedSender?.domainAuthId) || null;

  useEffect(() => {
    const loadRouting = async () => {
      try {
        setLoadingRouting(true);
        const [providersRes, domainsRes, sendersRes] = await Promise.all([
          apiRequest("GET", "/api/email-management/providers"),
          apiRequest("GET", "/api/email-management/domains"),
          apiRequest("GET", "/api/email-management/sender-profiles"),
        ]);

        const [providerData, domainData, senderData] = await Promise.all([
          providersRes.json(),
          domainsRes.json(),
          sendersRes.json(),
        ]);

        const activeProviders = (providerData || []).filter((provider: CampaignProvider) => provider.isEnabled !== false);
        const activeSenders = (senderData || []).filter((sender: ManagedSenderProfile) => sender.isActive !== false);

        setProviders(activeProviders);
        setDomains(domainData || []);
        setSenders(activeSenders);

        const defaultSender = activeSenders.find((sender: ManagedSenderProfile) => sender.id === initialData?.senderProfileId)
          || activeSenders.find((sender: ManagedSenderProfile) => sender.isDefault)
          || activeSenders.find((sender: ManagedSenderProfile) => sender.isVerified)
          || activeSenders[0]
          || null;
        const defaultProvider = activeProviders.find((provider: CampaignProvider) => provider.isDefault) || activeProviders[0] || null;

        if (!senderProfileId && defaultSender) {
          setSenderProfileId(defaultSender.id);
          setReplyToEmail(initialData?.replyToEmail || defaultSender.replyToEmail || defaultSender.replyTo || defaultSender.fromEmail);
        }
        if (!initialData?.campaignProviderId && defaultSender?.campaignProviderId) {
          setSelectedProviderId(defaultSender.campaignProviderId);
        } else if (!initialData?.campaignProviderId && defaultProvider) {
          setSelectedProviderId(defaultProvider.id);
        }
        if (!initialData?.domainAuthId && defaultSender?.domainAuthId) {
          setSelectedDomainId(String(defaultSender.domainAuthId));
        }
      } catch (error) {
        console.error("Failed to load routing data:", error);
        toast({ title: "Routing unavailable", description: "Could not load providers, domains, or senders.", variant: "destructive" });
      } finally {
        setLoadingRouting(false);
      }
    };

    loadRouting();
  }, []);

  useEffect(() => {
    const loadClients = async () => {
      setLoadingClients(true);
      try {
        const response = await apiRequest("GET", "/api/client-portal/admin/clients");
        if (!response.ok) throw new Error("Failed to load clients");
        setClientAccounts(await response.json());
      } catch (error) {
        console.error("Failed to load clients:", error);
        setClientAccounts([]);
      } finally {
        setLoadingClients(false);
      }
    };

    loadClients();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setClientProjects([]);
      setSelectedProjectId("");
      return;
    }

    let active = true;
    const loadProjects = async () => {
      setLoadingProjects(true);
      try {
        const response = await apiRequest("GET", `/api/client-portal/admin/clients/${selectedClientId}`);
        if (!response.ok) throw new Error("Failed to load projects");
        const data = await response.json();
        if (!active) return;
        const projects = data?.projects || [];
        setClientProjects(projects);
        if (projects.some((project: ClientProject) => project.id === selectedProjectId)) return;
        setSelectedProjectId(projects[0]?.id || "");
      } catch (error) {
        console.error("Failed to load projects:", error);
        if (active) {
          setClientProjects([]);
          setSelectedProjectId("");
        }
      } finally {
        if (active) setLoadingProjects(false);
      }
    };

    loadProjects();
    return () => {
      active = false;
    };
  }, [selectedClientId]);

  useEffect(() => {
    if (selectedDomainId !== AUTO_DOMAIN_OPTION && !availableDomains.some((domain) => String(domain.id) === selectedDomainId)) {
      setSelectedDomainId(AUTO_DOMAIN_OPTION);
    }
    if (senderProfileId && availableSenders.some((sender) => sender.id === senderProfileId)) return;
    const nextSender = availableSenders.find((sender) => sender.isDefault)
      || availableSenders.find((sender) => sender.isVerified)
      || availableSenders[0]
      || null;
    if (nextSender) {
      setSenderProfileId(nextSender.id);
    }
  }, [availableDomains, availableSenders, selectedDomainId, senderProfileId]);

  useEffect(() => {
    if (!selectedSender || replyToEmail) return;
    setReplyToEmail(selectedSender.replyToEmail || selectedSender.replyTo || selectedSender.fromEmail);
  }, [replyToEmail, selectedSender]);

  const handleAiSuggestSubject = async () => {
    if (!campaignName.trim()) {
      toast({ title: "Campaign name required", description: "Add a campaign name first.", variant: "destructive" });
      return;
    }

    setAiSuggesting(true);
    try {
      const response = await apiRequest("POST", "/api/ai/suggest-subject", {
        campaignName,
        projectName: selectedProject?.name,
        projectDescription: selectedProject?.description,
        organizationId: selectedProject?.campaignOrganizationId,
        clientName: clientAccounts.find((client) => client.id === selectedClientId)?.name,
      });
      const data = await response.json();
      if (data.subject) setSubject(data.subject);
    } catch {
      setSubject(`A quick note on ${campaignName.split(" ").slice(0, 4).join(" ")}`);
    } finally {
      setAiSuggesting(false);
    }
  };

  const isValid = Boolean(
    campaignName.trim()
    && subject.trim()
    && replyToEmail.trim()
    && senderProfileId
    && selectedClientId
    && selectedProjectId
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || !selectedSender) return;

    const selectedClient = clientAccounts.find((client) => client.id === selectedClientId) || null;
    onNext({
      campaignName: campaignName.trim(),
      senderProfileId: selectedSender.id,
      senderName: selectedSender.fromName || selectedSender.name,
      fromEmail: selectedSender.fromEmail,
      replyToEmail: replyToEmail.trim(),
      subject: subject.trim(),
      preheader: preheader.trim(),
      campaignProviderId: providerSummary?.id || selectedSender.campaignProviderId || null,
      campaignProviderName: providerSummary?.name || null,
      campaignProviderKey: providerSummary?.providerKey || selectedSender.campaignProvider?.providerKey || null,
      domainAuthId: domainSummary?.id || selectedSender.domainAuthId || null,
      domainName: domainSummary?.domain || null,
      clientAccountId: selectedClientId,
      clientName: selectedClient?.name || selectedClient?.companyName || "",
      projectId: selectedProjectId,
      projectName: selectedProject?.name || "",
      projectDescription: selectedProject?.description,
      projectLandingPageUrl: selectedProject?.landingPageUrl || "",
      campaignOrganizationId: selectedProject?.campaignOrganizationId,
    });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f8ff_0%,#eef3f8_45%,#f7fafc_100%)] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit border border-slate-300 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
              Step 1 of 3
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">Email Campaign Control Deck</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Align provider routing, domain readiness, sender identity, reply handling, and inbox strategy before the unified email agent builds the campaign.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Routing", value: providerLabel(providerSummary), subtext: "Multi-provider sender bindings" },
              { label: "Compliance", value: "Suppression + unsubscribe", subtext: "Launch guardrails are surfaced early" },
              { label: "Personalization", value: "Merge tags ready", subtext: "CTA prefill flow supported" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
                <p className="mt-1 text-xs text-slate-500">{item.subtext}</p>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card className="rounded-[28px] border-white/70 bg-white/90 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
              <CardContent className="space-y-5 p-6 md:p-8">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-900 p-3 text-white"><Building2 className="h-5 w-5" /></div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Campaign Context</h2>
                    <p className="text-sm text-slate-500">Connect the campaign to the client and project that drive AI generation and reporting.</p>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Client</Label>
                    {loadingClients ? (
                      <div className="flex h-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
                    ) : (
                      <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                        <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-sm"><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {clientAccounts.map((client) => <SelectItem key={client.id} value={client.id}>{client.name || client.companyName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Project</Label>
                    {!selectedClientId ? (
                      <div className="flex h-14 items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 text-sm text-slate-400">Choose a client first</div>
                    ) : loadingProjects ? (
                      <div className="flex h-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
                    ) : (
                      <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                        <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-sm"><SelectValue placeholder="Select project" /></SelectTrigger>
                        <SelectContent>
                          {clientProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {selectedProject && (
                  <div className="rounded-3xl border border-blue-100 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fbff_100%)] p-5">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-white p-2.5 text-blue-600 shadow-sm"><FolderOpen className="h-4 w-4" /></div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{selectedProject.name}</p>
                          <Badge variant="outline" className="border-blue-200 bg-white text-[11px] text-blue-700">{selectedProject.status}</Badge>
                          {selectedProject.campaignOrganizationId && (
                            <Badge className="border border-blue-200 bg-blue-600/10 text-[11px] text-blue-700">
                              <Bot className="mr-1 h-3 w-3" />
                              Unified email agent context linked
                            </Badge>
                          )}
                        </div>
                        {selectedProject.description && <p className="text-sm leading-6 text-slate-600">{selectedProject.description}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/70 bg-white/90 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
              <CardContent className="space-y-5 p-6 md:p-8">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-900 p-3 text-white"><Radar className="h-5 w-5" /></div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Provider Routing and Identity</h2>
                    <p className="text-sm text-slate-500">Choose the provider route, authenticated domain, and sender envelope for this campaign.</p>
                  </div>
                </div>

                {loadingRouting ? (
                  <div className="flex min-h-[120px] items-center justify-center rounded-3xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading senders...</div>
                  </div>
                ) : (
                  <>
                    {/* Primary: Sender Selection */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">From (Sender)</Label>
                      <Select value={senderProfileId} onValueChange={setSenderProfileId}>
                        <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-sm">
                          <SelectValue placeholder="Choose who this email comes from" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSenders.map((sender) => (
                            <SelectItem key={sender.id} value={sender.id}>
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                <span className="font-medium">{sender.fromName || sender.name}</span>
                                <span className="text-slate-500">&lt;{sender.fromEmail}&gt;</span>
                                {sender.campaignProvider && (
                                  <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">{providerLabel(sender.campaignProvider)}</Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                          {availableSenders.length === 0 && (
                            <div className="px-4 py-3 text-sm text-slate-500">No senders configured. Add one in Email Management.</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Selected sender summary */}
                    {selectedSender && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-white p-2 shadow-sm">
                              <Mail className="h-4 w-4 text-slate-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{selectedSender.fromName || selectedSender.name} &lt;{selectedSender.fromEmail}&gt;</p>
                              <p className="text-xs text-slate-500">
                                via {providerLabel(selectedSender.campaignProvider || providerSummary)}
                                {domainSummary ? ` · ${domainSummary.domain}` : ''}
                                {selectedSender.warmupStatus === 'in_progress' ? ' · Warming up' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("border text-[11px]", toneForStatus(providerSummary?.healthStatus))}>
                              {providerSummary?.healthStatus || "ready"}
                            </Badge>
                            <Badge className={cn("border text-[11px]", toneForStatus(selectedSender.isVerified ? "verified" : "pending"))}>
                              {selectedSender.isVerified ? "verified" : "unverified"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Advanced: Provider & Domain (collapsed by default) */}
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
                        Advanced: Override provider route & domain
                      </summary>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Provider Route</Label>
                          <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                            <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white px-4 text-sm"><SelectValue placeholder="Select provider" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={DEFAULT_PROVIDER_OPTION}>Use default routing</SelectItem>
                              {providers.map((provider) => (
                                <SelectItem key={provider.id} value={provider.id}>
                                  <div className="flex items-center gap-2">
                                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                                    {provider.name}
                                    <Badge className={cn("ml-1 border text-[10px] px-1.5 py-0", toneForStatus(provider.healthStatus))}>{provider.healthStatus}</Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Authenticated Domain</Label>
                          <Select value={selectedDomainId} onValueChange={setSelectedDomainId}>
                            <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white px-4 text-sm"><SelectValue placeholder="Select domain" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={AUTO_DOMAIN_OPTION}>Auto (sender-linked domain)</SelectItem>
                              {availableDomains.map((domain) => (
                                <SelectItem key={domain.id} value={String(domain.id)}>
                                  <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                                    {domain.domain}
                                    <Badge className={cn("ml-1 border text-[10px] px-1.5 py-0", toneForStatus(domainReady(domain) ? "verified" : "pending"))}>
                                      {domainReady(domain) ? "ready" : "review"}
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </details>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/70 bg-white/90 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
              <CardContent className="space-y-5 p-6 md:p-8">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-900 p-3 text-white"><Sparkles className="h-5 w-5" /></div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Subject, Reply Handling, and Inbox Preview</h2>
                    <p className="text-sm text-slate-500">Set the envelope details now so the template builder can optimize the full experience around them.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="campaignName" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Campaign Name</Label>
                  <Input id="campaignName" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Q2 account expansion outreach" className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base" autoFocus />
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="subject" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Subject Line</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={handleAiSuggestSubject} disabled={aiSuggesting} className="h-8 rounded-full px-3 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700">
                        {aiSuggesting ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Thinking</> : <><Sparkles className="mr-1 h-3.5 w-3.5" />Suggest</>}
                      </Button>
                    </div>
                    <Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Quick question about pipeline conversion" className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base" />
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Inbox Heuristic</p>
                    <p className="mt-3 text-2xl font-semibold text-slate-950">{subject.length}</p>
                    <p className="mt-1 text-xs text-slate-500">{subject.length > 60 ? "May truncate on mobile inboxes" : "Healthy range for mobile visibility"}</p>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="preheader" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preview Text</Label>
                    <Input id="preheader" value={preheader} onChange={(event) => setPreheader(event.target.value)} placeholder="Reinforce the subject line with the next line of context" className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base" />
                    <p className="text-xs text-slate-500">{preheader.length}/150 characters</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="replyToEmail" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reply-To Address</Label>
                    <Input id="replyToEmail" value={replyToEmail} onChange={(event) => setReplyToEmail(event.target.value)} placeholder="replies@yourdomain.com" className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base" />
                    <p className="text-xs text-slate-500">Replies, bounces, and handoffs should route to the monitored campaign inbox.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[28px] border-white/70 bg-slate-950 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.6)]">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3"><ShieldCheck className="h-5 w-5 text-emerald-300" /></div>
                  <div>
                    <p className="text-sm font-semibold">Campaign Route Summary</p>
                    <p className="text-xs text-slate-300">This route is carried into the template and launch workflow.</p>
                  </div>
                </div>
                {[
                  { label: "Provider", value: providerSummary?.name || "Default routing", detail: providerLabel(providerSummary) },
                  { label: "Domain", value: domainSummary?.domain || "Sender-linked domain", detail: domainSummary ? `Health score ${domainSummary.healthScore ?? "n/a"}` : "Resolved from sender" },
                  { label: "Sender", value: selectedSender ? `${selectedSender.fromName || selectedSender.name} <${selectedSender.fromEmail}>` : "No sender selected", detail: replyToEmail || "Reply inbox not set" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold">{item.value}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/70 bg-white/90 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><Bot className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Unified Email Agent Guardrails</p>
                    <p className="text-xs leading-5 text-slate-500">The template step uses the unified email agent as the source of truth for CTA, personalization, compliance, and deliverability.</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p>Single-CTA, deliverability-safe copy patterns stay aligned with the email agent architecture.</p>
                  <p>Open, click, unsubscribe, and suppression handling remain aligned with the send pipeline.</p>
                  <p>Landing page CTA links can carry merge-tag prefill data in the builder.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/70 bg-white/90 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
              <CardContent className="space-y-3 p-6">
                <p className="text-sm font-semibold text-slate-950">Supported Personalization</p>
                <div className="flex flex-wrap gap-2">
                  {["{{firstName}}", "{{lastName}}", "{{company}}", "{{jobTitle}}", "{{email}}"].map((token) => (
                    <Badge key={token} variant="outline" className="rounded-full border-slate-200 px-3 py-1 text-xs text-slate-700">{token}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className={cn("rounded-2xl p-2", isValid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                  {isValid ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">{isValid ? "Ready for template generation" : "Complete the routing envelope"}</p>
                  <p className="text-xs leading-5 text-slate-500">
                    Provider, sender, reply-to, subject, client, and project should all be selected before moving forward.
                  </p>
                </div>
              </div>

              <Button type="submit" disabled={!isValid} className="h-14 w-full rounded-2xl bg-slate-950 text-base font-semibold text-white hover:bg-slate-800">
                <Mail className="mr-2 h-5 w-5" />
                Continue to Template Builder
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Next step: generate the full email, preview it, test it, and prepare launch.</p>
                <Button type="button" variant="link" onClick={onCancel} className="px-0 text-sm text-slate-500">Cancel</Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CampaignIntentForm;
