/**
 * Disposition Intelligence Hub
 *
 * Consolidates these routes/views into one hub:
 * - Disposition Intelligence
 * - Conversation Quality
 * - Showcase Calls
 * - Reanalysis
 *
 * Route: /disposition-intelligence
 */

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Brain, MessageSquare, BarChart3, Target, Trophy, Activity } from 'lucide-react';
import { IntelligenceFlowDiagram } from '@/components/intelligence-flow-diagram';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  ConversationListPanel,
  UnifiedDetailPanel,
  TopChallengesPanel,
  type UnifiedIntelligenceFilters,
  type UnifiedConversationListItem,
  type UnifiedConversationDetail,
  type TopChallenge,
  defaultUnifiedFilters,
  buildUnifiedQueryParams,
} from '@/components/unified-intelligence';
import { DispositionIntelligenceView } from '@/components/disposition-intelligence';

const ShowcaseCallsPage = lazy(() => import('@/pages/showcase-calls'));
const DispositionReanalysisPage = lazy(() => import('@/pages/disposition-reanalysis'));
const TranscriptionHealthView = lazy(() => import('@/components/transcription-health-view'));

interface Campaign {
  id: string;
  name: string;
}

function stringifyForDisplay(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyForDisplay(item))
      .filter(Boolean)
      .join(' • ');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredFields = [
      'description',
      'text',
      'suggestedChange',
      'recommendation',
      'currentBehavior',
      'expectedImpact',
      'message',
      'title',
      'name',
      'type',
      'category',
      'severity',
    ];

    const parts = preferredFields
      .map((key) => stringifyForDisplay(record[key]))
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' • ');
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '[invalid value]';
    }
  }

  return String(value);
}

type HubTab =
  | 'disposition-intelligence'
  | 'conversation-quality'
  | 'transcription-health'
  | 'showcase-calls'
  | 'reanalysis';

function normalizeTab(tab: string | null): HubTab {
  switch (tab) {
    case 'disposition-intelligence':
    case 'dispositions':
      return 'disposition-intelligence';
    case 'conversation-quality':
    case 'conversations':
    case 'recordings':
      return 'conversation-quality';
    case 'transcription-health':
      return 'transcription-health';
    case 'showcase-calls':
    case 'showcase':
      return 'showcase-calls';
    case 'reanalysis':
    case 'disposition-reanalysis':
      return 'reanalysis';
    default:
      return 'disposition-intelligence';
  }
}

// Adapter function to normalize conversation data from /api/qa/conversations
// to the unified format. This keeps data transformation isolated.
function adaptConversationToListItem(conv: any): UnifiedConversationListItem {
  return {
    id: conv.id,
    source: conv.source || 'call_session',
    contactName: conv.contactName || 'Unknown',
    companyName: conv.companyName || 'Unknown',
    campaignName: conv.campaignName || 'Unknown Campaign',
    type: conv.isTestCall ? 'test' : 'production',
    interactionType: conv.type || 'call',
    agentType: conv.agentType || 'ai',
    createdAt: conv.createdAt,
    durationSec: conv.duration,
    status: conv.status || 'unknown',
    disposition: conv.disposition,
    hasTranscript: !!(conv.transcript && conv.transcript.length > 50) || !!(conv.transcriptTurns && conv.transcriptTurns.length > 0),
    hasRecording: conv.hasRecording || !!conv.recordingUrl || !!conv.recordingS3Key || !!conv.telnyxRecordingId,
    qualityScore: conv.analysis?.overallScore,
    testResult: conv.testResult,
    issueCount: conv.detectedIssues?.length || conv.analysis?.issues?.length,
    callCount: conv.callCount || 1,
  };
}

