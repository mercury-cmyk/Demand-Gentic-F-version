/**
 * Unified Agent Intelligence Dashboard
 * 
 * One Agent Per Type. Fully Self-Contained. Learning-Integrated.
 * 
 * This page provides a comprehensive view of the unified agent architecture:
 * - System overview with all agent types
 * - Agent detail view with prompt section editor
 * - Capability-to-prompt mapping visualization
 * - Learning pipeline status and controls
 * - Recommendation management (apply/reject)
 * - Version history and rollback
 * - Configuration editor
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Bot,
  Brain,
  Mail,
  Phone,
  Shield,
  Database,
  Search,
  FileText,
  GitBranch,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Loader2,
  RotateCcw,
  Zap,
  Target,
  Lightbulb,
  RefreshCw,
  Settings,
  BarChart3,
  GitCompare,
  History,
  PenLine,
  Plus,
  Edit2,
  Trash2,
  Filter,
  Users,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, apiRequest } from "@/lib/queryClient";

// ==================== API FUNCTIONS ====================

const API_BASE = "/api/unified-agents";

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: getAuthHeaders(url), credentials: "include" });
  if (!res.ok) {
    const errorText = await res.text();
    // Try to parse as JSON for better error messages
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(errorJson.message || errorJson.error || `HTTP ${res.status}: ${errorText}`);
    } catch {
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
  }
  return res.json();
}

async function postJson(url: string, body?: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...getAuthHeaders(url), "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errorText = await res.text();
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(errorJson.message || errorJson.error || `HTTP ${res.status}: ${errorText}`);
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) throw new Error(`HTTP ${res.status}: ${errorText}`);
      throw parseErr;
    }
  }
  return res.json();
}

async function putJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...getAuthHeaders(url), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function patchJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...getAuthHeaders(url), "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ==================== ICON MAP ====================

const agentIcons: Record<string, React.ReactNode> = {
  voice: <Phone className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  strategy: <Brain className="h-5 w-5" />,
  compliance: <Shield className="h-5 w-5" />,
  data: <Database className="h-5 w-5" />,
  research: <Search className="h-5 w-5" />,
  content: <FileText className="h-5 w-5" />,
  pipeline: <GitBranch className="h-5 w-5" />,
};

const statusColors: Record<string, string> = {
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  inactive: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  maintenance: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  deprecated: "bg-red-500/15 text-red-400 border-red-500/30",
};

const trendIcons: Record<string, React.ReactNode> = {
  improving: <TrendingUp className="h-3.5 w-3.5 text-green-400" />,
  declining: <TrendingDown className="h-3.5 w-3.5 text-red-400" />,
  stable: <Minus className="h-3.5 w-3.5 text-gray-400" />,
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getAgentCardProgress(agent: any): number {
  if (typeof agent?.trackingProgress === "number") {
    return clampPercent(agent.trackingProgress);
  }

  if (typeof agent?.overallPerformanceScore === "number" && agent.overallPerformanceScore > 0) {
    return clampPercent(agent.overallPerformanceScore);
  }

  if (Array.isArray(agent?.capabilityScores) && agent.capabilityScores.length > 0) {
    const avg =
      agent.capabilityScores.reduce((sum: number, cap: any) => sum + (cap?.score || 0), 0) /
      agent.capabilityScores.length;
    return clampPercent(avg);
  }

  if ((agent?.totalPromptSections || 0) > 0) {
    return clampPercent(((agent?.activePromptSections || 0) / agent.totalPromptSections) * 100);
  }

  return 0;
}

// ==================== MAIN COMPONENT ====================

export default function UnifiedAgentArchitectureDashboard() {
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          {selectedAgentType && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedAgentType(null)}
              className="mr-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Bot className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {selectedAgentType
                ? `${selectedAgentType.charAt(0).toUpperCase() + selectedAgentType.slice(1)} Agent`
                : "AgentX — The Operator"}
            </h1>
            <p className="text-xs text-muted-foreground">
              One Agent Per Type &bull; Fully Self-Contained &bull; Learning-Integrated
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {selectedAgentType ? (
          <AgentDetailView
            agentType={selectedAgentType}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <SystemOverview onSelectAgent={(type) => { setSelectedAgentType(type); setActiveTab("overview"); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== SYSTEM OVERVIEW ====================

function SystemOverview({ onSelectAgent }: { onSelectAgent: (type: string) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: summary, isLoading, error, isError } = useQuery({
    queryKey: ["unified-agents-summary"],
    queryFn: () => fetchJson(API_BASE),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const { data: architectureMode, isLoading: architectureModeLoading } = useQuery({
    queryKey: ["voice-architecture-mode"],
    queryFn: () => fetchJson(`${API_BASE}/voice/architecture-mode`),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const setArchitectureMode = useMutation({
    mutationFn: ({ architectureMode }: { architectureMode: "legacy" | "unified" }) =>
      putJson(`${API_BASE}/voice/architecture-mode`, { architectureMode }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["voice-architecture-mode"] });
      toast({
        title: "Voice architecture updated",
        description: `Runtime mode is now ${data?.architectureMode || "updated"}.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    const isAuthError = error instanceof Error && 
      (error.message.includes('Authentication required') || error.message.includes('401'));
    
    return (
      <div className="flex items-center justify-center h-96 p-6">
        <Card className="w-full max-w-md border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {isAuthError ? "Authentication Required" : "Failed to Load Unified Agents"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isAuthError 
                ? "You need to log in to access the Unified Agent Intelligence dashboard." 
                : error instanceof Error ? error.message : "An error occurred while fetching agent data"}
            </p>
            {isAuthError && (
              <Button 
                onClick={() => window.location.href = '/login'}
                className="w-full"
              >
                Go to Login
              </Button>
            )}
            {!isAuthError && (
              <Button 
                onClick={() => window.location.reload()}
                variant="outline"
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!summary || !summary.agents) {
    return (
      <div className="flex items-center justify-center h-96 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              No Agents Found
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The unified agent architecture system is initializing. Please ensure the server is running and try again.
            </p>
            <div className="space-y-2 text-xs text-muted-foreground p-3 bg-muted rounded">
              <p><strong>Debug Info:</strong></p>
              <p>• API Endpoint: {API_BASE}</p>
              <p>• Initialized: {summary?.initialized ? "Yes" : "No"}</p>
              <p>• Total Agents: {summary?.totalAgents ?? 0}</p>
            </div>
            <Button 
              onClick={() => window.location.reload()}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{summary.totalAgents}</div>
              <p className="text-xs text-muted-foreground">Canonical Agents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-400">
                {summary.agents?.filter((a: any) => a.status === "active").length || 0}
              </div>
              <p className="text-xs text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-400">
                {summary.agents?.reduce((sum: number, a: any) => sum + (a.pendingRecommendations || 0), 0) || 0}
              </div>
              <p className="text-xs text-muted-foreground">Pending Recommendations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-400">
                {summary.agents?.reduce((sum: number, a: any) => sum + (a.totalCapabilities || 0), 0) || 0}
              </div>
              <p className="text-xs text-muted-foreground">Total Capabilities</p>
            </CardContent>
          </Card>
        </div>

        {/* Runtime architecture control */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Voice Runtime Architecture
            </CardTitle>
            <CardDescription className="text-xs">
              Toggle production voice runtime between legacy fallback and unified architecture.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Current mode:</span>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {architectureMode?.architectureMode || "unknown"}
                  </Badge>
                  <span className="text-muted-foreground">({architectureMode?.source || "n/a"})</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Unified = modern runtime path. Legacy = fallback path.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs">Legacy</Label>
                <Switch
                  checked={architectureMode?.architectureMode === "unified"}
                  disabled={architectureModeLoading || setArchitectureMode.isPending || architectureMode?.canManage === false}
                  onCheckedChange={(checked) => {
                    const mode = checked ? "unified" : "legacy";
                    setArchitectureMode.mutate({ architectureMode: mode });
                  }}
                />
                <Label className="text-xs">Unified</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.agents?.map((agent: any) => (
            (() => {
              const progress = getAgentCardProgress(agent);
              return (
            <Card
              key={agent.agentType}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => onSelectAgent(agent.agentType)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {agentIcons[agent.agentType] || <Bot className="h-5 w-5" />}
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                  </div>
                  <Badge className={cn("text-[10px]", statusColors[agent.status] || statusColors.inactive)}>
                    {agent.status}
                  </Badge>
                </div>
                <CardDescription className="text-xs">v{agent.version} &bull; {agent.agentType}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Progress score */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        progress >= 70 ? "bg-green-500" :
                        progress >= 40 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                    <span>{agent.activePromptSections}/{agent.totalPromptSections} sections</span>
                    <span>{agent.totalCapabilities} capabilities</span>
                    <span>{agent.overallPerformanceScore ?? 0}% perf</span>
                    {agent.pendingRecommendations > 0 && (
                      <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-500/30">
                        {agent.pendingRecommendations} recs
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
              );
            })()
          ))}
        </div>

        {/* Pipeline summary */}
        <PipelineSummarySection />
      </div>
    </ScrollArea>
  );
}

