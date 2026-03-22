/**
 * Unified Report Sections
 *
 * Content sections for each tab in the unified Reports & Analytics page.
 * Each section manages its own data fetching and campaign filter state.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Phone, Mail, UserCheck, TrendingUp, Clock, Star, DollarSign,
  Download, Loader2, Activity, Mic, CheckCircle, XCircle, FileText,
  MessageSquareText, ChevronDown, ChevronUp, Users, Brain,
  Voicemail, PhoneOff, Ban,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');
const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];
const DISPOSITION_COLORS: Record = {
  qualified: 'hsl(142, 76%, 36%)',
  not_interested: 'hsl(0, 84%, 60%)',
  voicemail: 'hsl(221, 83%, 53%)',
  no_answer: 'hsl(45, 93%, 47%)',
  dnc_request: 'hsl(0, 72%, 51%)',
  busy: 'hsl(262, 83%, 58%)',
  callback_requested: 'hsl(199, 89%, 48%)',
};

const formatDuration = (seconds?: number | null) => {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function CampaignFilter({ value, onChange, campaigns }: { value: string; onChange: (v: string) => void; campaigns: any[] }) {
  return (
    
      
        
          Campaign
          
            
            
              All Campaigns
              {campaigns.map((c: any) => (
                {c.name}
              ))}
            
          
        
      
    
  );
}

// ─── ENGAGEMENT SECTION ──────────────────────────────────
export function EngagementSection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['unified-engagement', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/analytics/engagement?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch engagement analytics');
      return res.json();
    },
  });

  const behaviorData = analytics?.agentBehavior ? [
    { metric: "Engagement", score: analytics.agentBehavior.engagement || 0 },
    { metric: "Clarity", score: analytics.agentBehavior.clarity || 0 },
    { metric: "Empathy", score: analytics.agentBehavior.empathy || 0 },
    { metric: "Objection", score: analytics.agentBehavior.objectionHandling || 0 },
    { metric: "Qualification", score: analytics.agentBehavior.qualification || 0 },
    { metric: "Closing", score: analytics.agentBehavior.closing || 0 },
    { metric: "Flow", score: analytics.agentBehavior.flowCompliance || 0 },
  ] : [];

  return (
    
      

      {isLoading ? (
        
      ) : (
        <>
          
            {[
              { label: "Campaigns", value: analytics?.totalCampaigns || 0, icon: BarChart3, color: "text-blue-500" },
              { label: "Emails", value: analytics?.email?.total || 0, icon: Mail, color: "text-green-500" },
              { label: "Calls", value: analytics?.calls?.total || 0, icon: Phone, color: "text-purple-500" },
              { label: "Qualified", value: analytics?.leads?.qualified || 0, icon: UserCheck, color: "text-orange-500" },
            ].map(s => (
              
                
                  {s.label}
                  
                
                {s.value.toLocaleString()}
              
            ))}
          

          {analytics?.timeline?.length > 0 && (
            
              
                Activity Timeline
              
              
                
                  
                    
                    
                    
                    
                    
                  
                
              
            
          )}

          
            {analytics?.channelBreakdown?.length > 0 && (
              
                Channel Breakdown
                
                  
                    
                      
                        {analytics.channelBreakdown.map((_: any, i: number) => (
                          
                        ))}
                      
                      
                    
                  
                
              
            )}
            {analytics?.dispositions?.length > 0 && (
              
                Dispositions
                
                  
                    
                      
                      
                    
                  
                
              
            )}
          

          {behaviorData.length > 0 && analytics?.agentBehavior?.sampleSize > 0 && (
            
              
                Agent Behaviour Analysis
                Averaged from {analytics.agentBehavior.sampleSize} analyzed calls
              
              
                
                  
                    
                    
                    
                  
                
              
            
          )}

          {analytics?.recentCalls?.length > 0 && (
            
              Recent Calls
              
                
                  
                    
                      
                        Contact
                        Source
                        Disposition
                        Duration
                        Score
                      
                    
                    
                      {analytics.recentCalls.map((call: any) => (
                        
                          {call.contactName || "Unknown"}
                          
                            
                              {call.source === "sample" ? "Sample" : "Live"}
                            
                          
                          {(call.disposition || "unknown").replace(/_/g, " ")}
                          {formatDuration(call.duration)}
                          {call.behaviorScore ?? "-"}
                        
                      ))}
                    
                  
                
              
            
          )}
        
      )}
    
  );
}

// ─── CALLS SECTION ───────────────────────────────────────
export function CallsSection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['unified-calls', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/call-reports?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch call reports');
      return res.json();
    },
  });

  const summary = reportData?.summary || { totalCalls: 0, totalDuration: 0, avgDuration: 0 };
  const dispositions = reportData?.dispositions || [];
  const campaignBreakdown = reportData?.campaignBreakdown || [];

  const getDispositionIcon = (d: string) => {
    switch (d) {
      case 'qualified': return CheckCircle;
      case 'not_interested': return XCircle;
      case 'voicemail': return Voicemail;
      case 'no_answer': return PhoneOff;
      case 'dnc_request': return Ban;
      default: return Phone;
    }
  };

  return (
    
      

      {isLoading ? (
        
      ) : (
        <>
          
            
              
                Total Calls
                
              
              {summary.totalCalls.toLocaleString()}
            
            
              
                Total Duration
                
              
              {formatDuration(summary.totalDuration)}
            
            
              
                Avg Duration
                
              
              {formatDuration(summary.avgDuration)}
            
            
              
                Active Campaigns
                
              
              {campaignBreakdown.length}
            
          

          {dispositions.length > 0 && (
            
              
                Call Dispositions
                
                  
                    {dispositions.map((d: any) => {
                      const Icon = getDispositionIcon(d.disposition);
                      return (
                        
                          
                            
                            {d.disposition.replace(/_/g, ' ')}
                          
                          {d.count}
                        
                      );
                    })}
                  
                
              
              
                Disposition Chart
                
                  
                    
                      
                        {dispositions.map((e: any, i: number) => (
                          
                        ))}
                      
                      
                    
                  
                
              
            
          )}

          {campaignBreakdown.length > 0 && (
            
              Campaign Performance
              
                
                  
                    
                      Campaign
                      Calls
                      Qualified
                      Not Interested
                      Voicemail
                    
                  
                  
                    {campaignBreakdown.map((c: any) => (
                      
                        {c.campaignName}
                        {c.totalCalls}
                        
                          {c.qualified}
                        
                        {c.notInterested}
                        {c.voicemail}
                      
                    ))}
                  
                
              
            
          )}
        
      )}
    
  );
}

// ─── QUALITY SECTION ─────────────────────────────────────
export function QualitySection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['unified-quality', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/conversations?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json();
    },
  });

  const avgQuality = conversations.length > 0
    ? Math.round(conversations.reduce((sum, c) => sum + (c.qualityScore || 0), 0) / (conversations.filter(c => c.qualityScore).length || 1))
    : 0;
  const qaApproved = conversations.filter(c => c.qaStatus === 'approved').length;
  const qaRejected = conversations.filter(c => c.qaStatus === 'rejected').length;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    
      

      {isLoading ? (
        
      ) : (
        <>
          
            
              
                Conversations
                
              
              {conversations.length}
            
            
              
                Avg Quality
                
              
              {avgQuality}%
            
            
              
                QA Approved
                
              
              {qaApproved}
            
            
              
                QA Rejected
                
              
              {qaRejected}
            
          

          
            
              Conversations
              Click a row to expand quality analysis and transcript
            
            
              {conversations.length === 0 ? (
                
                  
                  No Conversations Yet
                  Data will appear once calls are made.
                
              ) : (
                
                  
                    {conversations.map((conv: any) => (
                      
                         setExpandedId(expandedId === conv.id ? null : conv.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(expandedId === conv.id ? null : conv.id); }}
                        >
                          
                            {conv.contactName}
                            {conv.accountName} — {conv.campaignName}
                          
                          
                            {conv.disposition?.replace(/_/g, ' ') || 'N/A'}
                            {conv.qualityScore !== null && (
                              = 70 ? 'default' : 'destructive'}>{conv.qualityScore}%
                            )}
                            {conv.qaStatus && (
                              {conv.qaStatus}
                            )}
                            {formatDuration(conv.duration || 0)}
                            {expandedId === conv.id ?  : }
                          
                        
                        {expandedId === conv.id && (
                          
                            
                              {[
                                { label: "Engagement", score: conv.engagementScore },
                                { label: "Clarity", score: conv.clarityScore },
                                { label: "Empathy", score: conv.empathyScore },
                                { label: "Objection Handling", score: conv.objectionHandlingScore },
                                { label: "Qualification", score: conv.qualificationScore },
                                { label: "Closing", score: conv.closingScore },
                                { label: "Flow Compliance", score: conv.flowComplianceScore },
                                { label: "Campaign Alignment", score: conv.campaignAlignmentScore },
                              ].filter(d => d.score != null).map(d => (
                                
                                  
                                    {d.label}
                                    {Math.round(d.score)}%
                                  
                                  
                                
                              ))}
                            
                            {conv.sentiment && (
                              
                                Sentiment: 
                                {conv.sentiment}
                              
                            )}
                            {conv.transcript && (
                              
                                Transcript
                                
                                  {conv.transcript}
                                
                              
                            )}
                          
                        )}
                      
                    ))}
                  
                
              )}
            
          
        
      )}
    
  );
}

// ─── RECORDINGS SECTION ──────────────────────────────────
export function RecordingsSection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['unified-recordings', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/recordings?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch recordings');
      return res.json();
    },
  });

  return (
    
      

      {isLoading ? (
        
      ) : recordings.length === 0 ? (
        
          
            
            No Recordings Available
            Recordings will appear once calls are recorded.
          
        
      ) : (
        
          
            
              
              Call Recordings ({recordings.length})
            
          
          
            
              
                {recordings.map((rec: any) => (
                  
                    
                      
                        {rec.contactName}
                        {rec.campaignName} — {new Date(rec.createdAt).toLocaleDateString()}
                      
                      
                        {(rec.disposition || 'unknown').replace(/_/g, ' ')}
                        
                          
                          {formatDuration(rec.duration)}
                        
                      
                    
                    {rec.recordingUrl && (
                      
                    )}
                  
                ))}
              
            
          
        
      )}
    
  );
}

// ─── COST SECTION ────────────────────────────────────────
export function CostSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['unified-cost-tracking'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/cost-tracking', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch cost data');
      return res.json();
    },
  });

  const summary = data?.summary;
  const breakdown = data?.campaignBreakdown || [];

  return (
    
      {isLoading ? (
        
      ) : (
        <>
          
            {[
              { label: "Total Calls", value: summary?.totalCalls || 0, icon: Phone, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Call Minutes", value: summary?.totalDurationMinutes || 0, icon: Clock, color: "text-purple-500", bg: "bg-purple-500/10" },
              { label: "Emails Sent", value: summary?.totalEmails || 0, icon: Mail, color: "text-cyan-500", bg: "bg-cyan-500/10" },
              { label: "Total Leads", value: summary?.totalLeads || 0, icon: TrendingUp, color: "text-amber-500", bg: "bg-amber-500/10" },
              { label: "Qualified", value: summary?.qualifiedLeads || 0, icon: UserCheck, color: "text-green-500", bg: "bg-green-500/10" },
            ].map(kpi => (
              
                
                  
                    
                      
                    
                    
                      {kpi.label}
                      {kpi.value.toLocaleString()}
                    
                  
                
              
            ))}
          

          {breakdown.length > 0 && (
            <>
              
                
                  
                    
                    Campaign Activity Comparison
                  
                
                
                  
                    
                      
                      
                      
                      
                      
                      
                    
                  
                
              

              
                Campaign Breakdown
                
                  
                    
                      
                        Campaign
                        Calls
                        Emails
                        Qualified
                        Efficiency
                      
                    
                    
                      {breakdown.map((row: any) => {
                        const total = row.calls + row.emails;
                        const eff = total > 0 ? ((row.qualifiedLeads / total) * 100).toFixed(1) : '0';
                        return (
                          
                            {row.campaignName}
                            {row.calls.toLocaleString()}
                            {row.emails.toLocaleString()}
                            
                              {row.qualifiedLeads}
                            
                            {eff}%
                          
                        );
                      })}
                    
                  
                
              
            
          )}
        
      )}
    
  );
}

// ─── EXPORT SECTION ──────────────────────────────────────
type ReportType = 'engagement' | 'call-reports' | 'leads';

const REPORT_TYPES: { value: ReportType; label: string; description: string; icon: typeof BarChart3 }[] = [
  { value: 'engagement', label: 'Engagement Report', description: 'Call, email, and lead activity summary', icon: BarChart3 },
  { value: 'call-reports', label: 'Call Reports', description: 'Detailed call dispositions and outcomes', icon: Phone },
  { value: 'leads', label: 'Leads Report', description: 'All leads with AI scores and status', icon: UserCheck },
];

export function ExportSection({ campaigns }: { campaigns: any[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [selectedReport, setSelectedReport] = useState('engagement');
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const { data: previewData, isLoading } = useQuery({
    queryKey: ['unified-export-preview', selectedReport, selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const endpoints: Record = {
        engagement: '/api/client-portal/analytics/engagement',
        'call-reports': '/api/client-portal/call-reports',
        leads: '/api/client-portal/potential-leads',
      };
      const res = await fetch(`${endpoints[selectedReport]}?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch preview');
      return res.json();
    },
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      if (selectedReport === 'leads') {
        const params = new URLSearchParams();
        if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
        const res = await fetch(`/api/client-portal/leads/export?${params}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        downloadBlob(blob, `leads-report-${new Date().toISOString().split('T')[0]}.csv`);
      } else {
        const csv = generateCSV(selectedReport, previewData);
        const blob = new Blob([csv], { type: 'text/csv' });
        downloadBlob(blob, `${selectedReport}-report-${new Date().toISOString().split('T')[0]}.csv`);
      }
      toast({ title: 'Export complete', description: `Your ${selectedReport} report has been downloaded.` });
    } catch {
      toast({ title: 'Export failed', description: 'Unable to export report.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const generateCSV = (type: ReportType, data: any): string => {
    if (type === 'engagement') {
      return [
        ['Metric', 'Value'],
        ['Total Campaigns', data?.totalCampaigns || 0],
        ['Total Calls', data?.calls?.total || 0],
        ['Emails Sent', data?.email?.total || 0],
        ['Qualified Leads', data?.leads?.qualified || 0],
      ].map(r => r.join(',')).join('\n');
    }
    if (type === 'call-reports') {
      const dispositions = data?.dispositions || [];
      return [
        ['Disposition', 'Count'],
        ...dispositions.map((d: any) => [d.disposition, d.count]),
      ].map(r => r.join(',')).join('\n');
    }
    return '';
  };

  const getPreview = () => {
    if (!previewData) return null;
    if (selectedReport === 'engagement') {
      return [
        { label: 'Calls', value: previewData.calls?.total || 0, icon: Phone },
        { label: 'Emails', value: previewData.email?.total || 0, icon: Mail },
        { label: 'Qualified', value: previewData.leads?.qualified || 0, icon: UserCheck },
      ];
    }
    if (selectedReport === 'call-reports') {
      return [
        { label: 'Total Calls', value: previewData.summary?.totalCalls || 0, icon: Phone },
        { label: 'Dispositions', value: previewData.dispositions?.length || 0, icon: BarChart3 },
      ];
    }
    if (selectedReport === 'leads') {
      const leads = Array.isArray(previewData) ? previewData : [];
      return [
        { label: 'Total Leads', value: leads.length, icon: UserCheck },
        { label: 'High Score (70+)', value: leads.filter((l: any) => Number(l.aiScore) >= 70).length, icon: BarChart3 },
      ];
    }
    return null;
  };

  const preview = getPreview();

  return (
    
      
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          const isActive = selectedReport === report.value;
          return (
             setSelectedReport(report.value)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedReport(report.value); }}
            >
              
                
                  
                    
                  
                  
                    {report.label}
                    {report.description}
                  
                
              
            
          );
        })}
      

      
        
          
            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((c: any) => (
                    {c.name}
                  ))}
                
              
            
            
              {exporting ?  : }
              Export CSV
            
          
        
      

      
        
          Report Preview
          Summary of data that will be exported
        
        
          {isLoading ? (
            
          ) : preview ? (
            
              {preview.map((item) => {
                const Icon = item.icon;
                return (
                  
                    
                    
                      {item.label}
                      {item.value.toLocaleString()}
                    
                  
                );
              })}
            
          ) : (
            
              
              Select a report type to preview
            
          )}
        
      
    
  );
}