// Adapter function to normalize full conversation detail
function adaptConversationToDetail(conv: any): UnifiedConversationDetail {
  // Parse transcript turns
  const transcriptTurns = (conv.transcriptTurns || []).map((turn: any) => ({
    speaker: normalizeSpeaker(turn.role),
    text: turn.text,
    timestamp: turn.timestamp,
    startMs: turn.startMs,
    endMs: turn.endMs,
  }));

  // Determine transcript availability
  const hasTranscriptContent = !!(conv.transcript && conv.transcript.length > 50) || transcriptTurns.length > 0;

  // Extract performance metrics from analysis
  const perfMetrics = conv.analysis?.performanceMetrics || conv.aiPerformanceMetrics || {};

  // Extract detected issues
  const detectedIssues = (conv.detectedIssues || conv.analysis?.issues || []).map((issue: any) => ({
    severity: (typeof issue.severity === 'string' ? issue.severity : 'medium') as 'high' | 'medium' | 'low',
    code: stringifyForDisplay(issue.type || issue.code || 'unknown'),
    type: stringifyForDisplay(issue.type),
    description: stringifyForDisplay(issue.description || issue),
    recommendation: stringifyForDisplay(issue.suggestion || issue.recommendation),
    evidence: stringifyForDisplay(issue.evidence),
  }));

  // Extract quality subscores
  const qualityDimensions = conv.analysis?.qualityDimensions || {};

  // Extract recommendations
  const recommendations = (conv.analysis?.recommendations || []).map((rec: any) => ({
    area: stringifyForDisplay(rec.category || rec.area || 'general'),
    category: stringifyForDisplay(rec.category || rec.area),
    text: stringifyForDisplay(rec.suggestedChange || rec.text || rec),
    suggestedChange: stringifyForDisplay(rec.suggestedChange || rec.text),
    impact: stringifyForDisplay(rec.expectedImpact || rec.impact),
    priority: (typeof rec.priority === 'string' ? rec.priority : undefined) as 'high' | 'medium' | 'low' | undefined,
  }));

  return {
    id: conv.id,
    source: conv.source || 'call_session',
    contact: {
      id: conv.contactId,
      name: conv.contactName || 'Unknown',
      email: conv.contactEmail,
      phone: conv.contactPhone,
      company: conv.companyName || 'Unknown',
      jobTitle: conv.contactJobTitle,
    },
    campaign: {
      id: conv.campaignId,
      name: conv.campaignName || 'Unknown Campaign',
    },
    type: conv.isTestCall ? 'test' : 'production',
    interactionType: conv.type || 'call',
    agentType: conv.agentType || 'ai',
    agentName: conv.agentName,
    createdAt: conv.createdAt,
    durationSec: conv.duration || conv.durationSeconds,
    status: conv.status || 'unknown',
    result: conv.testResult || conv.result,
    disposition: conv.disposition,

    recording: {
      available: conv.hasRecording || !!conv.recordingUrl || !!conv.recordingS3Key || !!conv.telnyxRecordingId || conv.recordingStatus === 'stored',
      status: conv.recordingStatus || (conv.recordingUrl || conv.recordingS3Key || conv.telnyxRecordingId ? 'stored' : 'none'),
      url: conv.recordingUrl,
      s3Key: conv.recordingS3Key,
      telnyxRecordingId: conv.telnyxRecordingId,
      mimeType: conv.recordingMimeType,
      durationSec: conv.recordingDurationSec,
      fileSizeBytes: conv.recordingFileSizeBytes,
    },

    transcript: {
      available: hasTranscriptContent,
      isFull: true, // Assume full unless indicated otherwise
      rawText: conv.transcript,
      turns: transcriptTurns,
    },

    callAnalysis: {
      summaryText: conv.callSummary || conv.analysis?.summary,
      testResult: conv.testResult,
      metrics: perfMetrics,
      conversationStates: conv.conversationStates || [],
      detectedIssues,
    },

    qualityAnalysis: {
      score: conv.analysis?.overallScore,
      subscores: qualityDimensions,
      sentiment: conv.analysis?.sentiment,
      engagementLevel: conv.analysis?.engagementLevel,
      recommendations,
    },

    dispositionReview: conv.analysis?.dispositionReview ? {
      assignedDisposition: conv.analysis.dispositionReview.assignedDisposition || conv.analysis.dispositionReview.assigned,
      expectedDisposition: conv.analysis.dispositionReview.expectedDisposition || conv.analysis.dispositionReview.expected,
      isAccurate: conv.analysis.dispositionReview.isAccurate ?? conv.analysis.dispositionReview.accurate,
      notes: conv.analysis.dispositionReview.notes,
    } : undefined,

    // Consolidated call history
    callCount: conv.callCount || 1,
    callHistory: conv.callHistory,
  };
}

function normalizeSpeaker(role: string): 'agent' | 'prospect' | 'system' {
  const lower = role?.toLowerCase() || '';
  if (['agent', 'assistant', 'ai', 'bot'].includes(lower)) return 'agent';
  if (['system', 'note'].includes(lower)) return 'system';
  return 'prospect';
}

