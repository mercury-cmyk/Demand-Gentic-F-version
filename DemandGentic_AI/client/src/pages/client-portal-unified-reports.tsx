/**
 * Unified Reports & Analytics Page
 *
 * Consolidates all client portal reporting views (engagement analytics,
 * call reports, conversation quality, recordings, cost tracking, and exports)
 * into a single tabbed interface with an executive overview dashboard.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Phone, Mail, UserCheck, Star, Clock, Activity, DollarSign,
  FileText, MessageSquareText, Mic, Sparkles, Loader2,
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

const getToken = () => localStorage.getItem('clientPortalToken');
const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];

function useCampaigns() {
  return useQuery({
    queryKey: ['unified-report-campaigns'],
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

// ─── OVERVIEW SECTION ────────────────────────────────────
function OverviewSection() {
  const { data: engagement, isLoading: engLoading } = useQuery({
    queryKey: ['unified-overview-engagement'],
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
    queryKey: ['unified-overview-cost'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/cost-tracking', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  if (engLoading) {
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

// ─── AI INSIGHTS SECTION ─────────────────────────────────
function AiInsightsSection({ onOpenPanel }: { onOpenPanel: () => void }) {
  return (
    
      
        
          
            
              
            
            
              AI-Powered Analytics
              
                Ask natural language questions about your campaigns, generate comprehensive reports, and get AI-driven insights across all your data.
              
            
            
              
              Launch AI Reports
            
          
        
      

      
        {[
          { title: "Campaign Performance", desc: "\"How many QA-approved leads do I have?\"", icon: BarChart3 },
          { title: "Lead Analysis", desc: "\"Which campaign is performing best?\"", icon: UserCheck },
          { title: "Custom Reports", desc: "\"Give me a summary of all my campaigns\"", icon: FileText },
        ].map((card) => (
           { if (e.key === 'Enter') onOpenPanel(); }}>
            
              
              {card.title}
              {card.desc}
            
          
        ))}
      
    
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────
export default function ClientPortalUnifiedReports() {
  const [activeTab, setActiveTab] = useState('overview');
  const [showAiReports, setShowAiReports] = useState(false);

  const { data: campaignsData } = useCampaigns();
  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
              
              Reports & Analytics
            
            Unified reporting across all campaigns and channels
          
        

        {/* Tabs */}
        
          
            
              Overview
            
            
              Engagement
            
            
              Calls
            
            
              Quality
            
            
              Recordings
            
            
              Cost
            
            
              AI Insights
            
            
              Export
            
          

          
          
          
          
          
          
           setShowAiReports(true)} />
          
        
      

      
    
  );
}