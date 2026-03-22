import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignPerformanceSnapshot } from "@/components/campaigns/campaign-performance-snapshot";
import { 
  ArrowLeft,
  Mail, 
  MousePointerClick,
  Eye,
  Ban,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  RefreshCw,
  Download,
  ExternalLink
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Color palette for charts
const COLORS = {
  sent: '#3b82f6',      // blue
  delivered: '#22c55e',  // green
  opened: '#8b5cf6',     // purple
  clicked: '#f59e0b',    // amber
  bounced: '#ef4444',    // red
  unsubscribed: '#6b7280', // gray
};

const PIE_COLORS = ['#22c55e', '#8b5cf6', '#f59e0b', '#ef4444', '#6b7280'];

interface EmailCampaignStats {
  campaignId: string;
  campaignName: string;
  status: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  opened: number;
  uniqueOpens: number;
  clicked: number;
  uniqueClicks: number;
  bounced: number;
  hardBounces: number;
  softBounces: number;
  unsubscribed: number;
  spamComplaints: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  deliveryRoute?: {
    senderProfileId?: string | null;
    senderName?: string | null;
    fromEmail?: string | null;
    replyToEmail?: string | null;
    providerKey?: string | null;
    providerName?: string | null;
    providerLabel?: string | null;
    providerHealthStatus?: string | null;
    source?: string | null;
    isBrevo?: boolean;
  };
}

interface LinkClickStats {
  url: string;
  clicks: number;
  uniqueClicks: number;
  percentage: number;
}

interface DeviceStats {
  device: string;
  count: number;
  percentage: number;
}

interface TimelineData {
  timestamp: string;
  opens: number;
  clicks: number;
  cumulative_opens: number;
  cumulative_clicks: number;
}

interface RecipientActivity {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  status: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed';
  openedAt?: string;
  clickedAt?: string;
  clickCount: number;
  deviceType?: string;
}

export default function EmailCampaignReportsPage() {
  const [, params] = useRoute("/campaigns/email/:id/reports");
  const campaignId = params?.id;
  const [dateRange, setDateRange] = useState("7d");
  
  // Fetch campaign stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['/api/campaigns/email', campaignId, 'stats'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/email-stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch link click breakdown
  const { data: linkStats = [] } = useQuery({
    queryKey: ['/api/campaigns/email', campaignId, 'link-stats'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/link-stats`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch device breakdown
  const { data: deviceStats = [] } = useQuery({
    queryKey: ['/api/campaigns/email', campaignId, 'device-stats'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/device-stats`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch engagement timeline
  const { data: timeline = [] } = useQuery({
    queryKey: ['/api/campaigns/email', campaignId, 'timeline', dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/engagement-timeline?range=${dateRange}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch recipient activity
  const { data: recipients = [] } = useQuery({
    queryKey: ['/api/campaigns/email', campaignId, 'recipients'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/recipient-activity?limit=100`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Calculate funnel data
  const funnelData = stats ? [
    { stage: 'Sent', value: stats.totalSent, color: COLORS.sent },
    { stage: 'Delivered', value: stats.delivered, color: COLORS.delivered },
    { stage: 'Opened', value: stats.uniqueOpens, color: COLORS.opened },
    { stage: 'Clicked', value: stats.uniqueClicks, color: COLORS.clicked },
  ] : [];

  // Status distribution for pie chart
  const statusDistribution = stats ? [
    { name: 'Delivered', value: stats.delivered - stats.uniqueOpens, color: COLORS.delivered },
    { name: 'Opened', value: stats.uniqueOpens - stats.uniqueClicks, color: COLORS.opened },
    { name: 'Clicked', value: stats.uniqueClicks, color: COLORS.clicked },
    { name: 'Bounced', value: stats.bounced, color: COLORS.bounced },
    { name: 'Unsubscribed', value: stats.unsubscribed, color: COLORS.unsubscribed },
  ].filter(item => item.value > 0) : [];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatPercent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  const getStatusBadge = (status: string) => {
    const variants: Record = {
      delivered: "secondary",
      opened: "default",
      clicked: "default",
      bounced: "destructive",
      unsubscribed: "outline",
    };
    return {status};
  };

  const performanceSnapshot = stats ? {
    email: {
      totalRecipients: stats.totalSent || 0,
      delivered: stats.delivered || 0,
      opens: stats.uniqueOpens || 0,
      clicks: stats.uniqueClicks || 0,
      unsubscribes: stats.unsubscribed || 0,
      spamComplaints: stats.spamComplaints || 0,
    },
    call: null,
  } : null;

  if (!campaignId) {
    return (
      
        Campaign not found
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
            
              
            
          
          
            
              {statsLoading ?  : stats?.campaignName || 'Campaign Reports'}
            
            
              Email campaign performance analytics and engagement metrics
            
          
        
        
          
            
              
            
            
              Last 24h
              Last 7 days
              Last 30 days
              All time
            
          
           refetchStats()}>
            
            Refresh
          
          
            
            Export
          
        
      

      

      {stats?.deliveryRoute && (
        
          
            Delivery Route
            
              {stats.deliveryRoute.isBrevo ? "Brevo-connected delivery is configured for this campaign." : "Current sender, reply, and provider routing for this campaign."}
            
          
          
            
              Sender
              
                {stats.deliveryRoute.senderName
                  ? `${stats.deliveryRoute.senderName} `
                  : stats.deliveryRoute.fromEmail || "Not set"}
              
            
            
              Reply-To
              {stats.deliveryRoute.replyToEmail || "Not set"}
            
            
              
                Provider
                {stats.deliveryRoute.isBrevo && (
                  
                    Brevo
                  
                )}
              
              {stats.deliveryRoute.providerLabel || "Default routing"}
              
                Source: {stats.deliveryRoute.source === "send-history" ? "campaign send history" : stats.deliveryRoute.source === "campaign-routing" ? "campaign routing" : "fallback routing"}
              
            
          
        
      )}

      {/* Key Metrics Cards */}
      
        
          
            Sent
            
          
          
            {statsLoading ? (
              
            ) : (
              <>
                {formatNumber(stats?.totalSent || 0)}
                Total emails sent
              
            )}
          
        

        
          
            Delivered
            
          
          
            {statsLoading ? (
              
            ) : (
              <>
                {formatPercent(stats?.deliveryRate || 0)}
                {formatNumber(stats?.delivered || 0)} delivered
              
            )}
          
        

        
          
            Open Rate
            
          
          
            {statsLoading ? (
              
            ) : (
              <>
                {formatPercent(stats?.openRate || 0)}
                {formatNumber(stats?.uniqueOpens || 0)} unique opens
              
            )}
          
        

        
          
            Click Rate
            
          
          
            {statsLoading ? (
              
            ) : (
              <>
                {formatPercent(stats?.clickRate || 0)}
                {formatNumber(stats?.uniqueClicks || 0)} unique clicks
              
            )}
          
        

        
          
            Bounced
            
          
          
            {statsLoading ? (
              
            ) : (
              <>
                {formatPercent(stats?.bounceRate || 0)}
                {formatNumber(stats?.bounced || 0)} bounces
              
            )}
          
        

        
          
            Unsubscribed
            
          
          
            {statsLoading ? (
              
            ) : (
              <>
                {formatPercent(stats?.unsubscribeRate || 0)}
                {formatNumber(stats?.unsubscribed || 0)} unsubscribes
              
            )}
          
        
      

      {/* Tabs for different report views */}
      
        
          
            
            Overview
          
          
            
            Engagement
          
          
            
            Link Clicks
          
          
            
            Recipients
          
        

        {/* Overview Tab */}
        
          
            {/* Engagement Funnel */}
            
              
                Engagement Funnel
                Email delivery and engagement progression
              
              
                
                  
                    
                    
                    
                     [formatNumber(value), 'Count']}
                    />
                    
                      {funnelData.map((entry, index) => (
                        
                      ))}
                    
                  
                
              
            

            {/* Status Distribution Pie */}
            
              
                Status Distribution
                Breakdown of email statuses
              
              
                
                  
                     `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {statusDistribution.map((entry, index) => (
                        
                      ))}
                    
                     [formatNumber(value), 'Recipients']} />
                    
                  
                
              
            
          

          {/* Device Breakdown */}
          {deviceStats.length > 0 && (
            
              
                Device Breakdown
                Opens by device type
              
              
                
                  {deviceStats.map((device) => (
                    
                      
                        {device.device}
                        
                          {device.count} ({device.percentage.toFixed(1)}%)
                        
                      
                      
                    
                  ))}
                
              
            
          )}
        

        {/* Engagement Timeline Tab */}
        
          
            
              Engagement Over Time
              Opens and clicks throughout the campaign
            
            
              
                
                  
                   new Date(value).toLocaleDateString()}
                  />
                  
                   new Date(value).toLocaleString()}
                    formatter={(value: number, name: string) => [
                      formatNumber(value), 
                      name === 'opens' ? 'Opens' : 'Clicks'
                    ]}
                  />
                  
                  
                  
                
              
            
          

          {/* Cumulative Engagement */}
          
            
              Cumulative Engagement
              Total opens and clicks over time
            
            
              
                
                  
                   new Date(value).toLocaleDateString()}
                  />
                  
                   new Date(value).toLocaleString()}
                  />
                  
                  
                  
                
              
            
          
        

        {/* Link Clicks Tab */}
        
          
            
              Link Performance
              Click breakdown by URL
            
            
              {linkStats.length === 0 ? (
                
                  No link clicks recorded yet
                
              ) : (
                
                  
                    
                      URL
                      Total Clicks
                      Unique Clicks
                      % of Total
                    
                  
                  
                    {linkStats.map((link, idx) => (
                      
                        
                          
                            {link.url.length > 60 ? `${link.url.slice(0, 60)}...` : link.url}
                            
                          
                        
                        {formatNumber(link.clicks)}
                        {formatNumber(link.uniqueClicks)}
                        
                          
                            
                            {link.percentage.toFixed(1)}%
                          
                        
                      
                    ))}
                  
                
              )}
            
          

          {/* Link Click Chart */}
          {linkStats.length > 0 && (
            
              
                Click Distribution
                Visual breakdown of link clicks
              
              
                
                  
                    
                    
                     value.length > 30 ? `${value.slice(0, 30)}...` : value}
                    />
                    
                    
                  
                
              
            
          )}
        

        {/* Recipients Tab */}
        
          
            
              Recipient Activity
              Individual recipient engagement details
            
            
              {recipients.length === 0 ? (
                
                  No recipient data available
                
              ) : (
                
                  
                    
                      Recipient
                      Company
                      Status
                      Opened
                      Clicks
                      Device
                    
                  
                  
                    {recipients.map((recipient, idx) => (
                      
                        
                          
                            
                              {recipient.firstName} {recipient.lastName}
                            
                            
                              {recipient.email}
                            
                          
                        
                        {recipient.company || '-'}
                        {getStatusBadge(recipient.status)}
                        
                          {recipient.openedAt 
                            ? new Date(recipient.openedAt).toLocaleString() 
                            : '-'
                          }
                        
                        {recipient.clickCount || 0}
                        
                          {recipient.deviceType || '-'}
                        
                      
                    ))}
                  
                
              )}
            
          
        
      
    
  );
}