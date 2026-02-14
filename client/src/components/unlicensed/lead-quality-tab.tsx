import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Target,
  TrendingUp,
  CheckCircle,
  XCircle,
  BarChart3,
  Zap,
  Users,
  ArrowRightCircle,
} from "lucide-react";
import { format } from "date-fns";

interface DashboardData {
  stats: {
    totalAssessments: number;
    avgQualificationScore: number | null;
    avgCampaignFitScore: number | null;
    qualificationRate: number;
    dispositionAccuracyRate: number | null;
    avgJobTitleAlignment: number | null;
    avgIndustryAlignment: number | null;
    avgCompanySizeFit: number | null;
    avgBudgetIndicators: number | null;
    avgAuthorityLevel: number | null;
    avgTimelineSignals: number | null;
    avgPainPointAlignment: number | null;
  };
  qualificationTrend: Array<{
    date: string;
    avgScore: string | null;
    avgCampaignFit: string | null;
    assessmentCount: number;
    qualifiedCount: number;
  }>;
  outcomeDistribution: Array<{ outcomeCategory: string; count: number }>;
  intentDistribution: Array<{ intentStrength: string; count: number }>;
  crmActionDistribution: Array<{ action: string; count: number }>;
  intentByCampaign: Array<{ campaignId: string; intentStrength: string; count: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
}

interface AssessmentListData {
  assessments: Array<{
    id: string;
    callSessionId: string;
    campaignId: string | null;
    leadId: string | null;
    status: string;
    leadQualificationScore: number | null;
    campaignFitScore: number | null;
    intentStrength: string | null;
    outcomeCategory: string | null;
    prospectInterested: boolean | null;
    dispositionAccurate: boolean | null;
    suggestedDisposition: string | null;
    recommendedCrmAction: string | null;
    jobTitleAlignment: number | null;
    industryAlignment: number | null;
    painPointAlignment: number | null;
    summary: string | null;
    createdAt: string;
  }>;
  total: number;
}

function ScoreCard({ title, value, icon: Icon, description, suffix = "%" }: {
  title: string;
  value: number | string | null;
  icon: React.ElementType;
  description?: string;
  suffix?: string;
}) {
  const numValue = typeof value === "number" ? value : null;
  const getColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${getColor(numValue)}`}>
          {value !== null && value !== undefined ? `${value}${suffix}` : "—"}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

function IntentBadge({ intent }: { intent: string | null }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    strong: { variant: "default", className: "bg-green-600" },
    moderate: { variant: "default", className: "bg-blue-600" },
    weak: { variant: "secondary" },
    none: { variant: "outline" },
    ambiguous: { variant: "secondary", className: "bg-yellow-600 text-white" },
  };
  const { variant, className } = config[intent || ""] || { variant: "outline" };
  return <Badge variant={variant} className={className}>{intent || "unknown"}</Badge>;
}

function OutcomeBadge({ category }: { category: string | null }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    qualified_lead: { variant: "default", className: "bg-green-600" },
    mql: { variant: "default", className: "bg-green-500" },
    sql: { variant: "default", className: "bg-emerald-600" },
    follow_up: { variant: "default", className: "bg-blue-600" },
    not_interested: { variant: "secondary" },
    not_a_fit: { variant: "secondary" },
    dnc: { variant: "destructive" },
    callback: { variant: "default", className: "bg-blue-500" },
    voicemail: { variant: "outline" },
    invalid: { variant: "destructive" },
  };
  const { variant, className } = config[category || ""] || { variant: "outline" };
  return (
    <Badge variant={variant} className={className}>
      {category?.replace(/_/g, " ") || "unknown"}
    </Badge>
  );
}

export function LeadQualityTab() {
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("");

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  if (outcomeFilter) queryParams.set("outcomeCategory", outcomeFilter);
  const queryString = queryParams.toString();

  const { data: dashboard, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ["/api/unlicensed/lead-quality/dashboard", queryString],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/unlicensed/lead-quality/dashboard${queryString ? `?${queryString}` : ""}`);
      return res.json();
    },
  });

  const { data: assessmentList, isLoading: listLoading } = useQuery<AssessmentListData>({
    queryKey: ["/api/unlicensed/lead-quality/assessments", queryString],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/unlicensed/lead-quality/assessments${queryString ? `?${queryString}` : ""}&limit=30`);
      return res.json();
    },
  });

  const stats = dashboard?.stats;
  const outcomeDistribution = dashboard?.outcomeDistribution || [];
  const intentDistribution = dashboard?.intentDistribution || [];
  const crmActionDistribution = dashboard?.crmActionDistribution || [];
  const qualificationTrend = dashboard?.qualificationTrend || [];
  const assessments = assessmentList?.assessments || [];

  const totalOutcomes = outcomeDistribution.reduce((sum, o) => sum + Number(o.count), 0);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold">Lead Quality & Outcome Analysis Department</h2>
          <p className="text-sm text-muted-foreground">
            Campaign & qualification integrity — evaluates the RESULT of conversations, not their delivery
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Date From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
        </div>

        {/* Primary Stats */}
        {dashLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ScoreCard
              title="Qualification Rate"
              value={stats?.qualificationRate ?? null}
              icon={Target}
              description="Leads classified as qualified/MQL/SQL"
            />
            <ScoreCard
              title="Avg Campaign Fit"
              value={stats?.avgCampaignFitScore ?? null}
              icon={BarChart3}
              description="Campaign alignment score"
            />
            <ScoreCard
              title="Avg Qualification Score"
              value={stats?.avgQualificationScore ?? null}
              icon={TrendingUp}
              description="Lead qualification score"
            />
            <ScoreCard
              title="Disposition Accuracy"
              value={stats?.dispositionAccuracyRate ?? null}
              icon={CheckCircle}
              description="Correct disposition rate"
            />
          </div>
        )}

        {/* Qualification Dimension Breakdown */}
        {!dashLoading && stats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Qualification Dimensions (Avg Scores)</CardTitle>
              <CardDescription>Average scores across 7 qualification criteria</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: "Job Title", value: stats.avgJobTitleAlignment },
                  { label: "Industry", value: stats.avgIndustryAlignment },
                  { label: "Company Size", value: stats.avgCompanySizeFit },
                  { label: "Budget", value: stats.avgBudgetIndicators },
                  { label: "Authority", value: stats.avgAuthorityLevel },
                  { label: "Timeline", value: stats.avgTimelineSignals },
                  { label: "Pain Points", value: stats.avgPainPointAlignment },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center p-3 rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">{label}</div>
                    <div className={`text-xl font-bold ${
                      value === null ? "text-muted-foreground" :
                      value >= 70 ? "text-green-600" :
                      value >= 40 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {value ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Outcome Distribution & Intent Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Outcome Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outcome Distribution</CardTitle>
              <CardDescription>{totalOutcomes} total assessments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {outcomeDistribution.map((item) => {
                  const pct = totalOutcomes > 0 ? Math.round((Number(item.count) / totalOutcomes) * 100) : 0;
                  return (
                    <div key={item.outcomeCategory} className="flex items-center gap-2">
                      <OutcomeBadge category={item.outcomeCategory} />
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {item.count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
                {outcomeDistribution.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Intent Strength Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Intent Strength</CardTitle>
              <CardDescription>Distribution of buying intent signals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {intentDistribution.map((item) => (
                  <div key={item.intentStrength} className="flex items-center justify-between">
                    <IntentBadge intent={item.intentStrength} />
                    <span className="text-sm font-medium">{item.count}</span>
                  </div>
                ))}
                {intentDistribution.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* CRM Action Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead Routing Actions</CardTitle>
              <CardDescription>Recommended CRM actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {crmActionDistribution.map((item) => (
                  <div key={item.action} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowRightCircle className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{item.action?.replace(/_/g, " ") || "unknown"}</span>
                    </div>
                    <Badge variant="outline">{item.count}</Badge>
                  </div>
                ))}
                {crmActionDistribution.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Qualification Trend */}
        {qualificationTrend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Qualification Trend (Last 30 Days)</CardTitle>
              <CardDescription>Daily qualification scores and rates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-32">
                {qualificationTrend.map((day, i) => {
                  const score = day.avgScore ? Number(day.avgScore) : 0;
                  const height = Math.max(4, (score / 100) * 100);
                  const qualRate = day.assessmentCount > 0
                    ? (day.qualifiedCount / day.assessmentCount) * 100
                    : 0;
                  const color = qualRate >= 50 ? "bg-green-500" : qualRate >= 25 ? "bg-yellow-500" : "bg-red-500";
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center flex-1 min-w-0"
                      title={`${day.date}: Score ${Math.round(score)}, ${day.qualifiedCount}/${day.assessmentCount} qualified (${Math.round(qualRate)}%)`}
                    >
                      <div
                        className={`w-full rounded-t ${color}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">{qualificationTrend[0]?.date}</span>
                <span className="text-[10px] text-muted-foreground">{qualificationTrend[qualificationTrend.length - 1]?.date}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Assessment List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead Quality Assessments</CardTitle>
            <CardDescription>
              {assessmentList ? `${assessmentList.total} total assessments` : "Loading..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Qual. Score</TableHead>
                    <TableHead>Campaign Fit</TableHead>
                    <TableHead>Intent</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Interested</TableHead>
                    <TableHead>Disp. Accurate</TableHead>
                    <TableHead>CRM Action</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell className="text-xs">
                        {format(new Date(assessment.createdAt), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {assessment.leadQualificationScore ?? "—"}
                      </TableCell>
                      <TableCell>{assessment.campaignFitScore ?? "—"}</TableCell>
                      <TableCell>
                        <IntentBadge intent={assessment.intentStrength} />
                      </TableCell>
                      <TableCell>
                        <OutcomeBadge category={assessment.outcomeCategory} />
                      </TableCell>
                      <TableCell>
                        {assessment.prospectInterested === null ? "—" :
                         assessment.prospectInterested ? <CheckCircle className="h-4 w-4 text-green-600" /> :
                         <XCircle className="h-4 w-4 text-red-600" />}
                      </TableCell>
                      <TableCell>
                        {assessment.dispositionAccurate === null ? "—" :
                         assessment.dispositionAccurate ? <CheckCircle className="h-4 w-4 text-green-600" /> :
                         <XCircle className="h-4 w-4 text-red-600" />}
                      </TableCell>
                      <TableCell className="text-xs">
                        {assessment.recommendedCrmAction?.replace(/_/g, " ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {assessment.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {assessments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No lead quality assessments found. Assessments are generated automatically during post-call analysis.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
