/**
 * Potential Leads Page
 *
 * Displays calls that are potential leads based on AI analysis:
 * - Disposition mismatches (AI thinks outcome differs from assigned disposition)
 * - High confidence non-qualified calls
 * - Qualification signals present but not marked as qualified
 *
 * Reuses the same filters and detail panel as Unified Intelligence.
 *
 * Route: /disposition-intelligence/potential-leads
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw, Brain, Search, ArrowLeft, Phone, Building, Clock, FileText,
  Mic, BarChart3, AlertTriangle, Target, TrendingUp, ChevronLeft, ChevronRight,
  Sparkles, Crosshair, Zap,
} from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  UnifiedDetailPanel,
  type UnifiedIntelligenceFilters,
  type UnifiedConversationDetail,
  defaultUnifiedFilters,
} from '@/components/unified-intelligence';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Campaign {
  id: string;
  name: string;
}

interface PotentialLeadItem {
  id: string;
  source: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  companyName: string;
  status: string;
  disposition?: string;
  derivedOutcome: string;
  derivedConfidence: number;
  transcriptQuality: 'missing' | 'one-sided' | 'two-sided';
  agentType: string;
  duration?: number;
  hasTranscript: boolean;
  hasRecording: boolean;
  hasAIAnalysis?: boolean;
  engagementSignals?: string[];
  createdAt: string;
  overallScore?: number;
  dispositionReview?: {
    assignedDisposition?: string;
    expectedDisposition?: string;
    isAccurate: boolean;
    notes: string[];
  };
  qualificationAssessment?: {
    metCriteria: boolean;
    successIndicators: string[];
    missingIndicators: string[];
    deviations: string[];
  };
  // Campaign-aware scoring fields
  campaignObjective?: string | null;
  campaignFitScore?: number | null;
  campaignAlignmentScore?: number | null;
  qualificationMet?: boolean;
  intentStrength?: string | null;
  outcomeCategory?: string | null;
  suggestedDisposition?: string | null;
  scoringSource?: 'lead_quality_ai' | 'call_quality_ai' | 'heuristic';
}

interface PotentialLeadsDiagnostics {
  totalCalls: number;
  withTranscript: number;
  withAnalysis: number;
  longCalls: number;
  baseFilteredCalls: number;
  skippedVoicemail: number;
  skippedLowConfidence: number;
  skippedNotPotential: number;
  dispositionBreakdown: Array<{ disposition: string | null; count: number }>;
  withLeadQualityAssessment?: number;
  withCallQualityRecord?: number;
  scoringSourceBreakdown?: { lead_quality_ai: number; call_quality_ai: number; heuristic: number };
}

interface PotentialLeadsResponse {
  success: boolean;
  total: number;
  items: PotentialLeadItem[];
  meta: {
    page: number;
    limit: number;
    totalPages: number;
    totalBeforeFilter: number;
  };
  diagnostics?: PotentialLeadsDiagnostics;
}

interface PotentialLeadsFilters extends UnifiedIntelligenceFilters {
  minDuration: number | null;
  transcriptQuality: 'all' | 'missing' | 'one-sided' | 'two-sided';
  minConfidence: number | null;
}

const defaultPotentialLeadsFilters: PotentialLeadsFilters = {
  ...defaultUnifiedFilters,
  minDuration: null,
  transcriptQuality: 'all',
  minConfidence: null,
};

// Adapter function to convert potential lead to unified detail format
function adaptPotentialLeadToDetail(lead: PotentialLeadItem, rawData: any): UnifiedConversationDetail {
  // Parse transcript turns if available
  const transcriptTurns = (rawData?.transcriptTurns || []).map((turn: any) => ({
    speaker: turn.role === 'agent' || turn.role === 'assistant' ? 'agent' : turn.role === 'system' ? 'system' : 'prospect',
    text: turn.text,
    timestamp: turn.timestamp,
  }));

  return {
    id: lead.id,
    source: lead.source as any,
    contact: {
      name: lead.contactName,
      email: lead.contactEmail,
      phone: lead.contactPhone,
      company: lead.companyName,
    },
    campaign: {
      id: lead.campaignId,
      name: lead.campaignName,
    },
    type: 'production',
    interactionType: 'call',
    agentType: lead.agentType as any,
    createdAt: lead.createdAt,
    durationSec: lead.duration,
    status: lead.status,
    disposition: lead.disposition,
    recording: {
      available: lead.hasRecording,
      status: lead.hasRecording ? 'stored' : 'none',
      url: rawData?.recordingUrl,
      s3Key: rawData?.recordingS3Key,
      telnyxRecordingId: rawData?.telnyxRecordingId,
    },
    transcript: {
      available: lead.hasTranscript,
      isFull: true,
      rawText: rawData?.transcript,
      turns: transcriptTurns,
    },
    callAnalysis: {
      summaryText: rawData?.analysis?.conversationQuality?.summary || rawData?.analysis?.summary,
      metrics: rawData?.analysis?.performanceMetrics || {},
      conversationStates: [],
      detectedIssues: rawData?.analysis?.conversationQuality?.issues || rawData?.analysis?.issues || [],
    },
    qualityAnalysis: {
      score: lead.overallScore,
      subscores: rawData?.analysis?.conversationQuality?.qualityDimensions || {},
      recommendations: rawData?.analysis?.conversationQuality?.recommendations || [],
    },
    dispositionReview: lead.dispositionReview ? {
      assignedDisposition: lead.dispositionReview.assignedDisposition,
      expectedDisposition: lead.dispositionReview.expectedDisposition,
      isAccurate: lead.dispositionReview.isAccurate,
      notes: lead.dispositionReview.notes,
    } : undefined,
  };
}

export default function PotentialLeadsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Parse URL query params into filters
  const parseUrlParams = useCallback((): PotentialLeadsFilters => {
    const params = new URLSearchParams(window.location.search);
    return {
      ...defaultPotentialLeadsFilters,
      search: params.get('search') || '',
      campaignId: params.get('campaignId') || 'all',
      type: (params.get('type') as any) || 'all',
      source: (params.get('source') as any) || 'all',
      disposition: params.get('disposition') || 'all',
      hasTranscript: params.get('hasTranscript') === 'true' ? true : null,
      minDuration: params.get('minDuration') ? parseInt(params.get('minDuration')!) : null,
      transcriptQuality: (params.get('transcriptQuality') as any) || 'all',
      minConfidence: params.get('minConfidence') ? parseFloat(params.get('minConfidence')!) : null,
    };
  }, []);

  const [filters, setFilters] = useState<PotentialLeadsFilters>(parseUrlParams);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Sync URL params with filter state
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.campaignId !== 'all') params.set('campaignId', filters.campaignId);
    if (filters.type !== 'all') params.set('type', filters.type);
    if (filters.source !== 'all') params.set('source', filters.source);
    if (filters.disposition !== 'all') params.set('disposition', filters.disposition);
    if (filters.hasTranscript === true) params.set('hasTranscript', 'true');
    if (filters.minDuration) params.set('minDuration', filters.minDuration.toString());
    if (filters.transcriptQuality !== 'all') params.set('transcriptQuality', filters.transcriptQuality);
    if (filters.minConfidence) params.set('minConfidence', filters.minConfidence.toString());

    const newUrl = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState(null, '', `/disposition-intelligence/potential-leads${newUrl}`);
  }, [filters]);

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
  });

  // Build query params for potential leads API
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', pageSize.toString());
    if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
    if (filters.search.trim()) params.append('search', filters.search.trim());
    if (filters.disposition !== 'all') params.append('disposition', filters.disposition);
    if (filters.minDuration) params.append('minDuration', filters.minDuration.toString());
    if (filters.transcriptQuality !== 'all') params.append('transcriptQuality', filters.transcriptQuality);
    if (filters.minConfidence) params.append('minConfidence', filters.minConfidence.toString());
    return params.toString();
  }, [filters, page, pageSize]);

  // Fetch potential leads
  const {
    data: potentialLeadsData,
    isLoading,
    refetch,
  } = useQuery<PotentialLeadsResponse>({
    queryKey: ['/api/qa/potential-leads', filters, page],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/qa/potential-leads?${buildQueryParams()}`);
      return response.json();
    },
  });

  const potentialLeads = potentialLeadsData?.items || [];
  const total = potentialLeadsData?.total || 0;
  const meta = potentialLeadsData?.meta || { page: 1, totalPages: 1 };
  const diagnostics = potentialLeadsData?.diagnostics;

  // Fetch full conversation detail when selected
  const { data: selectedDetail, isLoading: detailLoading } = useQuery<UnifiedConversationDetail | null>({
    queryKey: ['/api/qa/conversations', selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const response = await apiRequest('GET', `/api/qa/conversations?id=${selectedId}&limit=1`);
      const data = await response.json();
      const conv = data.conversations?.find((c: any) => c.id === selectedId);
      if (!conv) return null;
      const lead = potentialLeads.find(l => l.id === selectedId);
      if (!lead) return null;
      return adaptPotentialLeadToDetail(lead, conv);
    },
    enabled: !!selectedId,
  });

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('POST', `/api/call-sessions/${sessionId}/analyze`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Analysis Complete' });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Analysis Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Transcribe mutation
  const transcribeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('POST', `/api/recordings/${sessionId}/transcribe`, { source: 'call_sessions' });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Transcription Complete' });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Transcription Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Bulk analysis mutation - analyzes calls without AI analysis
  const bulkAnalyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/qa/bulk-analyze', {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: 'Bulk Analysis Complete', 
        description: `Analyzed ${data.analyzed || 0} calls (${data.failed || 0} failed)` 
      });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Bulk Analysis Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleBack = () => setLocation('/disposition-intelligence?tab=conversation-quality');

  const updateFilter = <K extends keyof PotentialLeadsFilters>(key: K, value: PotentialLeadsFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page on filter change
  };

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Target className="h-6 w-6 text-primary" />
                Potential Leads
              </h1>
              <p className="text-sm text-muted-foreground">
                Calls with potential qualification signals that may need review
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Total Count Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-semibold text-primary">
                Potential Leads: {total}
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => bulkAnalyzeMutation.mutate()}
              disabled={bulkAnalyzeMutation.isPending}
            >
              {bulkAnalyzeMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Run AI Analysis
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-4 pt-3">
        <ResizablePanelGroup direction="horizontal" className="h-full rounded-xl border bg-background shadow-sm">
          {/* Left Panel - Filters + List */}
          <ResizablePanel defaultSize={40} minSize={30} maxSize={50}>
            <div className="h-full overflow-auto p-4 space-y-4">
              {/* Filters */}
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">Filters</p>
                      <p className="text-[11px] text-muted-foreground">Refine potential leads</p>
                    </div>
                  </div>
                  
                  {/* Standard Filters (same as Unified Intelligence) */}
                  <div className="flex flex-wrap gap-3 items-end mb-4">
                    {/* Search */}
                    <div className="flex-1 min-w-[180px]">
                      <Label htmlFor="search" className="text-xs">Search</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          id="search"
                          placeholder="Name, company..."
                          value={filters.search}
                          onChange={(e) => updateFilter('search', e.target.value)}
                          className="pl-7 h-8 text-sm"
                        />
                      </div>
                    </div>

                    {/* Campaign */}
                    <div className="w-[140px]">
                      <Label className="text-xs">Campaign</Label>
                      <Select value={filters.campaignId} onValueChange={(v) => updateFilter('campaignId', v)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Campaigns</SelectItem>
                          {campaigns.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Disposition */}
                    <div className="w-[130px]">
                      <Label className="text-xs">Disposition</Label>
                      <Select value={filters.disposition} onValueChange={(v) => updateFilter('disposition', v)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="not_interested">Not Interested</SelectItem>
                          <SelectItem value="callback">Callback</SelectItem>
                          <SelectItem value="voicemail">Voicemail</SelectItem>
                          <SelectItem value="no_answer">No Answer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Lead-Specific Filters */}
                  <div className="border-t pt-3 mt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Lead-Specific Filters</p>
                    <div className="flex flex-wrap gap-3 items-end">
                      {/* Min Duration */}
                      <div className="w-[100px]">
                        <Label className="text-xs">Min Duration (s)</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={filters.minDuration || ''}
                          onChange={(e) => updateFilter('minDuration', e.target.value ? parseInt(e.target.value) : null)}
                          className="h-8 text-sm"
                          min={0}
                        />
                      </div>

                      {/* Transcript Quality */}
                      <div className="w-[130px]">
                        <Label className="text-xs">Transcript Quality</Label>
                        <Select
                          value={filters.transcriptQuality}
                          onValueChange={(v) => updateFilter('transcriptQuality', v as any)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="two-sided">Two-sided</SelectItem>
                            <SelectItem value="one-sided">One-sided</SelectItem>
                            <SelectItem value="missing">Missing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Confidence Threshold */}
                      <div className="w-[180px]">
                        <Label className="text-xs">
                          Min Confidence: {filters.minConfidence ?? 0}%
                        </Label>
                        <Slider
                          value={[filters.minConfidence ?? 0]}
                          onValueChange={(v) => updateFilter('minConfidence', v[0] || null)}
                          max={100}
                          step={5}
                          className="mt-2"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Results List */}
              <Card className="h-[480px] flex flex-col">
                <CardHeader className="pb-2 px-4 pt-3 border-b bg-muted/30">
                  <CardTitle className="text-sm">Potential Leads</CardTitle>
                  <CardDescription className="text-xs">
                    {isLoading ? 'Loading...' : `Showing ${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, total)} of ${total}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-0">
                  {isLoading ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                      ))}
                    </div>
                  ) : potentialLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                      <Target className="h-10 w-10 mb-2 opacity-50" />
                      <p className="text-sm font-medium">No potential leads found</p>
                      
                      {/* Show diagnostics if available */}
                      {diagnostics && (
                        <div className="mt-4 text-xs space-y-2 bg-muted/50 rounded-lg p-3 w-full max-w-sm">
                          <p className="font-medium text-foreground">Dataset Overview:</p>
                          <div className="grid grid-cols-2 gap-1">
                            <span>Total calls:</span>
                            <span className="font-medium">{diagnostics.totalCalls}</span>
                            <span>With transcripts:</span>
                            <span className="font-medium">{diagnostics.withTranscript}</span>
                            <span>With AI analysis:</span>
                            <span className="font-medium">{diagnostics.withAnalysis}</span>
                            <span>Duration ≥30s:</span>
                            <span className="font-medium">{diagnostics.longCalls}</span>
                          </div>
                          
                          {diagnostics.baseFilteredCalls > 0 && (
                            <>
                              <p className="font-medium text-foreground pt-2">Filtering Results:</p>
                              <div className="grid grid-cols-2 gap-1">
                                <span>Base filtered:</span>
                                <span className="font-medium">{diagnostics.baseFilteredCalls}</span>
                                <span>Voicemail/IVR:</span>
                                <span className="text-amber-600">-{diagnostics.skippedVoicemail}</span>
                                <span>Low confidence:</span>
                                <span className="text-amber-600">-{diagnostics.skippedLowConfidence}</span>
                                <span>Not potential:</span>
                                <span className="text-amber-600">-{diagnostics.skippedNotPotential}</span>
                              </div>
                            </>
                          )}

                          {(diagnostics.withLeadQualityAssessment != null || diagnostics.withCallQualityRecord != null) && (
                            <>
                              <p className="font-medium text-foreground pt-2">AI Scoring Coverage:</p>
                              <div className="grid grid-cols-2 gap-1">
                                {diagnostics.withLeadQualityAssessment != null && (
                                  <>
                                    <span>Lead quality AI:</span>
                                    <span className="font-medium">{diagnostics.withLeadQualityAssessment}</span>
                                  </>
                                )}
                                {diagnostics.withCallQualityRecord != null && (
                                  <>
                                    <span>Call quality AI:</span>
                                    <span className="font-medium">{diagnostics.withCallQualityRecord}</span>
                                  </>
                                )}
                              </div>
                              {diagnostics.scoringSourceBreakdown && (
                                <div className="grid grid-cols-2 gap-1 pt-1">
                                  <span>AI scored leads:</span>
                                  <span className="font-medium text-blue-600">
                                    {diagnostics.scoringSourceBreakdown.lead_quality_ai + diagnostics.scoringSourceBreakdown.call_quality_ai}
                                  </span>
                                  <span>Heuristic leads:</span>
                                  <span className="font-medium text-gray-600">
                                    {diagnostics.scoringSourceBreakdown.heuristic}
                                  </span>
                                </div>
                              )}
                            </>
                          )}

                          {diagnostics.withTranscript === 0 && (
                            <p className="text-amber-600 pt-2">
                              No calls have transcripts yet. Transcripts are required for lead detection.
                            </p>
                          )}

                          {diagnostics.withTranscript > 0 && diagnostics.withAnalysis === 0 && (
                            <p className="text-amber-600 pt-2">
                              No calls have AI analysis. Run bulk analysis to improve detection.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => refetch()}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Refresh
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={() => bulkAnalyzeMutation.mutate()}
                          disabled={bulkAnalyzeMutation.isPending}
                        >
                          {bulkAnalyzeMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Brain className="h-4 w-4 mr-1" />
                              Run AI Analysis
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-[10px] mt-2 text-center max-w-xs">
                        AI analysis improves lead detection accuracy by identifying qualification signals in transcripts.
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="h-full">
                      <div className="p-2 space-y-2">
                        {potentialLeads.map((lead) => (
                          <PotentialLeadCard
                            key={lead.id}
                            lead={lead}
                            isSelected={selectedId === lead.id}
                            onClick={() => setSelectedId(lead.id)}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
                {/* Pagination */}
                {meta.totalPages > 1 && (
                  <div className="border-t px-4 py-2 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {page} of {meta.totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                      disabled={page >= meta.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Detail */}
          <ResizablePanel defaultSize={60} minSize={40}>
            <div className="h-full overflow-auto p-4">
              <UnifiedDetailPanel
                conversation={selectedDetail || null}
                isLoading={detailLoading && !!selectedId}
                onAnalyze={(id) => analyzeMutation.mutate(id)}
                onTranscribe={(id) => transcribeMutation.mutate(id)}
                onSelectHistoryCall={(id) => setSelectedId(id)}
                isAnalyzing={analyzeMutation.isPending}
                isTranscribing={transcribeMutation.isPending}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function PotentialLeadCard({
  lead,
  isSelected,
  onClick,
}: {
  lead: PotentialLeadItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const confidenceColor = lead.derivedConfidence >= 70
    ? 'text-green-600'
    : lead.derivedConfidence >= 50
      ? 'text-yellow-600'
      : 'text-gray-500';

  const intentColor = lead.intentStrength === 'strong'
    ? 'bg-green-100 border-green-300 text-green-800'
    : lead.intentStrength === 'moderate'
      ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
      : 'bg-gray-100 border-gray-300 text-gray-600';

  const isAIScored = lead.scoringSource === 'lead_quality_ai' || lead.scoringSource === 'call_quality_ai';

  const hasSuggestedDispositionMismatch = lead.suggestedDisposition
    && lead.disposition
    && lead.suggestedDisposition.toLowerCase() !== lead.disposition.toLowerCase();

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md p-3 border-muted/60 bg-background/80 hover:bg-muted/20',
        isSelected && 'ring-2 ring-primary/60 bg-primary/5'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Contact Name */}
          <div className="flex items-center gap-2 mb-1">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-sm truncate">{lead.contactName}</span>
            {lead.agentType === 'ai' && (
              <Badge variant="secondary" className="text-[10px] px-1">AI</Badge>
            )}
            {/* Scoring Source Badge */}
            {isAIScored ? (
              <Badge variant="outline" className="text-[10px] px-1 bg-blue-50 border-blue-300 text-blue-700">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                AI Scored
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1 bg-gray-50 border-gray-300 text-gray-600">
                Heuristic
              </Badge>
            )}
          </div>
          {/* Company */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building className="h-3 w-3" />
            <span className="truncate">{lead.companyName}</span>
          </div>
        </div>

        {/* Confidence + Campaign Fit */}
        <div className="flex flex-col items-end gap-1">
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 font-semibold', confidenceColor)}
          >
            {lead.derivedConfidence}% confidence
          </Badge>
          {lead.campaignFitScore != null && (
            <Badge variant="outline" className="text-[10px] px-1.5 bg-indigo-50 border-indigo-300 text-indigo-700">
              <Crosshair className="h-2.5 w-2.5 mr-0.5" />
              {lead.campaignFitScore}% fit
            </Badge>
          )}
          {lead.disposition && (
            <Badge variant="outline" className="text-[10px] px-1">
              {lead.disposition.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>
      </div>

      {/* Campaign Objective */}
      {lead.campaignObjective && (
        <div className="mt-1.5 text-[10px] text-muted-foreground truncate">
          <span className="font-medium">Objective:</span> {lead.campaignObjective}
        </div>
      )}

      {/* Intent Strength + Outcome Category */}
      {(lead.intentStrength || lead.outcomeCategory) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {lead.intentStrength && (
            <Badge variant="outline" className={cn('text-[10px] px-1 py-0', intentColor)}>
              <Zap className="h-2.5 w-2.5 mr-0.5" />
              {lead.intentStrength} intent
            </Badge>
          )}
          {lead.outcomeCategory && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-slate-50 border-slate-300 text-slate-700">
              {lead.outcomeCategory.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>
      )}

      {/* Suggested Disposition (show both AI suggestion and mismatch) */}
      {hasSuggestedDispositionMismatch ? (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-amber-600 font-medium flex items-center gap-0.5">
            <AlertTriangle className="h-3 w-3" />
            AI suggests:
          </span>
          <Badge variant="default" className="bg-amber-600 text-white text-[10px]">
            {lead.suggestedDisposition!.replace(/_/g, ' ')}
          </Badge>
        </div>
      ) : lead.derivedOutcome !== lead.disposition && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Suggested:</span>
          <Badge variant="default" className="bg-green-600 text-white text-[10px]">
            {lead.derivedOutcome.replace(/_/g, ' ')}
          </Badge>
        </div>
      )}

      {/* Bottom Row */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate max-w-[120px]">{lead.campaignName}</span>
        <div className="flex items-center gap-2">
          {lead.duration !== undefined && lead.duration > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {Math.floor(lead.duration / 60)}:{String(lead.duration % 60).padStart(2, '0')}
            </span>
          )}
          <span>
            {format(new Date(lead.createdAt), 'MMM d, HH:mm')}
          </span>
        </div>
      </div>

      {/* Indicators */}
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        {lead.hasTranscript && (
          <span className="flex items-center gap-0.5 text-[10px] text-green-600">
            <FileText className="h-2.5 w-2.5" />
            {lead.transcriptQuality}
          </span>
        )}
        {lead.hasRecording && (
          <span className="flex items-center gap-0.5 text-[10px] text-blue-600">
            <Mic className="h-2.5 w-2.5" />
            Recording
          </span>
        )}
        {lead.overallScore !== undefined && (
          <span className="flex items-center gap-0.5 text-[10px]">
            <BarChart3 className="h-2.5 w-2.5" />
            {lead.overallScore}
          </span>
        )}
        {lead.campaignAlignmentScore != null && (
          <span className="flex items-center gap-0.5 text-[10px] text-indigo-600">
            <Target className="h-2.5 w-2.5" />
            Align {lead.campaignAlignmentScore}%
          </span>
        )}
        {lead.qualificationMet && (
          <span className="flex items-center gap-0.5 text-[10px] text-green-700 font-medium">
            Qualified
          </span>
        )}
        {lead.dispositionReview && !lead.dispositionReview.isAccurate && (
          <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
            <AlertTriangle className="h-2.5 w-2.5" />
            Mismatch
          </span>
        )}
      </div>

      {/* Engagement Signals */}
      {lead.engagementSignals && lead.engagementSignals.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {lead.engagementSignals.slice(0, 3).map((signal, idx) => (
            <Badge
              key={idx}
              variant="outline"
              className="text-[9px] px-1 py-0 bg-purple-50 border-purple-200 text-purple-700"
            >
              {signal}
            </Badge>
          ))}
          {lead.engagementSignals.length > 3 && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 bg-gray-50 border-gray-200 text-gray-600"
            >
              +{lead.engagementSignals.length - 3} more
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}
