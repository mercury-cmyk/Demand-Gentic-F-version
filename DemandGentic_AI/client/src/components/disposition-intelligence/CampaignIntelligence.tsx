/**
 * Campaign Intelligence
 *
 * Campaign-contextualized analysis showing performance against objectives,
 * qualification criteria, talking points coverage, and account intelligence correlation.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Target,
  CheckCircle,
  XCircle,
  TrendingUp,
  Brain,
  BarChart3,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  type DispositionIntelligenceFilters,
  type CampaignAnalysisResponse,
  DISPOSITION_COLORS,
  getDispositionLabel,
  getDispositionColor,
} from './types';

interface Campaign {
  id: string;
  name: string;
}

interface CampaignIntelligenceProps {
  filters: DispositionIntelligenceFilters;
  campaigns: Campaign[];
}

export function CampaignIntelligence({ filters, campaigns }: CampaignIntelligenceProps) {
  const campaignId = filters.campaignId !== 'all' ? filters.campaignId : null;

  const { data, isLoading } = useQuery({
    queryKey: ['/api/disposition-intelligence/campaign-analysis', campaignId, filters.startDate, filters.endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('campaignId', campaignId!);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const res = await apiRequest('GET', `/api/disposition-intelligence/campaign-analysis?${params}`);
      return res.json();
    },
    enabled: !!campaignId,
    staleTime: 5 * 60 * 1000,
  });

  if (!campaignId) {
    return (
      
        
        Select a Campaign
        Use the campaign filter above to analyze a specific campaign
      
    );
  }

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (!data) {
    return (
      
        
        No data available for this campaign
      
    );
  }

  // Build disposition bar chart data
  const dispBarData = Object.entries(data.dispositionBreakdown).map(([disp, info]) => ({
    name: getDispositionLabel(disp),
    count: info.count,
    avgQuality: info.avgQuality ?? 0,
    fill: getDispositionColor(disp),
  }));

  return (
    
      {/* Campaign Header */}
      
        
          
            
              
                
                {data.campaign.name}
              
              {data.campaign.objective && (
                
                  Objective: {data.campaign.objective}
                
              )}
              {data.campaign.successCriteria && (
                
                  Success Criteria: {data.campaign.successCriteria}
                
              )}
            
            
              {data.performance.totalCalls} calls analyzed
            
          
        
      

      {/* Performance Metrics */}
      
         10 ? 'text-green-600' : 'text-yellow-600'}
        />
        
        
        
        
         20 ? 'text-green-600' : 'text-yellow-600'}
        />
      

      {/* Qualification Analysis & Disposition Breakdown */}
      
        {/* Missing Talking Points */}
        {data.qualificationAnalysis.topMissedTalkingPoints.length > 0 && (
          
            
              
                
                Top Missed Talking Points
              
            
            
              {data.qualificationAnalysis.topMissedTalkingPoints.map((tp, i) => (
                
                  {tp.point}
                  
                    Missed {tp.frequency}x
                  
                
              ))}
            
          
        )}

        {/* Disposition Breakdown */}
        
          
            Disposition Breakdown
          
          
            {dispBarData.length > 0 ? (
              
                
                  
                  
                  
                  
                  
                    {dispBarData.map((entry, index) => (
                      
                    ))}
                  
                
              
            ) : (
              No disposition data
            )}
          
        
      

      {/* Account Intelligence Correlation */}
      {data.accountIntelligenceCorrelation && (
        
          
            
              
              Account Intelligence Impact
            
          
          
            
              
                
                  
                  With Intelligence
                
                
                  
                    {data.accountIntelligenceCorrelation.withIntelligence.count} calls
                  
                  
                    Avg Quality: {data.accountIntelligenceCorrelation.withIntelligence.avgQuality ?? 'N/A'}/100
                  
                
              
              
                
                  
                  Without Intelligence
                
                
                  
                    {data.accountIntelligenceCorrelation.withoutIntelligence.count} calls
                  
                  
                    Avg Quality: {data.accountIntelligenceCorrelation.withoutIntelligence.avgQuality ?? 'N/A'}/100
                  
                
              
            
          
        
      )}

      {/* Trend Over Time */}
      {data.trendOverTime.length > 1 && (
        
          
            Performance Trend
          
          
            
               ({ ...t, date: t.date.slice(5) }))}>
                
                
                
                
                
                
                
                
              
            
          
        
      )}
    
  );
}

// ============================================
// Helpers
// ============================================

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    
      
        {label}
        {value}
      
    
  );
}

function getScoreTextColor(score: number | null | undefined): string {
  if (score == null) return '';
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}