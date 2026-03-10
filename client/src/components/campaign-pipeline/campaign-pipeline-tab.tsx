/**
 * Campaign Pipeline Tab — Unified view of campaign ↔ pipeline operations.
 * Dashboard, backfill, overdue actions, and per-campaign analytics.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Workflow,
  Users,
  AlertTriangle,
  Clock,
  Phone,
  Mail,
  RefreshCw,
  Play,
  Eye,
  Loader2,
  CheckCircle,
  Database,
  BarChart3,
  Megaphone,
  GitBranch,
  ArrowRight,
  MessageSquare,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CampaignPipelineTabProps {
  authHeaders: { headers: { Authorization: string } };
  clientAccountId: string;
}

interface DashboardData {
  pipelines: Array<{
    id: string;
    name: string;
    leadCount: number;
    status: string;
    campaignId: string | null;
  }>;
  connectedCampaigns: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }>;
  summary: {
    totalLeads: number;
    activeLeads: number;
    overdueActions: number;
    stageDistribution: Array<{
      stageId: string;
      stageName: string;
      count: number;
    }>;
    recentActivity: Array<{
      type: string;
      status: string;
      leadName: string;
      description: string;
      occurredAt: string;
    }>;
  };
}

interface OverdueAction {
  actionId: string;
  actionType: string;
  title: string;
  description: string | null;
  scheduledAt: string;
  aiContext: any;
  lead: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    stage: string;
    priority: number;
    sourceDisposition: string | null;
  };
  pipeline: {
    id: string;
    name: string;
  };
}

interface BackfillResult {
  message: string;
  client: { id: string; name: string };
  stats: {
    campaignsFound: number;
    pipelineCreated: boolean;
    pipelineId: string | null;
    eligibleDispositions: number;
    uniqueContacts: number;
    leadsCreated: number;
    leadsSkipped: number;
    actionsCreated: number;
  };
}

interface CampaignAnalytics {
  campaign: { id: string; name: string; status: string; type: string };
  engagementFunnel: {
    totalContacts: number;
    called: number;
    answered: number;
    emailsSent: number;
    emailsOpened: number;
    emailsClicked: number;
    enrolledInPipeline: number;
    engaged: number;
    appointmentsSet: number;
    closed: number;
  };
  pipelineStats: {
    totalLeads: number;
    stageDistribution: Array<{ stageId: string; stageName: string; count: number }>;
    overdueActions: number;
    completedActions: number;
    pendingActions: number;
  };
}

const STAGE_COLORS = [
  "#3b82f6", "#06b6d4", "#f59e0b", "#8b5cf6", "#10b981", "#6b7280",
  "#ec4899", "#f97316", "#14b8a6", "#a855f7",
];

const ACTION_ICONS: Record<string, React.ReactNode> = {
  callback: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  sms: <MessageSquare className="h-3.5 w-3.5" />,
  note: <FileText className="h-3.5 w-3.5" />,
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CampaignPipelineTab({ authHeaders, clientAccountId }: CampaignPipelineTabProps) {
  const { toast } = useToast();
  const [view, setView] = useState<"dashboard" | "overdue" | "campaign-detail">("dashboard");
  const [showBackfillDialog, setShowBackfillDialog] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // ─── Dashboard data ───
  const { data: dashboard, isLoading: loadingDashboard, refetch: refetchDashboard } = useQuery<DashboardData>({
    queryKey: ["campaign-pipeline-dashboard", clientAccountId],
    queryFn: async () => {
      const res = await fetch(
        `/api/campaign-pipeline/dashboard?clientAccountId=${clientAccountId}`,
        authHeaders
      );
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
  });

  // ─── Overdue actions ───
  const { data: overdueData, isLoading: loadingOverdue, refetch: refetchOverdue } = useQuery<{
    overdueActions: OverdueAction[];
  }>({
    queryKey: ["campaign-pipeline-overdue", clientAccountId],
    queryFn: async () => {
      const res = await fetch(
        `/api/campaign-pipeline/overdue-actions?clientAccountId=${clientAccountId}`,
        authHeaders
      );
      if (!res.ok) throw new Error("Failed to fetch overdue actions");
      return res.json();
    },
    enabled: view === "overdue" || (dashboard?.summary?.overdueActions ?? 0) > 0,
  });

  // ─── Campaign analytics ───
  const { data: campaignAnalytics, isLoading: loadingCampaignAnalytics } = useQuery<CampaignAnalytics>({
    queryKey: ["campaign-pipeline-analytics", selectedCampaignId],
    queryFn: async () => {
      const res = await fetch(
        `/api/campaign-pipeline/${selectedCampaignId}/analytics`,
        authHeaders
      );
      if (!res.ok) throw new Error("Failed to fetch campaign analytics");
      return res.json();
    },
    enabled: !!selectedCampaignId && view === "campaign-detail",
  });

  // ─── Backfill mutations ───
  const dryRunMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaign-pipeline/backfill", {
        method: "POST",
        headers: { ...authHeaders.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ clientAccountId, dryRun: true }),
      });
      if (!res.ok) throw new Error("Dry run failed");
      return res.json() as Promise<BackfillResult>;
    },
    onSuccess: (data) => setBackfillResult(data),
    onError: (err: any) => toast({ title: "Dry run failed", description: err.message, variant: "destructive" }),
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/campaign-pipeline/backfill", {
        method: "POST",
        headers: { ...authHeaders.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ clientAccountId, dryRun: false }),
      });
      if (!res.ok) throw new Error("Backfill failed");
      return res.json() as Promise<BackfillResult>;
    },
    onSuccess: (data) => {
      setBackfillResult(data);
      toast({ title: "Backfill complete", description: `${data.stats.leadsCreated} leads created, ${data.stats.actionsCreated} actions scheduled.` });
      queryClient.invalidateQueries({ queryKey: ["campaign-pipeline-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["journey-pipelines"] });
    },
    onError: (err: any) => toast({ title: "Backfill failed", description: err.message, variant: "destructive" }),
  });

  // ─── Loading state ───
  if (loadingDashboard) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const summary = dashboard?.summary;
  const pipelines = dashboard?.pipelines || [];
  const connectedCampaigns = dashboard?.connectedCampaigns || [];

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            Campaign Pipeline
          </h2>
          <p className="text-sm text-muted-foreground">
            Unified view of campaign engagement and pipeline progression
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refetchDashboard();
              if (view === "overdue") refetchOverdue();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <div className="flex border rounded-md">
            <Button
              variant={view === "dashboard" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none gap-1.5"
              onClick={() => setView("dashboard")}
            >
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </Button>
            <Button
              variant={view === "overdue" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none border-x gap-1.5"
              onClick={() => setView("overdue")}
            >
              <AlertTriangle className="h-4 w-4" />
              Overdue
              {(summary?.overdueActions ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                  {summary!.overdueActions}
                </Badge>
              )}
            </Button>
            <Button
              variant={view === "campaign-detail" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none gap-1.5"
              onClick={() => setView("campaign-detail")}
            >
              <Megaphone className="h-4 w-4" />
              By Campaign
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setBackfillResult(null);
              setShowBackfillDialog(true);
            }}
          >
            <Database className="h-4 w-4" />
            Backfill
          </Button>
        </div>
      </div>

      {/* ─── Dashboard View ─── */}
      {view === "dashboard" && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Leads</p>
                    <p className="text-3xl font-bold">{summary?.totalLeads ?? 0}</p>
                  </div>
                  <div className="rounded-full bg-blue-100 p-3">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {summary?.activeLeads ?? 0} active across {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overdue Actions</p>
                    <p className="text-3xl font-bold text-destructive">
                      {summary?.overdueActions ?? 0}
                    </p>
                  </div>
                  <div className="rounded-full bg-red-100 p-3">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Actions past their scheduled time
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Connected Campaigns</p>
                    <p className="text-3xl font-bold">{connectedCampaigns.length}</p>
                  </div>
                  <div className="rounded-full bg-purple-100 p-3">
                    <Megaphone className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Feeding leads into pipeline
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pipelines</p>
                    <p className="text-3xl font-bold">{pipelines.length}</p>
                  </div>
                  <div className="rounded-full bg-green-100 p-3">
                    <GitBranch className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Active lead management pipelines
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Stage Distribution Chart */}
          {(summary?.stageDistribution?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stage Distribution</CardTitle>
                <CardDescription>Leads across pipeline stages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary!.stageDistribution} layout="vertical">
                      <XAxis type="number" />
                      <YAxis
                        dataKey="stageName"
                        type="category"
                        width={140}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {summary!.stageDistribution.map((_, idx) => (
                          <Cell key={idx} fill={STAGE_COLORS[idx % STAGE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Connected Campaigns */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Connected Campaigns</CardTitle>
                <CardDescription>Campaigns feeding leads into pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                {connectedCampaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No campaigns connected yet. Run a backfill or wait for campaign dispositions.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {connectedCampaigns.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedCampaignId(c.id);
                          setView("campaign-detail");
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Megaphone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{c.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={c.status === "active" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {c.status}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
                <CardDescription>Latest pipeline actions and events</CardDescription>
              </CardHeader>
              <CardContent>
                {(summary?.recentActivity?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No activity yet.
                  </p>
                ) : (
                  <ScrollArea className="h-[280px]">
                    <div className="space-y-3">
                      {summary!.recentActivity.map((a, i) => (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <div className="mt-0.5">
                            {ACTION_ICONS[a.type] || <Clock className="h-3.5 w-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{a.leadName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {a.description}
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(a.occurredAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ─── Overdue Actions View ─── */}
      {view === "overdue" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Overdue Actions
            </CardTitle>
            <CardDescription>
              Actions past their scheduled time that need attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOverdue ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : (overdueData?.overdueActions?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
                <p className="font-medium">All caught up!</p>
                <p className="text-sm text-muted-foreground">No overdue actions right now.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Overdue Since</TableHead>
                    <TableHead>Pipeline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueData!.overdueActions.map((a) => (
                    <TableRow key={a.actionId}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {ACTION_ICONS[a.actionType] || <Clock className="h-3.5 w-3.5" />}
                          <span className="text-xs capitalize">{a.actionType}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{a.lead.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{a.lead.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{a.lead.company || "—"}</TableCell>
                      <TableCell>
                        <p className="text-sm">{a.title || "Follow-up"}</p>
                        {a.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {a.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs">
                          {formatRelativeTime(a.scheduledAt)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.pipeline.name}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Campaign Detail View ─── */}
      {view === "campaign-detail" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select
              value={selectedCampaignId || ""}
              onValueChange={(v) => setSelectedCampaignId(v)}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select a campaign" />
              </SelectTrigger>
              <SelectContent>
                {connectedCampaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedCampaignId ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Megaphone className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select a campaign above to see its engagement funnel and pipeline analytics.
                </p>
              </CardContent>
            </Card>
          ) : loadingCampaignAnalytics ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-[200px]" />
            </div>
          ) : campaignAnalytics ? (
            <>
              {/* Engagement Funnel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Engagement Funnel</CardTitle>
                  <CardDescription>
                    {campaignAnalytics.campaign.name} — end-to-end conversion
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EngagementFunnel funnel={campaignAnalytics.engagementFunnel} />
                </CardContent>
              </Card>

              {/* Pipeline Stats */}
              {campaignAnalytics.pipelineStats && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">Pipeline Leads</p>
                      <p className="text-2xl font-bold">{campaignAnalytics.pipelineStats.totalLeads}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">Completed Actions</p>
                      <p className="text-2xl font-bold text-green-600">
                        {campaignAnalytics.pipelineStats.completedActions}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">Pending Actions</p>
                      <p className="text-2xl font-bold text-amber-600">
                        {campaignAnalytics.pipelineStats.pendingActions}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ─── Backfill Dialog ─── */}
      <Dialog open={showBackfillDialog} onOpenChange={setShowBackfillDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Pipeline Backfill
            </DialogTitle>
            <DialogDescription>
              Scan historical campaign data and enroll eligible contacts into the pipeline.
              This creates leads from past call dispositions (voicemail, callback requested, etc.)
              and schedules follow-up actions.
            </DialogDescription>
          </DialogHeader>

          {!backfillResult ? (
            <div className="space-y-4 py-2">
              <p className="text-sm">
                Click <strong>Preview</strong> to see what would be created without making changes,
                or <strong>Run Backfill</strong> to execute immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                <p className="font-medium">{backfillResult.message}</p>
                <Separator />
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                  <span className="text-muted-foreground">Campaigns found:</span>
                  <span className="font-medium">{backfillResult.stats.campaignsFound}</span>
                  <span className="text-muted-foreground">Eligible dispositions:</span>
                  <span className="font-medium">{backfillResult.stats.eligibleDispositions}</span>
                  <span className="text-muted-foreground">Unique contacts:</span>
                  <span className="font-medium">{backfillResult.stats.uniqueContacts}</span>
                  <span className="text-muted-foreground">Leads created:</span>
                  <span className="font-medium text-green-600">{backfillResult.stats.leadsCreated}</span>
                  <span className="text-muted-foreground">Leads skipped (dup):</span>
                  <span className="font-medium">{backfillResult.stats.leadsSkipped}</span>
                  <span className="text-muted-foreground">Actions created:</span>
                  <span className="font-medium text-blue-600">{backfillResult.stats.actionsCreated}</span>
                  {backfillResult.stats.pipelineCreated && (
                    <>
                      <span className="text-muted-foreground">Pipeline created:</span>
                      <span className="font-medium">Yes (new)</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {!backfillResult ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => dryRunMutation.mutate()}
                  disabled={dryRunMutation.isPending || backfillMutation.isPending}
                >
                  {dryRunMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  Preview
                </Button>
                <Button
                  onClick={() => backfillMutation.mutate()}
                  disabled={dryRunMutation.isPending || backfillMutation.isPending}
                >
                  {backfillMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Run Backfill
                </Button>
              </>
            ) : backfillResult.message.includes("Dry run") ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setBackfillResult(null)}
                >
                  Back
                </Button>
                <Button
                  onClick={() => {
                    setBackfillResult(null);
                    backfillMutation.mutate();
                  }}
                  disabled={backfillMutation.isPending}
                >
                  {backfillMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Confirm & Run
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowBackfillDialog(false)}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Engagement funnel visualization */
function EngagementFunnel({ funnel }: { funnel: CampaignAnalytics["engagementFunnel"] }) {
  const steps = [
    { label: "Total Contacts", value: funnel.totalContacts, color: "#6b7280" },
    { label: "Called", value: funnel.called, color: "#3b82f6" },
    { label: "Answered", value: funnel.answered, color: "#06b6d4" },
    { label: "Emails Sent", value: funnel.emailsSent, color: "#8b5cf6" },
    { label: "Emails Opened", value: funnel.emailsOpened, color: "#a855f7" },
    { label: "Emails Clicked", value: funnel.emailsClicked, color: "#ec4899" },
    { label: "In Pipeline", value: funnel.enrolledInPipeline, color: "#f59e0b" },
    { label: "Engaged", value: funnel.engaged, color: "#10b981" },
    { label: "Appointments", value: funnel.appointmentsSet, color: "#14b8a6" },
    { label: "Closed Won", value: funnel.closed, color: "#22c55e" },
  ].filter((s) => s.value > 0 || s.label === "Total Contacts");

  const maxVal = Math.max(funnel.totalContacts, 1);

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const pct = Math.max((step.value / maxVal) * 100, 4);
        return (
          <div key={step.label} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-28 text-right shrink-0">
              {step.label}
            </span>
            <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden relative">
              <div
                className="h-full rounded-md transition-all flex items-center px-2"
                style={{ width: `${pct}%`, backgroundColor: step.color }}
              >
                <span className="text-xs font-medium text-white drop-shadow">
                  {step.value}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
