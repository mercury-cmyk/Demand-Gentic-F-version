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
  keys: Array;
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

const ROLE_LABELS: Record = {
  host: "VM Host + API",
  api_only: "API Only",
  full: "Full (Host + API)",
};

const PROVIDER_LABELS: Record = {
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
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [healthResults, setHealthResults] = useState>({});
  const [healthLoading, setHealthLoading] = useState>({});
  const [activating, setActivating] = useState(null);
  const [activeTab, setActiveTab] = useState("accounts");
  const [checklistAccountId, setChecklistAccountId] = useState(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["/api/google-cloud-accounts"],
    refetchInterval: 30_000,
  });

  const { data: poolStats, refetch: refetchPool } = useQuery({
    queryKey: ["/api/google-cloud-accounts/pool/stats"],
    refetchInterval: 5_000,
    enabled: activeTab === "pool",
  });

  const { data: checklist, refetch: refetchChecklist } = useQuery({
    queryKey: ["/api/google-cloud-accounts", checklistAccountId, "migration-checklist"],
    queryFn: () => apiRequest("GET", `/api/google-cloud-accounts/${checklistAccountId}/migration-checklist`) as Promise,
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
    const colors: Record = {
      host: "bg-blue-500 text-white",
      api_only: "bg-purple-500 text-white",
      full: "bg-indigo-500 text-white",
    };
    return {ROLE_LABELS[r] || r};
  }

  function StatusBadge({ account }: { account: GcpAccount }) {
    if (account.isActive) return Active;
    return Inactive;
  }

  function HealthBadge({ id }: { id: string }) {
    const h = healthResults[id];
    if (!h) {
      const acc = accounts.find((a) => a.id === id);
      if (!acc?.lastHealthStatus) return null;
      return acc.lastHealthStatus === "ok"
        ? OK
        : Error;
    }
    return h.ok
      ? Healthy
      : Unhealthy;
  }

  function CheckRow({ label, status }: { label: string; status: string }) {
    const icon = status === "ok" ? 
      : status === "error" ? 
        : ;
    return (
      
        {icon} {label}: {status}
      
    );
  }

  function ChecklistStatusBadge({ status }: { status: string }) {
    const map: Record = {
      completed: { color: "bg-green-500 text-white", label: "Done" },
      pending: { color: "bg-yellow-500 text-white", label: "Pending" },
      in_progress: { color: "bg-blue-500 text-white", label: "In Progress" },
      skipped: { color: "bg-gray-400 text-white", label: "Skipped" },
      not_applicable: { color: "bg-gray-300 text-gray-700", label: "N/A" },
    };
    const m = map[status] || map.pending;
    return {m.label};
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    
      
        
          
             AI Infrastructure Governance
          
          
            Manage GCP accounts, voice call pool distribution, and migration tracking.
          
        
        
           Add Account
        
      

      
        
          
             Accounts ({accounts.length})
          
          
             Voice Pool
          
          
             Migration
          
        

        {/* ═══════════════ ACCOUNTS TAB ═══════════════ */}
        
          {isLoading && (
            
               Loading accounts...
            
          )}

          {!isLoading && accounts.length === 0 && (
            
              
                
                No Google Cloud accounts configured.
                Add an account to enable multi-account AI scaling.
              
            
          )}

          {accounts.map((acc) => (
            
              
                
                  
                    
                      {acc.name}
                      
                      
                      
                      {acc.poolEnabled === false && Pool Disabled}
                    
                    {acc.description && (
                      {acc.description}
                    )}
                    
                      Project: {acc.projectId}
                      {acc.poolRole !== "api_only" && (
                        Bucket: {acc.gcsBucket}
                      )}
                      Region: {acc.location}
                      Sessions: {acc.poolMaxSessions || 20}
                      {(acc.poolPriority || 0) > 0 && (
                        Priority: {acc.poolPriority}
                      )}
                      {acc.vmProvider && acc.vmProvider !== "gcp" && (
                        VM: {PROVIDER_LABELS[acc.vmProvider] || acc.vmProvider}
                      )}
                      {acc.serviceAccountEmail && (
                        SA: {acc.serviceAccountEmail}
                      )}
                    
                  
                  
                     openEdit(acc)}>
                      
                    
                    {!acc.isActive && (
                       setDeleteId(acc.id)}>
                        
                      
                    )}
                  
                
              
              
                {healthResults[acc.id] && (
                  
                    
                    
                    
                    {healthResults[acc.id].errors.length > 0 && (
                      {healthResults[acc.id].errors.join(" · ")}
                    )}
                  
                )}

                
                   runHealthCheck(acc.id)}>
                    {healthLoading[acc.id] ?  : }
                    Health Check
                  
                  {!acc.isActive && (
                     handleActivate(acc.id)} className="bg-green-600 hover:bg-green-700 text-white">
                      {activating === acc.id ?  : }
                      Activate as Primary
                    
                  )}
                  {acc.isActive && (
                    
                       Primary Account
                    
                  )}
                   { setChecklistAccountId(acc.id); setActiveTab("checklist"); }}>
                     Checklist
                  
                
              
            
          ))}
        

        {/* ═══════════════ POOL TAB ═══════════════ */}
        
          
            
              Gemini Voice Call Pool
              Real-time distribution of voice calls across accounts.
            
            
               Reload Pool
            
          

          {poolStats ? (
            <>
              {/* Summary cards */}
              
                
                  
                    {poolStats.totalKeys}
                    Accounts in Pool
                  
                
                
                  
                    {poolStats.totalActive}/{poolStats.totalCapacity}
                    Active / Capacity
                  
                
                
                  
                    {poolStats.utilizationPct}%
                    Pool Utilization
                    
                  
                
                
                  
                    {poolStats.totalUsed.toLocaleString()}
                    Total Calls Served
                  
                
              

              {/* Per-key breakdown */}
              
                {poolStats.keys.map((k) => (
                  
                    
                      
                        
                          {k.accountName}
                          {k.poolRole}
                          {k.authMethod === "vertex_ai" ? "Vertex AI" : "API Key"}
                          {k.disabled && Disabled}
                          {!k.healthy && !k.disabled && Degraded}
                          {k.healthy && !k.disabled && Healthy}
                        
                        {k.activeSessions}/{k.maxSessions}
                      
                      
                      
                        {k.utilizationPct}% utilized
                        {k.totalUsed.toLocaleString()} calls served · {k.totalErrors} errors
                      
                      {k.disabled && k.disabledUntil && (
                        Disabled until {new Date(k.disabledUntil).toLocaleTimeString()}
                      )}
                    
                  
                ))}
              

              {poolStats.lastReloadAt && (
                
                  Pool last reloaded: {new Date(poolStats.lastReloadAt).toLocaleString()}
                  {poolStats.autoReloadEnabled && " (auto-reload active)"}
                
              )}
            
          ) : (
            
               Loading pool stats...
            
          )}
        

        {/* ═══════════════ CHECKLIST TAB ═══════════════ */}
        
          
            
              Migration Checklist
              Track what needs to be configured when switching GCP accounts.
            
             setChecklistAccountId(v)}
            >
              
                
              
              
                {accounts.map((acc) => (
                  
                    {acc.name} ({acc.projectId})
                  
                ))}
              
            
          

          {!checklistAccountId && (
            
              
                
                Select an account above to view its migration checklist.
              
            
          )}

          {checklistAccountId && checklist && (
            <>
              {/* Summary */}
              
                
                  
                    {checklist.summary.completed}
                    Completed
                  
                
                
                  
                    {checklist.summary.pending}
                    Pending
                  
                
                
                  
                    {checklist.summary.inProgress}
                    In Progress
                  
                
                
                  
                    {checklist.summary.total}
                    Total Items
                  
                
              

               0 ? (checklist.summary.completed / checklist.summary.total) * 100 : 0}
                className="h-2"
              />

              {/* Group by area */}
              {Object.entries(
                checklist.items.reduce>((acc, item) => {
                  (acc[item.area] = acc[item.area] || []).push(item);
                  return acc;
                }, {})
              ).map(([area, items]) => (
                
                  
                    {area}
                  
                  
                    {items.map((item) => (
                      
                        
                          
                            
                            {item.description}
                          
                          {item.detail && (
                            {item.detail}
                          )}
                          {item.notes && (
                            Note: {item.notes}
                          )}
                        
                         checklistMutation.mutate({
                            accountId: checklistAccountId!,
                            itemId: item.id,
                            status: v,
                          })}
                        >
                          
                            
                          
                          
                            Pending
                            In Progress
                            Completed
                            Skipped
                            N/A
                          
                        
                      
                    ))}
                  
                
              ))}
            
          )}
        
      

      {/* ── Create / Edit dialog ─────────────────────────────────────────── */}
      
        
          
            {editingId ? "Edit" : "Add"} Google Cloud Account
            
              {form.poolRole === "api_only"
                ? "API-only accounts provide Gemini voice capacity. Only project ID and service account are needed."
                : "Full accounts provide both infrastructure (VM, storage) and API access."}
            
          

          
            {/* Pool Role Selection */}
            
              
                Account Role
                 setForm(p => ({ ...p, poolRole: v }))}>
                  
                  
                    
                       API Only — Gemini voice quota only
                    
                    
                       VM Host + API — Infrastructure + Gemini
                    
                    
                       Full — Complete access (host + all APIs)
                    
                  
                
              
            

            {/* Basic fields */}
            
              
                Account Name *
                 setForm(p => ({ ...p, name: e.target.value }))} />
              
              
                Description
                 setForm(p => ({ ...p, description: e.target.value }))} />
              
              
                GCP Project ID *
                 setForm(p => ({ ...p, projectId: e.target.value }))} />
              
              
                Location
                 setForm(p => ({ ...p, location: e.target.value }))} />
              
              {form.poolRole !== "api_only" && (
                
                  GCS Bucket
                   setForm(p => ({ ...p, gcsBucket: e.target.value }))} />
                
              )}
            

            {/* Pool config */}
            
               Pool Configuration
              
                
                  Max Concurrent Sessions
                   setForm(p => ({ ...p, poolMaxSessions: parseInt(e.target.value) || 20 }))} />
                
                
                  Priority (0 = equal)
                   setForm(p => ({ ...p, poolPriority: parseInt(e.target.value) || 0 }))} />
                
              
              
                 setForm(p => ({ ...p, poolEnabled: v }))} />
                Include in voice call pool
              
            

            {/* Service account */}
            
              Service Account JSON {editingId && (leave blank to keep existing)}
               setForm(p => ({ ...p, serviceAccountJson: e.target.value }))}
              />
              Encrypted with AES-256 before storing. Required for Vertex AI auth.
            

            {/* Gemini key */}
            
              Gemini API Key
               setForm(p => ({ ...p, geminiApiKey: e.target.value }))}
              />
              Used for Google AI Studio fallback. Service account is preferred for Vertex AI.
            

            {/* VM Provider (only for host/full) */}
            {form.poolRole !== "api_only" && (
              
                 VM Hosting
                
                  
                    Cloud Provider
                     setForm(p => ({ ...p, vmProvider: v }))}>
                      
                      
                        Google Cloud
                        AWS
                        Azure
                        Bare Metal
                      
                    
                  
                  
                    VM External IP
                     setForm(p => ({ ...p, vmIp: e.target.value }))} />
                  
                
              
            )}

            {/* Advanced toggle */}
            {form.poolRole !== "api_only" && (
              <>
                 setShowAdvanced(v => !v)}
                >
                  {showAdvanced ?  : }
                  Advanced settings (Search API, OAuth)
                

                {showAdvanced && (
                  
                    
                      
                        Google Search API Key
                         setForm(p => ({ ...p, googleSearchApiKey: e.target.value }))} />
                      
                      
                        Search Engine ID
                         setForm(p => ({ ...p, googleSearchEngineId: e.target.value }))} />
                      
                      
                        Google OAuth Client ID
                         setForm(p => ({ ...p, googleClientId: e.target.value }))} />
                      
                      
                        Google OAuth Client Secret
                         setForm(p => ({ ...p, googleClientSecret: e.target.value }))} />
                      
                      
                        OAuth Redirect URI
                         setForm(p => ({ ...p, googleOauthRedirectUri: e.target.value }))} />
                      
                    
                  
                )}
              
            )}
          

          
             setDialogOpen(false)}>Cancel
            
              {saveMutation.isPending && }
              {editingId ? "Save Changes" : "Create Account"}
            
          
        
      

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
       !o && setDeleteId(null)}>
        
          
            Delete account?
            
              This removes the account from the pool and configuration. The GCP project and its data are unaffected.
            
          
          
            Cancel
             { if (deleteId) { deleteMutation.mutate(deleteId); setDeleteId(null); } }}
            >
              Delete
            
          
        
      
    
  );
}