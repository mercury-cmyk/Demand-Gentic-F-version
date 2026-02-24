import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  Upload,
  ShieldCheck,
  FileText,
  BarChart3,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
} from "lucide-react";

// ==================== TYPES ====================

interface OverviewData {
  audience: {
    totalContacts?: number;
    totalAccounts?: number;
    contacts?: { total?: number; [key: string]: any };
    accounts?: { total?: number; [key: string]: any };
    [key: string]: any;
  };
  qualityScan: { id: string; overallScore: number; completedAt: string } | null;
  dataRequests: { total: number; pending: number; inProgress: number };
  uploads: { total: number; processing: number; completed: number };
  qualityIssues: { total: number; critical: number; high: number; unresolved: number };
}

interface DataRequest {
  id: string;
  title: string;
  description: string | null;
  dataType: string;
  status: string;
  priority: string;
  volumeRequested: number | null;
  createdAt: string;
}

interface DataUpload {
  id: string;
  filename: string;
  fileType: string;
  status: string;
  totalRows: number | null;
  validRows: number | null;
  invalidRows: number | null;
  createdAt: string;
}

interface QualityScan {
  id: string;
  status: string;
  overallScore: number | null;
  totalIssuesFound: number | null;
  completedAt: string | null;
  createdAt: string;
}

interface QualityIssue {
  id: string;
  field: string;
  severity: string;
  category: string;
  affectedCount: number;
  status: string;
  description: string | null;
}

interface DataTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fields: any;
  isActive: boolean;
  createdAt: string;
}

interface DistributionItem {
  value: string;
  count: number;
  percentage: number;
}

interface CoverageItem {
  field: string;
  total: number;
  populated: number;
  missing: number;
  coverage: number;
}

interface MissingFieldItem extends CoverageItem {
  recordType: "account" | "contact";
  missingRate: number;
  recommendation: string;
}

interface InsightsSummaryData {
  generatedAt: string;
  totals: {
    accounts: number;
    contacts: number;
    contactsWithAccount: number;
    orphanContacts: number;
    accountsWithContacts: number;
    accountsWithoutContacts: number;
    activeSegments: number;
    totalLists: number;
    accountLinkRate: number;
    contactLinkRate: number;
  };
  segments: {
    dynamicByEntity: DistributionItem[];
    staticByEntity: DistributionItem[];
  };
  accounts: {
    firmographics: {
      industry: DistributionItem[];
      employeeSize: DistributionItem[];
      revenue: DistributionItem[];
      accountType: DistributionItem[];
      hqCountry: DistributionItem[];
    };
    coverage: CoverageItem[];
  };
  contacts: {
    demographics: {
      seniority: DistributionItem[];
      department: DistributionItem[];
      country: DistributionItem[];
      state: DistributionItem[];
    };
    coverage: CoverageItem[];
  };
  gaps: {
    topMissingFields: MissingFieldItem[];
  };
}

// ==================== STATUS HELPERS ====================

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    requested: { variant: "outline", label: "Requested" },
    in_progress: { variant: "default", label: "In Progress" },
    completed: { variant: "secondary", label: "Completed" },
    cancelled: { variant: "destructive", label: "Cancelled" },
    pending: { variant: "outline", label: "Pending" },
    validating: { variant: "default", label: "Validating" },
    processing: { variant: "default", label: "Processing" },
    intelligence_running: { variant: "default", label: "Intelligence" },
    failed: { variant: "destructive", label: "Failed" },
    open: { variant: "destructive", label: "Open" },
    resolved: { variant: "secondary", label: "Resolved" },
    ignored: { variant: "outline", label: "Ignored" },
    running: { variant: "default", label: "Running" },
  };
  const entry = map[status] || { variant: "outline" as const, label: status };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-yellow-500 text-white",
    low: "bg-blue-400 text-white",
  };
  return <Badge className={map[severity] || ""}>{severity}</Badge>;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ==================== OVERVIEW TAB ====================

