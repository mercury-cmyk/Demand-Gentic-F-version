/**
 * Coaching Recommendations
 *
 * AI-generated coaching recommendations based on call analysis.
 * User-triggered generation with configurable focus areas.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  GraduationCap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lightbulb,
  Sparkles,
  ArrowRight,
  Voicemail,
  MessageCircle,
} from 'lucide-react';
import { type DispositionIntelligenceFilters, type CoachingResponse } from './types';

interface Campaign {
  id: string;
  name: string;
}

interface CoachingRecommendationsProps {
  filters: DispositionIntelligenceFilters;
  campaigns: Campaign[];
}

const FOCUS_AREAS = [
  { id: 'opening', label: 'Opening & Greeting' },
  { id: 'objection_handling', label: 'Objection Handling' },
  { id: 'closing', label: 'Closing Technique' },
  { id: 'voicemail_detection', label: 'Voicemail Detection' },
  { id: 'interruptions', label: 'Interruptions' },
  { id: 'qualification', label: 'Qualification Flow' },
];

export function CoachingRecommendations({ filters, campaigns }: CoachingRecommendationsProps) {
  const { toast } = useToast();
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [result, setResult] = useState<CoachingResponse | null>(null);

  const coachingMutation = useMutation({
    mutationFn: async () => {
      const body: any = { maxCalls: 250 };
      if (filters.campaignId !== 'all') body.campaignId = filters.campaignId;
      if (filters.startDate) body.startDate = filters.startDate;
      if (filters.endDate) body.endDate = filters.endDate;
      if (focusAreas.length > 0) body.focusAreas = focusAreas;
      const res = await apiRequest('POST', '/api/disposition-intelligence/generate-coaching', body);
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: 'Coaching Generated', description: `Analyzed ${data.metadata?.callsAnalyzed || 0} calls` });
    },
    onError: (error: any) => {
      toast({ title: 'Generation Failed', description: error.message || 'Could not generate coaching', variant: 'destructive' });
    },
  });

  const toggleFocusArea = (id: string) => {
    setFocusAreas(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Coaching Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Focus Areas (optional)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {FOCUS_AREAS.map(area => (
                <label
                  key={area.id}
                  className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <Checkbox
                    checked={focusAreas.includes(area.id)}
                    onCheckedChange={() => toggleFocusArea(area.id)}
                  />
                  <span className="text-sm">{area.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => coachingMutation.mutate()}
              disabled={coachingMutation.isPending}
              className="gap-2"
            >
              {coachingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GraduationCap className="h-4 w-4" />
              )}
              {coachingMutation.isPending ? 'Analyzing Calls...' : 'Generate Coaching'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Analyzes up to 250 recent calls with transcripts
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <ScrollArea className="h-[calc(100vh-400px)]">
          <div className="space-y-6 pr-3">
            {/* Metadata */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>{result.metadata.callsAnalyzed} calls analyzed</span>
              <span>·</span>
              <span>Generated {new Date(result.metadata.generatedAt).toLocaleString()}</span>
            </div>

            {/* Top Issues */}
            {result.topIssues.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Top Issues ({result.topIssues.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.topIssues.map((issue, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/30 border">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-sm">{issue.issue}</h4>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              issue.impact === 'high' ? 'text-red-600 border-red-300' :
                              issue.impact === 'medium' ? 'text-yellow-600 border-yellow-300' :
                              'text-gray-600'
                            }`}
                          >
                            {issue.impact} impact
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {issue.frequency}x in {issue.affectedCalls} calls
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{issue.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-blue-500" />
                    Recommendations ({result.recommendations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="p-3 rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">{rec.area}</Badge>
                        <Badge
                          className={`text-xs ${
                            rec.priority === 'high' ? 'bg-red-500 text-white' :
                            rec.priority === 'medium' ? 'bg-yellow-500 text-black' :
                            'bg-gray-400 text-white'
                          }`}
                        >
                          {rec.priority} priority
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-2 rounded bg-red-50 border border-red-200">
                          <p className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            Current Behavior
                          </p>
                          <p className="text-xs text-red-600">{rec.currentBehavior}</p>
                        </div>
                        <div className="p-2 rounded bg-green-50 border border-green-200">
                          <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Suggested Improvement
                          </p>
                          <p className="text-xs text-green-600">{rec.suggestedImprovement}</p>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        <strong>Expected Impact:</strong> {rec.expectedImpact}
                      </p>

                      {/* Before/After Examples */}
                      {rec.examples.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Examples:</p>
                          {rec.examples.map((ex, j) => (
                            <div key={j} className="flex items-start gap-2 text-xs">
                              <div className="flex-1 p-2 rounded bg-red-50/50 border border-red-100">
                                <span className="text-red-500 font-medium">Before: </span>
                                <span className="italic">"{ex.before}"</span>
                              </div>
                              <ArrowRight className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
                              <div className="flex-1 p-2 rounded bg-green-50/50 border border-green-100">
                                <span className="text-green-500 font-medium">After: </span>
                                <span className="italic">"{ex.after}"</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Prompt Improvements */}
            {result.promptImprovements.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-purple-500" />
                    Prompt Improvements ({result.promptImprovements.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.promptImprovements.map((pi, i) => (
                    <div key={i} className="p-3 rounded-lg border space-y-2">
                      <Badge variant="outline" className="text-xs">{pi.section}</Badge>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-muted/50 text-xs font-mono">
                          <p className="text-[10px] uppercase text-muted-foreground mb-1">Current</p>
                          <p className="text-red-600 line-through">{pi.currentPromptSnippet}</p>
                        </div>
                        <div className="p-2 rounded bg-green-50 text-xs font-mono">
                          <p className="text-[10px] uppercase text-muted-foreground mb-1">Suggested</p>
                          <p className="text-green-600">{pi.suggestedEdit}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{pi.rationale}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Natural Language Patterns */}
            {(result.naturalLanguagePatterns.adopt.length > 0 || result.naturalLanguagePatterns.avoid.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Adopt */}
                {result.naturalLanguagePatterns.adopt.length > 0 && (
                  <Card className="border-green-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Patterns to Adopt
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {result.naturalLanguagePatterns.adopt.map((p, i) => (
                        <div key={i} className="p-2 rounded bg-green-50 text-xs space-y-1">
                          <p className="font-medium text-green-700">"{p.pattern}"</p>
                          <p className="text-green-600">{p.reason}</p>
                          <p className="text-muted-foreground italic">Example: {p.example}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Avoid */}
                {result.naturalLanguagePatterns.avoid.length > 0 && (
                  <Card className="border-red-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Patterns to Avoid
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {result.naturalLanguagePatterns.avoid.map((p, i) => (
                        <div key={i} className="p-2 rounded bg-red-50 text-xs space-y-1">
                          <p className="font-medium text-red-700">"{p.pattern}"</p>
                          <p className="text-red-600">{p.reason}</p>
                          <p className="text-muted-foreground italic">Use instead: "{p.alternative}"</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Voicemail Optimization */}
            {result.voicemailOptimization && (
              <Card className="border-purple-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-purple-700">
                    <Voicemail className="h-4 w-4" />
                    Voicemail Detection Optimization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-purple-50 text-center">
                      <p className="text-xs text-muted-foreground">Avg Detection Time</p>
                      <p className="text-xl font-bold text-purple-700">{result.voicemailOptimization.avgDetectionTime}s</p>
                    </div>
                  </div>

                  {result.voicemailOptimization.missedVoicemailPhrases.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Missed Phrases to Add</p>
                      <div className="flex flex-wrap gap-1">
                        {result.voicemailOptimization.missedVoicemailPhrases.map((phrase, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-purple-50 text-purple-700">
                            "{phrase}"
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.voicemailOptimization.recommendations.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                      <ul className="space-y-1">
                        {result.voicemailOptimization.recommendations.map((rec, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                            <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-purple-500" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {result.topIssues.length === 0 && result.recommendations.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                <p className="text-sm">No issues found. Agent performance looks good!</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Initial Empty State */}
      {!result && !coachingMutation.isPending && (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <GraduationCap className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-lg font-medium">Generate AI Coaching</p>
          <p className="text-sm">Click the button above to analyze recent calls and get coaching recommendations</p>
        </div>
      )}
    </div>
  );
}
