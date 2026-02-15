/**
 * UKEF Transcript Quality + Disposition Validation — Client Portal Component
 *
 * Embeddable component (no layout wrapper) for the client portal dashboard.
 * Shows pipeline status, transcript quality metrics, disposition review queue,
 * and audit trail.
 *
 * Only visible when the ukef_transcript_qa feature is enabled for the UKEF/Lightcast client.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PushToShowcaseButton } from '@/components/showcase-calls/push-to-showcase-button';
import {
  Play,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileAudio,
  FileSearch,
  ListChecks,
  ArrowRight,
  RefreshCw,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  BarChart3,
  Shield,
  Clock,
  ChevronLeft,
  ChevronRight,
  ScrollText,
} from 'lucide-react';

const getToken = () => localStorage.getItem('clientPortalToken');

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineStatus {
  lastRun: string | null;
  totalAssessed: number;
  transcriptStats: {
    missing: number;
    partial: number;
    complete: number;
    failed: number;
  };
  dispositionStats: {
    pending: number;
    validated: number;
    mismatch: number;
    auto_corrected: number;
    reviewed: number;
  };
  retranscriptionQueue: number;
  reviewQueue: number;
}

interface ReviewQueueItem {
  id: string;
  leadId: string;
  callSessionId?: string | null;
  contactName: string | null;
  contactEmail: string | null;
  campaignName: string | null;
  existingDisposition: string | null;
  recommendedDisposition: string | null;
  confidence: number | null;
  rationale: string | null;
  evidenceSnippets: Array<{ quote: string; relevance: string }>;
  transcriptPreview: string | null;
  validationStatus: string;
  createdAt: string;
}

interface PipelineRunResult {
  success: boolean;
  assessed: number;
  retranscribed: number;
  validated: number;
  mismatches: number;
  errors: number;
  durationMs: number;
}

interface AuditLogItem {
  id: string;
  lead_id: string;
  action: string;
  old_value: any;
  new_value: any;
  performed_by: string;
  model_version: string | null;
  provider: string | null;
  metadata: any;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const authHeaders = {
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
};

function getAuthHeaders() {
  return {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  };
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/client-portal/ukef-transcript-qa${path}`, {
    ...getAuthHeaders(),
    ...options,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${errBody}`);
  }
  return res.json();
}

function formatConfidence(c: number | null): string {
  if (c === null || c === undefined) return '—';
  return `${(c * 100).toFixed(0)}%`;
}

function dispositionLabel(d: string | null): string {
  if (!d) return '—';
  return d.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getStatusBadge(status: string) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    missing: { variant: 'destructive', label: 'Missing' },
    partial: { variant: 'secondary', label: 'Partial' },
    complete: { variant: 'default', label: 'Complete' },
    failed: { variant: 'destructive', label: 'Failed' },
    pending: { variant: 'outline', label: 'Pending' },
    validated: { variant: 'default', label: 'Validated' },
    mismatch: { variant: 'destructive', label: 'Mismatch' },
    auto_corrected: { variant: 'secondary', label: 'Auto-Corrected' },
    reviewed: { variant: 'default', label: 'Reviewed' },
  };
  const v = variants[status] || { variant: 'outline' as const, label: status };
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

// ─── Sub-Views ──────────────────────────────────────────────────────────────

type SubView = 'overview' | 'review-queue' | 'audit-log';

// ─── Main Component ──────────────────────────────────────────────────────────

export function UkefTranscriptQaContent() {
  const [subView, setSubView] = useState<SubView>('overview');
  const [reviewPage, setReviewPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [selectedTask, setSelectedTask] = useState<ReviewQueueItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [overrideDisposition, setOverrideDisposition] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ─── Queries ───────────────────────────────────────────────────────────────

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery<PipelineStatus>({
    queryKey: ['ukef-tqa-status'],
    queryFn: () => fetchApi<PipelineStatus>('/status'),
    staleTime: 30_000,
  });

  const {
    data: reviewQueue,
    isLoading: reviewLoading,
    refetch: refetchReview,
  } = useQuery<{ items: ReviewQueueItem[]; total: number; page: number; pageSize: number }>({
    queryKey: ['ukef-tqa-review-queue', reviewPage],
    queryFn: () => fetchApi(`/review-queue?page=${reviewPage}&pageSize=20`),
    enabled: subView === 'review-queue',
    staleTime: 15_000,
  });

  const {
    data: auditLog,
    isLoading: auditLoading,
  } = useQuery<{ items: AuditLogItem[]; total: number; page: number; pageSize: number }>({
    queryKey: ['ukef-tqa-audit-log', auditPage],
    queryFn: () => fetchApi(`/audit-log?page=${auditPage}&pageSize=50`),
    enabled: subView === 'audit-log',
    staleTime: 30_000,
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const runPipeline = useMutation<PipelineRunResult>({
    mutationFn: () => fetchApi<PipelineRunResult>('/run', { method: 'POST' }),
    onSuccess: (data) => {
      toast({
        title: 'Pipeline Run Complete',
        description: `Assessed ${data.assessed} | Retranscribed ${data.retranscribed} | Validated ${data.validated} | Mismatches ${data.mismatches} | ${(data.durationMs / 1000).toFixed(1)}s`,
      });
      queryClient.invalidateQueries({ queryKey: ['ukef-tqa-status'] });
      queryClient.invalidateQueries({ queryKey: ['ukef-tqa-review-queue'] });
    },
    onError: (err) => {
      toast({ title: 'Pipeline Error', description: String(err), variant: 'destructive' });
    },
  });

  const assessOnly = useMutation({
    mutationFn: () => fetchApi('/assess', { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Assessment complete' });
      queryClient.invalidateQueries({ queryKey: ['ukef-tqa-status'] });
    },
  });

  const retranscribeOnly = useMutation({
    mutationFn: () => fetchApi('/retranscribe', { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Retranscription complete' });
      queryClient.invalidateQueries({ queryKey: ['ukef-tqa-status'] });
    },
  });

  const validateOnly = useMutation({
    mutationFn: () => fetchApi('/validate', { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Validation complete' });
      queryClient.invalidateQueries({ queryKey: ['ukef-tqa-status'] });
      queryClient.invalidateQueries({ queryKey: ['ukef-tqa-review-queue'] });
    },
  });

  const reviewAction = useMutation<{ success: boolean; newDisposition?: string }, Error, { taskId: string; action: string; overrideDisposition?: string; reviewNotes?: string }>({
    mutationFn: (vars) => fetchApi(`/review/${vars.taskId}`, {
      method: 'POST',
      body: JSON.stringify({
        action: vars.action,
        overrideDisposition: vars.overrideDisposition,
        reviewNotes: vars.reviewNotes,
      }),
    }),
    onSuccess: (_data, vars) => {
      toast({ title: `Review ${vars.action}ed successfully` });
      setSelectedTask(null);
      setReviewNotes('');
      setOverrideDisposition('');
      queryClient.invalidateQueries({ queryKey: ['ukef-tqa-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['ukef-tqa-status'] });
    },
    onError: (err) => {
      toast({ title: 'Review Error', description: String(err), variant: 'destructive' });
    },
  });

  const isAnyRunning = runPipeline.isPending || assessOnly.isPending || retranscribeOnly.isPending || validateOnly.isPending;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Transcript Quality & Disposition Validation</h2>
          <p className="text-muted-foreground">
            Assess transcript quality, retranscribe recordings, and validate call dispositions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchStatus()} disabled={statusLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${statusLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => runPipeline.mutate()}
            disabled={isAnyRunning}
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
          >
            {runPipeline.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Full Pipeline
          </Button>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={subView === 'overview' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setSubView('overview')}
        >
          <BarChart3 className="h-4 w-4 mr-1" />
          Overview
        </Button>
        <Button
          variant={subView === 'review-queue' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setSubView('review-queue')}
        >
          <ListChecks className="h-4 w-4 mr-1" />
          Review Queue
          {status && status.reviewQueue > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1 text-xs">
              {status.reviewQueue}
            </Badge>
          )}
        </Button>
        <Button
          variant={subView === 'audit-log' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setSubView('audit-log')}
        >
          <ScrollText className="h-4 w-4 mr-1" />
          Audit Log
        </Button>
      </div>

      {/* Overview */}
      {subView === 'overview' && (
        <OverviewSection
          status={status || null}
          loading={statusLoading}
          isAnyRunning={isAnyRunning}
          onAssess={() => assessOnly.mutate()}
          onRetranscribe={() => retranscribeOnly.mutate()}
          onValidate={() => validateOnly.mutate()}
        />
      )}

      {/* Review Queue */}
      {subView === 'review-queue' && (
        <ReviewQueueSection
          data={reviewQueue || null}
          loading={reviewLoading}
          page={reviewPage}
          onPageChange={setReviewPage}
          onSelect={setSelectedTask}
          refetch={refetchReview}
        />
      )}

      {/* Audit Log */}
      {subView === 'audit-log' && (
        <AuditLogSection
          data={auditLog || null}
          loading={auditLoading}
          page={auditPage}
          onPageChange={setAuditPage}
        />
      )}

      {/* Review Dialog */}
      {selectedTask && (
        <ReviewDialog
          task={selectedTask}
          open={!!selectedTask}
          onClose={() => { setSelectedTask(null); setReviewNotes(''); setOverrideDisposition(''); }}
          reviewNotes={reviewNotes}
          onReviewNotesChange={setReviewNotes}
          overrideDisposition={overrideDisposition}
          onOverrideDispositionChange={setOverrideDisposition}
          onAction={(action) => {
            reviewAction.mutate({
              taskId: selectedTask.id,
              action,
              overrideDisposition: action === 'override' ? overrideDisposition : undefined,
              reviewNotes: reviewNotes || undefined,
            });
          }}
          isSubmitting={reviewAction.isPending}
        />
      )}
    </div>
  );
}

