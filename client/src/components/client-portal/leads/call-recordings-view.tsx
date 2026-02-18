import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Pause, Phone, Play, RefreshCw, Search } from 'lucide-react';

interface CallRecordingItem {
  id: string;
  callControlId: string | null;
  callLegId: string | null;
  callSessionId: string | null;
  createdAt: string;
  recordingStartedAt: string | null;
  recordingEndedAt: string | null;
  from: string | null;
  to: string | null;
  durationMillis: number;
  durationSec: number;
  status: string;
  channels: string | null;
  hasMp3: boolean;
  hasWav: boolean;
  primaryFormat: 'mp3' | 'wav' | null;
  recordingUrl?: string | null;
}

interface CallRecordingsResponse {
  total: number;
  page: number;
  pageSize: number;
  items: CallRecordingItem[];
  source: 'gcs' | 'telnyx';
}

const getToken = () => localStorage.getItem('clientPortalToken');

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function CallRecordingsView() {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const page = 1;
  const pageSize = 10;
  const [phoneSearch, setPhoneSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [loadingRecordingId, setLoadingRecordingId] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (phoneSearch.trim()) params.set('phone', phoneSearch.trim());
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params;
  }, [page, pageSize, phoneSearch, startDate, endDate]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<CallRecordingsResponse>({
    queryKey: ['client-portal-call-recordings', page, pageSize, phoneSearch, startDate, endDate],
    queryFn: async () => {
      const token = getToken();
      const endpoints = [
        `/api/client-portal/telnyx-recordings?${queryParams.toString()}`,
        `/api/client-portal/qualified-leads/recordings?${queryParams.toString()}`,
        `/api/client-portal/recordings?${queryParams.toString()}`,
      ];

      let lastError = 'Failed to fetch call recordings';

      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const contentType = res.headers.get('content-type') || '';

        if (!res.ok) {
          try {
            if (contentType.includes('application/json')) {
              const body = await res.json();
              lastError = body?.message || lastError;
              if (body?.details) {
                lastError = `${lastError}: ${body.details}`;
              }
            } else {
              const text = (await res.text()).trim();
              if (text) {
                lastError = `${lastError} (${res.status}): ${text.slice(0, 180)}`;
              }
            }
          } catch {
            // no-op
          }
          continue;
        }

        if (!contentType.includes('application/json')) {
          const text = (await res.text()).trim();
          lastError = `Unexpected response format from recordings endpoint (${res.status}). ${text.slice(0, 180)}`;
          continue;
        }

        const body = await res.json();

        // Preferred shape from telnyx-recordings endpoint
        if (body && typeof body.total === 'number' && Array.isArray(body.items)) {
          return body as CallRecordingsResponse;
        }

        // Legacy fallback shape from /api/client-portal/recordings (array response)
        if (Array.isArray(body)) {
          const items: CallRecordingItem[] = body.map((row: any) => ({
            id: String(row.id),
            callControlId: row.telnyxCallId || null,
            callLegId: null,
            callSessionId: String(row.id),
            createdAt: row.createdAt || new Date().toISOString(),
            recordingStartedAt: row.createdAt || null,
            recordingEndedAt: null,
            from: null,
            to: row.phoneNumber || null,
            durationMillis: Number(row.duration || 0) * 1000,
            durationSec: Number(row.duration || 0),
            status: row.recordingUrl ? 'completed' : 'pending',
            channels: null,
            hasMp3: Boolean(row.recordingUrl && String(row.recordingUrl).includes('.mp3')),
            hasWav: Boolean(row.recordingUrl && String(row.recordingUrl).includes('.wav')),
            primaryFormat: row.recordingUrl
              ? (String(row.recordingUrl).includes('.wav') ? 'wav' : 'mp3')
              : null,
            recordingUrl: row.recordingUrl || null,
          }));

          return {
            total: items.length,
            page,
            pageSize,
            items,
            source: 'gcs',
          };
        }

        lastError = 'Unexpected recordings response payload';
        continue;
      }

      throw new Error(lastError);
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const stopPlayback = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = '';
    setActiveRecordingId(null);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const handlePlay = async (recording: CallRecordingItem) => {
    const recordingId = recording.id;
    if (activeRecordingId === recordingId) {
      stopPlayback();
      return;
    }

    try {
      setLoadingRecordingId(recordingId);
      stopPlayback();

      if (!recording.recordingUrl) {
        throw new Error('Recording URL not available');
      }

      const audio = new Audio(recording.recordingUrl);
      audio.onended = () => setActiveRecordingId(null);
      audio.onerror = () => {
        setActiveRecordingId(null);
        toast({
          title: 'Playback failed',
          description: 'Could not play this GCS recording URL.',
          variant: 'destructive',
        });
      };

      audioRef.current = audio;
      await audio.play();
      setActiveRecordingId(recordingId);
    } catch (playbackError: any) {
      toast({
        title: 'Playback failed',
        description: playbackError?.message || 'Unable to play this recording.',
        variant: 'destructive',
      });
      setActiveRecordingId(null);
    } finally {
      setLoadingRecordingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <CardTitle>Call Recordings</CardTitle>
          <CardDescription>
            {total.toLocaleString()} total GCS recordings
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search phone number..."
              value={phoneSearch}
              onChange={(e) => {
                setPhoneSearch(e.target.value);
              }}
            />
          </div>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
            }}
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
            }}
          />
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {(error as Error).message}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded border border-dashed p-10 text-center text-muted-foreground">
            No recordings found for the current filters.
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead className="text-right">Play</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{item.from || '-'}</TableCell>
                      <TableCell>{item.to || '-'}</TableCell>
                      <TableCell>{formatDuration(item.durationSec)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'completed' ? 'default' : 'secondary'}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.primaryFormat ? item.primaryFormat.toUpperCase() : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePlay(item)}
                          disabled={loadingRecordingId === item.id}
                        >
                          {loadingRecordingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : activeRecordingId === item.id ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Showing up to 10 recordings
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
