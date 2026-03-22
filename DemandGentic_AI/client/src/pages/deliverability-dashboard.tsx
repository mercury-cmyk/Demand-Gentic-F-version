/**
 * Deliverability Dashboard Page
 *
 * Monitor email deliverability metrics, blacklist status, and health scores.
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Flame,
  Globe,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface DashboardData {
  summary: {
    totalDomains: number;
    healthyDomains: number;
    warningDomains: number;
    criticalDomains: number;
    blacklistedDomains: number;
    averageHealthScore: number;
  };
  metrics: {
    totalSent: number;
    delivered: number;
    bounced: number;
    complaints: number;
    opens: number;
    clicks: number;
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
    openRate: number;
    clickRate: number;
  };
  domains: Array;
}

interface BlacklistData {
  summary: {
    totalMonitors: number;
    totalListed: number;
    totalClean: number;
  };
  byDomain: Array;
  }>;
}

interface WarmupData {
  domains: Array;
  summary: {
    inWarmup: number;
    completed: number;
    notStarted: number;
  };
}

function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  color = 'default',
}: {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ElementType;
  color?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    default: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  };

  return (
    
      
        {title}
        
      
      
        {value}
        {change !== undefined && (
          
            {change > 0 ? (
              
            ) : change 
            ) : (
              
            )}
             0 ? 'text-green-600' : change 
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            
            {changeLabel && {changeLabel}}
          
        )}
      
    
  );
}

function HealthScoreGauge({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getGrade = (s: number) => {
    if (s >= 90) return 'A';
    if (s >= 80) return 'B';
    if (s >= 70) return 'C';
    if (s >= 60) return 'D';
    return 'F';
  };

  const sizeClasses = size === 'lg' ? 'w-32 h-32 text-4xl' : 'w-16 h-16 text-xl';

  return (
    
      {score}
      {size === 'lg' && Grade: {getGrade(score)}}
    
  );
}

function DomainHealthRow({ domain }: { domain: DashboardData['domains'][0] }) {
  const getHealthColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getAuthIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return ;
      case 'failed':
        return ;
      default:
        return ;
    }
  };

  return (
    
      
        
          
          {domain.domain}
        
      
      
        
          {domain.healthScore}
        
      
      
        
          {getAuthIcon(domain.spfStatus)}
          {getAuthIcon(domain.dkimStatus)}
          {getAuthIcon(domain.dmarcStatus)}
        
      
      
        
          
          {domain.reputationScore}
        
      
      
        
          
          {domain.engagementScore}
        
      
      
        {domain.blacklistListings > 0 ? (
          {domain.blacklistListings} listed
        ) : (
          Clean
        )}
      
      
        
          {domain.warmupPhase === 'completed' ? 'Complete' : domain.warmupPhase}
        
      
    
  );
}

function BlacklistTab() {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['blacklists'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/deliverability/blacklists');
      return response.json();
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/deliverability/blacklists/run-scheduled');
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: 'Check complete',
        description: `Checked ${result.checked} monitors. ${result.newListings} new listings found.`,
      });
      refetch();
    },
  });

  if (isLoading) {
    return (
      
        
      
    );
  }

  return (
    
      {/* Summary Cards */}
      
        
          
            Total Monitors
          
          
            {data?.summary.totalMonitors || 0}
          
        
        
          
            Clean
          
          
            {data?.summary.totalClean || 0}
          
        
        
          
            Listed
          
          
            {data?.summary.totalListed || 0}
          
        
      

      {/* Run Checks Button */}
      
         checkMutation.mutate()} disabled={checkMutation.isPending}>
          {checkMutation.isPending && }
          Run Blacklist Checks
        
      

      {/* Blacklist Details by Domain */}
      {data?.byDomain.map((domainData) => (
        
          
            
              
                
                {domainData.domain}
              
              
                
                  {domainData.clean} clean
                
                {domainData.listed > 0 && (
                  {domainData.listed} listed
                )}
              
            
          
          {domainData.listed > 0 && (
            
              
                
                  
                    RBL
                    Category
                    Listed Since
                    Action
                  
                
                
                  {domainData.monitors
                    .filter((m) => m.isListed)
                    .map((monitor) => (
                      
                        {monitor.rblDisplayName}
                        
                          {monitor.rblCategory}
                        
                        
                          {monitor.listedSince
                            ? new Date(monitor.listedSince).toLocaleDateString()
                            : 'Unknown'}
                        
                        
                          {monitor.delistingUrl && (
                             window.open(monitor.delistingUrl!, '_blank')}
                            >
                              Request Delisting
                              
                            
                          )}
                        
                      
                    ))}
                
              
            
          )}
        
      ))}
    
  );
}

function WarmupTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['warmup-schedule'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/deliverability/warmup-schedule');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      
        
      
    );
  }

  return (
    
      {/* Summary */}
      
        
          
            In Warmup
          
          
            
              
              {data?.summary.inWarmup || 0}
            
          
        
        
          
            Completed
          
          
            {data?.summary.completed || 0}
          
        
        
          
            Not Started
          
          
            {data?.summary.notStarted || 0}
          
        
      

      {/* Warmup Progress Table */}
      
        
          Warmup Progress
          
            Track the warmup progress for each domain
          
        
        
          
            
              
                Domain
                Phase
                Progress
                Today's Target
                Today's Actual
                Started
              
            
            
              {data?.domains.map((domain) => (
                
                  {domain.domain}
                  
                    
                      {domain.phase}
                    
                  
                  
                    
                      
                      {Math.round(domain.progress)}%
                    
                  
                  {domain.todayTarget.toLocaleString()}
                  
                    = domain.todayTarget
                          ? 'text-green-600'
                          : domain.todayActual > 0
                          ? 'text-yellow-600'
                          : ''
                      }
                    >
                      {domain.todayActual.toLocaleString()}
                    
                  
                  
                    {domain.startedAt
                      ? new Date(domain.startedAt).toLocaleDateString()
                      : '-'}
                  
                
              ))}
            
          
        
      
    
  );
}

export default function DeliverabilityDashboardPage() {
  const { toast } = useToast();

  const { data: dashboard, isLoading, refetch } = useQuery({
    queryKey: ['deliverability-dashboard'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/deliverability/dashboard');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      
        
      
    );
  }

  return (
    
      
        
          Deliverability Dashboard
          
            Monitor your email deliverability health and metrics
          
        
         refetch()}>
          
          Refresh
        
      

      {/* Overview Cards */}
      
        = 80
              ? 'success'
              : (dashboard?.summary.averageHealthScore || 0) >= 60
              ? 'warning'
              : 'danger'
          }
        />
        
        
        
        
      

      {/* Sending Metrics */}
      
        
          
            
            Sending Metrics
          
          Email delivery performance over the last 30 days
        
        
          
            
              {(dashboard?.metrics.totalSent || 0).toLocaleString()}
              Total Sent
            
            
              
                {(dashboard?.metrics.deliveryRate || 0).toFixed(1)}%
              
              Delivery Rate
            
            
              
                {(dashboard?.metrics.bounceRate || 0).toFixed(2)}%
              
              Bounce Rate
            
            
              
                {(dashboard?.metrics.openRate || 0).toFixed(1)}%
              
              Open Rate
            
            
              
                {(dashboard?.metrics.clickRate || 0).toFixed(2)}%
              
              Click Rate
            
          

          {(dashboard?.metrics.complaintRate || 0) > 0.1 && (
            
              
                
                High Complaint Rate Warning
              
              
                Your complaint rate ({(dashboard?.metrics.complaintRate || 0).toFixed(3)}%) is above
                the recommended threshold of 0.1%. This can impact deliverability.
              
            
          )}
        
      

      {/* Tabs for detailed views */}
      
        
          Domain Health
          Blacklist Monitor
          Warmup Schedule
        

        
          
            
              Domain Health Overview
              
                Health scores and status for all configured domains
              
            
            
              
                
                  
                    Domain
                    Health Score
                    Authentication
                    Reputation
                    Engagement
                    Blacklist
                    Warmup
                  
                
                
                  {dashboard?.domains.map((domain) => (
                    
                  ))}
                
              
            
          
        

        
          
        

        
          
        
      
    
  );
}