// ==================== PIPELINE SUMMARY ====================

function PipelineSummarySection() {
  const { data: pipelines } = useQuery({
    queryKey: ["unified-agents-pipeline-summary"],
    queryFn: () => fetchJson(`${API_BASE}/pipeline-summary`),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  if (!pipelines || Object.keys(pipelines).length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Learning Pipeline Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(pipelines).map(([agentType, pipeline]: [string, any]) => (
            <div key={agentType} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <div className="flex items-center gap-2">
                {agentIcons[agentType] || <Bot className="h-4 w-4" />}
                <span className="text-sm capitalize">{agentType}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{pipeline.status}</Badge>
                <span className="text-[10px] text-muted-foreground">
                  {pipeline.stats?.totalRecommendationsGenerated || 0} recs
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== AGENT DETAIL VIEW ====================

function AgentDetailView({
  agentType,
  activeTab,
  setActiveTab,
}: {
  agentType: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["unified-agent-detail", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}`),
    refetchInterval: 30000, // Increased from 15s to 30s
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) return <div className="p-6 text-muted-foreground">Agent not found</div>;

  return (
    <div className="h-full flex flex-col">
      {/* Agent header with quick stats */}
      <div className="px-6 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {agentIcons[agentType] || <Bot className="h-5 w-5" />}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{detail.name}</span>
                <Badge className={cn("text-[10px]", statusColors[detail.status])}>
                  {detail.status}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  v{detail.versionControl?.currentVersion}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{detail.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5" />
              {detail.promptSections?.length || 0} sections
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" />
              {detail.capabilities?.length || 0} capabilities
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              {detail.performanceSnapshot?.overallScore || 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 border-b">
          <TabsList className="h-9 bg-transparent gap-4">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="prompt-sections" className="text-xs">Prompt Sections</TabsTrigger>
            <TabsTrigger value="capability-map" className="text-xs">Capability Map</TabsTrigger>
            <TabsTrigger value="recommendations" className="text-xs">
              Recommendations
              {detail.learningPipeline?.recommendations?.filter((r: any) => r.status === "pending").length > 0 && (
                <Badge variant="destructive" className="ml-1 text-[9px] h-4 px-1">
                  {detail.learningPipeline.recommendations.filter((r: any) => r.status === "pending").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="learning" className="text-xs">Learning Pipeline</TabsTrigger>
            <TabsTrigger value="versions" className="text-xs">Version History</TabsTrigger>
            <TabsTrigger value="config" className="text-xs">Configuration</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="overview" className="h-full mt-0">
            <AgentOverviewTab detail={detail} />
          </TabsContent>
          <TabsContent value="prompt-sections" className="h-full mt-0">
            <PromptSectionsTab agentType={agentType} />
          </TabsContent>
          <TabsContent value="capability-map" className="h-full mt-0">
            <CapabilityMapTab agentType={agentType} detail={detail} />
          </TabsContent>
          <TabsContent value="recommendations" className="h-full mt-0">
            <RecommendationsTab agentType={agentType} />
          </TabsContent>
          <TabsContent value="learning" className="h-full mt-0">
            <LearningPipelineTab agentType={agentType} />
          </TabsContent>
          <TabsContent value="versions" className="h-full mt-0">
            <VersionHistoryTab agentType={agentType} />
          </TabsContent>
          <TabsContent value="config" className="h-full mt-0">
            <ConfigurationTab agentType={agentType} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ==================== OVERVIEW TAB ====================

function AgentOverviewTab({ detail }: { detail: any }) {
  const tracking = detail.trackingMetrics;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Tracking overview */}
        {tracking && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tracking Readiness</CardTitle>
              <CardDescription className="text-xs">
                Progress computed from sections, capabilities, mappings, learning inputs, and configuration completeness
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Overall Progress</span>
                  <span className="font-medium">{tracking.progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      tracking.progress >= 70 ? "bg-green-500" : tracking.progress >= 40 ? "bg-yellow-500" : "bg-red-500"
                    )}
                    style={{ width: `${tracking.progress}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-md bg-muted/40">
                    <div className="text-muted-foreground">Sections</div>
                    <div className="font-medium">{tracking.activePromptSections}/{tracking.totalPromptSections}</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40">
                    <div className="text-muted-foreground">Capabilities</div>
                    <div className="font-medium">{tracking.activeCapabilities}/{tracking.totalCapabilities}</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40">
                    <div className="text-muted-foreground">Mapping Coverage</div>
                    <div className="font-medium">{tracking.mappingCoverage}%</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/40">
                    <div className="text-muted-foreground">Learning Coverage</div>
                    <div className="font-medium">{tracking.learningCoverage}%</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Performance overview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Capability Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {detail.capabilities?.map((cap: any) => (
                <div key={cap.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {cap.name}
                      {trendIcons[cap.trend] || trendIcons.stable}
                    </span>
                    <span className="font-mono text-xs">{cap.performanceScore}%</span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        cap.performanceScore >= 70 ? "bg-green-500" :
                        cap.performanceScore >= 40 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${cap.performanceScore}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Prompt sections summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Prompt Architecture</CardTitle>
            <CardDescription className="text-xs">
              {detail.promptSections?.length || 0} sections defining this agent's intelligence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {detail.promptSections?.map((section: any) => (
                <div
                  key={section.id}
                  className={cn(
                    "p-2 rounded-md border text-xs",
                    section.isActive ? "bg-muted/50" : "bg-muted/20 opacity-50"
                  )}
                >
                  <div className="font-medium truncate">{section.name}</div>
                  <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
                    <span>#{section.sectionNumber}</span>
                    <span>&bull;</span>
                    <span>{section.changeCount} edits</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Capability-to-prompt map summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Capability-to-Prompt Map</CardTitle>
            <CardDescription className="text-xs">
              How capabilities map to prompt sections for targeted optimization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {detail.capabilityPromptMap?.slice(0, 8).map((mapping: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {mapping.capability?.name || "?"}
                  </Badge>
                  <span className="text-muted-foreground">&rarr;</span>
                  <Badge className="text-[10px] bg-blue-500/15 text-blue-400 border-blue-500/30 shrink-0">
                    {mapping.promptSection?.name || "?"}
                  </Badge>
                  <span className="text-muted-foreground ml-auto">
                    {Math.round((mapping.confidence || 0) * 100)}% conf
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline status */}
        {detail.learningPipeline?.state && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Learning Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-xs">
                <Badge variant="outline">{detail.learningPipeline.state.status}</Badge>
                <span className="text-muted-foreground">
                  {detail.learningPipeline.state.stats?.totalRecommendationsGenerated || 0} recommendations generated
                </span>
                <span className="text-muted-foreground">
                  {detail.learningPipeline.state.stats?.totalApplied || 0} applied
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

// ==================== PROMPT SECTIONS TAB ====================

function PromptSectionsTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editReason, setEditReason] = useState("");

  const { data: sections } = useQuery({
    queryKey: ["unified-agent-sections", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/prompt-sections`),
  });

  const updateSection = useMutation({
    mutationFn: ({ sectionId, newContent, reason }: { sectionId: string; newContent: string; reason: string }) =>
      putJson(`${API_BASE}/${agentType}/prompt-sections/${sectionId}`, { newContent, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-sections", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-detail", agentType] });
      setEditingSection(null);
      setEditContent("");
      setEditReason("");
      toast({ title: "Section updated", description: "Prompt section saved with version tracking." });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">
            {sections?.totalSections || 0} foundational prompt sections — each versioned and editable
          </p>
        </div>

        <Accordion type="single" collapsible>
          {sections?.sections?.map((section: any) => (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionTrigger className="text-sm hover:no-underline py-2">
                <div className="flex items-center gap-3 w-full">
                  <Badge variant="outline" className="text-[10px] font-mono w-6 justify-center">
                    {section.sectionNumber}
                  </Badge>
                  <span className="flex-1 text-left">{section.name}</span>
                  <Badge
                    className={cn(
                      "text-[9px]",
                      section.isActive ? "bg-green-500/15 text-green-400" : "bg-gray-500/15 text-gray-400"
                    )}
                  >
                    {section.isActive ? "active" : "inactive"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{section.changeCount} edits</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Category: <Badge variant="secondary" className="text-[9px]">{section.category}</Badge></span>
                    <span>Hash: {section.versionHash}</span>
                  </div>

                  {editingSection === section.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="font-mono text-xs min-h-[200px]"
                        placeholder="Section content..."
                      />
                      <Input
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        placeholder="Reason for edit..."
                        className="text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            updateSection.mutate({
                              sectionId: section.id,
                              newContent: editContent,
                              reason: editReason,
                            })
                          }
                          disabled={!editContent.trim() || !editReason.trim() || updateSection.isPending}
                        >
                          {updateSection.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingSection(null); setEditContent(""); setEditReason(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <pre className="text-xs bg-muted/50 rounded-md p-3 whitespace-pre-wrap font-mono max-h-[300px] overflow-auto">
                        {section.content}
                      </pre>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingSection(section.id);
                          setEditContent(section.content);
                          setEditReason("");
                        }}
                      >
                        <PenLine className="h-3 w-3 mr-1" />
                        Edit Section
                      </Button>
                    </>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </ScrollArea>
  );
}

// ==================== CAPABILITY MAP TAB ====================

function CapabilityMapTab({ agentType, detail }: { agentType: string; detail: any }) {
  const { data: capMap } = useQuery({
    queryKey: ["unified-agent-cap-map", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/capability-map`),
  });

  const map = capMap?.map || detail?.capabilityPromptMap || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium">Capability &rarr; Prompt Section &rarr; Learning Sources</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Each capability maps to a specific prompt section. Learning inputs feed into the pipeline to generate
            targeted recommendations for that section.
          </p>
        </div>

        <div className="space-y-2">
          {map.map((m: any, idx: number) => (
            <Card key={idx} className="overflow-hidden">
              <div className="flex items-stretch">
                {/* Capability column */}
                <div className="flex-1 p-3 border-r">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="text-sm font-medium">{m.capability?.name || "Unknown"}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">Score: {m.capability?.score || 0}%</span>
                    {trendIcons[m.capability?.trend] || trendIcons.stable}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center px-2 text-muted-foreground">
                  &rarr;
                </div>

                {/* Prompt section column */}
                <div className="flex-1 p-3 border-r">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-sm">{m.promptSection?.name || "Unknown"}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    #{m.promptSection?.sectionNumber} &bull; {Math.round((m.confidence || 0) * 100)}% confidence
                  </span>
                </div>

                {/* Arrow */}
                <div className="flex items-center px-2 text-muted-foreground">
                  &larr;
                </div>

                {/* Learning sources column */}
                <div className="flex-1 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-xs font-medium">Learning Sources</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {m.learningInputSources?.map((src: any, si: number) => (
                      <Badge key={si} variant="outline" className="text-[9px]">
                        {src.name}
                      </Badge>
                    )) || (
                      <span className="text-[10px] text-muted-foreground">No sources</span>
                    )}
                  </div>
                </div>
              </div>
              {m.requiresApproval && (
                <div className="bg-yellow-500/10 text-yellow-400 text-[10px] px-3 py-1 border-t border-yellow-500/20">
                  Requires approval before applying recommendations
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

// ==================== RECOMMENDATIONS TAB ====================

function RecommendationsTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data: recs } = useQuery({
    queryKey: ["unified-agent-recommendations", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/recommendations`),
    refetchInterval: 30000, // Increased from 10s to 30s
    refetchIntervalInBackground: false,
  });

  const applyRec = useMutation({
    mutationFn: (id: string) => postJson(`${API_BASE}/${agentType}/recommendations/${id}/apply`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-recommendations", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-detail", agentType] });
      toast({ title: "Recommendation applied", description: "Prompt section updated." });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const rejectRec = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      postJson(`${API_BASE}/${agentType}/recommendations/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-recommendations", agentType] });
      setRejectingId(null);
      setRejectReason("");
      toast({ title: "Recommendation rejected" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const pending = recs?.recommendations?.filter((r: any) => r.status === "pending") || [];
  const others = recs?.recommendations?.filter((r: any) => r.status !== "pending") || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Pending */}
        {pending.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-400" />
              Pending Recommendations ({pending.length})
            </h3>
            {pending.map((rec: any) => (
              <Card key={rec.id} className="border-yellow-500/20">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">{rec.title}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rec.category} &bull; Priority: {rec.priorityScore}
                        {rec.targetSectionId && (
                          <span> &bull; Target: {rec.targetSectionId}</span>
                        )}
                      </p>
                    </div>
                    <Badge className="text-[10px] bg-yellow-500/15 text-yellow-400">pending</Badge>
                  </div>

                  {rec.impact && (
                    <div className="text-xs text-muted-foreground">
                      Expected improvement: {rec.impact.expectedImprovement}%
                      {rec.impact.riskLevel && ` &bull; Risk: ${rec.impact.riskLevel}`}
                    </div>
                  )}

                  {rec.governance?.requiresExplicitApproval && (
                    <div className="text-xs text-amber-400/80 bg-amber-500/10 rounded px-2 py-1">
                      Requires approval: {rec.governance.approvalReasons?.join(', ')}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => applyRec.mutate(rec.id)}
                      disabled={applyRec.isPending}
                    >
                      {applyRec.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      {rec.governance?.requiresExplicitApproval ? 'Approve & Apply' : 'Apply'}
                    </Button>

                    {rejectingId === rec.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason for rejection..."
                          className="text-xs h-8"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectRec.mutate({ id: rec.id, reason: rejectReason })}
                          disabled={!rejectReason.trim() || rejectRec.isPending}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setRejectingId(null); setRejectReason(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingId(rec.id)}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Past recommendations */}
        {others.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Past Recommendations ({others.length})
            </h3>
            {others.map((rec: any) => (
              <div key={rec.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 text-xs">
                <div>
                  <span className="font-medium">{rec.title}</span>
                  <span className="text-muted-foreground ml-2">{rec.category}</span>
                </div>
                <Badge
                  className={cn(
                    "text-[9px]",
                    rec.status === "applied" ? "bg-green-500/15 text-green-400" :
                    rec.status === "rejected" ? "bg-red-500/15 text-red-400" :
                    "bg-gray-500/15 text-gray-400"
                  )}
                >
                  {rec.status}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {pending.length === 0 && others.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No recommendations yet</p>
            <p className="text-xs mt-1">Run the learning pipeline to generate optimization recommendations.</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ==================== LEARNING PIPELINE TAB ====================

function LearningPipelineTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pipeline } = useQuery({
    queryKey: ["unified-agent-pipeline", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/learning-pipeline`),
    refetchInterval: 30000, // Increased from 10s to 30s
    refetchIntervalInBackground: false,
  });

  const triggerAnalysis = useMutation({
    mutationFn: () =>
      postJson(`${API_BASE}/${agentType}/learning-pipeline/analyze`, {
        performanceData: [
          { sourceType: "call_metrics", metrics: { totalCalls: 0, conversionRate: 0 }, insights: [] },
        ],
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-pipeline", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-recommendations", agentType] });
      toast({
        title: "Analysis complete",
        description: `${data.recommendations?.length || 0} recommendations generated`,
      });
    },
    onError: (err: Error) => toast({ title: "Analysis failed", description: err.message, variant: "destructive" }),
  });

  const state = pipeline?.state;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Pipeline status */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Pipeline Status
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => triggerAnalysis.mutate()}
                disabled={triggerAnalysis.isPending}
              >
                {triggerAnalysis.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Run Analysis
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {state ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <Badge variant="outline">{state.status}</Badge>
                  {state.lastRun && (
                    <span className="text-xs text-muted-foreground">
                      Last run: {new Date(state.lastRun).toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-2 rounded-md bg-muted/50 text-center">
                    <div className="text-lg font-bold">{state.stats?.totalRecommendationsGenerated || 0}</div>
                    <div className="text-[10px] text-muted-foreground">Generated</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 text-center">
                    <div className="text-lg font-bold text-green-400">{state.stats?.totalApplied || 0}</div>
                    <div className="text-[10px] text-muted-foreground">Applied</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 text-center">
                    <div className="text-lg font-bold text-red-400">{state.stats?.totalRejected || 0}</div>
                    <div className="text-[10px] text-muted-foreground">Rejected</div>
                  </div>
                  <div className="p-2 rounded-md bg-muted/50 text-center">
                    <div className="text-lg font-bold text-blue-400">
                      {state.stats?.averageImprovementFromApplied?.toFixed(1) || 0}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">Avg Improvement</div>
                  </div>
                </div>

                {/* Active collectors */}
                {state.activeCollectors?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium mb-2">Data Collectors</h4>
                    <div className="flex flex-wrap gap-2">
                      {state.activeCollectors.map((c: any) => (
                        <Badge
                          key={c.id}
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            c.status === "active" ? "border-green-500/30 text-green-400" :
                            c.status === "error" ? "border-red-500/30 text-red-400" : ""
                          )}
                        >
                          {c.sourceType} ({c.dataPointsCollected})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Pipeline not initialized for this agent</p>
            )}
          </CardContent>
        </Card>

        {/* Recent analyses */}
        {pipeline?.recentAnalyses?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Analyses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pipeline.recentAnalyses.map((analysis: any) => (
                  <div key={analysis.id} className="p-2 rounded-md bg-muted/30 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{analysis.sourceType}</span>
                      <span className="text-muted-foreground">
                        {new Date(analysis.analyzedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {analysis.findings?.length || 0} findings &bull; {analysis.recommendationIds?.length || 0} recommendations
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

// ==================== VERSION HISTORY TAB ====================

function VersionHistoryTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: versions } = useQuery({
    queryKey: ["unified-agent-versions", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/version-history`),
  });

  const rollback = useMutation({
    mutationFn: (version: string) =>
      postJson(`${API_BASE}/${agentType}/rollback/${version}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-versions", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-detail", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-sections", agentType] });
      toast({ title: "Rollback complete" });
    },
    onError: (err: Error) => toast({ title: "Rollback failed", description: err.message, variant: "destructive" }),
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Version History
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Current: v{versions?.currentVersion} &bull; {versions?.totalVersions || 0} versions
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {versions?.history?.map((snapshot: any, idx: number) => (
            <Card key={snapshot.version} className={idx === 0 ? "border-primary/30" : ""}>
              <CardContent className="py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      v{snapshot.version}
                    </Badge>
                    {idx === 0 && (
                      <Badge className="text-[9px] bg-blue-500/15 text-blue-400">current</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {snapshot.changelog} &bull; by {snapshot.deployedBy}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(snapshot.timestamp).toLocaleString()}
                  </p>
                </div>
                {idx > 0 && snapshot.rollbackAvailable && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Rollback
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Rollback to v{snapshot.version}?</DialogTitle>
                        <DialogDescription>
                          This will restore all prompt sections to the state at version {snapshot.version}.
                          A new version entry will be created for the rollback.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          onClick={() => rollback.mutate(snapshot.version)}
                          disabled={rollback.isPending}
                        >
                          {rollback.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Confirm Rollback
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardContent>
            </Card>
          ))}

          {(!versions?.history || versions.history.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <GitCompare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No version history yet</p>
              <p className="text-xs mt-1">Edit a prompt section to create the first version snapshot.</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

// ==================== CONFIGURATION TAB ====================

function ConfigurationTab({ agentType }: { agentType: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config } = useQuery({
    queryKey: ["unified-agent-config", agentType],
    queryFn: () => fetchJson(`${API_BASE}/${agentType}/configuration`),
  });

  const updateConfig = useMutation({
    mutationFn: (updates: any) => patchJson(`${API_BASE}/${agentType}/configuration`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-config", agentType] });
      queryClient.invalidateQueries({ queryKey: ["unified-agent-detail", agentType] });
      toast({ title: "Configuration updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const cfg = config?.configuration;
  if (!cfg) return <div className="p-6 text-muted-foreground text-sm">Loading...</div>;

  const toDisplayText = (value: any): string => {
    if (value == null) return "N/A";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => toDisplayText(item)).join(", ");
    }
    if (typeof value === "object") {
      return (
        value.name ||
        value.id ||
        value.state ||
        value.trigger ||
        value.label ||
        value.description ||
        JSON.stringify(value)
      );
    }
    return String(value);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Tone & Persona */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Tone & Persona
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Personality</span>
                <p className="font-medium">{cfg.toneAndPersona?.personality || "Not set"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Formality</span>
                <p className="font-medium capitalize">{cfg.toneAndPersona?.formality || "Not set"}</p>
              </div>
              {cfg.toneAndPersona?.empathy !== undefined && (
                <div>
                  <span className="text-muted-foreground">Empathy</span>
                  <p className="font-medium">{cfg.toneAndPersona.empathy}/10</p>
                </div>
              )}
              {cfg.toneAndPersona?.assertiveness !== undefined && (
                <div>
                  <span className="text-muted-foreground">Assertiveness</span>
                  <p className="font-medium">{cfg.toneAndPersona.assertiveness}/10</p>
                </div>
              )}
              {cfg.toneAndPersona?.warmth !== undefined && (
                <div>
                  <span className="text-muted-foreground">Warmth</span>
                  <p className="font-medium">{cfg.toneAndPersona.warmth}/10</p>
                </div>
              )}
              {cfg.toneAndPersona?.technicality !== undefined && (
                <div>
                  <span className="text-muted-foreground">Technicality</span>
                  <p className="font-medium">{cfg.toneAndPersona.technicality}/10</p>
                </div>
              )}
            </div>
            {cfg.toneAndPersona?.customTraits?.length > 0 && (
              <div className="mt-3">
                <span className="text-xs text-muted-foreground">Custom Traits</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {cfg.toneAndPersona.customTraits.map((trait: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{toDisplayText(trait)}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Tuning */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance Tuning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Temperature</span>
                <p className="font-medium font-mono">{cfg.performanceTuning?.temperature ?? "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Max Tokens</span>
                <p className="font-medium font-mono">{cfg.performanceTuning?.maxTokens ?? "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Top P</span>
                <p className="font-medium font-mono">{cfg.performanceTuning?.topP ?? "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Model</span>
                <p className="font-medium truncate">{cfg.performanceTuning?.modelPreference ?? "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compliance */}
        {cfg.complianceSettings && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Compliance Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs space-y-2">
                {cfg.complianceSettings.frameworks?.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Frameworks</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cfg.complianceSettings.frameworks.map((fw: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{toDisplayText(fw)}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {cfg.complianceSettings.prohibitedPhrases?.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Prohibited Phrases</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cfg.complianceSettings.prohibitedPhrases.map((p: any, i: number) => (
                        <Badge key={i} variant="destructive" className="text-[10px]">{toDisplayText(p)}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Retry & Escalation */}
        {cfg.retryAndEscalation && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Retry & Escalation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Max Retries</span>
                  <p className="font-medium">{cfg.retryAndEscalation.maxRetries ?? "N/A"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cooldown (min)</span>
                  <p className="font-medium">{cfg.retryAndEscalation.cooldownMinutes ?? "N/A"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Escalation Threshold</span>
                  <p className="font-medium">{cfg.retryAndEscalation.escalationThreshold ?? "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* State Machine */}
        {cfg.stateMachine && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">State Machine</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Initial State</span>
                  <Badge variant="outline" className="ml-2 text-[10px]">{toDisplayText(cfg.stateMachine.initialState)}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">States</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {cfg.stateMachine.states?.map((s: any, i: number) => (
                      <Badge key={s?.id || `${toDisplayText(s)}-${i}`} variant="secondary" className="text-[10px]">{toDisplayText(s)}</Badge>
                    ))}
                  </div>
                </div>
                {cfg.stateMachine.transitions?.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Transitions ({cfg.stateMachine.transitions.length})</span>
                    <div className="space-y-1 mt-1">
                      {cfg.stateMachine.transitions.slice(0, 8).map((t: any, i: number) => (
                        <div key={i} className="flex items-center gap-1 text-[10px]">
                          <Badge variant="outline" className="text-[9px]">{toDisplayText(t.from)}</Badge>
                          <span className="text-muted-foreground">&rarr;</span>
                          <Badge variant="outline" className="text-[9px]">{toDisplayText(t.to)}</Badge>
                          <span className="text-muted-foreground ml-1">({toDisplayText(t.trigger)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* System prompt metadata */}
        {cfg.systemPromptMetadata && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">System Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                <div>
                  <span>Created</span>
                  <p>{new Date(cfg.systemPromptMetadata.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <span>Last Edited</span>
                  <p>{new Date(cfg.systemPromptMetadata.lastEdited).toLocaleDateString()}</p>
                </div>
                <div>
                  <span>Total Edits</span>
                  <p>{cfg.systemPromptMetadata.editCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}

// ==================== AGENT PROMPTS TAB ====================

interface AgentPromptItem {
  id: string;
  name: string;
  description: string | null;
  userRole: string | null;
  iamRoleId: string | null;
  isClientPortal: boolean;
  promptType: "system" | "capability" | "restriction" | "persona" | "context";
  promptContent: string;
  capabilities: string[] | null;
  restrictions: string[] | null;
  contextRules: Record<string, any> | null;
  isActive: boolean;
  priority: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
// ==================== AGENT SETUP TAB ====================

function AgentSetupTab({ agentType }: { agentType: string }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header actions */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Role-Based Agent Prompts
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configure and manage AI agent prompts by role
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {/* Seed defaults will be added */}}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Seed Defaults
            </Button>
            <Button size="sm" onClick={() => {/* Create prompt will be added */}}>
              <Plus className="h-3 w-3 mr-1" />
              Create Prompt
            </Button>
          </div>
        </div>

        {/* Content */}
        <AgentPromptsTabContent />
      </div>
    </ScrollArea>
  );
}

// ==================== AGENT PROMPTS TAB CONTENT ====================

function AgentPromptsTabContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<AgentPromptItem | null>(null);

  const { data: prompts = [], isLoading } = useQuery<AgentPromptItem[]>({
    queryKey: ["unified-agent-prompts", roleFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (roleFilter !== "all") params.append("role", roleFilter);
      if (typeFilter !== "all") params.append("type", typeFilter);
      const response = await apiRequest("GET", `${PROMPTS_API}?${params.toString()}`);
      return response.json();
    },
  });

  const { data: tools = [] } = useQuery<PromptTool[]>({
    queryKey: ["unified-agent-prompt-tools"],
    queryFn: async () => {
      const response = await apiRequest("GET", `${PROMPTS_API}/tools/available`);
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<AgentPromptItem>) => {
      const response = await apiRequest("POST", PROMPTS_API, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-prompts"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Prompt created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AgentPromptItem> }) => {
      const response = await apiRequest("PUT", `${PROMPTS_API}/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-prompts"] });
      setEditingPrompt(null);
      toast({ title: "Prompt updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `${PROMPTS_API}/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-prompts"] });
      toast({ title: "Prompt deactivated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `${PROMPTS_API}/seed-defaults`);
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["unified-agent-prompts"] });
      toast({ title: "Success", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredPrompts = prompts.filter((prompt) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        prompt.name.toLowerCase().includes(query) ||
        prompt.description?.toLowerCase().includes(query) ||
        prompt.promptContent.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const promptsByRole = filteredPrompts.reduce((acc, prompt) => {
    const role = prompt.isClientPortal ? "client" : prompt.userRole || "universal";
    if (!acc[role]) acc[role] = [];
    acc[role].push(prompt);
    return acc;
  }, {} as Record<string, AgentPromptItem[]>);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search prompts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                <SelectItem value="quality_analyst">Quality Analyst</SelectItem>
                <SelectItem value="data_ops">Data Operations</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="capability">Capability</SelectItem>
                <SelectItem value="restriction">Restriction</SelectItem>
                <SelectItem value="persona">Persona</SelectItem>
                <SelectItem value="context">Context</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{prompts.length}</div>
            <p className="text-xs text-muted-foreground">Total Prompts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-400">
              {prompts.filter((p) => p.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-400">
              {Object.keys(promptsByRole).length}
            </div>
            <p className="text-xs text-muted-foreground">Roles Configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-400">
              {prompts.filter((p) => p.isClientPortal).length}
            </div>
            <p className="text-xs text-muted-foreground">Client Portal</p>
          </CardContent>
        </Card>
      </div>

      {/* Prompts by role */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPrompts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mb-3">
              {searchQuery ? "No prompts match your search" : "No prompts configured yet"}
            </p>
            <Button variant="outline" size="sm" onClick={() => seedDefaultsMutation.mutate()}>
              <Sparkles className="h-3 w-3 mr-1" />
              Seed Default Prompts
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(promptsByRole).map(([role, rolePrompts]) => (
            <PromptRoleSection
              key={role}
              role={role}
              prompts={rolePrompts}
              onEdit={setEditingPrompt}
              onDelete={(id) => deleteMutation.mutate(id)}
              onToggleActive={(prompt) =>
                updateMutation.mutate({ id: prompt.id, data: { isActive: !prompt.isActive } })
              }
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <PromptEditDialog
        open={isCreateDialogOpen || !!editingPrompt}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingPrompt(null);
          }
        }}
        prompt={editingPrompt}
        tools={tools}
        onSave={(data) => {
          if (editingPrompt) {
            updateMutation.mutate({ id: editingPrompt.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

// ==================== AGENT PROMPTS TAB ====================

interface AgentPromptItem {
  id: string;
  name: string;
  description: string | null;
  userRole: string | null;
  iamRoleId: string | null;
  isClientPortal: boolean;
  promptType: "system" | "capability" | "restriction" | "persona" | "context";
  promptContent: string;
  capabilities: string[] | null;
  restrictions: string[] | null;
  contextRules: Record<string, any> | null;
  isActive: boolean;
  priority: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface PromptTool {
  id: string;
  name: string;
  category: string;
  description: string;
}

const promptTypeColors: Record<string, string> = {
  system: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  capability: "bg-green-500/10 text-green-500 border-green-500/20",
  restriction: "bg-red-500/10 text-red-500 border-red-500/20",
  persona: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  context: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  agent: "Agent",
  campaign_manager: "Campaign Manager",
  quality_analyst: "Quality Analyst",
  data_ops: "Data Operations",
  content_creator: "Content Creator",
  client: "Client Portal",
};

const PROMPTS_API = "/api/unified-agents/agent-prompts";


// ==================== PROMPT ROLE SECTION ====================

function PromptRoleSection({
  role,
  prompts,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  role: string;
  prompts: AgentPromptItem[];
  onEdit: (prompt: AgentPromptItem) => void;
  onDelete: (id: string) => void;
  onToggleActive: (prompt: AgentPromptItem) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const RoleIcon = role === "client" ? Users : Shield;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <RoleIcon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm">{roleLabels[role] || role}</CardTitle>
                  <CardDescription className="text-xs">
                    {prompts.length} prompt{prompts.length !== 1 ? "s" : ""} configured
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {prompts.filter((p) => p.isActive).length} active
                </Badge>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            {prompts.map((prompt) => (
              <PromptItemCard
                key={prompt.id}
                prompt={prompt}
                onEdit={() => onEdit(prompt)}
                onDelete={() => onDelete(prompt.id)}
                onToggleActive={() => onToggleActive(prompt)}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ==================== PROMPT ITEM CARD ====================

function PromptItemCard({
  prompt,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  prompt: AgentPromptItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [showContent, setShowContent] = useState(false);

  return (
    <div
      className={cn(
        "border rounded-lg p-3 transition-all",
        prompt.isActive ? "bg-card" : "bg-muted/30 opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium truncate">{prompt.name}</h4>
            <Badge variant="outline" className={cn("text-[10px]", promptTypeColors[prompt.promptType])}>
              {prompt.promptType}
            </Badge>
            {!prompt.isActive && (
              <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
            )}
          </div>
          {prompt.description && (
            <p className="text-xs text-muted-foreground mb-1">{prompt.description}</p>
          )}
          <div className="flex flex-wrap gap-1 mb-1">
            {prompt.capabilities?.slice(0, 4).map((cap) => (
              <Badge key={cap} variant="secondary" className="text-[9px]">{cap}</Badge>
            ))}
            {prompt.capabilities && prompt.capabilities.length > 4 && (
              <Badge variant="secondary" className="text-[9px]">
                +{prompt.capabilities.length - 4} more
              </Badge>
            )}
          </div>
          <Collapsible open={showContent} onOpenChange={setShowContent}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                {showContent ? "Hide content" : "Show content"}
                {showContent ? (
                  <ChevronDown className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronRight className="h-3 w-3 ml-1" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-1 p-2 bg-muted/50 rounded text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-auto">
                {prompt.promptContent}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <div className="flex items-center gap-1">
          <Switch checked={prompt.isActive} onCheckedChange={onToggleActive} />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t text-[10px] text-muted-foreground">
        <span>v{prompt.version}</span>
        <span>Priority: {prompt.priority}</span>
        <span>Updated: {new Date(prompt.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// ==================== PROMPT EDIT DIALOG ====================

function PromptEditDialog({
  open,
  onOpenChange,
  prompt,
  tools,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: AgentPromptItem | null;
  tools: PromptTool[];
  onSave: (data: Partial<AgentPromptItem>) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<Partial<AgentPromptItem>>({
    name: "",
    description: "",
    userRole: null,
    isClientPortal: false,
    promptType: "system",
    promptContent: "",
    capabilities: [],
    restrictions: [],
    isActive: true,
    priority: 0,
  });

  useState(() => {
    if (prompt) {
      setFormData(prompt);
    } else {
      setFormData({
        name: "",
        description: "",
        userRole: null,
        isClientPortal: false,
        promptType: "system",
        promptContent: "",
        capabilities: [],
        restrictions: [],
        isActive: true,
        priority: 0,
      });
    }
  });

  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, PromptTool[]>);

  const toggleCapability = (toolId: string) => {
    const current = formData.capabilities || [];
    const updated = current.includes(toolId)
      ? current.filter((c) => c !== toolId)
      : [...current, toolId];
    setFormData({ ...formData, capabilities: updated });
  };

  const toggleRestriction = (toolId: string) => {
    const current = formData.restrictions || [];
    const updated = current.includes(toolId)
      ? current.filter((r) => r !== toolId)
      : [...current, toolId];
    setFormData({ ...formData, restrictions: updated });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prompt ? "Edit Prompt" : "Create New Prompt"}</DialogTitle>
          <DialogDescription>Configure the agent prompt settings and capabilities</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-name">Name</Label>
              <Input
                id="prompt-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter prompt name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-type">Type</Label>
              <Select
                value={formData.promptType}
                onValueChange={(value) => setFormData({ ...formData, promptType: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="capability">Capability</SelectItem>
                  <SelectItem value="restriction">Restriction</SelectItem>
                  <SelectItem value="persona">Persona</SelectItem>
                  <SelectItem value="context">Context</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt-desc">Description</Label>
            <Input
              id="prompt-desc"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this prompt"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-role">User Role</Label>
              <Select
                value={formData.userRole || "none"}
                onValueChange={(value) =>
                  setFormData({ ...formData, userRole: value === "none" ? null : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Universal (All Roles)</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                  <SelectItem value="quality_analyst">Quality Analyst</SelectItem>
                  <SelectItem value="data_ops">Data Operations</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="content_creator">Content Creator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-priority">Priority</Label>
              <Input
                id="prompt-priority"
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="prompt-client-portal"
                checked={formData.isClientPortal}
                onCheckedChange={(checked) => setFormData({ ...formData, isClientPortal: checked })}
              />
              <Label htmlFor="prompt-client-portal">Client Portal Only</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="prompt-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="prompt-active">Active</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt-content">Prompt Content</Label>
            <Textarea
              id="prompt-content"
              value={formData.promptContent}
              onChange={(e) => setFormData({ ...formData, promptContent: e.target.value })}
              placeholder="Enter the prompt content..."
              className="min-h-[150px] font-mono text-sm"
            />
          </div>

          <Tabs defaultValue="capabilities" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
            </TabsList>
            <TabsContent value="capabilities" className="mt-4">
              <ScrollArea className="h-[200px] border rounded-md p-4">
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  <div key={category} className="mb-4">
                    <h4 className="text-xs font-medium mb-2">{category}</h4>
                    <div className="flex flex-wrap gap-1">
                      {categoryTools.map((tool) => (
                        <Badge
                          key={tool.id}
                          variant={formData.capabilities?.includes(tool.id) ? "default" : "outline"}
                          className="cursor-pointer text-[10px]"
                          onClick={() => toggleCapability(tool.id)}
                        >
                          {formData.capabilities?.includes(tool.id) && (
                            <Check className="h-2.5 w-2.5 mr-0.5" />
                          )}
                          {tool.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="restrictions" className="mt-4">
              <ScrollArea className="h-[200px] border rounded-md p-4">
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  <div key={category} className="mb-4">
                    <h4 className="text-xs font-medium mb-2">{category}</h4>
                    <div className="flex flex-wrap gap-1">
                      {categoryTools.map((tool) => (
                        <Badge
                          key={tool.id}
                          variant={formData.restrictions?.includes(tool.id) ? "destructive" : "outline"}
                          className="cursor-pointer text-[10px]"
                          onClick={() => toggleRestriction(tool.id)}
                        >
                          {formData.restrictions?.includes(tool.id) && (
                            <X className="h-2.5 w-2.5 mr-0.5" />
                          )}
                          {tool.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(formData)}
            disabled={isSaving || !formData.name || !formData.promptContent}
          >
            {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {prompt ? "Save Changes" : "Create Prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
