/**
 * Agent Performance Pipeline
 *
 * Visual pipeline showing agent call flow analysis:
 * Opening → Engagement → Objection Handling → Closing
 * Plus flow compliance and best vs worst call comparison.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  MessageCircle,
  Users,
  Shield,
  Flag,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { type DispositionIntelligenceFilters, type AgentPerformanceResponse, getDispositionLabel } from './types';

interface AgentPerformancePipelineProps {
  filters: DispositionIntelligenceFilters;
}

export function AgentPerformancePipeline({ filters }: AgentPerformancePipelineProps) {
  const { data, isLoading } = useQuery<AgentPerformanceResponse>({
    queryKey: ['/api/disposition-intelligence/agent-performance', filters.campaignId, filters.startDate, filters.endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const res = await apiRequest('GET', `/api/disposition-intelligence/agent-performance?${params}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.totalAnalyzed === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <TrendingUp className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">No analyzed calls yet</p>
        <p className="text-sm">Agent performance data will appear after calls are analyzed</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Total Analyzed */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span><strong>{data.totalAnalyzed}</strong> calls analyzed</span>
      </div>

      {/* Pipeline Visualization */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <PipelineStage
          title="Opening"
          icon={<MessageCircle className="h-4 w-4" />}
          score={data.openingAnalysis.avgEngagementScore}
          issues={data.openingAnalysis.commonOpeningIssues}
          color="blue"
        />
        <PipelineStage
          title="Engagement"
          icon={<Users className="h-4 w-4" />}
          score={data.engagementMetrics.avgEngagementScore}
          issues={data.engagementMetrics.interruptionPatterns.map(p => ({ issue: p.type, frequency: p.count }))}
          color="cyan"
          extraScores={[
            { label: 'Clarity', score: data.engagementMetrics.avgClarityScore },
            { label: 'Empathy', score: data.engagementMetrics.avgEmpathyScore },
          ]}
        />
        <PipelineStage
          title="Objection Handling"
          icon={<Shield className="h-4 w-4" />}
          score={data.objectionHandling.avgScore}
          issues={data.objectionHandling.commonIssues}
          color="amber"
        />
        <PipelineStage
          title="Closing"
          icon={<Flag className="h-4 w-4" />}
          score={data.closingAnalysis.avgScore}
          issues={data.closingAnalysis.closingIssues}
          color="green"
        />
      </div>

      {/* Arrow connectors (visible on md+) */}
      <div className="hidden md:flex items-center justify-around -mt-3 px-16">
        {[1, 2, 3].map(i => (
          <ArrowRight key={i} className="h-5 w-5 text-muted-foreground/30" />
        ))}
      </div>

      {/* Flow Compliance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Flow Compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Average Score</span>
                <span className={`text-sm font-bold ${getScoreTextColor(data.flowCompliance.avgScore)}`}>
                  {data.flowCompliance.avgScore ?? 'N/A'}/100
                </span>
              </div>
              <Progress
                value={data.flowCompliance.avgScore || 0}
                className="h-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Missed Steps */}
            {data.flowCompliance.topMissedSteps.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-500" />
                  Top Missed Steps
                </h4>
                <div className="space-y-1">
                  {data.flowCompliance.topMissedSteps.map((ms, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-red-50">
                      <span className="truncate flex-1">{ms.step}</span>
                      <Badge variant="outline" className="text-xs ml-2">{ms.frequency}x</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flow Deviations */}
            {data.flowCompliance.topDeviations.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 text-yellow-500" />
                  Common Deviations
                </h4>
                <div className="space-y-1">
                  {data.flowCompliance.topDeviations.map((dv, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-yellow-50">
                      <span className="truncate flex-1">{dv.deviation}</span>
                      <Badge variant="outline" className="text-xs ml-2">{dv.frequency}x</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Best vs Worst */}
      {(data.bestVsWorst.best.length > 0 || data.bestVsWorst.worst.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Best Calls */}
          <Card className="border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-700">
                <TrendingUp className="h-4 w-4" />
                Best Performing Calls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.bestVsWorst.best.map((call, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-green-50">
                  <div>
                    <p className="text-sm font-medium">{call.contactName}</p>
                    <p className="text-xs text-muted-foreground">
                      {call.disposition ? getDispositionLabel(call.disposition) : 'N/A'}
                      {call.durationSeconds ? ` · ${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}` : ''}
                    </p>
                  </div>
                  <Badge className="bg-green-500 text-white">{call.overallScore}/100</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Worst Calls */}
          <Card className="border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700">
                <TrendingDown className="h-4 w-4" />
                Lowest Performing Calls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.bestVsWorst.worst.map((call, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-red-50">
                  <div>
                    <p className="text-sm font-medium">{call.contactName}</p>
                    <p className="text-xs text-muted-foreground">
                      {call.disposition ? getDispositionLabel(call.disposition) : 'N/A'}
                      {call.durationSeconds ? ` · ${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}` : ''}
                    </p>
                  </div>
                  <Badge className="bg-red-500 text-white">{call.overallScore}/100</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================
// Pipeline Stage Component
// ============================================

function PipelineStage({
  title,
  icon,
  score,
  issues,
  color,
  extraScores,
}: {
  title: string;
  icon: React.ReactNode;
  score: number | null;
  issues: Array<{ issue: string; frequency: number }>;
  color: string;
  extraScores?: Array<{ label: string; score: number | null }>;
}) {
  const borderColor = {
    blue: 'border-blue-200',
    cyan: 'border-cyan-200',
    amber: 'border-amber-200',
    green: 'border-green-200',
  }[color] || 'border-gray-200';

  const headerBg = {
    blue: 'bg-blue-50',
    cyan: 'bg-cyan-50',
    amber: 'bg-amber-50',
    green: 'bg-green-50',
  }[color] || 'bg-gray-50';

  return (
    <Card className={`${borderColor}`}>
      <CardHeader className={`pb-2 pt-3 px-3 ${headerBg} rounded-t-lg`}>
        <CardTitle className="text-xs font-medium flex items-center gap-1.5">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        <div className="text-center">
          <span className={`text-2xl font-bold ${getScoreTextColor(score)}`}>
            {score ?? 'N/A'}
          </span>
          {score != null && <span className="text-xs text-muted-foreground">/100</span>}
        </div>

        {extraScores && (
          <div className="grid grid-cols-2 gap-1">
            {extraScores.map(es => (
              <div key={es.label} className="text-center">
                <p className="text-xs text-muted-foreground">{es.label}</p>
                <p className={`text-sm font-medium ${getScoreTextColor(es.score)}`}>
                  {es.score ?? 'N/A'}
                </p>
              </div>
            ))}
          </div>
        )}

        {issues.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {issues.slice(0, 3).map((issue, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1 text-muted-foreground">{issue.issue}</span>
                  <Badge variant="outline" className="text-[10px] ml-1">{issue.frequency}</Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function getScoreTextColor(score: number | null | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}
