
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bot,
  Phone, 
  TrendingUp, 
  Users, 
  Calendar,
  CheckCircle,
  XCircle,
  Voicemail,
  PhoneOff,
  Ban,
  Download,
  ExternalLink,
  Clock
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
  Legend
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { useAuth } from "@/contexts/AuthContext";
import { AiCallAnalyticsPanel } from "@/pages/ai-call-analytics";

const COLORS = {
  qualified: 'hsl(var(--chart-2))',
  not_interested: 'hsl(var(--chart-1))',
  voicemail: 'hsl(var(--chart-3))',
  no_answer: 'hsl(var(--chart-4))',
  dnc_request: 'hsl(var(--destructive))',
  busy: 'hsl(var(--chart-5))',
  callback_requested: 'hsl(var(--primary))',
};

const QA_COLORS = {
  approved: 'hsl(var(--chart-2))',
  rejected: 'hsl(var(--destructive))',
  pending_review: 'hsl(var(--chart-3))',
};

export default function CallReportsPage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canViewAiAnalytics = user?.role === 'admin' || user?.role === 'campaign_manager';

  const getRequestedTab = (path: string) => {
    const queryIndex = path.indexOf("?");
    if (queryIndex === -1) return null;
    const params = new URLSearchParams(path.slice(queryIndex + 1));
    return params.get("tab");
  };

  const setTabParam = (nextTab?: string) => {
    const [path, search = ""] = location.split("?");
    const params = new URLSearchParams(search);
    if (nextTab) {
      params.set("tab", nextTab);
    } else {
      params.delete("tab");
    }
    const nextSearch = params.toString();
    const nextLocation = nextSearch ? `${path}?${nextSearch}` : path;
    if (nextLocation !== location) {
      setLocation(nextLocation);
    }
  };
  
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<string>(isAdmin ? 'all' : user?.id || '');
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = getRequestedTab(location);
    if (requestedTab === 'ai' && canViewAiAnalytics) {
      return 'ai';
    }
    return 'global';
  });

  useEffect(() => {
    if (getRequestedTab(location) === 'ai' && canViewAiAnalytics) {
      setActiveTab('ai');
      setTabParam(undefined);
    }
  }, [location, canViewAiAnalytics]);
  
  // Fetch campaigns
  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });
  
  const callCampaigns = campaigns.filter((c: any) => c.type === 'call');
  
  // Fetch queue stats (shows progress even before calls are made)
  const queueParams = new URLSearchParams();
  if (selectedCampaign !== 'all') queueParams.append('campaignId', selectedCampaign);
  const { data: queueStats } = useQuery({
    queryKey: ['/api/reports/calls/queue/global', selectedCampaign],
    queryFn: async () => {
      const response = await fetch(`/api/reports/calls/queue/global${queueParams.toString() ? '?' + queueParams.toString() : ''}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch queue stats');
      return response.json();
    },
  });
  
  // Fetch agents
  const { data: agents = [] } = useQuery({
    queryKey: ['/api/agents'],
    queryFn: async () => {
      const response = await fetch('/api/agents', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch agents');
      return response.json();
    },
    enabled: isAdmin,
  });
  
  // Fetch global stats
  const globalParams = new URLSearchParams();
  if (dateRange.from) globalParams.append('from', dateRange.from);
  if (dateRange.to) globalParams.append('to', dateRange.to);
  if (selectedCampaign !== 'all') globalParams.append('campaignId', selectedCampaign);
  const { data: globalStats, isLoading: globalLoading } = useQuery({
    queryKey: ['/api/reports/calls/global', dateRange, selectedCampaign],
    queryFn: async () => {
      const response = await fetch(`/api/reports/calls/global${globalParams.toString() ? '?' + globalParams.toString() : ''}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch global stats');
      return response.json();
    },
  });
  
  // Fetch campaign-specific stats
  const campaignParams = new URLSearchParams();
  if (dateRange.from) campaignParams.append('from', dateRange.from);
  if (dateRange.to) campaignParams.append('to', dateRange.to);
  const { data: campaignStats, isLoading: campaignLoading } = useQuery({
    queryKey: ['/api/reports/calls/campaign', selectedCampaign, dateRange],
    queryFn: async () => {
      const response = await fetch(`/api/reports/calls/campaign/${selectedCampaign}${campaignParams.toString() ? '?' + campaignParams.toString() : ''}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch campaign stats');
      return response.json();
    },
    enabled: selectedCampaign !== 'all' && activeTab === 'campaign',
  });
  
  // Fetch agent-specific stats
  const { data: agentStats, isLoading: agentLoading } = useQuery({
    queryKey: ['/api/reports/calls/agent', selectedAgent, dateRange, selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.from) params.append('from', dateRange.from);
      if (dateRange.to) params.append('to', dateRange.to);
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      
      const response = await fetch(`/api/reports/calls/agent/${selectedAgent}?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch agent stats');
      return response.json();
    },
    enabled: selectedAgent !== 'all' && activeTab === 'agent',
  });
  
  const handleDispositionClick = (disposition: string) => {
    const params = new URLSearchParams();
    if (dateRange.from) params.append('from', dateRange.from);
    if (dateRange.to) params.append('to', dateRange.to);
    if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
    if (selectedAgent !== 'all') params.append('agentId', selectedAgent);
    params.append('disposition', disposition);
    
    setLocation(`/call-reports/details?${params}`);
  };
  
  const handleQAStatusClick = (status: string) => {
    const params = new URLSearchParams();
    if (dateRange.from) params.append('from', dateRange.from);
    if (dateRange.to) params.append('to', dateRange.to);
    if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
    if (selectedAgent !== 'all') params.append('agentId', selectedAgent);
    params.append('qaStatus', status);
    
    setLocation(`/call-reports/details?${params}`);
  };
  
  const getDispositionIcon = (disposition: string) => {
    switch (disposition) {
      case 'qualified': return CheckCircle;
      case 'not_interested': return XCircle;
      case 'voicemail': return Voicemail;
      case 'no_answer': return PhoneOff;
      case 'dnc_request': return Ban;
      default: return Phone;
    }
  };
  
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="space-y-6 md:space-y-8 pb-8">
      {/* Modern Header with Gradient */}
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-6 md:p-8 border border-primary/20 shadow-smooth-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg">
                <Phone className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight" data-testid="text-page-title">Call Campaign Reports</h1>
            </div>
            <p className="text-foreground/70 mt-2">Comprehensive analytics and performance metrics for all telemarketing campaigns</p>
          </div>
          <Button variant="outline" className="shadow-sm" data-testid="button-export">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>
      
      {/* Filters */}
      {activeTab !== 'ai' && (
        <Card className="border-0 shadow-smooth-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Report Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <DateRangeFilter
                  label="Date Range"
                  value={dateRange}
                  onChange={setDateRange}
                  testId="filter-date-range"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Campaign</label>
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger data-testid="select-campaign">
                    <SelectValue />
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
              </div>
              
              {isAdmin && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Agent</label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger data-testid="select-agent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {agents.map((agent: any) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.firstName} {agent.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Queue Progress Overview - Shows even when no calls exist */}
      {activeTab !== 'ai' && queueStats && queueStats.summary?.totalContacts > 0 && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Campaign Queue Progress
                </CardTitle>
                <CardDescription>
                  {(!globalStats || globalStats.summary?.totalCalls === 0)
                    ? "Contacts are ready to call - Start making calls to see call reports" 
                    : "Queue readiness across all campaigns"}
                </CardDescription>
              </div>
              {selectedCampaign !== 'all' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setLocation(`/campaigns/phone/${selectedCampaign}/queue`)}
                  data-testid="button-manage-queue"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Queue
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Contacts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{queueStats.summary.totalContacts.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">Ready in queue</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Queued</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{queueStats.summary.queued.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting call</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{queueStats.summary.inProgress.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">Currently calling</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{queueStats.summary.completed.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">Calls finished</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="global" data-testid="tab-global">
            <TrendingUp className="mr-2 h-4 w-4" />
            Global Overview
          </TabsTrigger>
          {selectedCampaign !== 'all' && (
            <TabsTrigger value="campaign" data-testid="tab-campaign">
              <Phone className="mr-2 h-4 w-4" />
              Campaign Details
            </TabsTrigger>
          )}
          {selectedAgent !== 'all' && (
            <TabsTrigger value="agent" data-testid="tab-agent">
              <Users className="mr-2 h-4 w-4" />
              Agent Performance
            </TabsTrigger>
          )}
          {canViewAiAnalytics && (
            <TabsTrigger value="ai" data-testid="tab-ai">
              <Bot className="mr-2 h-4 w-4" />
              AI Call Analytics
            </TabsTrigger>
          )}
        </TabsList>
        
        {/* Global Overview */}
        <TabsContent value="global" className="space-y-6">
          {globalLoading ? (
            <div className="text-center py-12">Loading...</div>
          ) : globalStats ? (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{globalStats.summary.totalCalls.toLocaleString()}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatDuration(globalStats.summary.totalDuration)}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatDuration(globalStats.summary.avgDuration)}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{globalStats.campaignBreakdown.length}</div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Disposition Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Call Dispositions</CardTitle>
                  <CardDescription>Click on any metric to view detailed call list</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {globalStats.dispositions.map((disp: any) => {
                      const Icon = getDispositionIcon(disp.disposition);
                      return (
                        <Card 
                          key={disp.disposition}
                          className="cursor-pointer hover:shadow-lg transition-shadow"
                          onClick={() => handleDispositionClick(disp.disposition)}
                          data-testid={`card-disposition-${disp.disposition}`}
                        >
                          <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-2">
                              <Icon className="h-5 w-5" />
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <div className="text-2xl font-bold">{disp.count}</div>
                            <p className="text-xs text-muted-foreground capitalize">
                              {disp.disposition.replace(/_/g, ' ')}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              
              {/* QA Stats */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>QA Status Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {globalStats.qaStats.map((qa: any) => (
                        <div 
                          key={qa.qaStatus}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => handleQAStatusClick(qa.qaStatus)}
                          data-testid={`qa-status-${qa.qaStatus}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant={qa.qaStatus === 'approved' ? 'default' : qa.qaStatus === 'rejected' ? 'destructive' : 'secondary'}>
                              {qa.qaStatus}
                            </Badge>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <span className="text-lg font-semibold">{qa.count}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Disposition Chart</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={globalStats.dispositions}
                          dataKey="count"
                          nameKey="disposition"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label
                        >
                          {globalStats.dispositions.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[entry.disposition as keyof typeof COLORS] || '#ccc'} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              
              {/* Campaign Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {globalStats.campaignBreakdown.map((campaign: any) => (
                      <div 
                        key={campaign.campaignId}
                        className="border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => {
                          setSelectedCampaign(campaign.campaignId);
                          setActiveTab('campaign');
                        }}
                        data-testid={`campaign-${campaign.campaignId}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-semibold flex items-center gap-2">
                              {campaign.campaignName}
                              <ExternalLink className="h-3 w-3" />
                            </h4>
                          </div>
                          <Badge>{campaign.totalCalls} calls</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Qualified</p>
                            <p className="font-semibold text-green-600">{campaign.qualified}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Not Interested</p>
                            <p className="font-semibold">{campaign.notInterested}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Voicemail</p>
                            <p className="font-semibold">{campaign.voicemail}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">No Answer</p>
                            <p className="font-semibold">{campaign.noAnswer}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">DNC</p>
                            <p className="font-semibold text-red-600">{campaign.dncRequest}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Agent Performance */}
              {isAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top Agents</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {globalStats.agentStats
                        .sort((a: any, b: any) => b.totalCalls - a.totalCalls)
                        .slice(0, 10)
                        .map((agent: any) => (
                          <div 
                            key={agent.agentId}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                            onClick={() => {
                              setSelectedAgent(agent.agentId);
                              setActiveTab('agent');
                            }}
                            data-testid={`agent-${agent.agentId}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{agent.agentName}</span>
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span>{agent.totalCalls} calls</span>
                              <Badge variant="secondary">{agent.qualified} qualified</Badge>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </TabsContent>
        
        {/* Campaign Details */}
        <TabsContent value="campaign" className="space-y-6">
          {campaignLoading ? (
            <div className="text-center py-12">Loading...</div>
          ) : campaignStats ? (
            <>
              {/* Campaign Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>{campaignStats.campaign.name}</CardTitle>
                  <CardDescription>
                    Campaign Type: {campaignStats.campaign.type} | Status: {campaignStats.campaign.status}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Calls</p>
                      <p className="text-2xl font-bold">{campaignStats.summary.totalCalls}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Duration</p>
                      <p className="text-2xl font-bold">{formatDuration(campaignStats.summary.totalDuration)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Duration</p>
                      <p className="text-2xl font-bold">{formatDuration(campaignStats.summary.avgDuration)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Disposition & QA Stats */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Dispositions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {campaignStats.dispositions.map((disp: any) => (
                      <div 
                        key={disp.disposition}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted"
                        onClick={() => handleDispositionClick(disp.disposition)}
                      >
                        <span className="capitalize">{disp.disposition.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-2">
                          <Badge>{disp.count}</Badge>
                          <ExternalLink className="h-3 w-3" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>QA Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {campaignStats.qaStats.map((qa: any) => (
                      <div 
                        key={qa.qaStatus}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted"
                        onClick={() => handleQAStatusClick(qa.qaStatus)}
                      >
                        <Badge variant={qa.qaStatus === 'approved' ? 'default' : 'destructive'}>
                          {qa.qaStatus}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{qa.count}</span>
                          <ExternalLink className="h-3 w-3" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              
              {/* Agent Performance for Campaign */}
              <Card>
                <CardHeader>
                  <CardTitle>Agent Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {campaignStats.agentStats.map((agent: any) => (
                      <div 
                        key={agent.agentId}
                        className="border rounded-lg p-4 cursor-pointer hover:shadow-md"
                        onClick={() => {
                          setSelectedAgent(agent.agentId);
                          setActiveTab('agent');
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-semibold flex items-center gap-2">
                            {agent.agentName}
                            <ExternalLink className="h-3 w-3" />
                          </span>
                          <Badge>{agent.totalCalls} calls</Badge>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Qualified</p>
                            <p className="font-semibold text-green-600">{agent.qualified}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Not Int.</p>
                            <p className="font-semibold">{agent.notInterested}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Voicemail</p>
                            <p className="font-semibold">{agent.voicemail}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">DNC</p>
                            <p className="font-semibold text-red-600">{agent.dnc}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">QA Approved</p>
                            <p className="font-semibold text-green-600">{agent.qaApproved}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">QA Rejected</p>
                            <p className="font-semibold text-red-600">{agent.qaRejected}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
        
        {/* Agent Performance */}
        <TabsContent value="agent" className="space-y-6">
          {agentLoading ? (
            <div className="text-center py-12">Loading...</div>
          ) : agentStats ? (
            <>
              {/* Agent Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>{agentStats.agent.name}</CardTitle>
                  <CardDescription>{agentStats.agent.email}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Calls</p>
                      <p className="text-2xl font-bold">{agentStats.summary.totalCalls}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Duration</p>
                      <p className="text-2xl font-bold">{formatDuration(agentStats.summary.avgDuration)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Qualification Rate</p>
                      <p className="text-2xl font-bold text-green-600">{agentStats.summary.qualificationRate}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Talk Time</p>
                      <p className="text-2xl font-bold">{formatDuration(agentStats.summary.totalDuration)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Dispositions & QA */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>My Dispositions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agentStats.dispositions.map((disp: any) => (
                      <div 
                        key={disp.disposition}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted"
                        onClick={() => handleDispositionClick(disp.disposition)}
                      >
                        <span className="capitalize">{disp.disposition.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-2">
                          <Badge>{disp.count}</Badge>
                          <ExternalLink className="h-3 w-3" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>QA Results</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agentStats.qaStats.map((qa: any) => (
                      <div 
                        key={qa.qaStatus}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted"
                        onClick={() => handleQAStatusClick(qa.qaStatus)}
                      >
                        <Badge variant={qa.qaStatus === 'approved' ? 'default' : 'destructive'}>
                          {qa.qaStatus}
                        </Badge>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{qa.count}</span>
                          <ExternalLink className="h-3 w-3" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              
              {/* Daily Trend */}
              <Card>
                <CardHeader>
                  <CardTitle>Daily Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={agentStats.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" name="Total Calls" />
                      <Line type="monotone" dataKey="qualified" stroke="hsl(var(--chart-2))" name="Qualified" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              {/* Campaign Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {agentStats.campaignStats.map((campaign: any) => (
                      <div key={campaign.campaignId} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{campaign.campaignName}</span>
                          <Badge>{campaign.totalCalls} calls</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Qualified</p>
                            <p className="font-semibold text-green-600">{campaign.qualified}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Avg Duration</p>
                            <p className="font-semibold">{formatDuration(campaign.avgDuration)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {canViewAiAnalytics && (
          <TabsContent value="ai" className="space-y-6">
            <AiCallAnalyticsPanel embedded />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
