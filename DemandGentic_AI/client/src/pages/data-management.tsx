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
  Brain,
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

interface IntelligenceDepartmentRow {
  department: string;
  confidence: number;
  problemCount: number;
  solutionCount: number;
}

interface IntelligenceCampaignMapping {
  campaignId: string;
  campaignName: string | null;
  primaryDepartment: string | null;
  confidence: number;
  departments: IntelligenceDepartmentRow[];
}

interface IntelligenceResultRow {
  accountId: string;
  accountName: string | null;
  status: "success" | "partial" | "failed";
  accountIntelligence: {
    version: number;
    confidence: number | null;
    createdAt: string | null;
  } | null;
  campaignMappings: IntelligenceCampaignMapping[];
  errors: string[];
}

interface IntelligenceGatherResponse {
  message: string;
  departments: string[];
  resolved: {
    totalAccounts: number;
    explicitAccountIds: number;
    fromLists: number;
    fromCampaigns: number;
  };
  processed: {
    totalAccounts: number;
    success: number;
    partial: number;
    failed: number;
    accountIntelBuilt: number;
    problemMappingsBuilt: number;
  };
  results: IntelligenceResultRow[];
}

// ==================== STATUS HELPERS ====================

function statusBadge(status: string) {
  const map: Record = {
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
  return {entry.label};
}

function severityBadge(severity: string) {
  const map: Record = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-yellow-500 text-white",
    low: "bg-blue-400 text-white",
  };
  return {severity};
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseIdInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

// ==================== OVERVIEW TAB ====================

function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/data-management/overview"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/overview");
      return res.json();
    },
  });

  if (isLoading) return ;

  const o = data;
  const totalContacts = o?.audience?.totalContacts ?? o?.audience?.contacts?.total ?? 0;
  const totalAccounts = o?.audience?.totalAccounts ?? o?.audience?.accounts?.total ?? 0;
  return (
    
      
        
          Total Contacts
          {totalContacts.toLocaleString()}
        
        
          Total Accounts
          {totalAccounts.toLocaleString()}
        
        
          Data Requests
          
            {o?.dataRequests?.total ?? 0}
            {o?.dataRequests?.pending ?? 0} pending, {o?.dataRequests?.inProgress ?? 0} in progress
          
        
        
          Quality Issues
          
            {o?.qualityIssues?.unresolved ?? 0} open
            {(o?.qualityIssues?.critical ?? 0) > 0 && {o?.qualityIssues?.critical} critical}
          
        
      

      
        
          
             Uploads
          
          
            Total: {o?.uploads?.total ?? 0}
            Processing: {o?.uploads?.processing ?? 0}
            Completed: {o?.uploads?.completed ?? 0}
          
        
        
          
             Latest Quality Scan
          
          
            {o?.qualityScan ? (
              
                Score: {o.qualityScan.overallScore}%
                Completed {formatDate(o.qualityScan.completedAt)}
              
            ) : (
              No scans completed yet
            )}
          
        
      
    
  );
}

function formatCount(value: number | null | undefined) {
  return (value ?? 0).toLocaleString();
}

function DistributionCard({ title, items }: { title: string; items: DistributionItem[] }) {
  const rows = (items || []).slice(0, 8);
  return (
    
      
        {title}
      
      
        {rows.length === 0 ? (
          No data available
        ) : (
          rows.map((item) => (
            
              
                {item.value}
                
                  {formatCount(item.count)} ({item.percentage}%)
                
              
              
            
          ))
        )}
      
    
  );
}

function CoverageCard({ title, items }: { title: string; items: CoverageItem[] }) {
  return (
    
      
        {title}
      
      
        {(items || []).length === 0 ? (
          No coverage data available
        ) : (
          
            
              
                Field
                Coverage
                Missing
              
            
            
              {items.map((item) => (
                
                  {item.field}
                  
                    
                      
                        {item.coverage}%
                        
                          {formatCount(item.populated)}/{formatCount(item.total)}
                        
                      
                      
                    
                  
                  {formatCount(item.missing)}
                
              ))}
            
          
        )}
      
    
  );
}

// ==================== INSIGHTS TAB ====================

function InsightsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/data-management/insights/summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/insights/summary");
      return res.json();
    },
  });

  if (isLoading) return ;
  if (!data) return No insights data available.;

  const totals = data.totals;

  return (
    
      
        
          Total Accounts
          {formatCount(totals.accounts)}
        
        
          Total Contacts
          {formatCount(totals.contacts)}
        
        
          Contacts Linked To Accounts
          
            {totals.contactLinkRate}%
            
              {formatCount(totals.contactsWithAccount)} linked, {formatCount(totals.orphanContacts)} orphan
            
          
        
        
          Accounts With Contacts
          
            {totals.accountLinkRate}%
            
              {formatCount(totals.accountsWithContacts)} with contacts, {formatCount(totals.accountsWithoutContacts)} without
            
          
        
        
          Active Segments
          {formatCount(totals.activeSegments)}
        
        
          Static Lists
          {formatCount(totals.totalLists)}
        
      

      
        Segment Coverage
        
          
          
        
      

      
        Account Firmographics
        
          
          
          
          
          
        
      

      
        Contact Demographics
        
          
          
          
          
        
      

      
        Completeness And Gaps
        
          
          
        

        
          
            Highest-Priority Missing Fields
          
          
            {(data.gaps.topMissingFields || []).length === 0 ? (
              No major missing-field gaps detected.
            ) : (
              
                
                  
                    Record Type
                    Field
                    Missing Rate
                    Recommendation
                  
                
                
                  {data.gaps.topMissingFields.map((gap) => (
                    
                      {gap.recordType}
                      {gap.field}
                      {gap.missingRate}% ({formatCount(gap.missing)})
                      {gap.recommendation}
                    
                  ))}
                
              
            )}
          
        
      
    
  );
}

// ==================== INTELLIGENCE TAB ====================

function IntelligenceTab() {
  const { toast } = useToast();
  const [listIdsInput, setListIdsInput] = useState("");
  const [campaignIdsInput, setCampaignIdsInput] = useState("");
  const [accountIdsInput, setAccountIdsInput] = useState("");
  const [mappingCampaignId, setMappingCampaignId] = useState("");
  const [concurrency, setConcurrency] = useState("3");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [includeAccountIntelligence, setIncludeAccountIntelligence] = useState(true);
  const [includeProblemMapping, setIncludeProblemMapping] = useState(true);

  const gatherMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        listIds: parseIdInput(listIdsInput),
        campaignIds: parseIdInput(campaignIdsInput),
        accountIds: parseIdInput(accountIdsInput),
        mappingCampaignId: mappingCampaignId.trim() || undefined,
        concurrency: Math.max(1, Math.min(Number(concurrency) || 3, 10)),
        forceRefresh,
        includeAccountIntelligence,
        includeProblemMapping,
      };

      const res = await apiRequest("POST", "/api/data-management/intelligence/gather", payload);
      return res.json();
    },
    onError: (error: any) => {
      toast({
        title: "Intelligence Gather Failed",
        description: error?.message || "Failed to run intelligence gathering",
        variant: "destructive",
      });
    },
  });

  const hasSelectors =
    parseIdInput(listIdsInput).length > 0 ||
    parseIdInput(campaignIdsInput).length > 0 ||
    parseIdInput(accountIdsInput).length > 0;

  const data = gatherMutation.data;

  return (
    
      
        
          Account Intelligence Gathering
        
        
          
            Run account intelligence from Data Management using specific list IDs and/or campaign IDs, then align problem-solution mapping to 7 departments.
          

          
            
              List IDs (comma-separated)
               setListIdsInput(e.target.value)}
                rows={2}
                placeholder="e.g. 5f8a..., a7b9..."
              />
            
            
              Campaign IDs (comma-separated)
               setCampaignIdsInput(e.target.value)}
                rows={2}
                placeholder="e.g. 2ab1..., 9df0..."
              />
            
            
              Explicit Account IDs (optional)
               setAccountIdsInput(e.target.value)}
                rows={2}
                placeholder="e.g. 8cc3..., 44de..."
              />
            
            
              Mapping Campaign ID (optional)
               setMappingCampaignId(e.target.value)}
                placeholder="Campaign context for list-driven mappings"
              />
            
          

          
             setIncludeAccountIntelligence((prev) => !prev)}
            >
              Account Intelligence
            
             setIncludeProblemMapping((prev) => !prev)}
            >
              Problem/Solution Mapping
            
             setForceRefresh((prev) => !prev)}
            >
              Force Refresh
            
            
              Concurrency
               setConcurrency(e.target.value)}
              />
            
          

          
             gatherMutation.mutate()}
              disabled={!hasSelectors || gatherMutation.isPending}
            >
              {gatherMutation.isPending && }
              Run Intelligence Gathering
            
          
        
      

      {data && (
        <>
          
            
              Resolved Accounts
              {data.processed.totalAccounts.toLocaleString()}
            
            
              Success
              {data.processed.success.toLocaleString()}
            
            
              Partial
              {data.processed.partial.toLocaleString()}
            
            
              Failed
              {data.processed.failed.toLocaleString()}
            
          

          
            
              Execution Summary
            
            
              {data.message}
              
                Built account intelligence for {data.processed.accountIntelBuilt} accounts and
                generated  {data.processed.problemMappingsBuilt} campaign-level mappings across departments:
                 {data.departments.join(", ")}.
              
            
          

          
            
              Account Results
            
            
              
                
                  
                    Account
                    Status
                    Intel Version
                    Campaign Mapping
                    Primary Dept
                    Errors
                  
                
                
                  {data.results.length === 0 ? (
                    
                      No account-level results returned
                    
                  ) : (
                    data.results.slice(0, 100).map((row) => {
                      const firstMapping = row.campaignMappings[0];
                      const activeDepartments = (firstMapping?.departments || []).filter((d) => d.problemCount > 0 || d.solutionCount > 0);
                      return (
                        
                          
                            {row.accountName || row.accountId}
                          
                          
                            
                              {row.status}
                            
                          
                          {row.accountIntelligence?.version ?? "-"}
                          {row.campaignMappings.length}
                          
                            {firstMapping?.primaryDepartment || "-"}
                            {activeDepartments.length > 0 && (
                              
                                {activeDepartments.slice(0, 2).map((d) => `${d.department} (${d.problemCount}/${d.solutionCount})`).join(", ")}
                              
                            )}
                          
                          
                            {row.errors.length > 0
                              ? row.errors.slice(0, 2).join(" | ")
                              : "-"}
                          
                        
                      );
                    })
                  )}
                
              
              {data.results.length > 100 && (
                
                  Showing first 100 results out of {data.results.length.toLocaleString()}.
                
              )}
            
          
        
      )}
    
  );
}

