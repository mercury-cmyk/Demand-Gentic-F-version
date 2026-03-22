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
    stageDistribution: Array;
    totalAccounts: number; activeAccounts: number; appointmentsSet: number;
    closedWon: number; closedLost: number; conversionRate: number;
  };
  campaigns: Array;
  recentActivity: Array;
  actionStats: Array;
  stageProgression: Array;
}

interface PipelineActionsData {
  actions: Array;
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
  accounts: Array;
    funnelStage: string; confidence: number; engagementScore: number;
    readinessScore: number; priorityScore: number;
    nextAction: { type: 'callback' | 'email' | 'note'; scheduledAt: string };
    matchedCampaigns: Array;
    supportingConversationIds: string[]; signals: string[]; serviceThemes: string[];
    summary: string; recommendation: string; lastActivityAt: string;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record = {
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

const STAGE_LABELS: Record = Object.fromEntries(
  UNIFIED_PIPELINE_FUNNEL_STAGES.map((s) => [s.id, s.name])
);

const FUNNEL_STAGE_ORDER = UNIFIED_PIPELINE_FUNNEL_STAGES.map((s) => s.id);

const ACTION_STATUS_COLORS: Record = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-500',
};

const ACTION_ICONS: Record = {
  callback: Phone, email: Mail, note: ListChecks,
  stage_change: ArrowRight, sms: Mail,
};

function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function StageBadge({ stage }: { stage: string }) {
  return (
    
      {STAGE_LABELS[stage] || stage}
    
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
    
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
           onChange(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            
            {s.label}
          
        );
      })}
    
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
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
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
    
      {/* Header with export */}
      
        
          
            
          
          
            Leads & Export
            View, search, and export your campaign leads
          
        
        
          {exporting ?  : }
          Export CSV
        
      

      {/* Stats */}
      
        
          
            
              
                
              
              
                Total Leads
                {allLeads.length}
              
            
          
        
        
          
            
              
                
              
              
                Qualified
                {qualifiedCount}
              
            
          
        
        
          
            
              
                
              
              
                Showing
                {filteredLeads.length}
              
            
          
        
      

      {/* Filters */}
      
        
          
            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((c: any) => (
                    {c.name}
                  ))}
                
              
            
            
              Status
              
                
                  
                
                
                  All Leads
                  Qualified Only
                  Pending
                
              
            
             setSearchTerm(e.target.value)}
              className="w-[260px] h-8 text-sm"
            />
          
        
      

      {/* Leads Table */}
      
        
          Leads
          {filteredLeads.length} leads matching your filters
        
        
          {isLoading ? (
            
              
            
          ) : filteredLeads.length === 0 ? (
            
              
              No leads found matching your filters
            
          ) : (
            
              
                
                  
                    Contact
                    Account
                    Campaign
                    AI Score
                    Status
                    Date
                  
                
                
                  {filteredLeads.map((lead) => (
                    
                      
                        
                          {lead.contactName || 'Unknown'}
                          {lead.contactEmail || ''}
                          {lead.contactPhone && {lead.contactPhone}}
                        
                      
                      
                        
                          {lead.accountName || '—'}
                          {lead.accountIndustry && {lead.accountIndustry}}
                        
                      
                      
                        {lead.campaignName}
                      
                      
                        = 70 ? 'bg-green-500/10 text-green-600' : Number(lead.aiScore) >= 50 ? 'bg-amber-500/10 text-amber-600' : 'bg-gray-500/10 text-gray-600'}>
                          {lead.aiScore || '—'}
                        
                      
                      
                        
                          {(lead.qaStatus || 'pending').replace(/_/g, ' ')}
                        
                      
                      
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
                      
                    
                  ))}
                
              
            
          )}
        
      
    
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
  const { data: detail, isLoading } = useQuery({
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
    
      {/* Header */}
      
        
          
          {detail?.account.name || 'Account Detail'}
          {detail && }
        
        
      

      
        {isLoading ? (
          
            {[...Array(6)].map((_, i) => )}
          
        ) : detail ? (
          
            {/* Scores */}
            
              {[
                { label: 'Priority', value: detail.account.priorityScore, color: 'text-amber-600' },
                { label: 'Readiness', value: detail.account.readinessScore, color: 'text-blue-600' },
                { label: 'Engagement', value: detail.account.engagementScore, color: 'text-purple-600' },
              ].map((s) => (
                
                  {s.value}
                  {s.label}
                  
                
              ))}
            

            {/* Meta */}
            
              {detail.account.industry && (
                
                  
                  {detail.account.industry}
                  {detail.account.employeeCount && · {detail.account.employeeCount} employees}
                
              )}
              {detail.account.assignedAeName && (
                
                  
                  AE: {detail.account.assignedAeName}
                
              )}
              
                
                {detail.account.totalTouchpoints} touchpoints
                {detail.account.lastActivityAt && · Last: {fmtDate(detail.account.lastActivityAt)}}
              
            

            {/* Move Stage */}
            
              Move Stage
              
                
                  
                    
                  
                  
                    {FUNNEL_STAGE_ORDER.map((s) => (
                      {STAGE_LABELS[s] || s}
                    ))}
                  
                
                 newStage && stageChangeMutation.mutate(newStage)}
                >
                  {stageChangeMutation.isPending ?  : 'Move'}
                
              
            

            {/* Next Action */}
            {detail.nextAction && (
              
                
                   Scheduled Next Action
                
                
                  {detail.nextAction.actionType}
                  {detail.nextAction.scheduledAt && (
                    {fmtDate(detail.nextAction.scheduledAt)}
                  )}
                
                {detail.nextAction.reasoning && (
                  {detail.nextAction.reasoning}
                )}
                {detail.nextAction.suggestedContent && (
                  {detail.nextAction.suggestedContent}
                )}
              
            )}

            {/* Contacts */}
            {detail.contacts.length > 0 && (
              
                Contacts ({detail.contacts.length})
                {detail.contacts.map((c) => (
                  
                    
                      {c.name}
                      {c.jobTitle && {c.jobTitle}}
                      {c.email && {c.email}}
                    
                    
                      {c.engagementLevel}
                      {c.totalAttempts > 0 && (
                        {c.totalAttempts} attempts
                      )}
                      {c.lastDisposition && (
                        {c.lastDisposition.replace(/_/g, ' ')}
                      )}
                    
                  
                ))}
              
            )}

            {/* Timeline */}
            {detail.timeline.length > 0 && (
              
                Activity Timeline
                
                  {detail.timeline.slice(0, 15).map((event, i) => {
                    const Icon = ACTION_ICONS[event.type] || Activity;
                    return (
                      
                        
                          
                        
                        
                          {event.description}
                          {fmtDate(event.occurredAt)}
                        
                      
                    );
                  })}
                
              
            )}
          
        ) : (
          No data available.
        )}
      
    
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

  const { data, isLoading } = useQuery({
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
      
        
        Select a pipeline to view its action queue
        Go to Pipelines and open a pipeline first
      
    );
  }

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  return (
    
      
        
          Action Queue
          Scheduled and completed pipeline actions — executed every 30s by the worker
        
        
           { setStatusFilter(v); setPage(1); }}>
            
              
            
            
              {['all', 'scheduled', 'in_progress', 'completed', 'failed', 'skipped'].map((s) => (
                {s === 'all' ? 'All Status' : s.replace('_', ' ')}
              ))}
            
          
           qc.invalidateQueries({ queryKey: ['pipeline-actions', pipelineId] })}>
            
          
        
      

      
        
          {isLoading ? (
            {[...Array(5)].map((_, i) => )}
          ) : (data?.actions?.length ?? 0) === 0 ? (
            
              
              No actions found
            
          ) : (
            <>
              
                
                  
                    Type
                    Status
                    Scheduled
                    Executed
                    Method
                    Outcome
                  
                
                
                  {data!.actions.map((action) => {
                    const Icon = ACTION_ICONS[action.actionType] || Activity;
                    return (
                      
                        
                          
                            
                            {action.actionType.replace('_', ' ')}
                          
                          {action.title && {action.title}}
                        
                        
                          
                            {action.status.replace('_', ' ')}
                          
                        
                        {fmtDate(action.scheduledAt)}
                        {fmtDate(action.executedAt)}
                        {action.executionMethod || '—'}
                        {action.outcome || '—'}
                      
                    );
                  })}
                
              

              {totalPages > 1 && (
                
                  Page {page} of {totalPages} · {data?.total} total
                  
                     setPage((p) => p - 1)}>
                      
                    
                    = totalPages} onClick={() => setPage((p) => p + 1)}>
                      
                    
                  
                
              )}
            
          )}
        
      
    
  );
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────