function OverviewTab() {
  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ["/api/data-management/overview"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/overview");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const o = data;
  const totalContacts = o?.audience?.totalContacts ?? o?.audience?.contacts?.total ?? 0;
  const totalAccounts = o?.audience?.totalAccounts ?? o?.audience?.accounts?.total ?? 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Contacts</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalContacts.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalAccounts.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Data Requests</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{o?.dataRequests?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">{o?.dataRequests?.pending ?? 0} pending, {o?.dataRequests?.inProgress ?? 0} in progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Quality Issues</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{o?.qualityIssues?.unresolved ?? 0} <span className="text-sm font-normal text-muted-foreground">open</span></p>
            {(o?.qualityIssues?.critical ?? 0) > 0 && <p className="text-xs text-red-500">{o?.qualityIssues?.critical} critical</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Upload className="h-4 w-4" /> Uploads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Total: <span className="font-medium">{o?.uploads?.total ?? 0}</span></p>
            <p>Processing: <span className="font-medium">{o?.uploads?.processing ?? 0}</span></p>
            <p>Completed: <span className="font-medium">{o?.uploads?.completed ?? 0}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Latest Quality Scan</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {o?.qualityScan ? (
              <div className="space-y-1">
                <p>Score: <span className="font-bold text-lg">{o.qualityScan.overallScore}%</span></p>
                <p className="text-muted-foreground">Completed {formatDate(o.qualityScan.completedAt)}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">No scans completed yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatCount(value: number | null | undefined) {
  return (value ?? 0).toLocaleString();
}

function DistributionCard({ title, items }: { title: string; items: DistributionItem[] }) {
  const rows = (items || []).slice(0, 8);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data available</p>
        ) : (
          rows.map((item) => (
            <div key={`${title}-${item.value}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate" title={item.value}>{item.value}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {formatCount(item.count)} ({item.percentage}%)
                </span>
              </div>
              <Progress value={Math.min(item.percentage, 100)} className="h-1.5" />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CoverageCard({ title, items }: { title: string; items: CoverageItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {(items || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No coverage data available</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Missing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${title}-${item.field}`}>
                  <TableCell className="font-medium">{item.field}</TableCell>
                  <TableCell className="min-w-[220px]">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>{item.coverage}%</span>
                        <span className="text-muted-foreground">
                          {formatCount(item.populated)}/{formatCount(item.total)}
                        </span>
                      </div>
                      <Progress value={Math.min(item.coverage, 100)} className="h-1.5" />
                    </div>
                  </TableCell>
                  <TableCell>{formatCount(item.missing)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== INSIGHTS TAB ====================

function InsightsTab() {
  const { data, isLoading } = useQuery<InsightsSummaryData>({
    queryKey: ["/api/data-management/insights/summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/insights/summary");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!data) return <p className="text-sm text-muted-foreground">No insights data available.</p>;

  const totals = data.totals;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCount(totals.accounts)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Contacts</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCount(totals.contacts)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Contacts Linked To Accounts</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.contactLinkRate}%</p>
            <p className="text-xs text-muted-foreground">
              {formatCount(totals.contactsWithAccount)} linked, {formatCount(totals.orphanContacts)} orphan
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Accounts With Contacts</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.accountLinkRate}%</p>
            <p className="text-xs text-muted-foreground">
              {formatCount(totals.accountsWithContacts)} with contacts, {formatCount(totals.accountsWithoutContacts)} without
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Segments</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCount(totals.activeSegments)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Static Lists</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCount(totals.totalLists)}</p></CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Segment Coverage</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DistributionCard title="Dynamic Segments by Entity" items={data.segments.dynamicByEntity} />
          <DistributionCard title="Static Lists by Entity" items={data.segments.staticByEntity} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Account Firmographics</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <DistributionCard title="Industry" items={data.accounts.firmographics.industry} />
          <DistributionCard title="Employee Size" items={data.accounts.firmographics.employeeSize} />
          <DistributionCard title="Revenue" items={data.accounts.firmographics.revenue} />
          <DistributionCard title="Account Type" items={data.accounts.firmographics.accountType} />
          <DistributionCard title="HQ Country" items={data.accounts.firmographics.hqCountry} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Contact Demographics</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <DistributionCard title="Seniority" items={data.contacts.demographics.seniority} />
          <DistributionCard title="Department" items={data.contacts.demographics.department} />
          <DistributionCard title="Country" items={data.contacts.demographics.country} />
          <DistributionCard title="State" items={data.contacts.demographics.state} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Completeness And Gaps</h3>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <CoverageCard title="Account Field Coverage" items={data.accounts.coverage} />
          <CoverageCard title="Contact Field Coverage" items={data.contacts.coverage} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Highest-Priority Missing Fields</CardTitle>
          </CardHeader>
          <CardContent>
            {(data.gaps.topMissingFields || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No major missing-field gaps detected.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record Type</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Missing Rate</TableHead>
                    <TableHead>Recommendation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.gaps.topMissingFields.map((gap) => (
                    <TableRow key={`${gap.recordType}-${gap.field}`}>
                      <TableCell className="capitalize">{gap.recordType}</TableCell>
                      <TableCell className="font-medium">{gap.field}</TableCell>
                      <TableCell>{gap.missingRate}% ({formatCount(gap.missing)})</TableCell>
                      <TableCell className="text-muted-foreground">{gap.recommendation}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ==================== DATA REQUESTS TAB ====================

function DataRequestsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dataType: "contacts", volumeRequested: "", priority: "medium" });

  const { data, isLoading } = useQuery<{ requests: DataRequest[]; total: number }>({
    queryKey: ["/api/data-management/requests"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/requests");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/data-management/requests", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-management/requests"] });
      toast({ title: "Request Created" });
      setDialogOpen(false);
      setForm({ title: "", description: "", dataType: "contacts", volumeRequested: "", priority: "medium" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Data Requests</h3>
        <Button onClick={() => setDialogOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Request</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.requests || []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data requests yet</TableCell></TableRow>
            ) : (
              (data?.requests || []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell>{r.dataType}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell><Badge variant="outline">{r.priority}</Badge></TableCell>
                  <TableCell>{r.volumeRequested?.toLocaleString() ?? "-"}</TableCell>
                  <TableCell>{formatDate(r.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Data Request</DialogTitle>
            <DialogDescription>Request new data for your campaigns.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Tech VP contacts in Northeast" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Details about the data needed..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Data Type</Label>
                <Select value={form.dataType} onValueChange={(v) => setForm({ ...form, dataType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contacts">Contacts</SelectItem>
                    <SelectItem value="accounts">Accounts</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Volume Requested</Label>
              <Input type="number" value={form.volumeRequested} onChange={(e) => setForm({ ...form, volumeRequested: e.target.value })} placeholder="e.g. 5000" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ ...form, volumeRequested: form.volumeRequested ? parseInt(form.volumeRequested) : null })} disabled={!form.title || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== UPLOADS TAB ====================

function UploadsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery<{ uploads: DataUpload[]; total: number }>({
    queryKey: ["/api/data-management/uploads"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/uploads");
      return res.json();
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/data-management/uploads", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      toast({ title: "Upload Started", description: `${file.name} is being processed` });
      queryClient.invalidateQueries({ queryKey: ["/api/data-management/uploads"] });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Data Uploads</h3>
        <Button size="sm" disabled={uploading} asChild>
          <label className="cursor-pointer">
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload File
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
          </label>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Valid</TableHead>
              <TableHead>Invalid</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.uploads || []).length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No uploads yet</TableCell></TableRow>
            ) : (
              (data?.uploads || []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.filename}</TableCell>
                  <TableCell>{u.fileType}</TableCell>
                  <TableCell>{statusBadge(u.status)}</TableCell>
                  <TableCell>{u.totalRows?.toLocaleString() ?? "-"}</TableCell>
                  <TableCell className="text-green-600">{u.validRows?.toLocaleString() ?? "-"}</TableCell>
                  <TableCell className="text-red-600">{u.invalidRows?.toLocaleString() ?? "-"}</TableCell>
                  <TableCell>{formatDate(u.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ==================== QUALITY TAB ====================

function QualityTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: scans, isLoading: scansLoading } = useQuery<{ scans: QualityScan[] }>({
    queryKey: ["/api/data-management/quality/scans"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/quality/scans");
      return res.json();
    },
  });

  const { data: issues, isLoading: issuesLoading } = useQuery<{ issues: QualityIssue[]; total: number }>({
    queryKey: ["/api/data-management/quality/issues"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/quality/issues");
      return res.json();
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/data-management/quality/scan", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-management/quality/scans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-management/quality/issues"] });
      toast({ title: "Quality Scan Started" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async (issueId: string) => {
      const res = await apiRequest("PATCH", `/api/data-management/quality/issues/${issueId}`, { status: "resolved" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-management/quality/issues"] });
      toast({ title: "Issue Resolved" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Data Quality</h3>
        <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} size="sm">
          {scanMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
          Run Scan
        </Button>
      </div>

      {/* Scan History */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Scan History</CardTitle></CardHeader>
        <CardContent>
          {scansLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (scans?.scans || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No scans yet. Run your first quality scan.</p>
          ) : (
            <div className="space-y-2">
              {(scans?.scans || []).slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm border-b pb-2">
                  <div className="flex items-center gap-2">
                    {statusBadge(s.status)}
                    <span>Score: <span className="font-bold">{s.overallScore ?? "-"}%</span></span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{s.totalIssuesFound ?? 0} issues</span>
                    <span>{formatDate(s.completedAt || s.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quality Issues */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Open Issues</h4>
        {issuesLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Affected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(issues?.issues || []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No quality issues found</TableCell></TableRow>
              ) : (
                (issues?.issues || []).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.field}</TableCell>
                    <TableCell>{severityBadge(i.severity)}</TableCell>
                    <TableCell>{i.category}</TableCell>
                    <TableCell>{i.affectedCount.toLocaleString()}</TableCell>
                    <TableCell>{statusBadge(i.status)}</TableCell>
                    <TableCell>
                      {i.status === "open" && (
                        <Button size="sm" variant="ghost" onClick={() => resolveMutation.mutate(i.id)} disabled={resolveMutation.isPending}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ==================== TEMPLATES TAB ====================

function TemplatesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "general", fields: "[]" });

  const { data, isLoading } = useQuery<{ templates: DataTemplate[] }>({
    queryKey: ["/api/data-management/templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/templates");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/data-management/templates", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-management/templates"] });
      toast({ title: "Template Created" });
      setDialogOpen(false);
      setForm({ name: "", description: "", category: "general", fields: "[]" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/data-management/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-management/templates"] });
      toast({ title: "Template Deleted" });
    },
  });

  const handleCreate = () => {
    let parsedFields: any;
    try {
      parsedFields = JSON.parse(form.fields);
    } catch {
      toast({ title: "Invalid JSON", description: "Fields must be valid JSON", variant: "destructive" });
      return;
    }
    createMutation.mutate({ ...form, fields: parsedFields });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Data Templates</h3>
        <Button onClick={() => setDialogOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Template</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.templates || []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No templates yet</TableCell></TableRow>
            ) : (
              (data?.templates || []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                  <TableCell>{t.isActive ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                  <TableCell>{formatDate(t.createdAt)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteMutation.mutate(t.id)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Template</DialogTitle>
            <DialogDescription>Create a reusable data template.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Contact Import" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="contacts">Contacts</SelectItem>
                  <SelectItem value="accounts">Accounts</SelectItem>
                  <SelectItem value="enrichment">Enrichment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Fields (JSON array)</Label>
              <Textarea value={form.fields} onChange={(e) => setForm({ ...form, fields: e.target.value })} rows={4} className="font-mono text-xs" placeholder='[{"name": "email", "type": "string", "required": true}]' />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function DataManagementPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6" />
          Data Management
        </h1>
        <p className="text-muted-foreground mt-1">Manage data uploads, quality, templates, and full account/contact insights.</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-1"><BarChart3 className="h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-1"><BarChart3 className="h-4 w-4" /> Insights</TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center gap-1"><FileText className="h-4 w-4" /> Requests</TabsTrigger>
          <TabsTrigger value="uploads" className="flex items-center gap-1"><Upload className="h-4 w-4" /> Uploads</TabsTrigger>
          <TabsTrigger value="quality" className="flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Quality</TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1"><Database className="h-4 w-4" /> Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="insights"><InsightsTab /></TabsContent>
        <TabsContent value="requests"><DataRequestsTab /></TabsContent>
        <TabsContent value="uploads"><UploadsTab /></TabsContent>
        <TabsContent value="quality"><QualityTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
