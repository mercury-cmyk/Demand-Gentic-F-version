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
    verdictBreakdown: Array;
    actionBreakdown: Array;
    dispositionOverrides: { overridden: number; total: number };
    lastProcessed: string | null;
    avgProcessingMs: number;
  };
}

const VERDICT_CONFIG: Record = {
  high_potential: { label: 'High Potential', color: 'text-green-600', icon: CheckCircle2, bg: 'bg-green-50 border-green-200' },
  likely_potential: { label: 'Likely Potential', color: 'text-blue-600', icon: ArrowUpRight, bg: 'bg-blue-50 border-blue-200' },
  review: { label: 'Needs Review', color: 'text-amber-600', icon: Eye, bg: 'bg-amber-50 border-amber-200' },
  not_potential: { label: 'Not Potential', color: 'text-gray-500', icon: XCircle, bg: 'bg-gray-50 border-gray-200' },
};

const ACTION_CONFIG: Record = {
  engage: { label: 'Engage Now', color: 'bg-green-100 text-green-800' },
  nurture: { label: 'Nurture', color: 'bg-blue-100 text-blue-800' },
  review: { label: 'Review', color: 'bg-amber-100 text-amber-800' },
  skip: { label: 'Skip', color: 'bg-gray-100 text-gray-600' },
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const config = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.review;
  const Icon = config.icon;
  return (
    
      
      {config.label}
    
  );
}

function ScoreBar({ label, value, max = 100, color = 'bg-primary' }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    
      
        {label}
        {value}%
      
      
        
      
    
  );
}

function ModelBadge({ model, verdict, confidence }: { model: string; verdict: string | null; confidence: number | null }) {
  if (!verdict) return N/A;
  const vConfig = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.review;
  return (
    
      
        
          
            {model}: {confidence}%
          
        
        
          {model} verdict: {vConfig.label} ({confidence}% confidence)
        
      
    
  );
}

