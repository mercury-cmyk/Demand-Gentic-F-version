/**
 * Transcription Health View — Two-Tab Dashboard
 *
 * Tab 1 "Statistics & Reports": Summary cards, coverage trend charts, daily breakdown, campaign breakdown
 * Tab 2 "Call Explorer": Paginated list of ALL calls (transcribed + untranscribed) with filters, selection, and retry
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { TranscriptionWorkerControl } from './transcription-worker-control';
import { BatchTranscriptionPanel } from './batch-transcription-panel';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle, Mic, Sparkles, RefreshCw, BarChart3, Activity,
  CheckCircle2, XCircle, Play, Loader2, Calendar as CalendarIcon,
  Clock, Filter, ChevronLeft, ChevronRight, ArrowUpDown, TrendingUp,
  TrendingDown, ExternalLink, ChevronDown, ChevronUp, Phone, List,
} from 'lucide-react';
import {
  BarChart as RechartsBarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

// ─── Types ─────────────────────────────────────────────────────────────

type TimePreset = 'today' | '7d' | '30d' | 'custom';
type CallSortBy = 'date' | 'duration' | 'campaign';
type SortOrder = 'asc' | 'desc';
type TranscriptionFilter = 'all' | 'transcribed' | 'missing';

interface HealthSummary {
  totalRecordings: number;
  withTranscript: number;
  missingTranscript: number;
  withAnalysis: number;
  missingAnalysis: number;
  coveragePercent: number;
  avgDuration?: number;
}

interface DailyRow {
  day: string;
  totalRecordings: number;
  withTranscript: number;
  missingTranscript: number;
  withAnalysis: number;
  missingAnalysis: number;
  avgDuration: number;
}

interface CampaignStats {
  campaignId: string;
  campaignName: string;
  totalRecordings: number;
  withTranscript: number;
  missingTranscript: number;
  coveragePercent: number;
  avgDuration: number;
}

interface TranscriptionHealthData {
  daily: DailyRow[];
  summary: {
    total: HealthSummary;
    last7Days: HealthSummary;
    last14Days: HealthSummary;
  };
  byCampaign: CampaignStats[];
  period: string;
  minDuration: number;
  maxDuration?: number;
}

interface CallRecord {
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

// ─── Helpers ───────────────────────────────────────────────────────────

function getPresetDates(preset: TimePreset): { start: Date; end: Date; days: number } {
  const end = new Date();
  const d = (n: number) => new Date(Date.now() - n * 86400000);
  switch (preset) {
    case 'today': return { start: d(1), end, days: 1 };
    case '7d':    return { start: d(7), end, days: 7 };
    case '30d':   return { start: d(30), end, days: 30 };
    default:      return { start: d(7), end, days: 7 };
  }
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtDuration(sec: number) {
  if (!sec) return '--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CHART_COLORS = {
  green: '#22c55e', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
  gray: '#94a3b8', purple: '#a855f7',
};

const PIE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#06b6d4', '#f97316', '#ec4899'];

// ─── Component ─────────────────────────────────────────────────────────

export default function TranscriptionHealthView({ campaigns }: { campaigns: Array<{ id: string; name: string }> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Shared filter state (persists across tabs) ──
  const [activeTab, setActiveTab] = useState('statistics');
  const [timePreset, setTimePreset] = useState<TimePreset>('7d');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [minDuration, setMinDuration] = useState(30);
  const [maxDuration, setMaxDuration] = useState<number | ''>('');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [showCharts, setShowCharts] = useState(true);

  // ── Call Explorer state ──
  const [selectedCallIds, setSelectedCallIds] = useState<Set<string>>(new Set());
  const [transcriptionFilter, setTranscriptionFilter] = useState<TranscriptionFilter>('all');
  const [callPage, setCallPage] = useState(1);
  const [callSortBy, setCallSortBy] = useState<CallSortBy>('date');
  const [callSortOrder, setCallSortOrder] = useState<SortOrder>('desc');
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

  // ── Derived dates ──
  const { startDate, endDate, days } = useMemo(() => {
    if (timePreset === 'custom' && customStart && customEnd) {
      const diff = Math.ceil((customEnd.getTime() - customStart.getTime()) / 86400000);
      return { startDate: customStart, endDate: customEnd, days: Math.max(1, diff) };
    }
    const { start, end, days } = getPresetDates(timePreset);
    return { startDate: start, endDate: end, days };
  }, [timePreset, customStart, customEnd]);

  // ── Preset handler ──
  const handlePresetChange = useCallback((preset: TimePreset) => {
    setTimePreset(preset);
    setCallPage(1);
    setSelectedCallIds(new Set());
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // API: Statistics & Reports (Tab 1)
  // ═══════════════════════════════════════════════════════════════════════
  const healthParams = useMemo(() => {
    const p = new URLSearchParams({
      days: String(days),
      minDuration: String(minDuration),
      period: 'daily',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    if (maxDuration !== '') p.set('maxDuration', String(maxDuration));
    if (campaignFilter !== 'all') p.set('campaignId', campaignFilter);
    return p.toString();
  }, [days, minDuration, maxDuration, startDate, endDate, campaignFilter]);

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<{
    success: boolean;
    data: TranscriptionHealthData;
  }>({
    queryKey: ['/api/call-intelligence/transcription-health', healthParams],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/call-intelligence/transcription-health?${healthParams}`);
      return response.json();
    },
    refetchInterval: 60000,
    enabled: activeTab === 'statistics',
  });

  const health = healthData?.data;
  const summary = health?.summary?.total || health?.summary?.last7Days;

  // ═══════════════════════════════════════════════════════════════════════
  // API: Call Explorer (Tab 2)
  // ═══════════════════════════════════════════════════════════════════════
  const callParams = useMemo(() => {
    const p = new URLSearchParams({
      limit: '50',
      page: String(callPage),
      minDuration: String(minDuration),
      sortBy: callSortBy,
      sortOrder: callSortOrder,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      transcriptionStatus: transcriptionFilter,
    });
    if (maxDuration !== '') p.set('maxDuration', String(maxDuration));
    if (campaignFilter !== 'all') p.set('campaignId', campaignFilter);
    return p.toString();
  }, [callPage, minDuration, maxDuration, campaignFilter, callSortBy, callSortOrder, startDate, endDate, transcriptionFilter]);

  const { data: callsData, isLoading: callsLoading, refetch: refetchCalls } = useQuery<{
    success: boolean;
    data: {
      calls: CallRecord[];
      counts: { total: number; transcribed: number; missing: number };
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };
  }>({
    queryKey: ['/api/call-intelligence/transcription-calls', callParams],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/call-intelligence/transcription-calls?${callParams}`);
      return response.json();
    },
    refetchInterval: 60000,
  });

  const calls = callsData?.data?.calls || [];
  const callCounts = callsData?.data?.counts;
  const callPagination = callsData?.data?.pagination;

  // ═══════════════════════════════════════════════════════════════════════
  // Regeneration / Retry (shared)
  // ═══════════════════════════════════════════════════════════════════════
  const regenerateMutation = useMutation({
    mutationFn: async ({ callIds, strategy }: { callIds: string[]; strategy: string }) => {
      const response = await apiRequest('POST', '/api/call-intelligence/transcription-gaps/regenerate', {
        callIds, strategy,
      });
      return response.json();
    },
    onSuccess: (data) => {
      const r = data.data;
      toast({
        title: 'Retry Complete',
        description: `${r.succeeded} succeeded, ${r.failed} failed out of ${r.queued} queued`,
      });
      setSelectedCallIds(new Set());
      setRegeneratingIds(new Set());
      refetchHealth();
      refetchCalls();
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence'] });
    },
    onError: () => {
      toast({ title: 'Retry failed', variant: 'destructive' });
      setRegeneratingIds(new Set());
    },
  });

  const handleRetry = useCallback((callIds: string[], strategy = 'auto') => {
    setRegeneratingIds(new Set(callIds));
    regenerateMutation.mutate({ callIds, strategy });
  }, [regenerateMutation]);

  // ── Selection helpers ──
  const toggleCallSelection = useCallback((id: string) => {
    setSelectedCallIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAllCalls = useCallback(() => {
    setSelectedCallIds(prev => prev.size === calls.length ? new Set() : new Set(calls.map(c => c.id)));
  }, [calls]);

  // ── Sort toggle ──
  const toggleSort = useCallback((col: CallSortBy) => {
    if (callSortBy === col) {
      setCallSortOrder(o => o === 'desc' ? 'asc' : 'desc');
    } else {
      setCallSortBy(col);
      setCallSortOrder('desc');
    }
    setCallPage(1);
  }, [callSortBy]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    if (!health?.daily) return [];
    return [...health.daily].reverse().map(d => ({
      label: fmtShortDate(d.day),
      day: d.day,
      withTranscript: d.withTranscript,
      missingTranscript: d.missingTranscript,
      total: d.totalRecordings,
      coverage: d.totalRecordings > 0 ? Math.round((d.withTranscript / d.totalRecordings) * 100) : 0,
      avgDuration: d.avgDuration,
    }));
  }, [health?.daily]);

  const campaignPieData = useMemo(() => {
    if (!health?.byCampaign) return [];
    return health.byCampaign
      .filter(c => c.missingTranscript > 0)
      .slice(0, 8)
      .map(c => ({ name: c.campaignName || 'Unknown', value: c.missingTranscript }));
  }, [health?.byCampaign]);

  // Count selected calls that are missing transcript (for retry button)
  const selectedMissingIds = useMemo(() => {
    return calls.filter(c => selectedCallIds.has(c.id) && c.transcript_status !== 'completed').map(c => c.id);
  }, [calls, selectedCallIds]);

  // Sort icon
  const SortIcon = ({ col }: { col: CallSortBy }) => {
    if (callSortBy !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return callSortOrder === 'desc'
      ? <ChevronDown className="h-3 w-3 ml-1" />
      : <ChevronUp className="h-3 w-3 ml-1" />;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED FILTER BAR
  // ═══════════════════════════════════════════════════════════════════════
  const FilterBar = () => (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* Tab Switcher */}
        <TabsList className="h-8">
          <TabsTrigger value="statistics" className="flex items-center gap-1.5 text-xs h-7 px-3">
            <BarChart3 className="h-3.5 w-3.5" />
            Statistics & Reports
          </TabsTrigger>
          <TabsTrigger value="calls" className="flex items-center gap-1.5 text-xs h-7 px-3">
            <List className="h-3.5 w-3.5" />
            Call Explorer
            {callCounts && callCounts.missing > 0 && (
              <Badge variant="destructive" className="text-[9px] ml-1 px-1 py-0 h-4">{callCounts.missing}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="batch-backfill" className="flex items-center gap-1.5 text-xs h-7 px-3">
            <Sparkles className="h-3.5 w-3.5" />
            Bulk Backfill
          </TabsTrigger>
        </TabsList>

        <div className="h-6 w-px bg-border" />

        {/* Time Presets */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <CalendarIcon className="h-3 w-3" /> Time Range
          </label>
          <div className="flex gap-1">
            {([
              ['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'],
            ] as [TimePreset, string][]).map(([key, label]) => (
              <Button
                key={key}
                variant={timePreset === key ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => handlePresetChange(key)}
              >
                {label}
              </Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={timePreset === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                >
                  Custom
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex flex-col gap-2 p-3">
                  <p className="text-xs font-medium">Start Date</p>
                  <Calendar
                    mode="single"
                    selected={customStart}
                    onSelect={(d) => { setCustomStart(d ?? undefined); if (d) setTimePreset('custom'); }}
                    initialFocus
                  />
                  <p className="text-xs font-medium">End Date</p>
                  <Calendar
                    mode="single"
                    selected={customEnd}
                    onSelect={(d) => { setCustomEnd(d ?? undefined); if (d) setTimePreset('custom'); }}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Campaign Filter */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Filter className="h-3 w-3" /> Campaign
          </label>
          <Select value={campaignFilter} onValueChange={(v) => { setCampaignFilter(v); setCallPage(1); }}>
            <SelectTrigger className="h-7 w-[180px] text-xs">
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Duration Range */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Duration (sec)
          </label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              value={minDuration}
              onChange={e => setMinDuration(Math.max(0, parseInt(e.target.value) || 0))}
              className="h-7 w-[70px] text-xs"
              placeholder="Min"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="number"
              min={0}
              value={maxDuration}
              onChange={e => setMaxDuration(e.target.value ? Math.max(0, parseInt(e.target.value) || 0) : '')}
              className="h-7 w-[70px] text-xs"
              placeholder="Max"
            />
          </div>
        </div>

        {/* Transcription Status filter — only on Call Explorer tab */}
        {activeTab === 'calls' && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Mic className="h-3 w-3" /> Transcription
            </label>
            <Select value={transcriptionFilter} onValueChange={(v) => { setTranscriptionFilter(v as TranscriptionFilter); setCallPage(1); setSelectedCallIds(new Set()); }}>
              <SelectTrigger className="h-7 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Calls</SelectItem>
                <SelectItem value="transcribed">Transcribed</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Refresh */}
        <div className="ml-auto">
          <Button variant="outline" size="sm" className="h-7" onClick={() => { refetchHealth(); refetchCalls(); }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>
    </Card>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <FilterBar />

      {/* Worker Control Panel */}
      <TranscriptionWorkerControl />

        {/* ═══════════════════════════════════════════════════════════════
            TAB 1: STATISTICS & REPORTS
            ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="statistics" className="space-y-4 mt-4">

          {/* Summary Cards */}
          {healthLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading transcription health...
            </div>
          ) : summary && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Mic className="h-4 w-4" />
                  <span className="text-xs">Total Recordings</span>
                </div>
                <div className="text-xl font-bold">{summary.totalRecordings}</div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  &gt;{minDuration}s{maxDuration ? ` ≤${maxDuration}s` : ''}
                </p>
              </Card>

              <Card className="p-3 border-green-200">
                <div className="flex items-center gap-2 text-green-600 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs">With Transcript</span>
                </div>
                <div className="text-xl font-bold text-green-700">
                  {summary.withTranscript}
                  <span className="text-sm font-normal text-green-500 ml-1">
                    ({summary.coveragePercent}%)
                  </span>
                </div>
              </Card>

              <Card className="p-3 border-red-200">
                <div className="flex items-center gap-2 text-red-600 mb-1">
                  <XCircle className="h-4 w-4" />
                  <span className="text-xs">Missing Transcript</span>
                </div>
                <div className="text-xl font-bold text-red-700">
                  {summary.missingTranscript}
                  <span className="text-sm font-normal text-red-400 ml-1">
                    ({summary.totalRecordings > 0
                      ? Math.round((summary.missingTranscript / summary.totalRecordings) * 100) : 0}%)
                  </span>
                </div>
              </Card>

              <Card className="p-3 border-amber-200">
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs">Missing Analysis</span>
                </div>
                <div className="text-xl font-bold text-amber-700">{summary.missingAnalysis}</div>
              </Card>

              <Card className="p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="h-4 w-4" />
                  <span className="text-xs">Coverage Rate</span>
                </div>
                <Progress value={summary.coveragePercent} className="h-2 mt-2" />
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-sm font-bold">{summary.coveragePercent}%</span>
                  {summary.coveragePercent >= 90 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  )}
                </div>
              </Card>

              <Card className="p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs">Avg Duration</span>
                </div>
                <div className="text-xl font-bold">{fmtDuration(summary.avgDuration || 0)}</div>
              </Card>
            </div>
          )}

          {/* Charts */}
          {health && chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Transcription Coverage Trends
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCharts(v => !v)}>
                    {showCharts ? 'Hide Charts' : 'Show Charts'}
                    {showCharts ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
                  </Button>
                </div>
              </CardHeader>
              {showCharts && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Stacked Bar */}
                    <div className="lg:col-span-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Recordings Breakdown</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <RechartsBarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                          <Bar dataKey="withTranscript" stackId="a" fill={CHART_COLORS.green} name="Transcribed" />
                          <Bar dataKey="missingTranscript" stackId="a" fill={CHART_COLORS.red} name="Missing" radius={[2, 2, 0, 0]} />
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Campaign Donut */}
                    <div className="lg:col-span-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Missing by Campaign</p>
                      {campaignPieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={campaignPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={70}
                              dataKey="value"
                              nameKey="name"
                              paddingAngle={2}
                            >
                              {campaignPieData.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                            <Legend
                              wrapperStyle={{ fontSize: 10 }}
                              formatter={(value: string) => value.length > 18 ? value.slice(0, 18) + '…' : value}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
                          <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
                          No missing transcriptions
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Daily Breakdown Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Daily Breakdown
                <Badge variant="secondary" className="text-[10px] ml-1">{health?.daily?.length || 0} days</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {healthLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                </div>
              ) : (
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Recordings</TableHead>
                        <TableHead className="text-right">Transcribed</TableHead>
                        <TableHead className="text-right">Missing</TableHead>
                        <TableHead className="text-right">No Analysis</TableHead>
                        <TableHead className="text-right">Avg Duration</TableHead>
                        <TableHead className="text-right">Coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(health?.daily || []).map((row) => {
                        const cov = row.totalRecordings > 0
                          ? Math.round((row.withTranscript / row.totalRecordings) * 100) : 0;
                        return (
                          <TableRow key={row.day}>
                            <TableCell className="font-medium text-xs">{fmtDate(row.day)}</TableCell>
                            <TableCell className="text-right text-xs">{row.totalRecordings}</TableCell>
                            <TableCell className="text-right text-xs text-green-600">{row.withTranscript}</TableCell>
                            <TableCell className="text-right text-xs">
                              {row.missingTranscript > 0 ? (
                                <span className="text-red-600 font-medium">{row.missingTranscript}</span>
                              ) : <span className="text-muted-foreground">0</span>}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {row.missingAnalysis > 0 ? (
                                <span className="text-amber-600">{row.missingAnalysis}</span>
                              ) : <span className="text-muted-foreground">0</span>}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">{fmtDuration(row.avgDuration)}</TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant="outline"
                                className={
                                  cov >= 90 ? 'border-green-500 text-green-600 text-xs'
                                  : cov >= 70 ? 'border-amber-500 text-amber-600 text-xs'
                                  : 'border-red-500 text-red-600 text-xs'
                                }
                              >
                                {cov}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(!health?.daily || health.daily.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No recording data found for the selected range
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-Campaign Breakdown */}
          {health?.byCampaign && health.byCampaign.length > 0 && campaignFilter === 'all' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Campaign Coverage
                  <Badge variant="secondary" className="text-[10px] ml-1">{health.byCampaign.length} campaigns</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead className="text-right">Recordings</TableHead>
                        <TableHead className="text-right">Transcribed</TableHead>
                        <TableHead className="text-right">Missing</TableHead>
                        <TableHead className="text-right">Avg Duration</TableHead>
                        <TableHead className="text-right">Coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {health.byCampaign.map(c => (
                        <TableRow
                          key={c.campaignId}
                          className="cursor-pointer hover:bg-accent/50"
                          onClick={() => { setCampaignFilter(c.campaignId); setCallPage(1); }}
                        >
                          <TableCell className="text-xs max-w-[200px] truncate font-medium">{c.campaignName}</TableCell>
                          <TableCell className="text-right text-xs">{c.totalRecordings}</TableCell>
                          <TableCell className="text-right text-xs text-green-600">{c.withTranscript}</TableCell>
                          <TableCell className="text-right text-xs">
                            {c.missingTranscript > 0 ? (
                              <span className="text-red-600 font-medium">{c.missingTranscript}</span>
                            ) : <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">{fmtDuration(c.avgDuration)}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={
                                c.coveragePercent >= 90 ? 'border-green-500 text-green-600 text-xs'
                                : c.coveragePercent >= 70 ? 'border-amber-500 text-amber-600 text-xs'
                                : 'border-red-500 text-red-600 text-xs'
                              }
                            >
                              {c.coveragePercent}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TAB 2: CALL EXPLORER
            ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="calls" className="space-y-4 mt-4">

          {/* Status counts bar */}
          {callCounts && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 cursor-pointer hover:bg-accent/50" onClick={() => { setTranscriptionFilter('all'); setCallPage(1); setSelectedCallIds(new Set()); }}>
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Phone className="h-4 w-4" />
                  <span className="text-xs">All Calls</span>
                </div>
                <div className="text-xl font-bold">{callCounts.total}</div>
              </Card>
              <Card className={`p-3 cursor-pointer hover:bg-accent/50 ${transcriptionFilter === 'transcribed' ? 'ring-2 ring-green-500' : 'border-green-200'}`}
                onClick={() => { setTranscriptionFilter('transcribed'); setCallPage(1); setSelectedCallIds(new Set()); }}>
                <div className="flex items-center gap-2 text-green-600 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs">Transcribed</span>
                </div>
                <div className="text-xl font-bold text-green-700">{callCounts.transcribed}</div>
              </Card>
              <Card className={`p-3 cursor-pointer hover:bg-accent/50 ${transcriptionFilter === 'missing' ? 'ring-2 ring-red-500' : 'border-red-200'}`}
                onClick={() => { setTranscriptionFilter('missing'); setCallPage(1); setSelectedCallIds(new Set()); }}>
                <div className="flex items-center gap-2 text-red-600 mb-1">
                  <XCircle className="h-4 w-4" />
                  <span className="text-xs">Missing Transcript</span>
                </div>
                <div className="text-xl font-bold text-red-700">{callCounts.missing}</div>
              </Card>
            </div>
          )}

          {/* Call Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <List className="h-4 w-4" />
                  {transcriptionFilter === 'all' ? 'All Calls' : transcriptionFilter === 'transcribed' ? 'Transcribed Calls' : 'Calls Missing Transcription'}
                  {callPagination && (
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      {callPagination.total} total
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedMissingIds.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => handleRetry(selectedMissingIds, 'auto')}
                      disabled={regenerateMutation.isPending}
                      className="h-8"
                    >
                      {regenerateMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Retry Transcription ({selectedMissingIds.length})
                    </Button>
                  )}
                  {selectedCallIds.size > 0 && selectedMissingIds.length === 0 && (
                    <Badge variant="secondary" className="text-xs">{selectedCallIds.size} selected (all transcribed)</Badge>
                  )}
                  <Button variant="outline" size="sm" className="h-8" onClick={() => refetchCalls()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {callsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading calls...
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={calls.length > 0 && selectedCallIds.size === calls.length}
                            onCheckedChange={toggleAllCalls}
                          />
                        </TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>
                          <button className="flex items-center text-xs font-medium" onClick={() => toggleSort('campaign')}>
                            Campaign <SortIcon col="campaign" />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button className="flex items-center text-xs font-medium" onClick={() => toggleSort('duration')}>
                            Duration <SortIcon col="duration" />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button className="flex items-center text-xs font-medium" onClick={() => toggleSort('date')}>
                            Date <SortIcon col="date" />
                          </button>
                        </TableHead>
                        <TableHead>Transcript</TableHead>
                        <TableHead>Analysis</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calls.map((call) => (
                        <TableRow key={`${call.source_table}-${call.id}`} className={selectedCallIds.has(call.id) ? 'bg-accent/30' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={selectedCallIds.has(call.id)}
                              onCheckedChange={() => toggleCallSelection(call.id)}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{call.phone_number || '--'}</TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{call.campaign_name || '--'}</TableCell>
                          <TableCell className="text-xs font-mono">{fmtDuration(call.duration_sec)}</TableCell>
                          <TableCell className="text-xs">
                            {call.started_at ? new Date(call.started_at).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            }) : '--'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={call.transcript_status === 'completed' ? 'border-green-500 text-green-600 text-xs' : 'border-red-500 text-red-600 text-xs'}
                            >
                              {call.transcript_status === 'completed' ? 'Yes' : 'Missing'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                call.analysis_status === 'completed' ? 'border-green-500 text-green-600 text-xs'
                                : call.analysis_status === 'n/a' ? 'border-gray-300 text-gray-400 text-xs'
                                : 'border-amber-500 text-amber-600 text-xs'
                              }
                            >
                              {call.analysis_status === 'completed' ? 'Yes' : call.analysis_status === 'n/a' ? 'N/A' : 'Missing'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {call.source_table === 'call_sessions' ? 'Session' : 'Dialer'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {call.recording_url && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-1.5"
                                  onClick={() => window.open(call.recording_url, '_blank')}
                                  title="Play Recording"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {call.transcript_status !== 'completed' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleRetry([call.id], 'auto')}
                                  disabled={regeneratingIds.has(call.id) || regenerateMutation.isPending}
                                >
                                  {regeneratingIds.has(call.id) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <>
                                      <Play className="h-3.5 w-3.5 mr-1" />
                                      Retry
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {calls.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            {transcriptionFilter === 'missing' ? (
                              <>
                                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                No calls with missing transcription found
                              </>
                            ) : (
                              'No calls found for the selected filters'
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              {callPagination && callPagination.total > 0 && (
                <div className="flex items-center justify-between pt-3 border-t mt-3">
                  <p className="text-xs text-muted-foreground">
                    Page {callPagination.page} of {callPagination.totalPages} ({callPagination.total} total)
                  </p>
                  <div className="flex items-center gap-2">
                    {/* Bulk retry all missing on page */}
                    {transcriptionFilter !== 'transcribed' && calls.some(c => c.transcript_status !== 'completed') && selectedCallIds.size === 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRetry(calls.filter(c => c.transcript_status !== 'completed').map(c => c.id), 'auto')}
                        disabled={regenerateMutation.isPending}
                        className="h-7 text-xs"
                      >
                        {regenerateMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Retry All Missing on Page
                      </Button>
                    )}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        disabled={callPage <= 1}
                        onClick={() => { setCallPage(p => p - 1); setSelectedCallIds(new Set()); }}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs font-medium px-2">{callPagination.page}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        disabled={callPage >= callPagination.totalPages}
                        onClick={() => { setCallPage(p => p + 1); setSelectedCallIds(new Set()); }}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TAB 3: BULK BACKFILL
            ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="batch-backfill" className="space-y-4 mt-4">
          <BatchTranscriptionPanel campaigns={campaigns} />
        </TabsContent>
    </Tabs>
  );
}
