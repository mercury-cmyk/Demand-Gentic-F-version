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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  byCampaign: Record;
  byDisposition: Record;
  sample: Array;
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
  recentErrors: Array;
}

interface JobListResponse {
  jobs: Array;
}

// ─── Component ─────────────────────────────────────────────────────────

export function BatchTranscriptionPanel({
  campaigns,
}: {
  campaigns: Array;
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
  const [activeJobId, setActiveJobId] = useState(null);

  // ── Preview query ──
  const [previewTriggered, setPreviewTriggered] = useState(false);

  const previewQuery = useQuery({
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
  const jobQuery = useQuery({
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
  const jobsQuery = useQuery({
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
    
      {/* ── Filters & Preview ── */}
      
        
          
            
            Bulk Transcription Backfill
          
          
            Find untranscribed calls with recordings and process them through transcription + AI analysis + disposition correction.
          
        
        
          {/* Filter Row */}
          
            
              Campaign
              
                
                  
                
                
                  All campaigns
                  {campaigns.map((c) => (
                    {c.name}
                  ))}
                
              
            

            
              Min Duration (sec)
               setMinDuration(Number(e.target.value) || 20)}
                min={5}
              />
            

            
              From Date
               setDateFrom(e.target.value)}
              />
            

            
              To Date
               setDateTo(e.target.value)}
              />
            

            
              Max Calls
               setLimit(Number(e.target.value) || 500)}
                min={1}
                max={2000}
              />
            

            
              Concurrency
               setConcurrency(Number(v))}>
                
                  
                
                
                  {[1, 3, 5, 8, 10].map((n) => (
                    {n} parallel
                  ))}
                
              
            
          

          {/* Options Row */}
          
            
               setIncludeFailedTranscriptions(!!v)}
              />
              Include previously failed transcriptions
            
            
               setSkipAnalysis(!!v)}
              />
              Skip analysis (transcribe only)
            

            

             setPreviewTriggered(true)}
              disabled={previewQuery.isFetching}
            >
              {previewQuery.isFetching ? (
                
              ) : (
                
              )}
              Preview
            

             runMutation.mutate()}
              disabled={runMutation.isPending || isJobRunning}
            >
              {runMutation.isPending ? (
                
              ) : (
                
              )}
              {isJobRunning ? 'Job Running...' : 'Run Batch'}
            
          
        
      

      {/* ── Preview Results ── */}
      {preview && preview.count > 0 && !isJobRunning && (
        
          
            
              
              Preview: {preview.count} calls need transcription
            
          
          
            
              {/* By Campaign */}
              
                By Campaign
                
                  {Object.entries(preview.byCampaign)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([id, count]) => {
                      const name = campaigns.find((c) => c.id === id)?.name || id.slice(0, 12) + '...';
                      return (
                        
                          {name}
                          {count}
                        
                      );
                    })}
                
              

              {/* By Disposition */}
              
                By Disposition
                
                  {Object.entries(preview.byDisposition)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([disp, count]) => (
                      
                        {disp || 'none'}
                        {count}
                      
                    ))}
                
              
            
          
        
      )}

      {preview && preview.count === 0 && !isJobRunning && (
        
          
            
            All calls are transcribed
            No untranscribed calls matching your filters
          
        
      )}

      {/* ── Active Job Progress ── */}
      {job && (
        
          
            
              
                {job.status === 'running' && }
                {job.status === 'completed' && }
                {job.status === 'failed' && }
                Batch Job: {job.id.slice(0, 20)}...
              
              
                {job.status}
              
            
          
          
            {/* Progress Bar */}
            
              
                {job.processed} / {job.total} processed
                {Math.round(jobProgress)}%
              
              
            

            {/* Stats Grid */}
            
              } />
              } />
              } />
              } />
              }
                isText
              />
            

            {/* Rate info */}
            {job.status === 'running' && (
              
                Processing at {job.ratePerSec} calls/sec | Batch {job.currentBatch}/{job.totalBatches}
              
            )}

            {/* Recent Errors */}
            {job.recentErrors && job.recentErrors.length > 0 && (
              
                Recent Errors
                
                  {job.recentErrors.map((err, i) => (
                    
                      {err.callAttemptId.slice(0, 12)}... - {err.error}
                    
                  ))}
                
              
            )}
          
        
      )}

      {/* ── Job History ── */}
      {jobsQuery.data && jobsQuery.data.jobs.length > 0 && (
        
          
            
              
                
                Job History
              
               queryClient.invalidateQueries({ queryKey: ['batch-transcription-jobs'] })}
              >
                Refresh
              
            
          
          
            
              {jobsQuery.data.jobs
                .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
                .slice(0, 5)
                .map((j) => (
                   setActiveJobId(j.id)}
                  >
                    
                      
                        {j.status}
                      
                      
                        {new Date(j.startedAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      
                    
                    
                      {j.transcribed} transcribed
                      {j.analyzed} analyzed
                      {j.failed > 0 && {j.failed} failed}
                      / {j.total}
                    
                  
                ))}
            
          
        
      )}

      {/* ── Maintenance Sweeps ── */}
      
        
          
            
            Maintenance Sweeps
          
          
            Run one-off cleanup tasks. These also run automatically in the background on a schedule.
          
        
        
          
            {/* Orphan Recording Sweep */}
            
              
                
                  
                    
                    Orphan Recording Sweep
                  
                  
                    Finds call sessions with recordings not linked to any call attempt, matches them, and transcribes + analyzes.
                  
                
              
              
                  `Processed ${data.processed ?? 0}, transcribed ${data.transcribed ?? 0}, analyzed ${data.analyzed ?? 0}, skipped ${data.skipped ?? 0}`
                }
              />
            

            {/* Stale Ring-out Cleanup */}
            
              
                
                  
                    
                    Stale Ring-out Cleanup
                  
                  
                    Marks 0-duration, non-connected calls with no disposition as "no_answer" so they stop showing as pending.
                  
                
              
               `Marked ${data.marked ?? 0} calls as no_answer`}
              />
            
          
        
      

      {/* Pipeline Info */}
      
        
          
            
            
              Pipeline: Each call goes through: Recording URL resolution (GCS/Telnyx) &rarr; Transcription (Telnyx Whisper STT) &rarr; AI Analysis (quality scoring, turn metrics) &rarr; Disposition auto-correction
              Auto-sweep: A background job runs every 30 minutes to automatically catch orphaned untranscribed calls (up to 20 per sweep).
            
          
        
      
    
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
    
      {icon}
      
        {value}
        {label}
      
    
  );
}

function SweepButton({
  endpoint,
  label,
  formatResult,
}: {
  endpoint: string;
  label: string;
  formatResult: (data: any) => string;
}) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', endpoint);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Sweep completed', description: formatResult(data) });
    },
    onError: (err: any) => {
      toast({ title: 'Sweep failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    
       mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? (
          
        ) : (
          
        )}
        {label}
      
      {mutation.isSuccess && (
        
          
          {formatResult(mutation.data)}
        
      )}
      {mutation.isError && (
        
          
          Failed
        
      )}
    
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