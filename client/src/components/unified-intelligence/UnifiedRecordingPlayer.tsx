/**
 * Unified Recording Player Component
 *
 * Opens recordings in a new browser tab via GCS presigned URLs.
 * No streaming — all playback happens directly from Google Cloud Storage.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  LinkIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { UnifiedRecording } from './types';

interface UnifiedRecordingPlayerProps {
  recordingId: string;
  recording: UnifiedRecording;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onError?: (error: RecordingPlaybackError) => void;
}

export interface RecordingPlaybackError {
  category: 'cors' | 'auth' | 'expired_url' | 'mime_type' | 'range' | 'network' | 'not_found' | 'unknown';
  message: string;
  recordingId: string;
  timestamp: string;
}

export function UnifiedRecordingPlayer({
  recordingId,
  recording,
  className,
  onError,
}: UnifiedRecordingPlayerProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);

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
      const message = err.message || 'Failed to get recording URL';
      setError(message);
      onError?.({
        category: 'unknown',
        message,
        recordingId,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  }, [recordingId, onError]);

  const handleResync = useCallback(async () => {
    setIsResyncing(true);
    try {
      const resp = await apiRequest('POST', `/api/recordings/${recordingId}/resync`);
      const data = await resp.json();
      if (data.success) {
        toast({ title: 'Resync complete', description: `Recording ID linked.` });
        setError(null);
      } else {
        toast({ title: 'Resync failed', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Resync failed', description: 'Network error', variant: 'destructive' });
    } finally {
      setIsResyncing(false);
    }
  }, [recordingId, toast]);

  // Recording not available
  if (!recording.available) {
    return (
      <div className={cn('flex items-center gap-2 p-3 bg-muted rounded-lg', className)}>
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {recording.status === 'pending' ? 'Recording pending...' :
           recording.status === 'failed' ? 'Recording failed' :
           'Recording not available'}
        </span>
        {recording.status === 'pending' && (
          <Loader2 className="h-4 w-4 animate-spin ml-auto" />
        )}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('p-3 bg-destructive/10 rounded-lg', className)}>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { setError(null); openRecordingInNewTab(); }}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
          {!recording.telnyxRecordingId && (
            <Button size="sm" variant="outline" onClick={handleResync} disabled={isResyncing}>
              {isResyncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LinkIcon className="h-3 w-3 mr-1" />}
              Resync
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3 p-3 bg-muted/50 rounded-lg', className)}>
      <Button
        size="sm"
        variant="default"
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
        size="sm"
        variant="outline"
        onClick={openRecordingInNewTab}
        disabled={isLoading}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        Download
      </Button>

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={openRecordingInNewTab}
        disabled={isLoading}
        title="Open in new tab"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>

      {recording.durationSec && (
        <Badge variant="outline" className="text-xs ml-auto">
          {recording.status}
        </Badge>
      )}
    </div>
  );
}
