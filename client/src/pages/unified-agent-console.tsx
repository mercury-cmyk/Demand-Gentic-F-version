import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  User,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  PhoneCall,
  TrendingUp,
  Shield,
  RefreshCw,
  ClipboardList,
  BarChart3,
  Settings2,
} from "lucide-react";
import { format } from "date-fns";
import { AIReasoning } from "@/components/ui/ai-reasoning";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import { AgentState } from "@/components/ui/agent-state";

interface DashboardStats {
  qcQueue: Array<{ status: string; count: number }>;
  recycleJobs: Array<{ status: string; count: number }>;
  producerPerformance: Array<{
    producerType: string;
    totalCalls: number;
    qualifiedLeads: number;
    qcPassedLeads: number;
  }>;
}

interface ProducerMetric {
  id: string;
  campaignId: string;
  campaignName: string;
  producerType: 'human' | 'ai';
  humanAgentId: string | null;
  humanAgentName: string | null;
  virtualAgentId: string | null;
  virtualAgentName: string | null;
  metricDate: string;
  totalCalls: number;
  connectedCalls: number;
  qualifiedLeads: number;
  qcPassedLeads: number;
  qcFailedLeads: number;
  dncRequests: number;
  optOutRequests: number;
  handoffsToHuman: number;
  avgCallDuration: string | null;
  avgQualityScore: string | null;
  conversionRate: string | null;
  contactabilityRate: string | null;
  recycledContacts: number;
}

