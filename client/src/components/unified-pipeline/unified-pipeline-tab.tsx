/**
 * Unified Pipeline Tab — Pipeline management + Engagement Triggers in one controlled view.
 *
 * Sections:
 *   1. Pipelines  — list → detail (funnel board, accounts, campaigns, recent activity)
 *   2. Actions    — scheduled/completed pipeline action queue
 *   3. Analytics  — funnel velocity, action breakdown, stage progression
 *   4. Engagement Triggers — cross-channel automation with governance visibility
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { EngagementTriggersTab } from "@/components/client-portal/engagement-triggers";
import {
  Plus, Workflow, Building2, Target, TrendingUp, Loader2, Sparkles,
  ArrowRight, Calendar, Phone, Mail, Clock, ChevronRight, Zap,
  BarChart3, Activity, CheckCircle2, XCircle, RefreshCw,
  User, Tag, Info, ListChecks, Eye, ChevronLeft,
  Download, UserCheck, Search, AlertCircle,
} from "lucide-react";
import {
  UNIFIED_PIPELINE_FUNNEL_STAGES,
  type PipelineDashboard,
  type PipelineAccountDetail,
} from "@shared/unified-pipeline-types";

// ─── Props ───────────────────────────────────────────────────────────────────

interface UnifiedPipelineTabProps {
  authHeaders: { headers: { Authorization: string } };
  clientAccountId?: string;
  organizationId?: string;
}

// ─── API Types ────────────────────────────────────────────────────────────────

// PipelineDashboard and PipelineAccountDetail are imported from @shared/unified-pipeline-types

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

interface PipelineAnalytics {
  pipeline: { id: string; name: string; status: string; objective?: string; createdAt: string };
  funnel: {
    stageDistribution: Array<{ stageId: string; stageName: string; count: number; percentage: number }>;
    totalAccounts: number; activeAccounts: number; appointmentsSet: number;
    closedWon: number; closedLost: number; conversionRate: number;
  };
  campaigns: Array<{ campaignId: string; campaignName: string; campaignType: string; status: string }>;
  recentActivity: Array<{ type: string; accountName: string; description: string; occurredAt: string }>;
  actionStats: Array<{ actionType: string; status: string; cnt: number }>;
  stageProgression: Array<{ previousStage: string | null; cnt: number }>;
}

interface PipelineActionsData {
  actions: Array<{
    id: string; actionType: string; status: string; title?: string; description?: string;
    scheduledAt?: string; executedAt?: string; completedAt?: string;
    outcome?: string; executionMethod?: string; linkedEntityType?: string;
    pipelineAccountId: string; contactId?: string; sourceCampaignId?: string;
    createdAt: string;
  }>;
  total: number;
}

interface InboxAnalysisResult {
  summary: {
    lookbackMonths: number; linkedCampaigns: number; matchedCampaigns: number;
    scannedMessages: number; scannedConversations: number; opportunityThreads: number;
    opportunityAccounts: number; createdAccounts: number; updatedAccounts: number;
    createdContacts: number; updatedContacts: number; createdPipelineAccounts: number;
    updatedPipelineAccounts: number; createdPipelineContacts: number; updatedPipelineContacts: number;
    createdActions: number;
  };
  accounts: Array<{
    accountId: string; accountName: string; accountDomain: string;
    primaryContact: { id: string; email: string; fullName: string; jobTitle: string | null };
    relatedContacts: Array<{ id: string; email: string; fullName: string; jobTitle: string | null }>;
    funnelStage: string; confidence: number; engagementScore: number;
    readinessScore: number; priorityScore: number;
    nextAction: { type: 'callback' | 'email' | 'note'; scheduledAt: string };
    matchedCampaigns: Array<{ id: string; name: string; score: number; reasons: string[] }>;
    supportingConversationIds: string[]; signals: string[]; serviceThemes: string[];
    summary: string; recommendation: string; lastActivityAt: string;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  target: 'bg-gray-100 text-gray-700 border-gray-200',
  outreach: 'bg-blue-100 text-blue-700 border-blue-200',
  engaged: 'bg-purple-100 text-purple-700 border-purple-200',
  qualifying: 'bg-amber-100 text-amber-700 border-amber-200',
  qualified: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  appointment_set: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed_won: 'bg-green-100 text-green-700 border-green-200',
  closed_lost: 'bg-red-100 text-red-700 border-red-200',
  on_hold: 'bg-gray-100 text-gray-500 border-gray-200',
};

const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  UNIFIED_PIPELINE_FUNNEL_STAGES.map((s) => [s.id, s.name])
);

const FUNNEL_STAGE_ORDER = UNIFIED_PIPELINE_FUNNEL_STAGES.map((s) => s.id);

const ACTION_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-500',
};

const ACTION_ICONS: Record<string, typeof Phone> = {
  callback: Phone, email: Mail, note: ListChecks,
  stage_change: ArrowRight, sms: Mail,
};

function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STAGE_COLORS[stage] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

// ─── Section Nav ──────────────────────────────────────────────────────────────

type Section = 'pipelines' | 'actions' | 'analytics' | 'triggers' | 'leads';

const SECTIONS: { id: Section; label: string; icon: typeof Workflow }[] = [
  { id: 'pipelines', label: 'Pipelines', icon: Workflow },
  { id: 'actions', label: 'Action Queue', icon: ListChecks },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'triggers', label: 'Engagement Triggers', icon: Zap },
  { id: 'leads', label: 'Leads & Export', icon: Download },
];

function SectionNav({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  return (
    <div className="flex items-center gap-1 border-b pb-3 mb-4 flex-wrap">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Leads Section ────────────────────────────────────────────────────────────

interface LeadRow {
  id: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  accountName: string;
  accountIndustry: string;
  campaignName: string;
  aiScore: string;
  qaStatus: string;
  aiQualificationStatus: string;
  createdAt: string;
}

function LeadsSection({ authHeaders }: { authHeaders: { headers: { Authorization: string } } }) {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-leads'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });

  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['client-portal-potential-leads-all', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/potential-leads?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
  });

  const allLeads: LeadRow[] = leadsData || [];
  const filteredLeads = allLeads.filter((lead) => {
    if (statusFilter === 'qualified' && !['approved', 'published'].includes(lead.qaStatus)) return false;
    if (statusFilter === 'pending' && lead.qaStatus !== 'pending') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        (lead.contactName || '').toLowerCase().includes(term) ||
        (lead.contactEmail || '').toLowerCase().includes(term) ||
        (lead.accountName || '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      if (statusFilter === 'qualified') params.append('status', 'qualified');

      const res = await fetch(`/api/client-portal/leads/export?${params}`, authHeaders);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast({ title: 'Export complete', description: 'Your leads have been exported to CSV.' });
    } catch {
      toast({ title: 'Export failed', description: 'Unable to export leads. Please try again.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const qualifiedCount = allLeads.filter(l => ['approved', 'published'].includes(l.qaStatus)).length;

  return (
    <div className="space-y-4">
      {/* Header with export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-sm">
            <Download className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Leads & Export</h3>
            <p className="text-xs text-muted-foreground">View, search, and export your campaign leads</p>
          </div>
        </div>
        <Button size="sm" onClick={handleExport} disabled={exporting || allLeads.length === 0} className="gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <User className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Leads</p>
                <p className="text-xl font-bold">{allLeads.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <UserCheck className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Qualified</p>
                <p className="text-xl font-bold">{qualifiedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Search className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Showing</p>
                <p className="text-xl font-bold">{filteredLeads.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Campaign</label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger className="w-[220px] h-8 text-sm">
                  <SelectValue placeholder="All Campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] h-8 text-sm">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Leads</SelectItem>
                  <SelectItem value="qualified">Qualified Only</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Search by name, email, or account..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-[260px] h-8 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">Leads</CardTitle>
          <CardDescription className="text-xs">{filteredLeads.length} leads matching your filters</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No leads found matching your filters</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">AI Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{lead.contactName || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{lead.contactEmail || ''}</p>
                          {lead.contactPhone && <p className="text-xs text-muted-foreground/60">{lead.contactPhone}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{lead.accountName || '—'}</p>
                          {lead.accountIndustry && <p className="text-xs text-muted-foreground">{lead.accountIndustry}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{lead.campaignName}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={Number(lead.aiScore) >= 70 ? 'bg-green-500/10 text-green-600' : Number(lead.aiScore) >= 50 ? 'bg-amber-500/10 text-amber-600' : 'bg-gray-500/10 text-gray-600'}>
                          {lead.aiScore || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={['approved', 'published'].includes(lead.qaStatus) ? 'default' : 'outline'} className="capitalize text-xs">
                          {(lead.qaStatus || 'pending').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Account Detail Panel ─────────────────────────────────────────────────────

function AccountDetailPanel({
  pipelineId, pipelineAccountId, authHeaders, onClose, onStageChange,
}: {
  pipelineId: string;
  pipelineAccountId: string;
  authHeaders: { headers: { Authorization: string } };
  onClose: () => void;
  onStageChange: (id: string, stage: string) => void;
}) {
  const { data: detail, isLoading } = useQuery<PipelineAccountDetail>({
    queryKey: ['pipeline-account-detail', pipelineAccountId],
    queryFn: async () => {
      const res = await fetch(`/api/unified-pipelines/${pipelineId}/accounts/${pipelineAccountId}`, authHeaders);
      if (!res.ok) throw new Error('Failed to load account detail');
      return res.json();
    },
  });

  const [newStage, setNewStage] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();

  const stageChangeMutation = useMutation({
    mutationFn: async (stage: string) => {
      const res = await fetch(`/api/unified-pipelines/${pipelineId}/accounts/${pipelineAccountId}`, {
        method: 'PATCH',
        headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnelStage: stage }),
      });
      if (!res.ok) throw new Error('Stage update failed');
      return res.json();
    },
    onSuccess: (_, stage) => {
      toast({ title: 'Stage updated', description: `Moved to ${STAGE_LABELS[stage] || stage}` });
      onStageChange(pipelineAccountId, stage);
      qc.invalidateQueries({ queryKey: ['pipeline-account-detail', pipelineAccountId] });
      qc.invalidateQueries({ queryKey: ['unified-pipeline-accounts'] });
      qc.invalidateQueries({ queryKey: ['unified-pipeline-dashboard'] });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-background border-l shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{detail?.account.name || 'Account Detail'}</span>
          {detail && <StageBadge stage={detail.account.funnelStage} />}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><XCircle className="h-4 w-4" /></Button>
      </div>

      <ScrollArea className="flex-1 px-5 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : detail ? (
          <div className="space-y-6">
            {/* Scores */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Priority', value: detail.account.priorityScore, color: 'text-amber-600' },
                { label: 'Readiness', value: detail.account.readinessScore, color: 'text-blue-600' },
                { label: 'Engagement', value: detail.account.engagementScore, color: 'text-purple-600' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-3 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  <Progress value={s.value} className="h-1 mt-2" />
                </div>
              ))}
            </div>

            {/* Meta */}
            <div className="space-y-1.5 text-sm">
              {detail.account.industry && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Tag className="h-3.5 w-3.5" />
                  <span>{detail.account.industry}</span>
                  {detail.account.employeeCount && <span>· {detail.account.employeeCount} employees</span>}
                </div>
              )}
              {detail.account.assignedAeName && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span>AE: {detail.account.assignedAeName}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                <span>{detail.account.totalTouchpoints} touchpoints</span>
                {detail.account.lastActivityAt && <span>· Last: {fmtDate(detail.account.lastActivityAt)}</span>}
              </div>
            </div>

            {/* Move Stage */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Move Stage</Label>
              <div className="flex gap-2">
                <Select value={newStage || detail.account.funnelStage} onValueChange={setNewStage}>
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUNNEL_STAGE_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>{STAGE_LABELS[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!newStage || newStage === detail.account.funnelStage || stageChangeMutation.isPending}
                  onClick={() => newStage && stageChangeMutation.mutate(newStage)}
                >
                  {stageChangeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Move'}
                </Button>
              </div>
            </div>

            {/* Next Action */}
            {detail.nextAction && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Scheduled Next Action
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{detail.nextAction.actionType}</Badge>
                  {detail.nextAction.scheduledAt && (
                    <span className="text-xs text-muted-foreground">{fmtDate(detail.nextAction.scheduledAt)}</span>
                  )}
                </div>
                {detail.nextAction.reasoning && (
                  <p className="text-xs text-muted-foreground mt-1">{detail.nextAction.reasoning}</p>
                )}
                {detail.nextAction.suggestedContent && (
                  <div className="mt-2 p-2 rounded bg-muted/50 text-xs">{detail.nextAction.suggestedContent}</div>
                )}
              </div>
            )}

            {/* Contacts */}
            {detail.contacts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contacts ({detail.contacts.length})</Label>
                {detail.contacts.map((c) => (
                  <div key={c.id} className="flex items-start justify-between rounded-lg border p-2.5 text-sm">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      {c.jobTitle && <div className="text-xs text-muted-foreground">{c.jobTitle}</div>}
                      {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <Badge variant="outline" className="text-[10px]">{c.engagementLevel}</Badge>
                      {c.totalAttempts > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-1">{c.totalAttempts} attempts</div>
                      )}
                      {c.lastDisposition && (
                        <div className="text-[10px] text-muted-foreground capitalize">{c.lastDisposition.replace(/_/g, ' ')}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline */}
            {detail.timeline.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity Timeline</Label>
                <div className="space-y-2">
                  {detail.timeline.slice(0, 15).map((event, i) => {
                    const Icon = ACTION_ICONS[event.type] || Activity;
                    return (
                      <div key={i} className="flex items-start gap-2.5 text-sm">
                        <div className="mt-0.5 rounded-full bg-muted p-1 shrink-0">
                          <Icon className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-muted-foreground">{event.description}</span>
                          <div className="text-[10px] text-muted-foreground/70 mt-0.5">{fmtDate(event.occurredAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No data available.</p>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Actions Queue Panel ──────────────────────────────────────────────────────

function ActionsQueuePanel({
  pipelineId, authHeaders,
}: {
  pipelineId: string | null;
  authHeaders: { headers: { Authorization: string } };
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<PipelineActionsData>({
    queryKey: ['pipeline-actions', pipelineId, statusFilter, page],
    queryFn: async () => {
      if (!pipelineId) return { actions: [], total: 0 };
      const params = new URLSearchParams({
        page: String(page), pageSize: String(pageSize),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      });
      const res = await fetch(`/api/unified-pipelines/${pipelineId}/actions?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to load actions');
      return res.json();
    },
    enabled: !!pipelineId,
    staleTime: 15_000,
  });

  if (!pipelineId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <ListChecks className="h-10 w-10 opacity-30" />
        <p className="font-medium">Select a pipeline to view its action queue</p>
        <p className="text-sm">Go to Pipelines and open a pipeline first</p>
      </div>
    );
  }

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Action Queue</h3>
          <p className="text-sm text-muted-foreground">Scheduled and completed pipeline actions — executed every 30s by the worker</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['all', 'scheduled', 'in_progress', 'completed', 'failed', 'skipped'].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s === 'all' ? 'All Status' : s.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => qc.invalidateQueries({ queryKey: ['pipeline-actions', pipelineId] })}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (data?.actions?.length ?? 0) === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium text-sm">No actions found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Executed</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.actions.map((action) => {
                    const Icon = ACTION_ICONS[action.actionType] || Activity;
                    return (
                      <TableRow key={action.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm capitalize">{action.actionType.replace('_', ' ')}</span>
                          </div>
                          {action.title && <div className="text-xs text-muted-foreground truncate max-w-[140px]">{action.title}</div>}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ACTION_STATUS_COLORS[action.status] || 'bg-gray-100 text-gray-600'}`}>
                            {action.status.replace('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(action.scheduledAt)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(action.executedAt)}</TableCell>
                        <TableCell className="text-xs capitalize">{action.executionMethod || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">{action.outcome || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t">
                  <span className="text-xs text-muted-foreground">Page {page} of {totalPages} · {data?.total} total</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────

function AnalyticsPanel({
  pipelineId, authHeaders,
}: {
  pipelineId: string | null;
  authHeaders: { headers: { Authorization: string } };
}) {
  const { data, isLoading } = useQuery<PipelineAnalytics>({
    queryKey: ['pipeline-analytics', pipelineId],
    queryFn: async () => {
      const res = await fetch(`/api/unified-pipelines/${pipelineId}/analytics`, authHeaders);
      if (!res.ok) throw new Error('Failed to load analytics');
      return res.json();
    },
    enabled: !!pipelineId,
    staleTime: 60_000,
  });

  if (!pipelineId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <BarChart3 className="h-10 w-10 opacity-30" />
        <p className="font-medium">Select a pipeline to view analytics</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  if (!data) return <p className="text-muted-foreground text-sm">No analytics data.</p>;

  // Aggregate action stats
  const actionTotals: Record<string, { completed: number; failed: number; scheduled: number; total: number }> = {};
  for (const row of data.actionStats || []) {
    if (!actionTotals[row.actionType]) actionTotals[row.actionType] = { completed: 0, failed: 0, scheduled: 0, total: 0 };
    actionTotals[row.actionType][row.status as keyof typeof actionTotals[string]] = (actionTotals[row.actionType][row.status as keyof typeof actionTotals[string]] || 0) + Number(row.cnt);
    actionTotals[row.actionType].total += Number(row.cnt);
  }

  // Stage progression (accounts that advanced)
  const stageAdvances: Record<string, number> = {};
  for (const row of data.stageProgression || []) {
    if (row.previousStage) stageAdvances[row.previousStage] = Number(row.cnt);
  }

  const totalStageAdvances = Object.values(stageAdvances).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Accounts', value: data.funnel.totalAccounts, icon: Building2, color: 'text-foreground' },
          { label: 'Conversion Rate', value: `${data.funnel.conversionRate}%`, icon: TrendingUp, color: 'text-green-600' },
          { label: 'Appointments Set', value: data.funnel.appointmentsSet, icon: Calendar, color: 'text-emerald-600' },
          { label: 'Closed Won', value: data.funnel.closedWon, icon: CheckCircle2, color: 'text-green-700' },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">{kpi.label}</div>
                    <div className={`text-2xl font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</div>
                  </div>
                  <Icon className="h-7 w-7 text-muted-foreground/20" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Funnel distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funnel Distribution</CardTitle>
          <CardDescription>Accounts at each stage with advancement rates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.funnel.stageDistribution.filter((s) => s.count > 0 || stageAdvances[s.stageId] > 0).map((stage) => (
            <div key={stage.stageId} className="flex items-center gap-3">
              <div className="w-28 shrink-0">
                <StageBadge stage={stage.stageId} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{stage.count} accounts</span>
                  <span className="text-muted-foreground">{stage.percentage}%</span>
                </div>
                <Progress value={stage.percentage} className="h-2" />
              </div>
              {stageAdvances[stage.stageId] > 0 && (
                <div className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" />
                  {stageAdvances[stage.stageId]} advanced
                </div>
              )}
            </div>
          ))}
          {totalStageAdvances > 0 && (
            <div className="pt-2 text-xs text-muted-foreground border-t">
              {totalStageAdvances} total stage advancements recorded
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action breakdown */}
      {Object.keys(actionTotals).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Action Execution Breakdown</CardTitle>
            <CardDescription>Pipeline actions by type and execution status</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action Type</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Completed</TableHead>
                  <TableHead className="text-center">Scheduled</TableHead>
                  <TableHead className="text-center">Failed</TableHead>
                  <TableHead className="text-right">Success Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(actionTotals).map(([type, counts]) => {
                  const rate = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
                  const Icon = ACTION_ICONS[type] || Activity;
                  return (
                    <TableRow key={type}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm font-medium">{counts.total}</TableCell>
                      <TableCell className="text-center text-sm text-green-600">{counts.completed}</TableCell>
                      <TableCell className="text-center text-sm text-blue-600">{counts.scheduled}</TableCell>
                      <TableCell className="text-center text-sm text-red-500">{counts.failed}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={rate} className="w-16 h-1.5" />
                          <span className="text-xs font-medium w-8 text-right">{rate}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Campaigns */}
      {data.campaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Linked Campaigns ({data.campaigns.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.campaigns.map((c) => (
                  <TableRow key={c.campaignId}>
                    <TableCell className="text-sm font-medium">{c.campaignName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{c.campaignType}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-xs">{c.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function UnifiedPipelineTab({ authHeaders, clientAccountId, organizationId }: UnifiedPipelineTabProps) {
  const urlSection = new URLSearchParams(window.location.search).get('section');
  const validSections: Section[] = ['pipelines', 'actions', 'analytics', 'triggers', 'leads'];
  const initialSection = validSections.includes(urlSection as Section) ? (urlSection as Section) : 'pipelines';
  const [activeSection, setActiveSection] = useState<Section>(initialSection);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const [latestInboxAnalysis, setLatestInboxAnalysis] = useState<InboxAnalysisResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => { setLatestInboxAnalysis(null); }, [selectedPipelineId]);

  // ── Fetch pipelines ──
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

  // ── Fetch dashboard for selected pipeline ──
  const { data: dashboard } = useQuery<PipelineDashboard>({
    queryKey: ['unified-pipeline-dashboard', selectedPipelineId],
    queryFn: async () => {
      const res = await fetch(`/api/unified-pipelines/${selectedPipelineId}`, authHeaders);
      if (!res.ok) throw new Error('Failed to load pipeline dashboard');
      return res.json();
    },
    enabled: !!selectedPipelineId,
  });

  // ── Fetch accounts for selected pipeline ──
  const { data: accounts } = useQuery<PipelineAccount[]>({
    queryKey: ['unified-pipeline-accounts', selectedPipelineId],
    queryFn: async () => {
      const res = await fetch(`/api/unified-pipelines/${selectedPipelineId}/accounts?limit=25`, authHeaders);
      if (!res.ok) throw new Error('Failed to load accounts');
      return res.json();
    },
    enabled: !!selectedPipelineId,
  });

  // ── Mutations ──
  const createPipeline = useMutation({
    mutationFn: async (data: { name: string; description: string; objective: string }) => {
      const res = await apiRequest('POST', '/api/unified-pipelines', { ...data, clientAccountId, organizationId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Pipeline created' });
      queryClient.invalidateQueries({ queryKey: ['unified-pipelines'] });
      setSelectedPipelineId(data.id);
      setCreateDialogOpen(false);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const generateStrategy = useMutation({
    mutationFn: async (pipelineId: string) => {
      const res = await apiRequest('POST', `/api/unified-pipelines/${pipelineId}/generate-strategy`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Strategy generated', description: 'AI strategy from Organization Intelligence saved.' });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createCampaigns = useMutation({
    mutationFn: async (pipelineId: string) => {
      const res = await apiRequest('POST', `/api/unified-pipelines/${pipelineId}/create-campaigns`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Campaigns created', description: `${data.campaignIds?.length || 0} draft campaigns created.` });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const enrollAccounts = useMutation({
    mutationFn: async (pipelineId: string) => {
      const res = await apiRequest('POST', `/api/unified-pipelines/${pipelineId}/enroll-accounts`, { useCriteria: true });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Accounts enrolled', description: `${data.enrolled} accounts enrolled from ICP criteria.` });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-accounts', selectedPipelineId] });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const analyzeInbox = useMutation({
    mutationFn: async (pipelineId: string) => {
      const res = await apiRequest('POST', `/api/unified-pipelines/${pipelineId}/analyze-inbox`, {
        lookbackMonths: 6, limitConversations: 200, createFollowUps: true,
      });
      return res.json() as Promise<InboxAnalysisResult>;
    },
    onSuccess: (data) => {
      setLatestInboxAnalysis(data);
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
      queryClient.invalidateQueries({ queryKey: ['unified-pipeline-accounts', selectedPipelineId] });
      toast({
        title: 'Inbox analysis complete',
        description: `${data.summary.opportunityAccounts} opportunity account${data.summary.opportunityAccounts === 1 ? '' : 's'} pushed into the pipeline.`,
      });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Section: Leads ──
  if (activeSection === 'leads') {
    return (
      <div className="space-y-4">
        <SectionNav active={activeSection} onChange={setActiveSection} />
        <LeadsSection authHeaders={authHeaders} />
      </div>
    );
  }

  // ── Section: Triggers ──
  if (activeSection === 'triggers') {
    return (
      <div className="space-y-4">
        <SectionNav active={activeSection} onChange={setActiveSection} />
        {/* Governance info bar */}
        <Card className="border-amber-200/60 bg-amber-50/40">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-1.5 font-medium text-amber-800">
                <Info className="h-3.5 w-3.5" />
                Governance Rules
              </div>
              <span className="text-muted-foreground">Max 4 touches/account/day</span>
              <span className="text-muted-foreground">Business hours: 8 AM – 5 PM ET, Mon–Fri</span>
              <span className="text-muted-foreground">Stage-aware delays: Qualified → 5 min · Target → 2 hr</span>
              <span className="text-muted-foreground">Worker polls every 30s</span>
            </div>
          </CardContent>
        </Card>
        {clientAccountId && (
          <EngagementTriggersTab authHeaders={authHeaders} clientAccountId={clientAccountId} />
        )}
      </div>
    );
  }

  // ── Section: Actions queue ──
  if (activeSection === 'actions') {
    return (
      <div className="space-y-4">
        <SectionNav active={activeSection} onChange={setActiveSection} />
        {!selectedPipelineId && pipelines && pipelines.length > 0 && (
          <Card className="border-blue-200/60 bg-blue-50/30">
            <CardContent className="py-3 px-4 flex items-center gap-3 text-sm">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-muted-foreground">
                Showing all pipelines. Go to <button className="font-medium text-blue-600 hover:underline" onClick={() => setActiveSection('pipelines')}>Pipelines</button> and open one to filter actions for that pipeline.
              </span>
              {pipelines.length > 0 && (
                <Select onValueChange={(v) => setSelectedPipelineId(v)}>
                  <SelectTrigger className="h-7 text-xs w-44 ml-auto">
                    <SelectValue placeholder="Filter by pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        )}
        <ActionsQueuePanel pipelineId={selectedPipelineId} authHeaders={authHeaders} />
      </div>
    );
  }

  // ── Section: Analytics ──
  if (activeSection === 'analytics') {
    return (
      <div className="space-y-4">
        <SectionNav active={activeSection} onChange={setActiveSection} />
        {!selectedPipelineId && pipelines && pipelines.length > 0 && (
          <Card className="border-blue-200/60 bg-blue-50/30">
            <CardContent className="py-3 px-4 flex items-center gap-3 text-sm">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-muted-foreground">Select a pipeline to view its analytics</span>
              <Select onValueChange={(v) => setSelectedPipelineId(v)}>
                <SelectTrigger className="h-7 text-xs w-44 ml-auto">
                  <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}
        <AnalyticsPanel pipelineId={selectedPipelineId} authHeaders={authHeaders} />
      </div>
    );
  }

  // ── Section: Pipelines ──

  if (pipelinesLoading) {
    return (
      <div className="space-y-4">
        <SectionNav active={activeSection} onChange={setActiveSection} />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!pipelines?.length) {
    return (
      <div className="space-y-6">
        <SectionNav active={activeSection} onChange={setActiveSection} />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Pipelines</h2>
            <p className="text-muted-foreground">Unified account-based pipelines powered by Organization Intelligence</p>
          </div>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Workflow className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Create Your First Pipeline</h3>
              <p className="text-muted-foreground max-w-md text-sm">
                A Pipeline groups multiple campaigns (voice, email, content) under one unified strategy.
                AI generates the strategy from your Organization Intelligence and auto-enrolls target accounts.
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Create Pipeline
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

  if (!selectedPipelineId) {
    return (
      <div className="space-y-6">
        <SectionNav active={activeSection} onChange={setActiveSection} />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Pipelines</h2>
            <p className="text-muted-foreground">{pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''} active</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />New Pipeline
          </Button>
        </div>

        <div className="grid gap-3">
          {pipelines.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedPipelineId(p.id)}>
              <CardContent className="flex items-center justify-between p-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-xs">{p.status}</Badge>
                  </div>
                  {p.objective && <p className="text-sm text-muted-foreground">{p.objective}</p>}
                </div>
                <div className="flex items-center gap-5 text-sm text-muted-foreground shrink-0">
                  <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{p.totalAccounts}</div>
                  <div className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{p.totalCampaigns} campaigns</div>
                  <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{p.appointmentsSet} appts</div>
                  <ChevronRight className="h-4 w-4" />
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

  // ── Selected pipeline detail ──
  return (
    <div className="space-y-5">
      {detailAccountId && (
        <AccountDetailPanel
          pipelineId={selectedPipelineId}
          pipelineAccountId={detailAccountId}
          authHeaders={authHeaders}
          onClose={() => setDetailAccountId(null)}
          onStageChange={() => {
            queryClient.invalidateQueries({ queryKey: ['unified-pipeline-accounts', selectedPipelineId] });
            queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
          }}
        />
      )}

      <SectionNav active={activeSection} onChange={setActiveSection} />

      {/* Pipeline header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedPipelineId(null)}>
            <ChevronLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{dashboard?.pipeline.name || 'Loading...'}</h2>
              {dashboard && (
                <Badge variant={dashboard.pipeline.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                  {dashboard.pipeline.status}
                </Badge>
              )}
            </div>
            {dashboard?.pipeline.objective && (
              <p className="text-sm text-muted-foreground">{dashboard.pipeline.objective}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => generateStrategy.mutate(selectedPipelineId)} disabled={generateStrategy.isPending}>
            {generateStrategy.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Generate Strategy
          </Button>
          <Button variant="outline" size="sm" onClick={() => createCampaigns.mutate(selectedPipelineId)} disabled={createCampaigns.isPending}>
            {createCampaigns.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            Create Campaigns
          </Button>
          <Button variant="outline" size="sm" onClick={() => enrollAccounts.mutate(selectedPipelineId)} disabled={enrollAccounts.isPending}>
            {enrollAccounts.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Building2 className="mr-1.5 h-3.5 w-3.5" />}
            Enroll Accounts
          </Button>
          <Button size="sm" onClick={() => analyzeInbox.mutate(selectedPipelineId)} disabled={analyzeInbox.isPending}>
            {analyzeInbox.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
            Analyze Inbox
          </Button>
        </div>
      </div>

      {/* Inbox Capture info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />Inbox Capture
            </div>
            <p className="text-xs text-muted-foreground">
              Scans 6 months of primary inbox threads, creates or updates accounts and contacts, moves them into this pipeline, and queues follow-up actions against linked campaigns.
            </p>
          </div>
          <div className="flex gap-3 text-sm text-muted-foreground shrink-0">
            <span>{dashboard?.campaigns.length || 0} linked campaigns</span>
            <span>{dashboard?.funnel.totalAccounts || 0} accounts</span>
          </div>
        </CardContent>
      </Card>

      {/* Inbox analysis results */}
      {latestInboxAnalysis && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Inbox Analysis Results</CardTitle>
            <CardDescription>
              {latestInboxAnalysis.summary.opportunityAccounts} account{latestInboxAnalysis.summary.opportunityAccounts === 1 ? '' : 's'} detected from {latestInboxAnalysis.summary.scannedConversations} conversations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                { label: 'Messages scanned', value: latestInboxAnalysis.summary.scannedMessages },
                { label: 'Pipeline accounts', value: latestInboxAnalysis.summary.createdPipelineAccounts, sub: `${latestInboxAnalysis.summary.updatedPipelineAccounts} updated` },
                { label: 'Contacts managed', value: latestInboxAnalysis.summary.createdContacts + latestInboxAnalysis.summary.updatedContacts, sub: `${latestInboxAnalysis.summary.createdPipelineContacts} added to pipeline` },
                { label: 'Follow-ups queued', value: latestInboxAnalysis.summary.createdActions, sub: `${latestInboxAnalysis.summary.matchedCampaigns} campaign matches` },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
                  <div className="mt-1 text-2xl font-semibold">{s.value}</div>
                  {s.sub && <div className="text-xs text-muted-foreground">{s.sub}</div>}
                </div>
              ))}
            </div>

            {latestInboxAnalysis.accounts.length > 0 && (
              <div className="space-y-3">
                {latestInboxAnalysis.accounts.slice(0, 6).map((acct) => (
                  <div key={acct.accountId} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{acct.accountName}</span>
                          <StageBadge stage={acct.funnelStage} />
                          <Badge variant="outline" className="text-xs">{acct.accountDomain}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{acct.primaryContact.fullName} · {acct.primaryContact.email}</div>
                        <p className="text-sm">{acct.summary}</p>
                        <p className="text-xs text-muted-foreground">{acct.recommendation}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            Next: {acct.nextAction.type} · {new Date(acct.nextAction.scheduledAt).toLocaleDateString()}
                          </Badge>
                          {acct.serviceThemes.slice(0, 3).map((t) => (
                            <Badge key={t} variant="outline" className="text-xs">{t.replace(/_/g, ' ')}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm md:min-w-[200px]">
                        {[['Confidence', acct.confidence], ['Engagement', acct.engagementScore], ['Priority', acct.priorityScore]].map(([k, v]) => (
                          <div key={k} className="rounded-lg bg-muted p-2 text-center">
                            <div className="text-[10px] text-muted-foreground">{k}</div>
                            <div className="font-semibold">{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI row */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Accounts', value: dashboard.funnel.totalAccounts },
            { label: 'Active', value: dashboard.funnel.activeAccounts },
            { label: 'Appointments', value: dashboard.funnel.appointmentsSet, className: 'text-emerald-600' },
            { label: 'Closed Won', value: dashboard.funnel.closedWon, className: 'text-green-600' },
            { label: 'Conversion', value: `${dashboard.funnel.conversionRate}%`, className: 'text-blue-600' },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
                <div className={`text-2xl font-bold mt-0.5 ${kpi.className || ''}`}>{kpi.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Funnel board */}
      {dashboard && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Account Funnel</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setActiveSection('analytics')}>
                <BarChart3 className="h-3.5 w-3.5" />Full Analytics
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dashboard.funnel.stageDistribution
                .filter((s) => !['on_hold'].includes(s.stageId))
                .map((stage, idx, arr) => (
                  <div key={stage.stageId} className="flex items-center gap-1">
                    <div className="flex flex-col items-center min-w-[90px]">
                      <StageBadge stage={stage.stageId} />
                      <div className="text-2xl font-bold mt-1">{stage.count}</div>
                      <div className="text-xs text-muted-foreground">{stage.percentage}%</div>
                      <Progress value={stage.percentage} className="h-1.5 w-full mt-1" />
                    </div>
                    {idx < arr.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account list */}
      {accounts && accounts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Pipeline Accounts</CardTitle>
                <CardDescription>{accounts.length} accounts enrolled</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => queryClient.invalidateQueries({ queryKey: ['unified-pipeline-accounts', selectedPipelineId] })}>
                <RefreshCw className="h-3.5 w-3.5" />Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-center">Priority</TableHead>
                  <TableHead className="text-center">Touchpoints</TableHead>
                  <TableHead>Next Action</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.pipelineAccount.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="font-medium text-sm">{a.accountName}</div>
                      {a.accountIndustry && <div className="text-xs text-muted-foreground">{a.accountIndustry}{a.accountStaffCount ? ` · ${a.accountStaffCount}` : ''}</div>}
                    </TableCell>
                    <TableCell><StageBadge stage={a.pipelineAccount.funnelStage} /></TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium">{a.pipelineAccount.priorityScore}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm">{a.pipelineAccount.totalTouchpoints}</TableCell>
                    <TableCell>
                      {a.pipelineAccount.nextActionType ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {a.pipelineAccount.nextActionType === 'callback' ? <Phone className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                          <span className="capitalize">{a.pipelineAccount.nextActionType}</span>
                          {a.pipelineAccount.nextActionAt && <span>· {fmtDate(a.pipelineAccount.nextActionAt)}</span>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setDetailAccountId(a.pipelineAccount.id)}>
                        <Eye className="h-3.5 w-3.5" />View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Campaigns */}
      {dashboard && dashboard.campaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Linked Campaigns ({dashboard.campaigns.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.campaigns.map((c) => (
                  <TableRow key={c.campaignId}>
                    <TableCell className="font-medium text-sm">{c.campaignName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{c.campaignType}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-xs">{c.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {dashboard && dashboard.recentActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setActiveSection('actions')}>
                <ListChecks className="h-3.5 w-3.5" />Full Action Queue
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {dashboard.recentActivity.map((activity, i) => {
                const Icon = ACTION_ICONS[activity.type] || Activity;
                return (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <div className="rounded-full bg-muted p-1.5 mt-0.5 shrink-0">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div>
                      <span className="font-medium">{activity.accountName}</span>
                      <span className="text-muted-foreground"> — {activity.description}</span>
                      <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(activity.occurredAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create pipeline dialog */}
      <CreatePipelineDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={(data) => createPipeline.mutate(data)}
        isLoading={createPipeline.isPending}
      />
    </div>
  );
}

// ─── Create Pipeline Dialog ───────────────────────────────────────────────────

function CreatePipelineDialog({
  open, onOpenChange, onSubmit, isLoading,
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
            AI will generate the strategy from your Organization Intelligence and auto-create draft campaigns.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Pipeline Name</Label>
            <Input id="name" placeholder="e.g., Q1 2026 — Enterprise CISO Outreach" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="objective">Objective</Label>
            <Input id="objective" placeholder="e.g., Book 50 qualified meetings with CISOs" value={objective} onChange={(e) => setObjective(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" placeholder="Brief description of this pipeline's goals..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit({ name, description, objective })} disabled={!name.trim() || isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
