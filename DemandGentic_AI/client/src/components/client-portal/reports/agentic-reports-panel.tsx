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
  campaignAnalysis: Array;
  leadQualityInsights: string;
  accountPenetration: string;
  recommendations: string[];
  nextSteps: string[];
}

interface QueryResponse {
  answer: string;
  relevantMetrics: Array;
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
  const [activeTab, setActiveTab] = useState('overview');
  const [question, setQuestion] = useState('');
  const [queryHistory, setQueryHistory] = useState>([]);
  
  const scrollRef = useRef(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch stats overview
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
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

  const { data: approvedReports, isLoading: approvedReportsLoading } = useQuery({
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
    if (trend === 'up') return ;
    if (trend === 'down') return ;
    return ;
  };

  const getPerformanceBadge = (performance: string) => {
    if (performance === 'good') return Good;
    if (performance === 'average') return Average;
    return Needs Attention;
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
    
      
        
          
            
              
            
            
              Campaign Analytics & Reports
              
                AI-powered insights into your campaign performance
              
            
          
        

         setActiveTab(v as any)} className="flex-1 flex flex-col">
          
            
              
              Overview
            
            
              
              Ask Questions
            
            
              
              Full Report
            
          

          
            {/* Overview Tab */}
            
              {statsLoading ? (
                
                  
                
              ) : statsData ? (
                
                  {/* Summary Cards */}
                  
                    
                      
                        
                          
                            Total Campaigns
                            {statsData.summary.totalCampaigns}
                          
                          
                        
                      
                    

                    
                      
                        
                          
                            Approved Leads
                            {statsData.summary.totalApprovedLeads}
                          
                          
                        
                      
                    

                    
                      
                        
                          
                            Pending Review
                            {statsData.summary.totalPendingLeads}
                          
                          
                        
                      
                    

                    
                      
                        
                          
                            Unique Accounts
                            {statsData.summary.totalUniqueAccounts}
                          
                          
                        
                      
                    
                  

                  {/* Charts Row */}
                  
                    {/* Lead Status Pie Chart */}
                    
                      
                        Lead Status Distribution
                      
                      
                        {leadStatusData.length > 0 ? (
                          
                            
                               `${name}: ${value}`}
                              >
                                {leadStatusData.map((entry, index) => (
                                  
                                ))}
                              
                              
                            
                          
                        ) : (
                          
                            No lead data available
                          
                        )}
                      
                    

                    {/* Campaign Performance Bar Chart */}
                    
                      
                        Campaign Performance
                      
                      
                        {campaignPerformanceData.length > 0 ? (
                          
                            
                              
                              
                              
                              
                              
                              
                            
                          
                        ) : (
                          
                            No campaign data available
                          
                        )}
                      
                    
                  

                  {/* Campaign Details Table */}
                  
                    
                      Campaign Details
                       refetchStats()} className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white">
                        
                        Refresh
                      
                    
                    
                      
                        {statsData.regularCampaigns.map((campaign) => (
                          
                            
                              
                              
                                {campaign.name}
                                
                                  {campaign.status}
                                  •
                                  {campaign.accounts || 0} accounts
                                
                              
                            
                            
                              
                                {campaign.leads?.approved || 0}
                                Approved
                              
                              
                                {campaign.leads?.pending || 0}
                                Pending
                              
                              
                                {campaign.leads?.total || 0}
                                Total
                              
                            
                          
                        ))}
                        {statsData.regularCampaigns.length === 0 && (
                          
                            No campaigns assigned yet
                          
                        )}
                      
                    
                  
                
              ) : (
                
                  Failed to load stats
                
              )}
            

