import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  MessageSquare,
  Shield,
  CheckCircle,
  AlertTriangle,
  Activity,
  Mic,
  FileText,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";

interface DashboardData {
  stats: {
    totalAssessments: number;
    avgCqs: number | null;
    avgTechnicalIntegrity: number | null;
    avgCompliance: number | null;
    avgBehavioral: number | null;
    avgTone: number | null;
    avgNaturalness: number | null;
    avgConfidence: number | null;
    avgScriptAdherence: number | null;
    avgGatekeeperProtocol: number | null;
    avgObjectionHandling: number | null;
    voicemailAccuracy: number | null;
    technicalErrorRate: number;
  };
  cqsTrend: Array<{ date: string; avgCqs: string | null; assessmentCount: number }>;
  recentFlags: Array<{
    id: string;
    callSessionId: string;
    campaignId: string | null;
    conversationQualityScore: number | null;
    issueFlags: any[];
    summary: string | null;
    createdAt: string;
  }>;
  statusDistribution: Array<{ status: string; count: number }>;
}

interface AssessmentListData {
  assessments: Array<{
    id: string;
    callSessionId: string;
    campaignId: string | null;
    status: string;
    conversationQualityScore: number | null;
    technicalIntegrityScore: number | null;
    complianceScore: number | null;
    behavioralScore: number | null;
    toneScore: number | null;
    scriptAdherenceScore: number | null;
    roboticRepetitionFlag: boolean;
    voicemailDetectionAccurate: boolean | null;
    dispositionCorrect: boolean | null;
    issueFlags: any[];
    summary: string | null;
    createdAt: string;
  }>;
  total: number;
}

function ScoreCard({ title, value, icon: Icon, description }: {
  title: string;
  value: number | string | null;
  icon: React.ElementType;
  description?: string;
}) {
  const numValue = typeof value === "number" ? value : null;
  const getColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
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
          {value !== null && value !== undefined ? `${value}${typeof value === "number" ? "%" : ""}` : "—"}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    high: { variant: "destructive" },
    medium: { variant: "default", className: "bg-yellow-600" },
    low: { variant: "secondary" },
  };
  const { variant, className } = config[severity] || { variant: "outline" };
  return <Badge variant={variant} className={className}>{severity}</Badge>;
}

