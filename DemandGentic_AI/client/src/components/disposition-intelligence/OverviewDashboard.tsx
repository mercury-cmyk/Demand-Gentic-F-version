/**
 * Overview Dashboard
 *
 * High-level disposition distribution, trends over time, campaign comparison.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, Clock, TrendingUp, CheckCircle, BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import {
  type DispositionIntelligenceFilters,
  type OverviewResponse,
  DISPOSITION_TYPES,
  DISPOSITION_COLORS,
  DISPOSITION_LABELS,
  getDispositionLabel,
  getDispositionColor,
} from './types';

interface OverviewDashboardProps {
  filters: DispositionIntelligenceFilters;
}

function buildQueryParams(filters: DispositionIntelligenceFilters): string {
  const params = new URLSearchParams();
  if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  return params.toString();
}

export function OverviewDashboard({ filters }: OverviewDashboardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/disposition-intelligence/overview', filters.campaignId, filters.startDate, filters.endDate],
    queryFn: async () => {
      const qs = buildQueryParams(filters);
      const res = await apiRequest('GET', `/api/disposition-intelligence/overview?${qs}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      
        
      
    );
  }

  if (!data || data.totals.totalCalls === 0) {
    return (
      
        
        No disposition data yet
        Make some calls to see disposition analytics here
      
    );
  }

  const pieData = data.distribution.map(d => ({
    name: getDispositionLabel(d.disposition),
    value: d.count,
    fill: getDispositionColor(d.disposition),
  }));

  // Line chart data
  const lineData = data.timeSeries.map(ts => ({
    date: ts.date.slice(5), // MM-DD
    ...ts.dispositions,
  }));

  // Campaign bar chart data
  const barData = data.campaignComparison.map(c => ({
    name: c.campaignName.length > 20 ? c.campaignName.slice(0, 20) + '...' : c.campaignName,
    ...c.dispositions,
    total: c.totalCalls,
  }));

  return (
    
      {/* Metric Cards */}
      
        }
          label="Total Calls"
          value={data.totals.totalCalls.toLocaleString()}
        />
        }
          label="Avg Duration"
          value={formatDuration(data.totals.avgCallDuration)}
        />
        }
          label="Conversion Rate"
          value={`${data.totals.overallConversionRate}%`}
          color={data.totals.overallConversionRate > 10 ? 'text-green-600' : 'text-yellow-600'}
        />
        }
          label="Disposition Accuracy"
          value={data.totals.dispositionAccuracyRate > 0 ? `${data.totals.dispositionAccuracyRate}%` : 'N/A'}
          color={data.totals.dispositionAccuracyRate >= 80 ? 'text-green-600' : data.totals.dispositionAccuracyRate >= 60 ? 'text-yellow-600' : 'text-red-600'}
        />
        }
          label="Avg Quality"
          value={data.totals.avgQualityScore != null ? `${data.totals.avgQualityScore}/100` : 'N/A'}
          color={getScoreColor(data.totals.avgQualityScore)}
        />
        }
          label="Campaigns"
          value={data.campaignComparison.length.toString()}
        />
      

      {/* Charts Row */}
      
        {/* Disposition Distribution */}
        
          
            Disposition Distribution
          
          
            
              
                 `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    
                  ))}
                
                 [value, 'Calls']} />
              
            
          
        

        {/* Disposition Table */}
        
          
            Disposition Breakdown
          
          
            
              {data.distribution
                .sort((a, b) => b.count - a.count)
                .map(d => (
                  
                    
                      
                      {getDispositionLabel(d.disposition)}
                    
                    
                      {d.count} calls
                      {d.percentage}%
                      {formatDuration(d.avgDurationSeconds)}
                      {d.avgQualityScore != null && (
                        
                          {d.avgQualityScore}/100
                        
                      )}
                    
                  
                ))}
            
          
        
      

      {/* Trend Over Time */}
      {lineData.length > 1 && (
        
          
            Disposition Trend Over Time
          
          
            
              
                
                
                
                
                
                {DISPOSITION_TYPES.map(type => {
                  const hasData = lineData.some(d => (d as any)[type] > 0);
                  if (!hasData) return null;
                  return (
                    
                  );
                })}
              
            
          
        
      )}

      {/* Campaign Comparison */}
      {barData.length > 1 && (
        
          
            Campaign Comparison
          
          
            
              
                
                
                
                
                
                {DISPOSITION_TYPES.map(type => {
                  const hasData = barData.some(d => (d as any)[type] > 0);
                  if (!hasData) return null;
                  return (
                    
                  );
                })}
              
            
          
        
      )}
    
  );
}

// ============================================
// Helpers
// ============================================

function MetricCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    
      
        
          {icon}
          {label}
        
        {value}
      
    
  );
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getScoreColor(score: number | null | undefined): string {
  if (score == null) return '';
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBadgeClass(score: number): string {
  if (score >= 70) return 'bg-green-500 text-white';
  if (score >= 50) return 'bg-yellow-500 text-black';
  return 'bg-red-500 text-white';
}