import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Bot, 
  Phone, 
  TrendingUp, 
  CheckCircle,
  XCircle,
  Shield,
  MessageSquare,
  PhoneForwarded,
  BarChart3,
  Activity
} from "lucide-react";
import { 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

interface AiCallStats {
  totalAiCalls: number;
  qualified: number;
  handoffs: number;
  gatekeeperNavigations: number;
  voicemails: number;
  noAnswer: number;
  connected: number;
}

interface Campaign {
  id: string;
  name: string;
  dialMode: string;
}

const COLORS = {
  connected: 'hsl(var(--chart-1))',
  qualified: 'hsl(var(--chart-2))',
  handoffs: 'hsl(var(--chart-3))',
  gatekeeper: 'hsl(var(--chart-4))',
  voicemail: 'hsl(var(--chart-5))',
  noAnswer: 'hsl(var(--muted-foreground))',
};

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

export interface AiCallAnalyticsPanelProps {
  embedded?: boolean;
}

export function AiCallAnalyticsPanel({ embedded = false }: AiCallAnalyticsPanelProps) {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
  });

  const aiCampaigns = campaigns.filter((c) => c.dialMode === 'ai_agent');
  const selectedCampaignDetails = aiCampaigns.find((campaign) => campaign.id === selectedCampaign);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/ai-calls/campaign', selectedCampaign, 'stats', aiCampaigns.length],
    queryFn: async () => {
      if (selectedCampaign === 'all') {
        const campaignsToFetch = aiCampaigns.length > 0 ? aiCampaigns : [];
        
        if (campaignsToFetch.length === 0) {
          return {
            totalAiCalls: 0,
            qualified: 0,
            handoffs: 0,
            gatekeeperNavigations: 0,
            voicemails: 0,
            noAnswer: 0,
            connected: 0,
          };
        }
        
        const statsPromises = campaignsToFetch.map(async (campaign) => {
          try {
            const response = await apiRequest('GET', `/api/ai-calls/campaign/${campaign.id}/stats`);
            return response;
          } catch {
          }
          return null;
        });
        
        const allStats = await Promise.all(statsPromises);
        
        return allStats.reduce((acc: AiCallStats, s) => {
          if (s) {
            acc.totalAiCalls += s.totalAiCalls || 0;
            acc.qualified += s.qualified || 0;
            acc.handoffs += s.handoffs || 0;
            acc.gatekeeperNavigations += s.gatekeeperNavigations || 0;
            acc.voicemails += s.voicemails || 0;
            acc.noAnswer += s.noAnswer || 0;
            acc.connected += s.connected || 0;
          }
          return acc;
        }, {
          totalAiCalls: 0,
          qualified: 0,
          handoffs: 0,
          gatekeeperNavigations: 0,
          voicemails: 0,
          noAnswer: 0,
          connected: 0,
        });
      }
      
      const response = await apiRequest('GET', `/api/ai-calls/campaign/${selectedCampaign}/stats`);
      return response;
    },
    enabled: selectedCampaign !== 'all' || aiCampaigns.length >= 0,
  });

  const { data: activeCalls = [] } = useQuery({
    queryKey: ['/api/ai-calls/active'],
  });

  const calculateRate = (numerator: number, denominator: number): string => {
    if (denominator === 0) return '0%';
    return `${Math.round((numerator / denominator) * 100)}%`;
  };

  const outcomeData = stats ? [
    { name: 'Connected', value: stats.connected, color: PIE_COLORS[0] },
    { name: 'Qualified', value: stats.qualified, color: PIE_COLORS[1] },
    { name: 'Handoffs', value: stats.handoffs, color: PIE_COLORS[2] },
    { name: 'Voicemail', value: stats.voicemails, color: PIE_COLORS[3] },
    { name: 'Gatekeeper', value: stats.gatekeeperNavigations, color: PIE_COLORS[4] },
    { name: 'No Answer', value: stats.noAnswer, color: PIE_COLORS[5] },
  ].filter(d => d.value > 0) : [];

  const performanceData = stats ? [
    { metric: 'Connection Rate', value: stats.totalAiCalls > 0 ? (stats.connected / stats.totalAiCalls) * 100 : 0 },
    { metric: 'Qualification Rate', value: stats.connected > 0 ? (stats.qualified / stats.connected) * 100 : 0 },
    { metric: 'Handoff Rate', value: stats.connected > 0 ? (stats.handoffs / stats.connected) * 100 : 0 },
    { metric: 'Gatekeeper Success', value: stats.gatekeeperNavigations > 0 ? ((stats.connected / (stats.gatekeeperNavigations + stats.connected)) * 100) : 100 },
  ] : [];

  return (
    
      
        
          {embedded ? (
            
              
              AI Call Analytics
            
          ) : (
            
              
              AI Call Analytics
            
          )}
          
            Performance metrics for AI-powered outbound calling campaigns
          
          {selectedCampaign !== 'all' && selectedCampaignDetails && (
            
              {selectedCampaignDetails.name}
            
          )}
        
        
          
            
              
            
            
              All AI Campaigns
              {aiCampaigns.map((c) => (
                {c.name}
              ))}
            
          
        
      

      {activeCalls.length > 0 && (
        
          
            
              
              Active AI Calls
            
          
          
            
              
                {activeCalls.length} calls in progress
              
            
          
        
      )}

      
        
          
            Total AI Calls
            
          
          
            {isLoading ? (
              
            ) : (
              
                {stats?.totalAiCalls || 0}
              
            )}
          
        

        
          
            Connected
            
          
          
            {isLoading ? (
              
            ) : (
              <>
                
                  {stats?.connected || 0}
                
                
                  {calculateRate(stats?.connected || 0, stats?.totalAiCalls || 0)} connection rate
                
              
            )}
          
        

        
          
            Qualified Leads
            
          
          
            {isLoading ? (
              
            ) : (
              <>
                
                  {stats?.qualified || 0}
                
                
                  {calculateRate(stats?.qualified || 0, stats?.connected || 0)} of connected
                
              
            )}
          
        

        
          
            Human Handoffs
            
          
          
            {isLoading ? (
              
            ) : (
              <>
                
                  {stats?.handoffs || 0}
                
                
                  Transferred to live agents
                
              
            )}
          
        
      

      
        
          
            Gatekeeper Navigations
            
          
          
            {isLoading ? (
              
            ) : (
              
                {stats?.gatekeeperNavigations || 0}
              
            )}
          
        

        
          
            Voicemails
            
          
          
            {isLoading ? (
              
            ) : (
              
                {stats?.voicemails || 0}
              
            )}
          
        

        
          
            No Answer
            
          
          
            {isLoading ? (
              
            ) : (
              
                {stats?.noAnswer || 0}
              
            )}
          
        
      

      
        
          
            
            Call Outcomes
          
          
            
            Performance Metrics
          
        

        
          
            
              Call Outcome Distribution
              
                Breakdown of AI call outcomes by disposition
              
            
            
              {isLoading ? (
                
              ) : outcomeData.length > 0 ? (
                
                  
                     `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {outcomeData.map((entry, index) => (
                        
                      ))}
                    
                    
                    
                  
                
              ) : (
                
                  No AI call data available yet
                
              )}
            
          
        

        
          
            
              Performance Metrics
              
                Key performance indicators for AI calling campaigns
              
            
            
              {isLoading ? (
                
              ) : performanceData.length > 0 ? (
                
                  {performanceData.map((item, index) => (
                    
                      
                        {item.metric}
                        
                          {item.value.toFixed(1)}%
                        
                      
                      
                    
                  ))}
                
              ) : (
                
                  No performance data available yet
                
              )}
            
          
        
      

      {aiCampaigns.length === 0 && (
        
          
            
            No AI Campaigns Yet
            
              Create a campaign with "AI Agent" dial mode to start using AI-powered outbound calling.
            
            
              Create AI Campaign
            
          
        
      )}
    
  );
}

export default function AiCallAnalyticsPage() {
  return ;
}