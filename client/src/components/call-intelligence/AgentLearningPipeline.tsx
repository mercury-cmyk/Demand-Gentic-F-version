import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Info, CheckCircle2, TrendingUp, AlertCircle } from 'lucide-react';
import { QualityIssue, QualityRecommendation } from './types';
import { cn } from '@/lib/utils';

interface AgentLearningPipelineProps {
  issues?: QualityIssue[];
  recommendations?: QualityRecommendation[];
  className?: string;
}

export function AgentLearningPipeline({
  issues = [],
  recommendations = [],
  className,
}: AgentLearningPipelineProps) {
  const highPriorityIssues = issues.filter((i) => i.severity === 'high');
  const mediumPriorityIssues = issues.filter((i) => i.severity === 'medium');
  const lowPriorityIssues = issues.filter((i) => i.severity === 'low');

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
           <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-500" />
            Agent Learning Pipeline
          </h3>
          <p className="text-sm text-muted-foreground">
            Actionable insights and coaching moments derived from this conversation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* High Priority - Critical Coaching */}
        <Card className="border-red-200 dark:border-red-900 bg-red-50/10 dark:bg-red-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              Critical Issues
              <Badge variant="secondary" className="ml-auto bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                {highPriorityIssues.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] pr-4">
              {highPriorityIssues.length > 0 ? (
                <div className="space-y-3">
                  {highPriorityIssues.map((issue, idx) => (
                    <div key={idx} className="bg-background/80 p-3 rounded-md border border-red-100 dark:border-red-900/50 shadow-sm">
                      <p className="font-medium text-sm text-red-700 dark:text-red-400 mb-1">{issue.type}</p>
                      <p className="text-xs text-muted-foreground">{issue.description}</p>
                      {issue.recommendation && (
                        <div className="mt-2 pt-2 border-t border-red-100 dark:border-red-900/30">
                          <p className="text-xs font-medium text-red-600 dark:text-red-400">Coach: {issue.recommendation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                   <CheckCircle2 className="h-8 w-8 text-green-500 mb-2 opacity-50" />
                   <p className="text-sm">No critical issues found</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Medium Priority - Improvements */}
        <Card className="border-orange-200 dark:border-orange-900 bg-orange-50/10 dark:bg-orange-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4" />
              Improvements
              <Badge variant="secondary" className="ml-auto bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">
                {mediumPriorityIssues.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] pr-4">
            {mediumPriorityIssues.length > 0 ? (
                <div className="space-y-3">
                  {mediumPriorityIssues.map((issue, idx) => (
                    <div key={idx} className="bg-background/80 p-3 rounded-md border border-orange-100 dark:border-orange-900/50 shadow-sm">
                      <p className="font-medium text-sm text-orange-700 dark:text-orange-400 mb-1">{issue.type}</p>
                      <p className="text-xs text-muted-foreground">{issue.description}</p>
                      {issue.recommendation && (
                         <div className="mt-2 pt-2 border-t border-orange-100 dark:border-orange-900/30">
                          <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Tip: {issue.recommendation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                   <p className="text-sm">No improvement areas identified</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Low Priority / Recommendations - Fine Tuning */}
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/10 dark:bg-blue-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Info className="h-4 w-4" />
              Refinement & Tips
              <Badge variant="secondary" className="ml-auto bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                {lowPriorityIssues.length + recommendations.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] pr-4">
             {(lowPriorityIssues.length > 0 || recommendations.length > 0) ? (
                <div className="space-y-3">
                  {lowPriorityIssues.map((issue, idx) => (
                    <div key={`issue-${idx}`} className="bg-background/80 p-3 rounded-md border border-blue-100 dark:border-blue-900/50 shadow-sm">
                      <p className="font-medium text-sm text-blue-700 dark:text-blue-400 mb-1">{issue.type}</p>
                      <p className="text-xs text-muted-foreground">{issue.description}</p>
                    </div>
                  ))}
                   {recommendations.map((rec, idx) => (
                    <div key={`rec-${idx}`} className="bg-background/80 p-3 rounded-md border border-green-100 dark:border-green-900/50 shadow-sm">
                      <p className="font-medium text-sm text-green-700 dark:text-green-400 mb-1 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> {rec.category}
                      </p>
                      <p className="text-xs text-muted-foreground">{rec.suggestedChange}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                   <p className="text-sm">No refinement needed</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
