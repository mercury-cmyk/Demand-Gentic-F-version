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
  RefreshCw, Brain, Search, ArrowLeft, Building, Clock, FileText,
  Mic, AlertTriangle, Target, TrendingUp, ChevronLeft, ChevronRight,
  Sparkles, Zap, CheckCircle2, ShieldCheck, Radar,
} from 'lucide-react';
import PrecisionLeadsPanel from '@/components/precision-leads-panel';
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
  dispositionBreakdown: Array;
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

  const [activeView, setActiveView] = useState('precision');
  const [filters, setFilters] = useState(parseUrlParams);
  const [selectedId, setSelectedId] = useState(null);
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
  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/campaigns');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min — campaign list rarely changes
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
  } = useQuery({
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
  const { data: selectedDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['/api/qa/conversations', selectedId, potentialLeads.length],
    queryFn: async () => {
      if (!selectedId) return null;
      const response = await apiRequest('GET', `/api/qa/conversations?id=${selectedId}&limit=1`);
      const data = await response.json();
      const conv = data.conversations?.find((c: any) => c.id === selectedId);
      // If conversation not found in API, still try to build detail from lead data alone
      const lead = potentialLeads.find(l => l.id === selectedId);
      if (!lead) return null;
      return adaptPotentialLeadToDetail(lead, conv || {});
    },
    enabled: !!selectedId && potentialLeads.length > 0,
  });

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('POST', `/api/call-sessions/${sessionId}/analyze`, undefined, { timeout: 120000 });
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
      const response = await apiRequest('POST', '/api/qa/bulk-analyze', {}, { timeout: 180000 });
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

  // Disposition override mutation
  const overrideDispositionMutation = useMutation({
    mutationFn: async ({ callSessionId, newDisposition, reason }: { callSessionId: string; newDisposition: string; reason?: string }) => {
      const response = await apiRequest('POST', `/api/disposition-intelligence/override/${callSessionId}`, {
        newDisposition,
        reason: reason || 'Override from Potential Leads review',
        source: 'potential_leads',
      });
      return response.json();
    },
    onSuccess: (_data: any, variables: { callSessionId: string; newDisposition: string }) => {
      toast({
        title: 'Disposition Updated',
        description: `Changed to ${variables.newDisposition.replace(/_/g, ' ')}`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/qa/conversations'] });
    },
    onError: (error: any) => {
      toast({ title: 'Override Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleBack = () => setLocation('/disposition-intelligence?tab=conversation-quality');

  const updateFilter = (key: K, value: PotentialLeadsFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page on filter change
  };

  return (
    
      {/* Header */}
      
        
          
            
              
              Back
            
            
              
                
                Potential Leads
              
              
                Calls with potential qualification signals that may need review
              
            
          
          
            {/* Total Count Badge */}
            
              
              
                Potential Leads: {total}
              
            
             bulkAnalyzeMutation.mutate()}
              disabled={bulkAnalyzeMutation.isPending}
            >
              {bulkAnalyzeMutation.isPending ? (
                <>
                  
                  Analyzing...
                
              ) : (
                <>
                  
                  Run AI Analysis
                
              )}
            
             refetch()}>
              
              Refresh
            
          
        

        {/* Tab Bar */}
        
           setActiveView('precision')}
            className={cn(
              'gap-2',
              activeView === 'precision' && 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700'
            )}
          >
            
            Precision Engine
            
              Kimi + DeepSeek
            
          
           setActiveView('standard')}
            className="gap-2"
          >
            
            Standard Analysis
          
        
      

      {/* Precision Leads View */}
      {activeView === 'precision' && (
        
          
        
      )}

      {/* Standard Main Content */}
      {activeView === 'standard' && (
      
        
          {/* Left Panel - Filters + List */}
          
            
              {/* Filters - Fixed at top */}
              
              
                
                  
                    
                      Filters
                      Refine potential leads
                    
                  
                  
                  {/* Standard Filters (same as Unified Intelligence) */}
                  
                    {/* Search */}
                    
                      Search
                      
                        
                         updateFilter('search', e.target.value)}
                          className="pl-7 h-8 text-sm"
                        />
                      
                    

                    {/* Campaign */}
                    
                      Campaign
                       updateFilter('campaignId', v)}>
                        
                          
                        
                        
                          All Campaigns
                          {campaigns.map((c) => (
                            {c.name}
                          ))}
                        
                      
                    

                    {/* Disposition */}
                    
                      Disposition
                       updateFilter('disposition', v)}>
                        
                          
                        
                        
                          All
                          Qualified Lead
                          Not Interested
                          Callback Requested
                          Needs Review
                          Voicemail
                          No Answer
                          Do Not Call
                          Invalid Data
                        
                      
                    
                  

                  {/* Lead-Specific Filters */}
                  
                    Lead-Specific Filters
                    
                      {/* Min Duration */}
                      
                        Min Duration (s)
                         updateFilter('minDuration', e.target.value ? parseInt(e.target.value) : null)}
                          className="h-8 text-sm"
                          min={0}
                        />
                      

                      {/* Transcript Quality */}
                      
                        Transcript Quality
                         updateFilter('transcriptQuality', v as any)}
                        >
                          
                            
                          
                          
                            All
                            Two-sided
                            One-sided
                            Missing
                          
                        
                      

                      {/* Confidence Threshold */}
                      
                        
                          Min Confidence: {filters.minConfidence ?? 0}%
                        
                         updateFilter('minConfidence', v[0] || null)}
                          max={100}
                          step={5}
                          className="mt-2"
                        />
                      
                    
                  
                
              

              
              {/* Results List — fills remaining height */}
              
                
                  Potential Leads
                  
                    {isLoading ? 'Loading...' : `Showing ${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, total)} of ${total}`}
                  
                
                
                  {isLoading ? (
                    
                      {[1, 2, 3, 4].map((i) => (
                        
                      ))}
                    
                  ) : potentialLeads.length === 0 ? (
                    
                      
                      No potential leads found
                      
                      {/* Show diagnostics if available */}
                      {diagnostics && (
                        
                          Dataset Overview:
                          
                            Total calls:
                            {diagnostics.totalCalls}
                            With transcripts:
                            {diagnostics.withTranscript}
                            With AI analysis:
                            {diagnostics.withAnalysis}
                            Duration ≥30s:
                            {diagnostics.longCalls}
                          
                          
                          {diagnostics.baseFilteredCalls > 0 && (
                            <>
                              Filtering Results:
                              
                                Base filtered:
                                {diagnostics.baseFilteredCalls}
                                Voicemail/IVR:
                                -{diagnostics.skippedVoicemail}
                                Low confidence:
                                -{diagnostics.skippedLowConfidence}
                                Not potential:
                                -{diagnostics.skippedNotPotential}
                              
                            
                          )}

                          {(diagnostics.withLeadQualityAssessment != null || diagnostics.withCallQualityRecord != null) && (
                            <>
                              AI Scoring Coverage:
                              
                                {diagnostics.withLeadQualityAssessment != null && (
                                  <>
                                    Lead quality AI:
                                    {diagnostics.withLeadQualityAssessment}
                                  
                                )}
                                {diagnostics.withCallQualityRecord != null && (
                                  <>
                                    Call quality AI:
                                    {diagnostics.withCallQualityRecord}
                                  
                                )}
                              
                              {diagnostics.scoringSourceBreakdown && (
                                
                                  AI scored leads:
                                  
                                    {diagnostics.scoringSourceBreakdown.lead_quality_ai + diagnostics.scoringSourceBreakdown.call_quality_ai}
                                  
                                  Heuristic leads:
                                  
                                    {diagnostics.scoringSourceBreakdown.heuristic}
                                  
                                
                              )}
                            
                          )}

                          {diagnostics.withTranscript === 0 && (
                            
                              No calls have transcripts yet. Transcripts are required for lead detection.
                            
                          )}

                          {diagnostics.withTranscript > 0 && diagnostics.withAnalysis === 0 && (
                            
                              No calls have AI analysis. Run bulk analysis to improve detection.
                            
                          )}
                        
                      )}

                      
                         refetch()}
                        >
                          
                          Refresh
                        
                         bulkAnalyzeMutation.mutate()}
                          disabled={bulkAnalyzeMutation.isPending}
                        >
                          {bulkAnalyzeMutation.isPending ? (
                            <>
                              
                              Analyzing...
                            
                          ) : (
                            <>
                              
                              Run AI Analysis
                            
                          )}
                        
                      
                      
                        AI analysis improves lead detection accuracy by identifying qualification signals in transcripts.
                      
                    
                  ) : (
                    
                      
                        {potentialLeads.map((lead) => (
                           setSelectedId(lead.id)}
                          />
                        ))}
                      
                    
                  )}
                
                {/* Pagination */}
                {meta.totalPages > 1 && (
                  
                     setPage(p => Math.max(1, p - 1))}
                      disabled={page 
                      
                      Previous
                    
                    
                      Page {page} of {meta.totalPages}
                    
                     setPage(p => Math.min(meta.totalPages, p + 1))}
                      disabled={page >= meta.totalPages}
                    >
                      Next
                      
                    
                  
                )}
              
            
          

          

          {/* Right Panel - Detail */}
          
            
               analyzeMutation.mutate(id)}
                onTranscribe={(id) => transcribeMutation.mutate(id)}
                onSelectHistoryCall={(id) => setSelectedId(id)}
                isAnalyzing={analyzeMutation.isPending}
                isTranscribing={transcribeMutation.isPending}
              />

              {/* Disposition Override Section */}
              {selectedDetail && (
                
                  
                    
                      
                      Override Disposition
                    
                    
                      Change the call disposition if the AI assessment is incorrect
                    
                  
                  
                    
                      {[
                        { value: 'qualified_lead', label: 'Qualified Lead', color: 'bg-green-600 hover:bg-green-700' },
                        { value: 'callback_requested', label: 'Callback', color: 'bg-blue-600 hover:bg-blue-700' },
                        { value: 'needs_review', label: 'Needs Review', color: 'bg-yellow-600 hover:bg-yellow-700' },
                        { value: 'not_interested', label: 'Not Interested', color: 'bg-gray-600 hover:bg-gray-700' },
                        { value: 'do_not_call', label: 'DNC', color: 'bg-red-600 hover:bg-red-700' },
                      ].map((opt) => {
                        const isCurrentDisposition = selectedDetail.disposition === opt.value;
                        return (
                           {
                              overrideDispositionMutation.mutate({
                                callSessionId: selectedDetail.id,
                                newDisposition: opt.value,
                              });
                            }}
                          >
                            {isCurrentDisposition && }
                            {opt.label}
                          
                        );
                      })}
                    
                  
                
              )}
            
          
        
      
      )}
    
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
    
      {/* Row 1: Name + Scores */}
      
        
          
            {lead.contactName}
            {isAIScored && (
              
                
                AI
              
            )}
          
          
            
              
              {lead.companyName}
            
            {lead.campaignName}
          
        

        
          
            {lead.derivedConfidence}%
          
          {lead.disposition && (
            
              {lead.disposition.replace(/_/g, ' ')}
            
          )}
        
      

      {/* Row 2: Intent + Outcome + Duration */}
      
        {lead.intentStrength && (
          
            
            {lead.intentStrength}
          
        )}
        {lead.outcomeCategory && (
          
            {lead.outcomeCategory.replace(/_/g, ' ')}
          
        )}
        {lead.campaignFitScore != null && (
          
            {lead.campaignFitScore}% fit
          
        )}
        {lead.qualificationMet && (
          
            
            Qualified
          
        )}
        {lead.dispositionReview && !lead.dispositionReview.isAccurate && (
          
            
            Mismatch
          
        )}

        {/* Right-aligned meta */}
        
          {lead.duration !== undefined && lead.duration > 0 && (
            
              
              {Math.floor(lead.duration / 60)}:{String(lead.duration % 60).padStart(2, '0')}
            
          )}
          {lead.hasTranscript && }
          {lead.hasRecording && }
          {format(new Date(lead.createdAt), 'MMM d')}
        
      

      {/* Row 3: AI Suggestion (only on mismatch) */}
      {hasSuggestedDispositionMismatch && (
        
          
          AI suggests: {lead.suggestedDisposition!.replace(/_/g, ' ')}
        
      )}
    
  );
}