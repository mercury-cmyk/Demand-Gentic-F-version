/**
 * Transcription Worker Control Panel
 * 
 * UI component to manage the background transcription regeneration worker.
 * Allows starting/stopping the worker, viewing status, and adjusting configuration.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Play,
  Square,
  RotateCw,
  Settings,
  Loader2,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// ─── Types ─────────────────────────────────────────────────────────────

interface WorkerStatus {
  running: boolean;
  activeJobs: number;
  config: {
    concurrency: number;
    maxRetries: number;
    batchSize: number;
    batchDelayMs: number;
    strategy: 'telnyx_phone_lookup' | 'recording_url' | 'auto';
    apiEndpoint: string;
    verbose: boolean;
  };
  jobStats: {
    pending: number;
    inProgress: number;
    submitted: number;
    completed: number;
    failed: number;
    total: number;
  };
}

interface RegenerationProgress {
  pending: number;
  inProgress: number;
  submitted: number;
  completed: number;
  failed: number;
  total: number;
  progressPercent: number;
  estimatedRemainingMinutes: number;
}

// ─── Component ─────────────────────────────────────────────────────────

export function TranscriptionWorkerControl() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [newConcurrency, setNewConcurrency] = useState(3);
  const [newBatchSize, setNewBatchSize] = useState(50);
  const [newBatchDelay, setNewBatchDelay] = useState(2000);
  const [newStrategy, setNewStrategy] = useState('telnyx_phone_lookup');

  // Fetch worker status (poll every 5 seconds)
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['/api/call-intelligence/regeneration/worker/status'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/call-intelligence/regeneration/worker/status');
      return response.json();
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  // Fetch regeneration progress (poll every 5 seconds)
  const { data: progressData, isLoading: progressLoading } = useQuery({
    queryKey: ['/api/call-intelligence/regeneration/progress'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/call-intelligence/regeneration/progress');
      return response.json();
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  // Start worker mutation
  const startWorkerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/call-intelligence/regeneration/worker/start');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Worker started', description: 'Background job processor is now running' });
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence/regeneration/worker/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to start worker',
        description: error.message || 'Check server logs for details',
        variant: 'destructive',
      });
    },
  });

  // Stop worker mutation
  const stopWorkerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/call-intelligence/regeneration/worker/stop');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Worker stopped', description: 'Background job processor has stopped gracefully' });
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence/regeneration/worker/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to stop worker',
        description: error.message || 'Check server logs for details',
        variant: 'destructive',
      });
    },
  });

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial) => {
      const response = await apiRequest('POST', '/api/call-intelligence/regeneration/worker/config', newConfig);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Configuration updated', description: 'Worker settings have been applied' });
      setConfigOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence/regeneration/worker/status'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update configuration',
        description: error.message || 'Check your settings and try again',
        variant: 'destructive',
      });
    },
  });

  const status = statusData?.data;
  const progress = progressData?.data;
  const isRunning = status?.running ?? false;
  const progressPercent = progress?.progressPercent ?? 0;
  const estimatedRemaining = progress?.estimatedRemainingMinutes ?? 0;

  // Format remaining time
  const formatTime = (minutes: number) => {
    if (minutes 
      
        
          
            
              {isRunning ? (
                
              ) : (
                
              )}
              Background Regeneration Worker
            
            
              {isRunning ? 'Processing transcription regeneration jobs' : 'Worker is idle'}
            
          
          
            {isRunning ? '🟢 Running' : '🔴 Stopped'}
          
        
      

      
        {/* Progress Section */}
        {progress && (
          
            
              
                
                Overall Progress
              
              
                {progressPercent}%
              
            

            
              
                
              

              
                
                  Completed
                  {progress.completed}
                
                
                  Pending
                  {progress.pending}
                
                
                  Failed
                  {progress.failed}
                
              

              {estimatedRemaining > 0 && progressPercent 
                  
                  Estimated time remaining: {formatTime(estimatedRemaining)}
                
              )}
            
          
        )}

        {/* Status Details */}
        {status && (
          
            
              
                Active Jobs
                {status.activeJobs} / {status.config.concurrency}
              
              
                Total Jobs
                {status.jobStats.total}
              
              
                In Progress
                {status.jobStats.inProgress}
              
              
                Failure Rate
                
                  {status.jobStats.total > 0
                    ? `${Math.round((status.jobStats.failed / status.jobStats.total) * 100)}%`
                    : '0%'}
                
              
            

            {/* Failure Alert */}
            {status.jobStats.failed > 0 && status.jobStats.failed / status.jobStats.total > 0.1 && (
              
                
                
                  High failure rate detected. Check job details for error patterns.
                
              
            )}
          
        )}

        {/* Controls */}
        
           startWorkerMutation.mutate()}
            disabled={isRunning || startWorkerMutation.isPending || statusLoading}
            variant="default"
            className="flex-1"
          >
            {startWorkerMutation.isPending ? (
              
            ) : (
              
            )}
            {isRunning ? 'Running' : 'Start Worker'}
          

           stopWorkerMutation.mutate()}
            disabled={!isRunning || stopWorkerMutation.isPending}
            variant="outline"
            className="flex-1"
          >
            {stopWorkerMutation.isPending ? (
              
            ) : (
              
            )}
            Stop Worker
          

          
            
               {
                  if (status) {
                    setNewConcurrency(status.config.concurrency);
                    setNewBatchSize(status.config.batchSize);
                    setNewBatchDelay(status.config.batchDelayMs);
                    setNewStrategy(status.config.strategy);
                  }
                }}
              >
                
              
            
            
              
                Worker Configuration
                
                  Adjust worker settings without stopping. Changes apply immediately.
                
              

              
                
                  Concurrency (parallel workers)
                   setNewConcurrency(Math.min(10, Math.max(1, Number(e.target.value))))}
                  />
                  Higher = faster but more API load (1-10)
                

                
                  Batch Size
                   setNewBatchSize(Math.min(50, Math.max(1, Number(e.target.value))))}
                  />
                  Calls per API submission (1-50)
                

                
                  Batch Delay (ms)
                   setNewBatchDelay(Math.max(100, Number(e.target.value)))}
                  />
                  Delay between submissions to prevent rate limiting (≥100ms)
                

                
                  Recording Strategy
                   setNewStrategy(value)}>
                    
                      
                    
                    
                      Telnyx Phone Lookup (Recommended)
                      Existing URL Only
                      Auto (Try URL, then Telnyx)
                    
                  
                  How to find fresh recordings
                
              

              
                 setConfigOpen(false)}>
                  Cancel
                
                 {
                    updateConfigMutation.mutate({
                      concurrency: newConcurrency,
                      batchSize: newBatchSize,
                      batchDelayMs: newBatchDelay,
                      strategy: newStrategy,
                    });
                  }}
                  disabled={updateConfigMutation.isPending}
                >
                  {updateConfigMutation.isPending && }
                  Apply Configuration
                
              
            
          
        

        {/* Refresh button */}
         refetchStatus()}
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={statusLoading}
        >
          {statusLoading ? (
            
          ) : (
            
          )}
          Refresh Status
        
      
    
  );
}