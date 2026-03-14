import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, XCircle, AlertTriangle, Plus, Pencil, Trash2,
  Zap, Activity, Loader2, RefreshCw, Cloud, ChevronDown, ChevronUp,
  Server, Cpu, BarChart3, Shield, ListChecks, Globe2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface GcpAccount {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  location: string;
  gcsBucket: string;
  geminiApiKey: string | null;
  googleSearchApiKey: string | null;
  googleSearchEngineId: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleOauthRedirectUri: string | null;
  serviceAccountEmail: string | null;
  isActive: boolean;
  isDefault: boolean;
  poolEnabled?: boolean;
  poolRole?: string;
  poolMaxSessions?: number;
  poolPriority?: number;
  vmProvider?: string;
  vmIp?: string | null;
  vmRegion?: string | null;
  lastActivatedAt: string | null;
  lastActivatedBy: string | null;
  lastHealthCheckAt: string | null;
  lastHealthStatus: string | null;
  lastHealthError: string | null;
  createdAt: string;
}

interface HealthResult {
  ok: boolean;
  checks: { gcs: string; vertex: string; gemini: string };
  errors: string[];
  durationMs: number;
}

interface PoolStats {
  totalKeys: number;
  totalCapacity: number;
  totalActive: number;
  totalUsed: number;
  totalErrors: number;
  utilizationPct: number;
  lastReloadAt: string | null;
  autoReloadEnabled: boolean;
  keys: Array<{
    accountId: string;
    accountName: string;
    projectId: string;
    poolRole: string;
    poolPriority: number;
    activeSessions: number;
    maxSessions: number;
    utilizationPct: number;
    totalUsed: number;
    totalErrors: number;
    failureCount: number;
    healthy: boolean;
    disabled: boolean;
    disabledUntil: string | null;
    lastUsedAt: string | null;
    hasServiceAccount: boolean;
    hasApiKey: boolean;
    authMethod: string;
  }>;
}

interface ChecklistItem {
  id: string;
  category: string;
  area: string;
  description: string;
  detail: string | null;
  status: string;
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
}

interface ChecklistResponse {
  accountName: string;
  projectId: string;
  items: ChecklistItem[];
  summary: {
    total: number;
    completed: number;
    pending: number;
    inProgress: number;
    skipped: number;
  };
}

const EMPTY_FORM = {
  name: "", description: "", projectId: "", location: "us-central1",
  gcsBucket: "", geminiApiKey: "", googleSearchApiKey: "",
  googleSearchEngineId: "", googleClientId: "", googleClientSecret: "",
  googleOauthRedirectUri: "", serviceAccountJson: "",
  poolEnabled: true, poolRole: "api_only", poolMaxSessions: 20, poolPriority: 0,
  vmProvider: "gcp", vmIp: "", vmRegion: "",
};

const ROLE_LABELS: Record<string, string> = {
  host: "VM Host + API",
  api_only: "API Only",
  full: "Full (Host + API)",
};

const PROVIDER_LABELS: Record<string, string> = {
  gcp: "Google Cloud",
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  bare_metal: "Bare Metal / Self-hosted",
};

