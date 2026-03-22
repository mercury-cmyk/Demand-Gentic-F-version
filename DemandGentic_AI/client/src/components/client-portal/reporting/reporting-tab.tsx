/**
 * Unified Reporting Tab — Consolidated reporting hub for the client portal dashboard.
 *
 * Sections:
 *   1. Overview       — KPI cards, timeline, channel mix, disposition distribution
 *   2. Analytics      — Engagement & Call analytics with charts
 *   3. Recordings     — Call recordings with GCS playback URLs
 *   4. Export         — Qualified leads CSV export
 *   5. AI Insights    — Agent recommendations & AI-generated campaign analysis
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Phone, Mail, UserCheck, Star, Clock, Activity, Mic,
  FileText, Sparkles, Loader2, Download, Bot, Lightbulb,
  TrendingUp, CheckCircle2, Target, RefreshCw, AlertCircle,
} from "lucide-react";
import {
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  EngagementSection, CallsSection, QualitySection,
  RecordingsSection, CostSection, ExportSection,
} from "@/components/client-portal/reports/unified-report-sections";
import { AgenticReportsPanel } from "@/components/client-portal/reports/agentic-reports-panel";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = 'overview' | 'analytics' | 'recordings' | 'export' | 'ai-insights';

interface ReportingTabProps {
  authHeaders: { headers: { Authorization: string } };
  clientAccountId?: string;
}

// ─── Section Nav ──────────────────────────────────────────────────────────────

const SECTIONS: { id: Section; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'analytics', label: 'Campaign Analytics', icon: Activity },
  { id: 'recordings', label: 'Call Recordings', icon: Mic },
  { id: 'export', label: 'Leads Export', icon: Download },
  { id: 'ai-insights', label: 'Agent Recommendations', icon: Bot },
];

function SectionNav({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  return (
    
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
           onChange(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            
            {s.label}
          
        );
      })}
    
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getToken = () => localStorage.getItem('clientPortalToken');
const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];

function useCampaigns() {
  return useQuery({
    queryKey: ['reporting-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Overview Section ─────────────────────────────────────────────────────────

function OverviewSection() {
  const { data: engagement, isLoading } = useQuery({
    queryKey: ['reporting-overview-engagement'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/analytics/engagement', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: costData } = useQuery({
    queryKey: ['reporting-overview-cost'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/cost-tracking', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return ;
  }

  const kpis = [
    { label: "Active Campaigns", value: engagement?.totalCampaigns || 0, icon: BarChart3, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Total Calls", value: engagement?.calls?.total || 0, icon: Phone, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Emails Sent", value: engagement?.email?.total || 0, icon: Mail, color: "text-cyan-500", bg: "bg-cyan-500/10" },
    { label: "Qualified Leads", value: engagement?.leads?.qualified || 0, icon: UserCheck, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "Avg Quality Score", value: `${engagement?.agentBehavior?.overall || 0}%`, icon: Star, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Call Minutes", value: costData?.summary?.totalDurationMinutes || 0, icon: Clock, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  ];

  return (
    
      
        {kpis.map((kpi) => (
          
            
              
                
                  
                
                
                  {kpi.label}
                  {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                
              
            
          
        ))}
      

      {engagement?.timeline?.length > 0 && (
        
          
            
              
                
                30-Day Activity Timeline
              
            
            
              
                
                  
                  
                  
                  
                  
                  
                
              
            
          

          {engagement?.channelBreakdown?.length > 0 && (
            
              Channel Mix
              
                
                  
                    
                      {engagement.channelBreakdown.map((_: any, i: number) => (
                        
                      ))}
                    
                    
                  
                
              
            
          )}
        
      )}

      {engagement?.dispositions?.length > 0 && (
        
          Disposition Distribution
          
            
              
                
                
                
              
            
          
        
      )}
    
  );
}

// ─── Analytics Section (Engagement + Calls + Quality + Cost) ──────────────────

function AnalyticsSection({ campaigns }: { campaigns: any[] }) {
  const [view, setView] = useState('engagement');

  return (
    
      
        {[
          { id: 'engagement' as const, label: 'Engagement', icon: Activity },
          { id: 'calls' as const, label: 'Calls', icon: Phone },
          { id: 'quality' as const, label: 'Quality', icon: Star },
          { id: 'cost' as const, label: 'Cost', icon: Clock },
        ].map((v) => (
           setView(v.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              view === v.id
                ? 'bg-muted text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            
            {v.label}
          
        ))}
      

      {view === 'engagement' && }
      {view === 'calls' && }
      {view === 'quality' && }
      {view === 'cost' && }
    
  );
}

// ─── Agent Recommendations Section ────────────────────────────────────────────

interface CampaignAnalysis {
  campaignName: string;
  performance: string;
  summary: string;
  recommendations: string[];
}

interface GeneratedReport {
  executiveSummary: string;
  highlights: Array;
  campaignAnalysis: CampaignAnalysis[];
  recommendations: string[];
}

function AgentRecommendationsSection() {
  const [showPanel, setShowPanel] = useState(false);

  const reportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          reportType: 'comprehensive',
          includeRecommendations: true,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      return res.json();
    },
  });

  const report: GeneratedReport | null = reportMutation.data?.report || null;

  return (
    
      {/* Generate report CTA */}
      
        
          
            
              
            
            
              AI Agent Recommendations
              
                Generate AI-powered analysis of your campaigns with actionable recommendations, performance insights, and next steps.
              
            
            
               reportMutation.mutate()}
                disabled={reportMutation.isPending}
                className="gap-2"
              >
                {reportMutation.isPending ? (
                  
                ) : (
                  
                )}
                {report ? 'Regenerate' : 'Generate Report'}
              
               setShowPanel(true)} className="gap-2">
                
                AI Reports Chat
              
            
          
        
      

      {/* Error state */}
      {reportMutation.isError && (
        
          
            
            Failed to generate report. Please try again.
          
        
      )}

      {/* Loading state */}
      {reportMutation.isPending && (
        
          
          
            {[...Array(4)].map((_, i) => )}
          
          
        
      )}

      {/* Generated report */}
      {report && !reportMutation.isPending && (
        
          {/* Executive Summary */}
          
            
              
                
                Executive Summary
              
            
            
              {report.executiveSummary}
            
          

          {/* Highlights */}
          {report.highlights?.length > 0 && (
            
              {report.highlights.map((h, i) => (
                
                  
                    
                      {h.trend === 'up' && }
                      {h.trend === 'down' && }
                      {h.trend === 'stable' && }
                      {h.metric}
                    
                    {h.value}
                    {h.insight}
                  
                
              ))}
            
          )}

          {/* Campaign Analysis */}
          {report.campaignAnalysis?.length > 0 && (
            
              
                
                  
                  Campaign Analysis
                
              
              
                
                  
                    {report.campaignAnalysis.map((ca, i) => (
                      
                        
                          {ca.campaignName}
                          
                            {ca.performance.replace(/_/g, ' ')}
                          
                        
                        {ca.summary}
                        {ca.recommendations?.length > 0 && (
                          
                            {ca.recommendations.map((rec, j) => (
                              
                                
                                {rec}
                              
                            ))}
                          
                        )}
                      
                    ))}
                  
                
              
            
          )}

          {/* Top-level Recommendations */}
          {report.recommendations?.length > 0 && (
            
              
                
                  
                  Recommended Next Steps
                
              
              
                
                  {report.recommendations.map((rec, i) => (
                    
                      
                        {i + 1}
                      
                      {rec}
                    
                  ))}
                
              
            
          )}
        
      )}

      
    
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportingTab({ authHeaders, clientAccountId }: ReportingTabProps) {
  const urlSection = new URLSearchParams(window.location.search).get('section');
  const validSections: Section[] = ['overview', 'analytics', 'recordings', 'export', 'ai-insights'];
  const initialSection = validSections.includes(urlSection as Section) ? (urlSection as Section) : 'overview';
  const [activeSection, setActiveSection] = useState(initialSection);

  const { data: campaignsData } = useCampaigns();
  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  return (
    
      

      {activeSection === 'overview' && }
      {activeSection === 'analytics' && }
      {activeSection === 'recordings' && }
      {activeSection === 'export' && }
      {activeSection === 'ai-insights' && }
    
  );
}