import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignPerformanceSnapshot } from "@/components/campaigns/campaign-performance-snapshot";
import { 
  ArrowLeft,
  Mail, 
  MousePointerClick,
  Eye,
  Ban,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  RefreshCw,
  Download,
  ExternalLink
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Color palette for charts
const COLORS = {
  sent: '#3b82f6',      // blue
  delivered: '#22c55e',  // green
  opened: '#8b5cf6',     // purple
  clicked: '#f59e0b',    // amber
  bounced: '#ef4444',    // red
  unsubscribed: '#6b7280', // gray
};

const PIE_COLORS = ['#22c55e', '#8b5cf6', '#f59e0b', '#ef4444', '#6b7280'];

interface EmailCampaignStats {
  campaignId: string;
  campaignName: string;
  status: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  opened: number;
  uniqueOpens: number;
  clicked: number;
  uniqueClicks: number;
  bounced: number;
  hardBounces: number;
  softBounces: number;
  unsubscribed: number;
  spamComplaints: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  bounceRate: number;
  unsubscribeRate: number;
}

interface LinkClickStats {
  url: string;
  clicks: number;
  uniqueClicks: number;
  percentage: number;
}

interface DeviceStats {
  device: string;
  count: number;
  percentage: number;
}

interface TimelineData {
  timestamp: string;
  opens: number;
  clicks: number;
  cumulative_opens: number;
  cumulative_clicks: number;
}

interface RecipientActivity {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  status: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed';
  openedAt?: string;
  clickedAt?: string;
  clickCount: number;
  deviceType?: string;
}

export default function EmailCampaignReportsPage() {
  const [, params] = useRoute("/campaigns/email/:id/reports");
  const campaignId = params?.id;
  const [dateRange, setDateRange] = useState<string>("7d");
  
  // Fetch campaign stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<EmailCampaignStats>({
    queryKey: ['/api/campaigns/email', campaignId, 'stats'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/email-stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch link click breakdown
  const { data: linkStats = [] } = useQuery<LinkClickStats[]>({
    queryKey: ['/api/campaigns/email', campaignId, 'link-stats'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/link-stats`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch device breakdown
  const { data: deviceStats = [] } = useQuery<DeviceStats[]>({
    queryKey: ['/api/campaigns/email', campaignId, 'device-stats'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/device-stats`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch engagement timeline
  const { data: timeline = [] } = useQuery<TimelineData[]>({
    queryKey: ['/api/campaigns/email', campaignId, 'timeline', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/engagement-timeline?range=${dateRange}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch recipient activity
  const { data: recipients = [] } = useQuery<RecipientActivity[]>({
    queryKey: ['/api/campaigns/email', campaignId, 'recipients'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/recipient-activity?limit=100`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Calculate funnel data
  const funnelData = stats ? [
    { stage: 'Sent', value: stats.totalSent, color: COLORS.sent },
    { stage: 'Delivered', value: stats.delivered, color: COLORS.delivered },
    { stage: 'Opened', value: stats.uniqueOpens, color: COLORS.opened },
    { stage: 'Clicked', value: stats.uniqueClicks, color: COLORS.clicked },
  ] : [];

  // Status distribution for pie chart
  const statusDistribution = stats ? [
    { name: 'Delivered', value: stats.delivered - stats.uniqueOpens, color: COLORS.delivered },
    { name: 'Opened', value: stats.uniqueOpens - stats.uniqueClicks, color: COLORS.opened },
    { name: 'Clicked', value: stats.uniqueClicks, color: COLORS.clicked },
    { name: 'Bounced', value: stats.bounced, color: COLORS.bounced },
    { name: 'Unsubscribed', value: stats.unsubscribed, color: COLORS.unsubscribed },
  ].filter(item => item.value > 0) : [];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatPercent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      delivered: "secondary",
      opened: "default",
      clicked: "default",
      bounced: "destructive",
      unsubscribed: "outline",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  const performanceSnapshot = stats ? {
    email: {
      totalRecipients: stats.totalSent || 0,
      delivered: stats.delivered || 0,
      opens: stats.uniqueOpens || 0,
      clicks: stats.uniqueClicks || 0,
      unsubscribes: stats.unsubscribed || 0,
      spamComplaints: stats.spamComplaints || 0,
    },
    call: null,
  } : null;

  if (!campaignId) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Campaign not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/campaigns/email">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-campaign-reports">
              {statsLoading ? <Skeleton className="h-8 w-64" /> : stats?.campaignName || 'Campaign Reports'}
            </h1>
            <p className="text-muted-foreground mt-1">
              Email campaign performance analytics and engagement metrics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetchStats()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <CampaignPerformanceSnapshot
        data={performanceSnapshot}
        isLoading={statsLoading}
      />

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Mail className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatNumber(stats?.totalSent || 0)}</div>
                <p className="text-xs text-muted-foreground">Total emails sent</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatPercent(stats?.deliveryRate || 0)}</div>
                <p className="text-xs text-muted-foreground">{formatNumber(stats?.delivered || 0)} delivered</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
            <Eye className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatPercent(stats?.openRate || 0)}</div>
                <p className="text-xs text-muted-foreground">{formatNumber(stats?.uniqueOpens || 0)} unique opens</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
            <MousePointerClick className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatPercent(stats?.clickRate || 0)}</div>
                <p className="text-xs text-muted-foreground">{formatNumber(stats?.uniqueClicks || 0)} unique clicks</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounced</CardTitle>
            <Ban className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatPercent(stats?.bounceRate || 0)}</div>
                <p className="text-xs text-muted-foreground">{formatNumber(stats?.bounced || 0)} bounces</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unsubscribed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatPercent(stats?.unsubscribeRate || 0)}</div>
                <p className="text-xs text-muted-foreground">{formatNumber(stats?.unsubscribed || 0)} unsubscribes</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different report views */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="engagement">
            <TrendingUp className="mr-2 h-4 w-4" />
            Engagement
          </TabsTrigger>
          <TabsTrigger value="links">
            <ExternalLink className="mr-2 h-4 w-4" />
            Link Clicks
          </TabsTrigger>
          <TabsTrigger value="recipients">
            <Users className="mr-2 h-4 w-4" />
            Recipients
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Engagement Funnel */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement Funnel</CardTitle>
                <CardDescription>Email delivery and engagement progression</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={funnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="stage" width={80} />
                    <Tooltip 
                      formatter={(value: number) => [formatNumber(value), 'Count']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {funnelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Status Distribution Pie */}
            <Card>
              <CardHeader>
                <CardTitle>Status Distribution</CardTitle>
                <CardDescription>Breakdown of email statuses</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatNumber(value), 'Recipients']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Device Breakdown */}
          {deviceStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Device Breakdown</CardTitle>
                <CardDescription>Opens by device type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deviceStats.map((device) => (
                    <div key={device.device} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize">{device.device}</span>
                        <span className="text-muted-foreground">
                          {device.count} ({device.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <Progress value={device.percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Engagement Timeline Tab */}
        <TabsContent value="engagement" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Engagement Over Time</CardTitle>
              <CardDescription>Opens and clicks throughout the campaign</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                    formatter={(value: number, name: string) => [
                      formatNumber(value), 
                      name === 'opens' ? 'Opens' : 'Clicks'
                    ]}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="opens" 
                    stackId="1"
                    stroke={COLORS.opened} 
                    fill={COLORS.opened}
                    fillOpacity={0.6}
                    name="Opens"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="clicks" 
                    stackId="2"
                    stroke={COLORS.clicked} 
                    fill={COLORS.clicked}
                    fillOpacity={0.6}
                    name="Clicks"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cumulative Engagement */}
          <Card>
            <CardHeader>
              <CardTitle>Cumulative Engagement</CardTitle>
              <CardDescription>Total opens and clicks over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="cumulative_opens" 
                    stroke={COLORS.opened} 
                    strokeWidth={2}
                    dot={false}
                    name="Total Opens"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cumulative_clicks" 
                    stroke={COLORS.clicked} 
                    strokeWidth={2}
                    dot={false}
                    name="Total Clicks"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Link Clicks Tab */}
        <TabsContent value="links" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Link Performance</CardTitle>
              <CardDescription>Click breakdown by URL</CardDescription>
            </CardHeader>
            <CardContent>
              {linkStats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No link clicks recorded yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">Total Clicks</TableHead>
                      <TableHead className="text-right">Unique Clicks</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkStats.map((link, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm max-w-md truncate">
                          <a 
                            href={link.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {link.url.length > 60 ? `${link.url.slice(0, 60)}...` : link.url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(link.clicks)}</TableCell>
                        <TableCell className="text-right">{formatNumber(link.uniqueClicks)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={link.percentage} className="w-16 h-2" />
                            <span className="text-sm">{link.percentage.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Link Click Chart */}
          {linkStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Click Distribution</CardTitle>
                <CardDescription>Visual breakdown of link clicks</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={linkStats.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis 
                      type="category" 
                      dataKey="url" 
                      width={200}
                      tickFormatter={(value) => value.length > 30 ? `${value.slice(0, 30)}...` : value}
                    />
                    <Tooltip />
                    <Bar dataKey="clicks" fill={COLORS.clicked} radius={[0, 4, 4, 0]} name="Clicks" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Recipients Tab */}
        <TabsContent value="recipients" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recipient Activity</CardTitle>
              <CardDescription>Individual recipient engagement details</CardDescription>
            </CardHeader>
            <CardContent>
              {recipients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No recipient data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Clicks</TableHead>
                      <TableHead>Device</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.map((recipient, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {recipient.firstName} {recipient.lastName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {recipient.email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{recipient.company || '-'}</TableCell>
                        <TableCell>{getStatusBadge(recipient.status)}</TableCell>
                        <TableCell>
                          {recipient.openedAt 
                            ? new Date(recipient.openedAt).toLocaleString() 
                            : '-'
                          }
                        </TableCell>
                        <TableCell>{recipient.clickCount || 0}</TableCell>
                        <TableCell className="capitalize">
                          {recipient.deviceType || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
