import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MessageSquare,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Building,
  Search,
  Filter,
  FileText,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Loader2,
  Zap,
  Sparkles,
  Play,
  Download
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PushToShowcaseButton } from "@/components/showcase-calls/push-to-showcase-button";

interface TranscriptTurn {
  role: 'agent' | 'contact' | 'assistant' | 'user' | 'system';
  text: string;
  timestamp?: string;
}

interface ConversationRecord {
  id: string;
  type: 'call' | 'email';
  source: 'call_session' | 'test_call' | 'email_send';
  campaignId: string;
  campaignName: string;
  contactId?: string;
  contactName: string;
  contactEmail?: string;
  companyName: string;
  status: string;
  disposition?: string;
  agentType?: 'human' | 'ai';
  agentName?: string;
  duration?: number;
  transcript?: string;
  transcriptTurns?: TranscriptTurn[];
  analysis?: {
    overallScore?: number;
    testResult?: string;
    summary?: string;
    performanceMetrics?: {
      identityConfirmed?: boolean;
      gatekeeperHandled?: boolean;
      pitchDelivered?: boolean;
      objectionHandled?: boolean;
      closingAttempted?: boolean;
      conversationFlow?: string;
      rapportBuilding?: string;
    };
    qualityDimensions?: {
      engagement?: number;
      clarity?: number;
      empathy?: number;
      objectionHandling?: number;
      qualification?: number;
      closing?: number;
    };
    issues?: any[];
    recommendations?: any[];
    suggestions?: any[];
    dispositionReview?: {
      assignedDisposition?: string;
      expectedDisposition?: string;
      isAccurate?: boolean;
      notes?: string[];
    };
  };
  detectedIssues?: any[];
  callSummary?: string;
  testResult?: string;
  recordingUrl?: string;
  recordingS3Key?: string;
  recordingStatus?: string;
  telnyxRecordingId?: string;
  hasRecording?: boolean;
  createdAt: string;
  isTestCall: boolean;
}

function DispositionBadge({ disposition }: { disposition: string }) {
  const config: Record = {
    qualified: { variant: 'default', className: 'bg-green-600' },
    not_interested: { variant: 'secondary' },
    voicemail: { variant: 'outline' },
    no_answer: { variant: 'outline' },
    callback_requested: { variant: 'default', className: 'bg-blue-600' },
    dnc_request: { variant: 'destructive' },
    busy: { variant: 'outline' },
    gatekeeper: { variant: 'secondary' },
    wrong_number: { variant: 'destructive' },
  };
  const { variant, className } = config[disposition] || { variant: 'outline' };
  return (
    
      {disposition?.replace(/_/g, ' ') || 'Unknown'}
    
  );
}

function QAStatusBadge({ status }: { status: string }) {
  const config: Record = {
    approved: { variant: 'default', className: 'bg-green-600', label: 'Approved' },
    rejected: { variant: 'destructive', label: 'Rejected' },
    pending_review: { variant: 'secondary', label: 'Pending Review' },
    pending: { variant: 'outline', label: 'Pending' },
  };
  const { variant, className, label } = config[status] || { variant: 'outline', label: status || 'Unknown' };
  return {label};
}

function TranscriptViewer({ transcript, turns }: { transcript?: string; turns?: TranscriptTurn[] }) {
  if (turns && turns.length > 0) {
    return (
      
        {turns.map((turn, index) => (
          
            
              
                {turn.role === 'agent' || turn.role === 'assistant' ? 'Agent' :
                 turn.role === 'system' ? 'System' : 'Contact'}
              
              {turn.timestamp && (
                
                  {turn.timestamp}
                
              )}
            
            {turn.text}
          
        ))}
      
    );
  }

  if (transcript) {
    return (
      
        {transcript}
      
    );
  }

  return (
    
      
      No transcript available
    
  );
}

function SourceBadge({ source, isTestCall }: { source: string; isTestCall: boolean }) {
  if (isTestCall) {
    return Test Call;
  }
  const sourceLabels: Record = {
    call_session: 'Production',
    email_send: 'Email',
  };
  return {sourceLabels[source] || source};
}

