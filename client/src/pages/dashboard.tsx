import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StatCard } from "@/components/shared/stat-card";
import { 
  Users, Building2, Mail, CheckCircle, Phone, Clock, TrendingUp, 
  Award, FileText, ArrowUp, ArrowDown, Activity, Sparkles, 
  Zap, MessageSquare, ShieldCheck, Search, Brain, Target, AlertCircle, Plus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { TrendChart } from "@/components/patterns/dashboard-components";
import { AIReasoning } from "@/components/ui/ai-reasoning";
import { AgentState } from "@/components/ui/agent-state";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalAccounts: number;
  totalContacts: number;
  activeCampaigns: number;
  activeCampaignsBreakdown: {
    email: number;
    telemarketing: number;
  };
  leadsThisMonth: number;
}

interface AgentStats {
  callsToday: number;
  callsThisMonth: number;
  totalCalls: number;
  avgDuration: number;
  qualified: number;
  leadsApproved: number;
  leadsPending: number;
  activeCampaigns: number;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Get user roles array
  const userRoles = (user as any)?.roles || [user?.role || ''];
  const isAgent = userRoles.includes('agent') && 
                  !userRoles.includes('admin') && 
                  !userRoles.includes('campaign_manager');
  
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    enabled: !isAgent,
  });

  const { data: agentStats, isLoading: agentLoading } = useQuery<AgentStats>({
    queryKey: ['/api/dashboard/agent-stats'],
    enabled: isAgent,
  });

  // Mock AI Insights
  const aiInsights = [
    {
      id: 1,
      type: "opportunity",
      summary: "High-value opportunity detected",
      details: "Account 'Acme Corp' shows 85% intent signal based on recent email engagement and website visits.",
      confidence: 85,
      action: "Prioritize Outreach"
    },
    {
      id: 2,
      type: "anomaly",
      summary: "Unusual call drop rate in 'Tech Sector' campaign",
      details: "Call drop rate increased by 15% in the last hour. AI suggests checking VOIP latency or script timing.",
      confidence: 92,
      action: "Investigate"
    },
    {
      id: 3,
      type: "optimization",
      summary: "Email open rates peaking at 10 AM EST",
      details: "Analysis of last 5000 emails suggests shifting schedule to 10 AM EST could improve engagement by 12%.",
      confidence: 78,
      action: "Adjust Schedule"
    }
  ];

  // Mock Trend Data
  const trendData = [
    { label: "Mon", value: 120 },
    { label: "Tue", value: 132 },
    { label: "Wed", value: 101 },
    { label: "Thu", value: 134 },
    { label: "Fri", value: 190 },
    { label: "Sat", value: 130 },
    { label: "Sun", value: 120 },
  ];

  const statThemes = [
    {
      gradient: "from-emerald-500/25 via-emerald-400/10 to-transparent",
      accent: "bg-gradient-to-br from-emerald-400 to-emerald-600",
    },
    {
      gradient: "from-sky-500/25 via-cyan-400/10 to-transparent",
      accent: "bg-gradient-to-br from-sky-400 to-cyan-600",
    },
    {
      gradient: "from-amber-500/25 via-orange-400/10 to-transparent",
      accent: "bg-gradient-to-br from-amber-400 to-orange-500",
    },
  ];

  const agentThemes = [
    {
      gradient: "from-rose-500/25 via-rose-400/10 to-transparent",
      accent: "bg-gradient-to-br from-rose-400 to-rose-600",
    },
    {
      gradient: "from-teal-500/25 via-teal-400/10 to-transparent",
      accent: "bg-gradient-to-br from-teal-400 to-emerald-600",
    },
    {
      gradient: "from-lime-400/25 via-sky-400/10 to-transparent",
      accent: "bg-gradient-to-br from-lime-400 to-sky-600",
    },
  ];

  const insightThemes: Record<string, { card: string; icon: string; button: string }> = {
    opportunity: {
      card: "border-emerald-400/30 bg-emerald-500/10",
      icon: "text-emerald-500",
      button: "border-emerald-400/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-300",
    },
    anomaly: {
      card: "border-amber-400/30 bg-amber-500/10",
      icon: "text-amber-500",
      button: "border-amber-400/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-300",
    },
    optimization: {
      card: "border-sky-400/30 bg-sky-500/10",
      icon: "text-sky-500",
      button: "border-sky-400/40 text-sky-600 hover:bg-sky-500/10 dark:text-sky-300",
    },
  };

  if (isLoading || agentLoading) {
    return (
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 lg:p-10 space-y-8 max-w-[1600px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            {isAgent ? "Agent Performance & Tasks" : "System Overview & Insights"}
          </p>
        </div>
        <div className="flex items-center gap-3">
           <AgentState status="idle" />
           <Button
             onClick={() => setLocation('/campaigns/create')}
             className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
           >
             <Plus className="w-4 h-4 mr-2" />
             New Campaign
           </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Operational Metrics (2/3 width) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Key Metrics Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {!isAgent ? (
              <>
                <Card className="shadow-sm border-slate-200 bg-white">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-medium text-slate-500">Total Contacts</p>
                            <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
                                <Users className="h-4 w-4" />
                            </div>
                        </div>
                        <div>
                             <h3 className="text-2xl font-semibold text-slate-900">{stats?.totalContacts || 0}</h3>
                            <div className="flex items-center mt-1 text-xs text-emerald-600 font-medium">
                                <ArrowUp className="h-3 w-3 mr-1" />
                                <span>+12%</span>
                             </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200 bg-white">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-medium text-slate-500">Active Campaigns</p>
                            <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                                <Target className="h-4 w-4" />
                            </div>
                        </div>
                        <div>
                             <h3 className="text-2xl font-semibold text-slate-900">{stats?.activeCampaigns || 0}</h3>
                             <p className="text-xs text-slate-400 mt-1">
                                {stats?.activeCampaignsBreakdown?.email || 0} Email, {stats?.activeCampaignsBreakdown?.telemarketing || 0} Voice
                             </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200 bg-white">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-medium text-slate-500">Leads Generated</p>
                            <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                                <Sparkles className="h-4 w-4" />
                            </div>
                        </div>
                        <div>
                             <h3 className="text-2xl font-semibold text-slate-900">{stats?.leadsThisMonth || 0}</h3>
                             <div className="flex items-center mt-1 text-xs text-emerald-600 font-medium">
                                <ArrowUp className="h-3 w-3 mr-1" />
                                <span>+8%</span>
                             </div>
                        </div>
                    </CardContent>
                </Card>
              </>
            ) : (
                <>
                 {/* Agent Stats Placeholders - matching style */}
                 <Card className="shadow-sm border-slate-200 bg-white">
                    <CardContent className="p-5">
                         <h3 className="text-2xl font-semibold text-slate-900">{agentStats?.callsToday || 0}</h3>
                         <p className="text-sm text-slate-500">Calls Today</p>
                    </CardContent>
                 </Card>
                 <Card className="shadow-sm border-slate-200 bg-white">
                    <CardContent className="p-5">
                         <h3 className="text-2xl font-semibold text-slate-900">{agentStats?.qualified || 0}</h3>
                         <p className="text-sm text-slate-500">Qualified Leads</p>
                    </CardContent>
                 </Card>
                 <Card className="shadow-sm border-slate-200 bg-white">
                    <CardContent className="p-5">
                         <h3 className="text-2xl font-semibold text-slate-900">{Math.floor((agentStats?.avgDuration || 0) / 60)}m {(agentStats?.avgDuration || 0) % 60}s</h3>
                         <p className="text-sm text-slate-500">Avg Duration</p>
                    </CardContent>
                 </Card>
                </>
            )}
          </div>

          {/* Performance Trend Chart */}
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="pb-4 border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                <Activity className="w-5 h-5 text-indigo-500" />
                Performance Trends
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <TrendChart 
                title="Weekly Activity"
                data={trendData}
                type="area"
                height={300}
                className="mt-0"
              />
            </CardContent>
          </Card>

        </div>

        {/* Right Column: AI Insights & Actions */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="pb-4 border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                <FileText className="w-5 h-5 text-indigo-500" />
                Public Pages
              </CardTitle>
              <CardDescription>Shareable links for prospect-facing pages.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
              <Button variant="outline" className="w-full justify-start gap-2" asChild>
                <a href="/contact">
                  <Mail className="h-4 w-4" />
                  Contact Us
                </a>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" asChild>
                <a href="/book/admin/demo">
                  <Calendar className="h-4 w-4" />
                  Book a Demo
                </a>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" asChild>
                <a href="/proposal-request">
                  <FileText className="h-4 w-4" />
                  Request a Proposal
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-white h-full">
             <CardHeader className="pb-4 border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                    <Brain className="w-5 h-5 text-purple-500" />
                    AI Insights
                </CardTitle>
             </CardHeader>
             <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {aiInsights.map((insight) => (
                    <div key={insight.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-start gap-4">
                            <div className={cn("mt-1 p-2 rounded-lg", 
                                insight.type === 'opportunity' ? "bg-emerald-50 text-emerald-600" : 
                                insight.type === 'anomaly' ? "bg-amber-50 text-amber-600" : 
                                "bg-blue-50 text-blue-600"
                            )}>
                                {insight.type === 'opportunity' ? <TrendingUp className="h-4 w-4" /> : 
                                 insight.type === 'anomaly' ? <AlertCircle className="h-4 w-4" /> : 
                                 <Zap className="h-4 w-4" />}
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className={cn("text-xs font-semibold uppercase tracking-wider",
                                        insight.type === 'opportunity' ? "text-emerald-600" : 
                                        insight.type === 'anomaly' ? "text-amber-600" : 
                                        "text-blue-600"
                                    )}>{insight.type}</span>
                                    <span className="text-xs text-slate-400">{insight.confidence}% confidence</span>
                                </div>
                                <h4 className="font-semibold text-slate-900 text-sm">{insight.summary}</h4>
                                <p className="text-xs text-slate-500 leading-relaxed">{insight.details}</p>
                                <Button variant="outline" size="sm" className="mt-3 h-8 text-xs w-full justify-between group">
                                    {insight.action}
                                    <ArrowUp className="h-3 w-3 rotate-45 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </Button>
                            </div>
                        </div>
                    </div>
                  ))}
                </div>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

}
