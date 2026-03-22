import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExportAuthority } from '@/hooks/use-export-authority';

interface CostData {
  service: string;
  cost: number;
  percentage: number;
}

export default function CostsTab() {
  const [currentCost, setCurrentCost] = useState(156.42);
  const [costBreakdown, setCostBreakdown] = useState([]);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [agentCosts, setAgentCosts] = useState([]);
  const { canExportData } = useExportAuthority();

  useEffect(() => {
    fetchCostData();
  }, []);

  const fetchCostData = async () => {
    try {
      // Mock data
      const breakdown: CostData[] = [
        { service: 'Cloud Run', cost: 62.57, percentage: 40 },
        { service: 'Vertex AI', cost: 54.75, percentage: 35 },
        { service: 'Cloud Storage', cost: 23.4, percentage: 15 },
        { service: 'Cloud Build', cost: 9.36, percentage: 6 },
        { service: 'Secret Manager', cost: 6.34, percentage: 4 },
      ];

      const trend = Array.from({ length: 10 }, (_, i) => ({
        day: `Day ${i + 1}`,
        cost: Math.random() * 30 + 10,
        forecast: Math.random() * 25 + 12,
      }));

      const agents = [
        { provider: 'Gemini API', calls: 250, cost: 25.0 },
        { provider: 'Claude API', calls: 150, cost: 45.0 },
        { provider: 'Copilot License', calls: 1, cost: 20.0 },
      ];

      setCostBreakdown(breakdown);
      setDailyTrend(trend);
      setAgentCosts(agents);
    } catch (error) {
      console.error('Failed to fetch cost data:', error);
    }
  };

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

  const totalCost = costBreakdown.reduce((sum, item) => sum + item.cost, 0);
  const lastMonthCost = 139.2;
  const costChange = (((currentCost - lastMonthCost) / lastMonthCost) * 100).toFixed(1);

  return (
    
      {/* Current Month Cost Card */}
      
        
          
            
              Current Month Cost
              ${currentCost.toFixed(2)}
               0 ? 'text-red-400' : 'text-green-400'}`}>
                
                {parseFloat(costChange) > 0 ? '+' : ''}{costChange}% vs last month
              
            
            
              Projected Month-End
              
                ${(currentCost * 1.35).toFixed(2)}
              
            
          
        
      

      {/* Charts */}
      
        {/* Service Breakdown */}
        
          
            Service Breakdown
            Cost distribution by GCP service
          
          
            
              
                 `${name} ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="cost"
                >
                  {costBreakdown.map((entry, index) => (
                    
                  ))}
                
                 `$${Number(value).toFixed(2)}`}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                  }}
                />
              
            
          
        

        {/* Daily Trend */}
        
          
            Daily Trend
            Last 10 days cost with forecast
          
          
            
              
                
                
                
                
                
                
                
              
            
          
        
      

      {/* Service Cost Details */}
      
        
          Service Cost Details
          Detailed breakdown of each GCP service
        
        
          
            
              
                
                  Service
                  Cost
                  Percentage
                  Trend
                
              
              
                {costBreakdown.map((item, index) => (
                  
                    
                      
                        
                        {item.service}
                      
                    
                    
                      ${item.cost.toFixed(2)}
                    
                    
                      {item.percentage}%
                    
                    
                      ↓ 2.1%
                    
                  
                ))}
              
            
          
        
      

      {/* AI Agent Costs */}
      
        
          AI Agent Costs
          Cost breakdown by LLM provider
        
        
          
            {agentCosts.map((agent) => (
              
                
                  {agent.provider}
                  ${agent.cost.toFixed(2)}
                  {agent.calls} calls/month
                
              
            ))}
          
        
      

      {/* Export Reports */}
      {canExportData && (
        
          
            
            Export CSV
          
          
            
            Export PDF Report
          
        
      )}
    
  );
}