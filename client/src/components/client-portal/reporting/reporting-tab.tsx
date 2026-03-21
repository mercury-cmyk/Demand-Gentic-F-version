/**
 * Unified Reporting Tab — Consolidated reporting hub for the client portal dashboard.
 *
 * Sections:
 *   1. Overview       — KPI cards, timeline, channel mix, disposition distribution
 *   2. Analytics      — Engagement & Call analytics with charts
 *   3. Recordings     — Call recordings with GCS playback URLs
 *   4. Export         — Qualified leads CSV export
 *   5. AI Insights    — Agent recommendations & AI-generated campaign analysis
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Phone, Mail, UserCheck, Star, Clock, Activity, Mic,
  FileText, Sparkles, Loader2, Download, Bot, Lightbulb,
  TrendingUp, CheckCircle2, Target, RefreshCw, AlertCircle,
} from "lucide-react";
import {
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  EngagementSection, CallsSection, QualitySection,
  RecordingsSection, CostSection, ExportSection,
} from "@/components/client-portal/reports/unified-report-sections";
import { AgenticReportsPanel } from "@/components/client-portal/reports/agentic-reports-panel";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = 'overview' | 'analytics' | 'recordings' | 'export' | 'ai-insights';

interface ReportingTabProps {
  authHeaders: { headers: { Authorization: string } };
  clientAccountId?: string;
}

// ─── Section Nav ──────────────────────────────────────────────────────────────

const SECTIONS: { id: Section; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'analytics', label: 'Campaign Analytics', icon: Activity },
  { id: 'recordings', label: 'Call Recordings', icon: Mic },
  { id: 'export', label: 'Leads Export', icon: Download },
  { id: 'ai-insights', label: 'Agent Recommendations', icon: Bot },
];

function SectionNav({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  return (
    <div className="flex items-center gap-1 border-b pb-3 mb-4 flex-wrap">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getToken = () => localStorage.getItem('clientPortalToken');
const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];

function useCampaigns() {
  return useQuery({
    queryKey: ['reporting-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Overview Section ─────────────────────────────────────────────────────────

function OverviewSection() {
  const { data: engagement, isLoading } = useQuery({
    queryKey: ['reporting-overview-engagement'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/analytics/engagement', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: costData } = useQuery({
    queryKey: ['reporting-overview-cost'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/cost-tracking', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const kpis = [
    { label: "Active Campaigns", value: engagement?.totalCampaigns || 0, icon: BarChart3, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Total Calls", value: engagement?.calls?.total || 0, icon: Phone, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Emails Sent", value: engagement?.email?.total || 0, icon: Mail, color: "text-cyan-500", bg: "bg-cyan-500/10" },
    { label: "Qualified Leads", value: engagement?.leads?.qualified || 0, icon: UserCheck, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "Avg Quality Score", value: `${engagement?.agentBehavior?.overall || 0}%`, icon: Star, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Call Minutes", value: costData?.summary?.totalDurationMinutes || 0, icon: Clock, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-lg ${kpi.bg} flex items-center justify-center shrink-0`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                  <p className="text-lg font-bold">{typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {engagement?.timeline?.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                30-Day Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={engagement.timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="calls" stroke="hsl(262, 83%, 58%)" name="Calls" />
                  <Line type="monotone" dataKey="emails" stroke="hsl(142, 76%, 36%)" name="Emails" />
                  <Line type="monotone" dataKey="qualified" stroke="hsl(45, 93%, 47%)" name="Qualified" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {engagement?.channelBreakdown?.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Channel Mix</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={engagement.channelBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                      {engagement.channelBreakdown.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {engagement?.dispositions?.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Disposition Distribution</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={engagement.dispositions}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="disposition" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                <Bar dataKey="count" fill="hsl(221, 83%, 53%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Analytics Section (Engagement + Calls + Quality + Cost) ──────────────────

function AnalyticsSection({ campaigns }: { campaigns: any[] }) {
  const [view, setView] = useState<'engagement' | 'calls' | 'quality' | 'cost'>('engagement');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        {[
          { id: 'engagement' as const, label: 'Engagement', icon: Activity },
          { id: 'calls' as const, label: 'Calls', icon: Phone },
          { id: 'quality' as const, label: 'Quality', icon: Star },
          { id: 'cost' as const, label: 'Cost', icon: Clock },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              view === v.id
                ? 'bg-muted text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <v.icon className="h-3 w-3" />
            {v.label}
          </button>
        ))}
      </div>

      {view === 'engagement' && <EngagementSection campaigns={campaigns} />}
      {view === 'calls' && <CallsSection campaigns={campaigns} />}
      {view === 'quality' && <QualitySection campaigns={campaigns} />}
      {view === 'cost' && <CostSection />}
    </div>
  );
}

// ─── Agent Recommendations Section ────────────────────────────────────────────

interface CampaignAnalysis {
  campaignName: string;
  performance: string;
  summary: string;
  recommendations: string[];
}

interface GeneratedReport {
  executiveSummary: string;
  highlights: Array<{
    metric: string;
    value: string;
    trend: 'up' | 'down' | 'stable';
    insight: string;
  }>;
  campaignAnalysis: CampaignAnalysis[];
  recommendations: string[];
}

function AgentRecommendationsSection() {
  const [showPanel, setShowPanel] = useState(false);

  const reportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          reportType: 'comprehensive',
          includeRecommendations: true,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      return res.json();
    },
  });

  const report: GeneratedReport | null = reportMutation.data?.report || null;

  return (
    <div className="space-y-4">
      {/* Generate report CTA */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent">
        <CardContent className="py-5 px-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-base font-semibold">AI Agent Recommendations</h3>
              <p className="text-muted-foreground text-sm mt-0.5">
                Generate AI-powered analysis of your campaigns with actionable recommendations, performance insights, and next steps.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => reportMutation.mutate()}
                disabled={reportMutation.isPending}
                className="gap-2"
              >
                {reportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {report ? 'Regenerate' : 'Generate Report'}
              </Button>
              <Button variant="outline" onClick={() => setShowPanel(true)} className="gap-2">
                <Lightbulb className="h-4 w-4" />
                AI Reports Chat
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {reportMutation.isError && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-3 px-4 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to generate report. Please try again.
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {reportMutation.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {/* Generated report */}
      {report && !reportMutation.isPending && (
        <div className="space-y-4">
          {/* Executive Summary */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{report.executiveSummary}</p>
            </CardContent>
          </Card>

          {/* Highlights */}
          {report.highlights?.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {report.highlights.map((h, i) => (
                <Card key={i}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      {h.trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-green-500" />}
                      {h.trend === 'down' && <TrendingUp className="h-3.5 w-3.5 text-red-500 rotate-180" />}
                      {h.trend === 'stable' && <Target className="h-3.5 w-3.5 text-blue-500" />}
                      <span className="text-xs text-muted-foreground">{h.metric}</span>
                    </div>
                    <p className="text-lg font-bold">{h.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{h.insight}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Campaign Analysis */}
          {report.campaignAnalysis?.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Campaign Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-4">
                    {report.campaignAnalysis.map((ca, i) => (
                      <div key={i} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-sm">{ca.campaignName}</h4>
                          <Badge
                            variant={ca.performance === 'good' ? 'default' : 'outline'}
                            className={`text-xs capitalize ${
                              ca.performance === 'good'
                                ? 'bg-green-500/10 text-green-700'
                                : ca.performance === 'needs_attention'
                                ? 'bg-amber-500/10 text-amber-700'
                                : ''
                            }`}
                          >
                            {ca.performance.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{ca.summary}</p>
                        {ca.recommendations?.length > 0 && (
                          <div className="space-y-1">
                            {ca.recommendations.map((rec, j) => (
                              <div key={j} className="flex items-start gap-1.5 text-xs">
                                <Lightbulb className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                                <span>{rec}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Top-level Recommendations */}
          {report.recommendations?.length > 0 && (
            <Card className="border-green-200/60 bg-green-50/30">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Recommended Next Steps
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {report.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="h-5 w-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-medium shrink-0">
                        {i + 1}
                      </span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AgenticReportsPanel open={showPanel} onOpenChange={setShowPanel} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportingTab({ authHeaders, clientAccountId }: ReportingTabProps) {
  const urlSection = new URLSearchParams(window.location.search).get('section');
  const validSections: Section[] = ['overview', 'analytics', 'recordings', 'export', 'ai-insights'];
  const initialSection = validSections.includes(urlSection as Section) ? (urlSection as Section) : 'overview';
  const [activeSection, setActiveSection] = useState<Section>(initialSection);

  const { data: campaignsData } = useCampaigns();
  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  return (
    <div className="space-y-4">
      <SectionNav active={activeSection} onChange={setActiveSection} />

      {activeSection === 'overview' && <OverviewSection />}
      {activeSection === 'analytics' && <AnalyticsSection campaigns={campaigns} />}
      {activeSection === 'recordings' && <RecordingsSection campaigns={campaigns} />}
      {activeSection === 'export' && <ExportSection campaigns={campaigns} />}
      {activeSection === 'ai-insights' && <AgentRecommendationsSection />}
    </div>
  );
}
