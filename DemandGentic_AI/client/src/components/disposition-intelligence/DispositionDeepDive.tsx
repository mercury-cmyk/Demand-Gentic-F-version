/**
 * Disposition Deep Dive
 *
 * Filterable call list by disposition type with pattern detection,
 * voicemail phrase analysis, mismatched disposition alerts,
 * and inline disposition override controls.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  AlertTriangle,
  Phone,
  Clock,
  ChevronLeft,
  ChevronRight,
  Voicemail,
  ShieldAlert,
  Edit3,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import {
  type DispositionIntelligenceFilters,
  type DeepDiveResponse,
  type PhraseInsightsResponse,
  DISPOSITION_TYPES,
  DISPOSITION_COLORS,
  DISPOSITION_LABELS,
  getDispositionLabel,
  getDispositionColor,
  type DispositionType,
} from './types';
import { PushToShowcaseButton } from '../showcase-calls/push-to-showcase-button';

interface DispositionDeepDiveProps {
  filters: DispositionIntelligenceFilters;
}

interface OverrideDialogState {
  open: boolean;
  callSessionId: string;
  contactName: string;
  currentDisposition: string;
  suggestedDisposition: string;
}

export function DispositionDeepDive({ filters }: DispositionDeepDiveProps) {
  const [selectedDisposition, setSelectedDisposition] = useState('voicemail');
  const [page, setPage] = useState(1);
  const [overrideDialog, setOverrideDialog] = useState({
    open: false,
    callSessionId: '',
    contactName: '',
    currentDisposition: '',
    suggestedDisposition: '',
  });
  const [overrideDisposition, setOverrideDisposition] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overriddenCalls, setOverriddenCalls] = useState>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['/api/disposition-intelligence/deep-dive', selectedDisposition, filters.campaignId, filters.startDate, filters.endDate, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('disposition', selectedDisposition);
      params.append('page', page.toString());
      params.append('limit', '20');
      if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const res = await apiRequest('GET', `/api/disposition-intelligence/deep-dive?${params}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: phraseInsights, isLoading: phraseInsightsLoading } = useQuery({
    queryKey: ['/api/disposition-intelligence/phrase-insights', selectedDisposition, filters.campaignId, filters.startDate, filters.endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('disposition', selectedDisposition);
      params.append('maxCalls', '2000');
      params.append('minCount', '2');
      params.append('maxKeywords', '12');
      params.append('maxPhrases', '12');
      if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const res = await apiRequest('GET', `/api/disposition-intelligence/phrase-insights?${params}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Single override mutation
  const overrideMutation = useMutation({
    mutationFn: async ({ callSessionId, newDisposition, reason }: { callSessionId: string; newDisposition: string; reason: string }) => {
      const res = await apiRequest('POST', `/api/disposition-intelligence/override/${callSessionId}`, {
        newDisposition,
        reason,
      });
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: 'Disposition Updated',
        description: `Changed to ${getDispositionLabel(variables.newDisposition)}`,
      });
      setOverriddenCalls(prev => ({ ...prev, [variables.callSessionId]: variables.newDisposition }));
      // Invalidate deep dive queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-intelligence/deep-dive'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-intelligence/overview'] });
      setOverrideDialog(prev => ({ ...prev, open: false }));
      setOverrideDisposition('');
      setOverrideReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Override Failed',
        description: error.message || 'Failed to update disposition',
        variant: 'destructive',
      });
    },
  });

  // Bulk override mutation (for mismatched dispositions - apply all suggested fixes)
  const bulkOverrideMutation = useMutation({
    mutationFn: async (overrides: Array) => {
      const res = await apiRequest('POST', '/api/disposition-intelligence/bulk-override', { overrides });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Bulk Override Complete',
        description: `${data.succeeded} of ${data.total} dispositions updated`,
      });
      // Track overridden calls
      if (data.results) {
        const newOverrides: Record = {};
        for (const r of data.results) {
          if (r.success) newOverrides[r.callSessionId] = 'updated';
        }
        setOverriddenCalls(prev => ({ ...prev, ...newOverrides }));
      }
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-intelligence/deep-dive'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disposition-intelligence/overview'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Bulk Override Failed',
        description: error.message || 'Failed to update dispositions',
        variant: 'destructive',
      });
    },
  });

  function openOverrideDialog(callSessionId: string, contactName: string, currentDisposition: string, suggestedDisposition?: string) {
    setOverrideDisposition(suggestedDisposition || '');
    setOverrideReason('');
    setOverrideDialog({
      open: true,
      callSessionId,
      contactName,
      currentDisposition,
      suggestedDisposition: suggestedDisposition || '',
    });
  }

  function handleApplyOverride() {
    if (!overrideDisposition) return;
    overrideMutation.mutate({
      callSessionId: overrideDialog.callSessionId,
      newDisposition: overrideDisposition,
      reason: overrideReason || `Corrected from ${getDispositionLabel(overrideDialog.currentDisposition)} via Deep Dive`,
    });
  }

  function handleFixAllMismatches() {
    if (!data?.mismatchedDispositions.length) return;
    const overrides = data.mismatchedDispositions
      .filter(mm => !overriddenCalls[mm.callSessionId])
      .map(mm => ({
        callSessionId: mm.callSessionId,
        newDisposition: mm.expected,
        reason: `Auto-fix: AI detected mismatch (was ${getDispositionLabel(mm.assigned)}, should be ${getDispositionLabel(mm.expected)})`,
      }));
    if (overrides.length === 0) {
      toast({ title: 'All Fixed', description: 'All mismatched dispositions have already been corrected.' });
      return;
    }
    bulkOverrideMutation.mutate(overrides);
  }

  return (
    
      {/* Disposition Type Selector */}
      
        {DISPOSITION_TYPES.map(type => (
           { setSelectedDisposition(type); setPage(1); }}
            className="gap-1.5"
          >
            
            {DISPOSITION_LABELS[type]}
          
        ))}
      

      {isLoading ? (
        
          
        
      ) : !data || data.calls.length === 0 ? (
        
          
          No calls with disposition "{getDispositionLabel(selectedDisposition)}"
        
      ) : (
        
          {/* Call List */}
          
            {/* Mismatched Dispositions Alert */}
            {data.mismatchedDispositions.length > 0 && (
              
                
                
                  
                    {data.mismatchedDispositions.length} calls have mismatched dispositions
                    (assigned doesn't match expected).
                  
                  
                    {bulkOverrideMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    Fix All Mismatches
                  
                
              
            )}

            
              
                {data.calls.map((call, index) => (
                  
                    
                      
                        
                          {call.contactName}
                          {call.companyName} · {call.campaignName}
                        
                        
                          {call.voicemailDetected && (
                            
                              
                              VM
                            
                          )}
                          
                            {getDispositionLabel(call.disposition)}
                          
                        
                      

                      {/* Metrics Row */}
                      
                        
                          
                          {call.durationSeconds ? `${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}` : 'N/A'}
                        
                        {call.qualityScore != null && (
                          
                            {call.qualityScore}/100
                          
                        )}
                        {call.sentiment && (
                          {call.sentiment}
                        )}
                        {new Date(call.createdAt).toLocaleDateString()}
                      

                      {/* Disposition Accuracy */}
                      {call.dispositionAccurate === false && (
                        
                          
                            
                            Expected: {getDispositionLabel(call.expectedDisposition || '')}
                          
                          {!overriddenCalls[call.callSessionId] && (
                             openOverrideDialog(
                                call.callSessionId,
                                call.contactName,
                                call.disposition,
                                call.expectedDisposition || undefined
                              )}
                            >
                              
                              Fix Disposition
                            
                          )}
                          {overriddenCalls[call.callSessionId] && (
                            
                              
                              Fixed
                            
                          )}
                        
                      )}

                      {/* Transcript Snippet */}
                      {call.transcriptSnippet && (
                        
                          "{call.transcriptSnippet}..."
                        
                      )}

                      
                        {/* Override button for any call (regardless of accuracy) */}
                        {call.dispositionAccurate !== false && !overriddenCalls[call.callSessionId] && (
                           openOverrideDialog(
                              call.callSessionId,
                              call.contactName,
                              call.disposition
                            )}
                          >
                            
                            Override
                          
                        )}
                        {call.dispositionAccurate !== false && overriddenCalls[call.callSessionId] && (
                          
                            
                            Updated to {getDispositionLabel(overriddenCalls[call.callSessionId])}
                          
                        )}
                        
                      
                    
                  
                ))}
              
            

            {/* Pagination */}
            
              
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
              
              
                 setPage(p => p - 1)}
                >
                  
                
                = data.pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  
                
              
            
          

          {/* Patterns Panel */}
          
            {/* Outcome Keywords & Phrases */}
            
              
                
                  Outcome Keywords ({getDispositionLabel(selectedDisposition)})
                
              
              
                {phraseInsightsLoading ? (
                  
                    
                    Analyzing historical phrases...
                  
                ) : (
                  (() => {
                    const dispositionBucket = phraseInsights?.byDisposition?.[0];
                    if (!dispositionBucket || dispositionBucket.totalCalls === 0) {
                      return No historical phrases available for this filter.;
                    }
                    return (
                      <>
                        
                          {dispositionBucket.totalCalls} calls analyzed
                        

                        
                          Top Keywords
                          
                            {dispositionBucket.topKeywords.slice(0, 8).map((term) => (
                              
                                {term.term}
                                {term.callCoveragePct}%
                              
                            ))}
                          
                        

                        
                          Top Trigger Phrases
                          
                            {dispositionBucket.topBigrams.slice(0, 6).map((term) => (
                              
                                "{term.term}"
                                {term.callCoveragePct}%
                              
                            ))}
                          
                        
                      
                    );
                  })()
                )}
              
            

            {/* Machine vs Human detected language */}
            {phraseInsights?.byDetectionSignal?.length ? (
              
                
                  AMD Language Signals
                
                
                  {phraseInsights.byDetectionSignal
                    .filter((bucket) => bucket.key === 'machine' || bucket.key === 'human')
                    .map((bucket) => (
                      
                        
                          {bucket.key} detected
                          {bucket.totalCalls} calls
                        
                        
                          {bucket.topKeywords.slice(0, 6).map((term) => (
                            
                              {term.term}
                            
                          ))}
                        
                      
                    ))}
                
              
            ) : null}

            {/* Detected Patterns */}
            {data.patterns.length > 0 && (
              
                
                  Detected Patterns
                
                
                  {data.patterns.map((p, i) => (
                    
                      {p.pattern}
                      
                        {p.count}x
                        
                          {p.severity}
                        
                      
                    
                  ))}
                
              
            )}

            {/* Voicemail Patterns */}
            {data.voicemailPatterns.length > 0 && (
              
                
                  
                    
                    Voicemail Phrases
                  
                
                
                  {data.voicemailPatterns.map((vp, i) => (
                    
                      "{vp.phrase}"
                      {vp.frequency}x
                    
                  ))}
                
              
            )}

            {/* Mismatched Dispositions Detail */}
            {data.mismatchedDispositions.length > 0 && (
              
                
                  
                    
                    Disposition Mismatches ({data.mismatchedDispositions.length})
                  
                
                
                  {data.mismatchedDispositions.slice(0, 10).map((mm, i) => (
                    
                      
                        
                          {getDispositionLabel(mm.assigned)}
                        
                        
                        
                          Should be: {getDispositionLabel(mm.expected)}
                        
                        
                          {!overriddenCalls[mm.callSessionId] ? (
                             openOverrideDialog(
                                mm.callSessionId,
                                `Call ${mm.callSessionId.slice(0, 8)}`,
                                mm.assigned,
                                mm.expected
                              )}
                            >
                              
                              Fix
                            
                          ) : (
                            
                              
                              Fixed
                            
                          )}
                        
                      
                      {mm.notes.length > 0 && (
                        {mm.notes[0]}
                      )}
                    
                  ))}
                  {data.mismatchedDispositions.length > 10 && (
                    
                      +{data.mismatchedDispositions.length - 10} more mismatches
                    
                  )}
                
              
            )}
          
        
      )}

      {/* Override Disposition Dialog */}
       setOverrideDialog(prev => ({ ...prev, open }))}>
        
          
            
              
              Override Disposition
            
            
              Change the disposition for {overrideDialog.contactName}.
              Current: 
                {getDispositionLabel(overrideDialog.currentDisposition)}
              
            
          

          
            
              New Disposition
              
                
                  
                
                
                  {DISPOSITION_TYPES.map(type => (
                    
                      
                        
                        {DISPOSITION_LABELS[type]}
                        {type === overrideDialog.currentDisposition && (
                          (current)
                        )}
                      
                    
                  ))}
                
              
            

            
              Reason (optional)
               setOverrideReason(e.target.value)}
                rows={3}
              />
            

            {overrideDialog.suggestedDisposition && overrideDialog.suggestedDisposition !== overrideDisposition && (
              
                
                  AI suggests this should be {getDispositionLabel(overrideDialog.suggestedDisposition)}.{' '}
                   setOverrideDisposition(overrideDialog.suggestedDisposition)}
                  >
                    Apply suggestion
                  
                
              
            )}
          

          
             setOverrideDialog(prev => ({ ...prev, open: false }))}
              disabled={overrideMutation.isPending}
            >
              Cancel
            
            
              {overrideMutation.isPending ? (
                
              ) : (
                
              )}
              Apply Override
            
          
        
      
    
  );
}

function getScoreBadge(score: number): string {
  if (score >= 70) return 'bg-green-50 text-green-700 border-green-300';
  if (score >= 50) return 'bg-yellow-50 text-yellow-700 border-yellow-300';
  return 'bg-red-50 text-red-700 border-red-300';
}