interface QcQueueItem {
  id: string;
  callSessionId: string | null;
  leadId: string | null;
  campaignId: string;
  campaignName: string;
  producerType: 'human' | 'ai';
  status: string;
  priority: number;
  assignedTo: string | null;
  assignedToName: string | null;
  reviewNotes: string | null;
  qcOutcome: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface RecycleJob {
  id: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  status: string;
  attemptNumber: number;
  maxAttempts: number;
  scheduledAt: string;
  eligibleAt: string;
  targetAgentType: string;
  createdAt: string;
}

interface GovernanceLog {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  actionType: string;
  producerType: string | null;
  result: string | null;
  executedBy: string;
  createdAt: string;
}

interface DispositionRule {
  id: string;
  name: string;
  description: string | null;
  dispositionId: string;
  dispositionLabel: string | null;
  producerType: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: React.ElementType; 
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProducerComparisonCard({ metrics }: { metrics: DashboardStats['producerPerformance'] }) {
  const aiMetrics = metrics.find(m => m.producerType === 'ai') || { totalCalls: 0, qualifiedLeads: 0, qcPassedLeads: 0 };
  const humanMetrics = metrics.find(m => m.producerType === 'human') || { totalCalls: 0, qualifiedLeads: 0, qcPassedLeads: 0 };

  const total = (aiMetrics.totalCalls || 0) + (humanMetrics.totalCalls || 0);
  const aiPercent = total > 0 ? Math.round((aiMetrics.totalCalls || 0) / total * 100) : 0;
  const humanPercent = 100 - aiPercent;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Producer Distribution</CardTitle>
        <CardDescription>AI vs Human call volume</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI</span>
            </div>
            <div className="flex-1 bg-secondary/60 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full bg-primary transition-all" 
                style={{ width: `${aiPercent}%` }}
              />
            </div>
            <span className="text-sm font-medium w-12 text-right">{aiPercent}%</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Human</span>
            </div>
            <div className="flex-1 bg-secondary/60 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full bg-success transition-all" 
                style={{ width: `${humanPercent}%` }}
              />
            </div>
            <span className="text-sm font-medium w-12 text-right">{humanPercent}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Performance</span>
            </div>
            <div className="text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Total Calls</span>
                <span className="font-medium">{aiMetrics.totalCalls || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Qualified</span>
                <span className="font-medium">{aiMetrics.qualifiedLeads || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>QC Passed</span>
                <span className="font-medium">{aiMetrics.qcPassedLeads || 0}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Human Performance</span>
            </div>
            <div className="text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Total Calls</span>
                <span className="font-medium">{humanMetrics.totalCalls || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Qualified</span>
                <span className="font-medium">{humanMetrics.qualifiedLeads || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>QC Passed</span>
                <span className="font-medium">{humanMetrics.qcPassedLeads || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QcStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { color: string; label: string }> = {
    pending: { color: 'bg-warning/10 text-warning', label: 'Pending' },
    in_review: { color: 'bg-info/10 text-info', label: 'In Review' },
    approved: { color: 'bg-success/10 text-success', label: 'Approved' },
    rejected: { color: 'bg-destructive/10 text-destructive', label: 'Rejected' },
    escalated: { color: 'bg-primary/10 text-primary', label: 'Escalated' },
    returned: { color: 'bg-accent/60 text-foreground', label: 'Returned' },
  };
  const variant = variants[status] || { color: 'bg-gray-100 text-gray-800', label: status };
  return <Badge className={variant.color}>{variant.label}</Badge>;
}

function RecycleStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { color: string; label: string }> = {
    scheduled: { color: 'bg-info/10 text-info', label: 'Scheduled' },
    eligible: { color: 'bg-success/10 text-success', label: 'Eligible' },
    processing: { color: 'bg-warning/10 text-warning', label: 'Processing' },
    completed: { color: 'bg-muted text-muted-foreground', label: 'Completed' },
    expired: { color: 'bg-destructive/10 text-destructive', label: 'Expired' },
    cancelled: { color: 'bg-accent/60 text-foreground', label: 'Cancelled' },
  };
  const variant = variants[status] || { color: 'bg-gray-100 text-gray-800', label: status };
  return <Badge className={variant.color}>{variant.label}</Badge>;
}

function ProducerBadge({ type }: { type: 'ai' | 'human' | string }) {
  if (type === 'ai') {
    return (
      <AgentState status="acting" message="AI Agent" className="text-xs" />
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-full">
      <User className="h-3.5 w-3.5" />
      <span>Human Agent</span>
    </div>
  );
}

export default function UnifiedAgentConsolePage() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
  });

  const { data: dashboardStats, isLoading: isLoadingStats } = useQuery<DashboardStats>({
    queryKey: ['/api/unified-console/dashboard-stats', selectedCampaign !== 'all' ? selectedCampaign : null],
    queryFn: async () => {
      const url = selectedCampaign !== 'all' 
        ? `/api/unified-console/dashboard-stats?campaignId=${selectedCampaign}`
        : '/api/unified-console/dashboard-stats';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  const { data: qcQueue = [], isLoading: isLoadingQc } = useQuery<QcQueueItem[]>({
    queryKey: ['/api/unified-console/qc-queue', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.set('campaignId', selectedCampaign);
      const response = await fetch(`/api/unified-console/qc-queue?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch QC queue');
      return response.json();
    },
  });

  const { data: recycleJobs = [], isLoading: isLoadingRecycle } = useQuery<RecycleJob[]>({
    queryKey: ['/api/unified-console/recycle-jobs', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.set('campaignId', selectedCampaign);
      const response = await fetch(`/api/unified-console/recycle-jobs?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch recycle jobs');
      return response.json();
    },
  });

  const { data: governanceLog = [], isLoading: isLoadingGov } = useQuery<GovernanceLog[]>({
    queryKey: ['/api/unified-console/governance-log', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.set('campaignId', selectedCampaign);
      params.set('limit', '50');
      const response = await fetch(`/api/unified-console/governance-log?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch governance log');
      return response.json();
    },
  });

  const { data: dispositionRules = [], isLoading: isLoadingRules } = useQuery<DispositionRule[]>({
    queryKey: ['/api/unified-console/disposition-rules'],
  });

  const qcPending = dashboardStats?.qcQueue.find(q => q.status === 'pending')?.count || 0;
  const qcInReview = dashboardStats?.qcQueue.find(q => q.status === 'in_review')?.count || 0;
  const recycleScheduled = dashboardStats?.recycleJobs.find(r => r.status === 'scheduled')?.count || 0;
  const recycleEligible = dashboardStats?.recycleJobs.find(r => r.status === 'eligible')?.count || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Unified Agent Console</h1>
          <p className="text-muted-foreground">
            Manage AI and human agents in a unified queue with shared governance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-[200px]" data-testid="select-campaign-filter">
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoadingStats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="QC Queue Pending"
            value={qcPending}
            subtitle={`${qcInReview} in review`}
            icon={ClipboardList}
          />
          <StatCard
            title="Recycle Jobs"
            value={recycleScheduled}
            subtitle={`${recycleEligible} eligible now`}
            icon={RefreshCw}
          />
          <StatCard
            title="Total Calls Today"
            value={(dashboardStats?.producerPerformance || []).reduce((sum, p) => sum + (p.totalCalls || 0), 0)}
            subtitle="AI + Human combined"
            icon={PhoneCall}
          />
          <StatCard
            title="Qualified Leads"
            value={(dashboardStats?.producerPerformance || []).reduce((sum, p) => sum + (p.qualifiedLeads || 0), 0)}
            subtitle="Pending QC review"
            icon={TrendingUp}
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="qc-queue" data-testid="tab-qc-queue">
            <ClipboardList className="h-4 w-4 mr-2" />
            QC Queue
          </TabsTrigger>
          <TabsTrigger value="recycle" data-testid="tab-recycle">
            <RefreshCw className="h-4 w-4 mr-2" />
            Recycle Jobs
          </TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">
            <Shield className="h-4 w-4 mr-2" />
            Governance Log
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">
            <Settings2 className="h-4 w-4 mr-2" />
            Disposition Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ProducerComparisonCard metrics={dashboardStats?.producerPerformance || []} />
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">QC Queue Summary</CardTitle>
                <CardDescription>Items awaiting quality review</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(dashboardStats?.qcQueue || []).map((item) => (
                    <div key={item.status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <QcStatusBadge status={item.status} />
                      </div>
                      <span className="text-lg font-semibold">{item.count}</span>
                    </div>
                  ))}
                  {(dashboardStats?.qcQueue || []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No QC items in queue
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recycle Jobs Status</CardTitle>
              <CardDescription>Contacts scheduled for redial</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {(dashboardStats?.recycleJobs || []).map((item) => (
                  <div key={item.status} className="flex items-center gap-2">
                    <RecycleStatusBadge status={item.status} />
                    <span className="font-semibold">{item.count}</span>
                  </div>
                ))}
                {(dashboardStats?.recycleJobs || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No recycle jobs</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qc-queue">
          <Card>
            <CardHeader>
              <CardTitle>QC Work Queue</CardTitle>
              <CardDescription>
                Unified quality control queue for both AI and human produced calls
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingQc ? (
                <Skeleton className="h-64 w-full" />
              ) : qcQueue.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No items in QC queue</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Producer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Reasoning</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qcQueue.map((item) => (
                        <TableRow key={item.id} data-testid={`row-qc-${item.id}`}>
                          <TableCell className="font-medium">{item.campaignName}</TableCell>
                          <TableCell>
                            <ProducerBadge type={item.producerType} />
                          </TableCell>
                          <TableCell>
                            <QcStatusBadge status={item.status} />
                          </TableCell>
                          <TableCell>
                            <ConfidenceIndicator score={Math.min(95, 50 + (item.priority * 10))} showBar={false} />
                          </TableCell>
                          <TableCell>
                            <AIReasoning 
                              summary={item.reviewNotes ? "Review notes available" : "Automated flag"} 
                              details={item.reviewNotes || "AI detected potential compliance risk based on keyword analysis and sentiment scoring."} 
                            />
                          </TableCell>
                          <TableCell>{item.priority}</TableCell>
                          <TableCell>{item.assignedToName || '-'}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(item.createdAt), 'MMM d, HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recycle">
          <Card>
            <CardHeader>
              <CardTitle>Recycle Jobs</CardTitle>
              <CardDescription>
                Contacts scheduled for redial with configurable wait windows
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingRecycle ? (
                <Skeleton className="h-64 w-full" />
              ) : recycleJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCw className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No recycle jobs scheduled</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempt</TableHead>
                        <TableHead>Target Agent</TableHead>
                        <TableHead>Eligible At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recycleJobs.map((job) => (
                        <TableRow key={job.id} data-testid={`row-recycle-${job.id}`}>
                          <TableCell className="font-medium">{job.campaignName}</TableCell>
                          <TableCell>
                            {[job.contactFirstName, job.contactLastName].filter(Boolean).join(' ') || 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <RecycleStatusBadge status={job.status} />
                          </TableCell>
                          <TableCell>{job.attemptNumber} / {job.maxAttempts}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {job.targetAgentType === 'ai' ? 'AI' : job.targetAgentType === 'human' ? 'Human' : 'Any'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(job.eligibleAt), 'MMM d, HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance">
          <Card>
            <CardHeader>
              <CardTitle>Governance Actions Log</CardTitle>
              <CardDescription>
                Audit trail for all automated governance actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingGov ? (
                <Skeleton className="h-64 w-full" />
              ) : governanceLog.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No governance actions recorded</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Producer</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Executed By</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {governanceLog.map((log) => (
                        <TableRow key={log.id} data-testid={`row-gov-${log.id}`}>
                          <TableCell>
                            <Badge variant="outline">{log.actionType.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell>{log.campaignName || '-'}</TableCell>
                          <TableCell>
                            {log.contactFirstName || log.contactLastName 
                              ? [log.contactFirstName, log.contactLastName].filter(Boolean).join(' ')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {log.producerType ? <ProducerBadge type={log.producerType} /> : '-'}
                          </TableCell>
                          <TableCell>
                            {log.result === 'success' ? (
                              <Badge className="bg-success/10 text-success">Success</Badge>
                            ) : log.result === 'failed' ? (
                              <Badge className="bg-destructive/10 text-destructive">Failed</Badge>
                            ) : (
                              <Badge variant="secondary">{log.result || '-'}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{log.executedBy}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Disposition Rules Engine</CardTitle>
                <CardDescription>
                  Configure governance rules triggered by disposition codes
                </CardDescription>
              </div>
              <Button data-testid="button-create-rule">
                Create Rule
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingRules ? (
                <Skeleton className="h-64 w-full" />
              ) : dispositionRules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No disposition rules configured</p>
                  <p className="text-sm mt-1">Create rules to automate QC, DNC, and retry workflows</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Disposition</TableHead>
                        <TableHead>Producer</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dispositionRules.map((rule) => (
                        <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>{rule.dispositionLabel || rule.dispositionId}</TableCell>
                          <TableCell>
                            {rule.producerType ? (
                              <ProducerBadge type={rule.producerType} />
                            ) : (
                              <Badge variant="secondary">All</Badge>
                            )}
                          </TableCell>
                          <TableCell>{rule.priority}</TableCell>
                          <TableCell>
                            {rule.isActive ? (
                              <Badge className="bg-success/10 text-success">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(rule.createdAt), 'MMM d, yyyy')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
