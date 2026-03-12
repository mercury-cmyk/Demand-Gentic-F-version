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

const EMPTY_FORM = {
  name: "", description: "", projectId: "", location: "us-central1",
  gcsBucket: "", geminiApiKey: "", googleSearchApiKey: "",
  googleSearchEngineId: "", googleClientId: "", googleClientSecret: "",
  googleOauthRedirectUri: "", serviceAccountJson: "",
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

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery<GcpAccount[]>({
    queryKey: ["/api/google-cloud-accounts"],
    refetchInterval: 30_000,
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
      serviceAccountJson: "", // never pre-fill the encrypted value
    });
    setShowAdvanced(false);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name || !form.projectId || !form.gcsBucket) {
      toast({ title: "Required fields missing", description: "Name, Project ID, and GCS Bucket are required.", variant: "destructive" });
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
        toast({ title: "Account activated", description: `All Google services switched. Reloaded: ${result.apply?.servicesReloaded?.join(", ")}` });
      } else {
        toast({ title: "Activation failed", description: result.error || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Activation error", description: e.message, variant: "destructive" });
    } finally {
      setActivating(null);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
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
        ? <Badge variant="outline" className="text-green-600 border-green-400 text-xs">Last check: OK</Badge>
        : <Badge variant="outline" className="text-red-600 border-red-400 text-xs">Last check: Error</Badge>;
    }
    return h.ok
      ? <Badge variant="outline" className="text-green-600 border-green-400 text-xs flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Healthy ({h.durationMs}ms)</Badge>
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

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Google Cloud Accounts</h3>
          <p className="text-sm text-muted-foreground">
            Manage multiple GCP accounts. Switching an account hot-swaps Vertex AI, GCS, Gemini API key, and all related services without a restart.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" /> Add Account
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading accounts…
        </div>
      )}

      {!isLoading && accounts.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Cloud className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p>No Google Cloud accounts configured.</p>
            <p className="text-xs mt-1">Add an account to enable account switching.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {accounts.map((acc) => (
          <Card key={acc.id} className={acc.isActive ? "border-green-500 border-2" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{acc.name}</CardTitle>
                    <StatusBadge account={acc} />
                    <HealthBadge id={acc.id} />
                  </div>
                  {acc.description && (
                    <CardDescription className="mt-0.5">{acc.description}</CardDescription>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <span className="text-xs text-muted-foreground">Project: <span className="font-mono">{acc.projectId}</span></span>
                    <span className="text-xs text-muted-foreground">Bucket: <span className="font-mono">{acc.gcsBucket}</span></span>
                    <span className="text-xs text-muted-foreground">Location: <span className="font-mono">{acc.location}</span></span>
                    {acc.serviceAccountEmail && (
                      <span className="text-xs text-muted-foreground">SA: <span className="font-mono">{acc.serviceAccountEmail}</span></span>
                    )}
                  </div>
                  {acc.lastActivatedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last activated: {new Date(acc.lastActivatedAt).toLocaleString()}
                    </p>
                  )}
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
              {/* Health check detail if available */}
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
                {/* Health check */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={healthLoading[acc.id]}
                  onClick={() => runHealthCheck(acc.id)}
                >
                  {healthLoading[acc.id]
                    ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    : <Activity className="mr-2 h-3.5 w-3.5" />}
                  Health Check
                </Button>

                {/* Activate */}
                {!acc.isActive && (
                  <Button
                    size="sm"
                    disabled={activating === acc.id}
                    onClick={() => handleActivate(acc.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {activating === acc.id
                      ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      : <Zap className="mr-2 h-3.5 w-3.5" />}
                    Switch to This Account
                  </Button>
                )}
                {acc.isActive && (
                  <Button size="sm" variant="outline" disabled className="text-green-600 border-green-500">
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Currently Active
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Create / Edit dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Google Cloud Account</DialogTitle>
            <DialogDescription>
              Configure the GCP project, GCS bucket, and credentials. Service account JSON is encrypted before storage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Basic */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Account Name *</Label>
                <Input placeholder="e.g. Production GCP" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Input placeholder="Optional notes" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>GCP Project ID *</Label>
                <Input placeholder="my-project-123" value={form.projectId} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input placeholder="us-central1" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>GCS Bucket *</Label>
                <Input placeholder="my-bucket-name" value={form.gcsBucket} onChange={(e) => setForm((p) => ({ ...p, gcsBucket: e.target.value }))} />
              </div>
            </div>

            {/* Service account */}
            <div className="space-y-1">
              <Label>Service Account JSON {editingId && <span className="text-muted-foreground text-xs">(leave blank to keep existing)</span>}</Label>
              <Textarea
                placeholder={'Paste the full service account JSON here\n{"type":"service_account","project_id":"..."}'}
                className="font-mono text-xs h-24 resize-none"
                value={form.serviceAccountJson}
                onChange={(e) => setForm((p) => ({ ...p, serviceAccountJson: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Encrypted with AES-256 before storing.</p>
            </div>

            {/* Gemini key */}
            <div className="space-y-1">
              <Label>Gemini API Key</Label>
              <Input
                type="password"
                placeholder="AIza..."
                value={form.geminiApiKey}
                onChange={(e) => setForm((p) => ({ ...p, geminiApiKey: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Used for Gemini Live voice and AI Studio API calls.</p>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Advanced settings (Search API, OAuth)
            </button>

            {showAdvanced && (
              <div className="space-y-3 border rounded p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Google Search API Key</Label>
                    <Input type="password" placeholder="AIza..." value={form.googleSearchApiKey} onChange={(e) => setForm((p) => ({ ...p, googleSearchApiKey: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Search Engine ID</Label>
                    <Input placeholder="b2c57fda..." value={form.googleSearchEngineId} onChange={(e) => setForm((p) => ({ ...p, googleSearchEngineId: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Google OAuth Client ID</Label>
                    <Input placeholder="123...apps.googleusercontent.com" value={form.googleClientId} onChange={(e) => setForm((p) => ({ ...p, googleClientId: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Google OAuth Client Secret</Label>
                    <Input type="password" placeholder="GOCSPX-..." value={form.googleClientSecret} onChange={(e) => setForm((p) => ({ ...p, googleClientSecret: e.target.value }))} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>OAuth Redirect URI</Label>
                    <Input placeholder="https://yourdomain.com/api/oauth/google/callback" value={form.googleOauthRedirectUri} onChange={(e) => setForm((p) => ({ ...p, googleOauthRedirectUri: e.target.value }))} />
                  </div>
                </div>
              </div>
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
              This removes the account configuration. The GCP project and its data are unaffected.
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
