import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Phone,
  Mail,
  UserCheck,
  TrendingUp,
  Loader2,
  Activity,
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
  Legend,
} from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');

const COLORS = ['hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];

export default function ClientPortalAnalytics() {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  // Fetch campaigns
  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });

  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  // Fetch analytics data
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['client-portal-analytics', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/analytics/engagement?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
  });

  const overviewStats = [
    { label: "Total Campaigns", value: analytics?.totalCampaigns || 0, icon: BarChart3, color: "text-blue-500" },
    { label: "Email Sends", value: analytics?.email?.total || 0, icon: Mail, color: "text-green-500" },
    { label: "Calls Made", value: analytics?.calls?.total || 0, icon: Phone, color: "text-purple-500" },
    { label: "Qualified Leads", value: analytics?.leads?.qualified || 0, icon: UserCheck, color: "text-orange-500" },
  ];

  const behaviorDimensionData = analytics?.agentBehavior ? [
    { metric: "Engagement", score: analytics.agentBehavior.engagement || 0 },
    { metric: "Clarity", score: analytics.agentBehavior.clarity || 0 },
    { metric: "Empathy", score: analytics.agentBehavior.empathy || 0 },
    { metric: "Objection Handling", score: analytics.agentBehavior.objectionHandling || 0 },
    { metric: "Qualification", score: analytics.agentBehavior.qualification || 0 },
    { metric: "Closing", score: analytics.agentBehavior.closing || 0 },
    { metric: "Flow", score: analytics.agentBehavior.flowCompliance || 0 },
  ] : [];

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
              
              Engagement Analytics
            
            Comprehensive analytics across all your campaigns
          
        

        {/* Filter */}
        
          
            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((c: any) => (
                    {c.name}
                  ))}
                
              
            
          
        

        {isLoading ? (
          
            
          
        ) : (
          <>
            {/* Overview Stats */}
            
              {overviewStats.map((stat) => (
                
                  
                    {stat.label}
                    
                  
                  
                    {stat.value.toLocaleString()}
                  
                
              ))}
            

            {/* Charts */}
            {analytics?.timeline && analytics.timeline.length > 0 && (
              
                
                  
                    
                    Activity Timeline
                  
                  Calls and emails over time
                
                
                  
                    
                      
                      
                      
                      
                      
                      
                      
                      
                    
                  
                
              
            )}

            {/* Channel Breakdown */}
            {analytics?.channelBreakdown && analytics.channelBreakdown.length > 0 && (
              
                
                  
                    Channel Breakdown
                  
                  
                    
                      
                        
                          {analytics.channelBreakdown.map((_: any, index: number) => (
                            
                          ))}
                        
                        
                        
                      
                    
                  
                

                
                  
                    Disposition Distribution
                  
                  
                    {analytics?.dispositions && analytics.dispositions.length > 0 ? (
                      
                        
                          
                          
                          
                          
                          
                        
                      
                    ) : (
                      
                        No disposition data available
                      
                    )}
                  
                
              
            )}

            {/* Calls + Agent Behaviour */}
            {(analytics?.calls?.total || 0) > 0 && (
              
                
                  
                    
                      
                      Agent Behaviour Analysis
                    
                    
                      Average quality dimensions from analyzed calls
                    
                  
                  
                    
                      
                        Overall Behaviour Score
                        {analytics?.agentBehavior?.overall || 0}
                      
                      
                        Analyzed Calls
                        {analytics?.agentBehavior?.sampleSize || 0}
                      
                      
                        Live Calls
                        {analytics?.calls?.live || 0}
                      
                      
                        Sample Calls
                        {analytics?.calls?.sample || 0}
                      
                    

                    
                      
                        
                        
                        
                        
                        
                      
                    
                  
                

                
                  
                    Recent Calls
                    
                      Latest live and sample calls included in analytics
                    
                  
                  
                    {(analytics?.recentCalls || []).length === 0 ? (
                      
                        No calls available yet.
                      
                    ) : (
                      
                        
                          
                            
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

            {/* Empty State */}
            {(!analytics || (analytics.calls?.total === 0 && analytics.email?.total === 0)) && (
              
                
                  
                  No Analytics Data Yet
                  
                    Analytics will populate as your campaigns run and generate engagement data.
                  
                
              
            )}
          
        )}
      
    
  );
}