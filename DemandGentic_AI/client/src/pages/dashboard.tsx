import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StatCard } from "@/components/shared/stat-card";
import { 
  Users, Building2, Mail, CheckCircle, Phone, Clock, TrendingUp, 
  Award, FileText, ArrowUp, ArrowDown, Activity, Sparkles, 
  Zap, MessageSquare, ShieldCheck, Search, Brain, Target, AlertCircle, Plus, Calendar
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { TrendChart } from "@/components/patterns/dashboard-components";
import { AIReasoning } from "@/components/ui/ai-reasoning";
import { AgentState } from "@/components/ui/agent-state";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import { UnifiedIntelligenceDashboard } from "@/components/intelligence/unified-intelligence-dashboard";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalAccounts: number;
  totalContacts: number;
  activeCampaigns: number;
  activeCampaignsBreakdown: {
    email: number;
    telemarketing: number;
  };
  leadsThisMonth: number;
}

interface AgentStats {
  callsToday: number;
  callsThisMonth: number;
  totalCalls: number;
  avgDuration: number;
  qualified: number;
  leadsApproved: number;
  leadsPending: number;
  activeCampaigns: number;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Get user roles array
  const userRoles = (user as any)?.roles || [user?.role || ''];
  const isAgent = userRoles.includes('agent') && 
                  !userRoles.includes('admin') && 
                  !userRoles.includes('campaign_manager');
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/dashboard/stats'],
    enabled: !isAgent,
  });

  const { data: agentStats, isLoading: agentLoading } = useQuery({
    queryKey: ['/api/dashboard/agent-stats'],
    enabled: isAgent,
  });

  // Mock AI Insights
  const aiInsights = [
    {
      id: 1,
      type: "opportunity",
      summary: "High-value opportunity detected",
      details: "Account 'Acme Corp' shows 85% intent signal based on recent email engagement and website visits.",
      confidence: 85,
      action: "Prioritize Outreach"
    },
    {
      id: 2,
      type: "anomaly",
      summary: "Unusual call drop rate in 'Tech Sector' campaign",
      details: "Call drop rate increased by 15% in the last hour. AI suggests checking VOIP latency or script timing.",
      confidence: 92,
      action: "Investigate"
    },
    {
      id: 3,
      type: "optimization",
      summary: "Email open rates peaking at 10 AM EST",
      details: "Analysis of last 5000 emails suggests shifting schedule to 10 AM EST could improve engagement by 12%.",
      confidence: 78,
      action: "Adjust Schedule"
    }
  ];

  // Mock Trend Data
  const trendData = [
    { label: "Mon", value: 120 },
    { label: "Tue", value: 132 },
    { label: "Wed", value: 101 },
    { label: "Thu", value: 134 },
    { label: "Fri", value: 190 },
    { label: "Sat", value: 130 },
    { label: "Sun", value: 120 },
  ];

  const statThemes = [
    {
      gradient: "from-emerald-500/25 via-emerald-400/10 to-transparent",
      accent: "bg-gradient-to-br from-emerald-400 to-emerald-600",
    },
    {
      gradient: "from-sky-500/25 via-cyan-400/10 to-transparent",
      accent: "bg-gradient-to-br from-sky-400 to-cyan-600",
    },
    {
      gradient: "from-amber-500/25 via-orange-400/10 to-transparent",
      accent: "bg-gradient-to-br from-amber-400 to-orange-500",
    },
  ];

  const agentThemes = [
    {
      gradient: "from-rose-500/25 via-rose-400/10 to-transparent",
      accent: "bg-gradient-to-br from-rose-400 to-rose-600",
    },
    {
      gradient: "from-teal-500/25 via-teal-400/10 to-transparent",
      accent: "bg-gradient-to-br from-teal-400 to-emerald-600",
    },
    {
      gradient: "from-lime-400/25 via-sky-400/10 to-transparent",
      accent: "bg-gradient-to-br from-lime-400 to-sky-600",
    },
  ];

  const insightThemes: Record = {
    opportunity: {
      card: "border-emerald-400/30 bg-emerald-500/10",
      icon: "text-emerald-500",
      button: "border-emerald-400/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-300",
    },
    anomaly: {
      card: "border-amber-400/30 bg-amber-500/10",
      icon: "text-amber-500",
      button: "border-amber-400/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-300",
    },
    optimization: {
      card: "border-sky-400/30 bg-sky-500/10",
      icon: "text-sky-500",
      button: "border-sky-400/40 text-sky-600 hover:bg-sky-500/10 dark:text-sky-300",
    },
  };

  if (isLoading || agentLoading) {
    return (
      
        
          
          
        
        
          
          
          
          
        
        
      
    );
  }

  return (
    
      {/* Header Section */}
      
        
          
            Dashboard
          
          
            {isAgent ? "Agent Performance & Tasks" : "System Overview & Insights"}
          
        
        
           
            setLocation('/campaigns/create')}
             className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
           >
             
             New Campaign
           
        
      

      {/* Main Content Grid */}
      
        
        {/* Left Column: Operational Metrics (2/3 width) */}
        
          
          {/* Key Metrics Cards */}
          
            {!isAgent ? (
              <>
                
                    
                        
                            Total Contacts
                            
                                
                            
                        
                        
                             {stats?.totalContacts || 0}
                            
                                
                                +12%
                             
                        
                    
                
                
                    
                        
                            Active Campaigns
                            
                                
                            
                        
                        
                             {stats?.activeCampaigns || 0}
                             
                                {stats?.activeCampaignsBreakdown?.email || 0} Email, {stats?.activeCampaignsBreakdown?.telemarketing || 0} Voice
                             
                        
                    
                
                
                    
                        
                            Leads Generated
                            
                                
                            
                        
                        
                             {stats?.leadsThisMonth || 0}
                             
                                
                                +8%
                             
                        
                    
                
              
            ) : (
                <>
                 {/* Agent Stats Placeholders - matching style */}
                 
                    
                         {agentStats?.callsToday || 0}
                         Calls Today
                    
                 
                 
                    
                         {agentStats?.qualified || 0}
                         Qualified Leads
                    
                 
                 
                    
                         {Math.floor((agentStats?.avgDuration || 0) / 60)}m {(agentStats?.avgDuration || 0) % 60}s
                         Avg Duration
                    
                 
                
            )}
          

          {/* Performance Trend Chart */}
          
            
              
                
                Performance Trends
              
            
            
              
            
          

        

        {/* Right Column: AI Insights & Actions */}
        
          
            
              
                
                Public Pages
              
              Shareable links for prospect-facing pages.
            
            
              
                
                  
                  Contact Us
                
              
              
                
                  
                  Book a Demo
                
              
              
                
                  
                  Request a Proposal
                
              
            
          
          
             
                
                    
                    AI Insights
                
             
             
                
                  {aiInsights.map((insight) => (
                    
                        
                            
                                {insight.type === 'opportunity' ?  : 
                                 insight.type === 'anomaly' ?  : 
                                 }
                            
                            
                                
                                    {insight.type}
                                    {insight.confidence}% confidence
                                
                                {insight.summary}
                                {insight.details}
                                
                                    {insight.action}
                                    
                                
                            
                        
                    
                  ))}
                
             
          
        

        {/* Unified Intelligence Hub */}
        
          
        
      
    
  );

}