export default function UnifiedIntelligencePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location] = useLocation();
  const [pageTab, setPageTab] = useState<HubTab>(() =>
    normalizeTab(new URLSearchParams(window.location.search).get('tab'))
  );
  const [filters, setFilters] = useState<UnifiedIntelligenceFilters>(defaultUnifiedFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    const tabFromUrl = normalizeTab(new URLSearchParams(window.location.search).get('tab'));
    setPageTab((prev) => (prev === tabFromUrl ? prev : tabFromUrl));
  }, [location]);

  const handleTabChange = useCallback((nextTab: HubTab) => {
    setPageTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', nextTab);
    const nextSearch = params.toString();
    window.history.replaceState(
      null,
      '',
      nextSearch ? `${window.location.pathname}?${nextSearch}` : window.location.pathname
    );
  }, []);

  // Fetch campaigns for filter dropdowns — shared with child tabs
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min — campaign list rarely changes
  });

  // Build query params for the existing /api/qa/conversations endpoint
  // This reuses the existing data source without creating new endpoints
  const buildQaQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
    if (filters.source !== 'all') params.append('source', filters.source);
    if (filters.search.trim()) params.append('search', filters.search.trim());
    params.append('limit', '200');
    return params.toString();
  }, [filters]);

  // Fetch conversations — only when conversation-quality tab is active
  const {
    data: conversationsData,
    isLoading: conversationsLoading,
    refetch: refetchConversations,
  } = useQuery<{ conversations: any[]; topChallenges?: TopChallenge[]; stats?: any; total?: number }>({
    queryKey: ['/api/qa/conversations', filters.campaignId, filters.source, filters.search],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/qa/conversations?${buildQaQueryParams()}`);
      return response.json();
    },
    enabled: pageTab === 'conversation-quality',
    staleTime: 60 * 1000, // 1 min — avoid refetching on every tab switch
  });

  // Transform and filter conversations
  const allConversations = useMemo(
    () => (conversationsData?.conversations || []).map(adaptConversationToListItem),
    [conversationsData]
  );

  // Apply client-side filters
  const conversations = useMemo(() => {
    let filtered = allConversations;

    if (filters.type !== 'all') {
      filtered = filtered.filter(c => c.type === filters.type);
    }

    if (filters.disposition !== 'all') {
      filtered = filtered.filter(c =>
        c.disposition?.toLowerCase().includes(filters.disposition.toLowerCase())
      );
    }

    if (filters.hasTranscript === true) {
      filtered = filtered.filter(c => c.hasTranscript);
    }

    return filtered;
  }, [allConversations, filters]);

  // Calculate stats
  const stats = useMemo(() => {
    // Prefer server-side true counts (ignoring pagination limit)
    if (conversationsData?.stats?.counts) {
      return {
        total: conversationsData.stats.counts.total,
        calls: conversationsData.stats.counts.calls,
        emails: conversationsData.stats.counts.emails,
        testCalls: conversationsData.stats.counts.testCalls,
        withTranscripts: conversationsData.stats.counts.withTranscripts,
        analyzedWithScores: conversationsData.stats.analyzedWithScores,
        avgQualityScore: conversationsData.stats.avgQualityScore,
      };
    }

    // Fallback to client-side specific counts
    return {
      total: conversationsData?.total || conversations.length,
      calls: conversations.filter(c => c.interactionType === 'call' && c.type !== 'test').length,
      emails: conversations.filter(c => c.interactionType === 'email').length,
      testCalls: conversations.filter(c => c.type === 'test').length,
      withTranscripts: conversations.filter(c => c.hasTranscript).length,
      analyzedWithScores: conversations.filter(c => c.qualityScore && c.qualityScore > 0).length,
      avgQualityScore: undefined as number | undefined,
    };
  }, [conversations, conversationsData]);


  // Find selected conversation for detail panel
  const selectedRaw = useMemo(() => (
    selectedId
      ? conversationsData?.conversations?.find((c: any) => c.id === selectedId)
      : null
  ), [selectedId, conversationsData]);
  const selectedConversation = useMemo(
    () => (selectedRaw ? adaptConversationToDetail(selectedRaw) : null),
    [selectedRaw]
  );

  // Top challenges from server-aggregated data
  const topChallenges = conversationsData?.topChallenges || [];
  const totalIssues = conversationsData?.stats?.totalIssues || 0;

  // ===== ANALYZE MUTATION =====
  const analyzeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('POST', `/api/call-sessions/${sessionId}/analyze`, undefined, { timeout: 120000 });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Analysis Complete', description: `Score: ${data.analysis?.overallScore || 'N/A'}/100` });
      refetchConversations();
    },
    onError: (error: any) => {
      toast({ title: 'Analysis Failed', description: error.message || 'Could not analyze call', variant: 'destructive' });
    },
  });

  const handleAnalyze = useCallback((sessionId: string) => {
    analyzeMutation.mutate(sessionId);
  }, [analyzeMutation]);

  // ===== TRANSCRIBE MUTATION =====
  const transcribeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('POST', `/api/qa/transcribe/${sessionId}`, { analyze: true }, { timeout: 120000 });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Transcription Complete', description: 'Call transcribed and analyzed successfully' });
      refetchConversations();
    },
    onError: (error: any) => {
      toast({ title: 'Transcription Failed', description: error.message || 'Could not transcribe call', variant: 'destructive' });
    },
  });

  const handleTranscribe = useCallback((sessionId: string) => {
    transcribeMutation.mutate(sessionId);
  }, [transcribeMutation]);

  const handleSelectHistoryCall = useCallback((sessionId: string) => {
    setSelectedId(sessionId);
  }, []);

  // Real-time polling for active calls
  // Poll while any conversation is in non-terminal state
  useEffect(() => {
    const hasActiveCall = conversations.some(c =>
      ['queued', 'ringing', 'in_progress', 'processing'].includes(c.status)
    );

    if (hasActiveCall && !isPolling) {
      setIsPolling(true);
      const interval = setInterval(() => {
        refetchConversations();
      }, 5000);

      return () => {
        clearInterval(interval);
        setIsPolling(false);
      };
    }
  }, [conversations, isPolling, refetchConversations]);

  const handleRefresh = useCallback(() => {
    refetchConversations();
    if (selectedId) {
      queryClient.invalidateQueries({ queryKey: ['/api/qa/conversations'] });
    }
  }, [refetchConversations, selectedId, queryClient]);

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Disposition Intelligence Hub
            </h1>
            <p className="text-sm text-muted-foreground">
              Disposition intelligence, conversation quality, showcase calls, and reanalysis
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPolling && pageTab === 'conversation-quality' && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Live updating
              </span>
            )}
            {pageTab === 'conversation-quality' && (
              <>
                <Link href="/disposition-intelligence/potential-leads">
                  <Button variant="outline" size="sm">
                    <Target className="h-4 w-4 mr-2" />
                    Potential Leads
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Page-Level Tabs */}
        <div className="px-4 pb-2">
          <Tabs value={pageTab} onValueChange={(v) => handleTabChange(v as HubTab)}>
            <TabsList className="w-full max-w-4xl flex">
              <TabsTrigger value="disposition-intelligence" className="gap-1.5 flex-1">
                <BarChart3 className="h-4 w-4" />
                Disposition Intelligence
              </TabsTrigger>
              <TabsTrigger value="conversation-quality" className="gap-1.5 flex-1">
                <MessageSquare className="h-4 w-4" />
                Conversation Quality
              </TabsTrigger>
              <TabsTrigger value="transcription-health" className="gap-1.5 flex-1">
                <Activity className="h-4 w-4" />
                Transcription Health
              </TabsTrigger>
              <TabsTrigger value="showcase-calls" className="gap-1.5 flex-1">
                <Trophy className="h-4 w-4" />
                Showcase Calls
              </TabsTrigger>
              <TabsTrigger value="reanalysis" className="gap-1.5 flex-1">
                <RefreshCw className="h-4 w-4" />
                Reanalysis
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content */}
      {pageTab === 'disposition-intelligence' ? (
        <div className="flex-1 overflow-hidden">
          <DispositionIntelligenceView campaigns={campaigns} />
        </div>
      ) : pageTab === 'transcription-health' ? (
        <div className="flex-1 overflow-auto p-4">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <TranscriptionHealthView campaigns={campaigns} />
          </Suspense>
        </div>
      ) : pageTab === 'showcase-calls' ? (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <ShowcaseCallsPage campaigns={campaigns} />
          </Suspense>
        </div>
      ) : pageTab === 'reanalysis' ? (
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <DispositionReanalysisPage campaigns={campaigns} />
          </Suspense>
        </div>
      ) : (
      <div className="flex-1 overflow-hidden p-4 pt-3">
        <ResizablePanelGroup direction="horizontal" className="h-full rounded-xl border bg-background shadow-sm">
          {/* Left Panel - List + Challenges */}
          <ResizablePanel defaultSize={40} minSize={30} maxSize={50}>
            <div className="h-full overflow-auto p-4 space-y-4">
              <ConversationListPanel
                conversations={conversations}
                filters={filters}
                onFiltersChange={setFilters}
                selectedId={selectedId}
                onSelect={setSelectedId}
                isLoading={conversationsLoading}
                campaigns={campaigns}
                stats={stats}
              />
              {/* Top Challenges Panel */}
              {topChallenges.length > 0 && (
                <TopChallengesPanel
                  challenges={topChallenges}
                  totalIssues={totalIssues}
                />
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Detail */}
          <ResizablePanel defaultSize={60} minSize={40}>
            <div className="h-full overflow-auto p-4">
              {selectedConversation && (
                <IntelligenceFlowDiagram
                  accountId={selectedRaw?.accountId || null}
                  campaignId={selectedConversation.campaign?.id || null}
                  contactId={selectedConversation.contact?.id || null}
                  variant="compact"
                  className="mb-4"
                />
              )}
              <UnifiedDetailPanel
                conversation={selectedConversation}
                isLoading={conversationsLoading && !!selectedId}
                onAnalyze={handleAnalyze}
                onTranscribe={handleTranscribe}
                onSelectHistoryCall={handleSelectHistoryCall}
                isAnalyzing={analyzeMutation.isPending}
                isTranscribing={transcribeMutation.isPending}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      )}
    </div>
  );
}
