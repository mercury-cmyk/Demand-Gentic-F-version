/**
 * Quality Metrics Panel Component
 *
 * Displays quality analysis including overall score, dimension scores,
 * sentiment, issues, recommendations, and feedback form for improving AI.
 */

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Lightbulb,
  MessageSquare,
  Target,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Send,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getQualityScoreColor,
  SENTIMENT_COLORS,
  type QualityDimensions,
  type QualityIssue,
  type QualityRecommendation,
  type DispositionReview,
  type CampaignAlignment,
  type FlowCompliance,
} from './types';

interface QualityMetricsPanelProps {
  analyzed: boolean;
  overallScore?: number;
  dimensions?: QualityDimensions;
  sentiment?: string;
  engagementLevel?: string;
  identityConfirmed?: boolean;
  qualificationMet?: boolean;
  issues?: QualityIssue[];
  recommendations?: QualityRecommendation[];
  dispositionReview?: DispositionReview;
  campaignAlignment?: CampaignAlignment;
  flowCompliance?: FlowCompliance;
  nextBestActions?: string[];
  className?: string;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
}

export function QualityMetricsPanel({
  analyzed,
  overallScore,
  dimensions,
  sentiment,
  engagementLevel,
  identityConfirmed,
  qualificationMet,
  issues,
  recommendations,
  dispositionReview,
  campaignAlignment,
  flowCompliance,
  nextBestActions,
  className,
  onAnalyze,
  isAnalyzing,
}: QualityMetricsPanelProps) {
  if (!analyzed) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 px-4', className)}>
        <BarChart3 className="h-12 w-12 mb-4 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground text-center mb-4">
          No quality analysis available for this call
        </p>
        {onAnalyze && (
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Sparkles className="h-4 w-4 animate-pulse" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Analyze Call Quality
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="space-y-4 p-4">
        {/* Overall Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Overall Quality Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'text-4xl font-bold rounded-full w-20 h-20 flex items-center justify-center',
                  getQualityScoreColor(overallScore)
                )}
              >
                {overallScore ?? '--'}
              </div>
              <div className="flex-1 space-y-2">
                {sentiment && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sentiment:</span>
                    <Badge className={cn('capitalize', SENTIMENT_COLORS[sentiment] || 'bg-gray-500')}>
                      {sentiment}
                    </Badge>
                  </div>
                )}
                {engagementLevel && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Engagement:</span>
                    <Badge variant="outline" className="capitalize">
                      {engagementLevel}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Quick indicators */}
            <div className="flex flex-wrap gap-2 mt-3">
              {identityConfirmed !== undefined && (
                <Badge variant={identityConfirmed ? 'default' : 'secondary'} className="text-xs">
                  {identityConfirmed ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  Identity {identityConfirmed ? 'Confirmed' : 'Not Confirmed'}
                </Badge>
              )}
              {qualificationMet !== undefined && (
                <Badge variant={qualificationMet ? 'default' : 'secondary'} className="text-xs">
                  {qualificationMet ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                  {qualificationMet ? 'Qualified' : 'Not Qualified'}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quality Dimensions */}
        {dimensions && Object.keys(dimensions).length > 0 && (
          <Collapsible defaultOpen>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Quality Dimensions
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  {Object.entries(dimensions).map(([key, value]) => (
                    <DimensionBar
                      key={key}
                      label={formatDimensionLabel(key)}
                      value={value}
                    />
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Disposition Review */}
        {dispositionReview && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Disposition Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Assigned:</span>
                <Badge variant="outline">{dispositionReview.assigned || 'None'}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expected:</span>
                <Badge variant="outline">{dispositionReview.expected || 'N/A'}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Accuracy:</span>
                <Badge variant={dispositionReview.accurate ? 'default' : 'destructive'}>
                  {dispositionReview.accurate ? 'Accurate' : 'Inaccurate'}
                </Badge>
              </div>
              {dispositionReview.notes && dispositionReview.notes.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
                  {dispositionReview.notes.map((note, i) => (
                    <p key={i}>{note}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Issues */}
        {issues && issues.length > 0 && (
          <Collapsible defaultOpen>
            <Card className="border-yellow-500/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Issues ({issues.length})
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  {issues.map((issue, index) => (
                    <IssueCard key={index} issue={issue} />
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <Collapsible defaultOpen>
            <Card className="border-green-500/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Recommendations ({recommendations.length})
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  {recommendations.map((rec, index) => (
                    <RecommendationCard key={index} recommendation={rec} />
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Next Best Actions */}
        {nextBestActions && nextBestActions.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-blue-500" />
                Next Best Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {nextBestActions.map((action, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <span className="text-primary font-medium">{index + 1}.</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Campaign Alignment */}
        {campaignAlignment && campaignAlignment.score !== undefined && (
          <Collapsible>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Campaign Alignment
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  <DimensionBar label="Overall Alignment" value={campaignAlignment.score} />
                  {campaignAlignment.contextUsage !== undefined && (
                    <DimensionBar label="Context Usage" value={campaignAlignment.contextUsage} />
                  )}
                  {campaignAlignment.talkingPointsCoverage !== undefined && (
                    <DimensionBar label="Talking Points" value={campaignAlignment.talkingPointsCoverage} />
                  )}
                  {campaignAlignment.missedTalkingPoints && campaignAlignment.missedTalkingPoints.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-2">
                      <p className="font-medium mb-1">Missed Talking Points:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {campaignAlignment.missedTalkingPoints.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Flow Compliance */}
        {flowCompliance && flowCompliance.score !== undefined && (
          <Collapsible>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Flow Compliance
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  <DimensionBar label="Compliance Score" value={flowCompliance.score} />
                  {flowCompliance.missedSteps && flowCompliance.missedSteps.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium mb-1">Missed Steps:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {flowCompliance.missedSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </div>
    </ScrollArea>
  );
}

// Helper Components

function DimensionBar({ label, value }: { label: string; value?: number }) {
  const score = value ?? 0;
  const color =
    score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}</span>
      </div>
      <Progress value={score} className={cn('h-2', `[&>div]:${color}`)} />
    </div>
  );
}

function IssueCard({ issue }: { issue: QualityIssue }) {
  const severityColors = {
    high: 'bg-red-500',
    medium: 'bg-yellow-500',
    low: 'bg-gray-500',
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Badge className={cn('text-xs', severityColors[issue.severity])}>
          {issue.severity}
        </Badge>
        <span className="text-sm font-medium">{issue.type}</span>
      </div>
      <p className="text-sm text-muted-foreground">{issue.description}</p>
      {issue.recommendation && (
        <p className="text-xs text-blue-600 dark:text-blue-400">
          <span className="font-medium">Suggestion: </span>
          {issue.recommendation}
        </p>
      )}
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: QualityRecommendation }) {
  return (
    <div className="border border-green-500/30 rounded-lg p-3 space-y-2">
      <Badge variant="outline" className="text-xs">
        {recommendation.category}
      </Badge>
      <p className="text-sm">{recommendation.suggestedChange}</p>
      {recommendation.expectedImpact && (
        <p className="text-xs text-green-600 dark:text-green-400">
          <span className="font-medium">Expected Impact: </span>
          {recommendation.expectedImpact}
        </p>
      )}
    </div>
  );
}

function formatDimensionLabel(key: string): string {
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

export default QualityMetricsPanel;