export default function PrecisionLeadsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    campaignId: 'all',
    verdict: 'all',
    search: '',
    minConfidence: '',
    recommendedAction: 'all',
    sortBy: 'intent',
    sortOrder: 'desc',
  });

  // Fetch campaigns
  const { data: campaigns = [] } = useQuery({
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
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/precision-leads', filters, page],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/precision-leads?${buildParams()}`);
      return response.json();
    },
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['/api/precision-leads/stats'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/precision-leads/stats');
      return response.json();
    },
    refetchInterval: 60000,
  });

  // Autopilot mutation — AI-heavy, needs generous timeout
  const autopilotMutation = useMutation({
    mutationFn: async () => {
      const body: any = {};
      if (filters.campaignId !== 'all') body.campaignId = filters.campaignId;
      const response = await apiRequest('POST', '/api/precision-leads/autopilot', body, { timeout: 300000 });
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
      const response = await apiRequest('POST', '/api/precision-leads/qualify', body, { timeout: 300000 });
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
      const response = await apiRequest('POST', '/api/precision-leads/analyze', { callSessionId }, { timeout: 120000 });
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
  const { data: conversationDetail, isLoading: conversationLoading } = useQuery({
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
    
      {/* Stats Cards */}
      {stats && (
        
          {/* "All" card */}
           { setFilters(f => ({ ...f, verdict: 'all' })); setPage(1); setSelectedId(null); }}
          >
            
              
                
                All Analyzed
              
              {stats.total}
              Click to view all
            
          

          {stats.verdictBreakdown.map((v) => {
            const config = VERDICT_CONFIG[v.verdict] || VERDICT_CONFIG.review;
            const Icon = config.icon;
            const isActive = filters.verdict === v.verdict;
            return (
               { setFilters(f => ({ ...f, verdict: v.verdict })); setPage(1); setSelectedId(null); }}
              >
                
                  
                    
                    {config.label}
                  
                  {v.count}
                  Avg intent: {v.avgIntent}%
                  {isActive && ▼ showing below}
                
              
            );
          })}
          
            
              
                
                Overrides
              
              {stats.dispositionOverrides.overridden}
              of {stats.dispositionOverrides.total} total
            
          
        
      )}

      {/* Filters Bar */}
      
        
          
           { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
          />
        

         { setFilters(f => ({ ...f, campaignId: v })); setPage(1); }}>
          
            
          
          
            All Campaigns
            {campaigns.map(c => (
              {c.name}
            ))}
          
        

         { setFilters(f => ({ ...f, verdict: v })); setPage(1); setSelectedId(null); }}>
          
            
          
          
            All Verdicts
            High + Likely
            High Potential
            Likely Potential
            Needs Review
            Not Potential
          
        

         { setFilters(f => ({ ...f, recommendedAction: v })); setPage(1); }}>
          
            
          
          
            All Actions
            Engage
            Nurture
            Review
          
        

         setFilters(f => ({ ...f, sortBy: v }))}>
          
            
          
          
            Intent Score ↓
            Confidence ↓
            Priority Rank
            Date ↓
          
        

        
           refetch()} disabled={isLoading}>
            
            Refresh
          
           autopilotMutation.mutate()} disabled={autopilotMutation.isPending}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
            {autopilotMutation.isPending ? (
              <> Running...
            ) : (
              <> Run Autopilot
            )}
          
           qualifyMutation.mutate()} disabled={qualifyMutation.isPending}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
            {qualifyMutation.isPending ? (
              <> Qualifying...
            ) : (
              <> Qualify Leads
            )}
          
        
      

      {/* Total Count + Legend */}
      
        
          
          {total} precision-analyzed leads
          {stats?.lastProcessed && (
            
              Last run: {format(new Date(stats.lastProcessed), 'MMM d, h:mm a')}
            
          )}
        
        
           Kimi 128k
          +
           DeepSeek
          =
           Consensus
        
      

      {/* Main Content */}
      
        {/* Lead List */}
        
          {isLoading ? (
            
              {[...Array(8)].map((_, i) => )}
            
          ) : items.length === 0 ? (
            
              
              No precision leads found
              Run the autopilot to analyze unprocessed calls
               autopilotMutation.mutate()}>
                 Start Autopilot
              
            
          ) : (
            
              {items.map((lead) => {
                const vConfig = VERDICT_CONFIG[lead.verdict] || VERDICT_CONFIG.review;
                const aConfig = ACTION_CONFIG[lead.recommendedAction || 'review'] || ACTION_CONFIG.review;
                const isSelected = lead.id === selectedId;

                return (
                   setSelectedId(isSelected ? null : lead.id)}
                  >
                    
                      {/* Left: Contact + Campaign */}
                      
                        
                          {lead.contactName}
                          
                          {lead.overrideDisposition && (
                            
                              Disposition Override
                            
                          )}
                        
                        
                          {lead.companyName !== 'Unknown' && (
                            {lead.companyName}
                          )}
                          {lead.campaignName}
                          {lead.callDuration && (
                            {lead.callDuration}s
                          )}
                          {lead.autopilotRun && (
                            Auto
                          )}
                        

                        {/* Intent signals preview */}
                        {lead.intentSignals.length > 0 && (
                          
                            {lead.intentSignals.slice(0, 3).map((s, i) => (
                              
                                {s.signal.slice(0, 30)}
                              
                            ))}
                            {lead.intentSignals.length > 3 && (
                              +{lead.intentSignals.length - 3} more
                            )}
                          
                        )}
                      

                      {/* Right: Scores */}
                      
                        
                          
                            Intent
                            = 70 ? 'text-green-600' :
                              lead.consensusIntentScore >= 40 ? 'text-blue-600' : 'text-gray-500'
                            )}>
                              {lead.consensusIntentScore}%
                            
                          
                          
                            Fit
                            = 70 ? 'text-green-600' :
                              lead.consensusCampaignFit >= 40 ? 'text-blue-600' : 'text-gray-500'
                            )}>
                              {lead.consensusCampaignFit}%
                            
                          
                        
                        {aConfig.label}
                        
                          
                          
                        
                      
                    
                  
                );
              })}
            
          )}
        

        {/* Detail Panel */}
        {selectedLead ? (
          
            {/* Fixed Header */}
            
              
                
                  {selectedLead.contactName}
                  {selectedLead.companyName}
                
                
                  
                  
                    {ACTION_CONFIG[selectedLead.recommendedAction || 'review']?.label}
                  
                
              

              {/* Contact Info - Prominent */}
              
                {selectedLead.contactPhone && (
                  
                    
                    {selectedLead.contactPhone}
                  
                )}
                {selectedLead.contactEmail && (
                  
                    
                    {selectedLead.contactEmail}
                  
                )}
                {selectedLead.callDuration != null && selectedLead.callDuration > 0 && (
                  
                    
                    {Math.floor(selectedLead.callDuration / 60)}:{String(selectedLead.callDuration % 60).padStart(2, '0')}
                  
                )}
                {conversationDetail?.disposition && (
                  
                    {String(conversationDetail.disposition).replace(/_/g, ' ')}
                  
                )}
              

              {/* Recording Link */}
              {conversationDetail?.recordingUrl && (
                
                  
                  Recording Available
                  
                    Open Recording 
                  
                
              )}
            

            {/* Tabbed Content */}
            
              
                
                  
                  Overview
                
                
                  
                  Transcript
                
                
                  
                  AI Analysis
                
              

              {/* Overview Tab */}
              
                
                  
                    {/* Consensus Scores */}
                    
                      
                        
                          
                          Consensus Scores
                        
                      
                      
                        
                        
                        
                        {selectedLead.dataCompleteness != null && (
                          
                        )}
                      
                    

                    {/* Call Summary from conversation detail */}
                    {conversationDetail?.callSummary && (
                      
                        
                          
                            
                            Call Summary
                          
                        
                        
                          {conversationDetail.callSummary}
                        
                      
                    )}

                    {/* Model Comparison */}
                    
                      
                        
                          
                          Model Comparison
                        
                      
                      
                        
                          
                            
                              
                              Kimi 128k
                            
                            {selectedLead.kimiVerdict ? (
                              <>
                                
                                {selectedLead.kimiConfidence}% conf
                              
                            ) : (
                              Not run
                            )}
                          
                          
                            
                              
                              DeepSeek
                            
                            {selectedLead.deepseekVerdict ? (
                              <>
                                
                                {selectedLead.deepseekConfidence}% conf
                              
                            ) : (
                              Not run
                            )}
                          
                        
                      
                    

                    {/* Disposition Analysis */}
                    {selectedLead.overrideDisposition && (
                      
                        
                          
                            
                            Disposition Override
                          
                        
                        
                          
                            Original:
                            {selectedLead.originalDisposition || 'none'}
                          
                          
                            Suggested:
                            {selectedLead.suggestedDisposition}
                          
                        
                      
                    )}

                    {/* Intent Signals */}
                    {selectedLead.intentSignals.length > 0 && (
                      
                        
                          
                            
                            Intent Signals ({selectedLead.intentSignals.length})
                          
                        
                        
                          
                            {selectedLead.intentSignals.map((s, i) => (
                              
                                
                                  {s.strength}
                                
                                {s.signal}
                                {s.source}
                              
                            ))}
                          
                        
                      
                    )}

                    {/* Engagement Indicators */}
                    {selectedLead.engagementIndicators.length > 0 && (
                      
                        
                          
                            
                            Engagement
                          
                        
                        
                          
                            {selectedLead.engagementIndicators.map((e, i) => (
                              
                                {e.positive ? (
                                  
                                ) : (
                                  
                                )}
                                {e.indicator}
                              
                            ))}
                          
                        
                      
                    )}

                    {/* Missing Fields */}
                    {selectedLead.missingFields.length > 0 && (
                      
                        
                          
                            
                            Missing Data (not disqualifying)
                          
                          
                            {selectedLead.missingFields.map((f, i) => (
                              {f}
                            ))}
                          
                        
                      
                    )}

                    {/* Campaign Objective */}
                    {selectedLead.campaignObjective && (
                      
                        
                          
                            
                            Campaign Objective
                          
                        
                        
                          {selectedLead.campaignObjective}
                        
                      
                    )}

                    {/* Meta */}
                    
                      {selectedLead.processedAt && (
                        Analyzed: {format(new Date(selectedLead.processedAt), 'MMM d, yyyy h:mm a')}
                      )}
                      {selectedLead.processingDurationMs && (
                        Processing time: {(selectedLead.processingDurationMs / 1000).toFixed(1)}s
                      )}
                      Priority rank: {selectedLead.priorityRank}
                    
                  
                
              

              {/* Transcript Tab */}
              
                
                  
                    {conversationLoading ? (
                      
                        
                        
                        
                        
                        
                      
                    ) : transcriptData && transcriptData.available ? (
                      
                    ) : (
                      
                        
                        No transcript available
                        
                          {conversationDetail ? 'Transcript data is not available for this call' : 'Loading conversation details...'}
                        
                      
                    )}
                  
                
              

              {/* AI Analysis Tab */}
              
                
                  
                    {/* AI Reasoning */}
                    {selectedLead.consensusReasoning && (
                      
                        
                          
                            
                            AI Consensus Reasoning
                          
                        
                        
                          {selectedLead.consensusReasoning}
                        
                      
                    )}

                    {/* Call Analysis from conversation detail */}
                    {conversationDetail?.analysis && (
                      
                        
                          
                            
                            Call Analysis
                          
                        
                        
                          {conversationDetail.analysis?.summary && (
                            
                              Summary:
                              {conversationDetail.analysis.summary}
                            
                          )}
                          {conversationDetail.analysis?.conversationQuality?.summary && (
                            
                              Quality Assessment:
                              {conversationDetail.analysis.conversationQuality.summary}
                            
                          )}
                          {conversationDetail.analysis?.performanceMetrics && (
                            
                              Performance Metrics:
                              
                                {Object.entries(conversationDetail.analysis.performanceMetrics).map(([key, val]) => (
                                  
                                    {val ? (
                                      
                                    ) : (
                                      
                                    )}
                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                  
                                ))}
                              
                            
                          )}
                        
                      
                    )}

                    {/* Recommended Action */}
                    {selectedLead.recommendedAction && (
                      
                        
                          
                            
                            Recommended Action
                          
                        
                        
                          
                            {ACTION_CONFIG[selectedLead.recommendedAction]?.label}
                          
                          {selectedLead.actionReason && (
                            {selectedLead.actionReason}
                          )}
                        
                      
                    )}

                    {!selectedLead.consensusReasoning && !conversationDetail?.analysis && (
                      
                        
                        No analysis available
                        Run the autopilot to generate AI analysis
                      
                    )}
                  
                
              
            
          
        ) : (
          
            
              
              Select a lead to view details
              Click on a lead from the list to see transcript, recording, and analysis
            
          
        )}
      

      {/* Pagination */}
      {meta.totalPages > 1 && (
        
          
            Page {meta.page} of {meta.totalPages} ({total} results)
          
          
             setPage(p => p - 1)}>
              
            
            = meta.totalPages} onClick={() => setPage(p => p + 1)}>
              
            
          
        
      )}
    
  );
}