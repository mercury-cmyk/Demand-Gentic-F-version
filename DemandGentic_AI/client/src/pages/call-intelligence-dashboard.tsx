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
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('combined');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const limit = 20;

  // Fetch campaigns for filter dropdown
  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
  });

  // Fetch intelligence stats
  const { data: statsData } = useQuery({
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
  } = useQuery({
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
  const { data: selectedCallData, isLoading: selectedCallLoading } = useQuery({
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
    
      {/* Header */}
      
        
          
            
          
          
            Call Intelligence
            
              Unified view of recordings, transcripts, and quality analysis
            
          
        

        
           setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? "gap-2 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" : "gap-2 text-muted-foreground"}
          >
            
            {autoRefresh ? 'Live Sync Active' : 'Enable Live Sync'}
          
           refetchCalls()}>
            
            Refresh
          
        
      

      {/* Stats Cards - Use real database counts from stats API */}
      {(stats || aggregates) && (
        
          }
            label="Total Calls"
            value={stats?.sessions?.total ?? aggregates?.totalCalls ?? 0}
          />
          }
            label="Avg Score"
            value={stats?.quality?.avgScore || aggregates?.avgQualityScore || '--'}
            suffix="/100"
          />
          }
            label="Avg Duration"
            value={formatDuration(aggregates?.avgDuration || 0)}
          />
          }
            label="Recordings"
            value={stats?.sessions?.withRecording ?? aggregates?.withRecordings ?? 0}
          />
          }
            label="Transcripts"
            value={stats?.sessions?.withTranscript ?? aggregates?.withTranscripts ?? 0}
          />
          }
            label="Analyzed"
            value={stats?.quality?.totalAnalyzed ?? aggregates?.withAnalysis ?? 0}
          />
        
      )}

      {/* Pending Items Alert */}
      {stats && (stats.pending.recordingsNotInGcs > 0 || stats.pending.needsTranscript > 0 || stats.pending.needsAnalysis > 0) && (
        
          
          
            Action needed:
            
              {stats.pending.recordingsNotInGcs > 0 && (
                
                  
                  {stats.pending.recordingsNotInGcs} recordings not in cloud
                
              )}
              {stats.pending.needsTranscript > 0 && (
                
                  
                  {stats.pending.needsTranscript} need transcription
                
              )}
              {stats.pending.needsAnalysis > 0 && (
                
                  
                  {stats.pending.needsAnalysis} need analysis
                
              )}
            
          
          
            
            {stats.sessions.storedInGcs} in GCS
          
        
      )}

      {/* Filters */}
      

      {/* Main Content - Three Panel Layout */}
      
        {/* Left Panel - Call List */}
        
          
            
              Calls
              {pagination && (
                
                  {pagination.total} total • Page {pagination.page} of {pagination.totalPages}
                
              )}
            
            
            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              
                 setPage((p) => Math.max(1, p - 1))}
                  disabled={page 
                  Previous
                
                
                  {page} / {pagination.totalPages}
                
                 setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                
              
            )}
          
        

        

        {/* Center Panel - Recording & Transcript */}
        
          
            {selectedCall ? (
              <>
                {/* Call Header */}
                
                  
                    
                      {selectedCall.contact.name}
                      
                        {selectedCall.contact.company} • {selectedCall.contact.phone}
                      
                    
                    
                      {/* Recording Storage Status */}
                      {selectedCall.recording.available && (
                        
                          {selectedCall.recording.s3Key ? '☁️ GCS' : '⚠️ URL Only'}
                        
                      )}
                      {selectedCall.quality.analyzed && selectedCall.quality.overallScore !== undefined && (
                        = 70
                              ? 'bg-green-500'
                              : selectedCall.quality.overallScore >= 50
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }
                        >
                          Score: {selectedCall.quality.overallScore}
                        
                      )}
                    
                  

                  {/* Action Buttons */}
                  
                    {/* Sync Recording to GCS */}
                    {selectedCall.recording.available && !selectedCall.recording.s3Key && (
                      
                        
                        {retrySyncMutation.isPending ? 'Syncing...' : 'Save to Cloud'}
                      
                    )}
                    {selectedCall.recording.available && !selectedCall.transcript.available && (
                      
                        
                        {transcribeMutation.isPending ? 'Transcribing...' : 'Transcribe'}
                      
                    )}
                    {selectedCall.transcript.available && !selectedCall.quality.analyzed && (
                      
                        
                        {analyzeMutation.isPending ? 'Analyzing...' : 'Analyze'}
                      
                    )}
                    {selectedCall.quality.analyzed && !selectedCall.lead && (
                      
                        
                        {pushToLeadMutation.isPending ? 'Pushing...' : 'Push to QA'}
                      
                    )}
                    
                  
                

                {/* Tabs for Content */}
                 setActiveTab(v as any)}
                  className="flex-1 flex flex-col"
                >
                  
                    
                      
                        
                        Combined
                      
                      
                        
                        Recording
                      
                      
                        
                        Transcript
                      
                    
                  

                  
                    {/* Recording Player - handles both session and dialer sources */}
                    {selectedCall.recording.available && (
                      
                        
                          
                          Recording
                          {selectedCall.source && (
                            
                              {selectedCall.source === 'dialer' ? 'Dialer' : 'Session'}
                            
                          )}
                        
                        
                      
                    )}

                    {/* Agent Learning Pipeline */}
                    {selectedCall.quality.analyzed && (
                         
                    )}

                    {/* Transcript */}
                    
                      
                        
                        Transcript
                      
                      
                    
                  

                  
                    {selectedCall.recording.available ? (
                      
                    ) : (
                      
                        
                        No recording available
                      
                    )}
                  

                  
                    
                  
                
              
            ) : (
              
                
                Select a call
                Choose a call from the list to view details
              
            )}
          
        

        

        {/* Right Panel - Quality Metrics */}
        
          
            
              
                
                Quality Analysis
              
            
            {selectedCall ? (
               {
                  // Submit feedback via API
                  apiRequest('POST', `/api/call-intelligence/feedback`, feedback)
                    .then(() => toast({ title: 'Feedback submitted', description: 'Thank you for your feedback!' }))
                    .catch(() => toast({ title: 'Feedback failed', variant: 'destructive' }));
                }}
                className="flex-1"
              />
            ) : (
              
                
                Select a call to view analysis
              
            )}
          
        
      
    
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
    
      
        {icon}
        {label}
      
      
        {value}
        {suffix && {suffix}}
      
    
  );
}