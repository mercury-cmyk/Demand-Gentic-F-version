import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DollarSign, Phone, Mail, UserCheck, TrendingUp, Loader2, Clock, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');

interface CostData {
  summary: {
    totalCalls: number;
    totalDurationMinutes: number;
    totalEmails: number;
    totalLeads: number;
    qualifiedLeads: number;
  };
  campaignBreakdown: Array;
}

export default function ClientPortalCostTracking() {
  const { data, isLoading } = useQuery({
    queryKey: ['client-portal-cost-tracking'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/cost-tracking', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch cost data');
      return res.json();
    },
  });

  const summary = data?.summary;
  const breakdown = data?.campaignBreakdown || [];

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
              
              Cost & Activity Tracking
            
            Track activity volumes and resource usage across all your campaigns
          
        

        {isLoading ? (
          
            
          
        ) : (
          <>
            {/* Summary Cards */}
            
              
                
                  
                    
                      
                    
                    
                      Total Calls
                      {(summary?.totalCalls || 0).toLocaleString()}
                    
                  
                
              
              
                
                  
                    
                      
                    
                    
                      Call Minutes
                      {(summary?.totalDurationMinutes || 0).toLocaleString()}
                    
                  
                
              
              
                
                  
                    
                      
                    
                    
                      Emails Sent
                      {(summary?.totalEmails || 0).toLocaleString()}
                    
                  
                
              
              
                
                  
                    
                      
                    
                    
                      Total Leads
                      {(summary?.totalLeads || 0).toLocaleString()}
                    
                  
                
              
              
                
                  
                    
                      
                    
                    
                      Qualified Leads
                      {(summary?.qualifiedLeads || 0).toLocaleString()}
                    
                  
                
              
            

            {/* Campaign Comparison Chart */}
            {breakdown.length > 0 && (
              
                
                  
                    
                    Campaign Activity Comparison
                  
                  Side-by-side activity breakdown per campaign
                
                
                  
                    
                      
                        
                        
                        
                        
                        
                        
                        
                        
                      
                    
                  
                
              
            )}

            {/* Campaign Breakdown Table */}
            
              
                Campaign Breakdown
                Detailed activity per campaign
              
              
                {breakdown.length === 0 ? (
                  
                    
                    No campaign activity recorded yet
                  
                ) : (
                  
                    
                      
                        
                          Campaign
                          Calls
                          Emails
                          Qualified Leads
                          Efficiency
                        
                      
                      
                        {breakdown.map((row) => {
                          const totalActivity = row.calls + row.emails;
                          const efficiency = totalActivity > 0 ? ((row.qualifiedLeads / totalActivity) * 100).toFixed(1) : '0';
                          return (
                            
                              {row.campaignName}
                              {row.calls.toLocaleString()}
                              {row.emails.toLocaleString()}
                              
                                {row.qualifiedLeads}
                              
                              {efficiency}%
                            
                          );
                        })}
                      
                    
                  
                )}
              
            
          
        )}
      
    
  );
}