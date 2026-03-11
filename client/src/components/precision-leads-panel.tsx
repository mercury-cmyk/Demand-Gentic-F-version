/**
 * Precision Leads Panel
 *
 * Displays dual-model (Kimi + DeepSeek) AI consensus analysis results.
 * Features:
 *   - Verdict-based filtering (high_potential, likely_potential, review)
 *   - Intent score visualization
 *   - Dedup-aware (no duplicates)
 *   - Campaign objective context
 *   - Autopilot trigger
 *   - Disposition override indicators
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw, Brain, Search, Target, TrendingUp, Zap, ShieldCheck,
  AlertTriangle, ChevronLeft, ChevronRight, Play, Eye, Sparkles,
  ArrowUpRight, ArrowRight, Clock, Building, Phone, Mail,
  CheckCircle2, XCircle, HelpCircle, BarChart3, FileText, Mic,
  ExternalLink, MessageSquare, Copy, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { UnifiedTranscriptDisplay } from './unified-intelligence/UnifiedTranscriptDisplay';
import type { UnifiedTranscript, TranscriptTurn } from './unified-intelligence/types';

interface Campaign {
  id: string;
  name: string;
}

interface IntentSignal {
  signal: string;
  strength: 'strong' | 'moderate' | 'weak';
  source: string;
}

interface EngagementIndicator {
  indicator: string;
  positive: boolean;
}

interface PrecisionLeadItem {
  id: string;
  callSessionId: string;
  campaignId: string | null;
  contactId: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  companyName: string;
  campaignName: string;
  callDuration: number | null;
  callStatus: string | null;
  verdict: string;
  consensusConfidence: number;
  consensusIntentScore: number;
  consensusCampaignFit: number;
  consensusReasoning: string | null;
  kimiVerdict: string | null;
  kimiConfidence: number | null;
  deepseekVerdict: string | null;
  deepseekConfidence: number | null;
  intentSignals: IntentSignal[];
  engagementIndicators: EngagementIndicator[];
  missingFields: string[];
  dataCompleteness: number | null;
  overrideDisposition: boolean;
  suggestedDisposition: string | null;
  originalDisposition: string | null;
  campaignObjective: string | null;
  recommendedAction: string | null;
  actionReason: string | null;
  priorityRank: number | null;
  processedAt: string | null;
  processingDurationMs: number | null;
  autopilotRun: boolean;
}

interface PrecisionLeadsResponse {
  success: boolean;
  total: number;
  items: PrecisionLeadItem[];
  meta: {
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface PrecisionLeadsStats {
  success: boolean;
  stats: {
    total: number;
    verdictBreakdown: Array<{
      verdict: string;
      count: number;
      avgConfidence: number;
      avgIntent: number;
    }>;
    actionBreakdown: Array<{ action: string; count: number }>;
    dispositionOverrides: { overridden: number; total: number };
    lastProcessed: string | null;
    avgProcessingMs: number;
  };
}

const VERDICT_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2; bg: string }> = {
  high_potential: { label: 'High Potential', color: 'text-green-600', icon: CheckCircle2, bg: 'bg-green-50 border-green-200' },
  likely_potential: { label: 'Likely Potential', color: 'text-blue-600', icon: ArrowUpRight, bg: 'bg-blue-50 border-blue-200' },
  review: { label: 'Needs Review', color: 'text-amber-600', icon: Eye, bg: 'bg-amber-50 border-amber-200' },
  not_potential: { label: 'Not Potential', color: 'text-gray-500', icon: XCircle, bg: 'bg-gray-50 border-gray-200' },
};

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  engage: { label: 'Engage Now', color: 'bg-green-100 text-green-800' },
  nurture: { label: 'Nurture', color: 'bg-blue-100 text-blue-800' },
  review: { label: 'Review', color: 'bg-amber-100 text-amber-800' },
  skip: { label: 'Skip', color: 'bg-gray-100 text-gray-600' },
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const config = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.review;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('gap-1', config.bg, config.color)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function ScoreBar({ label, value, max = 100, color = 'bg-primary' }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ModelBadge({ model, verdict, confidence }: { model: string; verdict: string | null; confidence: number | null }) {
  if (!verdict) return <span className="text-xs text-muted-foreground">N/A</span>;
  const vConfig = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.review;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className={cn('text-xs font-medium', vConfig.color)}>
            {model}: {confidence}%
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{model} verdict: {vConfig.label} ({confidence}% confidence)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function PrecisionLeadsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    campaignId: 'all',
    verdict: 'high_potential,likely_potential,review',
    search: '',
    minConfidence: '',
    recommendedAction: 'all',
    sortBy: 'priority',
    sortOrder: 'asc',
  });

  // Fetch campaigns
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
  });

  // Build query params
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', '50');
    params.append('sortBy', filters.sortBy);
    params.append('sortOrder', filters.sortOrder);
    if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
    if (filters.verdict !== 'all') params.append('verdict', filters.verdict);
    if (filters.search.trim()) params.append('search', filters.search.trim());
    if (filters.minConfidence) params.append('minConfidence', filters.minConfidence);
    if (filters.recommendedAction !== 'all') params.append('recommendedAction', filters.recommendedAction);
    return params.toString();
  }, [filters, page]);

  // Fetch precision leads
  const { data, isLoading, refetch } = useQuery<PrecisionLeadsResponse>({
    queryKey: ['/api/precision-leads', filters, page],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/precision-leads?${buildParams()}`);
      return response.json();
    },
  });

  // Fetch stats
  const { data: statsData } = useQuery<PrecisionLeadsStats>({
    queryKey: ['/api/precision-leads/stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/precision-leads/stats');
      return response.json();
    },
    refetchInterval: 60000,
  });

  // Autopilot mutation
  const autopilotMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (filters.campaignId !== 'all') body.campaignId = filters.campaignId;
      const response = await apiRequest('POST', '/api/precision-leads/autopilot', body);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Precision Autopilot Complete',
        description: `Processed ${data.processed} calls: ${data.highPotential} high, ${data.likelyPotential} likely, ${data.review} review`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/precision-leads/stats'] });
    },
    onError: (error: any) => {
      toast({ title: 'Autopilot Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Qualification bridge mutation — auto-creates leads from high-potential analyses
  const qualifyMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (filters.campaignId !== 'all') body.campaignId = filters.campaignId;
      const response = await apiRequest('POST', '/api/precision-leads/qualify', body);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Qualification Bridge Complete',
        description: `${data.qualified} qualified, ${data.underReview} for review, ${data.skipped} skipped (learned from ${data.learnedCampaigns} campaigns)`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/precision-leads/stats'] });
    },
    onError: (error: any) => {
      toast({ title: 'Qualification Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Analyze single call mutation
  const analyzeMutation = useMutation({
    mutationFn: async (callSessionId: string) => {
      const response = await apiRequest('POST', '/api/precision-leads/analyze', { callSessionId });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Precision Analysis Complete',
        description: `Verdict: ${VERDICT_CONFIG[data.verdict]?.label || data.verdict} (${data.consensusConfidence}%)`,
      });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Analysis Failed', description: error.message, variant: 'destructive' });
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const meta = data?.meta || { page: 1, totalPages: 1, limit: 50 };
  const stats = statsData?.stats;

  const selectedLead = items.find(i => i.id === selectedId);

  // Fetch full conversation detail (transcript, recording, phone) when a lead is selected
  const { data: conversationDetail, isLoading: conversationLoading } = useQuery<any>({
    queryKey: ['/api/qa/conversations', 'precision-detail', selectedLead?.callSessionId],
    queryFn: async () => {
      if (!selectedLead?.callSessionId) return null;
      const response = await apiRequest('GET', `/api/qa/conversations?id=${selectedLead.callSessionId}&limit=1`);
      const data = await response.json();
      return data.conversations?.find((c: any) => c.id === selectedLead.callSessionId) || null;
    },
    enabled: !!selectedLead?.callSessionId,
  });

  // Build structured transcript from conversation detail
  const transcriptData: UnifiedTranscript | null = conversationDetail ? {
    available: !!(conversationDetail.transcript || conversationDetail.transcriptTurns?.length),
    isFull: true,
    rawText: conversationDetail.transcript || undefined,
    turns: (conversationDetail.transcriptTurns || []).map((turn: any): TranscriptTurn => ({
      speaker: turn.role === 'agent' || turn.role === 'assistant' ? 'agent' : turn.role === 'system' ? 'system' : 'prospect',
      text: turn.text,
      timestamp: turn.timestamp,
    })),
  } : null;

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {stats.verdictBreakdown.map((v) => {
            const config = VERDICT_CONFIG[v.verdict] || VERDICT_CONFIG.review;
            const Icon = config.icon;
            return (
              <Card key={v.verdict} className={cn('cursor-pointer hover:shadow-md transition-shadow', config.bg)}
                onClick={() => { setFilters(f => ({ ...f, verdict: v.verdict })); setPage(1); }}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn('h-4 w-4', config.color)} />
                    <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
                  </div>
                  <div className="text-2xl font-bold">{v.count}</div>
                  <div className="text-xs text-muted-foreground">Avg intent: {v.avgIntent}%</div>
                </CardContent>
              </Card>
            );
          })}
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-600">Overrides</span>
              </div>
              <div className="text-2xl font-bold">{stats.dispositionOverrides.overridden}</div>
              <div className="text-xs text-muted-foreground">of {stats.dispositionOverrides.total} total</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-background">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, company..."
            className="pl-8 h-9"
            value={filters.search}
            onChange={(e) => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
          />
        </div>

        <Select value={filters.campaignId} onValueChange={(v) => { setFilters(f => ({ ...f, campaignId: v })); setPage(1); }}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {campaigns.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.verdict} onValueChange={(v) => { setFilters(f => ({ ...f, verdict: v })); setPage(1); }}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Verdict" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Verdicts</SelectItem>
            <SelectItem value="high_potential,likely_potential,review">Actionable Only</SelectItem>
            <SelectItem value="high_potential">High Potential</SelectItem>
            <SelectItem value="likely_potential">Likely Potential</SelectItem>
            <SelectItem value="review">Needs Review</SelectItem>
            <SelectItem value="not_potential">Not Potential</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.recommendedAction} onValueChange={(v) => { setFilters(f => ({ ...f, recommendedAction: v })); setPage(1); }}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="engage">Engage</SelectItem>
            <SelectItem value="nurture">Nurture</SelectItem>
            <SelectItem value="review">Review</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.sortBy} onValueChange={(v) => setFilters(f => ({ ...f, sortBy: v }))}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="confidence">Confidence</SelectItem>
            <SelectItem value="intent">Intent</SelectItem>
            <SelectItem value="date">Date</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => autopilotMutation.mutate()} disabled={autopilotMutation.isPending}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
            {autopilotMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Running...</>
            ) : (
              <><Zap className="h-4 w-4 mr-1" /> Run Autopilot</>
            )}
          </Button>
          <Button size="sm" onClick={() => qualifyMutation.mutate()} disabled={qualifyMutation.isPending}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
            {qualifyMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Qualifying...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-1" /> Qualify Leads</>
            )}
          </Button>
        </div>
      </div>

      {/* Total Count + Legend */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="font-semibold">{total} precision-analyzed leads</span>
          {stats?.lastProcessed && (
            <span className="text-muted-foreground text-xs">
              Last run: {format(new Date(stats.lastProcessed), 'MMM d, h:mm a')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Brain className="h-3 w-3" /> Kimi 128k</span>
          <span>+</span>
          <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> DeepSeek</span>
          <span>=</span>
          <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-green-600" /> Consensus</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Lead List */}
        <ScrollArea className="flex-1 rounded-lg border bg-background">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Brain className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">No precision leads found</p>
              <p className="text-sm">Run the autopilot to analyze unprocessed calls</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => autopilotMutation.mutate()}>
                <Play className="h-4 w-4 mr-1" /> Start Autopilot
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {items.map((lead) => {
                const vConfig = VERDICT_CONFIG[lead.verdict] || VERDICT_CONFIG.review;
                const aConfig = ACTION_CONFIG[lead.recommendedAction || 'review'] || ACTION_CONFIG.review;
                const isSelected = lead.id === selectedId;

                return (
                  <div
                    key={lead.id}
                    className={cn(
                      'p-3 cursor-pointer hover:bg-muted/50 transition-colors',
                      isSelected && 'bg-primary/5 border-l-2 border-l-primary',
                    )}
                    onClick={() => setSelectedId(isSelected ? null : lead.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Contact + Campaign */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{lead.contactName}</span>
                          <VerdictBadge verdict={lead.verdict} />
                          {lead.overrideDisposition && (
                            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                              Disposition Override
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {lead.companyName !== 'Unknown' && (
                            <span className="flex items-center gap-1"><Building className="h-3 w-3" />{lead.companyName}</span>
                          )}
                          <span className="flex items-center gap-1"><Target className="h-3 w-3" />{lead.campaignName}</span>
                          {lead.callDuration && (
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{lead.callDuration}s</span>
                          )}
                          {lead.autopilotRun && (
                            <Badge variant="outline" className="text-[10px]"><Zap className="h-2.5 w-2.5 mr-0.5" />Auto</Badge>
                          )}
                        </div>

                        {/* Intent signals preview */}
                        {lead.intentSignals.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {lead.intentSignals.slice(0, 3).map((s, i) => (
                              <Badge key={i} variant="outline" className={cn('text-[10px]',
                                s.strength === 'strong' ? 'bg-green-50 text-green-700 border-green-200' :
                                s.strength === 'moderate' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                'bg-gray-50 text-gray-600')}>
                                {s.signal.slice(0, 30)}
                              </Badge>
                            ))}
                            {lead.intentSignals.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{lead.intentSignals.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Scores */}
                      <div className="flex flex-col items-end gap-1 shrink-0 w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Intent</div>
                            <div className={cn('text-lg font-bold',
                              lead.consensusIntentScore >= 70 ? 'text-green-600' :
                              lead.consensusIntentScore >= 40 ? 'text-blue-600' : 'text-gray-500'
                            )}>
                              {lead.consensusIntentScore}%
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Fit</div>
                            <div className={cn('text-lg font-bold',
                              lead.consensusCampaignFit >= 70 ? 'text-green-600' :
                              lead.consensusCampaignFit >= 40 ? 'text-blue-600' : 'text-gray-500'
                            )}>
                              {lead.consensusCampaignFit}%
                            </div>
                          </div>
                        </div>
                        <Badge className={cn('text-[10px]', aConfig.color)}>{aConfig.label}</Badge>
                        <div className="flex gap-2">
                          <ModelBadge model="Kimi" verdict={lead.kimiVerdict} confidence={lead.kimiConfidence} />
                          <ModelBadge model="DS" verdict={lead.deepseekVerdict} confidence={lead.deepseekConfidence} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Detail Panel */}
        {selectedLead ? (
          <div className="w-[480px] shrink-0 rounded-lg border bg-background overflow-hidden flex flex-col">
            {/* Fixed Header */}
            <div className="p-4 border-b bg-muted/30 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{selectedLead.contactName}</h3>
                  <div className="text-sm text-muted-foreground">{selectedLead.companyName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <VerdictBadge verdict={selectedLead.verdict} />
                  <Badge className={cn('text-xs', ACTION_CONFIG[selectedLead.recommendedAction || 'review']?.color)}>
                    {ACTION_CONFIG[selectedLead.recommendedAction || 'review']?.label}
                  </Badge>
                </div>
              </div>

              {/* Contact Info - Prominent */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {selectedLead.contactPhone && (
                  <div className="flex items-center gap-1.5 bg-primary/10 text-primary font-medium px-2.5 py-1 rounded-md">
                    <Phone className="h-3.5 w-3.5" />
                    {selectedLead.contactPhone}
                  </div>
                )}
                {selectedLead.contactEmail && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {selectedLead.contactEmail}
                  </div>
                )}
                {selectedLead.callDuration != null && selectedLead.callDuration > 0 && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {Math.floor(selectedLead.callDuration / 60)}:{String(selectedLead.callDuration % 60).padStart(2, '0')}
                  </div>
                )}
                {conversationDetail?.disposition && (
                  <Badge variant="outline" className="capitalize text-xs">
                    {String(conversationDetail.disposition).replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>

              {/* Recording Link */}
              {conversationDetail?.recordingUrl && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md p-2">
                  <Mic className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-xs font-medium text-blue-700">Recording Available</span>
                  <a
                    href={conversationDetail.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Open Recording <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Tabbed Content */}
            <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-3 bg-muted/40 p-1 rounded-none border-b shrink-0">
                <TabsTrigger value="overview" className="text-xs gap-1">
                  <Sparkles className="h-3 w-3" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="transcript" className="text-xs gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="analysis" className="text-xs gap-1">
                  <Brain className="h-3 w-3" />
                  AI Analysis
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    {/* Consensus Scores */}
                    <Card>
                      <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-green-600" />
                          Consensus Scores
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 space-y-2">
                        <ScoreBar label="Confidence" value={selectedLead.consensusConfidence} color="bg-violet-500" />
                        <ScoreBar label="Intent Score" value={selectedLead.consensusIntentScore} color="bg-green-500" />
                        <ScoreBar label="Campaign Fit" value={selectedLead.consensusCampaignFit} color="bg-blue-500" />
                        {selectedLead.dataCompleteness != null && (
                          <ScoreBar label="Data Completeness" value={selectedLead.dataCompleteness} color="bg-amber-500" />
                        )}
                      </CardContent>
                    </Card>

                    {/* Call Summary from conversation detail */}
                    {conversationDetail?.callSummary && (
                      <Card>
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Call Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 text-xs text-muted-foreground leading-relaxed">
                          {conversationDetail.callSummary}
                        </CardContent>
                      </Card>
                    )}

                    {/* Model Comparison */}
                    <Card>
                      <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          Model Comparison
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="p-2 rounded border">
                            <div className="flex items-center gap-1 mb-1">
                              <Brain className="h-3.5 w-3.5" />
                              <span className="font-medium text-xs">Kimi 128k</span>
                            </div>
                            {selectedLead.kimiVerdict ? (
                              <>
                                <VerdictBadge verdict={selectedLead.kimiVerdict} />
                                <div className="text-xs text-muted-foreground mt-1">{selectedLead.kimiConfidence}% conf</div>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not run</span>
                            )}
                          </div>
                          <div className="p-2 rounded border">
                            <div className="flex items-center gap-1 mb-1">
                              <Sparkles className="h-3.5 w-3.5" />
                              <span className="font-medium text-xs">DeepSeek</span>
                            </div>
                            {selectedLead.deepseekVerdict ? (
                              <>
                                <VerdictBadge verdict={selectedLead.deepseekVerdict} />
                                <div className="text-xs text-muted-foreground mt-1">{selectedLead.deepseekConfidence}% conf</div>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not run</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Disposition Analysis */}
                    {selectedLead.overrideDisposition && (
                      <Card className="border-red-200 bg-red-50/50">
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                            <AlertTriangle className="h-4 w-4" />
                            Disposition Override
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 text-sm space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Original:</span>
                            <Badge variant="outline" className="text-xs">{selectedLead.originalDisposition || 'none'}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Suggested:</span>
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">{selectedLead.suggestedDisposition}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Intent Signals */}
                    {selectedLead.intentSignals.length > 0 && (
                      <Card>
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-500" />
                            Intent Signals ({selectedLead.intentSignals.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="space-y-1.5">
                            {selectedLead.intentSignals.map((s, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <Badge variant="outline" className={cn('shrink-0 text-[10px]',
                                  s.strength === 'strong' ? 'bg-green-50 text-green-700 border-green-200' :
                                  s.strength === 'moderate' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  'bg-gray-50 text-gray-600')}>
                                  {s.strength}
                                </Badge>
                                <span>{s.signal}</span>
                                <span className="text-muted-foreground ml-auto">{s.source}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Engagement Indicators */}
                    {selectedLead.engagementIndicators.length > 0 && (
                      <Card>
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-500" />
                            Engagement
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                          <div className="space-y-1">
                            {selectedLead.engagementIndicators.map((e, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                {e.positive ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                )}
                                <span>{e.indicator}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Missing Fields */}
                    {selectedLead.missingFields.length > 0 && (
                      <Card className="border-amber-200 bg-amber-50/30">
                        <CardContent className="p-3 text-xs">
                          <div className="flex items-center gap-2 text-amber-700 mb-1">
                            <HelpCircle className="h-3.5 w-3.5" />
                            <span className="font-medium">Missing Data (not disqualifying)</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {selectedLead.missingFields.map((f, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Campaign Objective */}
                    {selectedLead.campaignObjective && (
                      <Card>
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            Campaign Objective
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                          {selectedLead.campaignObjective}
                        </CardContent>
                      </Card>
                    )}

                    {/* Meta */}
                    <div className="text-xs text-muted-foreground border-t pt-2 space-y-1">
                      {selectedLead.processedAt && (
                        <div>Analyzed: {format(new Date(selectedLead.processedAt), 'MMM d, yyyy h:mm a')}</div>
                      )}
                      {selectedLead.processingDurationMs && (
                        <div>Processing time: {(selectedLead.processingDurationMs / 1000).toFixed(1)}s</div>
                      )}
                      <div>Priority rank: {selectedLead.priorityRank}</div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Transcript Tab */}
              <TabsContent value="transcript" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {conversationLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-12 w-5/6" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-12 w-4/6" />
                      </div>
                    ) : transcriptData && transcriptData.available ? (
                      <UnifiedTranscriptDisplay
                        transcript={transcriptData}
                        maxHeight="600px"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                        <p className="text-sm font-medium">No transcript available</p>
                        <p className="text-xs mt-1">
                          {conversationDetail ? 'Transcript data is not available for this call' : 'Loading conversation details...'}
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* AI Analysis Tab */}
              <TabsContent value="analysis" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    {/* AI Reasoning */}
                    {selectedLead.consensusReasoning && (
                      <Card>
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Brain className="h-4 w-4" />
                            AI Consensus Reasoning
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 text-xs text-muted-foreground leading-relaxed">
                          {selectedLead.consensusReasoning}
                        </CardContent>
                      </Card>
                    )}

                    {/* Call Analysis from conversation detail */}
                    {conversationDetail?.analysis && (
                      <Card>
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            Call Analysis
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 text-xs space-y-2">
                          {conversationDetail.analysis?.summary && (
                            <div>
                              <span className="font-medium text-foreground">Summary:</span>
                              <p className="text-muted-foreground mt-0.5 leading-relaxed">{conversationDetail.analysis.summary}</p>
                            </div>
                          )}
                          {conversationDetail.analysis?.conversationQuality?.summary && (
                            <div>
                              <span className="font-medium text-foreground">Quality Assessment:</span>
                              <p className="text-muted-foreground mt-0.5 leading-relaxed">{conversationDetail.analysis.conversationQuality.summary}</p>
                            </div>
                          )}
                          {conversationDetail.analysis?.performanceMetrics && (
                            <div>
                              <span className="font-medium text-foreground">Performance Metrics:</span>
                              <div className="mt-1 grid grid-cols-2 gap-1">
                                {Object.entries(conversationDetail.analysis.performanceMetrics).map(([key, val]) => (
                                  <div key={key} className="flex items-center gap-1.5">
                                    {val ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                                    ) : (
                                      <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                                    )}
                                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Recommended Action */}
                    {selectedLead.recommendedAction && (
                      <Card>
                        <CardHeader className="p-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <ArrowRight className="h-4 w-4" />
                            Recommended Action
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 text-xs space-y-1">
                          <Badge className={cn('text-xs', ACTION_CONFIG[selectedLead.recommendedAction]?.color)}>
                            {ACTION_CONFIG[selectedLead.recommendedAction]?.label}
                          </Badge>
                          {selectedLead.actionReason && (
                            <p className="text-muted-foreground mt-1">{selectedLead.actionReason}</p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {!selectedLead.consensusReasoning && !conversationDetail?.analysis && (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Brain className="h-12 w-12 mb-4 opacity-50" />
                        <p className="text-sm font-medium">No analysis available</p>
                        <p className="text-xs mt-1">Run the autopilot to generate AI analysis</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="w-[480px] shrink-0 rounded-lg border bg-background flex items-center justify-center">
            <div className="text-center text-muted-foreground p-8">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm font-medium">Select a lead to view details</p>
              <p className="text-xs mt-1">Click on a lead from the list to see transcript, recording, and analysis</p>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages} ({total} results)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}