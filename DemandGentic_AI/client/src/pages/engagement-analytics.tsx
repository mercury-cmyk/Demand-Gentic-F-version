import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, Download, Mail, Phone, UserCheck, TrendingUp, 
  Activity, CheckCircle, XCircle, Clock, Target, DollarSign,
  CalendarIcon, Users, MessageSquare, FileText, Calendar as CalendarDays
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function EngagementAnalyticsPage() {
  const [dateRange, setDateRange] = useState({ from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), to: new Date() });
  const [selectedCampaign, setSelectedCampaign] = useState("all");

  // Fetch campaigns for filter
  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
  });

  const filteredCampaigns = selectedCampaign === 'all'
    ? campaigns
    : campaigns.filter((campaign: any) => campaign.id === selectedCampaign);

  const formatCampaignTimeline = (campaign: any) => {
    const start = campaign.startDate ? format(new Date(campaign.startDate), 'MMM dd') : '';
    const end = campaign.endDate ? format(new Date(campaign.endDate), 'MMM dd') : '';

    if (!start && !end) return '-';
    if (start && end) return `${start} - ${end}`;
    return start || end;
  };

  // Fetch comprehensive analytics (you'll need to create this endpoint)
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['/api/analytics/engagement', dateRange, selectedCampaign],
    queryFn: async () => {
      // This will need to be implemented on the backend
      const params = new URLSearchParams({
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
        campaign: selectedCampaign,
      });
      const response = await fetch(`/api/analytics/engagement?${params}`);
      return response.json();
    },
  });

  const overviewStats = [
    { label: "Total Campaigns", value: filteredCampaigns.length, icon: BarChart3, color: "text-blue-500" },
    { label: "Email Sends", value: analytics?.email?.total || 0, icon: Mail, color: "text-green-500" },
    { label: "Calls Made", value: analytics?.calls?.total || 0, icon: Phone, color: "text-purple-500" },
    { label: "Qualified Leads", value: analytics?.leads?.qualified || 0, icon: UserCheck, color: "text-orange-500" },
  ];

  const engagementTrend = analytics?.timeline || [];
  const channelBreakdown = analytics?.channelBreakdown || [];
  const dispositionData = analytics?.dispositions || [];

  return (
    
      {/* Modern Header with Gradient */}
      
        
        
        
          
            
              
                
              
              Engagement Analytics
            
            
              Complete view of all activity across campaigns, channels, and outcomes
            
          
          
            
            Export Report
          
        
      

      {/* Filters */}
      
        
          
            
              Date Range
              
                
                  
                    
                    {dateRange.from && dateRange.to ? (
                      <>
                        {format(dateRange.from, "MMM dd, yyyy")} - {format(dateRange.to, "MMM dd, yyyy")}
                      
                    ) : (
                      "Select date range"
                    )}
                  
                
                
                   range && setDateRange(range)}
                  />
                
              
            

            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((campaign: any) => (
                    
                      {campaign.name}
                    
                  ))}
                
              
            
          
        
      

      {/* Overview Stats */}
      
        {overviewStats.map((stat, index) => (
          
            
            
            
              
                
                  {stat.label}
                  {stat.value.toLocaleString()}
                
                
                  
                
              
            
          
        ))}
      

      {/* Main Analytics Tabs */}
      
        
          Overview
          Email
          Calls
          Leads
          Campaigns
        

        
          
            {/* Engagement Timeline */}
            
              
                Engagement Timeline
                Activity across all channels over time
              
              
                
                  
                    
                    
                    
                    
                    
                    
                    
                    
                  
                
              
            

            {/* Channel Breakdown */}
            
              
                Channel Performance
                Distribution across channels
              
              
                
                  
                     `${name}: ${value}`}
                      outerRadius={100}
                      fill="hsl(var(--chart-1))"
                      dataKey="value"
                    >
                      {channelBreakdown.map((entry: any, index: number) => (
                        
                      ))}
                    
                    
                  
                
              
            
          

          {/* Disposition Breakdown */}
          
            
              Call Dispositions
              Outcome distribution for all calls
            
            
              
                
                  
                  
                  
                  
                  
                
              
            
          
        

        
          
            
              
                
                  
                  {analytics?.email?.sent || 0}
                  Sent
                
              
            
            
              
                
                  
                  {analytics?.email?.delivered || 0}
                  Delivered ({((analytics?.email?.delivered / analytics?.email?.sent) * 100 || 0).toFixed(1)}%)
                
              
            
            
              
                
                  
                  {analytics?.email?.opened || 0}
                  Opened ({((analytics?.email?.opened / analytics?.email?.delivered) * 100 || 0).toFixed(1)}%)
                
              
            
            
              
                
                  
                  {analytics?.email?.clicked || 0}
                  Clicked ({((analytics?.email?.clicked / analytics?.email?.opened) * 100 || 0).toFixed(1)}%)
                
              
            
          
        

        
          
            
              
                
                  
                  {analytics?.calls?.attempted || 0}
                  Attempted
                
              
            
            
              
                
                  
                  {analytics?.calls?.connected || 0}
                  Connected ({((analytics?.calls?.connected / analytics?.calls?.attempted) * 100 || 0).toFixed(1)}%)
                
              
            
            
              
                
                  
                  {analytics?.calls?.avgDuration || 0}s
                  Avg Duration
                
              
            
            
              
                
                  
                  {analytics?.calls?.qualified || 0}
                  Qualified ({((analytics?.calls?.qualified / analytics?.calls?.connected) * 100 || 0).toFixed(1)}%)
                
              
            
          
        

        
          
            
              
                
                  
                  {analytics?.leads?.total || 0}
                  Total Leads
                
              
            
            
              
                
                  
                  {analytics?.leads?.approved || 0}
                  Approved ({((analytics?.leads?.approved / analytics?.leads?.total) * 100 || 0).toFixed(1)}%)
                
              
            
            
              
                
                  
                  {analytics?.leads?.pending || 0}
                  Pending Review
                
              
            
            
              
                
                  
                  {analytics?.leads?.rejected || 0}
                  Rejected
                
              
            
          
        

        
          
            
              Campaign Performance Summary
              Goals vs Actuals across all campaigns
            
            
              
                {filteredCampaigns.map((campaign: any) => (
                  
                    
                      {campaign.name}
                      
                        {campaign.status}
                      
                    
                    
                      
                        Target Leads
                        
                          
                          {campaign.targetQualifiedLeads ?? 0}
                        
                      
                      
                        Actual Leads
                        
                          {analytics?.campaignLeads?.[campaign.id] ?? 0}
                        
                      
                      {campaign.costPerLead && (
                        
                          Cost Per Lead
                          
                            
                            {parseFloat(campaign.costPerLead).toFixed(2)}
                          
                        
                      )}
                      
                        Timeline
                        
                          {formatCampaignTimeline(campaign)}
                        
                      
                    
                  
                ))}
              
            
          
        
      
    
  );
}