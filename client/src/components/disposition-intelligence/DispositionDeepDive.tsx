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
  const [selectedDisposition, setSelectedDisposition] = useState<string>('voicemail');
  const [page, setPage] = useState(1);
  const [overrideDialog, setOverrideDialog] = useState<OverrideDialogState>({
    open: false,
    callSessionId: '',
    contactName: '',
    currentDisposition: '',
    suggestedDisposition: '',
  });
  const [overrideDisposition, setOverrideDisposition] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overriddenCalls, setOverriddenCalls] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<DeepDiveResponse>({
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

  const { data: phraseInsights, isLoading: phraseInsightsLoading } = useQuery<PhraseInsightsResponse>({
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
    mutationFn: async (overrides: Array<{ callSessionId: string; newDisposition: string; reason?: string }>) => {
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
        const newOverrides: Record<string, string> = {};
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
    <div className="space-y-4">
      {/* Disposition Type Selector */}
      <div className="flex flex-wrap gap-2">
        {DISPOSITION_TYPES.map(type => (
          <Button
            key={type}
            variant={selectedDisposition === type ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setSelectedDisposition(type); setPage(1); }}
            className="gap-1.5"
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: DISPOSITION_COLORS[type] }}
            />
            {DISPOSITION_LABELS[type]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Phone className="h-10 w-10 mb-2 opacity-50" />
          <p>No calls with disposition "{getDispositionLabel(selectedDisposition)}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Call List */}
          <div className="lg:col-span-2 space-y-3">
            {/* Mismatched Dispositions Alert */}
            {data.mismatchedDispositions.length > 0 && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    <strong>{data.mismatchedDispositions.length} calls</strong> have mismatched dispositions
                    (assigned doesn't match expected).
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="ml-3 shrink-0"
                    onClick={handleFixAllMismatches}
                    disabled={bulkOverrideMutation.isPending}
                  >
                    {bulkOverrideMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    )}
                    Fix All Mismatches
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-[600px]">
              <div className="space-y-2 pr-3">
                {data.calls.map((call, index) => (
                  <Card
                    key={`${call.callSessionId}-${call.callAttemptId || 'no-attempt'}-${call.createdAt}-${index}`}
                    className={`${call.dispositionAccurate === false ? 'border-red-300' : ''}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{call.contactName}</p>
                          <p className="text-xs text-muted-foreground">{call.companyName} · {call.campaignName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {call.voicemailDetected && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                              <Voicemail className="h-3 w-3 mr-1" />
                              VM
                            </Badge>
                          )}
                          <Badge
                            className="text-xs text-white"
                            style={{ backgroundColor: getDispositionColor(call.disposition) }}
                          >
                            {getDispositionLabel(call.disposition)}
                          </Badge>
                        </div>
                      </div>

                      {/* Metrics Row */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {call.durationSeconds ? `${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}` : 'N/A'}
                        </span>
                        {call.qualityScore != null && (
                          <Badge variant="outline" className={`text-xs ${getScoreBadge(call.qualityScore)}`}>
                            {call.qualityScore}/100
                          </Badge>
                        )}
                        {call.sentiment && (
                          <Badge variant="outline" className="text-xs capitalize">{call.sentiment}</Badge>
                        )}
                        <span>{new Date(call.createdAt).toLocaleDateString()}</span>
                      </div>

                      {/* Disposition Accuracy */}
                      {call.dispositionAccurate === false && (
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            Expected: <strong>{getDispositionLabel(call.expectedDisposition || '')}</strong>
                          </div>
                          {!overriddenCalls[call.callSessionId] && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs border-red-300 text-red-700 hover:bg-red-50"
                              onClick={() => openOverrideDialog(
                                call.callSessionId,
                                call.contactName,
                                call.disposition,
                                call.expectedDisposition || undefined
                              )}
                            >
                              <Edit3 className="h-3 w-3 mr-1" />
                              Fix Disposition
                            </Button>
                          )}
                          {overriddenCalls[call.callSessionId] && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Fixed
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Transcript Snippet */}
                      {call.transcriptSnippet && (
                        <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded-md line-clamp-2 italic">
                          "{call.transcriptSnippet}..."
                        </p>
                      )}

                      <div className="mt-2 flex justify-end gap-2">
                        {/* Override button for any call (regardless of accuracy) */}
                        {call.dispositionAccurate !== false && !overriddenCalls[call.callSessionId] && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openOverrideDialog(
                              call.callSessionId,
                              call.contactName,
                              call.disposition
                            )}
                          >
                            <Edit3 className="h-3 w-3 mr-1" />
                            Override
                          </Button>
                        )}
                        {call.dispositionAccurate !== false && overriddenCalls[call.callSessionId] && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Updated to {getDispositionLabel(overriddenCalls[call.callSessionId])}
                          </Badge>
                        )}
                        <PushToShowcaseButton
                          callSessionId={call.callSessionId}
                          contactName={call.contactName}
                          sourceLabel="Disposition Intelligence"
                          buttonProps={{ size: 'sm', variant: 'outline' }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Patterns Panel */}
          <div className="space-y-4">
            {/* Outcome Keywords & Phrases */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Outcome Keywords ({getDispositionLabel(selectedDisposition)})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {phraseInsightsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analyzing historical phrases...
                  </div>
                ) : (
                  (() => {
                    const dispositionBucket = phraseInsights?.byDisposition?.[0];
                    if (!dispositionBucket || dispositionBucket.totalCalls === 0) {
                      return <p className="text-xs text-muted-foreground">No historical phrases available for this filter.</p>;
                    }
                    return (
                      <>
                        <div className="text-xs text-muted-foreground">
                          {dispositionBucket.totalCalls} calls analyzed
                        </div>

                        <div>
                          <p className="text-xs font-medium mb-2">Top Keywords</p>
                          <div className="space-y-1">
                            {dispositionBucket.topKeywords.slice(0, 8).map((term) => (
                              <div key={term.term} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                                <span>{term.term}</span>
                                <Badge variant="outline" className="text-xs">{term.callCoveragePct}%</Badge>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-medium mb-2">Top Trigger Phrases</p>
                          <div className="space-y-1">
                            {dispositionBucket.topBigrams.slice(0, 6).map((term) => (
                              <div key={term.term} className="flex items-center justify-between text-xs p-2 rounded bg-blue-50">
                                <span className="italic">"{term.term}"</span>
                                <Badge variant="outline" className="text-xs">{term.callCoveragePct}%</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()
                )}
              </CardContent>
            </Card>

            {/* Machine vs Human detected language */}
            {phraseInsights?.byDetectionSignal?.length ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">AMD Language Signals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {phraseInsights.byDetectionSignal
                    .filter((bucket) => bucket.key === 'machine' || bucket.key === 'human')
                    .map((bucket) => (
                      <div key={bucket.key} className="rounded border p-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium capitalize">{bucket.key} detected</span>
                          <Badge variant="outline" className="text-xs">{bucket.totalCalls} calls</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {bucket.topKeywords.slice(0, 6).map((term) => (
                            <Badge key={`${bucket.key}-${term.term}`} variant="secondary" className="text-[10px]">
                              {term.term}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            ) : null}

            {/* Detected Patterns */}
            {data.patterns.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Detected Patterns</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.patterns.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                      <span className="flex-1 truncate">{p.pattern}</span>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant="outline" className="text-xs">{p.count}x</Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${p.severity === 'high' ? 'text-red-600 border-red-300' : p.severity === 'medium' ? 'text-yellow-600 border-yellow-300' : 'text-gray-600'}`}
                        >
                          {p.severity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Voicemail Patterns */}
            {data.voicemailPatterns.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Voicemail className="h-4 w-4 text-purple-500" />
                    Voicemail Phrases
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.voicemailPatterns.map((vp, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-purple-50">
                      <span className="italic text-sm">"{vp.phrase}"</span>
                      <Badge variant="outline" className="text-xs">{vp.frequency}x</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Mismatched Dispositions Detail */}
            {data.mismatchedDispositions.length > 0 && (
              <Card className="border-red-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    Disposition Mismatches ({data.mismatchedDispositions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.mismatchedDispositions.slice(0, 10).map((mm, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-red-50 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-xs text-white" style={{ backgroundColor: getDispositionColor(mm.assigned) }}>
                          {getDispositionLabel(mm.assigned)}
                        </Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="outline" className="text-xs">
                          Should be: {getDispositionLabel(mm.expected)}
                        </Badge>
                        <div className="ml-auto">
                          {!overriddenCalls[mm.callSessionId] ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs border-red-300 text-red-700 hover:bg-red-100"
                              onClick={() => openOverrideDialog(
                                mm.callSessionId,
                                `Call ${mm.callSessionId.slice(0, 8)}`,
                                mm.assigned,
                                mm.expected
                              )}
                            >
                              <Edit3 className="h-3 w-3 mr-1" />
                              Fix
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Fixed
                            </Badge>
                          )}
                        </div>
                      </div>
                      {mm.notes.length > 0 && (
                        <p className="text-muted-foreground">{mm.notes[0]}</p>
                      )}
                    </div>
                  ))}
                  {data.mismatchedDispositions.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      +{data.mismatchedDispositions.length - 10} more mismatches
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Override Disposition Dialog */}
      <Dialog open={overrideDialog.open} onOpenChange={(open) => setOverrideDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Override Disposition
            </DialogTitle>
            <DialogDescription>
              Change the disposition for <strong>{overrideDialog.contactName}</strong>.
              Current: <Badge className="text-xs text-white ml-1" style={{ backgroundColor: getDispositionColor(overrideDialog.currentDisposition) }}>
                {getDispositionLabel(overrideDialog.currentDisposition)}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Disposition</label>
              <Select value={overrideDisposition} onValueChange={setOverrideDisposition}>
                <SelectTrigger>
                  <SelectValue placeholder="Select correct disposition" />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSITION_TYPES.map(type => (
                    <SelectItem key={type} value={type} disabled={type === overrideDialog.currentDisposition}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: DISPOSITION_COLORS[type] }}
                        />
                        {DISPOSITION_LABELS[type]}
                        {type === overrideDialog.currentDisposition && (
                          <span className="text-muted-foreground text-xs ml-1">(current)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                placeholder="Why is this disposition being changed? e.g., 'Transcript shows voicemail greeting, not a live person'"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
              />
            </div>

            {overrideDialog.suggestedDisposition && overrideDialog.suggestedDisposition !== overrideDisposition && (
              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-xs">
                  AI suggests this should be <strong>{getDispositionLabel(overrideDialog.suggestedDisposition)}</strong>.{' '}
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-blue-700"
                    onClick={() => setOverrideDisposition(overrideDialog.suggestedDisposition)}
                  >
                    Apply suggestion
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverrideDialog(prev => ({ ...prev, open: false }))}
              disabled={overrideMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyOverride}
              disabled={!overrideDisposition || overrideDisposition === overrideDialog.currentDisposition || overrideMutation.isPending}
            >
              {overrideMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getScoreBadge(score: number): string {
  if (score >= 70) return 'bg-green-50 text-green-700 border-green-300';
  if (score >= 50) return 'bg-yellow-50 text-yellow-700 border-yellow-300';
  return 'bg-red-50 text-red-700 border-red-300';
}
