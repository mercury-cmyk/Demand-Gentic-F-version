import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Play, Download, Headphones, Loader2, AlertCircle, RefreshCw, ExternalLink,
} from 'lucide-react';

interface RecordingPlayerProps {
  recordingUrl?: string | null;
  leadId?: string;
}

export function RecordingPlayer({ recordingUrl: _recordingUrl, leadId }: RecordingPlayerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const resolveRecordingLinks = async () => {
    if (!leadId) {
      throw new Error('Recording playback requires a lead identifier.');
    }

    const token = localStorage.getItem('clientPortalToken');
    const res = await fetch(`/api/client-portal/qualified-leads/${encodeURIComponent(leadId)}/recording-link`, {
      headers: {
        Authorization: `Bearer ${token || ''}`,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || body?.error || 'Failed to resolve recording URL');
    }

    const body = await res.json();
    const streamUrl = body?.streamUrl || body?.url || null;
    const downloadUrl = body?.downloadUrl || streamUrl || null;

    if (!streamUrl) {
      throw new Error('No recording URL available.');
    }

    return { streamUrl, downloadUrl };
  };

  const openRecordingInNewTab = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { streamUrl } = await resolveRecordingLinks();
      window.open(streamUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err?.message || 'Failed to open recording.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadRecording = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { downloadUrl } = await resolveRecordingLinks();
      if (!downloadUrl) {
        throw new Error('Download URL is not available.');
      }
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err?.message || 'Failed to download recording.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    
      
        
          
          Call Recording
        
      
      
        {error ? (
          
            
              
              {error}
            
             {
                setError(null);
                void openRecordingInNewTab();
              }}
              disabled={isLoading}
              className="gap-2"
            >
              
              Retry
            
          
        ) : (
          
             void openRecordingInNewTab()}
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                
              ) : (
                
              )}
              Play in New Tab
            
             void downloadRecording()}
              disabled={isLoading}
              className="gap-2"
            >
              
              Download
            
             void openRecordingInNewTab()}
              disabled={isLoading}
              title="Open in new tab"
            >
              
            
          
        )}
      
    
  );
}