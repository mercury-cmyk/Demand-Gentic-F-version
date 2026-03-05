/**
 * Batch Transcription Panel
 *
 * UI for managing bulk transcription backfill of untranscribed calls.
 * Shows preview counts, lets you run batch jobs, and polls for live progress.
 * After transcription, each call is automatically analyzed and re-dispositioned.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Play,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  FileAudio,
  BarChart3,
  RefreshCw,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────

interface PreviewResult {
  success: boolean;
  count: number;
  byCampaign: Record<string, number>;
  byDisposition: Record<string, number>;
  sample: Array<{
    callAttemptId: string;
    duration: number;
    disposition: string;
    hasRecording: boolean;
    createdAt: string;
  }>;
}

interface BatchJob {
  id: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  total: number;
  transcribed: number;
  analyzed: number;
  failed: number;
  skipped: number;
  processed: number;
  currentBatch: number;
  totalBatches: number;
  elapsedMs: number;
  ratePerSec: string;
  etaMs: number;
  etaHuman: string;
  recentErrors: Array<{ callAttemptId: string; error: string }>;
}

interface JobListResponse {
  jobs: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    total: number;
    transcribed: number;
    analyzed: number;
    failed: number;
    skipped: number;
  }>;
}

// ─── Component ─────────────────────────────────────────────────────────

export function BatchTranscriptionPanel({
  campaigns,
}: {
  campaigns: Array<{ id: string; name: string }>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Form state ──
  const [campaignId, setCampaignId] = useState('');
  const [minDuration, setMinDuration] = useState(20);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [concurrency, setConcurrency] = useState(5);
  const [limit, setLimit] = useState(500);
  const [includeFailedTranscriptions, setIncludeFailedTranscriptions] = useState(true);
  const [skipAnalysis, setSkipAnalysis] = useState(false);

  // ── Active job tracking ──
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // ── Preview query ──
  const [previewTriggered, setPreviewTriggered] = useState(false);

  const previewQuery = useQuery<PreviewResult>({
    queryKey: ['batch-transcription-preview', campaignId, minDuration, dateFrom, dateTo, includeFailedTranscriptions, limit],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/batch-transcription/preview', {
        campaignId: campaignId || undefined,
        minDurationSec: minDuration,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        includeFailedTranscriptions,
        limit,
      });
      return res.json();
    },
    enabled: previewTriggered,
    staleTime: 30000,
  });

  // ── Active job polling ──
  const jobQuery = useQuery<BatchJob>({
    queryKey: ['batch-transcription-job', activeJobId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/batch-transcription/job/${activeJobId}`);
      return res.json();
    },
    enabled: !!activeJobId,
    refetchInterval: activeJobId ? 3000 : false,
  });

  // Stop polling when job is done
  useEffect(() => {
    if (jobQuery.data && jobQuery.data.status !== 'running') {
      // Keep polling for a couple more seconds to get final stats, then stop
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['batch-transcription-job', activeJobId] });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [jobQuery.data?.status]);

  // ── Job history ──
  const jobsQuery = useQuery<JobListResponse>({
    queryKey: ['batch-transcription-jobs'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/batch-transcription/jobs');
      return res.json();
    },
    staleTime: 30000,
  });

  // ── Run mutation ──
  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/batch-transcription/run', {
        campaignId: campaignId || undefined,
        minDurationSec: minDuration,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        includeFailedTranscriptions,
        concurrency,
        limit,
        skipAnalysis,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.jobId) {
        setActiveJobId(data.jobId);
        toast({
          title: 'Batch job started',
          description: `Processing ${data.total} calls. Job ID: ${data.jobId}`,
        });
      } else {
        toast({ title: 'No calls to process', description: data.message });
      }
      queryClient.invalidateQueries({ queryKey: ['batch-transcription-jobs'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to start batch job',
        description: err.message || 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const preview = previewQuery.data;
  const job = jobQuery.data;
  const isJobRunning = job?.status === 'running';
  const jobProgress = job ? ((job.processed / Math.max(job.total, 1)) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ── Filters & Preview ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Bulk Transcription Backfill
          </CardTitle>
          <CardDescription className="text-xs">
            Find untranscribed calls with recordings and process them through transcription + AI analysis + disposition correction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All campaigns</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Min Duration (sec)</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={minDuration}
                onChange={(e) => setMinDuration(Number(e.target.value) || 20)}
                min={5}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Max Calls</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 500)}
                min={1}
                max={2000}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Concurrency</Label>
              <Select value={String(concurrency)} onValueChange={(v) => setConcurrency(Number(v))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 3, 5, 8, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} parallel</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Options Row */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={includeFailedTranscriptions}
                onCheckedChange={(v) => setIncludeFailedTranscriptions(!!v)}
              />
              Include previously failed transcriptions
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={skipAnalysis}
                onCheckedChange={(v) => setSkipAnalysis(!!v)}
              />
              Skip analysis (transcribe only)
            </label>

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setPreviewTriggered(true)}
              disabled={previewQuery.isFetching}
            >
              {previewQuery.isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Search className="h-3.5 w-3.5 mr-1.5" />
              )}
              Preview
            </Button>

            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || isJobRunning}
            >
              {runMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isJobRunning ? 'Job Running...' : 'Run Batch'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Preview Results ── */}
      {preview && preview.count > 0 && !isJobRunning && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileAudio className="h-4 w-4" />
              Preview: {preview.count} calls need transcription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* By Campaign */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">By Campaign</h4>
                <div className="space-y-1">
                  {Object.entries(preview.byCampaign)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([id, count]) => {
                      const name = campaigns.find((c) => c.id === id)?.name || id.slice(0, 12) + '...';
                      return (
                        <div key={id} className="flex items-center justify-between text-xs">
                          <span className="truncate max-w-[200px]">{name}</span>
                          <Badge variant="secondary" className="text-[10px] h-5">{count}</Badge>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* By Disposition */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">By Disposition</h4>
                <div className="space-y-1">
                  {Object.entries(preview.byDisposition)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([disp, count]) => (
                      <div key={disp} className="flex items-center justify-between text-xs">
                        <span className="truncate max-w-[200px]">{disp || 'none'}</span>
                        <Badge variant="outline" className="text-[10px] h-5">{count}</Badge>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {preview && preview.count === 0 && !isJobRunning && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-700">All calls are transcribed</p>
            <p className="text-xs text-green-600 mt-1">No untranscribed calls matching your filters</p>
          </CardContent>
        </Card>
      )}

      {/* ── Active Job Progress ── */}
      {job && (
        <Card className={job.status === 'running' ? 'border-blue-200' : job.status === 'completed' ? 'border-green-200' : 'border-red-200'}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                {job.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {job.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {job.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                Batch Job: {job.id.slice(0, 20)}...
              </CardTitle>
              <Badge
                variant={job.status === 'running' ? 'default' : job.status === 'completed' ? 'secondary' : 'destructive'}
                className="text-[10px]"
              >
                {job.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{job.processed} / {job.total} processed</span>
                <span>{Math.round(jobProgress)}%</span>
              </div>
              <Progress value={jobProgress} className="h-2" />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Transcribed" value={job.transcribed} icon={<CheckCircle2 className="h-3.5 w-3.5 text-green-500" />} />
              <StatCard label="Analyzed" value={job.analyzed} icon={<BarChart3 className="h-3.5 w-3.5 text-blue-500" />} />
              <StatCard label="Failed" value={job.failed} icon={<XCircle className="h-3.5 w-3.5 text-red-500" />} />
              <StatCard label="Skipped" value={job.skipped} icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />} />
              <StatCard
                label="ETA"
                value={job.status === 'running' ? job.etaHuman : formatElapsed(job.elapsedMs)}
                icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                isText
              />
            </div>

            {/* Rate info */}
            {job.status === 'running' && (
              <div className="text-xs text-muted-foreground">
                Processing at {job.ratePerSec} calls/sec | Batch {job.currentBatch}/{job.totalBatches}
              </div>
            )}

            {/* Recent Errors */}
            {job.recentErrors && job.recentErrors.length > 0 && (
              <div className="mt-2">
                <h4 className="text-xs font-medium text-red-600 mb-1">Recent Errors</h4>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {job.recentErrors.map((err, i) => (
                    <div key={i} className="text-[10px] text-red-500 truncate">
                      {err.callAttemptId.slice(0, 12)}... - {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Job History ── */}
      {jobsQuery.data && jobsQuery.data.jobs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Job History
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['batch-transcription-jobs'] })}
              >
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {jobsQuery.data.jobs
                .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
                .slice(0, 5)
                .map((j) => (
                  <div
                    key={j.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 cursor-pointer hover:bg-muted/50 px-2 rounded"
                    onClick={() => setActiveJobId(j.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={j.status === 'completed' ? 'secondary' : j.status === 'running' ? 'default' : 'destructive'}
                        className="text-[9px] h-4 px-1.5"
                      >
                        {j.status}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(j.startedAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-green-600">{j.transcribed} transcribed</span>
                      <span className="text-blue-600">{j.analyzed} analyzed</span>
                      {j.failed > 0 && <span className="text-red-500">{j.failed} failed</span>}
                      <span className="text-muted-foreground">/ {j.total}</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Info */}
      <Card className="bg-muted/30">
        <CardContent className="py-3">
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Pipeline:</strong> Each call goes through: Recording URL resolution (GCS/Telnyx) &rarr; Transcription (Telnyx Whisper STT) &rarr; AI Analysis (quality scoring, turn metrics) &rarr; Disposition auto-correction</p>
              <p><strong>Auto-sweep:</strong> A background job runs every 30 minutes to automatically catch orphaned untranscribed calls (up to 20 per sweep).</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  isText,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  isText?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
      {icon}
      <div>
        <div className={`font-semibold ${isText ? 'text-xs' : 'text-sm'}`}>{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}
