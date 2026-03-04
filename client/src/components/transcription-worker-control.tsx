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
  const [newStrategy, setNewStrategy] = useState<'telnyx_phone_lookup' | 'recording_url' | 'auto'>('telnyx_phone_lookup');

  // Fetch worker status (poll every 5 seconds)
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<{
    success: boolean;
    data: WorkerStatus;
  }>({
    queryKey: ['/api/call-intelligence/regeneration/worker/status'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/call-intelligence/regeneration/worker/status');
      return response.json();
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  // Fetch regeneration progress (poll every 5 seconds)
  const { data: progressData, isLoading: progressLoading } = useQuery<{
    success: boolean;
    data: RegenerationProgress;
  }>({
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
    mutationFn: async (newConfig: Partial<WorkerStatus['config']>) => {
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
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isRunning ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
              Background Regeneration Worker
            </CardTitle>
            <CardDescription className="mt-1">
              {isRunning ? 'Processing transcription regeneration jobs' : 'Worker is idle'}
            </CardDescription>
          </div>
          <Badge variant={isRunning ? 'default' : 'secondary'}>
            {isRunning ? '🟢 Running' : '🔴 Stopped'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Section */}
        {progress && (
          <div className="space-y-3 p-3 bg-white/50 rounded-lg border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Overall Progress
              </span>
              <span className="text-lg font-bold text-blue-600">
                {progressPercent}%
              </span>
            </div>

            <div className="space-y-2">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-semibold text-green-700">{progress.completed}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Pending</span>
                  <span className="font-semibold text-amber-700">{progress.pending}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Failed</span>
                  <span className="font-semibold text-red-700">{progress.failed}</span>
                </div>
              </div>

              {estimatedRemaining > 0 && progressPercent < 100 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Estimated time remaining: <strong>{formatTime(estimatedRemaining)}</strong></span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Details */}
        {status && (
          <div className="space-y-2 p-3 bg-white/50 rounded-lg border">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Active Jobs</span>
                <div className="font-semibold">{status.activeJobs} / {status.config.concurrency}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Total Jobs</span>
                <div className="font-semibold">{status.jobStats.total}</div>
              </div>
              <div>
                <span className="text-muted-foreground">In Progress</span>
                <div className="font-semibold text-blue-600">{status.jobStats.inProgress}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Failure Rate</span>
                <div className="font-semibold">
                  {status.jobStats.total > 0
                    ? `${Math.round((status.jobStats.failed / status.jobStats.total) * 100)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* Failure Alert */}
            {status.jobStats.failed > 0 && status.jobStats.failed / status.jobStats.total > 0.1 && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-red-700">
                  High failure rate detected. Check job details for error patterns.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          <Button
            onClick={() => startWorkerMutation.mutate()}
            disabled={isRunning || startWorkerMutation.isPending || statusLoading}
            variant="default"
            className="flex-1"
          >
            {startWorkerMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isRunning ? 'Running' : 'Start Worker'}
          </Button>

          <Button
            onClick={() => stopWorkerMutation.mutate()}
            disabled={!isRunning || stopWorkerMutation.isPending}
            variant="outline"
            className="flex-1"
          >
            {stopWorkerMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Square className="h-4 w-4 mr-2" />
            )}
            Stop Worker
          </Button>

          <Dialog open={configOpen} onOpenChange={setConfigOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (status) {
                    setNewConcurrency(status.config.concurrency);
                    setNewBatchSize(status.config.batchSize);
                    setNewBatchDelay(status.config.batchDelayMs);
                    setNewStrategy(status.config.strategy);
                  }
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Worker Configuration</DialogTitle>
                <DialogDescription>
                  Adjust worker settings without stopping. Changes apply immediately.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="concurrency">Concurrency (parallel workers)</Label>
                  <Input
                    id="concurrency"
                    type="number"
                    min="1"
                    max="10"
                    value={newConcurrency}
                    onChange={(e) => setNewConcurrency(Math.min(10, Math.max(1, Number(e.target.value))))}
                  />
                  <p className="text-xs text-muted-foreground">Higher = faster but more API load (1-10)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batch-size">Batch Size</Label>
                  <Input
                    id="batch-size"
                    type="number"
                    min="1"
                    max="50"
                    value={newBatchSize}
                    onChange={(e) => setNewBatchSize(Math.min(50, Math.max(1, Number(e.target.value))))}
                  />
                  <p className="text-xs text-muted-foreground">Calls per API submission (1-50)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batch-delay">Batch Delay (ms)</Label>
                  <Input
                    id="batch-delay"
                    type="number"
                    min="100"
                    step="100"
                    value={newBatchDelay}
                    onChange={(e) => setNewBatchDelay(Math.max(100, Number(e.target.value)))}
                  />
                  <p className="text-xs text-muted-foreground">Delay between submissions to prevent rate limiting (≥100ms)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="strategy">Recording Strategy</Label>
                  <Select value={newStrategy} onValueChange={(value: any) => setNewStrategy(value)}>
                    <SelectTrigger id="strategy">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="telnyx_phone_lookup">Telnyx Phone Lookup (Recommended)</SelectItem>
                      <SelectItem value="recording_url">Existing URL Only</SelectItem>
                      <SelectItem value="auto">Auto (Try URL, then Telnyx)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">How to find fresh recordings</p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setConfigOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    updateConfigMutation.mutate({
                      concurrency: newConcurrency,
                      batchSize: newBatchSize,
                      batchDelayMs: newBatchDelay,
                      strategy: newStrategy,
                    });
                  }}
                  disabled={updateConfigMutation.isPending}
                >
                  {updateConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Apply Configuration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Refresh button */}
        <Button
          onClick={() => refetchStatus()}
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={statusLoading}
        >
          {statusLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4 mr-2" />
          )}
          Refresh Status
        </Button>
      </CardContent>
    </Card>
  );
}
