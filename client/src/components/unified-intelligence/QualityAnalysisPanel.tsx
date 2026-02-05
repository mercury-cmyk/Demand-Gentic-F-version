/**
 * Quality Analysis Panel Component
 *
 * Displays conversation quality analysis with score, subscores,
 * and actionable recommendations.
 *
 * This reuses the quality analysis pattern from the existing
 * QualityMetricsPanel but with the unified data model.
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Target,
  TrendingUp,
  ChevronDown,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedQualityAnalysis, QualityRecommendation } from './types';
import { getQualityScoreColor } from './types';

interface QualityAnalysisPanelProps {
  analysis: UnifiedQualityAnalysis;
  className?: string;
}

export function QualityAnalysisPanel({
  analysis,
  className,
}: QualityAnalysisPanelProps) {
  const hasSubscores = Object.keys(analysis.subscores).length > 0;
  const hasRecommendations = analysis.recommendations.length > 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overall Score Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Quality Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* Score Circle */}
            <div
              className={cn(
                'text-3xl font-bold rounded-full w-16 h-16 flex items-center justify-center',
                getQualityScoreColor(analysis.score)
              )}
            >
              {analysis.score ?? '--'}
            </div>

            {/* Sentiment & Engagement */}
            <div className="flex-1 space-y-2">
              {analysis.sentiment && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sentiment:</span>
                  <Badge
                    className={cn(
                      'capitalize',
                      analysis.sentiment === 'positive' ? 'bg-green-500' :
                      analysis.sentiment === 'negative' ? 'bg-red-500' :
                      'bg-gray-500'
                    )}
                  >
                    {analysis.sentiment}
                  </Badge>
                </div>
              )}
              {analysis.engagementLevel && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Engagement:</span>
                  <Badge variant="outline" className="capitalize">
                    {analysis.engagementLevel}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscores */}
      {hasSubscores && (
        <Collapsible defaultOpen>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="pb-2 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/50 rounded-t-lg">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Quality Dimensions
                </CardTitle>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {Object.entries(analysis.subscores).map(([key, value]) => (
                    <SubscoreItem key={key} name={key} value={value} />
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Recommendations */}
      {hasRecommendations && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-700">
              <Lightbulb className="h-4 w-4" />
              Recommendations ({analysis.recommendations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analysis.recommendations.map((rec, idx) => (
                <RecommendationItem key={idx} recommendation={rec} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function SubscoreItem({ name, value }: { name: string; value: number | undefined }) {
  const formattedName = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());

  const score = value ?? 0;
  const color = score >= 70 ? 'bg-green-500' :
                score >= 50 ? 'bg-yellow-500' :
                'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{formattedName}</span>
        <span className="font-medium">{score}/100</span>
      </div>
      {/* Custom progress bar with dynamic color */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary/50">
        <div 
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function RecommendationItem({ recommendation }: { recommendation: QualityRecommendation }) {
  const priorityColors: Record<string, string> = {
    high: 'border-red-300 bg-red-50 text-red-700',
    medium: 'border-yellow-300 bg-yellow-50 text-yellow-700',
    low: 'border-gray-300 bg-gray-50 text-gray-700',
  };

  return (
    <div className="bg-white rounded-lg p-3 border border-green-200">
      <div className="flex items-start gap-2">
        {recommendation.category && (
          <Badge variant="outline" className="text-xs shrink-0">
            {recommendation.category}
          </Badge>
        )}
        {recommendation.priority && (
          <Badge
            variant="outline"
            className={cn('text-xs shrink-0', priorityColors[recommendation.priority])}
          >
            {recommendation.priority}
          </Badge>
        )}
      </div>
      <p className="text-sm mt-2">
        {recommendation.suggestedChange || recommendation.text}
      </p>
      {recommendation.impact && (
        <p className="text-xs text-green-700 mt-1">
          <strong>Impact:</strong> {recommendation.impact}
        </p>
      )}
    </div>
  );
}
