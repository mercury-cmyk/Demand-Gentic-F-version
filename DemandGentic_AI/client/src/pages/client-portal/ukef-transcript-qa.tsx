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
  evidenceSnippets: Array;
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

async function fetchApi(path: string, options?: RequestInit): Promise {
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
  const variants: Record = {
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
  return {v.label};
}

// ─── Sub-Views ──────────────────────────────────────────────────────────────

type SubView = 'overview' | 'review-queue' | 'audit-log';

// ─── Main Component ──────────────────────────────────────────────────────────

export function UkefTranscriptQaContent() {
  const [subView, setSubView] = useState('overview');
  const [reviewPage, setReviewPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [selectedTask, setSelectedTask] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [overrideDisposition, setOverrideDisposition] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ─── Queries ───────────────────────────────────────────────────────────────

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['ukef-tqa-status'],
    queryFn: () => fetchApi('/status'),
    staleTime: 30_000,
  });

  const {
    data: reviewQueue,
    isLoading: reviewLoading,
    refetch: refetchReview,
  } = useQuery({
    queryKey: ['ukef-tqa-review-queue', reviewPage],
    queryFn: () => fetchApi(`/review-queue?page=${reviewPage}&pageSize=20`),
    enabled: subView === 'review-queue',
    staleTime: 15_000,
  });

  const {
    data: auditLog,
    isLoading: auditLoading,
  } = useQuery({
    queryKey: ['ukef-tqa-audit-log', auditPage],
    queryFn: () => fetchApi(`/audit-log?page=${auditPage}&pageSize=50`),
    enabled: subView === 'audit-log',
    staleTime: 30_000,
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const runPipeline = useMutation({
    mutationFn: () => fetchApi('/run', { method: 'POST' }),
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

  const reviewAction = useMutation({
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
    
      {/* Header */}
      
        
          Transcript Quality & Disposition Validation
          
            Assess transcript quality, retranscribe recordings, and validate call dispositions
          
        
        
           refetchStatus()} disabled={statusLoading}>
            
            Refresh
          
           runPipeline.mutate()}
            disabled={isAnyRunning}
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
          >
            {runPipeline.isPending ? (
              
            ) : (
              
            )}
            Run Full Pipeline
          
        
      

      {/* Sub-navigation */}
      
         setSubView('overview')}
        >
          
          Overview
        
         setSubView('review-queue')}
        >
          
          Review Queue
          {status && status.reviewQueue > 0 && (
            
              {status.reviewQueue}
            
          )}
        
         setSubView('audit-log')}
        >
          
          Audit Log
        
      

      {/* Overview */}
      {subView === 'overview' && (
         assessOnly.mutate()}
          onRetranscribe={() => retranscribeOnly.mutate()}
          onValidate={() => validateOnly.mutate()}
        />
      )}

      {/* Review Queue */}
      {subView === 'review-queue' && (
        
      )}

      {/* Audit Log */}
      {subView === 'audit-log' && (
        
      )}

      {/* Review Dialog */}
      {selectedTask && (
         { setSelectedTask(null); setReviewNotes(''); setOverrideDisposition(''); }}
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
      
        
      
    );
  }

  if (!status) {
    return (
      
        
          
            
            No pipeline data yet. Run the pipeline to start assessing transcripts.
          
        
      
    );
  }

  return (
    
      {/* Summary Cards */}
      
        
          
            
              
              Total Assessed
            
            {status.totalAssessed}
          
        
        
          
            
              
              Retranscription Queue
            
            {status.retranscriptionQueue}
          
        
        
          
            
              
              Review Queue
            
            {status.reviewQueue}
          
        
        
          
            
              
              Last Run
            
            
              {status.lastRun ? new Date(status.lastRun).toLocaleString() : 'Never'}
            
          
        
      

      {/* Transcript Quality Breakdown */}
      
        
          
            Transcript Quality
            Quality assessment by status
          
          
            
              {Object.entries(status.transcriptStats).map(([key, value]) => (
                
                  
                    {key === 'complete' && }
                    {key === 'partial' && }
                    {key === 'missing' && }
                    {key === 'failed' && }
                    {key}
                  
                  {value}
                
              ))}
            
          
        

        
          
            Disposition Validation
            Validation results by status
          
          
            
              {Object.entries(status.dispositionStats).map(([key, value]) => (
                
                  
                    {key === 'validated' && }
                    {key === 'mismatch' && }
                    {key === 'pending' && }
                    {key === 'auto_corrected' && }
                    {key === 'reviewed' && }
                    {dispositionLabel(key)}
                  
                  {value}
                
              ))}
            
          
        
      

      {/* Individual Pipeline Actions */}
      
        
          Pipeline Actions
          Run individual pipeline stages
        
        
          
            
              
              Assess Quality
            
            
              
              Retranscribe
            
            
              
              Validate Dispositions
            
          
        
      
    
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
      
        
      
    );
  }

  if (!data || data.items.length === 0) {
    return (
      
        
          
            
            No items in the review queue
            All disposition validations are resolved
          
        
      
    );
  }

  const totalPages = Math.ceil(data.total / data.pageSize);

  return (
    
      
        
          {data.total} item{data.total !== 1 ? 's' : ''} requiring review
        
        
          
          Refresh
        
      

      
        {data.items.map((item) => (
           onSelect(item)}>
            
              
                
                  
                    {item.contactName || 'Unknown Contact'}
                    {item.contactEmail && (
                      {item.contactEmail}
                    )}
                  
                  {item.campaignName && (
                    {item.campaignName}
                  )}
                  
                    
                      Current: 
                      {dispositionLabel(item.existingDisposition)}
                    
                    
                    
                      Recommended: 
                      {dispositionLabel(item.recommendedDisposition)}
                    
                  
                  {item.rationale && (
                    {item.rationale}
                  )}
                
                
                  {item.callSessionId && (
                    
                  )}
                  = 0.9 ? 'default' :
                    (item.confidence || 0) >= 0.7 ? 'secondary' : 'destructive'
                  }>
                    {formatConfidence(item.confidence)}
                  
                  
                    
                  
                
              
            
          
        ))}
      

      {/* Pagination */}
      {totalPages > 1 && (
        
           onPageChange(page - 1)}>
            
          
          
            Page {page} of {totalPages}
          
          = totalPages} onClick={() => onPageChange(page + 1)}>
            
          
        
      )}
    
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
    
      
        
          Disposition Review
          
            Review the AI-recommended disposition and decide how to proceed
          
        

        
          {/* Contact Info */}
          
            
              Contact
              {task.contactName || 'Unknown'}
              {task.contactEmail && {task.contactEmail}}
            
            
              Campaign
              {task.campaignName || '—'}
            
          

          

          {/* Disposition Comparison */}
          
            
              
                Current Disposition
                {dispositionLabel(task.existingDisposition)}
              
            
            
              
                AI Recommended
                {dispositionLabel(task.recommendedDisposition)}
                Confidence: {formatConfidence(task.confidence)}
              
            
          

          {/* Rationale */}
          {task.rationale && (
            
              AI Rationale
              {task.rationale}
            
          )}

          {/* Evidence Snippets */}
          {task.evidenceSnippets && task.evidenceSnippets.length > 0 && (
            
              Evidence
              
                {task.evidenceSnippets.map((snippet, idx) => (
                  
                    "{snippet.quote}"
                    {snippet.relevance}
                  
                ))}
              
            
          )}

          {/* Transcript Preview */}
          {task.transcriptPreview && (
            
              Transcript Preview
              {task.transcriptPreview}...
            
          )}

          

          {/* Review Notes */}
          
            Review Notes (optional)
             onReviewNotesChange(e.target.value)}
              placeholder="Add notes about your review decision..."
              rows={2}
            />
          

          {/* Override Disposition */}
          {showOverride && (
            
              Override Disposition
              
                
                  
                
                
                  Qualified Lead
                  Not Interested
                  Do Not Call
                  Voicemail
                  No Answer
                  Invalid Data
                  Needs Review
                  Callback Requested
                
              
            
          )}
        

        
          {!showOverride ? (
             setShowOverride(true)} disabled={isSubmitting}>
              
              Override
            
          ) : (
             onAction('override')}
              disabled={!overrideDisposition || isSubmitting}
            >
              {isSubmitting ?  : }
              Apply Override
            
          )}
          
             onAction('reject')} disabled={isSubmitting}>
              
              Keep Current
            
             onAction('accept')} disabled={isSubmitting}
              className="bg-gradient-to-r from-green-500 to-emerald-600">
              {isSubmitting ?  : }
              Accept Recommendation
            
          
        
      
    
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
      
        
      
    );
  }

  if (!data || data.items.length === 0) {
    return (
      
        
          
            
            No audit log entries yet
          
        
      
    );
  }

  const totalPages = Math.ceil(data.total / data.pageSize);

  const actionIcons: Record = {
    retranscribe: ,
    validate_disposition: ,
    auto_correct: ,
    manual_review: ,
    pipeline_run: ,
  };

  return (
    
      
        {data.items.map((item) => (
          
            
              {actionIcons[item.action] || }
            
            
              
                {item.action.replace(/_/g, ' ')}
                {item.lead_id !== 'pipeline' && (
                  {item.lead_id.substring(0, 8)}...
                )}
              
              {item.new_value && (
                
                  {typeof item.new_value === 'string'
                    ? item.new_value
                    : JSON.stringify(item.new_value).substring(0, 120)}
                
              )}
            
            
              {item.performed_by === 'system' ? 'System' : item.performed_by.substring(0, 8)}
              
              {new Date(item.created_at).toLocaleString()}
            
          
        ))}
      

      {totalPages > 1 && (
        
           onPageChange(page - 1)}>
            
          
          
            Page {page} of {totalPages}
          
          = totalPages} onClick={() => onPageChange(page + 1)}>
            
          
        
      )}
    
  );
}