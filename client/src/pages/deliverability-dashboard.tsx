/**
 * Deliverability Dashboard Page
 *
 * Monitor email deliverability metrics, blacklist status, and health scores.
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Flame,
  Globe,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface DashboardData {
  summary: {
    totalDomains: number;
    healthyDomains: number;
    warningDomains: number;
    criticalDomains: number;
    blacklistedDomains: number;
    averageHealthScore: number;
  };
  metrics: {
    totalSent: number;
    delivered: number;
    bounced: number;
    complaints: number;
    opens: number;
    clicks: number;
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
    openRate: number;
    clickRate: number;
  };
  domains: Array<{
    id: number;
    domain: string;
    healthScore: number;
    authenticationScore: number;
    reputationScore: number;
    engagementScore: number;
    blacklistScore: number;
    warmupPhase: string;
    blacklistListings: number;
    spfStatus: string;
    dkimStatus: string;
    dmarcStatus: string;
  }>;
}

interface BlacklistData {
  summary: {
    totalMonitors: number;
    totalListed: number;
    totalClean: number;
  };
  byDomain: Array<{
    domainAuthId: number;
    domain: string;
    totalMonitors: number;
    listed: number;
    clean: number;
    monitors: Array<{
      id: string;
      rblName: string;
      rblDisplayName: string;
      rblCategory: string;
      isListed: boolean;
      listedSince: string | null;
      delistingUrl: string | null;
    }>;
  }>;
}

interface WarmupData {
  domains: Array<{
    domainId: number;
    domain: string;
    phase: string;
    startedAt: string | null;
    currentDay: number;
    totalDays: number;
    completedDays: number;
    progress: number;
    todayTarget: number;
    todayActual: number;
  }>;
  summary: {
    inWarmup: number;
    completed: number;
    notStarted: number;
  };
}

function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  color = 'default',
}: {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ElementType;
  color?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    default: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${colors[color]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            {change > 0 ? (
              <TrendingUp className="h-3 w-3 text-green-600" />
            ) : change < 0 ? (
              <TrendingDown className="h-3 w-3 text-red-600" />
            ) : (
              <ArrowRight className="h-3 w-3" />
            )}
            <span className={change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : ''}>
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </span>
            {changeLabel && <span className="text-muted-foreground">{changeLabel}</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HealthScoreGauge({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getGrade = (s: number) => {
    if (s >= 90) return 'A';
    if (s >= 80) return 'B';
    if (s >= 70) return 'C';
    if (s >= 60) return 'D';
    return 'F';
  };

  const sizeClasses = size === 'lg' ? 'w-32 h-32 text-4xl' : 'w-16 h-16 text-xl';

  return (
    <div className={`${sizeClasses} rounded-full border-4 flex flex-col items-center justify-center ${getColor(score)}`}>
      <span className="font-bold">{score}</span>
      {size === 'lg' && <span className="text-sm">Grade: {getGrade(score)}</span>}
    </div>
  );
}

function DomainHealthRow({ domain }: { domain: DashboardData['domains'][0] }) {
  const getHealthColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getAuthIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          {domain.domain}
        </div>
      </TableCell>
      <TableCell>
        <Badge className={getHealthColor(domain.healthScore)}>
          {domain.healthScore}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {getAuthIcon(domain.spfStatus)}
          {getAuthIcon(domain.dkimStatus)}
          {getAuthIcon(domain.dmarcStatus)}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Progress value={domain.reputationScore} className="w-16 h-2" />
          <span className="text-sm">{domain.reputationScore}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Progress value={domain.engagementScore} className="w-16 h-2" />
          <span className="text-sm">{domain.engagementScore}</span>
        </div>
      </TableCell>
      <TableCell>
        {domain.blacklistListings > 0 ? (
          <Badge variant="destructive">{domain.blacklistListings} listed</Badge>
        ) : (
          <Badge variant="outline" className="bg-green-50 text-green-700">Clean</Badge>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {domain.warmupPhase === 'completed' ? 'Complete' : domain.warmupPhase}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function BlacklistTab() {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<BlacklistData>({
    queryKey: ['blacklists'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/deliverability/blacklists');
      return response.json();
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/deliverability/blacklists/run-scheduled');
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: 'Check complete',
        description: `Checked ${result.checked} monitors. ${result.newListings} new listings found.`,
      });
      refetch();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Monitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.totalMonitors || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clean</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data?.summary.totalClean || 0}</div>
          </CardContent>
        </Card>
        <Card className={data?.summary.totalListed ? 'border-red-200 bg-red-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Listed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{data?.summary.totalListed || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Run Checks Button */}
      <div className="flex justify-end">
        <Button onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
          {checkMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Run Blacklist Checks
        </Button>
      </div>

      {/* Blacklist Details by Domain */}
      {data?.byDomain.map((domainData) => (
        <Card key={domainData.domainAuthId}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                <CardTitle className="text-lg">{domainData.domain}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  {domainData.clean} clean
                </Badge>
                {domainData.listed > 0 && (
                  <Badge variant="destructive">{domainData.listed} listed</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          {domainData.listed > 0 && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RBL</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Listed Since</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domainData.monitors
                    .filter((m) => m.isListed)
                    .map((monitor) => (
                      <TableRow key={monitor.id}>
                        <TableCell className="font-medium">{monitor.rblDisplayName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{monitor.rblCategory}</Badge>
                        </TableCell>
                        <TableCell>
                          {monitor.listedSince
                            ? new Date(monitor.listedSince).toLocaleDateString()
                            : 'Unknown'}
                        </TableCell>
                        <TableCell>
                          {monitor.delistingUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(monitor.delistingUrl!, '_blank')}
                            >
                              Request Delisting
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function WarmupTab() {
  const { data, isLoading } = useQuery<WarmupData>({
    queryKey: ['warmup-schedule'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/deliverability/warmup-schedule');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">In Warmup</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 flex items-center gap-2">
              <Flame className="w-6 h-6" />
              {data?.summary.inWarmup || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data?.summary.completed || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Not Started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{data?.summary.notStarted || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Warmup Progress Table */}
      <Card>
        <CardHeader>
          <CardTitle>Warmup Progress</CardTitle>
          <CardDescription>
            Track the warmup progress for each domain
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Today's Target</TableHead>
                <TableHead>Today's Actual</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.domains.map((domain) => (
                <TableRow key={domain.domainId}>
                  <TableCell className="font-medium">{domain.domain}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        domain.phase === 'completed'
                          ? 'bg-green-50 text-green-700'
                          : domain.phase === 'not_started'
                          ? ''
                          : 'bg-yellow-50 text-yellow-700'
                      }
                    >
                      {domain.phase}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={domain.progress} className="w-24 h-2" />
                      <span className="text-sm">{Math.round(domain.progress)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{domain.todayTarget.toLocaleString()}</TableCell>
                  <TableCell>
                    <span
                      className={
                        domain.todayActual >= domain.todayTarget
                          ? 'text-green-600'
                          : domain.todayActual > 0
                          ? 'text-yellow-600'
                          : ''
                      }
                    >
                      {domain.todayActual.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {domain.startedAt
                      ? new Date(domain.startedAt).toLocaleDateString()
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DeliverabilityDashboardPage() {
  const { toast } = useToast();

  const { data: dashboard, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ['deliverability-dashboard'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/deliverability/dashboard');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deliverability Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor your email deliverability health and metrics
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Average Health Score"
          value={dashboard?.summary.averageHealthScore || 0}
          icon={Shield}
          color={
            (dashboard?.summary.averageHealthScore || 0) >= 80
              ? 'success'
              : (dashboard?.summary.averageHealthScore || 0) >= 60
              ? 'warning'
              : 'danger'
          }
        />
        <MetricCard
          title="Healthy Domains"
          value={dashboard?.summary.healthyDomains || 0}
          icon={ShieldCheck}
          color="success"
        />
        <MetricCard
          title="Warning Domains"
          value={dashboard?.summary.warningDomains || 0}
          icon={AlertTriangle}
          color="warning"
        />
        <MetricCard
          title="Critical Domains"
          value={dashboard?.summary.criticalDomains || 0}
          icon={ShieldAlert}
          color="danger"
        />
        <MetricCard
          title="Blacklisted"
          value={dashboard?.summary.blacklistedDomains || 0}
          icon={XCircle}
          color={dashboard?.summary.blacklistedDomains ? 'danger' : 'default'}
        />
      </div>

      {/* Sending Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Sending Metrics
          </CardTitle>
          <CardDescription>Email delivery performance over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{(dashboard?.metrics.totalSent || 0).toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Total Sent</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {(dashboard?.metrics.deliveryRate || 0).toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground">Delivery Rate</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">
                {(dashboard?.metrics.bounceRate || 0).toFixed(2)}%
              </p>
              <p className="text-sm text-muted-foreground">Bounce Rate</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {(dashboard?.metrics.openRate || 0).toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground">Open Rate</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">
                {(dashboard?.metrics.clickRate || 0).toFixed(2)}%
              </p>
              <p className="text-sm text-muted-foreground">Click Rate</p>
            </div>
          </div>

          {(dashboard?.metrics.complaintRate || 0) > 0.1 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">High Complaint Rate Warning</span>
              </div>
              <p className="text-sm text-red-700 mt-1">
                Your complaint rate ({(dashboard?.metrics.complaintRate || 0).toFixed(3)}%) is above
                the recommended threshold of 0.1%. This can impact deliverability.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs for detailed views */}
      <Tabs defaultValue="domains" className="space-y-4">
        <TabsList>
          <TabsTrigger value="domains">Domain Health</TabsTrigger>
          <TabsTrigger value="blacklists">Blacklist Monitor</TabsTrigger>
          <TabsTrigger value="warmup">Warmup Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="domains">
          <Card>
            <CardHeader>
              <CardTitle>Domain Health Overview</CardTitle>
              <CardDescription>
                Health scores and status for all configured domains
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Health Score</TableHead>
                    <TableHead>Authentication</TableHead>
                    <TableHead>Reputation</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead>Blacklist</TableHead>
                    <TableHead>Warmup</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard?.domains.map((domain) => (
                    <DomainHealthRow key={domain.id} domain={domain} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blacklists">
          <BlacklistTab />
        </TabsContent>

        <TabsContent value="warmup">
          <WarmupTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
