import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BarChart3, TrendingUp, TrendingDown, Minus, Zap
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ScoreHistoryEntry {
  id: string;
  opportunityId: string;
  scoreType: 'engagement' | 'fit' | 'stage_probability';
  previousValue: number | null;
  newValue: number;
  delta: number;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

interface ScoreHistoryChartProps {
  opportunityId: string;
  history: ScoreHistoryEntry[];
  isLoading: boolean;
}

const getScoreTypeLabel = (type: string) => {
  switch (type) {
    case 'engagement':
      return 'Engagement Score';
    case 'fit':
      return 'Fit Score';
    case 'stage_probability':
      return 'Stage Probability';
    default:
      return type;
  }
};

const getScoreTypeColor = (type: string) => {
  switch (type) {
    case 'engagement':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
    case 'fit':
      return 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400';
    case 'stage_probability':
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400';
  }
};

const getDeltaIndicator = (delta: number) => {
  if (delta > 0) {
    return {
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      prefix: '+',
    };
  } else if (delta < 0) {
    return {
      icon: TrendingDown,
      color: 'text-red-600 dark:text-red-400',
      prefix: '',
    };
  } else {
    return {
      icon: Minus,
      color: 'text-gray-600 dark:text-gray-400',
      prefix: '',
    };
  }
};

export function ScoreHistoryChart({ opportunityId, history, isLoading }: ScoreHistoryChartProps) {
  // Group history by date for timeline visualization
  const groupedHistory = history.reduce((acc, entry) => {
    const date = format(new Date(entry.createdAt), 'MMM d, yyyy');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, ScoreHistoryEntry[]>);

  const dates = Object.keys(groupedHistory).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Score History
        </CardTitle>
        <CardDescription>
          Timeline of engagement, fit, and probability score changes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading score history...</div>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No score history available</p>
            <p className="text-sm mt-2">Scores will be tracked as they change over time</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-6">
              {dates.map((date, dateIdx) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-shrink-0 w-24 text-sm font-medium text-muted-foreground">
                      {date}
                    </div>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Score Changes for Date */}
                  <div className="space-y-3 ml-28">
                    {groupedHistory[date].map((entry, entryIdx) => {
                      const deltaIndicator = getDeltaIndicator(entry.delta);
                      const DeltaIcon = deltaIndicator.icon;
                      const colorClass = getScoreTypeColor(entry.scoreType);

                      return (
                        <div
                          key={entry.id}
                          className="relative flex gap-4 p-4 rounded-lg border hover-elevate"
                          data-testid={`score-entry-${entry.id}`}
                        >
                          {/* Timeline Line */}
                          {dateIdx < dates.length - 1 || entryIdx < groupedHistory[date].length - 1 ? (
                            <div className="absolute left-0 top-14 bottom-0 w-px bg-border -ml-14" />
                          ) : null}

                          {/* Timeline Dot */}
                          <div className="absolute -left-14 top-6">
                            <div className={cn("w-3 h-3 rounded-full border-2 border-background", colorClass)} />
                          </div>

                          {/* Score Type Icon */}
                          <div className="flex-shrink-0">
                            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", colorClass)}>
                              <Zap className="h-5 w-5" />
                            </div>
                          </div>

                          {/* Score Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    {getScoreTypeLabel(entry.scoreType)}
                                  </Badge>
                                  <Badge 
                                    variant={entry.delta > 0 ? 'default' : entry.delta < 0 ? 'destructive' : 'secondary'} 
                                    className="text-xs"
                                  >
                                    <DeltaIcon className="h-3 w-3 mr-1" />
                                    {deltaIndicator.prefix}{entry.delta}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <span className="text-muted-foreground">
                                    {entry.previousValue !== null ? entry.previousValue : 'N/A'}
                                  </span>
                                  <span className="text-muted-foreground">→</span>
                                  <span className={cn("font-bold", deltaIndicator.color)}>
                                    {entry.newValue}
                                  </span>
                                </div>
                              </div>
                              <div className="flex-shrink-0 text-xs text-muted-foreground">
                                {format(new Date(entry.createdAt), 'h:mm a')}
                              </div>
                            </div>
                            {entry.reason && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {entry.reason}
                              </p>
                            )}
                            {entry.changedBy && (
                              <p className="text-xs text-muted-foreground">
                                Changed by: {entry.changedBy}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
