/**
 * Unified Intelligence Page
 *
 * Single unified page combining capabilities from:
 * - Conversation Quality page (filters, list, quality analysis)
 * - Call Intelligence Dashboard (recordings, transcripts)
 * - Test AI Agent call analysis (call analysis summary)
 * - Call Recordings page (audio playback)
 *
 * This page is ADDITIVE - it does not modify or replace existing pages.
 * Existing pages continue to work unchanged.
 *
 * Route: /unified-intelligence
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { RefreshCw, Brain } from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  ConversationListPanel,
  UnifiedDetailPanel,
  type UnifiedIntelligenceFilters,
  type UnifiedConversationListItem,
  type UnifiedConversationDetail,
  defaultUnifiedFilters,
  buildUnifiedQueryParams,
} from '@/components/unified-intelligence';

interface Campaign {
  id: string;
  name: string;
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
    hasRecording: conv.hasRecording || !!conv.recordingUrl,
    qualityScore: conv.analysis?.overallScore,
    testResult: conv.testResult,
    issueCount: conv.detectedIssues?.length || conv.analysis?.issues?.length,
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
    severity: issue.severity || 'medium',
    code: issue.type || issue.code || 'unknown',
    type: issue.type,
    description: issue.description || '',
    recommendation: issue.suggestion || issue.recommendation,
    evidence: issue.evidence,
  }));

  // Extract quality subscores
  const qualityDimensions = conv.analysis?.qualityDimensions || {};

  // Extract recommendations
  const recommendations = (conv.analysis?.recommendations || []).map((rec: any) => ({
    area: rec.category || 'general',
    category: rec.category,
    text: rec.suggestedChange || rec.text || '',
    suggestedChange: rec.suggestedChange,
    impact: rec.expectedImpact || rec.impact,
    priority: rec.priority,
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
      available: conv.hasRecording || !!conv.recordingUrl || conv.recordingStatus === 'stored',
      status: conv.recordingStatus || (conv.recordingUrl ? 'stored' : 'none'),
      url: conv.recordingUrl,
      s3Key: conv.recordingS3Key,
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
      assignedDisposition: conv.analysis.dispositionReview.assigned,
      expectedDisposition: conv.analysis.dispositionReview.expected,
      isAccurate: conv.analysis.dispositionReview.accurate,
      notes: conv.analysis.dispositionReview.notes,
    } : undefined,
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
  const [filters, setFilters] = useState<UnifiedIntelligenceFilters>(defaultUnifiedFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
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

  // Fetch conversations using existing endpoint
  const {
    data: conversationsData,
    isLoading: conversationsLoading,
    refetch: refetchConversations,
  } = useQuery<{ conversations: any[] }>({
    queryKey: ['/api/qa/conversations', filters.campaignId, filters.source, filters.search],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/qa/conversations?${buildQaQueryParams()}`);
      return response.json();
    },
  });

  // Transform and filter conversations
  const allConversations = (conversationsData?.conversations || []).map(adaptConversationToListItem);

  // Apply client-side filters
  let conversations = allConversations;

  if (filters.type !== 'all') {
    conversations = conversations.filter(c => c.type === filters.type);
  }

  if (filters.disposition !== 'all') {
    conversations = conversations.filter(c =>
      c.disposition?.toLowerCase().includes(filters.disposition.toLowerCase())
    );
  }

  if (filters.hasTranscript === true) {
    conversations = conversations.filter(c => c.hasTranscript);
  }

  // Calculate stats
  const stats = {
    total: conversations.length,
    calls: conversations.filter(c => c.interactionType === 'call' && c.type !== 'test').length,
    emails: conversations.filter(c => c.interactionType === 'email').length,
    testCalls: conversations.filter(c => c.type === 'test').length,
    withTranscripts: conversations.filter(c => c.hasTranscript).length,
  };

  // Find selected conversation for detail panel
  const selectedRaw = selectedId
    ? conversationsData?.conversations?.find((c: any) => c.id === selectedId)
    : null;
  const selectedConversation = selectedRaw ? adaptConversationToDetail(selectedRaw) : null;

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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Unified Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Complete conversation analysis: recordings, transcripts, and quality insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPolling && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Live updating
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Content - Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left Panel - List */}
          <ResizablePanel defaultSize={40} minSize={30} maxSize={50}>
            <div className="h-full overflow-auto p-4">
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
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Detail */}
          <ResizablePanel defaultSize={60} minSize={40}>
            <div className="h-full overflow-auto p-4">
              <UnifiedDetailPanel
                conversation={selectedConversation}
                isLoading={conversationsLoading && !!selectedId}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
