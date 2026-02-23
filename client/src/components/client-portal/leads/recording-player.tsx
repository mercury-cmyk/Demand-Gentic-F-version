import { useRef, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Play, Pause, Volume2, VolumeX, SkipBack, SkipForward,
  Download, Headphones, Loader2,
} from 'lucide-react';

interface RecordingPlayerProps {
  recordingUrl?: string | null;
  leadId?: string;
}

export function RecordingPlayer({ recordingUrl: _recordingUrl, leadId }: RecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveUrl = async () => {
      setError(null);
      setIsLoading(true);
      setResolvedUrl(null);
      setResolvedDownloadUrl(null);

      if (!leadId) {
        setError('Recording playback requires a lead identifier.');
        setIsLoading(false);
        return;
      }

      try {
        const token = localStorage.getItem('clientPortalToken');
        const res = await fetch(`/api/client-portal/qualified-leads/${encodeURIComponent(leadId)}/recording-link`, {
          headers: {
            Authorization: `Bearer ${token || ''}`,
          },
        });

        if (res.ok) {
          const body = await res.json();
          const streamUrl = body?.streamUrl || body?.url || null;
          const downloadUrl = body?.downloadUrl || null;
          if (!cancelled && streamUrl) {
            setResolvedUrl(streamUrl);
            setResolvedDownloadUrl(downloadUrl);
            setIsLoading(false);
            return;
          }
        }

        if (!cancelled) {
          let details = 'Failed to load a fresh recording link.';
          try {
            const body = await res.json();
            details = body?.message || body?.error || details;
          } catch {
            // ignore JSON parse failures
          }
          setError(details);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to contact recording service.');
          setIsLoading(false);
        }
      }
    };

    resolveUrl();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setError('Failed to load audio. The recording may have expired.');
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [resolvedUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = value[0];
    audio.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const downloadRecording = () => {
    if (!leadId) {
      setError('Recording URL is not available.');
      return;
    }

    const token = localStorage.getItem('clientPortalToken');
    const endpoint = `/api/client-portal/qualified-leads/${encodeURIComponent(leadId)}/recording-download`;

    void (async () => {
      try {
        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token || ''}`,
          },
        });

        if (!response.ok) {
          const details = await response.text().catch(() => 'Failed to download recording.');
          setError(details || 'Failed to download recording.');
          return;
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get('content-disposition') || '';
        const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
        const fileName = fileNameMatch?.[1] || `recording-${leadId}.mp3`;

        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      } catch {
        if (resolvedDownloadUrl) {
          window.open(resolvedDownloadUrl, '_blank');
          return;
        }
        setError('Failed to download recording.');
      }
    })();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Headphones className="h-4 w-4" />
          Call Recording
        </CardTitle>
        <Button variant="outline" size="sm" onClick={downloadRecording}>
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </CardHeader>
      <CardContent>
        <audio ref={audioRef} src={resolvedUrl || undefined} preload="metadata" />

        {error ? (
          <div className="text-center py-8 text-muted-foreground">
            <Headphones className="h-10 w-10 mx-auto mb-4 opacity-50" />
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                disabled={isLoading}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => skip(-10)}
                  disabled={isLoading}
                >
                  <SkipBack className="h-4 w-4" />
                </Button>

                <Button
                  variant="default"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={togglePlay}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 ml-0.5" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => skip(10)}
                  disabled={isLoading}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              {/* Volume control */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                >
                  {isMuted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.1}
                  onValueChange={handleVolumeChange}
                  className="w-24"
                />
              </div>
            </div>

            {/* Playback info */}
            <div className="text-center text-xs text-muted-foreground">
              {isLoading ? (
                'Loading audio...'
              ) : (
                <>Use keyboard: Space to play/pause, Arrow keys to seek</>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