// ==================== DATA REQUESTS TAB ====================

function DataRequestsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dataType: "contacts", volumeRequested: "", priority: "medium" });

  const { data, isLoading } = useQuery({
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
    
      
        Data Requests
         setDialogOpen(true)} size="sm"> New Request
      

      {isLoading ? (
        
      ) : (
        
          
            
              Title
              Type
              Status
              Priority
              Volume
              Created
            
          
          
            {(data?.requests || []).length === 0 ? (
              No data requests yet
            ) : (
              (data?.requests || []).map((r) => (
                
                  {r.title}
                  {r.dataType}
                  {statusBadge(r.status)}
                  {r.priority}
                  {r.volumeRequested?.toLocaleString() ?? "-"}
                  {formatDate(r.createdAt)}
                
              ))
            )}
          
        
      )}

      
        
          
            New Data Request
            Request new data for your campaigns.
          
          
            
              Title *
               setForm({ ...form, title: e.target.value })} placeholder="e.g. Tech VP contacts in Northeast" />
            
            
              Description
               setForm({ ...form, description: e.target.value })} rows={2} placeholder="Details about the data needed..." />
            
            
              
                Data Type
                 setForm({ ...form, dataType: v })}>
                  
                  
                    Contacts
                    Accounts
                    Mixed
                  
                
              
              
                Priority
                 setForm({ ...form, priority: v })}>
                  
                  
                    Low
                    Medium
                    High
                    Urgent
                  
                
              
            
            
              Volume Requested
               setForm({ ...form, volumeRequested: e.target.value })} placeholder="e.g. 5000" />
            
          
          
             setDialogOpen(false)}>Cancel
             createMutation.mutate({ ...form, volumeRequested: form.volumeRequested ? parseInt(form.volumeRequested) : null })} disabled={!form.title || createMutation.isPending}>
              {createMutation.isPending && }
              Create
            
          
        
      
    
  );
}

// ==================== UPLOADS TAB ====================

function UploadsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/data-management/uploads"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/uploads");
      return res.json();
    },
  });

  const handleUpload = async (e: React.ChangeEvent) => {
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
    
      
        Data Uploads
        
          
            {uploading ?  : }
            Upload File
            
          
        
      

      {isLoading ? (
        
      ) : (
        
          
            
              Filename
              Type
              Status
              Rows
              Valid
              Invalid
              Created
            
          
          
            {(data?.uploads || []).length === 0 ? (
              No uploads yet
            ) : (
              (data?.uploads || []).map((u) => (
                
                  {u.filename}
                  {u.fileType}
                  {statusBadge(u.status)}
                  {u.totalRows?.toLocaleString() ?? "-"}
                  {u.validRows?.toLocaleString() ?? "-"}
                  {u.invalidRows?.toLocaleString() ?? "-"}
                  {formatDate(u.createdAt)}
                
              ))
            )}
          
        
      )}
    
  );
}

// ==================== QUALITY TAB ====================

function QualityTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: scans, isLoading: scansLoading } = useQuery({
    queryKey: ["/api/data-management/quality/scans"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/data-management/quality/scans");
      return res.json();
    },
  });

  const { data: issues, isLoading: issuesLoading } = useQuery({
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
    
      
        Data Quality
         scanMutation.mutate()} disabled={scanMutation.isPending} size="sm">
          {scanMutation.isPending ?  : }
          Run Scan
        
      

      {/* Scan History */}
      
        Scan History
        
          {scansLoading ? (
            
          ) : (scans?.scans || []).length === 0 ? (
            No scans yet. Run your first quality scan.
          ) : (
            
              {(scans?.scans || []).slice(0, 5).map((s) => (
                
                  
                    {statusBadge(s.status)}
                    Score: {s.overallScore ?? "-"}%
                  
                  
                    {s.totalIssuesFound ?? 0} issues
                    {formatDate(s.completedAt || s.createdAt)}
                  
                
              ))}
            
          )}
        
      

      {/* Quality Issues */}
      
        Open Issues
        {issuesLoading ? (
          
        ) : (
          
            
              
                Field
                Severity
                Category
                Affected
                Status
                Action
              
            
            
              {(issues?.issues || []).length === 0 ? (
                No quality issues found
              ) : (
                (issues?.issues || []).map((i) => (
                  
                    {i.field}
                    {severityBadge(i.severity)}
                    {i.category}
                    {i.affectedCount.toLocaleString()}
                    {statusBadge(i.status)}
                    
                      {i.status === "open" && (
                         resolveMutation.mutate(i.id)} disabled={resolveMutation.isPending}>
                          
                        
                      )}
                    
                  
                ))
              )}
            
          
        )}
      
    
  );
}

// ==================== TEMPLATES TAB ====================

function TemplatesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "general", fields: "[]" });

  const { data, isLoading } = useQuery({
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
    
      
        Data Templates
         setDialogOpen(true)} size="sm"> New Template
      

      {isLoading ? (
        
      ) : (
        
          
            
              Name
              Category
              Active
              Created
              Actions
            
          
          
            {(data?.templates || []).length === 0 ? (
              No templates yet
            ) : (
              (data?.templates || []).map((t) => (
                
                  {t.name}
                  {t.category}
                  {t.isActive ?  : }
                  {formatDate(t.createdAt)}
                  
                     deleteMutation.mutate(t.id)}>Delete
                  
                
              ))
            )}
          
        
      )}

      
        
          
            New Template
            Create a reusable data template.
          
          
            
              Name *
               setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Contact Import" />
            
            
              Description
               setForm({ ...form, description: e.target.value })} rows={2} />
            
            
              Category
               setForm({ ...form, category: v })}>
                
                
                  General
                  Contacts
                  Accounts
                  Enrichment
                
              
            
            
              Fields (JSON array)
               setForm({ ...form, fields: e.target.value })} rows={4} className="font-mono text-xs" placeholder='[{"name": "email", "type": "string", "required": true}]' />
            
          
          
             setDialogOpen(false)}>Cancel
            
              {createMutation.isPending && }
              Create
            
          
        
      
    
  );
}

// ==================== MAIN PAGE ====================

export default function DataManagementPage() {
  return (
    
      
        
          
          Data Management
        
        Manage data uploads, quality, templates, and full account/contact insights.
      

      
        
           Overview
           Insights
           Intelligence
           Requests
           Uploads
           Quality
           Templates
        

        
        
        
        
        
        
        
      
    
  );
}