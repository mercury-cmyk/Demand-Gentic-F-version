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
import { useExportAuthority } from "@/hooks/use-export-authority";
import { AiCallAnalyticsPanel } from "@/pages/ai-call-analytics";
import { getAuthHeaders } from "@/lib/queryClient";

const COLORS = {
  qualified: 'hsl(var(--chart-2))',
  not_interested: 'hsl(var(--chart-1))',
  voicemail: 'hsl(var(--chart-3))',
  no_answer: 'hsl(var(--chart-4))',
  dnc_request: 'hsl(var(--destructive))',
  busy: 'hsl(var(--chart-5))',
  callback_requested: 'hsl(var(--primary))',
};

export default function CallReportsPage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { canExportData } = useExportAuthority();
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
  
  const [dateRange, setDateRange] = useState({});
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState(isAdmin ? 'all' : user?.id || '');
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
        headers: getAuthHeaders(),
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
        headers: getAuthHeaders(),
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
        headers: getAuthHeaders(),
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
        headers: getAuthHeaders(),
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
        headers: getAuthHeaders(),
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
        headers: getAuthHeaders(),
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

  const handleQAStatusClick = (qaStatus: string) => {
    const params = new URLSearchParams();
    if (dateRange.from) params.append('from', dateRange.from);
    if (dateRange.to) params.append('to', dateRange.to);
    if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
    if (selectedAgent !== 'all') params.append('agentId', selectedAgent);
    params.append('qaStatus', qaStatus);

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
    
      {/* Modern Header with Gradient */}
      
        
        
          
            
              
                
              
              Call Campaign Reports
            
            Comprehensive analytics and performance metrics for all telemarketing campaigns
          
          {canExportData && (
            
              
              Export Report
            
          )}
        
      
      
      {/* Filters */}
      {activeTab !== 'ai' && (
        
          
            
              
              Report Filters
            
          
          
            
              
                Date Range
                
              
              
              
                Campaign
                
                  
                    
                  
                  
                    All Campaigns
                    {callCampaigns.map((campaign: any) => (
                      
                        {campaign.name}
                      
                    ))}
                  
                
              
              
              {isAdmin && (
                
                  Agent
                  
                    
                      
                    
                    
                      All Agents
                      {agents
                        .filter((agent: any) => agent.role !== 'admin' && agent.role !== 'super_admin')
                        .map((agent: any) => (
                        
                          {agent.firstName} {agent.lastName}
                        
                      ))}
                    
                  
                
              )}
            
          
        
      )}
      
      {/* Queue Progress Overview - Shows even when no calls exist */}
      {activeTab !== 'ai' && queueStats && queueStats.summary?.totalContacts > 0 && (
        
          
            
              
                
                  
                  Campaign Queue Progress
                
                
                  {(!globalStats || globalStats.summary?.totalCalls === 0)
                    ? "Contacts are ready to call - Start making calls to see call reports" 
                    : "Queue readiness across all campaigns"}
                
              
              {selectedCampaign !== 'all' && (
                 setLocation(`/campaigns/phone/${selectedCampaign}/queue`)}
                  data-testid="button-manage-queue"
                >
                  
                  Manage Queue
                
              )}
            
          
          
            
              
                
                  Total Contacts
                
                
                  {queueStats.summary.totalContacts.toLocaleString()}
                  Ready in queue
                
              
              
                
                  Queued
                
                
                  {queueStats.summary.queued.toLocaleString()}
                  Awaiting call
                
              
              
                
                  In Progress
                
                
                  {queueStats.summary.inProgress.toLocaleString()}
                  Currently calling
                
              
              
                
                  Completed
                
                
                  {queueStats.summary.completed.toLocaleString()}
                  Calls finished
                
              
            
          
        
      )}
      
      {/* Tabs */}
      
        
          
            
            Global Overview
          
          {selectedCampaign !== 'all' && (
            
              
              Campaign Details
            
          )}
          {selectedAgent !== 'all' && (
            
              
              Agent Performance
            
          )}
          {canViewAiAnalytics && (
            
              
              AI Call Analytics
            
          )}
        
        
        {/* Global Overview */}
        
          {globalLoading ? (
            Loading...
          ) : globalStats ? (
            <>
              {/* Summary Cards */}
              
                
                  
                    Total Calls
                    
                  
                  
                    {globalStats.summary.totalCalls.toLocaleString()}
                  
                
                
                
                  
                    Total Duration
                    
                  
                  
                    {formatDuration(globalStats.summary.totalDuration)}
                  
                
                
                
                  
                    Avg Duration
                    
                  
                  
                    {formatDuration(globalStats.summary.avgDuration)}
                  
                
                
                
                  
                    Active Campaigns
                    
                  
                  
                    {globalStats.campaignBreakdown.length}
                  
                
              
              
              {/* Disposition Breakdown */}
              
                
                  Call Dispositions
                  Click on any metric to view detailed call list
                
                
                  
                    {globalStats.dispositions.map((disp: any) => {
                      const Icon = getDispositionIcon(disp.disposition);
                      return (
                         handleDispositionClick(disp.disposition)}
                          data-testid={`card-disposition-${disp.disposition}`}
                        >
                          
                            
                              
                              
                            
                            {disp.count}
                            
                              {disp.disposition.replace(/_/g, ' ')}
                            
                          
                        
                      );
                    })}
                  
                
              
              
              {/* Disposition Chart */}
              
                
                  Disposition Chart
                
                
                  
                    
                      
                        {globalStats.dispositions.map((entry: any, index: number) => (
                          
                        ))}
                      
                      
                      
                    
                  
                
              
              
              {/* Campaign Breakdown */}
              
                
                  Campaign Performance
                
                
                  
                    {globalStats.campaignBreakdown.map((campaign: any) => (
                       {
                          setSelectedCampaign(campaign.campaignId);
                          setActiveTab('campaign');
                        }}
                        data-testid={`campaign-${campaign.campaignId}`}
                      >
                        
                          
                            
                              {campaign.campaignName}
                              
                            
                          
                          {campaign.totalCalls} calls
                        
                        
                          
                            Qualified
                            {campaign.qualified}
                          
                          
                            Not Interested
                            {campaign.notInterested}
                          
                          
                            Voicemail
                            {campaign.voicemail}
                          
                          
                            No Answer
                            {campaign.noAnswer}
                          
                          
                            DNC
                            {campaign.dncRequest}
                          
                        
                      
                    ))}
                  
                
              
              
              {/* Agent Performance */}
              {isAdmin && (
                
                  
                    Top Agents
                  
                  
                    
                      {globalStats.agentStats
                        .sort((a: any, b: any) => b.totalCalls - a.totalCalls)
                        .slice(0, 10)
                        .map((agent: any) => (
                           {
                              setSelectedAgent(agent.agentId);
                              setActiveTab('agent');
                            }}
                            data-testid={`agent-${agent.agentId}`}
                          >
                            
                              {agent.agentName}
                              
                            
                            
                              {agent.totalCalls} calls
                              {agent.qualified} qualified
                            
                          
                        ))}
                    
                  
                
              )}
            
          ) : null}
        
        
        {/* Campaign Details */}
        
          {campaignLoading ? (
            Loading...
          ) : campaignStats ? (
            <>
              {/* Campaign Summary */}
              
                
                  {campaignStats.campaign.name}
                  
                    Campaign Type: {campaignStats.campaign.type} | Status: {campaignStats.campaign.status}
                  
                
                
                  
                    
                      Total Calls
                      {campaignStats.summary.totalCalls}
                    
                    
                      Total Duration
                      {formatDuration(campaignStats.summary.totalDuration)}
                    
                    
                      Avg Duration
                      {formatDuration(campaignStats.summary.avgDuration)}
                    
                  
                
              
              
              {/* Disposition & QA Stats */}
              
                
                  
                    Dispositions
                  
                  
                    {campaignStats.dispositions.map((disp: any) => (
                       handleDispositionClick(disp.disposition)}
                      >
                        {disp.disposition.replace(/_/g, ' ')}
                        
                          {disp.count}
                          
                        
                      
                    ))}
                  
                
                
                
                  
                    QA Status
                  
                  
                    {campaignStats.qaStats.map((qa: any) => (
                       handleQAStatusClick(qa.qaStatus)}
                      >
                        
                          {qa.qaStatus}
                        
                        
                          {qa.count}
                          
                        
                      
                    ))}
                  
                
              
              
              {/* Agent Performance for Campaign */}
              
                
                  Agent Performance
                
                
                  
                    {campaignStats.agentStats.map((agent: any) => (
                       {
                          setSelectedAgent(agent.agentId);
                          setActiveTab('agent');
                        }}
                      >
                        
                          
                            {agent.agentName}
                            
                          
                          {agent.totalCalls} calls
                        
                        
                          
                            Qualified
                            {agent.qualified}
                          
                          
                            Not Int.
                            {agent.notInterested}
                          
                          
                            Voicemail
                            {agent.voicemail}
                          
                          
                            DNC
                            {agent.dnc}
                          
                          
                            QA Approved
                            {agent.qaApproved}
                          
                          
                            QA Rejected
                            {agent.qaRejected}
                          
                        
                      
                    ))}
                  
                
              
            
          ) : null}
        
        
        {/* Agent Performance */}
        
          {agentLoading ? (
            Loading...
          ) : agentStats ? (
            <>
              {/* Agent Summary */}
              
                
                  {agentStats.agent.name}
                  {agentStats.agent.email}
                
                
                  
                    
                      Total Calls
                      {agentStats.summary.totalCalls}
                    
                    
                      Avg Duration
                      {formatDuration(agentStats.summary.avgDuration)}
                    
                    
                      Qualification Rate
                      {agentStats.summary.qualificationRate}%
                    
                    
                      Total Talk Time
                      {formatDuration(agentStats.summary.totalDuration)}
                    
                  
                
              
              
              {/* Dispositions & QA */}
              
                
                  
                    My Dispositions
                  
                  
                    {agentStats.dispositions.map((disp: any) => (
                       handleDispositionClick(disp.disposition)}
                      >
                        {disp.disposition.replace(/_/g, ' ')}
                        
                          {disp.count}
                          
                        
                      
                    ))}
                  
                
                
                
                  
                    QA Results
                  
                  
                    {agentStats.qaStats.map((qa: any) => (
                       handleQAStatusClick(qa.qaStatus)}
                      >
                        
                          {qa.qaStatus}
                        
                        
                          {qa.count}
                          
                        
                      
                    ))}
                  
                
              
              
              {/* Daily Trend */}
              
                
                  Daily Performance
                
                
                  
                    
                      
                      
                      
                      
                      
                      
                      
                    
                  
                
              
              
              {/* Campaign Breakdown */}
              
                
                  Campaign Breakdown
                
                
                  
                    {agentStats.campaignStats.map((campaign: any) => (
                      
                        
                          {campaign.campaignName}
                          {campaign.totalCalls} calls
                        
                        
                          
                            Qualified
                            {campaign.qualified}
                          
                          
                            Avg Duration
                            {formatDuration(campaign.avgDuration)}
                          
                        
                      
                    ))}
                  
                
              
            
          ) : null}
        

        {canViewAiAnalytics && (
          
            
          
        )}
      
    
  );
}