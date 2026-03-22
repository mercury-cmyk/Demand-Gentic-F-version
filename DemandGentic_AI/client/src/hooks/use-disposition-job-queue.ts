import { useState, useCallback, useEffect, useRef } from 'react';

export interface JobStatus {
  jobId: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  processed: number;
  total: number;
  estimatedSecondsRemaining: number;
  error?: string;
}

export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed';
  totalCalls: number;
  totalShouldChange: number;
  result: any[];
  executionTimeSeconds: number;
  error?: string;
}

/**
 * Hook for scheduling and managing disposition analysis jobs
 * Returns job ID immediately ((null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);

  const scheduleJob = useCallback(
    async (
      endpoint: 'queue/preview' | 'queue/apply',
      filters: Record,
      token?: string
    ) => {
      setIsScheduling(true);
      setScheduleError(null);

      try {
        const response = await fetch(
          `/api/disposition-reanalysis/${endpoint}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(filters),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Schedule failed: ${response.status} - ${errorText}`);
        }

        const { jobId: jid, estimatedSeconds } = await response.json();
        setJobId(jid);
        return { jobId: jid, estimatedSeconds };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setScheduleError(errorMessage);
        console.error('[useAnalysisJob] Schedule error:', error);
        throw error;
      } finally {
        setIsScheduling(false);
      }
    },
    []
  );

  const resetJob = useCallback(() => {
    setJobId(null);
    setScheduleError(null);
  }, []);

  return {
    jobId,
    isScheduling,
    scheduleError,
    scheduleJob,
    resetJob,
  };
}

/**
 * Hook for polling job status with smart frequency adjustment
 * Reduces polling frequency as job approaches completion
 */
export function useJobPolling(
  jobId: string | null,
  options?: {
    autoPoll?: boolean;
    onStatusChange?: (status: JobStatus) => void;
    token?: string;
  }
) {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollingIntervalRef = useRef(null);
  const lastStatusRef = useRef(null);

  const { autoPoll = true, onStatusChange, token } = options || {};

  const pollStatus = useCallback(async () => {
    if (!jobId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/disposition-reanalysis/queue/job/${jobId}/status`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Job not found');
        }
        throw new Error(`Status check failed: ${response.status}`);
      }

      const newStatus = await response.json();
      setStatus(newStatus);

      // Notify on status change
      if (
        onStatusChange &&
        (!lastStatusRef.current ||
          lastStatusRef.current.status !== newStatus.status ||
          lastStatusRef.current.processed !== newStatus.processed)
      ) {
        onStatusChange(newStatus);
      }

      lastStatusRef.current = newStatus;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[useJobPolling] Poll error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobId, onStatusChange, token]);

  // Auto-polling effect
  useEffect(() => {
    if (!jobId || !autoPoll) return;

    // Poll immediately
    pollStatus();

    // Set up interval with smart frequency adjustment
    const setupInterval = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      // Determine polling frequency based on estimated time remaining
      let pollInterval = 500; // 500ms default

      if (status) {
        if (status.status === 'completed' || status.status === 'failed') {
          // Stop polling when done
          return;
        }

        const remaining = status.estimatedSecondsRemaining;
        if (remaining > 30) {
          pollInterval = 2000; // Poll every 2s if >30s remaining
        } else if (remaining > 10) {
          pollInterval = 1000; // Poll every 1s if >10s remaining
        } else {
          pollInterval = 500; // Poll every 0.5s if  {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [jobId, autoPoll, status, pollStatus]);

  const manualPoll = useCallback(() => {
    return pollStatus();
  }, [pollStatus]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const isComplete = status && (status.status === 'completed' || status.status === 'failed');

  return {
    status,
    isLoading,
    error,
    isComplete,
    manualPoll,
    stopPolling,
    progress:
      status && status.total > 0
        ? Math.round((status.processed / status.total) * 100)
        : 0,
  };
}

/**
 * Hook for retrieving completed job results
 * Handles fetching and caching of results
 */
export function useJobResult(
  jobId: string | null,
  options?: {
    enabled?: boolean;
    token?: string;
  }
) {
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasAttemptedRef = useRef(false);

  const { enabled = true, token } = options || {};

  useEffect(() => {
    if (!jobId || !enabled || hasAttemptedRef.current) return;

    let mounted = true;

    const fetchResult = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/disposition-reanalysis/queue/job/${jobId}/result`,
          {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch result: ${response.status}`);
        }

        const resultData = await response.json();

        if (mounted) {
          setResult(resultData);
          hasAttemptedRef.current = true;
        }
      } catch (err) {
        if (mounted) {
          const errorMessage =
            err instanceof Error ? err.message : 'Unknown error';
          setError(errorMessage);
          console.error('[useJobResult] Fetch error:', err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchResult();

    return () => {
      mounted = false;
    };
  }, [jobId, enabled, token]);

  return {
    result,
    isLoading,
    error,
  };
}

/**
 * Hook for cancelling a job
 */
export function useCancelJob() {
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const cancelJob = useCallback(
    async (jobId: string, token?: string) => {
      setIsCanceling(true);
      setCancelError(null);

      try {
        const response = await fetch(
          `/api/disposition-reanalysis/queue/job/${jobId}`,
          {
            method: 'DELETE',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Cancel failed: ${response.status}`);
        }

        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setCancelError(errorMessage);
        console.error('[useCancelJob] Cancel error:', err);
        return false;
      } finally {
        setIsCanceling(false);
      }
    },
    []
  );

  return {
    isCanceling,
    cancelError,
    cancelJob,
  };
}

/**
 * Hook for exporting job results in various formats
 */
export function useJobExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const exportResults = useCallback(
    async (
      jobId: string,
      format: 'csv' | 'json' | 'jsonl' = 'csv',
      token?: string
    ) => {
      setIsExporting(true);
      setExportError(null);

      try {
        const response = await fetch(
          `/api/disposition-reanalysis/queue/job/${jobId}/result/export?format=${format}`,
          {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Export failed: ${response.status}`);
        }

        // Get filename from content-disposition header
        const contentDisposition = response.headers.get('content-disposition');
        let filename = `disposition-results.${format}`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match) filename = match[1];
        }

        // Create blob and download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setExportError(errorMessage);
        console.error('[useJobExport] Export error:', err);
        return false;
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return {
    isExporting,
    exportError,
    exportResults,
  };
}

/**
 * Combined hook for complete job workflow
 * Handles scheduling, polling, getting results, and exporting
 */
export function useDispositionAnalysisJob(token?: string) {
  const analysis = useAnalysisJob();
  const polling = useJobPolling(analysis.jobId, { token });
  const result = useJobResult(analysis.jobId, { enabled: polling.isComplete, token });
  const cancelJob = useCancelJob();
  const exportResults = useJobExport();

  return {
    ...analysis,
    ...polling,
    result: result.result,
    resultLoading: result.isLoading,
    resultError: result.error,
    cancelJob: (jobId?: string) => cancelJob.cancelJob(jobId || analysis.jobId || '', token),
    isCanceling: cancelJob.isCanceling,
    exportResults: (format?: 'csv' | 'json' | 'jsonl') =>
      exportResults.exportResults(analysis.jobId || '', format || 'csv', token),
    isExporting: exportResults.isExporting,
  };
}