/**
 * Enhanced Audio Player Component
 *
 * Full-featured audio player with playback speed control, skip buttons,
 * volume control, and download capability.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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
import { formatDuration } from './types';

interface AudioPlayerEnhancedProps {
  recordingId: string;
  recordingUrl?: string | null;
  onClose?: () => void;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onRetrySync?: () => void;
  isRetrying?: boolean;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIP_SECONDS = 10;

export function AudioPlayerEnhanced({
  recordingId,
  recordingUrl,
  onClose,
  className,
  onTimeUpdate,
  onRetrySync,
  isRetrying,
}: AudioPlayerEnhancedProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const previousRetryingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [streamToken, setStreamToken] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(false);

  // Prefer explicit recording URL when provided; fallback to recording stream endpoint.
  // The fallback endpoint requires a short-lived token query param.
  const fallbackStreamUrl = streamToken
    ? `/api/recordings/${recordingId}/stream?token=${encodeURIComponent(streamToken)}`
    : null;
  const baseStreamUrl = recordingUrl || fallbackStreamUrl;
  const streamUrl = baseStreamUrl
    ? `${baseStreamUrl}${baseStreamUrl.includes('?') ? '&' : '?'}v=${retryNonce}`
    : null;

  useEffect(() => {
    setError(null);
    setIsLoading(true);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setRetryNonce(0);
    setStreamToken(null);
    setIsTokenLoading(false);
  }, [recordingId, recordingUrl]);

  // Fetch a fresh stream token for protected /api/recordings/:id/stream playback.
  // Skip when an explicit recordingUrl is provided (it may already be tokenized/proxied).
  useEffect(() => {
    if (recordingUrl || !recordingId) return;

    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) {
          setIsTokenLoading(true);
        }
        const res = await apiRequest('GET', `/api/recordings/${recordingId}/stream-token`);
        const data = await res.json();
        if (!cancelled && data?.token) {
          setStreamToken(data.token);
          setError(null);
        } else if (!cancelled) {
          setError('Unable to authorize recording stream');
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn('[AudioPlayerEnhanced] Failed to fetch stream token:', err);
          setError('Unable to authorize recording stream');
          setIsLoading(false);
        }
      } finally {
        if (!cancelled) {
          setIsTokenLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recordingId, recordingUrl]);

  // When a sync request finishes, force one fresh playback attempt.
  useEffect(() => {
    const wasRetrying = previousRetryingRef.current;
    const nowRetrying = Boolean(isRetrying);

    if (wasRetrying && !nowRetrying) {
      setError(null);
      setIsLoading(true);
      setRetryNonce((prev) => prev + 1);
    }

    previousRetryingRef.current = nowRetrying;
  }, [isRetrying]);

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

    const handleError = () => {
      setIsLoading(false);
      setError('Unable to load recording');
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
  }, [onTimeUpdate]);

  // Update playback speed when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Update volume when changed
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

  const handleDownload = useCallback(() => {
    if (!streamUrl) return;
    const link = document.createElement('a');
    link.href = streamUrl;
    link.download = `recording-${recordingId}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [streamUrl, recordingId]);

  // Seek to a specific time (used for transcript sync)
  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  // Expose seekTo through a ref callback pattern if needed
  useEffect(() => {
    // Make seekTo available globally for transcript sync
    (window as any)[`audioPlayer_${recordingId}_seekTo`] = seekTo;
    return () => {
      delete (window as any)[`audioPlayer_${recordingId}_seekTo`];
    };
  }, [recordingId, seekTo]);

  const handleRetryClick = useCallback(() => {
    if (onRetrySync) {
      onRetrySync();
      return;
    }

    setError(null);
    setIsLoading(true);
    if (!recordingUrl) {
      setStreamToken(null);
    }
    setRetryNonce((prev) => prev + 1);
  }, [onRetrySync, recordingUrl]);

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
              onClick={handleRetryClick}
              disabled={isRetrying}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', isRetrying && 'animate-spin')} />
              {isRetrying ? 'Syncing...' : 'Retry Sync'}
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Dismiss
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {onRetrySync
            ? 'Recording may be stale. Click "Retry Sync" to refresh it.'
            : 'Recording could not be loaded from storage for this call.'}
        </p>
      </div>
    );
  }

  if (!recordingUrl && (isTokenLoading || !streamToken)) {
    return (
      <div className={cn('flex items-center gap-2 p-4 bg-muted rounded-lg', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Authorizing recording stream...</span>
      </div>
    );
  }

  return (
    <div className={cn('bg-muted/50 rounded-lg p-4 space-y-3', className)}>
      <audio ref={audioRef} src={streamUrl || undefined} preload="metadata" />

      {/* Progress bar */}
      <div className="space-y-1">
        <Slider
          value={[currentTime]}
          min={0}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSeek}
          className="cursor-pointer"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatDuration(Math.floor(currentTime))}</span>
          <span>{formatDuration(Math.floor(duration))}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Skip back */}
          <Button variant="ghost" size="sm" onClick={skipBack} title={`Skip back ${SKIP_SECONDS}s`}>
            <SkipBack className="h-4 w-4" />
          </Button>

          {/* Play/Pause */}
          <Button
            variant="default"
            size="sm"
            onClick={togglePlay}
            disabled={isLoading}
            className="w-10 h-10 rounded-full"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </Button>

          {/* Skip forward */}
          <Button variant="ghost" size="sm" onClick={skipForward} title={`Skip forward ${SKIP_SECONDS}s`}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Playback speed */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[60px]">
                {playbackSpeed}x
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {PLAYBACK_SPEEDS.map((speed) => (
                <DropdownMenuItem
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={speed === playbackSpeed ? 'bg-accent' : ''}
                >
                  {speed}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleMute}>
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              min={0}
              max={1}
              step={0.1}
              onValueChange={handleVolumeChange}
              className="w-20"
            />
          </div>

          {/* Download */}
          <Button variant="ghost" size="sm" onClick={handleDownload} title="Download recording" disabled={!streamUrl}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AudioPlayerEnhanced;