// ── Main component ───────────────────────────────────────────────────────────
export function GoogleCloudAccountsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [healthResults, setHealthResults] = useState<Record<string, HealthResult>>({});
  const [healthLoading, setHealthLoading] = useState<Record<string, boolean>>({});
  const [activating, setActivating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("accounts");
  const [checklistAccountId, setChecklistAccountId] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery<GcpAccount[]>({
    queryKey: ["/api/google-cloud-accounts"],
    refetchInterval: 30_000,
  });

  const { data: poolStats, refetch: refetchPool } = useQuery<PoolStats>({
    queryKey: ["/api/google-cloud-accounts/pool/stats"],
    refetchInterval: 5_000,
    enabled: activeTab === "pool",
  });

  const { data: checklist, refetch: refetchChecklist } = useQuery<ChecklistResponse>({
    queryKey: ["/api/google-cloud-accounts", checklistAccountId, "migration-checklist"],
    queryFn: () => apiRequest("GET", `/api/google-cloud-accounts/${checklistAccountId}/migration-checklist`) as Promise<ChecklistResponse>,
    enabled: !!checklistAccountId && activeTab === "checklist",
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM & { id?: string }) => {
      const { id, ...body } = data;
      if (id) {
        return apiRequest("PUT", `/api/google-cloud-accounts/${id}`, body);
      }
      return apiRequest("POST", "/api/google-cloud-accounts", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/google-cloud-accounts"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      toast({ title: editingId ? "Account updated" : "Account created" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/google-cloud-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/google-cloud-accounts"] });
      toast({ title: "Account deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const checklistMutation = useMutation({
    mutationFn: async ({ accountId, itemId, status, notes }: { accountId: string; itemId: string; status: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/google-cloud-accounts/${accountId}/migration-checklist/${itemId}`, { status, notes });
    },
    onSuccess: () => {
      refetchChecklist();
      toast({ title: "Checklist updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowAdvanced(false);
    setDialogOpen(true);
  }

  function openEdit(acc: GcpAccount) {
    setEditingId(acc.id);
    setForm({
      name: acc.name,
      description: acc.description || "",
      projectId: acc.projectId,
      location: acc.location,
      gcsBucket: acc.gcsBucket,
      geminiApiKey: acc.geminiApiKey || "",
      googleSearchApiKey: acc.googleSearchApiKey || "",
      googleSearchEngineId: acc.googleSearchEngineId || "",
      googleClientId: acc.googleClientId || "",
      googleClientSecret: acc.googleClientSecret || "",
      googleOauthRedirectUri: acc.googleOauthRedirectUri || "",
      serviceAccountJson: "",
      poolEnabled: acc.poolEnabled !== false,
      poolRole: acc.poolRole || "api_only",
      poolMaxSessions: acc.poolMaxSessions || 20,
      poolPriority: acc.poolPriority || 0,
      vmProvider: acc.vmProvider || "gcp",
      vmIp: acc.vmIp || "",
      vmRegion: acc.vmRegion || "",
    });
    setShowAdvanced(false);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name || !form.projectId) {
      toast({ title: "Required fields missing", description: "Name and Project ID are required.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ ...form, id: editingId || undefined });
  }

  async function runHealthCheck(id: string) {
    setHealthLoading((p) => ({ ...p, [id]: true }));
    try {
      const result = await apiRequest("POST", `/api/google-cloud-accounts/${id}/health-check`) as HealthResult;
      setHealthResults((p) => ({ ...p, [id]: result }));
      toast({ title: result.ok ? "Health check passed" : "Health check failed", variant: result.ok ? "default" : "destructive" });
    } catch (e: any) {
      toast({ title: "Health check error", description: e.message, variant: "destructive" });
    } finally {
      setHealthLoading((p) => ({ ...p, [id]: false }));
    }
  }

  async function handleActivate(id: string) {
    setActivating(id);
    try {
      const result = await apiRequest("POST", `/api/google-cloud-accounts/${id}/activate`) as any;
      if (result.ok) {
        qc.invalidateQueries({ queryKey: ["/api/google-cloud-accounts"] });
        toast({ title: "Account activated", description: `All Google services switched.` });
      } else {
        toast({ title: "Activation failed", description: result.error || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Activation error", description: e.message, variant: "destructive" });
    } finally {
      setActivating(null);
    }
  }

  async function reloadPool() {
    try {
      await apiRequest("POST", "/api/google-cloud-accounts/pool/reload");
      refetchPool();
      toast({ title: "Pool reloaded" });
    } catch (e: any) {
      toast({ title: "Reload failed", description: e.message, variant: "destructive" });
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function RoleBadge({ role }: { role?: string }) {
    const r = role || "api_only";
    const colors: Record<string, string> = {
      host: "bg-blue-500 text-white",
      api_only: "bg-purple-500 text-white",
      full: "bg-indigo-500 text-white",
    };
    return <Badge className={colors[r] || "bg-gray-500 text-white"}>{ROLE_LABELS[r] || r}</Badge>;
  }

  function StatusBadge({ account }: { account: GcpAccount }) {
    if (account.isActive) return <Badge className="bg-green-500 text-white">Active</Badge>;
    return <Badge variant="secondary">Inactive</Badge>;
  }

  function HealthBadge({ id }: { id: string }) {
    const h = healthResults[id];
    if (!h) {
      const acc = accounts.find((a) => a.id === id);
      if (!acc?.lastHealthStatus) return null;
      return acc.lastHealthStatus === "ok"
        ? <Badge variant="outline" className="text-green-600 border-green-400 text-xs">OK</Badge>
        : <Badge variant="outline" className="text-red-600 border-red-400 text-xs">Error</Badge>;
    }
    return h.ok
      ? <Badge variant="outline" className="text-green-600 border-green-400 text-xs flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Healthy</Badge>
      : <Badge variant="outline" className="text-red-600 border-red-400 text-xs flex items-center gap-1"><XCircle className="h-3 w-3" />Unhealthy</Badge>;
  }

  function CheckRow({ label, status }: { label: string; status: string }) {
    const icon = status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      : status === "error" ? <XCircle className="h-3.5 w-3.5 text-red-500" />
        : <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon} {label}: {status}
      </span>
    );
  }

  function ChecklistStatusBadge({ status }: { status: string }) {
    const map: Record<string, { color: string; label: string }> = {
      completed: { color: "bg-green-500 text-white", label: "Done" },
      pending: { color: "bg-yellow-500 text-white", label: "Pending" },
      in_progress: { color: "bg-blue-500 text-white", label: "In Progress" },
      skipped: { color: "bg-gray-400 text-white", label: "Skipped" },
      not_applicable: { color: "bg-gray-300 text-gray-700", label: "N/A" },
    };
    const m = map[status] || map.pending;
    return <Badge className={`${m.color} text-xs`}>{m.label}</Badge>;
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" /> AI Infrastructure Governance
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage GCP accounts, voice call pool distribution, and migration tracking.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" /> Add Account
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="accounts" className="flex items-center gap-1.5">
            <Cloud className="h-4 w-4" /> Accounts ({accounts.length})
          </TabsTrigger>
          <TabsTrigger value="pool" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" /> Voice Pool
          </TabsTrigger>
          <TabsTrigger value="checklist" className="flex items-center gap-1.5">
            <ListChecks className="h-4 w-4" /> Migration
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════ ACCOUNTS TAB ═══════════════ */}
        <TabsContent value="accounts" className="space-y-3 mt-3">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading accounts...
            </div>
          )}

          {!isLoading && accounts.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Cloud className="mx-auto h-10 w-10 mb-3 opacity-30" />
                <p>No Google Cloud accounts configured.</p>
                <p className="text-xs mt-1">Add an account to enable multi-account AI scaling.</p>
              </CardContent>
            </Card>
          )}

          {accounts.map((acc) => (
            <Card key={acc.id} className={acc.isActive ? "border-green-500 border-2" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{acc.name}</CardTitle>
                      <StatusBadge account={acc} />
                      <RoleBadge role={acc.poolRole} />
                      <HealthBadge id={acc.id} />
                      {acc.poolEnabled === false && <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs">Pool Disabled</Badge>}
                    </div>
                    {acc.description && (
                      <CardDescription className="mt-0.5">{acc.description}</CardDescription>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      <span className="text-xs text-muted-foreground">Project: <span className="font-mono">{acc.projectId}</span></span>
                      {acc.poolRole !== "api_only" && (
                        <span className="text-xs text-muted-foreground">Bucket: <span className="font-mono">{acc.gcsBucket}</span></span>
                      )}
                      <span className="text-xs text-muted-foreground">Region: <span className="font-mono">{acc.location}</span></span>
                      <span className="text-xs text-muted-foreground">Sessions: <span className="font-mono">{acc.poolMaxSessions || 20}</span></span>
                      {(acc.poolPriority || 0) > 0 && (
                        <span className="text-xs text-muted-foreground">Priority: <span className="font-mono">{acc.poolPriority}</span></span>
                      )}
                      {acc.vmProvider && acc.vmProvider !== "gcp" && (
                        <span className="text-xs text-blue-600">VM: {PROVIDER_LABELS[acc.vmProvider] || acc.vmProvider}</span>
                      )}
                      {acc.serviceAccountEmail && (
                        <span className="text-xs text-muted-foreground">SA: <span className="font-mono truncate max-w-[200px] inline-block align-bottom">{acc.serviceAccountEmail}</span></span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(acc)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!acc.isActive && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(acc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                {healthResults[acc.id] && (
                  <div className="flex flex-wrap gap-3 mb-3 p-2 rounded bg-muted/40">
                    <CheckRow label="GCS" status={healthResults[acc.id].checks.gcs} />
                    <CheckRow label="Vertex AI" status={healthResults[acc.id].checks.vertex} />
                    <CheckRow label="Gemini" status={healthResults[acc.id].checks.gemini} />
                    {healthResults[acc.id].errors.length > 0 && (
                      <span className="w-full text-xs text-red-600">{healthResults[acc.id].errors.join(" · ")}</span>
                    )}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" disabled={healthLoading[acc.id]} onClick={() => runHealthCheck(acc.id)}>
                    {healthLoading[acc.id] ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Activity className="mr-2 h-3.5 w-3.5" />}
                    Health Check
                  </Button>
                  {!acc.isActive && (
                    <Button size="sm" disabled={activating === acc.id} onClick={() => handleActivate(acc.id)} className="bg-green-600 hover:bg-green-700 text-white">
                      {activating === acc.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-2 h-3.5 w-3.5" />}
                      Activate as Primary
                    </Button>
                  )}
                  {acc.isActive && (
                    <Button size="sm" variant="outline" disabled className="text-green-600 border-green-500">
                      <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Primary Account
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => { setChecklistAccountId(acc.id); setActiveTab("checklist"); }}>
                    <ListChecks className="mr-2 h-3.5 w-3.5" /> Checklist
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ═══════════════ POOL TAB ═══════════════ */}
        <TabsContent value="pool" className="space-y-4 mt-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Gemini Voice Call Pool</h4>
              <p className="text-sm text-muted-foreground">Real-time distribution of voice calls across accounts.</p>
            </div>
            <Button variant="outline" size="sm" onClick={reloadPool}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Reload Pool
            </Button>
          </div>

          {poolStats ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-2xl font-bold">{poolStats.totalKeys}</div>
                    <div className="text-xs text-muted-foreground">Accounts in Pool</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-2xl font-bold">{poolStats.totalActive}/{poolStats.totalCapacity}</div>
                    <div className="text-xs text-muted-foreground">Active / Capacity</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-2xl font-bold">{poolStats.utilizationPct}%</div>
                    <div className="text-xs text-muted-foreground">Pool Utilization</div>
                    <Progress value={poolStats.utilizationPct} className="mt-1.5 h-1.5" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-2xl font-bold">{poolStats.totalUsed.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Total Calls Served</div>
                  </CardContent>
                </Card>
              </div>

              {/* Per-key breakdown */}
              <div className="space-y-2">
                {poolStats.keys.map((k) => (
                  <Card key={k.accountId} className={k.disabled ? "border-red-300 opacity-60" : ""}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{k.accountName}</span>
                          <Badge variant="outline" className="text-xs">{k.poolRole}</Badge>
                          <Badge variant="outline" className="text-xs">{k.authMethod === "vertex_ai" ? "Vertex AI" : "API Key"}</Badge>
                          {k.disabled && <Badge className="bg-red-500 text-white text-xs">Disabled</Badge>}
                          {!k.healthy && !k.disabled && <Badge className="bg-yellow-500 text-white text-xs">Degraded</Badge>}
                          {k.healthy && !k.disabled && <Badge className="bg-green-500 text-white text-xs">Healthy</Badge>}
                        </div>
                        <span className="text-sm font-mono">{k.activeSessions}/{k.maxSessions}</span>
                      </div>
                      <Progress value={k.utilizationPct} className="h-2" />
                      <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                        <span>{k.utilizationPct}% utilized</span>
                        <span>{k.totalUsed.toLocaleString()} calls served · {k.totalErrors} errors</span>
                      </div>
                      {k.disabled && k.disabledUntil && (
                        <p className="text-xs text-red-600 mt-1">Disabled until {new Date(k.disabledUntil).toLocaleTimeString()}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {poolStats.lastReloadAt && (
                <p className="text-xs text-muted-foreground text-right">
                  Pool last reloaded: {new Date(poolStats.lastReloadAt).toLocaleString()}
                  {poolStats.autoReloadEnabled && " (auto-reload active)"}
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading pool stats...
            </div>
          )}
        </TabsContent>

        {/* ═══════════════ CHECKLIST TAB ═══════════════ */}
        <TabsContent value="checklist" className="space-y-4 mt-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Migration Checklist</h4>
              <p className="text-sm text-muted-foreground">Track what needs to be configured when switching GCP accounts.</p>
            </div>
            <Select
              value={checklistAccountId || ""}
              onValueChange={(v) => setChecklistAccountId(v)}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select account..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} ({acc.projectId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!checklistAccountId && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <ListChecks className="mx-auto h-10 w-10 mb-3 opacity-30" />
                <p>Select an account above to view its migration checklist.</p>
              </CardContent>
            </Card>
          )}

          {checklistAccountId && checklist && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-4 gap-3">
                <Card>
                  <CardContent className="pt-3 pb-2 text-center">
                    <div className="text-xl font-bold text-green-600">{checklist.summary.completed}</div>
                    <div className="text-xs text-muted-foreground">Completed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-2 text-center">
                    <div className="text-xl font-bold text-yellow-600">{checklist.summary.pending}</div>
                    <div className="text-xs text-muted-foreground">Pending</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-2 text-center">
                    <div className="text-xl font-bold text-blue-600">{checklist.summary.inProgress}</div>
                    <div className="text-xs text-muted-foreground">In Progress</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-2 text-center">
                    <div className="text-xl font-bold">{checklist.summary.total}</div>
                    <div className="text-xs text-muted-foreground">Total Items</div>
                  </CardContent>
                </Card>
              </div>

              <Progress
                value={checklist.summary.total > 0 ? (checklist.summary.completed / checklist.summary.total) * 100 : 0}
                className="h-2"
              />

              {/* Group by area */}
              {Object.entries(
                checklist.items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
                  (acc[item.area] = acc[item.area] || []).push(item);
                  return acc;
                }, {})
              ).map(([area, items]) => (
                <Card key={area}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">{area}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <ChecklistStatusBadge status={item.status} />
                            <span className="text-sm">{item.description}</span>
                          </div>
                          {item.detail && (
                            <p className="text-xs text-muted-foreground mt-0.5 ml-[52px]">{item.detail}</p>
                          )}
                          {item.notes && (
                            <p className="text-xs text-blue-600 mt-0.5 ml-[52px]">Note: {item.notes}</p>
                          )}
                        </div>
                        <Select
                          value={item.status}
                          onValueChange={(v) => checklistMutation.mutate({
                            accountId: checklistAccountId!,
                            itemId: item.id,
                            status: v,
                          })}
                        >
                          <SelectTrigger className="w-[120px] h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="skipped">Skipped</SelectItem>
                            <SelectItem value="not_applicable">N/A</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Google Cloud Account</DialogTitle>
            <DialogDescription>
              {form.poolRole === "api_only"
                ? "API-only accounts provide Gemini voice capacity. Only project ID and service account are needed."
                : "Full accounts provide both infrastructure (VM, storage) and API access."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Pool Role Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Account Role</Label>
                <Select value={form.poolRole} onValueChange={(v) => setForm(p => ({ ...p, poolRole: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api_only">
                      <div className="flex items-center gap-2"><Cpu className="h-4 w-4" /> API Only — Gemini voice quota only</div>
                    </SelectItem>
                    <SelectItem value="host">
                      <div className="flex items-center gap-2"><Server className="h-4 w-4" /> VM Host + API — Infrastructure + Gemini</div>
                    </SelectItem>
                    <SelectItem value="full">
                      <div className="flex items-center gap-2"><Globe2 className="h-4 w-4" /> Full — Complete access (host + all APIs)</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Account Name *</Label>
                <Input placeholder="e.g. Scale Account 2" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Input placeholder="Optional notes" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>GCP Project ID *</Label>
                <Input placeholder="my-project-123" value={form.projectId} onChange={(e) => setForm(p => ({ ...p, projectId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input placeholder="us-central1" value={form.location} onChange={(e) => setForm(p => ({ ...p, location: e.target.value }))} />
              </div>
              {form.poolRole !== "api_only" && (
                <div className="col-span-2 space-y-1">
                  <Label>GCS Bucket</Label>
                  <Input placeholder="my-bucket-name" value={form.gcsBucket} onChange={(e) => setForm(p => ({ ...p, gcsBucket: e.target.value }))} />
                </div>
              )}
            </div>

            {/* Pool config */}
            <div className="border rounded p-3 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Pool Configuration</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Max Concurrent Sessions</Label>
                  <Input type="number" min={1} max={100} value={form.poolMaxSessions} onChange={(e) => setForm(p => ({ ...p, poolMaxSessions: parseInt(e.target.value) || 20 }))} />
                </div>
                <div className="space-y-1">
                  <Label>Priority (0 = equal)</Label>
                  <Input type="number" min={0} max={100} value={form.poolPriority} onChange={(e) => setForm(p => ({ ...p, poolPriority: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.poolEnabled} onCheckedChange={(v) => setForm(p => ({ ...p, poolEnabled: v }))} />
                <Label className="text-sm">Include in voice call pool</Label>
              </div>
            </div>

            {/* Service account */}
            <div className="space-y-1">
              <Label>Service Account JSON {editingId && <span className="text-muted-foreground text-xs">(leave blank to keep existing)</span>}</Label>
              <Textarea
                placeholder={'Paste the full service account JSON here\n{"type":"service_account","project_id":"..."}'}
                className="font-mono text-xs h-24 resize-none"
                value={form.serviceAccountJson}
                onChange={(e) => setForm(p => ({ ...p, serviceAccountJson: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Encrypted with AES-256 before storing. Required for Vertex AI auth.</p>
            </div>

            {/* Gemini key */}
            <div className="space-y-1">
              <Label>Gemini API Key</Label>
              <Input
                type="password"
                placeholder="AIza..."
                value={form.geminiApiKey}
                onChange={(e) => setForm(p => ({ ...p, geminiApiKey: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Used for Google AI Studio fallback. Service account is preferred for Vertex AI.</p>
            </div>

            {/* VM Provider (only for host/full) */}
            {form.poolRole !== "api_only" && (
              <div className="border rounded p-3 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2"><Server className="h-4 w-4" /> VM Hosting</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Cloud Provider</Label>
                    <Select value={form.vmProvider} onValueChange={(v) => setForm(p => ({ ...p, vmProvider: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gcp">Google Cloud</SelectItem>
                        <SelectItem value="aws">AWS</SelectItem>
                        <SelectItem value="azure">Azure</SelectItem>
                        <SelectItem value="bare_metal">Bare Metal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>VM External IP</Label>
                    <Input placeholder="35.239.173.4" value={form.vmIp} onChange={(e) => setForm(p => ({ ...p, vmIp: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {/* Advanced toggle */}
            {form.poolRole !== "api_only" && (
              <>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowAdvanced(v => !v)}
                >
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Advanced settings (Search API, OAuth)
                </button>

                {showAdvanced && (
                  <div className="space-y-3 border rounded p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Google Search API Key</Label>
                        <Input type="password" placeholder="AIza..." value={form.googleSearchApiKey} onChange={(e) => setForm(p => ({ ...p, googleSearchApiKey: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Search Engine ID</Label>
                        <Input placeholder="b2c57fda..." value={form.googleSearchEngineId} onChange={(e) => setForm(p => ({ ...p, googleSearchEngineId: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Google OAuth Client ID</Label>
                        <Input placeholder="123...apps.googleusercontent.com" value={form.googleClientId} onChange={(e) => setForm(p => ({ ...p, googleClientId: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Google OAuth Client Secret</Label>
                        <Input type="password" placeholder="GOCSPX-..." value={form.googleClientSecret} onChange={(e) => setForm(p => ({ ...p, googleClientSecret: e.target.value }))} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label>OAuth Redirect URI</Label>
                        <Input placeholder="https://yourdomain.com/api/oauth/google/callback" value={form.googleOauthRedirectUri} onChange={(e) => setForm(p => ({ ...p, googleOauthRedirectUri: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account from the pool and configuration. The GCP project and its data are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => { if (deleteId) { deleteMutation.mutate(deleteId); setDeleteId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
