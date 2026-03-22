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

export default function TranscriptionHealthView({ campaigns }: { campaigns: Array }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Shared filter state (persists across tabs) ──
  const [activeTab, setActiveTab] = useState('statistics');
  const [timePreset, setTimePreset] = useState('7d');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [minDuration, setMinDuration] = useState(30);
  const [maxDuration, setMaxDuration] = useState('');
  const [customStart, setCustomStart] = useState();
  const [customEnd, setCustomEnd] = useState();
  const [showCharts, setShowCharts] = useState(true);

  // ── Call Explorer state ──
  const [selectedCallIds, setSelectedCallIds] = useState>(new Set());
  const [transcriptionFilter, setTranscriptionFilter] = useState('all');
  const [callPage, setCallPage] = useState(1);
  const [callSortBy, setCallSortBy] = useState('date');
  const [callSortOrder, setCallSortOrder] = useState('desc');
  const [regeneratingIds, setRegeneratingIds] = useState>(new Set());

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

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
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

  const { data: callsData, isLoading: callsLoading, refetch: refetchCalls } = useQuery({
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
    if (callSortBy !== col) return ;
    return callSortOrder === 'desc'
      ? 
      : ;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED FILTER BAR
  // ═══════════════════════════════════════════════════════════════════════
  const FilterBar = () => (
    
      
        {/* Tab Switcher */}
        
          
            
            Statistics & Reports
          
          
            
            Call Explorer
            {callCounts && callCounts.missing > 0 && (
              {callCounts.missing}
            )}
          
          
            
            Bulk Backfill
          
        

        

        {/* Time Presets */}
        
          
             Time Range
          
          
            {([
              ['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'],
            ] as [TimePreset, string][]).map(([key, label]) => (
               handlePresetChange(key)}
              >
                {label}
              
            ))}
            
              
                
                  Custom
                
              
              
                
                  Start Date
                   { setCustomStart(d ?? undefined); if (d) setTimePreset('custom'); }}
                    initialFocus
                  />
                  End Date
                   { setCustomEnd(d ?? undefined); if (d) setTimePreset('custom'); }}
                  />
                
              
            
          
        

        {/* Campaign Filter */}
        
          
             Campaign
          
           { setCampaignFilter(v); setCallPage(1); }}>
            
              
            
            
              All Campaigns
              {campaigns.map(c => (
                {c.name}
              ))}
            
          
        

        {/* Duration Range */}
        
          
             Duration (sec)
          
          
             setMinDuration(Math.max(0, parseInt(e.target.value) || 0))}
              className="h-7 w-[70px] text-xs"
              placeholder="Min"
            />
            –
             setMaxDuration(e.target.value ? Math.max(0, parseInt(e.target.value) || 0) : '')}
              className="h-7 w-[70px] text-xs"
              placeholder="Max"
            />
          
        

        {/* Transcription Status filter — only on Call Explorer tab */}
        {activeTab === 'calls' && (
          
            
               Transcription
            
             { setTranscriptionFilter(v as TranscriptionFilter); setCallPage(1); setSelectedCallIds(new Set()); }}>
              
                
              
              
                All Calls
                Transcribed
                Missing
              
            
          
        )}

        {/* Refresh */}
        
           { refetchHealth(); refetchCalls(); }}>
            
            Refresh
          
        
      
    
  );

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    
      

      {/* Worker Control Panel */}
      

        {/* ═══════════════════════════════════════════════════════════════
            TAB 1: STATISTICS & REPORTS
            ═══════════════════════════════════════════════════════════════ */}
        

          {/* Summary Cards */}
          {healthLoading ? (
            
               Loading transcription health...
            
          ) : summary && (
            
              
                
                  
                  Total Recordings
                
                {summary.totalRecordings}
                
                  &gt;{minDuration}s{maxDuration ? ` ≤${maxDuration}s` : ''}
                
              

              
                
                  
                  With Transcript
                
                
                  {summary.withTranscript}
                  
                    ({summary.coveragePercent}%)
                  
                
              

              
                
                  
                  Missing Transcript
                
                
                  {summary.missingTranscript}
                  
                    ({summary.totalRecordings > 0
                      ? Math.round((summary.missingTranscript / summary.totalRecordings) * 100) : 0}%)
                  
                
              

              
                
                  
                  Missing Analysis
                
                {summary.missingAnalysis}
              

              
                
                  
                  Coverage Rate
                
                
                
                  {summary.coveragePercent}%
                  {summary.coveragePercent >= 90 ? (
                    
                  ) : (
                    
                  )}
                
              

              
                
                  
                  Avg Duration
                
                {fmtDuration(summary.avgDuration || 0)}
              
            
          )}

          {/* Charts */}
          {health && chartData.length > 0 && (
            
              
                
                  
                    
                    Transcription Coverage Trends
                  
                   setShowCharts(v => !v)}>
                    {showCharts ? 'Hide Charts' : 'Show Charts'}
                    {showCharts ?  : }
                  
                
              
              {showCharts && (
                
                  
                    {/* Stacked Bar */}
                    
                      Recordings Breakdown
                      
                        
                          
                          
                          
                          
                          
                          
                        
                      
                    

                    {/* Campaign Donut */}
                    
                      Missing by Campaign
                      {campaignPieData.length > 0 ? (
                        
                          
                            
                              {campaignPieData.map((_, i) => (
                                
                              ))}
                            
                            
                             value.length > 18 ? value.slice(0, 18) + '…' : value}
                            />
                          
                        
                      ) : (
                        
                          
                          No missing transcriptions
                        
                      )}
                    
                  
                
              )}
            
          )}

          {/* Daily Breakdown Table */}
          
            
              
                
                Daily Breakdown
                {health?.daily?.length || 0} days
              
            
            
              {healthLoading ? (
                
                   Loading...
                
              ) : (
                
                  
                    
                      
                        Date
                        Recordings
                        Transcribed
                        Missing
                        No Analysis
                        Avg Duration
                        Coverage
                      
                    
                    
                      {(health?.daily || []).map((row) => {
                        const cov = row.totalRecordings > 0
                          ? Math.round((row.withTranscript / row.totalRecordings) * 100) : 0;
                        return (
                          
                            {fmtDate(row.day)}
                            {row.totalRecordings}
                            {row.withTranscript}
                            
                              {row.missingTranscript > 0 ? (
                                {row.missingTranscript}
                              ) : 0}
                            
                            
                              {row.missingAnalysis > 0 ? (
                                {row.missingAnalysis}
                              ) : 0}
                            
                            {fmtDuration(row.avgDuration)}
                            
                              = 90 ? 'border-green-500 text-green-600 text-xs'
                                  : cov >= 70 ? 'border-amber-500 text-amber-600 text-xs'
                                  : 'border-red-500 text-red-600 text-xs'
                                }
                              >
                                {cov}%
                              
                            
                          
                        );
                      })}
                      {(!health?.daily || health.daily.length === 0) && (
                        
                          
                            No recording data found for the selected range
                          
                        
                      )}
                    
                  
                
              )}
            
          

          {/* Per-Campaign Breakdown */}
          {health?.byCampaign && health.byCampaign.length > 0 && campaignFilter === 'all' && (
            
              
                
                  
                  Campaign Coverage
                  {health.byCampaign.length} campaigns
                
              
              
                
                  
                    
                      
                        Campaign
                        Recordings
                        Transcribed
                        Missing
                        Avg Duration
                        Coverage
                      
                    
                    
                      {health.byCampaign.map(c => (
                         { setCampaignFilter(c.campaignId); setCallPage(1); }}
                        >
                          {c.campaignName}
                          {c.totalRecordings}
                          {c.withTranscript}
                          
                            {c.missingTranscript > 0 ? (
                              {c.missingTranscript}
                            ) : 0}
                          
                          {fmtDuration(c.avgDuration)}
                          
                            = 90 ? 'border-green-500 text-green-600 text-xs'
                                : c.coveragePercent >= 70 ? 'border-amber-500 text-amber-600 text-xs'
                                : 'border-red-500 text-red-600 text-xs'
                              }
                            >
                              {c.coveragePercent}%
                            
                          
                        
                      ))}
                    
                  
                
              
            
          )}
        

        {/* ═══════════════════════════════════════════════════════════════
            TAB 2: CALL EXPLORER
            ═══════════════════════════════════════════════════════════════ */}
        

          {/* Status counts bar */}
          {callCounts && (
            
               { setTranscriptionFilter('all'); setCallPage(1); setSelectedCallIds(new Set()); }}>
                
                  
                  All Calls
                
                {callCounts.total}
              
               { setTranscriptionFilter('transcribed'); setCallPage(1); setSelectedCallIds(new Set()); }}>
                
                  
                  Transcribed
                
                {callCounts.transcribed}
              
               { setTranscriptionFilter('missing'); setCallPage(1); setSelectedCallIds(new Set()); }}>
                
                  
                  Missing Transcript
                
                {callCounts.missing}
              
            
          )}

          {/* Call Table */}
          
            
              
                
                  
                  {transcriptionFilter === 'all' ? 'All Calls' : transcriptionFilter === 'transcribed' ? 'Transcribed Calls' : 'Calls Missing Transcription'}
                  {callPagination && (
                    
                      {callPagination.total} total
                    
                  )}
                
                
                  {selectedMissingIds.length > 0 && (
                     handleRetry(selectedMissingIds, 'auto')}
                      disabled={regenerateMutation.isPending}
                      className="h-8"
                    >
                      {regenerateMutation.isPending ? (
                        
                      ) : (
                        
                      )}
                      Retry Transcription ({selectedMissingIds.length})
                    
                  )}
                  {selectedCallIds.size > 0 && selectedMissingIds.length === 0 && (
                    {selectedCallIds.size} selected (all transcribed)
                  )}
                   refetchCalls()}>
                    
                  
                
              
            
            
              {callsLoading ? (
                
                   Loading calls...
                
              ) : (
                
                  
                    
                      
                        
                           0 && selectedCallIds.size === calls.length}
                            onCheckedChange={toggleAllCalls}
                          />
                        
                        Phone
                        
                           toggleSort('campaign')}>
                            Campaign 
                          
                        
                        
                           toggleSort('duration')}>
                            Duration 
                          
                        
                        
                           toggleSort('date')}>
                            Date 
                          
                        
                        Transcript
                        Analysis
                        Source
                        Actions
                      
                    
                    
                      {calls.map((call) => (
                        
                          
                             toggleCallSelection(call.id)}
                            />
                          
                          {call.phone_number || '--'}
                          {call.campaign_name || '--'}
                          {fmtDuration(call.duration_sec)}
                          
                            {call.started_at ? new Date(call.started_at).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            }) : '--'}
                          
                          
                            
                              {call.transcript_status === 'completed' ? 'Yes' : 'Missing'}
                            
                          
                          
                            
                              {call.analysis_status === 'completed' ? 'Yes' : call.analysis_status === 'n/a' ? 'N/A' : 'Missing'}
                            
                          
                          
                            
                              {call.source_table === 'call_sessions' ? 'Session' : 'Dialer'}
                            
                          
                          
                            
                              {call.recording_url && (
                                 window.open(call.recording_url, '_blank')}
                                  title="Play Recording"
                                >
                                  
                                
                              )}
                              {call.transcript_status !== 'completed' && (
                                 handleRetry([call.id], 'auto')}
                                  disabled={regeneratingIds.has(call.id) || regenerateMutation.isPending}
                                >
                                  {regeneratingIds.has(call.id) ? (
                                    
                                  ) : (
                                    <>
                                      
                                      Retry
                                    
                                  )}
                                
                              )}
                            
                          
                        
                      ))}
                      {calls.length === 0 && (
                        
                          
                            {transcriptionFilter === 'missing' ? (
                              <>
                                
                                No calls with missing transcription found
                              
                            ) : (
                              'No calls found for the selected filters'
                            )}
                          
                        
                      )}
                    
                  
                
              )}

              {/* Pagination */}
              {callPagination && callPagination.total > 0 && (
                
                  
                    Page {callPagination.page} of {callPagination.totalPages} ({callPagination.total} total)
                  
                  
                    {/* Bulk retry all missing on page */}
                    {transcriptionFilter !== 'transcribed' && calls.some(c => c.transcript_status !== 'completed') && selectedCallIds.size === 0 && (
                       handleRetry(calls.filter(c => c.transcript_status !== 'completed').map(c => c.id), 'auto')}
                        disabled={regenerateMutation.isPending}
                        className="h-7 text-xs"
                      >
                        {regenerateMutation.isPending ? (
                          
                        ) : (
                          
                        )}
                        Retry All Missing on Page
                      
                    )}
                    
                       { setCallPage(p => p - 1); setSelectedCallIds(new Set()); }}
                      >
                        
                      
                      {callPagination.page}
                      = callPagination.totalPages}
                        onClick={() => { setCallPage(p => p + 1); setSelectedCallIds(new Set()); }}
                      >
                        
                      
                    
                  
                
              )}
            
          
        

        {/* ═══════════════════════════════════════════════════════════════
            TAB 3: BULK BACKFILL
            ═══════════════════════════════════════════════════════════════ */}
        
          
        
    
  );
}