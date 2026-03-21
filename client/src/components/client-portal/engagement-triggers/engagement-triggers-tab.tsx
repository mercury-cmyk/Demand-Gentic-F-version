/**
 * Engagement Triggers Tab
 *
 * Account-based cross-channel engagement automation dashboard.
 * Shows qualified pipeline leads with last engagement context,
 * pending/scheduled triggers, and manual trigger creation.
 *
 * Rule: Call → Email follow-up | Email → Call follow-up
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Zap, Phone, Mail, Clock, CheckCircle, AlertCircle, XCircle,
  ArrowRight, RefreshCw, Plus, Filter, ChevronLeft, ChevronRight,
  TrendingUp, Activity, Ban, Loader2
} from 'lucide-react';

// ==================== TYPES ====================

interface PipelineLeadView {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  accountName: string | null;
  accountId: string | null;
  campaignName: string | null;
  campaignId: string | null;
  aiScore: string | null;
  disposition: string | null;
  lastEngagementChannel: 'call' | 'email' | null;
  lastEngagementAt: string | null;
  nextAction: 'call' | 'email' | null;
  triggerStatus: string | null;
  triggerId: string | null;
  createdAt: string | null;
}

interface EngagementTrigger {
  id: string;
  accountId: string;
  contactId: string;
  campaignId: string | null;
  sourceChannel: 'call' | 'email';
  targetChannel: 'call' | 'email';
  status: string;
  scheduledAt: string | null;
  executedAt: string | null;
  createdAt: string;
  triggerPayload: Record<string, unknown> | null;
}

interface EngagementStats {
  totalTriggers: number;
  pending: number;
  scheduled: number;
  completed: number;
  failed: number;
  cancelled: number;
  callToEmail: number;
  emailToCall: number;
}

interface EngagementTriggersTabProps {
  authHeaders: { headers: { Authorization: string } };
  clientAccountId?: string;
}

// ==================== STATUS HELPERS ====================

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle }> = {
  pending: { label: 'Pending', variant: 'outline', icon: Clock },
  scheduled: { label: 'Scheduled', variant: 'secondary', icon: Clock },
  executing: { label: 'Executing', variant: 'default', icon: Loader2 },
  completed: { label: 'Completed', variant: 'default', icon: CheckCircle },
  failed: { label: 'Failed', variant: 'destructive', icon: AlertCircle },
  cancelled: { label: 'Cancelled', variant: 'outline', icon: XCircle },
  skipped: { label: 'Skipped', variant: 'outline', icon: Ban },
};

function ChannelIcon({ channel, className }: { channel: 'call' | 'email' | null; className?: string }) {
  if (channel === 'call') return <Phone className={className ?? 'h-4 w-4'} />;
  if (channel === 'email') return <Mail className={className ?? 'h-4 w-4'} />;
  return null;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">No trigger</Badge>;
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'outline' as const, icon: AlertCircle };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ==================== MAIN COMPONENT ====================

export function EngagementTriggersTab({ authHeaders, clientAccountId }: EngagementTriggersTabProps) {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<'leads' | 'triggers'>('leads');
  const [page, setPage] = useState(1);
  const [triggerPage, setTriggerPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<PipelineLeadView | null>(null);
  const pageSize = 25;

  // ==================== QUERIES ====================

  const { data: statsData, isLoading: statsLoading } = useQuery<EngagementStats>({
    queryKey: ['engagement-stats', clientAccountId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientAccountId) params.set('clientAccountId', clientAccountId);
      const res = await fetch(`/api/engagement-triggers/stats?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery<{ leads: PipelineLeadView[]; total: number }>({
    queryKey: ['engagement-pipeline-leads', clientAccountId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (clientAccountId) params.set('clientAccountId', clientAccountId);
      const res = await fetch(`/api/engagement-triggers/pipeline-leads?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: triggersData, isLoading: triggersLoading } = useQuery<{ triggers: EngagementTrigger[]; total: number }>({
    queryKey: ['engagement-triggers-list', clientAccountId, triggerPage, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(triggerPage), pageSize: String(pageSize) });
      if (clientAccountId) params.set('clientAccountId', clientAccountId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/engagement-triggers?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch triggers');
      return res.json();
    },
    staleTime: 30_000,
    enabled: activeView === 'triggers',
  });

  // ==================== MUTATIONS ====================

  const cancelMutation = useMutation({
    mutationFn: async (triggerId: string) => {
      const res = await fetch(`/api/engagement-triggers/${triggerId}/cancel`, {
        method: 'PATCH',
        ...authHeaders,
      });
      if (!res.ok) throw new Error('Failed to cancel trigger');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Trigger cancelled' });
      queryClient.invalidateQueries({ queryKey: ['engagement-triggers-list'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-stats'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-pipeline-leads'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      accountId: string;
      contactId: string;
      campaignId?: string;
      targetChannel: 'call' | 'email';
    }) => {
      const res = await fetch('/api/engagement-triggers', {
        method: 'POST',
        headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create trigger');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Engagement trigger created' });
      setCreateDialogOpen(false);
      setSelectedLead(null);
      queryClient.invalidateQueries({ queryKey: ['engagement-triggers-list'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-stats'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-pipeline-leads'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Creation failed', description: err.message, variant: 'destructive' });
    },
  });

  // ==================== STATS CARDS ====================

  const stats = statsData ?? { totalTriggers: 0, pending: 0, scheduled: 0, completed: 0, failed: 0, cancelled: 0, callToEmail: 0, emailToCall: 0 };
  const totalLeads = leadsData?.total ?? 0;
  const totalPages = Math.ceil(totalLeads / pageSize);
  const totalTriggerPages = Math.ceil((triggersData?.total ?? 0) / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500" />
            Engagement Triggers
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Cross-channel automation — call engagements trigger email follow-ups, email engagements trigger calls
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={activeView === 'leads' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveView('leads')}
          >
            Pipeline Leads
          </Button>
          <Button
            variant={activeView === 'triggers' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveView('triggers')}
          >
            Trigger Queue
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Triggers</p>
                <p className="text-2xl font-bold">{statsLoading ? '—' : stats.totalTriggers}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Scheduled</p>
                <p className="text-2xl font-bold text-blue-600">{statsLoading ? '—' : stats.scheduled + stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Call → Email</p>
                <p className="text-2xl font-bold">{statsLoading ? '—' : stats.callToEmail}</p>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground/40">
                <Phone className="h-4 w-4" />
                <ArrowRight className="h-3 w-3" />
                <Mail className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Email → Call</p>
                <p className="text-2xl font-bold">{statsLoading ? '—' : stats.emailToCall}</p>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground/40">
                <Mail className="h-4 w-4" />
                <ArrowRight className="h-3 w-3" />
                <Phone className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ==================== PIPELINE LEADS VIEW ==================== */}
      {activeView === 'leads' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Qualified Pipeline Leads</CardTitle>
                <CardDescription>
                  Leads with engagement context — see last action and recommended next step
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{totalLeads} leads</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['engagement-pipeline-leads'] })}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {leadsLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (leadsData?.leads?.length ?? 0) === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No qualified leads yet</p>
                <p className="text-sm">Leads will appear here as campaigns generate qualified engagements</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="text-center">Last Engagement</TableHead>
                      <TableHead className="text-center">Next Action</TableHead>
                      <TableHead className="text-center">Trigger Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadsData!.leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{lead.contactName || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{lead.contactEmail || '—'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{lead.accountName || '—'}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{lead.campaignName || '—'}</TableCell>
                        <TableCell className="text-center">
                          {lead.lastEngagementChannel ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1">
                                <ChannelIcon channel={lead.lastEngagementChannel} className="h-3.5 w-3.5" />
                                <span className="text-xs capitalize">{lead.lastEngagementChannel}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(lead.lastEngagementAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {lead.nextAction ? (
                            <Badge variant="secondary" className="gap-1">
                              <ChannelIcon channel={lead.nextAction} className="h-3 w-3" />
                              <span className="capitalize">{lead.nextAction}</span>
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={lead.triggerStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {lead.triggerId && (lead.triggerStatus === 'pending' || lead.triggerStatus === 'scheduled') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={cancelMutation.isPending}
                                onClick={() => cancelMutation.mutate(lead.triggerId!)}
                              >
                                Cancel
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => {
                                setSelectedLead(lead);
                                setCreateDialogOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3" />
                              Trigger
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== TRIGGER QUEUE VIEW ==================== */}
      {activeView === 'triggers' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Trigger Queue</CardTitle>
                <CardDescription>All cross-channel engagement triggers and their execution status</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setTriggerPage(1); }}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <Filter className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['engagement-triggers-list'] })}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {triggersLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (triggersData?.triggers?.length ?? 0) === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No triggers found</p>
                <p className="text-sm">Triggers are auto-created when engagements occur</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flow</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Executed</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {triggersData!.triggers.map((trigger) => (
                      <TableRow key={trigger.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <ChannelIcon channel={trigger.sourceChannel} className="h-4 w-4 text-muted-foreground" />
                            <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                            <ChannelIcon channel={trigger.targetChannel} className="h-4 w-4" />
                            <span className="text-xs ml-1 capitalize">{trigger.sourceChannel} → {trigger.targetChannel}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={trigger.status} />
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(trigger.scheduledAt)}</TableCell>
                        <TableCell className="text-sm">{formatDate(trigger.executedAt)}</TableCell>
                        <TableCell className="text-sm">{formatDate(trigger.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {(trigger.triggerPayload as any)?.priority ?? 'normal'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {(trigger.status === 'pending' || trigger.status === 'scheduled') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              disabled={cancelMutation.isPending}
                              onClick={() => cancelMutation.mutate(trigger.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {totalTriggerPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      Page {triggerPage} of {totalTriggerPages}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={triggerPage <= 1}
                        onClick={() => setTriggerPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={triggerPage >= totalTriggerPages}
                        onClick={() => setTriggerPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== CREATE TRIGGER DIALOG ==================== */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Create Engagement Trigger
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <CreateTriggerForm
              lead={selectedLead}
              onSubmit={(targetChannel) => {
                if (!selectedLead.accountId || !selectedLead.id) return;
                createMutation.mutate({
                  accountId: selectedLead.accountId,
                  contactId: selectedLead.id,
                  campaignId: selectedLead.campaignId ?? undefined,
                  targetChannel,
                });
              }}
              isPending={createMutation.isPending}
              onCancel={() => { setCreateDialogOpen(false); setSelectedLead(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== CREATE TRIGGER FORM ====================

function CreateTriggerForm({
  lead,
  onSubmit,
  isPending,
  onCancel,
}: {
  lead: PipelineLeadView;
  onSubmit: (targetChannel: 'call' | 'email') => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [targetChannel, setTargetChannel] = useState<'call' | 'email'>(
    lead.lastEngagementChannel === 'call' ? 'email' : 'call'
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 bg-muted/30 space-y-1.5">
        <p className="text-sm font-medium">{lead.contactName || 'Unknown Contact'}</p>
        <p className="text-xs text-muted-foreground">{lead.accountName || 'No account'}</p>
        {lead.lastEngagementChannel && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <ChannelIcon channel={lead.lastEngagementChannel} className="h-3 w-3" />
            <span>Last: {lead.lastEngagementChannel} on {formatDate(lead.lastEngagementAt)}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Next Action Channel</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={targetChannel === 'email' ? 'default' : 'outline'}
            className="gap-2"
            onClick={() => setTargetChannel('email')}
          >
            <Mail className="h-4 w-4" />
            Send Email
          </Button>
          <Button
            type="button"
            variant={targetChannel === 'call' ? 'default' : 'outline'}
            className="gap-2"
            onClick={() => setTargetChannel('call')}
          >
            <Phone className="h-4 w-4" />
            Schedule Call
          </Button>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <ChannelIcon channel={lead.lastEngagementChannel ?? (targetChannel === 'email' ? 'call' : 'email')} className="h-3.5 w-3.5" />
          <ArrowRight className="h-3 w-3" />
          <ChannelIcon channel={targetChannel} className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs">Auto-scheduled based on priority</span>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(targetChannel)} disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Trigger
        </Button>
      </DialogFooter>
    </div>
  );
}
