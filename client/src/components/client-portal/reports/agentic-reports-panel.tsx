/**
 * Agentic Reports Panel
 * AI-powered reporting interface for client portal
 * Allows natural language queries and generates comprehensive reports
 */
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  BarChart3, Send, Loader2, TrendingUp, TrendingDown, Minus,
  MessageSquare, Target, Users, FileText, Sparkles, RefreshCw,
  Download, ChevronRight, Building2, CheckCircle, Clock, XCircle,
  ArrowUpRight, ArrowDownRight, Lightbulb, HelpCircle, Bot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

interface CampaignStats {
  id: string;
  name: string;
  status: string;
  type: string;
  leads?: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  };
  accounts?: number;
}

interface StatsOverview {
  summary: {
    totalCampaigns: number;
    totalApprovedLeads: number;
    totalPendingLeads: number;
    totalUniqueAccounts: number;
    regularCampaignCount: number;
    verificationCampaignCount: number;
  };
  regularCampaigns: CampaignStats[];
  verificationCampaigns: CampaignStats[];
}

interface ReportHighlight {
  metric: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  insight: string;
}

interface GeneratedReport {
  executiveSummary: string;
  highlights: ReportHighlight[];
  campaignAnalysis: Array<{
    campaignName: string;
    performance: string;
    summary: string;
    recommendations: string[];
  }>;
  leadQualityInsights: string;
  accountPenetration: string;
  recommendations: string[];
  nextSteps: string[];
}

interface QueryResponse {
  answer: string;
  relevantMetrics: Array<{ name: string; value: string }>;
  suggestions: string[];
  needsMoreData: boolean;
}

interface ApprovedReport {
  id: string;
  reportName: string;
  reportType: string;
  reportSummary?: string | null;
  createdAt: string;
  fileUrl?: string | null;
}

interface AgenticReportsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const EXAMPLE_QUESTIONS = [
  "How many QA-approved leads do I have?",
  "Which campaign is performing best?",
  "How many unique accounts have we reached?",
  "What's my lead approval rate?",
  "Give me a summary of all my campaigns",
];

