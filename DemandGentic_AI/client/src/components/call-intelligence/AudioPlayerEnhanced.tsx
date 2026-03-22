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
  const [error, setError] = useState(null);

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
      
        
          
          {error}
        
        
          {onRetrySync && (
             {
                setError(null);
                onRetrySync();
              }}
              disabled={isRetrying}
              className="gap-2"
            >
              
              {isRetrying ? 'Syncing...' : 'Retry Sync'}
            
          )}
           {
              setError(null);
              openRecordingInNewTab();
            }}
            className="gap-2"
          >
            
            Retry
          
          {onClose && (
            
              Dismiss
            
          )}
        
      
    );
  }

  return (
    
      
        
          {isLoading ? (
            
          ) : (
            
          )}
          Play in New Tab
        
        
          
          Download
        
        
          
        
      
    
  );
}

export default AudioPlayerEnhanced;