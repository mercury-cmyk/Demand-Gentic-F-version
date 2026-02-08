/**
 * Top Challenges Panel Component
 *
 * Displays aggregated top-priority challenges across all conversations.
 * Sorted by severity (high → medium → low) then by frequency.
 * Shows actionable improvement suggestions.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, Lightbulb, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TopChallenge } from './types';
import { getSeverityColor } from './types';

interface TopChallengesPanelProps {
  challenges: TopChallenge[];
  totalIssues: number;
  className?: string;
}

export function TopChallengesPanel({
  challenges,
  totalIssues,
  className,
}: TopChallengesPanelProps) {
  if (!challenges || challenges.length === 0) {
    return null;
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-orange-500" />
          Top Challenges ({totalIssues} total issues across all calls)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {challenges.map((challenge, idx) => (
          <ChallengeItem key={idx} challenge={challenge} rank={idx + 1} />
        ))}
      </CardContent>
    </Card>
  );
}

function ChallengeItem({ challenge, rank }: { challenge: TopChallenge; rank: number }) {
  const uniqueSuggestions = [...new Set(challenge.suggestions)].slice(0, 2);

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-muted-foreground w-5">#{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn('text-xs', getSeverityColor(challenge.severity))}
            >
              {challenge.severity}
            </Badge>
            <span className="font-medium text-sm">
              {formatChallengeType(challenge.type)}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
              {challenge.count}x
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{challenge.description}</p>
        </div>
      </div>

      {uniqueSuggestions.length > 0 && (
        <div className="ml-5 space-y-1">
          {uniqueSuggestions.map((suggestion, i) => (
            <div key={i} className="text-xs text-green-700 flex items-start gap-1.5 bg-green-50 p-2 rounded">
              <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{suggestion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatChallengeType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}
