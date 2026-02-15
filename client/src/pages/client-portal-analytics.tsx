import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Phone,
  Mail,
  UserCheck,
  TrendingUp,
  Loader2,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');

const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];

export default function ClientPortalAnalytics() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');

  // Fetch campaigns
  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });

  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  // Fetch analytics data
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['client-portal-analytics', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/analytics/engagement?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
  });

  const overviewStats = [
    { label: "Total Campaigns", value: analytics?.totalCampaigns || 0, icon: BarChart3, color: "text-blue-500" },
    { label: "Email Sends", value: analytics?.email?.total || 0, icon: Mail, color: "text-green-500" },
    { label: "Calls Made", value: analytics?.calls?.total || 0, icon: Phone, color: "text-purple-500" },
    { label: "Qualified Leads", value: analytics?.leads?.qualified || 0, icon: UserCheck, color: "text-orange-500" },
  ];

  const behaviorDimensionData = analytics?.agentBehavior ? [
    { metric: "Engagement", score: analytics.agentBehavior.engagement || 0 },
    { metric: "Clarity", score: analytics.agentBehavior.clarity || 0 },
    { metric: "Empathy", score: analytics.agentBehavior.empathy || 0 },
    { metric: "Objection Handling", score: analytics.agentBehavior.objectionHandling || 0 },
    { metric: "Qualification", score: analytics.agentBehavior.qualification || 0 },
    { metric: "Closing", score: analytics.agentBehavior.closing || 0 },
    { metric: "Flow", score: analytics.agentBehavior.flowCompliance || 0 },
  ] : [];

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <ClientPortalLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-teal-500/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-teal-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Engagement Analytics</h1>
            </div>
            <p className="text-foreground/70 mt-2">Comprehensive analytics across all your campaigns</p>
          </div>
        </div>

        {/* Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="max-w-sm">
              <label className="text-sm font-medium mb-2 block">Campaign</label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Overview Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              {overviewStats.map((stat) => (
                <Card key={stat.label}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts */}
            {analytics?.timeline && analytics.timeline.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Activity Timeline
                  </CardTitle>
                  <CardDescription>Calls and emails over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.timeline}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="calls" stroke="hsl(262, 83%, 58%)" name="Calls" />
                      <Line type="monotone" dataKey="emails" stroke="hsl(142, 76%, 36%)" name="Emails" />
                      <Line type="monotone" dataKey="qualified" stroke="hsl(45, 93%, 47%)" name="Qualified" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Channel Breakdown */}
            {analytics?.channelBreakdown && analytics.channelBreakdown.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Channel Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={analytics.channelBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label
                        >
                          {analytics.channelBreakdown.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Disposition Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics?.dispositions && analytics.dispositions.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={analytics.dispositions}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="disposition" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="hsl(221, 83%, 53%)" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                        No disposition data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Calls + Agent Behaviour */}
            {(analytics?.calls?.total || 0) > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Agent Behaviour Analysis
                    </CardTitle>
                    <CardDescription>
                      Average quality dimensions from analyzed calls
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Overall Behaviour Score</div>
                        <div className="text-2xl font-bold">{analytics?.agentBehavior?.overall || 0}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Analyzed Calls</div>
                        <div className="text-2xl font-bold">{analytics?.agentBehavior?.sampleSize || 0}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Live Calls</div>
                        <div className="text-2xl font-bold">{analytics?.calls?.live || 0}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Sample Calls</div>
                        <div className="text-2xl font-bold">{analytics?.calls?.sample || 0}</div>
                      </div>
                    </div>

                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={behaviorDimensionData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="metric" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="score" fill="hsl(262, 83%, 58%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Calls</CardTitle>
                    <CardDescription>
                      Latest live and sample calls included in analytics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(analytics?.recentCalls || []).length === 0 ? (
                      <div className="text-sm text-muted-foreground py-10 text-center">
                        No calls available yet.
                      </div>
                    ) : (
                      <div className="max-h-[360px] overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Contact</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Disposition</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead>Score</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {analytics.recentCalls.map((call: any) => (
                              <TableRow key={`${call.source}-${call.id}`}>
                                <TableCell className="font-medium">{call.contactName || "Unknown"}</TableCell>
                                <TableCell>
                                  <Badge variant={call.source === "sample" ? "secondary" : "outline"}>
                                    {call.source === "sample" ? "Sample" : "Live"}
                                  </Badge>
                                </TableCell>
                                <TableCell>{(call.disposition || "unknown").replace(/_/g, " ")}</TableCell>
                                <TableCell>{formatDuration(call.duration)}</TableCell>
                                <TableCell>{call.behaviorScore ?? "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Empty State */}
            {(!analytics || (analytics.calls?.total === 0 && analytics.email?.total === 0)) && (
              <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold">No Analytics Data Yet</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">
                    Analytics will populate as your campaigns run and generate engagement data.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ClientPortalLayout>
  );
}