            {/* Query Tab */}
            
              
                {/* Example Questions */}
                {queryHistory.length === 0 && (
                  
                    Try asking:
                    
                      {EXAMPLE_QUESTIONS.map((q, i) => (
                         handleExampleQuestion(q)}
                          className="text-xs"
                        >
                          
                          {q}
                        
                      ))}
                    
                  
                )}

                {/* Query History */}
                
                  
                    {queryHistory.map((item, i) => (
                      
                        {/* User Question */}
                        
                          
                            {item.question}
                          
                        
                        
                        {/* AI Response */}
                        
                          
                            
                          
                          
                            
                              
                                {item.response.answer}
                                
                                {item.response.relevantMetrics.length > 0 && (
                                  
                                    {item.response.relevantMetrics.map((m, j) => (
                                      
                                        {m.name}: {m.value}
                                      
                                    ))}
                                  
                                )}

                                {item.response.suggestions.length > 0 && (
                                  
                                    Suggestions:
                                    
                                      {item.response.suggestions.map((s, j) => (
                                        
                                          
                                          {s}
                                        
                                      ))}
                                    
                                  
                                )}
                              
                            
                          
                        
                      
                    ))}

                    {queryMutation.isPending && (
                      
                        
                          
                        
                        
                          
                          Analyzing...
                        
                      
                    )}
                  
                

                {/* Input */}
                
                   setQuestion(e.target.value)}
                    placeholder="Ask about your campaigns, leads, or performance..."
                    onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                    disabled={queryMutation.isPending}
                  />
                  
                    {queryMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                  
                
              
            

            {/* Full Report Tab */}
            
              {generateReportMutation.isPending ? (
                
                  
                  Generating AI report...
                
              ) : isPendingReport ? (
                
                  
                    
                      
                      Report Submitted for Review
                    
                    
                      Your report has been generated and sent to our QA team. It will appear in Approved Reports once published.
                    
                  
                  
                    Report ID: {generateReportMutation.data?.data?.reportId}
                  
                
              ) : generatedReport ? (
                
                  
                    AI-Generated Report
                    
                      
                        
                        Export PDF
                      
                       generateReportMutation.mutate('summary')}>
                        
                        Regenerate
                      
                    
                  

                  {/* Executive Summary */}
                  
                    
                      
                        
                        Executive Summary
                      
                    
                    
                      {generatedReport.executiveSummary}
                    
                  

                  {/* Highlights */}
                  {generatedReport.highlights?.length > 0 && (
                    
                      
                        Key Highlights
                      
                      
                        
                          {generatedReport.highlights.map((h: ReportHighlight, i: number) => (
                            
                              {getTrendIcon(h.trend)}
                              
                                {h.metric}
                                {h.value}
                                {h.insight}
                              
                            
                          ))}
                        
                      
                    
                  )}

                  {/* Campaign Analysis */}
                  {generatedReport.campaignAnalysis?.length > 0 && (
                    
                      
                        Campaign Analysis
                      
                      
                        
                          {generatedReport.campaignAnalysis.map((c: any, i: number) => (
                            
                              
                                {c.campaignName}
                                {getPerformanceBadge(c.performance)}
                              
                              {c.summary}
                              {c.recommendations?.length > 0 && (
                                
                                  {c.recommendations.map((r: string, j: number) => (
                                    
                                      
                                      {r}
                                    
                                  ))}
                                
                              )}
                            
                          ))}
                        
                      
                    
                  )}

                  {/* Recommendations */}
                  {generatedReport.recommendations?.length > 0 && (
                    
                      
                        
                          
                          Recommendations
                        
                      
                      
                        
                          {generatedReport.recommendations.map((r: string, i: number) => (
                            
                              
                                {i + 1}
                              
                              {r}
                            
                          ))}
                        
                      
                    
                  )}
                
              ) : (
                
                  
                    
                  
                  
                    Generate AI Report
                    
                      Get a comprehensive analysis of your campaign performance
                    
                     generateReportMutation.mutate('summary')}>
                      
                      Generate Report
                    
                  
                
              )}

              

              
                
                  
                    
                    Approved Reports
                  
                  Only QA-approved reports are listed here.
                
                
                  {approvedReportsLoading ? (
                    
                      
                      Loading approved reports...
                    
                  ) : approvedReports && approvedReports.length > 0 ? (
                    
                      {approvedReports.map((report) => (
                        
                          
                            {report.reportName}
                            
                              {report.reportType} • {new Date(report.createdAt).toLocaleDateString()}
                            
                            {report.reportSummary && (
                              {report.reportSummary}
                            )}
                          
                          
                            
                            {report.fileUrl ? "Download" : "No File"}
                          
                        
                      ))}
                    
                  ) : (
                    No approved reports yet.
                  )}
                
              
            
          
        
      
    
  );
}

export default AgenticReportsPanel;