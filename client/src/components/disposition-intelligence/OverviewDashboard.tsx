/**
 * Overview Dashboard
 *
 * High-level disposition distribution, trends over time, campaign comparison.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, Clock, TrendingUp, CheckCircle, BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import {
  type DispositionIntelligenceFilters,
  type OverviewResponse,
  DISPOSITION_TYPES,
  DISPOSITION_COLORS,
  DISPOSITION_LABELS,
  getDispositionLabel,
  getDispositionColor,
} from './types';

interface OverviewDashboardProps {
  filters: DispositionIntelligenceFilters;
}

function buildQueryParams(filters: DispositionIntelligenceFilters): string {
  const params = new URLSearchParams();
  if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  return params.toString();
}

export function OverviewDashboard({ filters }: OverviewDashboardProps) {
  const { data, isLoading } = useQuery<OverviewResponse>({
    queryKey: ['/api/disposition-intelligence/overview', filters.campaignId, filters.startDate, filters.endDate],
    queryFn: async () => {
      const qs = buildQueryParams(filters);
      const res = await apiRequest('GET', `/api/disposition-intelligence/overview?${qs}`);
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

  if (!data || data.totals.totalCalls === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">No disposition data yet</p>
        <p className="text-sm">Make some calls to see disposition analytics here</p>
      </div>
    );
  }

  const pieData = data.distribution.map(d => ({
    name: getDispositionLabel(d.disposition),
    value: d.count,
    fill: getDispositionColor(d.disposition),
  }));

  // Line chart data
  const lineData = data.timeSeries.map(ts => ({
    date: ts.date.slice(5), // MM-DD
    ...ts.dispositions,
  }));

  // Campaign bar chart data
  const barData = data.campaignComparison.map(c => ({
    name: c.campaignName.length > 20 ? c.campaignName.slice(0, 20) + '...' : c.campaignName,
    ...c.dispositions,
    total: c.totalCalls,
  }));

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          icon={<Phone className="h-4 w-4" />}
          label="Total Calls"
          value={data.totals.totalCalls.toLocaleString()}
        />
        <MetricCard
          icon={<Clock className="h-4 w-4" />}
          label="Avg Duration"
          value={formatDuration(data.totals.avgCallDuration)}
        />
        <MetricCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Conversion Rate"
          value={`${data.totals.overallConversionRate}%`}
          color={data.totals.overallConversionRate > 10 ? 'text-green-600' : 'text-yellow-600'}
        />
        <MetricCard
          icon={<CheckCircle className="h-4 w-4" />}
          label="Disposition Accuracy"
          value={data.totals.dispositionAccuracyRate > 0 ? `${data.totals.dispositionAccuracyRate}%` : 'N/A'}
          color={data.totals.dispositionAccuracyRate >= 80 ? 'text-green-600' : data.totals.dispositionAccuracyRate >= 60 ? 'text-yellow-600' : 'text-red-600'}
        />
        <MetricCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Avg Quality"
          value={data.totals.avgQualityScore != null ? `${data.totals.avgQualityScore}/100` : 'N/A'}
          color={getScoreColor(data.totals.avgQualityScore)}
        />
        <MetricCard
          icon={<Phone className="h-4 w-4" />}
          label="Campaigns"
          value={data.campaignComparison.length.toString()}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Disposition Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Disposition Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, 'Calls']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Disposition Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Disposition Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.distribution
                .sort((a, b) => b.count - a.count)
                .map(d => (
                  <div key={d.disposition} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getDispositionColor(d.disposition) }}
                      />
                      <span className="text-sm font-medium">{getDispositionLabel(d.disposition)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{d.count} calls</span>
                      <Badge variant="outline" className="text-xs">{d.percentage}%</Badge>
                      <span className="text-muted-foreground text-xs">{formatDuration(d.avgDurationSeconds)}</span>
                      {d.avgQualityScore != null && (
                        <Badge className={`text-xs ${getScoreBadgeClass(d.avgQualityScore)}`}>
                          {d.avgQualityScore}/100
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Over Time */}
      {lineData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Disposition Trend Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                {DISPOSITION_TYPES.map(type => {
                  const hasData = lineData.some(d => (d as any)[type] > 0);
                  if (!hasData) return null;
                  return (
                    <Line
                      key={type}
                      type="monotone"
                      dataKey={type}
                      name={DISPOSITION_LABELS[type]}
                      stroke={DISPOSITION_COLORS[type]}
                      strokeWidth={2}
                      dot={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Campaign Comparison */}
      {barData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Campaign Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 50)}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="name" width={150} className="text-xs" />
                <Tooltip />
                <Legend />
                {DISPOSITION_TYPES.map(type => {
                  const hasData = barData.some(d => (d as any)[type] > 0);
                  if (!hasData) return null;
                  return (
                    <Bar
                      key={type}
                      dataKey={type}
                      name={DISPOSITION_LABELS[type]}
                      stackId="a"
                      fill={DISPOSITION_COLORS[type]}
                    />
                  );
                })}
              </BarChart>
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

function MetricCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className={`text-xl font-bold ${color || ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getScoreColor(score: number | null | undefined): string {
  if (score == null) return '';
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBadgeClass(score: number): string {
  if (score >= 70) return 'bg-green-500 text-white';
  if (score >= 50) return 'bg-yellow-500 text-black';
  return 'bg-red-500 text-white';
}
