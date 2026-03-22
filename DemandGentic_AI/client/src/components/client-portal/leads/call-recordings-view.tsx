import { useMemo, useState } from 'react';
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
import { Download, ExternalLink, Loader2, Phone, Play, RefreshCw, Search } from 'lucide-react';

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
  streamUrl?: string | null;
  downloadUrl?: string | null;
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
  const page = 1;
  const pageSize = 10;
  const [phoneSearch, setPhoneSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loadingRecordingId, setLoadingRecordingId] = useState(null);

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

  const { data, isLoading, isFetching, refetch, error } = useQuery({
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
            recordingUrl: null,
            streamUrl: row.streamUrl || null,
            downloadUrl: row.downloadUrl || null,
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

  const handleOpenInNewTab = async (recording: CallRecordingItem) => {
    const recordingId = recording.id;

    setLoadingRecordingId(recordingId);
    try {
      let playableUrl = recording.streamUrl || null;
      if (!playableUrl) {
        const token = getToken();
        const tokenRes = await fetch(
          `/api/client-portal/qualified-leads/recordings/${encodeURIComponent(recordingId)}/stream-token`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!tokenRes.ok) {
          throw new Error('Recording is not available for this call.');
        }
        const tokenBody = await tokenRes.json();
        playableUrl = tokenBody?.streamUrl || null;
      }

      if (!playableUrl) {
        throw new Error('Recording is not available for this call.');
      }

      window.open(playableUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast({
        title: 'Failed to open recording',
        description: err?.message || 'Unable to open this recording.',
        variant: 'destructive',
      });
    } finally {
      setLoadingRecordingId(null);
    }
  };

  return (
    
      
        
          Call Recordings
          
            {total.toLocaleString()} total GCS recordings
          
        
        
          
            
             {
                setPhoneSearch(e.target.value);
              }}
            />
          
           {
              setStartDate(e.target.value);
            }}
          />
           {
              setEndDate(e.target.value);
            }}
          />
           refetch()} disabled={isFetching}>
            {isFetching ? (
              
            ) : (
              
            )}
            Refresh
          
        
      
      
        {isLoading ? (
          
            
          
        ) : error ? (
          
            {(error as Error).message}
          
        ) : items.length === 0 ? (
          
            No recordings found for the current filters.
          
        ) : (
          <>
            
              
                
                  
                    Date / Time
                    From
                    To
                    Duration
                    Status
                    Format
                    Play
                  
                
                
                  {items.map((item) => (
                    
                      
                        {new Date(item.createdAt).toLocaleString()}
                      
                      {item.from || '-'}
                      {item.to || '-'}
                      {formatDuration(item.durationSec)}
                      
                        
                          {item.status}
                        
                      
                      
                        {item.primaryFormat ? item.primaryFormat.toUpperCase() : '-'}
                      
                      
                         handleOpenInNewTab(item)}
                          disabled={loadingRecordingId === item.id}
                        >
                          {loadingRecordingId === item.id ? (
                            
                          ) : (
                            
                          )}
                          Play
                        
                      
                    
                  ))}
                
              
            

            
              
                
                Showing up to 10 recordings
              
            
          
        )}
      
    
  );
}