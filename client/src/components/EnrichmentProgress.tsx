/**
 * Enrichment Progress Component
 * 
 * Real-time progress tracking for verification contact enrichment jobs
 * Features:
 * - Live polling of job status via TanStack Query
 * - Progress bar with percentage
 * - Status breakdown (success/low-confidence/skipped/failed)
 * - Deduplication statistics
 * - Cancel job button
 * - Toast notifications on completion
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, AlertCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface EnrichmentProgressProps {
  jobId: string;
  campaignId: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

interface EnrichmentJob {
  id: string;
  campaignId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalContacts: number;
  totalAccounts: number;
  processedContacts: number;
  processedAccounts: number;
  currentChunk?: number;
  totalChunks?: number;
  successCount: number;
  lowConfidenceCount: number;
  failedCount: number;
  skippedCount: number;
  dedupeSnapshot?: {
    totalAccounts: number;
    alreadyEnriched: number;
    needsEnrichment: number;
  };
  errors?: Array<{
    contactId: string;
    accountId: string;
    name: string;
    error: string;
  }>;
  errorMessage?: string;
  progressPercentage: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export function EnrichmentProgress({ jobId, campaignId, onComplete, onCancel }: EnrichmentProgressProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Poll job status every 2 seconds
  const { data: jobData, isLoading } = useQuery<{ success: boolean; job: EnrichmentJob }>({
    queryKey: ['/api/enrichment-jobs', jobId],
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      // Stop polling when job is complete, failed, or cancelled
      if (job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
    enabled: !!jobId,
  });

  const job = jobData?.job;

  // Handle completion/failure
  useEffect(() => {
    if (!job) return;

    if (job.status === 'completed') {
      // Invalidate campaign queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/verification-campaigns', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'enrichment-jobs'] });

      // Show completion notification
      toast({
        title: "Enrichment Complete ✓",
        description: `${job.successCount} contacts enriched successfully${job.lowConfidenceCount > 0 ? `, ${job.lowConfidenceCount} with low confidence` : ''}${job.failedCount > 0 ? `, ${job.failedCount} failed` : ''}`,
      });

      onComplete?.();
    } else if (job.status === 'failed') {
      toast({
        variant: "destructive",
        title: "Enrichment Failed",
        description: job.errorMessage || "Enrichment job failed to complete",
      });

      onComplete?.();
    } else if (job.status === 'cancelled') {
      toast({
        title: "Enrichment Cancelled",
        description: "The enrichment job was cancelled",
      });

      onComplete?.();
    }
  }, [job?.status, job?.successCount, job?.lowConfidenceCount, job?.failedCount, job?.errorMessage, campaignId, queryClient, toast, onComplete]);

  // Handle cancel job
  const handleCancel = async () => {
    try {
      await apiRequest('POST', `/api/enrichment-jobs/${jobId}/cancel`);

      toast({
        title: "Job Cancellation Requested",
        description: "The enrichment job is being cancelled",
      });

      // Invalidate queries to refresh job status
      queryClient.invalidateQueries({ queryKey: ['/api/enrichment-jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'enrichment-jobs'] });

      onCancel?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Cancellation Failed",
        description: error.message || "Failed to cancel enrichment job",
      });
    }
  };

  if (isLoading || !job) {
    return (
      <Card data-testid="enrichment-progress-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading enrichment progress...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const progressPercentage = job.progressPercentage || 0;
  const isActive = job.status === 'pending' || job.status === 'processing';

  return (
    <Card data-testid="enrichment-progress-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {job.status === 'processing' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" data-testid="icon-processing" />
                <span>Enriching Contacts...</span>
              </>
            )}
            {job.status === 'pending' && (
              <>
                <Loader2 className="h-4 w-4" data-testid="icon-pending" />
                <span>Enrichment Queued</span>
              </>
            )}
            {job.status === 'completed' && (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" data-testid="icon-completed" />
                <span>Enrichment Complete</span>
              </>
            )}
            {job.status === 'failed' && (
              <>
                <XCircle className="h-4 w-4 text-destructive" data-testid="icon-failed" />
                <span>Enrichment Failed</span>
              </>
            )}
            {job.status === 'cancelled' && (
              <>
                <X className="h-4 w-4 text-muted-foreground" data-testid="icon-cancelled" />
                <span>Enrichment Cancelled</span>
              </>
            )}
          </CardTitle>
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              data-testid="button-cancel-job"
            >
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono" data-testid="text-progress-percentage">
              {progressPercentage}%
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" data-testid="progress-bar" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span data-testid="text-contacts-processed">
              {job.processedContacts} / {job.totalContacts} contacts
            </span>
            {job.currentChunk !== undefined && job.totalChunks !== undefined && (
              <span data-testid="text-chunks-processed">
                Chunk {job.currentChunk} / {job.totalChunks}
              </span>
            )}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1 rounded-md border p-2" data-testid="stat-success">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs text-muted-foreground">Success</span>
            </div>
            <span className="text-lg font-semibold">{job.successCount}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border p-2" data-testid="stat-low-confidence">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
              <span className="text-xs text-muted-foreground">Low Conf.</span>
            </div>
            <span className="text-lg font-semibold">{job.lowConfidenceCount}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border p-2" data-testid="stat-skipped">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs text-muted-foreground">Skipped</span>
            </div>
            <span className="text-lg font-semibold">{job.skippedCount}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border p-2" data-testid="stat-failed">
            <div className="flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs text-muted-foreground">Failed</span>
            </div>
            <span className="text-lg font-semibold">{job.failedCount}</span>
          </div>
        </div>

        {/* Deduplication Stats */}
        {job.dedupeSnapshot && (
          <div className="rounded-md bg-muted/50 p-3 space-y-2" data-testid="dedupe-stats">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Account Deduplication</span>
              <Badge variant="secondary" data-testid="badge-accounts-total">
                {job.dedupeSnapshot.totalAccounts} accounts
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Already Enriched:</span>
                <span className="font-mono" data-testid="text-already-enriched">
                  {job.dedupeSnapshot.alreadyEnriched}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Needs Enrichment:</span>
                <span className="font-mono" data-testid="text-needs-enrichment">
                  {job.dedupeSnapshot.needsEnrichment}
                </span>
              </div>
            </div>
            {job.dedupeSnapshot.alreadyEnriched > 0 && (
              <p className="text-xs text-muted-foreground">
                Saved {job.dedupeSnapshot.alreadyEnriched} API calls through deduplication
              </p>
            )}
          </div>
        )}

        {/* Error Message */}
        {job.status === 'failed' && job.errorMessage && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid="error-message">
            {job.errorMessage}
          </div>
        )}

        {/* Recent Errors */}
        {job.errors && job.errors.length > 0 && (
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Recent Errors ({job.errors.length})
            </summary>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {job.errors.slice(0, 5).map((error, i) => (
                <div key={i} className="border-l-2 border-destructive pl-2">
                  <div className="font-medium">{error.name}</div>
                  <div>{error.error}</div>
                </div>
              ))}
              {job.errors.length > 5 && (
                <div className="text-center pt-1">
                  ...and {job.errors.length - 5} more errors
                </div>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
