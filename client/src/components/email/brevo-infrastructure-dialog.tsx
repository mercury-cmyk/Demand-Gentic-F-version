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
  senders: Array<{
    id: string;
    name: string;
    email: string;
    domain: string | null;
    active: boolean | null;
    verified: boolean | null;
    ips: string[];
    localMatch: {
      id: string | number;
      label: string;
      providerId: string | null;
      providerName: string | null;
    } | null;
  }>;
  domains: Array<{
    id: string;
    domain: string;
    authenticated: boolean | null;
    verified: boolean | null;
    status: string | null;
    dnsRecords: Array<{
      type: string;
      name: string;
      value: string;
      status: string | null;
    }>;
    localMatch: {
      id: string | number;
      label: string;
      providerId: string | null;
      providerName: string | null;
    } | null;
  }>;
  dedicatedIps: Array<{
    id: string;
    ip: string;
    name: string | null;
    domain: string | null;
    status: string | null;
    warmupStatus: string | null;
    weight: number | null;
  }>;
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

  const overviewQuery = useQuery<BrevoInfrastructureOverview>({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Brevo Infrastructure</DialogTitle>
          <DialogDescription>
            Manage Brevo senders, sender domains, verification, and dedicated IP assignments inside the email governance dashboard for {provider?.name || "this provider"}.
          </DialogDescription>
        </DialogHeader>

        {overviewQuery.isLoading ? (
          <div className="flex h-[420px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Brevo assets...
          </div>
        ) : (
          <ScrollArea className="h-[70vh] pr-4">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Brevo Senders</CardDescription>
                    <CardTitle>{overview?.stats.senderCount || 0}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {overview?.stats.matchedLocalSenders || 0} already match dashboard sender profiles.
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Brevo Domains</CardDescription>
                    <CardTitle>{overview?.stats.domainCount || 0}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {overview?.stats.matchedLocalDomains || 0} already match dashboard domain records.
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Dedicated IPs</CardDescription>
                    <CardTitle>{overview?.stats.dedicatedIpCount || 0}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Change active IP assignment by editing a sender below.
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Provider Source</CardDescription>
                    <CardTitle className="capitalize">{overview?.provider.source || provider?.source || "database"}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {overview?.provider.source === "environment"
                      ? "Environment-backed providers can manage Brevo live, but explicit local governance bindings require a saved provider."
                      : "Saved providers support explicit local sender/domain governance bindings."}
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => refreshOverview()} disabled={overviewQuery.isFetching}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Sync To Dashboard
                </Button>
              </div>

              {(overview?.sectionErrors.senders || overview?.sectionErrors.domains || overview?.sectionErrors.dedicatedIps) && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="space-y-2 pt-6 text-sm text-amber-900">
                    {overview.sectionErrors.senders && <div>{overview.sectionErrors.senders}</div>}
                    {overview.sectionErrors.domains && <div>{overview.sectionErrors.domains}</div>}
                    {overview.sectionErrors.dedicatedIps && <div>{overview.sectionErrors.dedicatedIps}</div>}
                  </CardContent>
                </Card>
              )}

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid w-full max-w-xl grid-cols-3">
                  <TabsTrigger value="senders">Senders</TabsTrigger>
                  <TabsTrigger value="domains">Domains</TabsTrigger>
                  <TabsTrigger value="ips">Dedicated IPs</TabsTrigger>
                </TabsList>

                <TabsContent value="senders" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>{senderForm.id ? "Edit Brevo Sender" : "Create Brevo Sender"}</CardTitle>
                      <CardDescription>
                        Assign one or more dedicated IPs by comma-separating the IP values.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={senderForm.name}
                          onChange={(event) => setSenderForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="DemandGentic Marketing"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          value={senderForm.email}
                          onChange={(event) => setSenderForm((current) => ({ ...current, email: event.target.value }))}
                          placeholder="campaigns@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Dedicated IPs</Label>
                        <Input
                          value={senderForm.ips}
                          onChange={(event) => setSenderForm((current) => ({ ...current, ips: event.target.value }))}
                          placeholder="1.2.3.4, 5.6.7.8"
                        />
                      </div>
                    </CardContent>
                    <DialogFooter>
                      {senderForm.id && (
                        <Button variant="outline" onClick={() => setSenderForm(emptySenderForm)}>
                          Cancel Edit
                        </Button>
                      )}
                      <Button
                        onClick={() => saveSenderMutation.mutate()}
                        disabled={!senderForm.name || !senderForm.email || saveSenderMutation.isPending}
                      >
                        {saveSenderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {senderForm.id ? "Save Sender" : "Create Sender"}
                      </Button>
                    </DialogFooter>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {overview?.senders.map((sender) => (
                      <Card key={sender.id}>
                        <CardHeader className="border-b bg-muted/20">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-lg">{sender.name}</CardTitle>
                                <Badge variant="outline" className={toneForFlag(sender.verified)}>
                                  {sender.verified ? "Verified" : "Needs verification"}
                                </Badge>
                                <Badge variant="outline" className={toneForFlag(sender.active)}>
                                  {sender.active === false ? "Inactive" : "Active"}
                                </Badge>
                              </div>
                              <CardDescription>{sender.email}</CardDescription>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                if (window.confirm(`Delete Brevo sender "${sender.email}"?`)) {
                                  deleteSenderMutation.mutate(sender.id);
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
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">Domain</div>
                              <div className="font-medium">{sender.domain || "Unknown"}</div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">Assigned IPs</div>
                              <div className="font-medium">{sender.ips.length ? sender.ips.join(", ") : "Shared / none assigned"}</div>
                            </div>
                          </div>

                          {sender.localMatch ? (
                            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                              Matched dashboard sender: {sender.localMatch.label}
                              {sender.localMatch.providerName ? ` (${sender.localMatch.providerName})` : ""}
                            </div>
                          ) : (
                            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                              No dashboard sender profile currently matches this Brevo sender. Use "Sync To Dashboard" to import it into governance settings.
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() =>
                                setSenderForm({
                                  id: sender.id,
                                  name: sender.name,
                                  email: sender.email,
                                  ips: sender.ips.join(", "),
                                })
                              }
                            >
                              <Edit3 className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                const otp = window.prompt(`Enter the Brevo OTP for ${sender.email}`);
                                if (otp) {
                                  validateSenderMutation.mutate({ senderId: sender.id, otp });
                                }
                              }}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Validate OTP
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {overview && overview.senders.length === 0 && (
                    <Card>
                      <CardContent className="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        No Brevo senders found for this provider yet.
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="domains" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Create Brevo Domain</CardTitle>
                      <CardDescription>
                        Create the sender domain in Brevo first, then authenticate it and sync it into the local domain governance inventory.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <Label>Domain</Label>
                        <Input
                          value={domainForm.domain}
                          onChange={(event) => setDomainForm({ domain: event.target.value })}
                          placeholder="mail.example.com"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          onClick={() => createDomainMutation.mutate()}
                          disabled={!domainForm.domain || createDomainMutation.isPending}
                        >
                          {createDomainMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Create Domain
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4">
                    {overview?.domains.map((domain) => (
                      <Card key={domain.id}>
                        <CardHeader className="border-b bg-muted/20">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-lg">{domain.domain}</CardTitle>
                                <Badge variant="outline" className={toneForFlag(domain.authenticated)}>
                                  {domain.authenticated ? "Authenticated" : "Pending auth"}
                                </Badge>
                                <Badge variant="outline" className={toneForFlag(domain.verified)}>
                                  {domain.verified ? "Verified" : domain.status || "Pending"}
                                </Badge>
                              </div>
                              <CardDescription>
                                {domain.localMatch
                                  ? `Matched to dashboard domain ${domain.localMatch.label}`
                                  : "Not yet represented in the local domain dashboard"}
                              </CardDescription>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                if (window.confirm(`Delete Brevo domain "${domain.domain}"?`)) {
                                  deleteDomainMutation.mutate(domain.domain);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                          {domain.dnsRecords.length > 0 ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              {domain.dnsRecords.map((record) => (
                                <div key={`${domain.id}-${record.name}-${record.type}`} className="rounded-lg border p-3">
                                  <div className="mb-1 flex items-center gap-2">
                                    <Badge variant="outline">{record.type}</Badge>
                                    {record.status && <Badge variant="secondary">{record.status}</Badge>}
                                  </div>
                                  <div className="text-xs font-mono text-foreground">{record.name}</div>
                                  <div className="mt-1 break-all text-xs font-mono text-muted-foreground">{record.value}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                              Brevo did not return DNS record details for this domain in the current response. Use Authenticate after DNS is in place, then Refresh.
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() => authenticateDomainMutation.mutate(domain.domain)}
                              disabled={authenticateDomainMutation.isPending}
                            >
                              <Globe className="mr-2 h-4 w-4" />
                              Authenticate
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {overview && overview.domains.length === 0 && (
                    <Card>
                      <CardContent className="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
                        <Globe className="h-4 w-4" />
                        No Brevo sender domains found for this provider yet.
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="ips" className="space-y-4">
                  <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="space-y-2 pt-6 text-sm text-amber-900">
                      <div className="font-medium">Dedicated IP governance</div>
                      <div>
                        The documented Brevo API surface we verified supports listing dedicated IPs and assigning them to senders through sender create/update. We did not verify an endpoint that provisions brand-new dedicated IPs, so "add/change IP" in this dashboard is handled as sender IP assignment.
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {overview?.dedicatedIps.map((entry) => (
                      <Card key={entry.id}>
                        <CardHeader className="border-b bg-muted/20">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <CardTitle className="text-lg">{entry.ip}</CardTitle>
                              <CardDescription>{entry.name || entry.domain || "Dedicated IP"}</CardDescription>
                            </div>
                            <Badge variant="outline">{entry.status || "available"}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">Warmup</div>
                              <div className="font-medium">{entry.warmupStatus || "Unknown"}</div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">Weight</div>
                              <div className="font-medium">{entry.weight ?? "Not set"}</div>
                            </div>
                          </div>
                          <Separator />
                          <div className="text-sm text-muted-foreground">
                            Edit a sender in the Senders tab to assign or change this IP for outbound Brevo traffic.
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {overview && overview.dedicatedIps.length === 0 && (
                    <Card>
                      <CardContent className="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
                        <Server className="h-4 w-4" />
                        No Brevo dedicated IPs were returned for this account or this API plan.
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>

              {overview?.syncedAt && (
                <div className="text-xs text-muted-foreground">
                  Last refreshed {new Date(overview.syncedAt).toLocaleString()}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
