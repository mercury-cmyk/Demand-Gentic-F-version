/**
 * Unified Reports & Analytics Page
 *
 * Consolidates all client portal reporting views (engagement analytics,
 * call reports, conversation quality, recordings, cost tracking, and exports)
 * into a single tabbed interface with an executive overview dashboard.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Phone, Mail, UserCheck, Star, Clock, Activity, DollarSign,
  FileText, MessageSquareText, Mic, Sparkles, Loader2,
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

const getToken = () => localStorage.getItem('clientPortalToken');
const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];

function useCampaigns() {
  return useQuery({
    queryKey: ['unified-report-campaigns'],
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

// ─── OVERVIEW SECTION ────────────────────────────────────
function OverviewSection() {
  const { data: engagement, isLoading: engLoading } = useQuery({
    queryKey: ['unified-overview-engagement'],
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
    queryKey: ['unified-overview-cost'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/cost-tracking', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (engLoading) {
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg ${kpi.bg} flex items-center justify-center shrink-0`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                  <p className="text-xl font-bold">{typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {engagement?.timeline?.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                30-Day Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
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
              <CardHeader><CardTitle>Channel Mix</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={engagement.channelBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
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
          <CardHeader><CardTitle>Disposition Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
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

// ─── AI INSIGHTS SECTION ─────────────────────────────────
function AiInsightsSection({ onOpenPanel }: { onOpenPanel: () => void }) {
  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-lg font-semibold">AI-Powered Analytics</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Ask natural language questions about your campaigns, generate comprehensive reports, and get AI-driven insights across all your data.
              </p>
            </div>
            <Button onClick={onOpenPanel} className="gap-2" size="lg">
              <Sparkles className="h-4 w-4" />
              Launch AI Reports
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "Campaign Performance", desc: "\"How many QA-approved leads do I have?\"", icon: BarChart3 },
          { title: "Lead Analysis", desc: "\"Which campaign is performing best?\"", icon: UserCheck },
          { title: "Custom Reports", desc: "\"Give me a summary of all my campaigns\"", icon: FileText },
        ].map((card) => (
          <Card key={card.title} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onOpenPanel} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpenPanel(); }}>
            <CardContent className="pt-6">
              <card.icon className="h-8 w-8 text-primary/60 mb-3" />
              <h4 className="font-medium">{card.title}</h4>
              <p className="text-sm text-muted-foreground mt-1 italic">{card.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────
export default function ClientPortalUnifiedReports() {
  const [activeTab, setActiveTab] = useState('overview');
  const [showAiReports, setShowAiReports] = useState(false);

  const { data: campaignsData } = useCampaigns();
  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reports & Analytics</h1>
            </div>
            <p className="text-foreground/70 mt-2">Unified reporting across all campaigns and channels</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 lg:grid-cols-8 w-full">
            <TabsTrigger value="overview" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="engagement" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /><span className="hidden sm:inline">Engagement</span>
            </TabsTrigger>
            <TabsTrigger value="calls" className="gap-1.5">
              <Phone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Calls</span>
            </TabsTrigger>
            <TabsTrigger value="quality" className="gap-1.5">
              <MessageSquareText className="h-3.5 w-3.5" /><span className="hidden sm:inline">Quality</span>
            </TabsTrigger>
            <TabsTrigger value="recordings" className="gap-1.5">
              <Mic className="h-3.5 w-3.5" /><span className="hidden sm:inline">Recordings</span>
            </TabsTrigger>
            <TabsTrigger value="cost" className="gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /><span className="hidden sm:inline">Cost</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /><span className="hidden sm:inline">AI Insights</span>
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /><span className="hidden sm:inline">Export</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6"><OverviewSection /></TabsContent>
          <TabsContent value="engagement" className="mt-6"><EngagementSection campaigns={campaigns} /></TabsContent>
          <TabsContent value="calls" className="mt-6"><CallsSection campaigns={campaigns} /></TabsContent>
          <TabsContent value="quality" className="mt-6"><QualitySection campaigns={campaigns} /></TabsContent>
          <TabsContent value="recordings" className="mt-6"><RecordingsSection campaigns={campaigns} /></TabsContent>
          <TabsContent value="cost" className="mt-6"><CostSection /></TabsContent>
          <TabsContent value="ai" className="mt-6"><AiInsightsSection onOpenPanel={() => setShowAiReports(true)} /></TabsContent>
          <TabsContent value="export" className="mt-6"><ExportSection campaigns={campaigns} /></TabsContent>
        </Tabs>
      </div>

      <AgenticReportsPanel open={showAiReports} onOpenChange={setShowAiReports} />
    </ClientPortalLayout>
  );
}