export function AgenticReportsPanel({ open, onOpenChange }: AgenticReportsPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'query' | 'report'>('overview');
  const [question, setQuestion] = useState('');
  const [queryHistory, setQueryHistory] = useState<Array<{ question: string; response: QueryResponse }>>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch stats overview
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<{ success: boolean; data: StatsOverview }>({
    queryKey: ['client-agentic-stats'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/agentic/stats/overview', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: open,
  });

  const { data: approvedReports, isLoading: approvedReportsLoading } = useQuery<ApprovedReport[]>({
    queryKey: ['client-approved-reports'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/reports', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch approved reports');
      const data = await res.json();
      return data?.reports || [];
    },
    enabled: open,
  });

  // Generate report mutation
  const generateReportMutation = useMutation({
    mutationFn: async (reportType: string) => {
      const res = await fetch('/api/client-portal/agentic/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ reportType }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      return res.json();
    },
  });

  // Query mutation
  const queryMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch('/api/client-portal/agentic/reports/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) throw new Error('Failed to process query');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setQueryHistory(prev => [...prev, { question, response: data.data.response }]);
        setQuestion('');
      }
    },
  });

  // Auto-scroll on new query
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [queryHistory]);

  const handleQuery = () => {
    if (!question.trim() || queryMutation.isPending) return;
    queryMutation.mutate(question);
  };

  const handleExampleQuestion = (q: string) => {
    setQuestion(q);
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <ArrowUpRight className="h-4 w-4 text-green-500" />;
    if (trend === 'down') return <ArrowDownRight className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const getPerformanceBadge = (performance: string) => {
    if (performance === 'good') return <Badge className="bg-green-100 text-green-800">Good</Badge>;
    if (performance === 'average') return <Badge className="bg-yellow-100 text-yellow-800">Average</Badge>;
    return <Badge className="bg-red-100 text-red-800">Needs Attention</Badge>;
  };

  const statsData = stats?.data;
  const isPendingReport = generateReportMutation.data?.data?.status === 'pending_review';
  const generatedReport = generateReportMutation.data?.data?.report;

  // Prepare chart data
  const leadStatusData = statsData ? [
    { name: 'Approved', value: statsData.summary.totalApprovedLeads, color: '#10b981' },
    { name: 'Pending', value: statsData.summary.totalPendingLeads, color: '#f59e0b' },
  ].filter(d => d.value > 0) : [];

  const campaignPerformanceData = statsData?.regularCampaigns.map(c => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name,
    approved: c.leads?.approved || 0,
    pending: c.leads?.pending || 0,
  })) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl text-white">Campaign Analytics & Reports</DialogTitle>
              <DialogDescription className="text-blue-100">
                AI-powered insights into your campaign performance
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
          <TabsList className="mx-6 mt-4 grid grid-cols-3 w-fit">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="query" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Ask Questions
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-2">
              <FileText className="h-4 w-4" />
              Full Report
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden">
            {/* Overview Tab */}
            <TabsContent value="overview" className="h-full m-0 p-6 overflow-auto">
              {statsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : statsData ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-blue-600 font-medium">Total Campaigns</p>
                            <p className="text-3xl font-bold text-blue-700">{statsData.summary.totalCampaigns}</p>
                          </div>
                          <Target className="h-8 w-8 text-blue-500" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-green-600 font-medium">Approved Leads</p>
                            <p className="text-3xl font-bold text-green-700">{statsData.summary.totalApprovedLeads}</p>
                          </div>
                          <CheckCircle className="h-8 w-8 text-green-500" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-amber-600 font-medium">Pending Review</p>
                            <p className="text-3xl font-bold text-amber-700">{statsData.summary.totalPendingLeads}</p>
                          </div>
                          <Clock className="h-8 w-8 text-amber-500" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-purple-600 font-medium">Unique Accounts</p>
                            <p className="text-3xl font-bold text-purple-700">{statsData.summary.totalUniqueAccounts}</p>
                          </div>
                          <Building2 className="h-8 w-8 text-purple-500" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Charts Row */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Lead Status Pie Chart */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Lead Status Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {leadStatusData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={leadStatusData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                dataKey="value"
                                label={({ name, value }) => `${name}: ${value}`}
                              >
                                {leadStatusData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                            No lead data available
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Campaign Performance Bar Chart */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Campaign Performance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {campaignPerformanceData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={campaignPerformanceData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" fontSize={12} />
                              <YAxis />
                              <Tooltip />
                              <Bar dataKey="approved" name="Approved" fill="#10b981" />
                              <Bar dataKey="pending" name="Pending" fill="#f59e0b" />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                            No campaign data available
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Campaign Details Table */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-lg">Campaign Details</CardTitle>
                      <Button variant="outline" size="sm" onClick={() => refetchStats()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {statsData.regularCampaigns.map((campaign) => (
                          <div key={campaign.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Target className="h-5 w-5 text-blue-500" />
                              <div>
                                <p className="font-medium">{campaign.name}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Badge variant="outline">{campaign.status}</Badge>
                                  <span>•</span>
                                  <span>{campaign.accounts || 0} accounts</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <div className="text-center">
                                <p className="text-green-600 font-semibold">{campaign.leads?.approved || 0}</p>
                                <p className="text-xs text-muted-foreground">Approved</p>
                              </div>
                              <div className="text-center">
                                <p className="text-amber-600 font-semibold">{campaign.leads?.pending || 0}</p>
                                <p className="text-xs text-muted-foreground">Pending</p>
                              </div>
                              <div className="text-center">
                                <p className="text-muted-foreground font-semibold">{campaign.leads?.total || 0}</p>
                                <p className="text-xs text-muted-foreground">Total</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {statsData.regularCampaigns.length === 0 && (
                          <p className="text-center text-muted-foreground py-8">
                            No campaigns assigned yet
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">Failed to load stats</p>
                </div>
              )}
            </TabsContent>

            {/* Query Tab */}
            <TabsContent value="query" className="h-full m-0 flex flex-col">
              <div className="flex-1 p-6 overflow-hidden flex flex-col">
                {/* Example Questions */}
                {queryHistory.length === 0 && (
                  <div className="mb-6">
                    <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
                    <div className="flex flex-wrap gap-2">
                      {EXAMPLE_QUESTIONS.map((q, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          onClick={() => handleExampleQuestion(q)}
                          className="text-xs"
                        >
                          <HelpCircle className="h-3 w-3 mr-1" />
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Query History */}
                <ScrollArea className="flex-1" ref={scrollRef}>
                  <div className="space-y-4">
                    {queryHistory.map((item, i) => (
                      <div key={i} className="space-y-3">
                        {/* User Question */}
                        <div className="flex justify-end">
                          <div className="bg-blue-600 text-white rounded-lg px-4 py-2 max-w-[80%]">
                            {item.question}
                          </div>
                        </div>
                        
                        {/* AI Response */}
                        <div className="flex gap-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Bot className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <Card className="bg-slate-50">
                              <CardContent className="pt-4">
                                <p className="text-sm">{item.response.answer}</p>
                                
                                {item.response.relevantMetrics.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {item.response.relevantMetrics.map((m, j) => (
                                      <Badge key={j} variant="secondary">
                                        {m.name}: {m.value}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                {item.response.suggestions.length > 0 && (
                                  <div className="mt-3">
                                    <p className="text-xs text-muted-foreground mb-1">Suggestions:</p>
                                    <ul className="text-xs space-y-1">
                                      {item.response.suggestions.map((s, j) => (
                                        <li key={j} className="flex items-start gap-1">
                                          <Lightbulb className="h-3 w-3 text-amber-500 mt-0.5" />
                                          {s}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </div>
                    ))}

                    {queryMutation.isPending && (
                      <div className="flex gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Analyzing...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="mt-4 flex gap-2">
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about your campaigns, leads, or performance..."
                    onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                    disabled={queryMutation.isPending}
                  />
                  <Button onClick={handleQuery} disabled={!question.trim() || queryMutation.isPending}>
                    {queryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Full Report Tab */}
            <TabsContent value="report" className="h-full m-0 p-6 overflow-auto">
              {generateReportMutation.isPending ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">Generating AI report...</p>
                </div>
              ) : isPendingReport ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      Report Submitted for Review
                    </CardTitle>
                    <CardDescription>
                      Your report has been generated and sent to our QA team. It will appear in Approved Reports once published.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Report ID: {generateReportMutation.data?.data?.reportId}
                  </CardContent>
                </Card>
              ) : generatedReport ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">AI-Generated Report</h3>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => generateReportMutation.mutate('summary')}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerate
                      </Button>
                    </div>
                  </div>

                  {/* Executive Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        Executive Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{generatedReport.executiveSummary}</p>
                    </CardContent>
                  </Card>

                  {/* Highlights */}
                  {generatedReport.highlights?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Key Highlights</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          {generatedReport.highlights.map((h: ReportHighlight, i: number) => (
                            <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                              {getTrendIcon(h.trend)}
                              <div>
                                <p className="font-medium text-sm">{h.metric}</p>
                                <p className="text-lg font-bold">{h.value}</p>
                                <p className="text-xs text-muted-foreground">{h.insight}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Campaign Analysis */}
                  {generatedReport.campaignAnalysis?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Campaign Analysis</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {generatedReport.campaignAnalysis.map((c: any, i: number) => (
                            <div key={i} className="border-l-4 border-blue-500 pl-4">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium">{c.campaignName}</h4>
                                {getPerformanceBadge(c.performance)}
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{c.summary}</p>
                              {c.recommendations?.length > 0 && (
                                <ul className="text-xs space-y-1">
                                  {c.recommendations.map((r: string, j: number) => (
                                    <li key={j} className="flex items-start gap-1 text-blue-600">
                                      <ChevronRight className="h-3 w-3 mt-0.5" />
                                      {r}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Recommendations */}
                  {generatedReport.recommendations?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-amber-500" />
                          Recommendations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {generatedReport.recommendations.map((r: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-medium">
                                {i + 1}
                              </div>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <div className="p-4 bg-slate-100 rounded-full">
                    <FileText className="h-8 w-8 text-slate-500" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-medium mb-1">Generate AI Report</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Get a comprehensive analysis of your campaign performance
                    </p>
                    <Button onClick={() => generateReportMutation.mutate('summary')}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Report
                    </Button>
                  </div>
                </div>
              )}

              <Separator className="my-6" />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Approved Reports
                  </CardTitle>
                  <CardDescription>Only QA-approved reports are listed here.</CardDescription>
                </CardHeader>
                <CardContent>
                  {approvedReportsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading approved reports...
                    </div>
                  ) : approvedReports && approvedReports.length > 0 ? (
                    <div className="space-y-3">
                      {approvedReports.map((report) => (
                        <div key={report.id} className="flex items-center justify-between border rounded-lg p-3">
                          <div>
                            <p className="font-medium">{report.reportName}</p>
                            <p className="text-xs text-muted-foreground">
                              {report.reportType} • {new Date(report.createdAt).toLocaleDateString()}
                            </p>
                            {report.reportSummary && (
                              <p className="text-xs text-muted-foreground mt-1">{report.reportSummary}</p>
                            )}
                          </div>
                          <Button variant="outline" size="sm" disabled={!report.fileUrl}>
                            <Download className="h-4 w-4 mr-2" />
                            {report.fileUrl ? "Download" : "No File"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No approved reports yet.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default AgenticReportsPanel;
