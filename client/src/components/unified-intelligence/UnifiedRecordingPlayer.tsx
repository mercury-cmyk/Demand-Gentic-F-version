/**
 * Unified Recording Player Component
 *
 * Enhanced audio player that ALWAYS streams through the backend proxy.
 *
 * Design invariants:
 *   - Audio src is ALWAYS /api/recordings/:id/stream (+ cache-bust param)
 *   - "Refresh link" calls the recording-link endpoint to warm a fresh URL
 *     on the server, then bumps the cache-bust param to force reload.
 *   - "Open in new tab" opens the stream endpoint URL (audio bytes, not JSON).
 *   - "Resync" calls POST /api/recordings/:id/resync for missing recording IDs.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  LinkIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDuration, type UnifiedRecording } from './types';

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

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIP_SECONDS = 10;

export function UnifiedRecordingPlayer({
  recordingId,
  recording,
  className,
  onTimeUpdate,
  onError,
}: UnifiedRecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [cacheBust, setCacheBust] = useState(0);
  const [streamToken, setStreamToken] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(false);

  // ALWAYS stream through the backend proxy — never expose raw Telnyx URLs.
  // Require a short-lived token to avoid unauthenticated stream probes.
  const baseStreamUrl = streamToken
    ? `/api/recordings/${recordingId}/stream?token=${encodeURIComponent(streamToken)}`
    : null;
  const streamUrl = baseStreamUrl
    ? `${baseStreamUrl}${cacheBust ? `&t=${cacheBust}` : ''}`
    : null;

  const fetchStreamToken = useCallback(async (): Promise<boolean> => {
    try {
      setIsTokenLoading(true);
      const res = await apiRequest('GET', `/api/recordings/${recordingId}/stream-token`);
      const data = await res.json();
      if (data?.token) {
        setStreamToken(data.token);
        return true;
      }
      setStreamToken(null);
      return false;
    } catch (err) {
      console.warn('[UnifiedRecordingPlayer] Failed to fetch stream token:', err);
      setStreamToken(null);
      return false;
    } finally {
      setIsTokenLoading(false);
    }
  }, [recordingId]);

  useEffect(() => {
    setStreamToken(null);
    void fetchStreamToken();
  }, [recordingId, fetchStreamToken]);

  /**
   * Ask the server to warm/validate a fresh recording link, then force the
   * audio element to reload from the stream endpoint.
   */
  const warmAndReload = useCallback(async (): Promise<boolean> => {
    try {
      const resp = await apiRequest('POST', `/api/recordings/${recordingId}/recording-link`);
      const data = await resp.json();
      if (!data.success) {
        throw new Error(data.error || 'Server could not resolve recording');
      }
      // Bump cache-bust to force <audio> to reload from the stream endpoint
      setCacheBust(Date.now());
      return true;
    } catch (err: any) {
      console.warn('[RecordingPlayer] warmAndReload failed:', err.message);
      return false;
    }
  }, [recordingId]);

  // Classify error for telemetry
  const classifyError = useCallback((audioError: MediaError | null, response?: Response): RecordingPlaybackError => {
    const baseError = { recordingId, timestamp: new Date().toISOString() };

    if (response) {
      if (response.status === 403) return { ...baseError, category: 'auth', message: 'Authentication failed' };
      if (response.status === 404) return { ...baseError, category: 'not_found', message: 'Recording not found' };
      if (response.status === 410) return { ...baseError, category: 'expired_url', message: 'Recording URL expired' };
    }

    if (audioError) {
      switch (audioError.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          return { ...baseError, category: 'unknown', message: 'Playback aborted' };
        case MediaError.MEDIA_ERR_NETWORK:
          return { ...baseError, category: 'network', message: 'Network error during playback' };
        case MediaError.MEDIA_ERR_DECODE:
          return { ...baseError, category: 'mime_type', message: 'Audio decode error — invalid format' };
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          return { ...baseError, category: 'mime_type', message: 'Audio format not supported' };
        default:
          return { ...baseError, category: 'unknown', message: audioError.message || 'Unknown playback error' };
      }
    }

    return { ...baseError, category: 'unknown', message: 'Unknown error' };
  }, [recordingId]);

  // Log error for telemetry (no sensitive data)
  const logPlaybackError = useCallback((playbackError: RecordingPlaybackError) => {
    console.error('[Recording Playback Error]', {
      category: playbackError.category,
      recordingId: playbackError.recordingId,
      timestamp: playbackError.timestamp,
    });
    onError?.(playbackError);
  }, [onError]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
    };
    const handleDurationChange = () => setDuration(audio.duration);
    const handleCanPlay = () => { setIsLoading(false); setError(null); };
    const handleEnded = () => setIsPlaying(false);

    const handleError = async () => {
      setIsLoading(false);
      const playbackError = classifyError(audio.error);

      // Auto-retry once via warm + cache-bust (silent)
      if (retryCount === 0) {
        setRetryCount(1);
          if (playbackError.category === 'auth') {
            await fetchStreamToken();
          }
        const ok = await warmAndReload();
        if (ok) return; // retry silently
      }

      setError(playbackError.message);
      logPlaybackError(playbackError);
    };

    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
    };
  }, [onTimeUpdate, classifyError, logPlaybackError, warmAndReload, retryCount, fetchStreamToken]);

  // Update playback speed
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Update volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch {
      setError('Playback failed');
    }
  }, [isPlaying]);

  const handleSeek = useCallback((values: number[]) => {
    const audio = audioRef.current;
    if (!audio || !values[0]) return;
    audio.currentTime = values[0];
    setCurrentTime(values[0]);
  }, []);

  const handleVolumeChange = useCallback((values: number[]) => {
    if (!values[0] && values[0] !== 0) return;
    setVolume(values[0]);
    setIsMuted(values[0] === 0);
  }, []);

  const toggleMute = useCallback(() => setIsMuted((prev) => !prev), []);

  const skipBack = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - SKIP_SECONDS);
  }, []);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.min(audio.duration, audio.currentTime + SKIP_SECONDS);
  }, []);

  const handleRetry = useCallback(async () => {
    if (retryCount >= 3) return;
    setIsRetrying(true);
    setError(null);
    setRetryCount((prev) => prev + 1);

    try {
      await fetchStreamToken();
      const ok = await warmAndReload();
      if (!ok) {
        // Direct cache-bust fallback
        setCacheBust(Date.now());
      }
    } finally {
      setIsRetrying(false);
    }
  }, [retryCount, warmAndReload, fetchStreamToken]);

  /**
   * Manual "Refresh link" — warms a fresh URL on server, then reloads audio.
   * Shows toast feedback on both success and failure.
   */
  const handleRefreshLink = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const ok = await warmAndReload();
      if (ok) {
        setError(null);
        toast({ title: 'Link refreshed', description: 'Audio source updated.' });
      } else {
        toast({ title: 'Refresh failed', description: 'Could not resolve a fresh recording link.', variant: 'destructive' });
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [warmAndReload, toast]);

  /**
   * "Resync" — for recordings missing a telnyxRecordingId. Calls the server
   * to look up the recording by call_control_id and back-fill the ID.
   */
  const handleResync = useCallback(async () => {
    setIsResyncing(true);
    try {
      const resp = await apiRequest('POST', `/api/recordings/${recordingId}/resync`);
      const data = await resp.json();
      if (data.success) {
        toast({ title: 'Resync complete', description: `Recording ID linked (${data.telnyxRecordingId?.slice(0, 12)}…).` });
        // Now try to play
        await fetchStreamToken();
        setCacheBust(Date.now());
        setError(null);
      } else {
        toast({ title: 'Resync failed', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Resync failed', description: 'Network error', variant: 'destructive' });
    } finally {
      setIsResyncing(false);
    }
  }, [recordingId, toast, fetchStreamToken]);

  const handleDownload = useCallback(() => {
    if (!streamUrl) return;
    const link = document.createElement('a');
    link.href = streamUrl;
    link.download = `recording-${recordingId}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [recordingId, streamUrl]);

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

  // Error state with retry + refresh + resync + fallback
  if (error) {
    return (
      <div className={cn('p-3 bg-destructive/10 rounded-lg', className)}>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {retryCount < 3 && (
            <Button size="sm" variant="outline" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Retry ({3 - retryCount} left)
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleRefreshLink} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Refresh link
          </Button>
          {!recording.telnyxRecordingId && (
            <Button size="sm" variant="outline" onClick={handleResync} disabled={isResyncing}>
              {isResyncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LinkIcon className="h-3 w-3 mr-1" />}
              Resync
            </Button>
          )}
          <a
            href={streamUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline"
            onClick={(event) => {
              if (!streamUrl) {
                event.preventDefault();
              }
            }}
          >
            <ExternalLink className="h-3 w-3" />
            Open in new tab
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3 p-3 bg-muted/50 rounded-lg', className)}>
      <audio
        ref={audioRef}
        src={streamUrl || undefined}
        preload="metadata"
        crossOrigin="use-credentials"
      />

      {!streamUrl && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className={cn('h-3 w-3', isTokenLoading && 'animate-spin')} />
          <span>{isTokenLoading ? 'Authorizing recording stream…' : 'Waiting for stream authorization…'}</span>
        </div>
      )}

      {/* Main Controls */}
      <div className="flex items-center gap-2">
        {/* Skip Back */}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={skipBack}
          disabled={isLoading}
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        {/* Play/Pause */}
        <Button
          size="icon"
          variant="default"
          className="h-10 w-10"
          onClick={togglePlay}
          disabled={isLoading && !isPlaying}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>

        {/* Skip Forward */}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={skipForward}
          disabled={isLoading}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        {/* Time Display */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-[80px]">
          <span>{formatDuration(currentTime)}</span>
          <span>/</span>
          <span>{formatDuration(duration)}</span>
        </div>

        {/* Seek Slider */}
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={handleSeek}
          className="flex-1"
          disabled={isLoading}
        />

        {/* Speed Control */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
              {playbackSpeed}x
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {PLAYBACK_SPEEDS.map((speed) => (
              <DropdownMenuItem
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={cn(speed === playbackSpeed && 'bg-accent')}
              >
                {speed}x
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Volume */}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={toggleMute}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>

        {/* Download */}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={handleDownload}
          disabled={!streamUrl}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Recording Info + Player State */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isRefreshing && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Refreshing link…
          </span>
        )}
        {isResyncing && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Resyncing…
          </span>
        )}
        {recording.durationSec && (
          <Badge variant="outline" className="text-xs">
            {recording.status}
          </Badge>
        )}
        {recording.mimeType && (
          <span>{recording.mimeType}</span>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 ml-auto"
          onClick={handleRefreshLink}
          disabled={isRefreshing}
          title="Refresh recording link"
        >
          {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}
