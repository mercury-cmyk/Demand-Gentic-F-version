/**
 * Agent Performance Pipeline
 *
 * Visual pipeline showing agent call flow analysis:
 * Opening → Engagement → Objection Handling → Closing
 * Plus flow compliance and best vs worst call comparison.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  MessageCircle,
  Users,
  Shield,
  Flag,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { type DispositionIntelligenceFilters, type AgentPerformanceResponse, getDispositionLabel } from './types';

interface AgentPerformancePipelineProps {
  filters: DispositionIntelligenceFilters;
}

export function AgentPerformancePipeline({ filters }: AgentPerformancePipelineProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/disposition-intelligence/agent-performance', filters.campaignId, filters.startDate, filters.endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const res = await apiRequest('GET', `/api/disposition-intelligence/agent-performance?${params}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (!data || data.totalAnalyzed === 0) {
    return (
      
        
        No analyzed calls yet
        Agent performance data will appear after calls are analyzed
      
    );
  }

  return (
    
      {/* Total Analyzed */}
      
        
        {data.totalAnalyzed} calls analyzed
      

      {/* Pipeline Visualization */}
      
        }
          score={data.openingAnalysis.avgEngagementScore}
          issues={data.openingAnalysis.commonOpeningIssues}
          color="blue"
        />
        }
          score={data.engagementMetrics.avgEngagementScore}
          issues={data.engagementMetrics.interruptionPatterns.map(p => ({ issue: p.type, frequency: p.count }))}
          color="cyan"
          extraScores={[
            { label: 'Clarity', score: data.engagementMetrics.avgClarityScore },
            { label: 'Empathy', score: data.engagementMetrics.avgEmpathyScore },
          ]}
        />
        }
          score={data.objectionHandling.avgScore}
          issues={data.objectionHandling.commonIssues}
          color="amber"
        />
        }
          score={data.closingAnalysis.avgScore}
          issues={data.closingAnalysis.closingIssues}
          color="green"
        />
      

      {/* Arrow connectors (visible on md+) */}
      
        {[1, 2, 3].map(i => (
          
        ))}
      

      {/* Flow Compliance */}
      
        
          Flow Compliance
        
        
          
            
              
                Average Score
                
                  {data.flowCompliance.avgScore ?? 'N/A'}/100
                
              
              
            
          

          
            {/* Missed Steps */}
            {data.flowCompliance.topMissedSteps.length > 0 && (
              
                
                  
                  Top Missed Steps
                
                
                  {data.flowCompliance.topMissedSteps.map((ms, i) => (
                    
                      {ms.step}
                      {ms.frequency}x
                    
                  ))}
                
              
            )}

            {/* Flow Deviations */}
            {data.flowCompliance.topDeviations.length > 0 && (
              
                
                  
                  Common Deviations
                
                
                  {data.flowCompliance.topDeviations.map((dv, i) => (
                    
                      {dv.deviation}
                      {dv.frequency}x
                    
                  ))}
                
              
            )}
          
        
      

      {/* Best vs Worst */}
      {(data.bestVsWorst.best.length > 0 || data.bestVsWorst.worst.length > 0) && (
        
          {/* Best Calls */}
          
            
              
                
                Best Performing Calls
              
            
            
              {data.bestVsWorst.best.map((call, i) => (
                
                  
                    {call.contactName}
                    
                      {call.disposition ? getDispositionLabel(call.disposition) : 'N/A'}
                      {call.durationSeconds ? ` · ${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}` : ''}
                    
                  
                  {call.overallScore}/100
                
              ))}
            
          

          {/* Worst Calls */}
          
            
              
                
                Lowest Performing Calls
              
            
            
              {data.bestVsWorst.worst.map((call, i) => (
                
                  
                    {call.contactName}
                    
                      {call.disposition ? getDispositionLabel(call.disposition) : 'N/A'}
                      {call.durationSeconds ? ` · ${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}` : ''}
                    
                  
                  {call.overallScore}/100
                
              ))}
            
          
        
      )}
    
  );
}

// ============================================
// Pipeline Stage Component
// ============================================

function PipelineStage({
  title,
  icon,
  score,
  issues,
  color,
  extraScores,
}: {
  title: string;
  icon: React.ReactNode;
  score: number | null;
  issues: Array;
  color: string;
  extraScores?: Array;
}) {
  const borderColor = {
    blue: 'border-blue-200',
    cyan: 'border-cyan-200',
    amber: 'border-amber-200',
    green: 'border-green-200',
  }[color] || 'border-gray-200';

  const headerBg = {
    blue: 'bg-blue-50',
    cyan: 'bg-cyan-50',
    amber: 'bg-amber-50',
    green: 'bg-green-50',
  }[color] || 'bg-gray-50';

  return (
    
      
        
          {icon}
          {title}
        
      
      
        
          
            {score ?? 'N/A'}
          
          {score != null && /100}
        

        {extraScores && (
          
            {extraScores.map(es => (
              
                {es.label}
                
                  {es.score ?? 'N/A'}
                
              
            ))}
          
        )}

        {issues.length > 0 && (
          <>
            
            
              {issues.slice(0, 3).map((issue, i) => (
                
                  {issue.issue}
                  {issue.frequency}
                
              ))}
            
          
        )}
      
    
  );
}

function getScoreTextColor(score: number | null | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}