export function ConversationQualityTab() {
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const queryParams = new URLSearchParams();
  if (campaignFilter) queryParams.set("campaignId", campaignFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  const queryString = queryParams.toString();

  const { data: dashboard, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ["/api/unlicensed/conversation-quality/dashboard", queryString],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/unlicensed/conversation-quality/dashboard${queryString ? `?${queryString}` : ""}`);
      return res.json();
    },
  });

  const { data: assessmentList, isLoading: listLoading } = useQuery<AssessmentListData>({
    queryKey: ["/api/unlicensed/conversation-quality/assessments", queryString],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/unlicensed/conversation-quality/assessments${queryString ? `?${queryString}` : ""}&limit=30`);
      return res.json();
    },
  });

  const stats = dashboard?.stats;
  const cqsTrend = dashboard?.cqsTrend || [];
  const recentFlags = dashboard?.recentFlags || [];
  const assessments = assessmentList?.assessments || [];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold">Conversation Quality Department</h2>
          <p className="text-sm text-muted-foreground">
            Process & communication integrity — evaluates HOW calls are conducted, not their outcomes
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

        {/* Stats Cards */}
        {dashLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ScoreCard
              title="Avg CQS"
              value={stats?.avgCqs ?? null}
              icon={MessageSquare}
              description="Conversation Quality Score"
            />
            <ScoreCard
              title="Technical Error Rate"
              value={stats?.technicalErrorRate ?? 0}
              icon={AlertTriangle}
              description="Calls with technical issues"
            />
            <ScoreCard
              title="Script Compliance"
              value={stats?.avgScriptAdherence ?? null}
              icon={FileText}
              description="Avg script adherence"
            />
            <ScoreCard
              title="Voicemail Accuracy"
              value={stats?.voicemailAccuracy ?? null}
              icon={Mic}
              description="Voicemail detection accuracy"
            />
          </div>
        )}

        {/* Secondary Stats */}
        {!dashLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <ScoreCard title="Compliance" value={stats.avgCompliance} icon={Shield} />
            <ScoreCard title="Behavioral" value={stats.avgBehavioral} icon={Activity} />
            <ScoreCard title="Tone" value={stats.avgTone} icon={MessageSquare} />
            <ScoreCard title="Naturalness" value={stats.avgNaturalness} icon={Activity} />
            <ScoreCard title="Confidence" value={stats.avgConfidence} icon={TrendingUp} />
            <ScoreCard title="Gatekeeper" value={stats.avgGatekeeperProtocol} icon={Shield} />
          </div>
        )}

        {/* CQS Trend */}
        {cqsTrend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">CQS Trend (Last 30 Days)</CardTitle>
              <CardDescription>Daily average Conversation Quality Score</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-32">
                {cqsTrend.map((day, i) => {
                  const score = day.avgCqs ? Number(day.avgCqs) : 0;
                  const height = Math.max(4, (score / 100) * 100);
                  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center flex-1 min-w-0"
                      title={`${day.date}: ${Math.round(score)}% (${day.assessmentCount} calls)`}
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
                <span className="text-[10px] text-muted-foreground">{cqsTrend[0]?.date}</span>
                <span className="text-[10px] text-muted-foreground">{cqsTrend[cqsTrend.length - 1]?.date}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Behavioral Flags */}
        {recentFlags.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Behavioral Flags</CardTitle>
              <CardDescription>Flagged issues requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>CQS</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentFlags.map((flag) => (
                    <TableRow key={flag.id}>
                      <TableCell className="text-xs">
                        {format(new Date(flag.createdAt), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          (flag.conversationQualityScore || 0) >= 80 ? "default" :
                          (flag.conversationQualityScore || 0) >= 60 ? "secondary" : "destructive"
                        }>
                          {flag.conversationQualityScore ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {(flag.issueFlags as any[] || []).slice(0, 3).map((issue: any, i: number) => (
                            <SeverityBadge key={i} severity={issue.severity || "medium"} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs">
                        {flag.summary || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Call-Level Transcript Audit */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call-Level Assessment Audit</CardTitle>
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
                    <TableHead>CQS</TableHead>
                    <TableHead>Technical</TableHead>
                    <TableHead>Compliance</TableHead>
                    <TableHead>Behavioral</TableHead>
                    <TableHead>VM Detect</TableHead>
                    <TableHead>Disp. Correct</TableHead>
                    <TableHead>Flags</TableHead>
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
                        {assessment.conversationQualityScore ?? "—"}
                      </TableCell>
                      <TableCell>{assessment.technicalIntegrityScore ?? "—"}</TableCell>
                      <TableCell>{assessment.complianceScore ?? "—"}</TableCell>
                      <TableCell>{assessment.behavioralScore ?? "—"}</TableCell>
                      <TableCell>
                        {assessment.voicemailDetectionAccurate === null ? "—" :
                         assessment.voicemailDetectionAccurate ? <CheckCircle className="h-4 w-4 text-green-600" /> :
                         <XCircle className="h-4 w-4 text-red-600" />}
                      </TableCell>
                      <TableCell>
                        {assessment.dispositionCorrect === null ? "—" :
                         assessment.dispositionCorrect ? <CheckCircle className="h-4 w-4 text-green-600" /> :
                         <XCircle className="h-4 w-4 text-red-600" />}
                      </TableCell>
                      <TableCell>
                        {(assessment.issueFlags as any[] || []).length > 0 ? (
                          <Badge variant="destructive" className="text-xs">
                            {(assessment.issueFlags as any[]).length}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">0</Badge>
                        )}
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
                        No conversation quality assessments found. Assessments are generated automatically during post-call analysis.
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
