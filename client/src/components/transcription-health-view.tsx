/**
 * Transcription Health View
 *
 * Dashboard view showing transcription coverage stats, daily breakdown,
 * and gap calls with regeneration actions via Telnyx phone lookup.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TranscriptionWorkerControl } from './transcription-worker-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertTriangle,
  Mic,
  Sparkles,
  RefreshCw,
  BarChart3,
  Activity,
  CheckCircle2,
  XCircle,
  Play,
  Loader2,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────

interface TranscriptionHealthData {
  daily: Array<{
    day: string;
    totalRecordings: number;
    withTranscript: number;
    missingTranscript: number;
    withAnalysis: number;
    missingAnalysis: number;
  }>;
  summary: {
    last7Days: {
      totalRecordings: number;
      withTranscript: number;
      missingTranscript: number;
      withAnalysis: number;
      missingAnalysis: number;
      coveragePercent: number;
    };
    last14Days: {
      totalRecordings: number;
      withTranscript: number;
      missingTranscript: number;
      withAnalysis: number;
      missingAnalysis: number;
      coveragePercent: number;
    };
  };
  minDuration: number;
}

interface TranscriptionGap {
  id: string;
  source_table: string;
  phone_number: string;
  from_number: string;
  campaign_id: string;
  campaign_name: string;
  duration_sec: number;
  started_at: string;
  agent_type: string;
  recording_url: string;
  recording_s3_key: string;
  telnyx_call_id: string;
  telnyx_recording_id: string;
  recording_status: string;
  transcript_status: string;
  analysis_status: string;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function TranscriptionHealthView({ campaigns }: { campaigns: Array<{ id: string; name: string }> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const [selectedGapIds, setSelectedGapIds] = useState<Set<string>>(new Set());
  const [gapCampaignFilter, setGapCampaignFilter] = useState('all');
  const [gapTypeFilter, setGapTypeFilter] = useState('all');
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

  // Fetch transcription health stats
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<{
    success: boolean;
    data: TranscriptionHealthData;
  }>({
    queryKey: ['/api/call-intelligence/transcription-health'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/call-intelligence/transcription-health?days=14&minDuration=30');
        return response.json();
      } catch (error) {
        const isNotFound = error instanceof Error && error.message.startsWith('404:');
        if (!isNotFound) throw error;

        const legacyResponse = await apiRequest('GET', '/api/transcription/health');
        const legacy = await legacyResponse.json();
        const totalRecordings = Number(legacy?.last24Hours?.callsWithRecording || 0);
        const withTranscript = Number(legacy?.last24Hours?.callsWithTranscript || 0);
        const missingTranscript = Math.max(0, totalRecordings - withTranscript);
        const coveragePercent = totalRecordings > 0 ? Math.round((withTranscript / totalRecordings) * 100) : 0;

        return {
          success: true,
          data: {
            daily: [],
            summary: {
              last7Days: {
                totalRecordings,
                withTranscript,
                missingTranscript,
                withAnalysis: 0,
                missingAnalysis: 0,
                coveragePercent,
              },
              last14Days: {
                totalRecordings,
                withTranscript,
                missingTranscript,
                withAnalysis: 0,
                missingAnalysis: 0,
                coveragePercent,
              },
            },
            minDuration: 30,
          },
        };
      }
    },
    refetchInterval: 60000,
  });

  // Fetch transcription gaps
  const { data: gapsData, isLoading: gapsLoading, refetch: refetchGaps } = useQuery<{
    success: boolean;
    data: {
      gaps: TranscriptionGap[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };
  }>({
    queryKey: ['/api/call-intelligence/transcription-gaps', gapCampaignFilter, gapTypeFilter],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ limit: '50', gapType: gapTypeFilter });
        if (gapCampaignFilter !== 'all') params.set('campaignId', gapCampaignFilter);
        const response = await apiRequest('GET', `/api/call-intelligence/transcription-gaps?${params}`);
        return response.json();
      } catch (error) {
        const isNotFound = error instanceof Error && error.message.startsWith('404:');
        if (!isNotFound) throw error;

        if (gapTypeFilter === 'analysis') {
          return {
            success: true,
            data: {
              gaps: [],
              pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
            },
          };
        }

        const legacyResponse = await apiRequest('GET', '/api/transcription/calls-without-transcripts?limit=50');
        const legacy = await legacyResponse.json();
        const legacyCalls = Array.isArray(legacy?.calls) ? legacy.calls : [];

        const mapped: TranscriptionGap[] = legacyCalls
          .map((call: any) => ({
            id: String(call.id),
            source_table: 'dialer_call_attempts',
            phone_number: call.phoneDialed || '',
            from_number: '',
            campaign_id: call.campaignId || '',
            campaign_name: call.campaignId ? (campaignNameById.get(call.campaignId) || 'Unknown Campaign') : 'Unknown Campaign',
            duration_sec: Number(call.durationSec || 0),
            started_at: call.startedAt || '',
            agent_type: 'ai',
            recording_url: call.recordingUrl || '',
            recording_s3_key: '',
            telnyx_call_id: '',
            telnyx_recording_id: '',
            recording_status: call.hasRecording ? 'stored' : 'missing',
            transcript_status: 'missing',
            analysis_status: 'n/a',
          }))
          .filter((gap: TranscriptionGap) => gapCampaignFilter === 'all' || gap.campaign_id === gapCampaignFilter);

        return {
          success: true,
          data: {
            gaps: mapped,
            pagination: {
              page: 1,
              limit: 50,
              total: mapped.length,
              totalPages: mapped.length > 0 ? 1 : 0,
            },
          },
        };
      }
    },
    refetchInterval: 60000,
  });

  const health = healthData?.data;
  const gaps = gapsData?.data?.gaps || [];

  // Regeneration mutation
  const regenerateMutation = useMutation({
    mutationFn: async ({ callIds, strategy }: { callIds: string[]; strategy: string }) => {
      try {
        const response = await apiRequest('POST', '/api/call-intelligence/transcription-gaps/regenerate', {
          callIds,
          strategy,
        });
        return response.json();
      } catch (error) {
        const isNotFound = error instanceof Error && error.message.startsWith('404:');
        if (!isNotFound) throw error;

        const settled = await Promise.allSettled(
          callIds.map(async (id) => {
            const response = await apiRequest('POST', `/api/transcription/retry/${id}`);
            return response.json();
          }),
        );

        const succeeded = settled.filter((s) => s.status === 'fulfilled').length;
        const failed = settled.length - succeeded;
        const errors = settled
          .filter((s) => s.status === 'rejected')
          .map((s) => (s as PromiseRejectedResult).reason instanceof Error
            ? (s as PromiseRejectedResult).reason.message
            : String((s as PromiseRejectedResult).reason));

        return {
          success: true,
          data: {
            queued: callIds.length,
            succeeded,
            failed,
            errors,
          },
        };
      }
    },
    onSuccess: (data) => {
      const result = data.data;
      toast({
        title: 'Regeneration complete',
        description: `${result.succeeded} succeeded, ${result.failed} failed out of ${result.queued} queued`,
      });
      setSelectedGapIds(new Set());
      setRegeneratingIds(new Set());
      refetchHealth();
      refetchGaps();
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence'] });
    },
    onError: () => {
      toast({ title: 'Regeneration failed', variant: 'destructive' });
      setRegeneratingIds(new Set());
    },
  });

  const handleRegenerate = useCallback((callIds: string[], strategy = 'auto') => {
    setRegeneratingIds(new Set(callIds));
    regenerateMutation.mutate({ callIds, strategy });
  }, [regenerateMutation]);

  const toggleGapSelection = useCallback((id: string) => {
    setSelectedGapIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllGaps = useCallback(() => {
    if (selectedGapIds.size === gaps.length) {
      setSelectedGapIds(new Set());
    } else {
      setSelectedGapIds(new Set(gaps.map(g => g.id)));
    }
  }, [selectedGapIds.size, gaps]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDurationSec = (sec: number) => {
    if (!sec) return '--';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Worker Control Panel */}
      <TranscriptionWorkerControl />

      {/* Summary Cards */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Mic className="h-4 w-4" />
              <span className="text-xs">Recordings (&gt;30s) — 7d</span>
            </div>
            <div className="text-xl font-bold">{health.summary.last7Days.totalRecordings}</div>
          </Card>
          <Card className="p-3 border-green-200">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">With Transcript</span>
            </div>
            <div className="text-xl font-bold text-green-700">
              {health.summary.last7Days.withTranscript}
              <span className="text-sm font-normal text-green-500 ml-1">
                ({health.summary.last7Days.coveragePercent}%)
              </span>
            </div>
          </Card>
          <Card className="p-3 border-red-200">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <XCircle className="h-4 w-4" />
              <span className="text-xs">Missing Transcript</span>
            </div>
            <div className="text-xl font-bold text-red-700">
              {health.summary.last7Days.missingTranscript}
              <span className="text-sm font-normal text-red-400 ml-1">
                ({health.summary.last7Days.totalRecordings > 0
                  ? Math.round((health.summary.last7Days.missingTranscript / health.summary.last7Days.totalRecordings) * 100)
                  : 0}%)
              </span>
            </div>
          </Card>
          <Card className="p-3 border-amber-200">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs">Missing Analysis</span>
            </div>
            <div className="text-xl font-bold text-amber-700">{health.summary.last7Days.missingAnalysis}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-xs">Coverage Rate</span>
            </div>
            <div className="text-xl font-bold">
              <Progress value={health.summary.last7Days.coveragePercent} className="h-2 mt-2" />
              <span className="text-sm">{health.summary.last7Days.coveragePercent}%</span>
            </div>
          </Card>
        </div>
      )}

      {/* Daily Breakdown Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Daily Breakdown (Last 14 Days)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetchHealth()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {healthLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading health data...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Recordings &gt;30s</TableHead>
                  <TableHead className="text-right">With Transcript</TableHead>
                  <TableHead className="text-right">Missing Transcript</TableHead>
                  <TableHead className="text-right">Missing Analysis</TableHead>
                  <TableHead className="text-right">Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(health?.daily || []).map((row) => {
                  const coverage = row.totalRecordings > 0
                    ? Math.round((row.withTranscript / row.totalRecordings) * 100)
                    : 0;
                  return (
                    <TableRow key={row.day}>
                      <TableCell className="font-medium">{formatDate(row.day)}</TableCell>
                      <TableCell className="text-right">{row.totalRecordings}</TableCell>
                      <TableCell className="text-right text-green-600">{row.withTranscript}</TableCell>
                      <TableCell className="text-right">
                        {row.missingTranscript > 0 ? (
                          <span className="text-red-600 font-medium">{row.missingTranscript}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.missingAnalysis > 0 ? (
                          <span className="text-amber-600">{row.missingAnalysis}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            coverage >= 90
                              ? 'border-green-500 text-green-600'
                              : coverage >= 70
                              ? 'border-amber-500 text-amber-600'
                              : 'border-red-500 text-red-600'
                          }
                        >
                          {coverage}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!health?.daily || health.daily.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No recording data found for the last 14 days
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Gap Calls — Actionable List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Calls Missing Transcription / Analysis
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={gapTypeFilter} onValueChange={setGapTypeFilter}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Gap type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Gaps</SelectItem>
                  <SelectItem value="transcript">Missing Transcript</SelectItem>
                  <SelectItem value="analysis">Missing Analysis</SelectItem>
                </SelectContent>
              </Select>
              <Select value={gapCampaignFilter} onValueChange={setGapCampaignFilter}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="All Campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedGapIds.size > 0 && (
                <Button
                  size="sm"
                  onClick={() => handleRegenerate(Array.from(selectedGapIds), 'auto')}
                  disabled={regenerateMutation.isPending}
                  className="h-8"
                >
                  {regenerateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Regenerate ({selectedGapIds.size})
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8" onClick={() => refetchGaps()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {gapsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading gap data...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={gaps.length > 0 && selectedGapIds.size === gaps.length}
                      onCheckedChange={toggleAllGaps}
                    />
                  </TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Transcript</TableHead>
                  <TableHead>Analysis</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gaps.map((gap) => (
                  <TableRow key={`${gap.source_table}-${gap.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedGapIds.has(gap.id)}
                        onCheckedChange={() => toggleGapSelection(gap.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{gap.phone_number || '--'}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{gap.campaign_name || '--'}</TableCell>
                    <TableCell className="text-xs">{formatDurationSec(gap.duration_sec)}</TableCell>
                    <TableCell className="text-xs">
                      {gap.started_at ? new Date(gap.started_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      }) : '--'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={gap.transcript_status === 'completed' ? 'border-green-500 text-green-600 text-xs' : 'border-red-500 text-red-600 text-xs'}
                      >
                        {gap.transcript_status === 'completed' ? 'Yes' : 'Missing'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          gap.analysis_status === 'completed'
                            ? 'border-green-500 text-green-600 text-xs'
                            : gap.analysis_status === 'n/a'
                            ? 'border-gray-300 text-gray-400 text-xs'
                            : 'border-amber-500 text-amber-600 text-xs'
                        }
                      >
                        {gap.analysis_status === 'completed' ? 'Yes' : gap.analysis_status === 'n/a' ? 'N/A' : 'Missing'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {gap.source_table === 'call_sessions' ? 'Session' : 'Dialer'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleRegenerate([gap.id], 'auto')}
                        disabled={regeneratingIds.has(gap.id) || regenerateMutation.isPending}
                      >
                        {regeneratingIds.has(gap.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Regenerate
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {gaps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      No transcription gaps found — all recordings have transcripts
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {gapsData?.data?.pagination && gapsData.data.pagination.total > 0 && (
            <div className="flex items-center justify-between pt-3 border-t mt-3">
              <p className="text-xs text-muted-foreground">
                Showing {gaps.length} of {gapsData.data.pagination.total} gap calls
              </p>
              {selectedGapIds.size === 0 && gaps.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRegenerate(gaps.map(g => g.id), 'auto')}
                  disabled={regenerateMutation.isPending}
                  className="h-7 text-xs"
                >
                  {regenerateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Regenerate All ({gaps.length})
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