// ─── Overview Section ────────────────────────────────────────────────────────

function OverviewSection({
  status,
  loading,
  isAnyRunning,
  onAssess,
  onRetranscribe,
  onValidate,
}: {
  status: PipelineStatus | null;
  loading: boolean;
  isAnyRunning: boolean;
  onAssess: () => void;
  onRetranscribe: () => void;
  onValidate: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>No pipeline data yet. Run the pipeline to start assessing transcripts.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <FileSearch className="h-4 w-4" />
              Total Assessed
            </div>
            <p className="text-2xl font-bold">{status.totalAssessed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <FileAudio className="h-4 w-4" />
              Retranscription Queue
            </div>
            <p className="text-2xl font-bold">{status.retranscriptionQueue}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Review Queue
            </div>
            <p className="text-2xl font-bold text-destructive">{status.reviewQueue}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Clock className="h-4 w-4" />
              Last Run
            </div>
            <p className="text-sm font-medium">
              {status.lastRun ? new Date(status.lastRun).toLocaleString() : 'Never'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transcript Quality Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transcript Quality</CardTitle>
            <CardDescription>Quality assessment by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(status.transcriptStats).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {key === 'complete' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {key === 'partial' && <AlertCircle className="h-4 w-4 text-amber-500" />}
                    {key === 'missing' && <XCircle className="h-4 w-4 text-red-500" />}
                    {key === 'failed' && <XCircle className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm capitalize">{key}</span>
                  </div>
                  <span className="font-mono text-sm font-medium">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Disposition Validation</CardTitle>
            <CardDescription>Validation results by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(status.dispositionStats).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {key === 'validated' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {key === 'mismatch' && <AlertCircle className="h-4 w-4 text-red-500" />}
                    {key === 'pending' && <Clock className="h-4 w-4 text-gray-400" />}
                    {key === 'auto_corrected' && <RefreshCw className="h-4 w-4 text-blue-500" />}
                    {key === 'reviewed' && <Shield className="h-4 w-4 text-violet-500" />}
                    <span className="text-sm">{dispositionLabel(key)}</span>
                  </div>
                  <span className="font-mono text-sm font-medium">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Individual Pipeline Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pipeline Actions</CardTitle>
          <CardDescription>Run individual pipeline stages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={onAssess} disabled={isAnyRunning}>
              <FileSearch className="h-4 w-4 mr-1" />
              Assess Quality
            </Button>
            <Button variant="outline" size="sm" onClick={onRetranscribe} disabled={isAnyRunning}>
              <FileAudio className="h-4 w-4 mr-1" />
              Retranscribe
            </Button>
            <Button variant="outline" size="sm" onClick={onValidate} disabled={isAnyRunning}>
              <ListChecks className="h-4 w-4 mr-1" />
              Validate Dispositions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Review Queue Section ────────────────────────────────────────────────────

function ReviewQueueSection({
  data,
  loading,
  page,
  onPageChange,
  onSelect,
  refetch,
}: {
  data: { items: ReviewQueueItem[]; total: number; page: number; pageSize: number } | null;
  loading: boolean;
  page: number;
  onPageChange: (p: number) => void;
  onSelect: (item: ReviewQueueItem) => void;
  refetch: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground py-8">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
            <p className="font-medium">No items in the review queue</p>
            <p className="text-sm mt-1">All disposition validations are resolved</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPages = Math.ceil(data.total / data.pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data.total} item{data.total !== 1 ? 's' : ''} requiring review
        </p>
        <Button variant="ghost" size="sm" onClick={refetch}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {data.items.map((item) => (
          <Card key={item.id} className="hover:border-violet-200 dark:hover:border-violet-800 transition-colors cursor-pointer"
            onClick={() => onSelect(item)}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{item.contactName || 'Unknown Contact'}</span>
                    {item.contactEmail && (
                      <span className="text-xs text-muted-foreground truncate">{item.contactEmail}</span>
                    )}
                  </div>
                  {item.campaignName && (
                    <p className="text-xs text-muted-foreground mb-2">{item.campaignName}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Current: </span>
                      <span className="font-medium">{dispositionLabel(item.existingDisposition)}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground">Recommended: </span>
                      <span className="font-medium text-violet-600 dark:text-violet-400">{dispositionLabel(item.recommendedDisposition)}</span>
                    </div>
                  </div>
                  {item.rationale && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.rationale}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.callSessionId && (
                    <PushToShowcaseButton
                      callSessionId={item.callSessionId}
                      contactName={item.contactName}
                      sourceLabel="QA Review Queue"
                      label="Showcase"
                      stopPropagation
                      buttonProps={{ size: 'sm', variant: 'outline' }}
                    />
                  )}
                  <Badge variant={
                    (item.confidence || 0) >= 0.9 ? 'default' :
                    (item.confidence || 0) >= 0.7 ? 'secondary' : 'destructive'
                  }>
                    {formatConfidence(item.confidence)}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Review Dialog ───────────────────────────────────────────────────────────

function ReviewDialog({
  task,
  open,
  onClose,
  reviewNotes,
  onReviewNotesChange,
  overrideDisposition,
  onOverrideDispositionChange,
  onAction,
  isSubmitting,
}: {
  task: ReviewQueueItem;
  open: boolean;
  onClose: () => void;
  reviewNotes: string;
  onReviewNotesChange: (v: string) => void;
  overrideDisposition: string;
  onOverrideDispositionChange: (v: string) => void;
  onAction: (action: 'accept' | 'reject' | 'override') => void;
  isSubmitting: boolean;
}) {
  const [showOverride, setShowOverride] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Disposition Review</DialogTitle>
          <DialogDescription>
            Review the AI-recommended disposition and decide how to proceed
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Contact</p>
              <p className="font-medium">{task.contactName || 'Unknown'}</p>
              {task.contactEmail && <p className="text-sm text-muted-foreground">{task.contactEmail}</p>}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Campaign</p>
              <p className="font-medium">{task.campaignName || '—'}</p>
            </div>
          </div>

          <Separator />

          {/* Disposition Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground mb-1">Current Disposition</p>
                <p className="font-medium text-lg">{dispositionLabel(task.existingDisposition)}</p>
              </CardContent>
            </Card>
            <Card className="border-violet-200 dark:border-violet-800">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground mb-1">AI Recommended</p>
                <p className="font-medium text-lg text-violet-600 dark:text-violet-400">{dispositionLabel(task.recommendedDisposition)}</p>
                <p className="text-xs text-muted-foreground">Confidence: {formatConfidence(task.confidence)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Rationale */}
          {task.rationale && (
            <div>
              <p className="text-sm font-medium mb-1">AI Rationale</p>
              <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">{task.rationale}</p>
            </div>
          )}

          {/* Evidence Snippets */}
          {task.evidenceSnippets && task.evidenceSnippets.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Evidence</p>
              <div className="space-y-2">
                {task.evidenceSnippets.map((snippet, idx) => (
                  <div key={idx} className="border rounded-md p-2 text-sm">
                    <p className="italic text-muted-foreground">"{snippet.quote}"</p>
                    <p className="text-xs mt-1">{snippet.relevance}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript Preview */}
          {task.transcriptPreview && (
            <div>
              <p className="text-sm font-medium mb-1">Transcript Preview</p>
              <p className="text-xs text-muted-foreground bg-muted rounded-md p-3 font-mono">{task.transcriptPreview}...</p>
            </div>
          )}

          <Separator />

          {/* Review Notes */}
          <div>
            <p className="text-sm font-medium mb-1">Review Notes (optional)</p>
            <Textarea
              value={reviewNotes}
              onChange={(e) => onReviewNotesChange(e.target.value)}
              placeholder="Add notes about your review decision..."
              rows={2}
            />
          </div>

          {/* Override Disposition */}
          {showOverride && (
            <div>
              <p className="text-sm font-medium mb-1">Override Disposition</p>
              <Select value={overrideDisposition} onValueChange={onOverrideDispositionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select disposition..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified_lead">Qualified Lead</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="do_not_call">Do Not Call</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="invalid_data">Invalid Data</SelectItem>
                  <SelectItem value="needs_review">Needs Review</SelectItem>
                  <SelectItem value="callback_requested">Callback Requested</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!showOverride ? (
            <Button variant="ghost" size="sm" onClick={() => setShowOverride(true)} disabled={isSubmitting}>
              <Edit3 className="h-4 w-4 mr-1" />
              Override
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction('override')}
              disabled={!overrideDisposition || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Edit3 className="h-4 w-4 mr-1" />}
              Apply Override
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onAction('reject')} disabled={isSubmitting}>
              <ThumbsDown className="h-4 w-4 mr-1" />
              Keep Current
            </Button>
            <Button onClick={() => onAction('accept')} disabled={isSubmitting}
              className="bg-gradient-to-r from-green-500 to-emerald-600">
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-1" />}
              Accept Recommendation
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Audit Log Section ──────────────────────────────────────────────────────

function AuditLogSection({
  data,
  loading,
  page,
  onPageChange,
}: {
  data: { items: AuditLogItem[]; total: number; page: number; pageSize: number } | null;
  loading: boolean;
  page: number;
  onPageChange: (p: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground py-8">
            <ScrollText className="h-10 w-10 mx-auto mb-3" />
            <p>No audit log entries yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPages = Math.ceil(data.total / data.pageSize);

  const actionIcons: Record<string, React.ReactNode> = {
    retranscribe: <FileAudio className="h-4 w-4 text-blue-500" />,
    validate_disposition: <ListChecks className="h-4 w-4 text-violet-500" />,
    auto_correct: <RefreshCw className="h-4 w-4 text-amber-500" />,
    manual_review: <Shield className="h-4 w-4 text-green-500" />,
    pipeline_run: <Play className="h-4 w-4 text-gray-500" />,
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {data.items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 p-3 border rounded-md text-sm">
            <div className="mt-0.5">
              {actionIcons[item.action] || <Clock className="h-4 w-4 text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{item.action.replace(/_/g, ' ')}</span>
                {item.lead_id !== 'pipeline' && (
                  <span className="text-xs text-muted-foreground font-mono">{item.lead_id.substring(0, 8)}...</span>
                )}
              </div>
              {item.new_value && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {typeof item.new_value === 'string'
                    ? item.new_value
                    : JSON.stringify(item.new_value).substring(0, 120)}
                </p>
              )}
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {item.performed_by === 'system' ? 'System' : item.performed_by.substring(0, 8)}
              <br />
              {new Date(item.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
