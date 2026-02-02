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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Brain,
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
  type UnifiedCallRecord,
  type UnifiedCallsResponse,
  type CallIntelligenceFilters,
  defaultFilters,
  buildQueryParams,
  formatDuration,
} from '@/components/call-intelligence';

interface Campaign {
  id: string;
  name: string;
}

export default function CallIntelligenceDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CallIntelligenceFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'combined' | 'recording' | 'transcript'>('combined');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const limit = 20;

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
  });

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
    refetchInterval: autoRefresh ? 10000 : false,
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
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Live' : 'Auto-refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetchCalls()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {aggregates && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          <StatCard
            icon={<Phone className="h-4 w-4" />}
            label="Total Calls"
            value={aggregates.totalCalls}
          />
          <StatCard
            icon={<BarChart3 className="h-4 w-4" />}
            label="Avg Score"
            value={aggregates.avgQualityScore || '--'}
            suffix="/100"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Avg Duration"
            value={formatDuration(aggregates.avgDuration)}
          />
          <StatCard
            icon={<Mic className="h-4 w-4" />}
            label="Recordings"
            value={aggregates.withRecordings}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="Transcripts"
            value={aggregates.withTranscripts}
          />
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="Analyzed"
            value={aggregates.withAnalysis}
          />
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
                  <div className="flex items-center gap-2">
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
                        />
                      </div>
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
                      <AudioPlayerEnhanced recordingId={selectedCall.id} />
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
