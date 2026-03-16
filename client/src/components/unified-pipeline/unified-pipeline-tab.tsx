/**
 * Unified Pipeline Tab — Main tab for the client portal dashboard.
 * Shows pipeline list, funnel board, account details, and analytics.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus,
  LayoutGrid,
  BarChart3,
  Workflow,
  Building2,
  Users,
  Target,
  TrendingUp,
  Loader2,
  Sparkles,
  ArrowRight,
  Calendar,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

interface UnifiedPipelineTabProps {
  authHeaders: { headers: { Authorization: string } };
  clientAccountId?: string;
  organizationId?: string;
}

interface PipelineSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  objective: string | null;
  totalAccounts: number;
  totalCampaigns: number;
  appointmentsSet: number;
  createdAt: string;
}

interface PipelineDashboard {
  pipeline: {
    id: string;
    name: string;
    status: string;
    objective?: string;
    createdAt: string;
  };
  funnel: {
    stageDistribution: Array<{
      stageId: string;
      stageName: string;
      count: number;
      percentage: number;
    }>;
    totalAccounts: number;
    activeAccounts: number;
    appointmentsSet: number;
    closedWon: number;
    closedLost: number;
    conversionRate: number;
  };
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    campaignType: string;
    status: string;
  }>;
  recentActivity: Array<{
    type: string;
    accountName: string;
    description: string;
    occurredAt: string;
  }>;
}

interface PipelineAccount {
  pipelineAccount: {
    id: string;
    pipelineId: string;
    accountId: string;
    funnelStage: string;
    priorityScore: number;
    readinessScore: number;
    engagementScore: number;
    totalTouchpoints: number;
    lastActivityAt: string | null;
    nextActionType: string | null;
    nextActionAt: string | null;
    assignedAeId: string | null;
  };
  accountName: string;
  accountIndustry: string | null;
  accountStaffCount: number | null;
}

const STAGE_COLORS: Record<string, string> = {
  target: 'bg-gray-100 text-gray-700',
  outreach: 'bg-blue-100 text-blue-700',
  engaged: 'bg-purple-100 text-purple-700',
  qualifying: 'bg-amber-100 text-amber-700',
  qualified: 'bg-cyan-100 text-cyan-700',
  appointment_set: 'bg-emerald-100 text-emerald-700',
  closed_won: 'bg-green-100 text-green-700',
  closed_lost: 'bg-red-100 text-red-700',
  on_hold: 'bg-gray-100 text-gray-500',
};

const STAGE_LABELS: Record<string, string> = {
  target: 'Target',
  outreach: 'Outreach',
  engaged: 'Engaged',
  qualifying: 'Qualifying',
  qualified: 'Qualified',
  appointment_set: 'Appointment Set',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  on_hold: 'On Hold',
};

export function UnifiedPipelineTab({ authHeaders, clientAccountId, organizationId }: UnifiedPipelineTabProps) {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<'board' | 'analytics'>('board');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all pipelines
  const { data: pipelines, isLoading: pipelinesLoading } = useQuery<PipelineSummary[]>({
    queryKey: ['unified-pipelines', clientAccountId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientAccountId) params.set('clientAccountId', clientAccountId);
      const res = await fetch(`/api/unified-pipelines?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to load pipelines');
      return res.json();
    },
  });

  // Fetch selected pipeline dashboard
  const { data: dashboard, isLoading: dashboardLoading } = useQuery<PipelineDashboard>({
    queryKey: ['unified-pipeline-dashboard', selectedPipelineId],
    queryFn: async () => {
      const res = await fetch(`/api/unified-pipelines/${selectedPipelineId}`, authHeaders);
      if (!res.ok) throw new Error('Failed to load pipeline dashboard');
      return res.json();
    },
    enabled: !!selectedPipelineId,
  });

  // Fetch accounts for selected pipeline
  const { data: accounts, isLoading: accountsLoading } = useQuery<PipelineAccount[]>({
    queryKey: ['unified-pipeline-accounts', selectedPipelineId],
    queryFn: async () => {
      const res = await fetch(`/api/unified-pipelines/${selectedPipelineId}/accounts`, authHeaders);
      if (!res.ok) throw new Error('Failed to load accounts');
      return res.json();
    },
    enabled: !!selectedPipelineId,
  });

  // Create pipeline mutation
  const createPipeline = useMutation({
    mutationFn: async (data: { name: string; description: string; objective: string }) => {
      const res = await apiRequest('POST', '/api/unified-pipelines', {
        ...data,
        clientAccountId,
        organizationId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Pipeline created', description: 'Your new pipeline has been created.' });
      queryClient.invalidateQueries({ queryKey: ['unified-pipelines'] });
      setSelectedPipelineId(data.id);
      setCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Generate strategy mutation
  const generateStrategy = useMutation({
    mutationFn: async (pipelineId: string) => {
      const res = await apiRequest('POST', `/api/unified-pipelines/${pipelineId}/generate-strategy`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Strategy generated', description: 'AI pipeline strategy has been generated from Organization Intelligence.' });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Create campaigns mutation
  const createCampaigns = useMutation({
    mutationFn: async (pipelineId: string) => {
      const res = await apiRequest('POST', `/api/unified-pipelines/${pipelineId}/create-campaigns`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Campaigns created', description: `${data.campaignIds?.length || 0} draft campaigns created.` });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Enroll accounts mutation
  const enrollAccounts = useMutation({
    mutationFn: async (pipelineId: string) => {
      const res = await apiRequest('POST', `/api/unified-pipelines/${pipelineId}/enroll-accounts`, {
        useCriteria: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Accounts enrolled', description: `${data.enrolled} accounts enrolled from ICP criteria.` });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-accounts', selectedPipelineId] });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (pipelinesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ── No pipelines yet — show creation prompt ──
  if (!pipelines?.length) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Pipelines</h2>
            <p className="text-muted-foreground">
              Unified account-based pipelines powered by Organization Intelligence
            </p>
          </div>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Workflow className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Create Your First Pipeline</h3>
              <p className="text-muted-foreground max-w-md">
                A Pipeline groups multiple campaigns (voice, email, content) under one unified strategy.
                AI generates the strategy from your Organization Intelligence, creates draft campaigns,
                and enrolls target accounts automatically.
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Pipeline
            </Button>
          </CardContent>
        </Card>
        <CreatePipelineDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={(data) => createPipeline.mutate(data)}
          isLoading={createPipeline.isPending}
        />
      </div>
    );
  }

  // ── Pipeline list (no pipeline selected) ──
  if (!selectedPipelineId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Pipelines</h2>
            <p className="text-muted-foreground">
              {pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''} active
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Pipeline
          </Button>
        </div>

        <div className="grid gap-4">
          {pipelines.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedPipelineId(p.id)}
            >
              <CardContent className="flex items-center justify-between p-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{p.name}</h3>
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                      {p.status}
                    </Badge>
                  </div>
                  {p.objective && (
                    <p className="text-sm text-muted-foreground">{p.objective}</p>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    <span>{p.totalAccounts} accounts</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Target className="h-4 w-4" />
                    <span>{p.totalCampaigns} campaigns</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{p.appointmentsSet} appointments</span>
                  </div>
                  <ChevronRight className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <CreatePipelineDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={(data) => createPipeline.mutate(data)}
          isLoading={createPipeline.isPending}
        />
      </div>
    );
  }

  // ── Selected pipeline view ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedPipelineId(null)}>
            ← Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{dashboard?.pipeline.name || 'Loading...'}</h2>
              {dashboard && (
                <Badge variant={dashboard.pipeline.status === 'active' ? 'default' : 'secondary'}>
                  {dashboard.pipeline.status}
                </Badge>
              )}
            </div>
            {dashboard?.pipeline.objective && (
              <p className="text-sm text-muted-foreground">{dashboard.pipeline.objective}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateStrategy.mutate(selectedPipelineId)}
            disabled={generateStrategy.isPending}
          >
            {generateStrategy.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate Strategy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createCampaigns.mutate(selectedPipelineId)}
            disabled={createCampaigns.isPending}
          >
            {createCampaigns.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Campaigns
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => enrollAccounts.mutate(selectedPipelineId)}
            disabled={enrollAccounts.isPending}
          >
            {enrollAccounts.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="mr-2 h-4 w-4" />
            )}
            Enroll Accounts
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Accounts</div>
              <div className="text-2xl font-bold">{dashboard.funnel.totalAccounts}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Active</div>
              <div className="text-2xl font-bold">{dashboard.funnel.activeAccounts}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Appointments</div>
              <div className="text-2xl font-bold text-emerald-600">{dashboard.funnel.appointmentsSet}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Closed Won</div>
              <div className="text-2xl font-bold text-green-600">{dashboard.funnel.closedWon}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Conversion Rate</div>
              <div className="text-2xl font-bold">{dashboard.funnel.conversionRate}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Funnel Board */}
      {dashboard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account Funnel</CardTitle>
            <CardDescription>Account progression through pipeline stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dashboard.funnel.stageDistribution
                .filter((s) => !['on_hold'].includes(s.stageId))
                .map((stage, idx, arr) => (
                  <div key={stage.stageId} className="flex items-center gap-1">
                    <div className="flex flex-col items-center min-w-[100px]">
                      <Badge className={STAGE_COLORS[stage.stageId] || 'bg-gray-100'}>
                        {stage.stageName}
                      </Badge>
                      <div className="text-2xl font-bold mt-1">{stage.count}</div>
                      <div className="text-xs text-muted-foreground">{stage.percentage}%</div>
                      <Progress value={stage.percentage} className="h-1.5 w-full mt-1" />
                    </div>
                    {idx < arr.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account List by Stage */}
      {accounts && accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Accounts</CardTitle>
            <CardDescription>{accounts.length} accounts in pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {accounts.slice(0, 20).map((a) => (
                <div
                  key={a.pipelineAccount.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-primary/10 p-2">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{a.accountName}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.accountIndustry || 'Unknown industry'}
                        {a.accountStaffCount ? ` · ${a.accountStaffCount} employees` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={STAGE_COLORS[a.pipelineAccount.funnelStage] || 'bg-gray-100'}>
                      {STAGE_LABELS[a.pipelineAccount.funnelStage] || a.pipelineAccount.funnelStage}
                    </Badge>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {a.pipelineAccount.priorityScore}/100
                    </div>
                    {a.pipelineAccount.nextActionType && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        {a.pipelineAccount.nextActionType === 'callback' ? (
                          <Phone className="h-3 w-3" />
                        ) : (
                          <Mail className="h-3 w-3" />
                        )}
                        Next: {a.pipelineAccount.nextActionType}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaigns */}
      {dashboard && dashboard.campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Linked Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.campaigns.map((c) => (
                <div key={c.campaignId} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.campaignType}</Badge>
                    <span className="font-medium">{c.campaignName}</span>
                  </div>
                  <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                    {c.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {dashboard && dashboard.recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboard.recentActivity.map((activity, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="rounded-full bg-muted p-1.5 mt-0.5">
                    {activity.type === 'callback' ? (
                      <Phone className="h-3 w-3" />
                    ) : activity.type === 'email' ? (
                      <Mail className="h-3 w-3" />
                    ) : activity.type === 'stage_change' ? (
                      <ArrowRight className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                  </div>
                  <div>
                    <span className="font-medium">{activity.accountName}</span>
                    <span className="text-muted-foreground"> — {activity.description}</span>
                    <div className="text-xs text-muted-foreground">
                      {new Date(activity.occurredAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Create Pipeline Dialog ──────────────────────────────────────────────────

function CreatePipelineDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description: string; objective: string }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Pipeline</DialogTitle>
          <DialogDescription>
            Create a unified account-based pipeline. AI will generate the strategy from your
            Organization Intelligence and auto-create draft campaigns.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Pipeline Name</Label>
            <Input
              id="name"
              placeholder="e.g., Q1 2026 — Enterprise CISO Outreach"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="objective">Objective</Label>
            <Input
              id="objective"
              placeholder="e.g., Book 50 qualified meetings with CISOs"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this pipeline's goals..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ name, description, objective })}
            disabled={!name.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
