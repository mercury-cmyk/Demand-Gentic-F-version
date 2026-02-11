/**
 * Campaign Intelligence
 *
 * Campaign-contextualized analysis showing performance against objectives,
 * qualification criteria, talking points coverage, and account intelligence correlation.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Target,
  CheckCircle,
  XCircle,
  TrendingUp,
  Brain,
  BarChart3,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  type DispositionIntelligenceFilters,
  type CampaignAnalysisResponse,
  DISPOSITION_COLORS,
  getDispositionLabel,
  getDispositionColor,
} from './types';

interface Campaign {
  id: string;
  name: string;
}

interface CampaignIntelligenceProps {
  filters: DispositionIntelligenceFilters;
  campaigns: Campaign[];
}

export function CampaignIntelligence({ filters, campaigns }: CampaignIntelligenceProps) {
  const campaignId = filters.campaignId !== 'all' ? filters.campaignId : null;

  const { data, isLoading } = useQuery<CampaignAnalysisResponse>({
    queryKey: ['/api/disposition-intelligence/campaign-analysis', campaignId, filters.startDate, filters.endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('campaignId', campaignId!);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const res = await apiRequest('GET', `/api/disposition-intelligence/campaign-analysis?${params}`);
      return res.json();
    },
    enabled: !!campaignId,
    staleTime: 5 * 60 * 1000,
  });

  if (!campaignId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Target className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">Select a Campaign</p>
        <p className="text-sm">Use the campaign filter above to analyze a specific campaign</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Info className="h-10 w-10 mb-2 opacity-50" />
        <p>No data available for this campaign</p>
      </div>
    );
  }

  // Build disposition bar chart data
  const dispBarData = Object.entries(data.dispositionBreakdown).map(([disp, info]) => ({
    name: getDispositionLabel(disp),
    count: info.count,
    avgQuality: info.avgQuality ?? 0,
    fill: getDispositionColor(disp),
  }));

  return (
    <div className="space-y-6">
      {/* Campaign Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {data.campaign.name}
              </h2>
              {data.campaign.objective && (
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>Objective:</strong> {data.campaign.objective}
                </p>
              )}
              {data.campaign.successCriteria && (
                <p className="text-sm text-muted-foreground">
                  <strong>Success Criteria:</strong> {data.campaign.successCriteria}
                </p>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {data.performance.totalCalls} calls analyzed
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Qualified Lead Rate"
          value={`${data.performance.qualifiedLeadRate}%`}
          color={data.performance.qualifiedLeadRate > 10 ? 'text-green-600' : 'text-yellow-600'}
        />
        <MetricCard
          label="Avg Quality"
          value={data.performance.avgQualityScore != null ? `${data.performance.avgQualityScore}/100` : 'N/A'}
          color={getScoreTextColor(data.performance.avgQualityScore)}
        />
        <MetricCard
          label="Campaign Alignment"
          value={data.performance.avgCampaignAlignmentScore != null ? `${data.performance.avgCampaignAlignmentScore}/100` : 'N/A'}
          color={getScoreTextColor(data.performance.avgCampaignAlignmentScore)}
        />
        <MetricCard
          label="Talking Points"
          value={data.performance.avgTalkingPointsCoverage != null ? `${data.performance.avgTalkingPointsCoverage}/100` : 'N/A'}
          color={getScoreTextColor(data.performance.avgTalkingPointsCoverage)}
        />
        <MetricCard
          label="Flow Compliance"
          value={data.performance.avgFlowComplianceScore != null ? `${data.performance.avgFlowComplianceScore}/100` : 'N/A'}
          color={getScoreTextColor(data.performance.avgFlowComplianceScore)}
        />
        <MetricCard
          label="Met Criteria"
          value={`${data.qualificationAnalysis.metCriteriaRate}%`}
          color={data.qualificationAnalysis.metCriteriaRate > 20 ? 'text-green-600' : 'text-yellow-600'}
        />
      </div>

      {/* Qualification Analysis & Disposition Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Missing Talking Points */}
        {data.qualificationAnalysis.topMissedTalkingPoints.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Top Missed Talking Points
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.qualificationAnalysis.topMissedTalkingPoints.map((tp, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-red-50">
                  <span className="text-sm flex-1">{tp.point}</span>
                  <Badge variant="outline" className="text-xs text-red-600 border-red-300 ml-2">
                    Missed {tp.frequency}x
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Disposition Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Disposition Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {dispBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dispBarData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" angle={-30} textAnchor="end" height={60} />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="count" name="Calls">
                    {dispBarData.map((entry, index) => (
                      <rect key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No disposition data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account Intelligence Correlation */}
      {data.accountIntelligenceCorrelation && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-500" />
              Account Intelligence Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  With Intelligence
                </h4>
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-green-700">
                    {data.accountIntelligenceCorrelation.withIntelligence.count} calls
                  </p>
                  <p className="text-sm text-green-600">
                    Avg Quality: {data.accountIntelligenceCorrelation.withIntelligence.avgQuality ?? 'N/A'}/100
                  </p>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Without Intelligence
                </h4>
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-gray-700">
                    {data.accountIntelligenceCorrelation.withoutIntelligence.count} calls
                  </p>
                  <p className="text-sm text-gray-600">
                    Avg Quality: {data.accountIntelligenceCorrelation.withoutIntelligence.avgQuality ?? 'N/A'}/100
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend Over Time */}
      {data.trendOverTime.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Performance Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.trendOverTime.map(t => ({ ...t, date: t.date.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avgQuality"
                  name="Avg Quality"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="qualifiedRate"
                  name="Qualified Rate %"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="totalCalls"
                  name="Total Calls"
                  stroke="#6b7280"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl font-bold ${color || ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function getScoreTextColor(score: number | null | undefined): string {
  if (score == null) return '';
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}