function AnalyticsPanel({
  pipelineId, authHeaders,
}: {
  pipelineId: string | null;
  authHeaders: { headers: { Authorization: string } };
}) {
  const { data, isLoading } = useQuery({
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
      
        
        Select a pipeline to view analytics
      
    );
  }

  if (isLoading) {
    return {[...Array(4)].map((_, i) => )};
  }

  if (!data) return No analytics data.;

  // Aggregate action stats
  const actionTotals: Record = {};
  for (const row of data.actionStats || []) {
    if (!actionTotals[row.actionType]) actionTotals[row.actionType] = { completed: 0, failed: 0, scheduled: 0, total: 0 };
    actionTotals[row.actionType][row.status as keyof typeof actionTotals[string]] = (actionTotals[row.actionType][row.status as keyof typeof actionTotals[string]] || 0) + Number(row.cnt);
    actionTotals[row.actionType].total += Number(row.cnt);
  }

  // Stage progression (accounts that advanced)
  const stageAdvances: Record = {};
  for (const row of data.stageProgression || []) {
    if (row.previousStage) stageAdvances[row.previousStage] = Number(row.cnt);
  }

  const totalStageAdvances = Object.values(stageAdvances).reduce((a, b) => a + b, 0);

  return (
    
      {/* KPI row */}
      
        {[
          { label: 'Total Accounts', value: data.funnel.totalAccounts, icon: Building2, color: 'text-foreground' },
          { label: 'Conversion Rate', value: `${data.funnel.conversionRate}%`, icon: TrendingUp, color: 'text-green-600' },
          { label: 'Appointments Set', value: data.funnel.appointmentsSet, icon: Calendar, color: 'text-emerald-600' },
          { label: 'Closed Won', value: data.funnel.closedWon, icon: CheckCircle2, color: 'text-green-700' },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            
              
                
                  
                    {kpi.label}
                    {kpi.value}
                  
                  
                
              
            
          );
        })}
      

      {/* Funnel distribution */}
      
        
          Funnel Distribution
          Accounts at each stage with advancement rates
        
        
          {data.funnel.stageDistribution.filter((s) => s.count > 0 || stageAdvances[s.stageId] > 0).map((stage) => (
            
              
                
              
              
                
                  {stage.count} accounts
                  {stage.percentage}%
                
                
              
              {stageAdvances[stage.stageId] > 0 && (
                
                  
                  {stageAdvances[stage.stageId]} advanced
                
              )}
            
          ))}
          {totalStageAdvances > 0 && (
            
              {totalStageAdvances} total stage advancements recorded
            
          )}
        
      

      {/* Action breakdown */}
      {Object.keys(actionTotals).length > 0 && (
        
          
            Action Execution Breakdown
            Pipeline actions by type and execution status
          
          
            
              
                
                  Action Type
                  Total
                  Completed
                  Scheduled
                  Failed
                  Success Rate
                
              
              
                {Object.entries(actionTotals).map(([type, counts]) => {
                  const rate = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
                  const Icon = ACTION_ICONS[type] || Activity;
                  return (
                    
                      
                        
                          
                          {type.replace('_', ' ')}
                        
                      
                      {counts.total}
                      {counts.completed}
                      {counts.scheduled}
                      {counts.failed}
                      
                        
                          
                          {rate}%
                        
                      
                    
                  );
                })}
              
            
          
        
      )}

      {/* Campaigns */}
      {data.campaigns.length > 0 && (
        
          
            Linked Campaigns ({data.campaigns.length})
          
          
            
              
                
                  Campaign
                  Type
                  Status
                
              
              
                {data.campaigns.map((c) => (
                  
                    {c.campaignName}
                    {c.campaignType}
                    
                      {c.status}
                    
                  
                ))}
              
            
          
        
      )}
    
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function UnifiedPipelineTab({ authHeaders, clientAccountId, organizationId }: UnifiedPipelineTabProps) {
  const urlSection = new URLSearchParams(window.location.search).get('section');
  const validSections: Section[] = ['pipelines', 'actions', 'analytics', 'triggers', 'leads'];
  const initialSection = validSections.includes(urlSection as Section) ? (urlSection as Section) : 'pipelines';
  const [activeSection, setActiveSection] = useState(initialSection);
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailAccountId, setDetailAccountId] = useState(null);
  const [latestInboxAnalysis, setLatestInboxAnalysis] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => { setLatestInboxAnalysis(null); }, [selectedPipelineId]);

  // ── Fetch pipelines ──
  const { data: pipelines, isLoading: pipelinesLoading } = useQuery({
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
  const { data: dashboard } = useQuery({
    queryKey: ['unified-pipeline-dashboard', selectedPipelineId],
    queryFn: async () => {
      const res = await fetch(`/api/unified-pipelines/${selectedPipelineId}`, authHeaders);
      if (!res.ok) throw new Error('Failed to load pipeline dashboard');
      return res.json();
    },
    enabled: !!selectedPipelineId,
  });

  // ── Fetch accounts for selected pipeline ──
  const { data: accounts } = useQuery({
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
      return res.json() as Promise;
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
      
        
        
      
    );
  }

  // ── Section: Triggers ──
  if (activeSection === 'triggers') {
    return (
      
        
        {/* Governance info bar */}
        
          
            
              
                
                Governance Rules
              
              Max 4 touches/account/day
              Business hours: 8 AM – 5 PM ET, Mon–Fri
              Stage-aware delays: Qualified → 5 min · Target → 2 hr
              Worker polls every 30s
            
          
        
        {clientAccountId && (
          
        )}
      
    );
  }

  // ── Section: Actions queue ──
  if (activeSection === 'actions') {
    return (
      
        
        {!selectedPipelineId && pipelines && pipelines.length > 0 && (
          
            
              
              
                Showing all pipelines. Go to  setActiveSection('pipelines')}>Pipelines and open one to filter actions for that pipeline.
              
              {pipelines.length > 0 && (
                 setSelectedPipelineId(v)}>
                  
                    
                  
                  
                    {pipelines.map((p) => (
                      {p.name}
                    ))}
                  
                
              )}
            
          
        )}
        
      
    );
  }

  // ── Section: Analytics ──
  if (activeSection === 'analytics') {
    return (
      
        
        {!selectedPipelineId && pipelines && pipelines.length > 0 && (
          
            
              
              Select a pipeline to view its analytics
               setSelectedPipelineId(v)}>
                
                  
                
                
                  {pipelines.map((p) => (
                    {p.name}
                  ))}
                
              
            
          
        )}
        
      
    );
  }

  // ── Section: Pipelines ──

  if (pipelinesLoading) {
    return (
      
        
        
        
      
    );
  }

  if (!pipelines?.length) {
    return (
      
        
        
          
            Pipelines
            Unified account-based pipelines powered by Organization Intelligence
          
        
        
          
            
              
            
            
              Create Your First Pipeline
              
                A Pipeline groups multiple campaigns (voice, email, content) under one unified strategy.
                AI generates the strategy from your Organization Intelligence and auto-enrolls target accounts.
              
            
             setCreateDialogOpen(true)}>
              Create Pipeline
            
          
        
         createPipeline.mutate(data)}
          isLoading={createPipeline.isPending}
        />
      
    );
  }

  if (!selectedPipelineId) {
    return (
      
        
        
          
            Pipelines
            {pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''} active
          
           setCreateDialogOpen(true)}>
            New Pipeline
          
        

        
          {pipelines.map((p) => (
             setSelectedPipelineId(p.id)}>
              
                
                  
                    {p.name}
                    {p.status}
                  
                  {p.objective && {p.objective}}
                
                
                  {p.totalAccounts}
                  {p.totalCampaigns} campaigns
                  {p.appointmentsSet} appts
                  
                
              
            
          ))}
        

         createPipeline.mutate(data)}
          isLoading={createPipeline.isPending}
        />
      
    );
  }

  // ── Selected pipeline detail ──
  return (
    
      {detailAccountId && (
         setDetailAccountId(null)}
          onStageChange={() => {
            queryClient.invalidateQueries({ queryKey: ['unified-pipeline-accounts', selectedPipelineId] });
            queryClient.invalidateQueries({ queryKey: ['unified-pipeline-dashboard', selectedPipelineId] });
          }}
        />
      )}

      

      {/* Pipeline header */}
      
        
           setSelectedPipelineId(null)}>
            Back
          
          
            
              {dashboard?.pipeline.name || 'Loading...'}
              {dashboard && (
                
                  {dashboard.pipeline.status}
                
              )}
            
            {dashboard?.pipeline.objective && (
              {dashboard.pipeline.objective}
            )}
          
        
        
           generateStrategy.mutate(selectedPipelineId)} disabled={generateStrategy.isPending}>
            {generateStrategy.isPending ?  : }
            Generate Strategy
          
           createCampaigns.mutate(selectedPipelineId)} disabled={createCampaigns.isPending}>
            {createCampaigns.isPending ?  : }
            Create Campaigns
          
           enrollAccounts.mutate(selectedPipelineId)} disabled={enrollAccounts.isPending}>
            {enrollAccounts.isPending ?  : }
            Enroll Accounts
          
           analyzeInbox.mutate(selectedPipelineId)} disabled={analyzeInbox.isPending}>
            {analyzeInbox.isPending ?  : }
            Analyze Inbox
          
        
      

      {/* Inbox Capture info */}
      
        
          
            
              Inbox Capture
            
            
              Scans 6 months of primary inbox threads, creates or updates accounts and contacts, moves them into this pipeline, and queues follow-up actions against linked campaigns.
            
          
          
            {dashboard?.campaigns.length || 0} linked campaigns
            {dashboard?.funnel.totalAccounts || 0} accounts
          
        
      

      {/* Inbox analysis results */}
      {latestInboxAnalysis && (
        
          
            Inbox Analysis Results
            
              {latestInboxAnalysis.summary.opportunityAccounts} account{latestInboxAnalysis.summary.opportunityAccounts === 1 ? '' : 's'} detected from {latestInboxAnalysis.summary.scannedConversations} conversations
            
          
          
            
              {[
                { label: 'Messages scanned', value: latestInboxAnalysis.summary.scannedMessages },
                { label: 'Pipeline accounts', value: latestInboxAnalysis.summary.createdPipelineAccounts, sub: `${latestInboxAnalysis.summary.updatedPipelineAccounts} updated` },
                { label: 'Contacts managed', value: latestInboxAnalysis.summary.createdContacts + latestInboxAnalysis.summary.updatedContacts, sub: `${latestInboxAnalysis.summary.createdPipelineContacts} added to pipeline` },
                { label: 'Follow-ups queued', value: latestInboxAnalysis.summary.createdActions, sub: `${latestInboxAnalysis.summary.matchedCampaigns} campaign matches` },
              ].map((s) => (
                
                  {s.label}
                  {s.value}
                  {s.sub && {s.sub}}
                
              ))}
            

            {latestInboxAnalysis.accounts.length > 0 && (
              
                {latestInboxAnalysis.accounts.slice(0, 6).map((acct) => (
                  
                    
                      
                        
                          {acct.accountName}
                          
                          {acct.accountDomain}
                        
                        {acct.primaryContact.fullName} · {acct.primaryContact.email}
                        {acct.summary}
                        {acct.recommendation}
                        
                          
                            Next: {acct.nextAction.type} · {new Date(acct.nextAction.scheduledAt).toLocaleDateString()}
                          
                          {acct.serviceThemes.slice(0, 3).map((t) => (
                            {t.replace(/_/g, ' ')}
                          ))}
                        
                      
                      
                        {[['Confidence', acct.confidence], ['Engagement', acct.engagementScore], ['Priority', acct.priorityScore]].map(([k, v]) => (
                          
                            {k}
                            {v}
                          
                        ))}
                      
                    
                  
                ))}
              
            )}
          
        
      )}

      {/* KPI row */}
      {dashboard && (
        
          {[
            { label: 'Total Accounts', value: dashboard.funnel.totalAccounts },
            { label: 'Active', value: dashboard.funnel.activeAccounts },
            { label: 'Appointments', value: dashboard.funnel.appointmentsSet, className: 'text-emerald-600' },
            { label: 'Closed Won', value: dashboard.funnel.closedWon, className: 'text-green-600' },
            { label: 'Conversion', value: `${dashboard.funnel.conversionRate}%`, className: 'text-blue-600' },
          ].map((kpi) => (
            
              
                {kpi.label}
                {kpi.value}
              
            
          ))}
        
      )}

      {/* Funnel board */}
      {dashboard && (
        
          
            
              Account Funnel
               setActiveSection('analytics')}>
                Full Analytics
              
            
          
          
            
              {dashboard.funnel.stageDistribution
                .filter((s) => !['on_hold'].includes(s.stageId))
                .map((stage, idx, arr) => (
                  
                    
                      
                      {stage.count}
                      {stage.percentage}%
                      
                    
                    {idx }
                  
                ))}
            
          
        
      )}

      {/* Account list */}
      {accounts && accounts.length > 0 && (
        
          
            
              
                Pipeline Accounts
                {accounts.length} accounts enrolled
              
               queryClient.invalidateQueries({ queryKey: ['unified-pipeline-accounts', selectedPipelineId] })}>
                Refresh
              
            
          
          
            
              
                
                  Account
                  Stage
                  Priority
                  Touchpoints
                  Next Action
                  Detail
                
              
              
                {accounts.map((a) => (
                  
                    
                      {a.accountName}
                      {a.accountIndustry && {a.accountIndustry}{a.accountStaffCount ? ` · ${a.accountStaffCount}` : ''}}
                    
                    
                    
                      
                        
                        {a.pipelineAccount.priorityScore}
                      
                    
                    {a.pipelineAccount.totalTouchpoints}
                    
                      {a.pipelineAccount.nextActionType ? (
                        
                          {a.pipelineAccount.nextActionType === 'callback' ?  : }
                          {a.pipelineAccount.nextActionType}
                          {a.pipelineAccount.nextActionAt && · {fmtDate(a.pipelineAccount.nextActionAt)}}
                        
                      ) : —}
                    
                    
                       setDetailAccountId(a.pipelineAccount.id)}>
                        View
                      
                    
                  
                ))}
              
            
          
        
      )}

      {/* Campaigns */}
      {dashboard && dashboard.campaigns.length > 0 && (
        
          
            Linked Campaigns ({dashboard.campaigns.length})
          
          
            
              
                
                  Campaign
                  Type
                  Status
                
              
              
                {dashboard.campaigns.map((c) => (
                  
                    {c.campaignName}
                    {c.campaignType}
                    
                      {c.status}
                    
                  
                ))}
              
            
          
        
      )}

      {/* Recent Activity */}
      {dashboard && dashboard.recentActivity.length > 0 && (
        
          
            
              Recent Activity
               setActiveSection('actions')}>
                Full Action Queue
              
            
          
          
            
              {dashboard.recentActivity.map((activity, i) => {
                const Icon = ACTION_ICONS[activity.type] || Activity;
                return (
                  
                    
                      
                    
                    
                      {activity.accountName}
                       — {activity.description}
                      {fmtDate(activity.occurredAt)}
                    
                  
                );
              })}
            
          
        
      )}

      {/* Create pipeline dialog */}
       createPipeline.mutate(data)}
        isLoading={createPipeline.isPending}
      />
    
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
    
      
        
          Create New Pipeline
          
            AI will generate the strategy from your Organization Intelligence and auto-create draft campaigns.
          
        
        
          
            Pipeline Name
             setName(e.target.value)} />
          
          
            Objective
             setObjective(e.target.value)} />
          
          
            Description (optional)
             setDescription(e.target.value)} rows={3} />
          
        
        
           onOpenChange(false)}>Cancel
           onSubmit({ name, description, objective })} disabled={!name.trim() || isLoading}>
            {isLoading ?  : }
            Create Pipeline
          
        
      
    
  );
}