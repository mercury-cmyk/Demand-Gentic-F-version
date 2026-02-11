/**
 * Disposition Deep Dive
 *
 * Filterable call list by disposition type with pattern detection,
 * voicemail phrase analysis, and mismatched disposition alerts.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  AlertTriangle,
  Phone,
  Clock,
  ChevronLeft,
  ChevronRight,
  Voicemail,
  ShieldAlert,
} from 'lucide-react';
import {
  type DispositionIntelligenceFilters,
  type DeepDiveResponse,
  DISPOSITION_TYPES,
  DISPOSITION_COLORS,
  DISPOSITION_LABELS,
  getDispositionLabel,
  getDispositionColor,
  type DispositionType,
} from './types';

interface DispositionDeepDiveProps {
  filters: DispositionIntelligenceFilters;
}

export function DispositionDeepDive({ filters }: DispositionDeepDiveProps) {
  const [selectedDisposition, setSelectedDisposition] = useState<string>('voicemail');
  const [page, setPage] = useState(1);

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
                <AlertDescription>
                  <strong>{data.mismatchedDispositions.length} calls</strong> have mismatched dispositions
                  (assigned doesn't match expected). Review these for agent calibration.
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-[600px]">
              <div className="space-y-2 pr-3">
                {data.calls.map(call => (
                  <Card key={call.callSessionId} className={`${call.dispositionAccurate === false ? 'border-red-300' : ''}`}>
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
                        <div className="flex items-center gap-1 text-xs text-red-600 mb-2">
                          <AlertTriangle className="h-3 w-3" />
                          Expected: <strong>{getDispositionLabel(call.expectedDisposition || '')}</strong>
                        </div>
                      )}

                      {/* Transcript Snippet */}
                      {call.transcriptSnippet && (
                        <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded-md line-clamp-2 italic">
                          "{call.transcriptSnippet}..."
                        </p>
                      )}
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
                    Disposition Mismatches
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.mismatchedDispositions.slice(0, 5).map((mm, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-red-50 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className="text-xs text-white" style={{ backgroundColor: getDispositionColor(mm.assigned) }}>
                          {getDispositionLabel(mm.assigned)}
                        </Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge variant="outline" className="text-xs">
                          Should be: {getDispositionLabel(mm.expected)}
                        </Badge>
                      </div>
                      {mm.notes.length > 0 && (
                        <p className="text-muted-foreground">{mm.notes[0]}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getScoreBadge(score: number): string {
  if (score >= 70) return 'bg-green-50 text-green-700 border-green-300';
  if (score >= 50) return 'bg-yellow-50 text-yellow-700 border-yellow-300';
  return 'bg-red-50 text-red-700 border-red-300';
}
