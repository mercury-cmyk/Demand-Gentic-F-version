/**
 * Journey Pipeline Tab — Main tab component for the client dashboard.
 * Manages pipeline selection, views (Board / List / Analytics), and first-time setup.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  LayoutGrid,
  List,
  BarChart3,
  GitBranch,
  Users,
  Clock,
  AlertTriangle,
  RefreshCw,
  Download,
  Loader2,
} from "lucide-react";
import { PipelineBoard } from "./pipeline-board";
import { LeadDetailPanel } from "./lead-detail-panel";
import { CreatePipelineDialog } from "./create-pipeline-dialog";

interface JourneyPipelineTabProps {
  authHeaders: { headers: { Authorization: string } };
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  status: string;
  stages: PipelineStage[];
  leadCount: number;
  campaignId: string | null;
  autoEnrollDispositions: string[] | null;
  createdAt: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color?: string;
  defaultActionType?: string;
}

export interface JourneyLead {
  id: string;
  pipelineId: string;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  companyName: string | null;
  jobTitle: string | null;
  sourceCallSessionId: string | null;
  sourceCampaignId: string | null;
  sourceDisposition: string | null;
  sourceCallSummary: string | null;
  sourceAiAnalysis: any;
  currentStageId: string;
  currentStageEnteredAt: string;
  status: string;
  priority: number;
  nextActionType: string | null;
  nextActionAt: string | null;
  lastActivityAt: string | null;
  totalActions: number;
  notes: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyAction {
  id: string;
  journeyLeadId: string;
  pipelineId: string;
  actionType: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  title: string | null;
  description: string | null;
  aiGeneratedContext: any;
  previousActivitySummary: string | null;
  outcome: string | null;
  outcomeDetails: any;
  resultDisposition: string | null;
  triggeredNextAction: boolean | null;
  createdAt: string;
}

interface PipelineAnalytics {
  stageDistribution: { stageId: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  actionStats: { actionType: string; status: string; count: number }[];
  overdueActions: number;
  totalLeads: number;
}

export function JourneyPipelineTab({ authHeaders }: JourneyPipelineTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [view, setView] = useState<"board" | "list" | "analytics">("board");
  const [isExporting, setIsExporting] = useState(false);

  // ─── Fetch pipelines ───
  const { data: pipelinesData, isLoading: loadingPipelines } = useQuery<{ pipelines: Pipeline[] }>({
    queryKey: ["journey-pipelines"],
    queryFn: async () => {
      const res = await fetch("/api/client-portal/journey-pipeline/pipelines", authHeaders);
      if (!res.ok) throw new Error("Failed to fetch pipelines");
      return res.json();
    },
  });

  const pipelines = pipelinesData?.pipelines || [];
  const activePipeline = pipelines.find((p) => p.id === selectedPipelineId) || pipelines[0];

  // Auto-select first pipeline
  if (!selectedPipelineId && pipelines.length > 0 && pipelines[0]?.id) {
    setSelectedPipelineId(pipelines[0].id);
  }

  // ─── Fetch leads for active pipeline ───
  const { data: leadsData, isLoading: loadingLeads, refetch: refetchLeads } = useQuery<{
    leads: JourneyLead[];
    total: number;
  }>({
    queryKey: ["journey-pipeline-leads", activePipeline?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/pipelines/${activePipeline!.id}/leads?pageSize=100&status=all`,
        authHeaders
      );
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
    enabled: !!activePipeline,
  });

  // ─── Fetch analytics for active pipeline ───
  const { data: analyticsData } = useQuery<{ analytics: PipelineAnalytics }>({
    queryKey: ["journey-pipeline-analytics", activePipeline?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/pipelines/${activePipeline!.id}/analytics`,
        authHeaders
      );
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: !!activePipeline && view === "analytics",
  });

  const leads = leadsData?.leads || [];
  const analytics = analyticsData?.analytics;

  const handleExport = async () => {
    if (!activePipeline?.id) return;

    setIsExporting(true);
    try {
      const res = await fetch(
        `/api/client-portal/journey-pipeline/pipelines/${activePipeline.id}/export`,
        authHeaders
      );

      if (!res.ok) {
        throw new Error("Failed to export pipeline");
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("content-disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] ||
        `lead-pipeline-${new Date().toISOString().split("T")[0]}.csv`;

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(link);

      toast({
        title: "Pipeline export ready",
        description: `Downloaded ${filename}`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export pipeline",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // ─── Loading state ───
  if (loadingPipelines) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // ─── Empty state — no pipelines yet ───
  if (pipelines.length === 0) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <GitBranch className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="mb-2">Lead Journey Pipeline</CardTitle>
            <CardDescription className="max-w-md mb-6">
              Manage leads that need follow-up from your campaigns. Schedule callbacks,
              send emails, and track every interaction with AI-powered context.
            </CardDescription>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Pipeline
            </Button>
          </CardContent>
        </Card>
        <CreatePipelineDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          authHeaders={authHeaders}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["journey-pipelines"] });
            setShowCreateDialog(false);
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900">
                <GitBranch className="h-6 w-6 text-indigo-600" />
                <h2 className="text-2xl font-semibold tracking-tight">Lead Pipeline</h2>
              </div>
              <p className="max-w-3xl text-sm text-slate-700/85 md:text-base">
                Track lead activity in one place, open call details instantly, and export clean reports for your team.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="bg-white/80 px-3 py-1">
                Unified tracking
              </Badge>
              <Badge variant="outline" className="bg-white/80 px-3 py-1">
                Instant detail view
              </Badge>
              <Badge variant="outline" className="bg-white/80 px-3 py-1">
                CSV export
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select
            value={selectedPipelineId || activePipeline?.id}
            onValueChange={setSelectedPipelineId}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {activePipeline?.leadCount || 0} leads
          </Badge>
          {analytics?.overdueActions ? (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {analytics.overdueActions} overdue
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchLeads()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!activePipeline || isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>

          {/* View Toggles */}
          <div className="flex border rounded-md">
            <Button
              variant={view === "board" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => setView("board")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none border-x"
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "analytics" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => setView("analytics")}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
          </div>

          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Pipeline
          </Button>
        </div>
      </div>

      {/* ─── Board View ─── */}
      {view === "board" && activePipeline && (
        <PipelineBoard
          pipeline={activePipeline}
          leads={leads}
          loading={loadingLeads}
          onSelectLead={setSelectedLeadId}
          authHeaders={authHeaders}
          onRefresh={() => refetchLeads()}
        />
      )}

      {/* ─── List View ─── */}
      {view === "list" && activePipeline && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              Click any row to open full lead and call context.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Lead</th>
                    <th className="text-left p-3 font-medium">Company</th>
                    <th className="text-left p-3 font-medium">Stage</th>
                    <th className="text-left p-3 font-medium">Priority</th>
                    <th className="text-left p-3 font-medium">Next Action</th>
                    <th className="text-left p-3 font-medium">Last Activity</th>
                    <th className="text-left p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const stage = (activePipeline.stages as PipelineStage[])?.find(
                      (s) => s.id === lead.currentStageId
                    );
                    const isOverdue =
                      lead.nextActionAt && new Date(lead.nextActionAt) < new Date();
                    return (
                      <tr
                        key={lead.id}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <td className="p-3">
                          <div className="font-medium">{lead.contactName || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{lead.jobTitle}</div>
                        </td>
                        <td className="p-3 text-muted-foreground">{lead.companyName || "—"}</td>
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            style={{
                              borderColor: stage?.color || "#6b7280",
                              color: stage?.color || "#6b7280",
                            }}
                          >
                            {stage?.name || lead.currentStageId}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <PriorityBadge priority={lead.priority} />
                        </td>
                        <td className="p-3">
                          {lead.nextActionAt ? (
                            <span className={isOverdue ? "text-destructive font-medium" : ""}>
                              <Clock className="h-3 w-3 inline mr-1" />
                              {new Date(lead.nextActionAt).toLocaleDateString()}
                              {isOverdue && " (overdue)"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {lead.lastActivityAt
                            ? new Date(lead.lastActivityAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="p-3">
                          <Badge variant={lead.status === "active" ? "default" : "secondary"}>
                            {lead.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {leads.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No leads in this pipeline yet. Enroll leads from your campaigns to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Analytics View ─── */}
      {view === "analytics" && analytics && activePipeline && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalLeads}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.statusBreakdown.find((s) => s.status === "active")?.count || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {analytics.statusBreakdown.find((s) => s.status === "completed")?.count || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Overdue Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${analytics.overdueActions > 0 ? "text-destructive" : ""}`}>
                {analytics.overdueActions}
              </div>
            </CardContent>
          </Card>

          {/* Stage distribution */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Stage Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {((activePipeline.stages as PipelineStage[]) || []).map((stage) => {
                  const stageCount =
                    analytics.stageDistribution.find((s) => s.stageId === stage.id)?.count || 0;
                  const percentage =
                    analytics.totalLeads > 0
                      ? Math.round((stageCount / analytics.totalLeads) * 100)
                      : 0;
                  return (
                    <div key={stage.id} className="flex items-center gap-3">
                      <div className="w-32 text-sm truncate">{stage.name}</div>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: stage.color || "#6b7280",
                          }}
                        />
                      </div>
                      <div className="w-12 text-right text-sm text-muted-foreground">
                        {stageCount}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Action breakdown */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Actions Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {["callback", "email", "sms", "note"].map((type) => {
                  const completed =
                    analytics.actionStats.find(
                      (a) => a.actionType === type && a.status === "completed"
                    )?.count || 0;
                  const scheduled =
                    analytics.actionStats.find(
                      (a) => a.actionType === type && a.status === "scheduled"
                    )?.count || 0;
                  return (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <span className="capitalize font-medium">{type}s</span>
                      <div className="flex gap-3">
                        <Badge variant="outline">{scheduled} scheduled</Badge>
                        <Badge variant="secondary">{completed} completed</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Lead Detail Slide-out ─── */}
      {selectedLeadId && activePipeline && (
        <LeadDetailPanel
          leadId={selectedLeadId}
          pipeline={activePipeline}
          authHeaders={authHeaders}
          onClose={() => setSelectedLeadId(null)}
          onRefresh={() => refetchLeads()}
        />
      )}

      {/* ─── Create Pipeline Dialog ─── */}
      <CreatePipelineDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        authHeaders={authHeaders}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["journey-pipelines"] });
          setShowCreateDialog(false);
        }}
      />
    </div>
  );
}

// ─── Priority Badge helper ───

export function PriorityBadge({ priority }: { priority: number }) {
  const config: Record<number, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
    5: { label: "Critical", variant: "destructive" },
    4: { label: "High", variant: "default" },
    3: { label: "Medium", variant: "secondary" },
    2: { label: "Low", variant: "outline" },
    1: { label: "Minimal", variant: "outline" },
  };
  const { label, variant } = config[priority] || config[3];
  return <Badge variant={variant}>{label}</Badge>;
}