function formatConversationDuration(durationSec?: number | null): string {
  if (!durationSec || durationSec  0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ConversationCard({
  conversation,
  isSelected,
  onClick
}: {
  conversation: ConversationRecord;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    
      
        
          
            
              {conversation.type === 'call' ? (
                
              ) : (
                
              )}
              {conversation.contactName || 'Unknown Contact'}
              {conversation.agentType === 'ai' && (
                AI
              )}
            
            
              
              {conversation.companyName || 'Unknown Company'}
            
          
          
            
            {conversation.disposition && (
              
            )}
          
        
        
          {conversation.campaignName}
          
            
            {format(new Date(conversation.createdAt), 'MMM d, HH:mm')}
          
        
        {/* Quality Score + Duration */}
        
          {conversation.analysis?.overallScore !== undefined && conversation.analysis.overallScore > 0 && (
            = 70 ? "default" : conversation.analysis.overallScore >= 50 ? "secondary" : "destructive"}
              className={cn("text-xs", conversation.analysis.overallScore >= 70 && "bg-green-600")}
            >
              Score: {conversation.analysis.overallScore}/100
            
          )}
          {conversation.duration && conversation.duration > 0 && (
            
              Duration: {formatConversationDuration(conversation.duration)}
            
          )}
        
        {conversation.detectedIssues && conversation.detectedIssues.length > 0 && (
          
            
            {conversation.detectedIssues.length} issue(s) detected
          
        )}
        {conversation.testResult && (
          
            {conversation.testResult === 'success' ? (
              
            ) : conversation.testResult === 'failed' ? (
              
            ) : (
              
            )}
            {conversation.testResult.replace(/_/g, ' ')}
          
        )}
        {(conversation.transcript || conversation.transcriptTurns) && (
          
            
            Has transcript
          
        )}
      
    
  );
}

function RecordingPlayer({
  conversation,
  transcribeMutation,
  reanalyzeMutation,
}: {
  conversation: ConversationRecord;
  transcribeMutation: any;
  reanalyzeMutation: any;
}) {
  const [audioError, setAudioError] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const openRecordingInNewTab = async () => {
    setLoadingUrl(true);
    setAudioError(null);
    try {
      const res = await apiRequest('GET', `/api/recordings/${conversation.id}/gcs-url`);
      if (!res.ok) throw new Error('Failed to get recording URL');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        setAudioError('No recording URL available');
      }
    } catch {
      setAudioError('Failed to get recording URL - click Retry Sync');
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleRetrySync = async () => {
    setRetrying(true);
    setAudioError(null);
    try {
      await apiRequest('POST', `/api/recordings/${conversation.id}/retry-sync`, { transcribe: false });
    } catch {
      // Resync may fail if already stored or no Telnyx URL
    }
    setRetrying(false);
  };

  const showTranscribe = !conversation.isTestCall && (
    !conversation.transcript ||
    (conversation.transcript.length = 50) &&
    (!conversation.analysis?.overallScore || conversation.analysis.overallScore === 0);
  const canPushToShowcase = conversation.type === 'call' && conversation.source === 'call_session';

  return (
    
      
        
          
          Call Recording
        
        
          {canPushToShowcase && (
            
          )}
          {showTranscribe && (
             transcribeMutation.mutate(conversation.id)}
              disabled={transcribeMutation.isPending}
            >
              {transcribeMutation.isPending ? (
                
              ) : (
                
              )}
              {transcribeMutation.isPending ? 'Transcribing...' : 'Transcribe & Analyze'}
            
          )}
          {showReanalyze && (
             reanalyzeMutation.mutate(conversation.id)}
              disabled={reanalyzeMutation.isPending}
            >
              {reanalyzeMutation.isPending ? (
                
              ) : (
                
              )}
              {reanalyzeMutation.isPending ? 'Analyzing...' : 'Analyze Quality'}
            
          )}
        
      
      {audioError ? (
        
          
            
            {audioError}
          
          
            {retrying ? (
              
            ) : (
              
            )}
            Retry Sync
          
        
      ) : (
        
          
            {loadingUrl ? (
              
            ) : (
              
            )}
            Play in New Tab
          
          
            
            Download
          
        
      )}
    
  );
}

export default function ConversationQualityPage() {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [selectedDisposition, setSelectedDisposition] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [showOnlyWithTranscripts, setShowOnlyWithTranscripts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedConversation, setSelectedConversation] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch campaigns for filter
  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
  });

  // Fetch ALL conversations (call sessions, test calls, emails)
  const qaParams = new URLSearchParams();
  if (selectedCampaign !== 'all') qaParams.append('campaignId', selectedCampaign);
  if (selectedType !== 'all') qaParams.append('type', selectedType);
  if (searchQuery) qaParams.append('search', searchQuery);
  if (dateFrom) qaParams.append('dateFrom', dateFrom);
  if (dateTo) qaParams.append('dateTo', dateTo);
  if (sortBy !== 'date') qaParams.append('sortBy', sortBy);
  qaParams.append('limit', '200');

  const { data: qaData, isLoading: qaLoading, refetch } = useQuery({
    queryKey: ['/api/qa/conversations', selectedCampaign, selectedType, searchQuery, dateFrom, dateTo, sortBy],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/qa/conversations?${qaParams.toString()}`);
      return response.json();
    },
  });

  const allConversations: ConversationRecord[] = qaData?.conversations || [];

  // Apply filters client-side
  let conversations = allConversations;
  
  // Source filter
  if (selectedSource !== 'all') {
    conversations = conversations.filter(c => c.source === selectedSource);
  }
  
  // Disposition filter
  if (selectedDisposition !== 'all') {
    conversations = conversations.filter(c => 
      c.disposition?.toLowerCase().includes(selectedDisposition.toLowerCase())
    );
  }
  
  // Transcript filter - show only calls with substantial transcripts
  if (showOnlyWithTranscripts) {
    conversations = conversations.filter(c => 
      (c.transcript && c.transcript.length > 100) || 
      (c.transcriptTurns && c.transcriptTurns.length > 2)
    );
  }

  // Use backend-computed stats (accurate across full dataset, not limited by fetch cap)
  const backendStats = qaData?.stats;
  const stats = {
    total: qaData?.total ?? conversations.length,
    calls: backendStats?.callSessions ?? conversations.filter(c => c.type === 'call' && !c.isTestCall).length,
    analyzed: backendStats?.analyzedWithScores ?? conversations.filter(c => c.analysis?.overallScore && c.analysis.overallScore > 0).length,
    testCalls: backendStats?.testCalls ?? conversations.filter(c => c.isTestCall).length,
    avgScore: backendStats?.avgQualityScore ?? null,
    avgDimensions: backendStats?.avgDimensions as { engagement: number; clarity: number; empathy: number; objectionHandling: number; qualification: number; closing: number } | undefined,
  };

  // Count calls with transcript but no analysis (eligible for bulk analyze)
  const unanalyzedWithTranscript = conversations.filter(c =>
    !c.isTestCall &&
    (c.transcript || (c.transcriptTurns && c.transcriptTurns.length > 0)) &&
    (!c.analysis?.overallScore || c.analysis.overallScore === 0)
  ).length;

  // Transcribe & analyze a single call (longer timeout for Google STT + AI analysis)
  const transcribeMutation = useMutation({
    mutationFn: async (callSessionId: string) => {
      const response = await apiRequest('POST', `/api/qa/transcribe/${callSessionId}`, { analyze: true }, { timeout: 120000 });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Transcription Complete',
        description: data.analyzed
          ? `Transcribed (${data.transcriptLength} chars) and analyzed (Score: ${data.analysis?.overallScore}/100)`
          : `Transcribed successfully (${data.transcriptLength} chars)`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/qa/conversations'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Transcription Failed',
        description: error?.message || 'Failed to transcribe recording',
        variant: 'destructive',
      });
    },
  });

  // Re-analyze a call that already has a transcript
  const reanalyzeMutation = useMutation({
    mutationFn: async (callSessionId: string) => {
      const response = await apiRequest('POST', `/api/qa/transcribe/${callSessionId}`, { analyze: true }, { timeout: 120000 });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Analysis Complete',
        description: `Quality Score: ${data.analysis?.overallScore}/100`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/qa/conversations'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Analysis Failed',
        description: error?.message || 'Failed to analyze conversation',
        variant: 'destructive',
      });
    },
  });

  const bulkAnalyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/qa/bulk-analyze', {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Bulk Analysis Complete',
        description: `${data.analyzed} calls analyzed, ${data.failed} failed${data.skipped ? `, ${data.skipped} skipped` : ''}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/qa/conversations'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Analysis Failed',
        description: error?.message || 'Failed to run bulk analysis',
        variant: 'destructive',
      });
    },
  });

  return (
    
      {/* Header */}
      
        
          
            
            Conversation Quality Panel
          
          
            Review and analyze call transcripts to identify issues and improve agent performance
          
        
        
          {unanalyzedWithTranscript > 0 && (
             bulkAnalyzeMutation.mutate()}
              disabled={bulkAnalyzeMutation.isPending}
            >
              {bulkAnalyzeMutation.isPending ? (
                
              ) : (
                
              )}
              {bulkAnalyzeMutation.isPending
                ? 'Analyzing...'
                : `Analyze ${unanalyzedWithTranscript} Unanalyzed`}
            
          )}
           refetch()}>
            
            Refresh
          
        
      

      {/* Stats Cards */}
      
        
          
            
              
              
                {stats.total}
                Total Interactions
              
            
          
        
        
          
            
              
              
                {stats.calls}
                Production Calls
              
            
          
        
        
          
            
              
              
                {stats.analyzed}
                Analyzed
              
            
          
        
        
          
            
              
              
                {stats.testCalls}
                Test Calls
              
            
          
        
        
          
            
              
              
                {stats.avgScore !== null ? `${stats.avgScore}/100` : '--'}
                Avg Score
              
            
          
        
      

      {/* Quality Dimension Averages */}
      {stats.avgDimensions && (
        
          
            
              
              Quality Dimensions (Avg across {stats.analyzed} analyzed)
            
          
          
            
              {[
                { key: 'engagement', label: 'Engagement', color: 'text-blue-600' },
                { key: 'clarity', label: 'Clarity', color: 'text-purple-600' },
                { key: 'empathy', label: 'Empathy', color: 'text-pink-600' },
                { key: 'objectionHandling', label: 'Objection Handling', color: 'text-orange-600' },
                { key: 'qualification', label: 'Qualification', color: 'text-teal-600' },
                { key: 'closing', label: 'Closing', color: 'text-green-600' },
              ].map(dim => {
                const value = stats.avgDimensions![dim.key as keyof typeof stats.avgDimensions];
                return (
                  
                    {value}
                    {dim.label}
                    
                      = 70 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${value}%` }}
                      />
                    
                  
                );
              })}
            
          
        
      )}

      {/* Filters */}
      
        
          
            
              Search
              
                
                 setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              
            
            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((campaign: any) => (
                    
                      {campaign.name}
                    
                  ))}
                
              
            
            
              Type
              
                
                  
                
                
                  All Types
                  Calls
                  Emails
                
              
            
            
              Source
              
                
                  
                
                
                  All Sources
                  Production Calls
                  Test Calls
                  Emails
                
              
            
            
              Disposition
              
                
                  
                
                
                  All Dispositions
                  Completed
                  Qualified
                  Not Interested
                  Callback Requested
                  Gatekeeper
                  Voicemail
                  No Answer
                
              
            
            
              Sort By
              
                
                  
                
                
                  Latest First
                  Best Score
                
              
            
            
              From Date
               setDateFrom(e.target.value)}
              />
            
            
              To Date
               setDateTo(e.target.value)}
              />
            
            
               setShowOnlyWithTranscripts(checked === true)}
              />
              
                Show only with full transcripts
              
            
          
        
      

      {/* Main Content - Split View */}
      
        {/* Conversation List */}
        
          
            Conversations
            
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} ({stats.analyzed} analyzed with quality scores)
            
          
          
            {qaLoading ? (
              
                {[1, 2, 3].map((i) => (
                  
                ))}
              
            ) : conversations.length === 0 ? (
              
                
                No conversations found
                Try adjusting your filters
              
            ) : (
              
                
                  {conversations.map((conversation) => (
                     setSelectedConversation(conversation)}
                    />
                  ))}
                
              
            )}
          
        

        {/* Transcript Viewer */}
        
          
            Transcript
            {selectedConversation && (
              
                {selectedConversation.contactName} - {selectedConversation.companyName}
              
            )}
          
          
            {selectedConversation ? (
              
                
                  {/* Conversation Details */}
                  
                    
                    {selectedConversation.disposition && (
                      
                    )}
                    {selectedConversation.agentType && (
                      {selectedConversation.agentType === 'ai' ? 'AI Agent' : 'Human Agent'}
                    )}
                    {selectedConversation.duration && selectedConversation.duration > 0 && (
                      
                        
                        {Math.floor(selectedConversation.duration / 60)}:{String(selectedConversation.duration % 60).padStart(2, '0')}
                      
                    )}
                    {selectedConversation.testResult && (
                      
                        {selectedConversation.testResult.replace(/_/g, ' ')}
                      
                    )}
                  

                  {/* Campaign & Agent Info */}
                  
                    Campaign: {selectedConversation.campaignName}
                    {selectedConversation.agentName && (
                      Agent: {selectedConversation.agentName}
                    )}
                  

                  {/* Call Summary */}
                  {(selectedConversation.callSummary || selectedConversation.analysis?.summary) && (
                    
                      Call Summary
                      
                        {selectedConversation.callSummary || selectedConversation.analysis?.summary}
                      
                    
                  )}

                  {/* Analysis Score & Quality Dimensions */}
                  {selectedConversation.analysis && (
                    
                      
                        
                          
                          Quality Analysis
                        
                        {selectedConversation.analysis.overallScore !== undefined && (
                          = 70 ? "default" : selectedConversation.analysis.overallScore >= 50 ? "secondary" : "destructive"}
                            className={selectedConversation.analysis.overallScore >= 70 ? "bg-green-600" : ""}
                          >
                            Score: {selectedConversation.analysis.overallScore}/100
                          
                        )}
                      

                      {/* Quality Dimensions Grid */}
                      {selectedConversation.analysis.qualityDimensions && (
                        
                          {Object.entries(selectedConversation.analysis.qualityDimensions).map(([key, value]) => (
                            
                              {key.replace(/([A-Z])/g, ' $1')}
                              {String(value)}
                            
                          ))}
                        
                      )}

                      {/* Performance Metrics */}
                      {selectedConversation.analysis.performanceMetrics && (
                        
                          {selectedConversation.analysis.performanceMetrics.identityConfirmed && (
                            Identity Confirmed
                          )}
                          {selectedConversation.analysis.performanceMetrics.pitchDelivered && (
                            Pitch Delivered
                          )}
                          {selectedConversation.analysis.performanceMetrics.objectionHandled && (
                            Objection Handled
                          )}
                          {selectedConversation.analysis.performanceMetrics.closingAttempted && (
                            Closing Attempted
                          )}
                          {selectedConversation.analysis.performanceMetrics.conversationFlow && (
                            Flow: {selectedConversation.analysis.performanceMetrics.conversationFlow}
                          )}
                        
                      )}
                    
                  )}

                  {/* Recommendations */}
                  {selectedConversation.analysis?.recommendations && selectedConversation.analysis.recommendations.length > 0 && (
                    
                      
                        
                        Recommendations ({selectedConversation.analysis.recommendations.length})
                      
                      
                        {selectedConversation.analysis.recommendations.slice(0, 3).map((rec: any, idx: number) => (
                          
                            {rec.category}
                            {rec.suggestedChange}
                            {rec.expectedImpact && (
                              Impact: {rec.expectedImpact}
                            )}
                          
                        ))}
                      
                    
                  )}

                  {/* Detected Issues */}
                  {selectedConversation.detectedIssues && selectedConversation.detectedIssues.length > 0 && (
                    
                      
                        
                        Detected Issues ({selectedConversation.detectedIssues.length})
                      
                      
                        {selectedConversation.detectedIssues.map((issue: any, idx: number) => (
                          
                            
                              
                                {issue.severity}
                              
                              {issue.type}
                            
                            {issue.description}
                            {issue.suggestion && (
                              Suggestion: {issue.suggestion}
                            )}
                          
                        ))}
                      
                    
                  )}

                  {/* Recording Playback - fetches GCS/Telnyx URL via dedicated endpoint */}
                  {(selectedConversation.hasRecording || selectedConversation.recordingUrl || selectedConversation.recordingS3Key || selectedConversation.telnyxRecordingId || selectedConversation.source === 'call_session') && (
                    
                  )}

                  {/* Transcript */}
                  
                    Transcript
                    
                  
                
              
            ) : (
              
                
                Select a conversation to view transcript
              
            )}
          
        
      
    
  );
}