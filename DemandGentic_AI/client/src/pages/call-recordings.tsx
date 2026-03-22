import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Mic,
  Play,
  Download,
  Search,
  Clock,
  Calendar,
  Phone,
  User,
  Bot,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileAudio,
  HardDrive,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  Filter,
  Cloud,
  Database,
  Layers,
  Hash,
  Star,
  UserPlus,
  Send,
  Zap
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PushToShowcaseButton } from "@/components/showcase-calls/push-to-showcase-button";

// Recording status badge colors
const STATUS_COLORS: Record = {
  stored: 'bg-green-500',
  pending: 'bg-yellow-500',
  recording: 'bg-blue-500',
  uploading: 'bg-purple-500',
  failed: 'bg-red-500',
};

// Agent type badge colors
const AGENT_TYPE_COLORS: Record = {
  ai: 'bg-purple-600',
  human: 'bg-blue-600',
};

// Source badge colors
const SOURCE_COLORS: Record = {
  local: 'bg-blue-500',
  telnyx: 'bg-orange-500',
};

// Format duration in minutes:seconds
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format file size in human-readable format
function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '--';
  if (bytes  void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const openRecording = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest('GET', `/api/recordings/${recordingId}/gcs-url`);
      if (!res.ok) throw new Error('Failed to get recording URL');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        setError('No recording URL available');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get recording URL');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    
      
        
          
            {isLoading ? (
              
            ) : (
              
            )}
            Play in New Tab
          
          
            
            Download
          
          
            Close
          
        
      
      {error && (
        
          
          {error}
        
      )}
    
  );
}

function CallRecordingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin' || user?.role === 'campaign_manager' || user?.role === 'quality_analyst';
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [callIdFilter, setCallIdFilter] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minDurationSec, setMinDurationSec] = useState('');
  const [maxDurationSec, setMaxDurationSec] = useState('');
  const [page, setPage] = useState(1);
  const [expandedRecording, setExpandedRecording] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const limit = 20;

  // Fetch campaigns for filter
  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
  });

  const callCampaigns = campaigns.filter((c: any) => c.type === 'call');

  // Build query params - now using the /all endpoint
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('source', selectedSource);
    if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
    if (searchQuery.trim()) params.append('search', searchQuery.trim());
    if (phoneFilter.trim()) params.append('phoneNumber', phoneFilter.trim());
    if (callIdFilter.trim()) params.append('callId', callIdFilter.trim());
    if (startDate) params.append('startDate', new Date(startDate).toISOString());
    if (endDate) params.append('endDate', new Date(endDate).toISOString());
    const parsedMin = Number(minDurationSec);
    if (minDurationSec && !Number.isNaN(parsedMin)) {
      params.append('minDurationSec', Math.max(0, Math.round(parsedMin)).toString());
    }
    const parsedMax = Number(maxDurationSec);
    if (maxDurationSec && !Number.isNaN(parsedMax)) {
      params.append('maxDurationSec', Math.max(0, Math.round(parsedMax)).toString());
    }
    return params.toString();
  };

  // Auto-refresh state - poll every 10 seconds for real-time updates
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const AUTO_REFRESH_INTERVAL = 10000; // 10 seconds

  // Fetch recordings from unified endpoint with auto-refresh
  const {
    data: recordingsData,
    isLoading: recordingsLoading,
    refetch: refetchRecordings
  } = useQuery({
    queryKey: ['/api/recordings/all', page, selectedCampaign, searchQuery, phoneFilter, callIdFilter, selectedSource, startDate, endDate, minDurationSec, maxDurationSec],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/recordings/all?${buildQueryParams()}`);
      return response.json();
    },
    // Auto-refresh every 10 seconds when enabled
    refetchInterval: autoRefreshEnabled ? AUTO_REFRESH_INTERVAL : false,
    refetchIntervalInBackground: false, // Only refresh when tab is active
  });

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/recordings/stats/summary'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/recordings/stats/summary');
      return response.json();
    },
  });

  // Sync recordings from Telnyx mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;
      if (phoneFilter.trim()) body.phoneNumber = phoneFilter.trim();
      
      const response = await apiRequest('POST', '/api/recordings/telnyx/sync', body);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Sync Complete',
        description: `Synced ${data.data?.newRecordings || 0} new recordings from Telnyx`,
      });
      refetchRecordings();
      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync recordings from Telnyx',
        variant: 'destructive',
      });
    },
  });

  // Transcribe recording mutation
  const transcribeMutation = useMutation({
    mutationFn: async ({ recordingId, source }: { recordingId: string; source?: string }) => {
      const response = await apiRequest('POST', `/api/recordings/${recordingId}/transcribe`, { source });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Transcription Started',
        description: 'The recording is being transcribed. Check back in a few minutes.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Transcription Failed',
        description: error.message || 'Failed to start transcription',
        variant: 'destructive',
      });
    },
  });

  // Push to Qualified Lead mutation
  const pushToLeadMutation = useMutation({
    mutationFn: async ({ recordingId, notes }: { recordingId: string; notes?: string }) => {
      const response = await apiRequest('POST', `/api/recordings/${recordingId}/push-to-lead`, { notes });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Lead Created',
        description: `Recording has been pushed to QA as a qualified lead (ID: ${data.leadId?.substring(0, 8)}...)`,
      });
      // Refresh to update the recording's lead status
      refetchRecordings();
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Create Lead',
        description: error.message || 'Could not push recording to qualified lead',
        variant: 'destructive',
      });
    },
  });

  // Retry sync for failed recordings
  const retrySyncMutation = useMutation({
    mutationFn: async ({ recordingId }: { recordingId: string }) => {
      const response = await apiRequest('POST', `/api/recordings/${recordingId}/retry-sync`, { transcribe: true });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Recording Synced',
        description: data.data?.transcriptStatus === 'completed'
          ? 'Recording recovered and transcription completed!'
          : 'Recording recovered from Telnyx and stored.',
      });
      refetchRecordings();
    },
    onError: (error: any) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Could not recover recording from Telnyx. It may have been deleted.',
        variant: 'destructive',
      });
    },
  });

  const recordings = recordingsData?.recordings || [];
  const pagination = recordingsData?.pagination;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    selectedCampaign,
    searchQuery,
    phoneFilter,
    callIdFilter,
    selectedSource,
    startDate,
    endDate,
    minDurationSec,
    maxDurationSec,
  ]);

  return (
    
      {/* Header */}
      
        
          
            
            Call Recordings
          
          
            Browse, search, and playback all call recordings from Telnyx
          
        
        
          {/* Auto-refresh indicator */}
           setAutoRefreshEnabled(!autoRefreshEnabled)}
            variant={autoRefreshEnabled ? "default" : "outline"}
            size="sm"
            title={autoRefreshEnabled ? "Auto-refresh ON (every 10s)" : "Auto-refresh OFF"}
          >
            
            {autoRefreshEnabled ? 'Live' : 'Paused'}
          
           syncMutation.mutate()}
            variant="outline"
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              
            ) : (
              
            )}
            Sync from Telnyx
          
           refetchRecordings()} variant="outline">
            
            Refresh
          
        
      

      {/* Stats Cards */}
      
        
          
            Total Recordings
            
          
          
            
              {statsLoading ? '--' : stats?.totalRecordings?.toLocaleString() || 0}
            
          
        

        
          
            Stored
            
          
          
            
              {statsLoading ? '--' : 
                stats?.byStatus?.find(s => s.status === 'stored')?.count?.toLocaleString() || 0}
            
          
        

        
          
            Total Duration
            
          
          
            
              {statsLoading ? '--' : 
                `${Math.round((stats?.totalDurationSeconds || 0) / 3600)}h ${Math.round(((stats?.totalDurationSeconds || 0) % 3600) / 60)}m`}
            
          
        

        
          
            Storage Used
            
          
          
            
              {statsLoading ? '--' : formatFileSize(stats?.totalFileSizeBytes)}
            
          
        
      

      {/* Filters */}
      
        
          
            {/* Primary Filters Row */}
            
              
                Search
                
                  
                   setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                
              

              
                
                   Phone Number
                
                 setPhoneFilter(e.target.value)}
                />
              

              
                
                   Call ID
                
                 setCallIdFilter(e.target.value)}
                />
              

              
                Source
                
                  
                    
                  
                  
                    
                      
                         All Sources
                      
                    
                    
                      
                         Local Database
                      
                    
                    
                      
                         Telnyx API
                      
                    
                  
                
              

               setShowAdvancedFilters(!showAdvancedFilters)}
              >
                
                {showAdvancedFilters ? 'Hide' : 'More'} Filters
              
            

            {/* Advanced Filters Row */}
            {showAdvancedFilters && (
              
                
                  Campaign
                  
                    
                      
                    
                    
                      All Campaigns
                      {callCampaigns.map((campaign: any) => (
                        
                          {campaign.name}
                        
                      ))}
                    
                  
                

                
                  
                     Start Date
                  
                   setStartDate(e.target.value)}
                  />
                

                
                  
                     End Date
                  
                   setEndDate(e.target.value)}
                  />
                

                
                  
                     Min Duration (sec)
                  
                   setMinDurationSec(e.target.value)}
                  />
                

                
                  
                     Max Duration (sec)
                  
                   setMaxDurationSec(e.target.value)}
                  />
                

                 {
                    setSearchQuery('');
                    setPhoneFilter('');
                    setCallIdFilter('');
                    setSelectedCampaign('all');
                    setSelectedSource('all');
                    setStartDate('');
                    setEndDate('');
                    setMinDurationSec('');
                    setMaxDurationSec('');
                  }}
                >
                  Clear Filters
                
              
            )}
          
        
      

      {/* Recordings List */}
      
        
          Recordings
          
            {pagination?.total 
              ? `Showing ${((page - 1) * limit) + 1}-${Math.min(page * limit, pagination.total)} of ${pagination.total.toLocaleString()} recordings`
              : 'No recordings found'}
          
        
        
          {recordingsLoading ? (
            
              
            
          ) : recordings.length === 0 ? (
            
              
              No recordings found matching your filters
            
          ) : (
            
              {recordings.map((recording) => (
                
                  
                    {/* Left side - Recording info */}
                    
                      
                        
                        
                          {recording.contactName || recording.toNumber || recording.contactPhone || 'Unknown Contact'}
                        
                        {(recording.contactPhone || recording.toNumber) && recording.contactName && (
                          
                            ({recording.contactPhone || recording.toNumber})
                          
                        )}
                        {/* Show Telnyx call ID if available */}
                        {recording.telnyxCallId && (
                          
                            ID: {recording.telnyxCallId.substring(0, 12)}...
                          
                        )}
                      

                      
                        {/* From/To numbers for Telnyx recordings */}
                        {recording.fromNumber && (
                          
                            From: {recording.fromNumber}
                          
                        )}
                        
                        {recording.campaignName && (
                          
                            {recording.campaignName}
                          
                        )}

                        {recording.agentType && (
                          
                            {recording.agentType === 'ai' && }
                            {recording.agentType === 'human' && }
                            {recording.agentName || recording.agentType.replace('_', ' ')}
                          
                        )}
                        
                        {recording.recordingStatus && (
                          
                            {recording.recordingStatus}
                          
                        )}
                        
                        {recording.disposition && (
                          
                            {recording.disposition.replace(/_/g, ' ')}
                          
                        )}

                        {/* Transcript indicator */}
                        {recording.hasTranscript && (
                          
                            
                            Transcribed
                          
                        )}
                      

                      
                        {recording.startedAt && (
                          
                            
                            {formatDate(recording.startedAt)}
                          
                        )}
                        {recording.recordingDurationSec && (
                          
                            
                            {formatDuration(recording.recordingDurationSec)}
                          
                        )}
                        {recording.recordingFileSizeBytes && (
                          
                            {formatFileSize(recording.recordingFileSizeBytes)}
                          
                        )}
                      
                    

                    {/* Right side - Actions */}
                    
                      {/* Source badge */}
                      {recording.source && (
                        
                          {recording.source === 'local' ? (
                            <> Local
                          ) : (
                            <> Telnyx
                          )}
                        
                      )}

                      {/* Lead status badge or Push to Lead button */}
                      {recording.leadId ? (
                        
                          
                          Lead ({recording.leadQaStatus || 'pending'})
                        
                      ) : (
                        recording.campaignId && recording.contactId && (
                           pushToLeadMutation.mutate({ recordingId: recording.id })}
                            disabled={pushToLeadMutation.isPending}
                            title="Push this recording to QA as a qualified lead"
                            className="text-green-600 border-green-600 hover:bg-green-50"
                          >
                            {pushToLeadMutation.isPending ? (
                              
                            ) : (
                              <>
                                
                                Push to QA
                              
                            )}
                          
                        )
                      )}

                      

                      {/* Transcribe button - only show if no transcript */}
                      {!recording.hasTranscript && recording.hasRecording !== false && (
                         transcribeMutation.mutate({
                            recordingId: recording.id,
                            source: recording.source
                          })}
                          disabled={transcribeMutation.isPending}
                          title="Transcribe this recording"
                        >
                          {transcribeMutation.isPending ? (
                            
                          ) : (
                            
                          )}
                        
                      )}

                      {/* Play button */}
                      {recording.recordingStatus === 'stored' || recording.hasRecording ? (
                         setExpandedRecording(
                            expandedRecording === recording.id ? null : recording.id
                          )}
                        >
                          {expandedRecording === recording.id ? (
                            <>
                              
                              Close
                            
                          ) : (
                            <>
                              
                              Play
                            
                          )}
                        
                      ) : recording.recordingStatus === 'failed' ? (
                        // Failed recording - show retry button
                         retrySyncMutation.mutate({ recordingId: recording.id })}
                          disabled={retrySyncMutation.isPending}
                          className="text-orange-600 border-orange-600 hover:bg-orange-50"
                          title="Retry fetching recording from Telnyx"
                        >
                          {retrySyncMutation.isPending ? (
                            
                          ) : (
                            
                          )}
                          Retry Sync
                        
                      ) : (
                        
                          {recording.recordingStatus === 'pending' && 'Awaiting upload'}
                          {recording.recordingStatus === 'recording' && 'Recording in progress'}
                          {recording.recordingStatus === 'uploading' && 'Uploading...'}
                        
                      )}
                    
                  

                  {/* Expanded recording actions */}
                  {expandedRecording === recording.id && (
                    
                       setExpandedRecording(null)}
                      />
                      
                      {/* Show transcript if available */}
                      {recording.hasTranscript && (
                        
                          
                            
                            Transcript
                          
                          
                            
                              {recording.transcript || 'Transcript available - click to expand'}
                            
                          
                        
                      )}

                      {/* Show transcribe button in expanded view if no transcript */}
                      {!recording.hasTranscript && (
                        
                          
                            
                              No transcript available
                            
                             transcribeMutation.mutate({ 
                                recordingId: recording.id, 
                                source: recording.source 
                              })}
                              disabled={transcribeMutation.isPending}
                            >
                              {transcribeMutation.isPending ? (
                                
                              ) : (
                                
                              )}
                              Transcribe Recording
                            
                          
                        
                      )}
                    
                  )}
                
              ))}
            
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            
              
                Page {pagination.page} of {pagination.totalPages}
              
              
                 setPage(p => Math.max(1, p - 1))}
                  disabled={page 
                  
                  Previous
                
                 setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                  
                
              
            
          )}
        
      
    
  );
}

export default CallRecordingsPage;