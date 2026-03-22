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
  errors?: Array;
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
  const { data: jobData, isLoading } = useQuery({
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
      
        
          
            
            Loading enrichment progress...
          
        
      
    );
  }

  const progressPercentage = job.progressPercentage || 0;
  const isActive = job.status === 'pending' || job.status === 'processing';

  return (
    
      
        
          
            {job.status === 'processing' && (
              <>
                
                Enriching Contacts...
              
            )}
            {job.status === 'pending' && (
              <>
                
                Enrichment Queued
              
            )}
            {job.status === 'completed' && (
              <>
                
                Enrichment Complete
              
            )}
            {job.status === 'failed' && (
              <>
                
                Enrichment Failed
              
            )}
            {job.status === 'cancelled' && (
              <>
                
                Enrichment Cancelled
              
            )}
          
          {isActive && (
            
              Cancel
            
          )}
        
      
      
        {/* Progress Bar */}
        
          
            Progress
            
              {progressPercentage}%
            
          
          
          
            
              {job.processedContacts} / {job.totalContacts} contacts
            
            {job.currentChunk !== undefined && job.totalChunks !== undefined && (
              
                Chunk {job.currentChunk} / {job.totalChunks}
              
            )}
          
        

        {/* Status Breakdown */}
        
          
            
              
              Success
            
            {job.successCount}
          
          
            
              
              Low Conf.
            
            {job.lowConfidenceCount}
          
          
            
              
              Skipped
            
            {job.skippedCount}
          
          
            
              
              Failed
            
            {job.failedCount}
          
        

        {/* Deduplication Stats */}
        {job.dedupeSnapshot && (
          
            
              Account Deduplication
              
                {job.dedupeSnapshot.totalAccounts} accounts
              
            
            
              
                Already Enriched:
                
                  {job.dedupeSnapshot.alreadyEnriched}
                
              
              
                Needs Enrichment:
                
                  {job.dedupeSnapshot.needsEnrichment}
                
              
            
            {job.dedupeSnapshot.alreadyEnriched > 0 && (
              
                Saved {job.dedupeSnapshot.alreadyEnriched} API calls through deduplication
              
            )}
          
        )}

        {/* Error Message */}
        {job.status === 'failed' && job.errorMessage && (
          
            {job.errorMessage}
          
        )}

        {/* Recent Errors */}
        {job.errors && job.errors.length > 0 && (
          
            
              Recent Errors ({job.errors.length})
            
            
              {job.errors.slice(0, 5).map((error, i) => (
                
                  {error.name}
                  {error.error}
                
              ))}
              {job.errors.length > 5 && (
                
                  ...and {job.errors.length - 5} more errors
                
              )}
            
          
        )}
      
    
  );
}