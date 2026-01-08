import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  TrendingUp, 
  Users, 
  CheckCircle,
  ListChecks,
  BarChart3
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Campaign } from "@shared/schema";

interface CallStats {
  attempted: number;
  connected: number;
  qualified: number;
}

interface CampaignStat extends CallStats {
  campaignId: string;
  campaignName?: string;
}

interface AgentStat extends CallStats {
  agentId: string;
  agentName?: string;
}

interface AnalyticsData {
  overall: CallStats;
  byCampaign: CampaignStat[];
  byAgent: AgentStat[];
}

interface QueueStatus {
  campaignId?: string;
  campaignName?: string;
  total: number;
  queued: number;
  inProgress: number;
  completed: number;
  skipped: number;
  removed: number;
}

const COLORS = {
  attempted: 'hsl(var(--chart-1))',
  connected: 'hsl(var(--chart-2))',
  qualified: 'hsl(var(--chart-3))',
};

export default function CampaignAnalyticsPage() {
  const [selectedCampaignForQueue, setSelectedCampaignForQueue] = useState<string>('all');

  // Fetch call analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics/call-stats'],
  });

  // Fetch campaigns for queue filter
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
  });

  const callCampaigns = campaigns.filter((c: any) => c.type === 'call');

  // Fetch queue status
  const { data: queueStatus, isLoading: queueLoading } = useQuery<QueueStatus>({
    queryKey: ['/api/analytics/queue-status', selectedCampaignForQueue],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaignForQueue !== 'all') {
        params.append('campaignId', selectedCampaignForQueue);
      }
      const response = await fetch(`/api/analytics/queue-status?${params}`);
      return response.json();
    },
  });

  const calculateRate = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-campaign-analytics">Campaign Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive call performance metrics and queue status
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">
            <Phone className="mr-2 h-4 w-4" />
            By Campaign
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Users className="mr-2 h-4 w-4" />
            By Agent
          </TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">
            <ListChecks className="mr-2 h-4 w-4" />
            Queue Status
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {analyticsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading analytics...</div>
          ) : analytics ? (
            <>
              {/* Overall Stats Cards */}
              <div className="grid gap-6 md:grid-cols-3">
                <Card data-testid="card-overall-attempted">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Calls Attempted</CardTitle>
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-overall-attempted">
                      {analytics.overall.attempted.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Total call attempts across all campaigns
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-overall-connected">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Calls Connected</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-overall-connected">
                      {analytics.overall.connected.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {calculateRate(analytics.overall.connected, analytics.overall.attempted)} connection rate
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-overall-qualified">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Qualified Leads</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-overall-qualified">
                      {analytics.overall.qualified.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {calculateRate(analytics.overall.qualified, analytics.overall.attempted)} qualification rate
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Overall Performance Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Overall Performance Metrics</CardTitle>
                  <CardDescription>Visual breakdown of call performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        {
                          name: 'All Campaigns',
                          attempted: analytics.overall.attempted,
                          connected: analytics.overall.connected,
                          qualified: analytics.overall.qualified,
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.375rem'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="attempted" fill={COLORS.attempted} name="Attempted" />
                      <Bar dataKey="connected" fill={COLORS.connected} name="Connected" />
                      <Bar dataKey="qualified" fill={COLORS.qualified} name="Qualified" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No analytics data available</div>
          )}
        </TabsContent>

        {/* BY CAMPAIGN TAB */}
        <TabsContent value="campaigns" className="space-y-6 mt-6">
          {analyticsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading campaign analytics...</div>
          ) : analytics && analytics.byCampaign.length > 0 ? (
            <>
              {/* Campaign Performance Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Performance Comparison</CardTitle>
                  <CardDescription>Call metrics by campaign</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={analytics.byCampaign}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="campaignName" 
                        stroke="hsl(var(--muted-foreground))"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.375rem'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="attempted" fill={COLORS.attempted} name="Attempted" />
                      <Bar dataKey="connected" fill={COLORS.connected} name="Connected" />
                      <Bar dataKey="qualified" fill={COLORS.qualified} name="Qualified" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Campaign Stats Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Campaign</th>
                          <th className="p-3 text-right font-medium">Attempted</th>
                          <th className="p-3 text-right font-medium">Connected</th>
                          <th className="p-3 text-right font-medium">Qualified</th>
                          <th className="p-3 text-right font-medium">Connect Rate</th>
                          <th className="p-3 text-right font-medium">Qualify Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byCampaign.map((campaign) => (
                          <tr key={campaign.campaignId} className="border-b" data-testid={`row-campaign-${campaign.campaignId}`}>
                            <td className="p-3">{campaign.campaignName || campaign.campaignId}</td>
                            <td className="p-3 text-right">{campaign.attempted.toLocaleString()}</td>
                            <td className="p-3 text-right">{campaign.connected.toLocaleString()}</td>
                            <td className="p-3 text-right">{campaign.qualified.toLocaleString()}</td>
                            <td className="p-3 text-right">
                              <Badge variant="outline">
                                {calculateRate(campaign.connected, campaign.attempted)}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              <Badge variant="outline">
                                {calculateRate(campaign.qualified, campaign.attempted)}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No campaign data available</div>
          )}
        </TabsContent>

        {/* BY AGENT TAB */}
        <TabsContent value="agents" className="space-y-6 mt-6">
          {analyticsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading agent analytics...</div>
          ) : analytics && analytics.byAgent.length > 0 ? (
            <>
              {/* Agent Performance Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Agent Performance Comparison</CardTitle>
                  <CardDescription>Call metrics by agent</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={analytics.byAgent}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="agentName" 
                        stroke="hsl(var(--muted-foreground))"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.375rem'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="attempted" fill={COLORS.attempted} name="Attempted" />
                      <Bar dataKey="connected" fill={COLORS.connected} name="Connected" />
                      <Bar dataKey="qualified" fill={COLORS.qualified} name="Qualified" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Agent Stats Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Agent Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Agent</th>
                          <th className="p-3 text-right font-medium">Attempted</th>
                          <th className="p-3 text-right font-medium">Connected</th>
                          <th className="p-3 text-right font-medium">Qualified</th>
                          <th className="p-3 text-right font-medium">Connect Rate</th>
                          <th className="p-3 text-right font-medium">Qualify Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.byAgent.map((agent) => (
                          <tr key={agent.agentId} className="border-b" data-testid={`row-agent-${agent.agentId}`}>
                            <td className="p-3">{agent.agentName || agent.agentId}</td>
                            <td className="p-3 text-right">{agent.attempted.toLocaleString()}</td>
                            <td className="p-3 text-right">{agent.connected.toLocaleString()}</td>
                            <td className="p-3 text-right">{agent.qualified.toLocaleString()}</td>
                            <td className="p-3 text-right">
                              <Badge variant="outline">
                                {calculateRate(agent.connected, agent.attempted)}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              <Badge variant="outline">
                                {calculateRate(agent.qualified, agent.attempted)}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No agent data available</div>
          )}
        </TabsContent>

        {/* QUEUE STATUS TAB */}
        <TabsContent value="queue" className="space-y-6 mt-6">
          {/* Campaign Filter */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Queue Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedCampaignForQueue}
                onValueChange={setSelectedCampaignForQueue}
              >
                <SelectTrigger className="w-full md:w-[300px]" data-testid="select-queue-campaign">
                  <SelectValue placeholder="Select campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {callCampaigns.map((campaign: any) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {queueLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading queue status...</div>
          ) : queueStatus ? (
            <>
              {/* Queue Stats Cards */}
              <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-6">
                <Card data-testid="card-queue-total">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{queueStatus.total.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card data-testid="card-queue-queued">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Queued</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{queueStatus.queued.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card data-testid="card-queue-in-progress">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{queueStatus.inProgress.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card data-testid="card-queue-completed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Completed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{queueStatus.completed.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card data-testid="card-queue-skipped">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Skipped</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{queueStatus.skipped.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card data-testid="card-queue-removed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Removed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{queueStatus.removed.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Queue Status Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Queue Status Breakdown</CardTitle>
                  <CardDescription>
                    {queueStatus.campaignName 
                      ? `Queue status for ${queueStatus.campaignName}`
                      : 'Queue status across all campaigns'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        { name: 'Queued', count: queueStatus.queued },
                        { name: 'In Progress', count: queueStatus.inProgress },
                        { name: 'Completed', count: queueStatus.completed },
                        { name: 'Skipped', count: queueStatus.skipped },
                        { name: 'Removed', count: queueStatus.removed },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.375rem'
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No queue data available</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
