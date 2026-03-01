/**
 * Call Intelligence Dashboard
 *
 * Unified dashboard combining call recordings, transcriptions,
 * and conversation quality analysis into a single integrated view.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  Brain,
  CloudOff,
  Database,
  Phone,
  Mic,
  FileText,
  Sparkles,
  RefreshCw,
  Send,
  BarChart3,
  Clock,
  TrendingUp,
} from 'lucide-react';

import {
  CallList,
  CallFilters,
  AudioPlayerEnhanced,
  TranscriptDisplay,
  QualityMetricsPanel,
  AgentLearningPipeline,
  type UnifiedCallRecord,
  type UnifiedCallsResponse,
  type CallIntelligenceFilters,
  defaultFilters,
  buildQueryParams,
  formatDuration,
} from '@/components/call-intelligence';
import { PushToShowcaseButton } from '@/components/showcase-calls/push-to-showcase-button';

interface Campaign {
  id: string;
  name: string;
}

interface IntelligenceStats {
  sessions: {
    total: number;
    withRecording: number;
    storedInGcs: number;
    withTranscript: number;
  };
  quality: {
    totalAnalyzed: number;
    avgScore: number;
    sentiment: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
  pending: {
    recordingsNotInGcs: number;
    needsTranscript: number;
    needsAnalysis: number;
  };
}

export default function CallIntelligenceDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CallIntelligenceFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'combined' | 'recording' | 'transcript'>('combined');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const limit = 20;

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
  });

  // Fetch intelligence stats
  const { data: statsData } = useQuery<{ success: boolean; data: IntelligenceStats }>({
    queryKey: ['/api/call-intelligence/stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/call-intelligence/stats');
      return response.json();
    },
    refetchInterval: autoRefresh ? 30000 : false, // Refresh stats every 30s if auto-refresh is on
    refetchIntervalInBackground: false,
  });

  const stats = statsData?.data;

  // Fetch unified calls data
  const {
    data: callsData,
    isLoading: callsLoading,
    refetch: refetchCalls,
  } = useQuery<UnifiedCallsResponse>({
    queryKey: ['/api/call-intelligence/unified', filters, page],
    queryFn: async () => {
      const params = buildQueryParams(filters, page, limit);
      const response = await apiRequest('GET', `/api/call-intelligence/unified?${params}`);
      return response.json();
    },
    refetchInterval: autoRefresh ? 30000 : false, // Reduced from 10s to 30s
    refetchIntervalInBackground: false,
  });

  // Fetch selected call details
  const { data: selectedCallData, isLoading: selectedCallLoading } = useQuery<{
    success: boolean;
    data: UnifiedCallRecord;
  }>({
    queryKey: ['/api/call-intelligence/unified', selectedCallId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/call-intelligence/unified/${selectedCallId}`);
      return response.json();
    },
    enabled: !!selectedCallId,
    refetchInterval: autoRefresh ? 15000 : false, // Reduced from 3s to 15s
    refetchIntervalInBackground: false,
  });

  const selectedCall = selectedCallData?.data;

  // Mutations
  const transcribeMutation = useMutation({
    mutationFn: async (callId: string) => {
      const response = await apiRequest('POST', `/api/recordings/${callId}/transcribe`, {
        source: 'call_session',
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Transcription started', description: 'The call is being transcribed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence/unified'] });
    },
    onError: () => {
      toast({ title: 'Transcription failed', variant: 'destructive' });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (callId: string) => {
      const response = await apiRequest('POST', `/api/call-intelligence/unified/${callId}/analyze`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Analysis complete',
        description: `Quality score: ${data.overallScore}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence/unified'] });
    },
    onError: () => {
      toast({ title: 'Analysis failed', variant: 'destructive' });
    },
  });

  const pushToLeadMutation = useMutation({
    mutationFn: async (callId: string) => {
      const response = await apiRequest('POST', `/api/recordings/${callId}/push-to-lead`, {
        source: 'call_session',
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Pushed to QA', description: 'Call has been added to the QA queue.' });
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence/unified'] });
    },
    onError: () => {
      toast({ title: 'Push to QA failed', variant: 'destructive' });
    },
  });

  const retrySyncMutation = useMutation({
    mutationFn: async (callId: string) => {
      const response = await apiRequest('POST', `/api/recordings/${callId}/retry-sync`, {
        transcribe: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Recording synced!',
        description: data.data?.transcriptStatus === 'completed'
          ? 'Recording and transcript are now available.'
          : 'Recording is now available. Transcript may still be processing.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/call-intelligence/unified'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Sync failed',
        description: error.message || 'Could not retrieve recording from Telnyx. It may have expired (recordings are kept for ~30 days).',
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleFiltersChange = useCallback((newFilters: CallIntelligenceFilters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  }, []);

  const handleSelectCall = useCallback((callId: string) => {
    setSelectedCallId(callId);
  }, []);

  const handleTranscribe = useCallback(() => {
    if (selectedCallId) {
      transcribeMutation.mutate(selectedCallId);
    }
  }, [selectedCallId, transcribeMutation]);

  const handleAnalyze = useCallback(() => {
    if (selectedCallId) {
      analyzeMutation.mutate(selectedCallId);
    }
  }, [selectedCallId, analyzeMutation]);

  const handlePushToLead = useCallback(() => {
    if (selectedCallId) {
      pushToLeadMutation.mutate(selectedCallId);
    }
  }, [selectedCallId, pushToLeadMutation]);

  const handleRetrySync = useCallback(() => {
    if (selectedCallId) {
      retrySyncMutation.mutate(selectedCallId);
    }
  }, [selectedCallId, retrySyncMutation]);

  const calls = callsData?.data?.calls || [];
  const aggregates = callsData?.data?.aggregates;
  const pagination = callsData?.data?.pagination;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Call Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Unified view of recordings, transcripts, and quality analysis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? 'outline' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? "gap-2 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" : "gap-2 text-muted-foreground"}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin duration-[3000ms]' : ''}`} />
            {autoRefresh ? 'Live Sync Active' : 'Enable Live Sync'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetchCalls()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards - Use real database counts from stats API */}
      {(stats || aggregates) && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          <StatCard
            icon={<Phone className="h-4 w-4" />}
            label="Total Calls"
            value={stats?.sessions?.total ?? aggregates?.totalCalls ?? 0}
          />
          <StatCard
            icon={<BarChart3 className="h-4 w-4" />}
            label="Avg Score"
            value={stats?.quality?.avgScore || aggregates?.avgQualityScore || '--'}
            suffix="/100"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Avg Duration"
            value={formatDuration(aggregates?.avgDuration || 0)}
          />
          <StatCard
            icon={<Mic className="h-4 w-4" />}
            label="Recordings"
            value={stats?.sessions?.withRecording ?? aggregates?.withRecordings ?? 0}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="Transcripts"
            value={stats?.sessions?.withTranscript ?? aggregates?.withTranscripts ?? 0}
          />
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="Analyzed"
            value={stats?.quality?.totalAnalyzed ?? aggregates?.withAnalysis ?? 0}
          />
        </div>
      )}

      {/* Pending Items Alert */}
      {stats && (stats.pending.recordingsNotInGcs > 0 || stats.pending.needsTranscript > 0 || stats.pending.needsAnalysis > 0) && (
        <div className="flex items-center gap-4 p-3 mb-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <div className="flex-1 text-sm">
            <span className="font-medium text-yellow-800 dark:text-yellow-200">Action needed:</span>
            <span className="ml-2 text-yellow-700 dark:text-yellow-300">
              {stats.pending.recordingsNotInGcs > 0 && (
                <span className="inline-flex items-center gap-1 mr-3">
                  <CloudOff className="h-4 w-4" />
                  {stats.pending.recordingsNotInGcs} recordings not in cloud
                </span>
              )}
              {stats.pending.needsTranscript > 0 && (
                <span className="inline-flex items-center gap-1 mr-3">
                  <FileText className="h-4 w-4" />
                  {stats.pending.needsTranscript} need transcription
                </span>
              )}
              {stats.pending.needsAnalysis > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-4 w-4" />
                  {stats.pending.needsAnalysis} need analysis
                </span>
              )}
            </span>
          </div>
          <Badge variant="outline" className="flex-shrink-0">
            <Database className="h-3 w-3 mr-1" />
            {stats.sessions.storedInGcs} in GCS
          </Badge>
        </div>
      )}

      {/* Filters */}
      <CallFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        campaigns={campaigns}
        className="mb-4"
      />

      {/* Main Content - Three Panel Layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 rounded-lg border">
        {/* Left Panel - Call List */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <div className="h-full flex flex-col">
            <div className="p-3 border-b">
              <h2 className="font-semibold text-sm">Calls</h2>
              {pagination && (
                <p className="text-xs text-muted-foreground">
                  {pagination.total} total • Page {pagination.page} of {pagination.totalPages}
                </p>
              )}
            </div>
            <CallList
              calls={calls}
              selectedCallId={selectedCallId}
              onSelectCall={handleSelectCall}
              isLoading={callsLoading}
              className="flex-1"
            />
            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="p-2 border-t flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page} / {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center Panel - Recording & Transcript */}
        <ResizablePanel defaultSize={45} minSize={30}>
          <div className="h-full flex flex-col">
            {selectedCall ? (
              <>
                {/* Call Header */}
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="font-semibold">{selectedCall.contact.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {selectedCall.contact.company} • {selectedCall.contact.phone}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Recording Storage Status */}
                      {selectedCall.recording.available && (
                        <Badge
                          variant="outline"
                          className={
                            selectedCall.recording.s3Key
                              ? 'border-green-500 text-green-600'
                              : 'border-yellow-500 text-yellow-600'
                          }
                        >
                          {selectedCall.recording.s3Key ? '☁️ GCS' : '⚠️ URL Only'}
                        </Badge>
                      )}
                      {selectedCall.quality.analyzed && selectedCall.quality.overallScore !== undefined && (
                        <Badge
                          className={
                            selectedCall.quality.overallScore >= 70
                              ? 'bg-green-500'
                              : selectedCall.quality.overallScore >= 50
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }
                        >
                          Score: {selectedCall.quality.overallScore}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Sync Recording to GCS */}
                    {selectedCall.recording.available && !selectedCall.recording.s3Key && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRetrySync}
                        disabled={retrySyncMutation.isPending}
                        className="text-yellow-600 border-yellow-500 hover:bg-yellow-50"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${retrySyncMutation.isPending ? 'animate-spin' : ''}`} />
                        {retrySyncMutation.isPending ? 'Syncing...' : 'Save to Cloud'}
                      </Button>
                    )}
                    {selectedCall.recording.available && !selectedCall.transcript.available && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleTranscribe}
                        disabled={transcribeMutation.isPending}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        {transcribeMutation.isPending ? 'Transcribing...' : 'Transcribe'}
                      </Button>
                    )}
                    {selectedCall.transcript.available && !selectedCall.quality.analyzed && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAnalyze}
                        disabled={analyzeMutation.isPending}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        {analyzeMutation.isPending ? 'Analyzing...' : 'Analyze'}
                      </Button>
                    )}
                    {selectedCall.quality.analyzed && !selectedCall.lead && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handlePushToLead}
                        disabled={pushToLeadMutation.isPending}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {pushToLeadMutation.isPending ? 'Pushing...' : 'Push to QA'}
                      </Button>
                    )}
                    <PushToShowcaseButton
                      callSessionId={selectedCall.id}
                      contactName={selectedCall.contact?.name}
                      sourceLabel="Call Intelligence Dashboard"
                      buttonProps={{ size: "sm", variant: "outline" }}
                    />
                  </div>
                </div>

                {/* Tabs for Content */}
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as any)}
                  className="flex-1 flex flex-col"
                >
                  <div className="border-b px-4">
                    <TabsList className="h-10">
                      <TabsTrigger value="combined" className="gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Combined
                      </TabsTrigger>
                      <TabsTrigger value="recording" className="gap-2">
                        <Mic className="h-4 w-4" />
                        Recording
                      </TabsTrigger>
                      <TabsTrigger value="transcript" className="gap-2">
                        <FileText className="h-4 w-4" />
                        Transcript
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="combined" className="flex-1 overflow-auto p-4 space-y-4">
                    {/* Recording Player - handles both session and dialer sources */}
                    {selectedCall.recording.available && (
                      <div>
                        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Mic className="h-4 w-4" />
                          Recording
                          {selectedCall.source && (
                            <Badge variant="outline" className="text-xs">
                              {selectedCall.source === 'dialer' ? 'Dialer' : 'Session'}
                            </Badge>
                          )}
                        </h3>
                        <AudioPlayerEnhanced
                          recordingId={selectedCall.id}
                          recordingUrl={selectedCall.source === 'dialer' ? undefined : undefined}
                          onRetrySync={handleRetrySync}
                          isRetrying={retrySyncMutation.isPending}
                        />
                      </div>
                    )}

                    {/* Agent Learning Pipeline */}
                    {selectedCall.quality.analyzed && (
                         <AgentLearningPipeline 
                            issues={selectedCall.quality.issues}
                            recommendations={selectedCall.quality.recommendations}
                            className="bg-muted/30 p-4 rounded-lg border"
                         />
                    )}

                    {/* Transcript */}
                    <div>
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Transcript
                      </h3>
                      <TranscriptDisplay
                        transcript={selectedCall.transcript.text}
                        maxHeight="300px"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="recording" className="flex-1 overflow-auto p-4">
                    {selectedCall.recording.available ? (
                      <AudioPlayerEnhanced
                        recordingId={selectedCall.id}
                        onRetrySync={handleRetrySync}
                        isRetrying={retrySyncMutation.isPending}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Mic className="h-12 w-12 mb-4 opacity-50" />
                        <p>No recording available</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="transcript" className="flex-1 overflow-auto p-4">
                    <TranscriptDisplay
                      transcript={selectedCall.transcript.text}
                      maxHeight="100%"
                    />
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Phone className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a call</p>
                <p className="text-sm">Choose a call from the list to view details</p>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel - Quality Metrics */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
          <div className="h-full flex flex-col">
            <div className="p-3 border-b">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Quality Analysis
              </h2>
            </div>
            {selectedCall ? (
              <QualityMetricsPanel
                analyzed={selectedCall.quality.analyzed}
                overallScore={selectedCall.quality.overallScore}
                dimensions={selectedCall.quality.dimensions}
                sentiment={selectedCall.quality.sentiment}
                engagementLevel={selectedCall.quality.engagementLevel}
                identityConfirmed={selectedCall.quality.identityConfirmed}
                qualificationMet={selectedCall.quality.qualificationMet}
                issues={selectedCall.quality.issues}
                recommendations={selectedCall.quality.recommendations}
                dispositionReview={selectedCall.quality.dispositionReview}
                campaignAlignment={selectedCall.quality.campaignAlignment}
                flowCompliance={selectedCall.quality.flowCompliance}
                nextBestActions={selectedCall.quality.nextBestActions}
                onAnalyze={handleAnalyze}
                isAnalyzing={analyzeMutation.isPending}
                callSessionId={selectedCall.id}
                onFeedbackSubmit={(feedback) => {
                  // Submit feedback via API
                  apiRequest('POST', `/api/call-intelligence/feedback`, feedback)
                    .then(() => toast({ title: 'Feedback submitted', description: 'Thank you for your feedback!' }))
                    .catch(() => toast({ title: 'Feedback failed', variant: 'destructive' }));
                }}
                className="flex-1"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Sparkles className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Select a call to view analysis</p>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// Stat Card Component
function StatCard({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-xl font-bold">
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
      </div>
    </Card>
  );
}
