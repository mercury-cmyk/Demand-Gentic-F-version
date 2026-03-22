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
  const [error, setError] = useState(null);
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
      
        
        
          {recording.status === 'pending' ? 'Recording pending...' :
           recording.status === 'failed' ? 'Recording failed' :
           'Recording not available'}
        
        {recording.status === 'pending' && (
          
        )}
      
    );
  }

  // Error state
  if (error) {
    return (
      
        
          
          {error}
        
        
           { setError(null); openRecordingInNewTab(); }}>
            
            Retry
          
          {!recording.telnyxRecordingId && (
            
              {isResyncing ?  : }
              Resync
            
          )}
        
      
    );
  }

  return (
    
      
        {isLoading ? (
          
        ) : (
          
        )}
        Play in New Tab
      

      
        
        Download
      

      
        
      

      {recording.durationSec && (
        
          {recording.status}
        
      )}
    
  );
}