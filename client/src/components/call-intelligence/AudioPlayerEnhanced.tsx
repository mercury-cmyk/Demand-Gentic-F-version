/**
 * Enhanced Audio Player Component
 *
 * Opens recordings in a new browser tab via GCS presigned URLs.
 * No streaming — all playback happens directly from Google Cloud Storage.
 */

import { useState, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import {
  Play,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerEnhancedProps {
  recordingId: string;
  recordingUrl?: string | null;
  onClose?: () => void;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onRetrySync?: () => void;
  isRetrying?: boolean;
}

export function AudioPlayerEnhanced({
  recordingId,
  onClose,
  className,
  onRetrySync,
  isRetrying,
}: AudioPlayerEnhancedProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openRecordingInNewTab = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest('GET', `/api/recordings/${recordingId}/gcs-url`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to get recording URL');
      }
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        setError('No recording URL available');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get recording URL');
    } finally {
      setIsLoading(false);
    }
  }, [recordingId]);

  if (error) {
    return (
      <div className={cn('flex flex-col gap-3 p-4 bg-destructive/10 rounded-lg', className)}>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
        <div className="flex items-center gap-2">
          {onRetrySync && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                onRetrySync();
              }}
              disabled={isRetrying}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', isRetrying && 'animate-spin')} />
              {isRetrying ? 'Syncing...' : 'Retry Sync'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              openRecordingInNewTab();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-muted/50 rounded-lg p-4', className)}>
      <div className="flex items-center gap-3">
        <Button
          variant="default"
          size="sm"
          onClick={openRecordingInNewTab}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Play in New Tab
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={openRecordingInNewTab}
          disabled={isLoading}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={openRecordingInNewTab}
          disabled={isLoading}
          title="Open in new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default AudioPlayerEnhanced;
