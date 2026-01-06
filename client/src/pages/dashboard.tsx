import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StatCard } from "@/components/shared/stat-card";
import { 
  Users, Building2, Mail, CheckCircle, Phone, Clock, TrendingUp, 
  Award, FileText, ArrowUp, ArrowDown, Activity, Sparkles, 
  Zap, MessageSquare, ShieldCheck, Search, Brain, Target, AlertCircle
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
    <div className="relative min-h-screen p-6 space-y-10 max-w-7xl mx-auto">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute top-1/3 -left-20 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute bottom-10 right-16 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-sky-500/10 via-transparent to-transparent" />
      </div>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Badge variant="success" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
              Live
            </Badge>
            <Badge className="bg-sky-500/15 text-sky-600 border-sky-500/30">
              AI Guided
            </Badge>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight bg-gradient-to-r from-emerald-500 via-sky-500 to-amber-500 text-transparent bg-clip-text">
            Mission Control
          </h1>
          <p className="text-foreground/70 mt-2">
            {isAgent ? "Agent Performance & Tasks" : "System Overview & AI Insights"}
          </p>
        </div>
        <div className="flex items-center gap-3">
           <AgentState status="idle" />
           <Button
             onClick={() => setLocation('/campaigns/new')}
             className="gap-2 bg-gradient-to-r from-emerald-500 via-sky-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:via-sky-400 hover:to-cyan-400"
           >
             <Zap className="w-4 h-4" />
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
                <StatCard
                  title="Total Contacts"
                  value={stats?.totalContacts || 0}
                  icon={Users}
                  trend={{ value: 12, isPositive: true }}
                  gradient={statThemes[0].gradient}
                  accentClassName={statThemes[0].accent}
                  className="shadow-[0_20px_40px_-34px_rgba(16,185,129,0.45)]"
                />
                <StatCard
                  title="Active Campaigns"
                  value={stats?.activeCampaigns || 0}
                  icon={Target}
                  description={`${stats?.activeCampaignsBreakdown?.email || 0} Email, ${stats?.activeCampaignsBreakdown?.telemarketing || 0} Voice`}
                  gradient={statThemes[1].gradient}
                  accentClassName={statThemes[1].accent}
                  className="shadow-[0_20px_40px_-34px_rgba(14,165,233,0.45)]"
                />
                <StatCard
                  title="Leads Generated"
                  value={stats?.leadsThisMonth || 0}
                  icon={Sparkles}
                  trend={{ value: 8, isPositive: true }}
                  gradient={statThemes[2].gradient}
                  accentClassName={statThemes[2].accent}
                  className="shadow-[0_20px_40px_-34px_rgba(251,146,60,0.45)]"
                />
              </>
            ) : (
              <>
                <StatCard
                  title="Calls Today"
                  value={agentStats?.callsToday || 0}
                  icon={Phone}
                  gradient={agentThemes[0].gradient}
                  accentClassName={agentThemes[0].accent}
                  className="shadow-[0_20px_40px_-34px_rgba(244,63,94,0.45)]"
                />
                <StatCard
                  title="Qualified Leads"
                  value={agentStats?.qualified || 0}
                  icon={CheckCircle}
                  gradient={agentThemes[1].gradient}
                  accentClassName={agentThemes[1].accent}
                  className="shadow-[0_20px_40px_-34px_rgba(16,185,129,0.45)]"
                />
                <StatCard
                  title="Avg Duration"
                  value={`${Math.floor((agentStats?.avgDuration || 0) / 60)}m ${(agentStats?.avgDuration || 0) % 60}s`}
                  icon={Clock}
                  gradient={agentThemes[2].gradient}
                  accentClassName={agentThemes[2].accent}
                  className="shadow-[0_20px_40px_-34px_rgba(56,189,248,0.45)]"
                />
              </>
            )}
          </div>

          {/* Performance Trend Chart */}
          <Card className="relative overflow-hidden border border-border/60 shadow-lg shadow-slate-900/10 bg-card/80 backdrop-blur-sm">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_60%),radial-gradient(circle_at_70%_80%,_rgba(16,185,129,0.14),_transparent_55%)]" />
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Activity className="w-5 h-5 text-sky-500" />
                Performance Trends
              </CardTitle>
              <CardDescription className="text-foreground/65">Weekly engagement and activity metrics</CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <TrendChart 
                title="Weekly Activity"
                data={trendData}
                type="area"
                height={300}
                className="mt-4"
              />
            </CardContent>
          </Card>

        </div>

        {/* Right Column: AI Insights & Actions (1/3 width) */}
        <div className="space-y-6">
          <Card className="relative h-full overflow-hidden border border-border/60 shadow-lg shadow-slate-900/10 bg-card/85">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.18),_transparent_65%),radial-gradient(circle_at_20%_80%,_rgba(14,165,233,0.18),_transparent_55%)]" />
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-xl text-foreground">
                <Brain className="w-6 h-6 text-amber-500" />
                AI Insights
              </CardTitle>
              <CardDescription className="text-foreground/65">
                Real-time intelligence and recommendations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              {aiInsights.map((insight) => {
                const theme = insightThemes[insight.type] || insightThemes.optimization;
                return (
                <Card key={insight.id} className={cn("border border-border/60 shadow-sm", theme.card)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {insight.type === 'opportunity' && <Sparkles className={cn("w-4 h-4", theme.icon)} />}
                        {insight.type === 'anomaly' && <AlertCircle className={cn("w-4 h-4", theme.icon)} />}
                        {insight.type === 'optimization' && <TrendingUp className={cn("w-4 h-4", theme.icon)} />}
                        <span className="font-semibold text-sm text-foreground">{insight.summary}</span>
                      </div>
                      <ConfidenceIndicator score={insight.confidence} />
                    </div>
                    
                    <div className="text-sm text-foreground/70">
                      {insight.details}
                      <AIReasoning 
                        summary="View reasoning" 
                        details={insight.details} 
                        className="mt-2"
                      />
                    </div>

                    <Button variant="outline" size="sm" className={cn("w-full text-xs h-8", theme.button)}>
                      {insight.action}
                    </Button>
                  </CardContent>
                </Card>
              )})}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
