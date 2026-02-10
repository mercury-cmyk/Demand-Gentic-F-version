/**
 * Unified Recording Player Component
 *
 * Enhanced audio player with on-demand URL resolution via the recording-link-resolver.
 *
 * How it works:
 * 1. Primary path: uses /api/recordings/:id/stream (server-side proxy)
 * 2. On playback error (expired URL, 403, format issue):
 *    - Fetches a fresh link via POST /api/recordings/:id/recording-link
 *    - Retries playback with the new URL
 * 3. Fallback: "Open in new tab" link
 *
 * No audio stored in DB — only IDs. URLs are generated on-demand.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
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
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
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
  const [playerState, setPlayerState] = useState<'ready' | 'fetching' | 'playing' | 'refreshing'>('ready');
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  // Primary: use stream endpoint (server-side proxy).
  // On error: request a fresh direct URL via recording-link endpoint.
  const streamUrl = `/api/recordings/${recordingId}/stream`;
  const audioSrc = freshUrl || streamUrl;

  /**
   * Fetch a fresh playable link from the backend on-demand.
   * Returns { url, expiresInSeconds, mimeType } or throws.
   */
  const fetchFreshLink = useCallback(async (): Promise<{ url: string; expiresInSeconds: number; mimeType: string }> => {
    setPlayerState('fetching');
    try {
      const response = await apiRequest('POST', `/api/recordings/${recordingId}/recording-link`);
      const data = await response.json();
      if (!data.success || !data.url) {
        throw new Error(data.error || 'No URL returned');
      }
      return { url: data.url, expiresInSeconds: data.expiresInSeconds, mimeType: data.mimeType };
    } catch (err: any) {
      throw new Error(err.message || 'Failed to fetch recording link');
    }
  }, [recordingId]);

  // Classify error for telemetry
  const classifyError = useCallback((audioError: MediaError | null, response?: Response): RecordingPlaybackError => {
    const baseError = {
      recordingId,
      timestamp: new Date().toISOString(),
    };

    if (response) {
      if (response.status === 403) {
        return { ...baseError, category: 'auth', message: 'Authentication failed' };
      }
      if (response.status === 404) {
        return { ...baseError, category: 'not_found', message: 'Recording not found' };
      }
      if (response.status === 410) {
        return { ...baseError, category: 'expired_url', message: 'Recording URL expired' };
      }
    }

    if (audioError) {
      switch (audioError.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          return { ...baseError, category: 'unknown', message: 'Playback aborted' };
        case MediaError.MEDIA_ERR_NETWORK:
          return { ...baseError, category: 'network', message: 'Network error during playback' };
        case MediaError.MEDIA_ERR_DECODE:
          return { ...baseError, category: 'mime_type', message: 'Audio decode error - invalid format' };
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

    const handleDurationChange = () => {
      setDuration(audio.duration);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setError(null);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handleError = async () => {
      setIsLoading(false);
      const playbackError = classifyError(audio.error);
      logPlaybackError(playbackError);

      // Auto-retry once: fetch a fresh URL from the recording-link resolver
      if (retryCount === 0) {
        setRetryCount(1);
        setPlayerState('refreshing');
        try {
          const linkResult = await fetchFreshLink();
          setFreshUrl(linkResult.url);
          audio.src = linkResult.url;
          audio.load();
          setPlayerState('ready');
          return; // Don't set error — we're retrying
        } catch {
          // Fall through to error state
        }
        setPlayerState('ready');
      }

      setError(playbackError.message);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handlePlaying = () => {
      setIsLoading(false);
    };

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
  }, [onTimeUpdate, classifyError, logPlaybackError]);

  // Update playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
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
    } catch (err) {
      console.error('Playback error:', err);
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

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const skipBack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - SKIP_SECONDS);
  }, []);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.duration, audio.currentTime + SKIP_SECONDS);
  }, []);

  const handleRetry = useCallback(async () => {
    if (retryCount >= 3) return;
    
    setIsRetrying(true);
    setIsLoading(true);
    setError(null);
    setRetryCount((prev) => prev + 1);
    setPlayerState('refreshing');

    try {
      // Fetch a fresh direct URL from the recording-link resolver
      const linkResult = await fetchFreshLink();
      setFreshUrl(linkResult.url);

      // Update audio element with fresh URL
      const audio = audioRef.current;
      if (audio) {
        audio.src = linkResult.url;
        audio.load();
      }
      setPlayerState('ready');
    } catch (err: any) {
      setError(err.message || 'Failed to refresh recording link');
      setPlayerState('ready');
    } finally {
      setIsRetrying(false);
    }
  }, [retryCount, fetchFreshLink]);

  /**
   * Manual refresh button — user can force-fetch a new link
   */
  const handleRefreshLink = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPlayerState('fetching');

    try {
      const linkResult = await fetchFreshLink();
      setFreshUrl(linkResult.url);

      const audio = audioRef.current;
      if (audio) {
        audio.src = linkResult.url;
        audio.load();
      }
      setPlayerState('ready');
    } catch (err: any) {
      setError(err.message || 'Failed to refresh recording link');
      setPlayerState('ready');
      setIsLoading(false);
    }
  }, [fetchFreshLink]);

  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = audioSrc;
    link.download = `recording-${recordingId}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [audioSrc, recordingId]);

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

  // Error state with retry + fallback
  if (error) {
    return (
      <div className={cn('p-3 bg-destructive/10 rounded-lg', className)}>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          {retryCount < 3 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Retry ({3 - retryCount} attempts left)
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefreshLink}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh link
          </Button>
          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline ml-2"
          >
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
        src={audioSrc}
        preload="metadata"
        crossOrigin="use-credentials"
      />

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
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Recording Info + Refresh */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {playerState === 'fetching' && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Fetching link…
          </span>
        )}
        {playerState === 'refreshing' && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Refreshing link…
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
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-xs ml-auto"
          onClick={handleRefreshLink}
          title="Refresh recording link"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
