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
  initialData?: Partial;
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

  const [providers, setProviders] = useState([]);
  const [domains, setDomains] = useState([]);
  const [senders, setSenders] = useState([]);
  const [loadingRouting, setLoadingRouting] = useState(true);

  const [selectedProviderId, setSelectedProviderId] = useState(initialData?.campaignProviderId || DEFAULT_PROVIDER_OPTION);
  const [selectedDomainId, setSelectedDomainId] = useState(initialData?.domainAuthId ? String(initialData.domainAuthId) : AUTO_DOMAIN_OPTION);
  const [senderProfileId, setSenderProfileId] = useState(initialData?.senderProfileId || "");

  const [clientAccounts, setClientAccounts] = useState([]);
  const [clientProjects, setClientProjects] = useState([]);
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
    
      
        
          
            
              Step 1 of 3
            
            
              Email Campaign Control Deck
              
                Align provider routing, domain readiness, sender identity, reply handling, and inbox strategy before the unified email agent builds the campaign.
              
            
          

          
            {[
              { label: "Routing", value: providerLabel(providerSummary), subtext: "Multi-provider sender bindings" },
              { label: "Compliance", value: "Suppression + unsubscribe", subtext: "Launch guardrails are surfaced early" },
              { label: "Personalization", value: "Merge tags ready", subtext: "CTA prefill flow supported" },
            ].map((item) => (
              
                {item.label}
                {item.value}
                {item.subtext}
              
            ))}
          
        

        
          
            
              
                
                  
                  
                    Campaign Context
                    Connect the campaign to the client and project that drive AI generation and reporting.
                  
                

                
                  
                    Client
                    {loadingClients ? (
                      
                    ) : (
                      
                        
                        
                          {clientAccounts.map((client) => {client.name || client.companyName})}
                        
                      
                    )}
                  
                  
                    Project
                    {!selectedClientId ? (
                      Choose a client first
                    ) : loadingProjects ? (
                      
                    ) : (
                      
                        
                        
                          {clientProjects.map((project) => {project.name})}
                        
                      
                    )}
                  
                

                {selectedProject && (
                  
                    
                      
                      
                        
                          {selectedProject.name}
                          {selectedProject.status}
                          {selectedProject.campaignOrganizationId && (
                            
                              
                              Unified email agent context linked
                            
                          )}
                        
                        {selectedProject.description && {selectedProject.description}}
                      
                    
                  
                )}
              
            

            
              
                
                  
                  
                    Provider Routing and Identity
                    Choose the provider route, authenticated domain, and sender envelope for this campaign.
                  
                

                {loadingRouting ? (
                  
                     Loading senders...
                  
                ) : (
                  <>
                    {/* Primary: Sender Selection */}
                    
                      From (Sender)
                      
                        
                          
                        
                        
                          {availableSenders.map((sender) => (
                            
                              
                                
                                {sender.fromName || sender.name}
                                &lt;{sender.fromEmail}&gt;
                                {sender.campaignProvider && (
                                  {providerLabel(sender.campaignProvider)}
                                )}
                              
                            
                          ))}
                          {availableSenders.length === 0 && (
                            No senders configured. Add one in Email Management.
                          )}
                        
                      
                    

                    {/* Selected sender summary */}
                    {selectedSender && (
                      
                        
                          
                            
                              
                            
                            
                              {selectedSender.fromName || selectedSender.name} &lt;{selectedSender.fromEmail}&gt;
                              
                                via {providerLabel(selectedSender.campaignProvider || providerSummary)}
                                {domainSummary ? ` · ${domainSummary.domain}` : ''}
                                {selectedSender.warmupStatus === 'in_progress' ? ' · Warming up' : ''}
                              
                            
                          
                          
                            
                              {providerSummary?.healthStatus || "ready"}
                            
                            
                              {selectedSender.isVerified ? "verified" : "unverified"}
                            
                          
                        
                      
                    )}

                    {/* Advanced: Provider & Domain (collapsed by default) */}
                    
                      
                        Advanced: Override provider route & domain
                      
                      
                        
                          Provider Route
                          
                            
                            
                              Use default routing
                              {providers.map((provider) => (
                                
                                  
                                    
                                    {provider.name}
                                    {provider.healthStatus}
                                  
                                
                              ))}
                            
                          
                        
                        
                          Authenticated Domain
                          
                            
                            
                              Auto (sender-linked domain)
                              {availableDomains.map((domain) => (
                                
                                  
                                    
                                    {domain.domain}
                                    
                                      {domainReady(domain) ? "ready" : "review"}
                                    
                                  
                                
                              ))}
                            
                          
                        
                      
                    
                  
                )}
              
            

            
              
                
                  
                  
                    Subject, Reply Handling, and Inbox Preview
                    Set the envelope details now so the template builder can optimize the full experience around them.
                  
                

                
                  Campaign Name
                   setCampaignName(event.target.value)} placeholder="Q2 account expansion outreach" className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base" autoFocus />
                

                
                  
                    
                      Subject Line
                      
                        {aiSuggesting ? <>Thinking : <>Suggest}
                      
                    
                     setSubject(event.target.value)} placeholder="Quick question about pipeline conversion" className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base" />
                  
                  
                    Inbox Heuristic
                    {subject.length}
                    {subject.length > 60 ? "May truncate on mobile inboxes" : "Healthy range for mobile visibility"}
                  
                

                
                  
                    Preview Text
                     setPreheader(event.target.value)} placeholder="Reinforce the subject line with the next line of context" className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base" />
                    {preheader.length}/150 characters
                  
                  
                    Reply-To Address
                     setReplyToEmail(event.target.value)} placeholder="replies@yourdomain.com" className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-base" />
                    Replies, bounces, and handoffs should route to the monitored campaign inbox.
                  
                
              
            
          

          
            
              
                
                  
                  
                    Campaign Route Summary
                    This route is carried into the template and launch workflow.
                  
                
                {[
                  { label: "Provider", value: providerSummary?.name || "Default routing", detail: providerLabel(providerSummary) },
                  { label: "Domain", value: domainSummary?.domain || "Sender-linked domain", detail: domainSummary ? `Health score ${domainSummary.healthScore ?? "n/a"}` : "Resolved from sender" },
                  { label: "Sender", value: selectedSender ? `${selectedSender.fromName || selectedSender.name} ` : "No sender selected", detail: replyToEmail || "Reply inbox not set" },
                ].map((item) => (
                  
                    {item.label}
                    {item.value}
                    {item.detail}
                  
                ))}
              
            

            
              
                
                  
                  
                    Unified Email Agent Guardrails
                    The template step uses the unified email agent as the source of truth for CTA, personalization, compliance, and deliverability.
                  
                
                
                  Single-CTA, deliverability-safe copy patterns stay aligned with the email agent architecture.
                  Open, click, unsubscribe, and suppression handling remain aligned with the send pipeline.
                  Landing page CTA links can carry merge-tag prefill data in the builder.
                
              
            

            
              
                Supported Personalization
                
                  {["{{firstName}}", "{{lastName}}", "{{company}}", "{{jobTitle}}", "{{email}}"].map((token) => (
                    {token}
                  ))}
                
              
            

            
              
                
                  {isValid ?  : }
                
                
                  {isValid ? "Ready for template generation" : "Complete the routing envelope"}
                  
                    Provider, sender, reply-to, subject, client, and project should all be selected before moving forward.
                  
                
              

              
                
                Continue to Template Builder
                
              

              
                Next step: generate the full email, preview it, test it, and prepare launch.
                Cancel
              
            
          
        
      
    
  );
}

export default CampaignIntentForm;