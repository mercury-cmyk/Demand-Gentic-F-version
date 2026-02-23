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

export function RecordingPlayer({ recordingUrl, leadId }: RecordingPlayerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openRecordingInNewTab = async () => {
    if (!leadId) {
      setError('Recording playback requires a lead identifier.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('clientPortalToken');
      const res = await fetch(`/api/client-portal/qualified-leads/${encodeURIComponent(leadId)}/recording-link`, {
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || 'Failed to get recording URL');
      }

      const body = await res.json();
      const gcsUrl = body?.url || null;

      if (gcsUrl) {
        window.open(gcsUrl, '_blank', 'noopener,noreferrer');
      } else {
        setError('No recording URL available. The recording may not be stored in cloud storage yet.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to get recording URL.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Headphones className="h-4 w-4" />
          Call Recording
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                openRecordingInNewTab();
              }}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}
