import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Phone,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Voicemail,
  PhoneOff,
  Ban,
  Download,
  Loader2,
  Users,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');

const COLORS: Record = {
  qualified: 'hsl(142, 76%, 36%)',
  not_interested: 'hsl(0, 84%, 60%)',
  voicemail: 'hsl(221, 83%, 53%)',
  no_answer: 'hsl(45, 93%, 47%)',
  dnc_request: 'hsl(0, 72%, 51%)',
  busy: 'hsl(262, 83%, 58%)',
  callback_requested: 'hsl(199, 89%, 48%)',
};

const getDispositionIcon = (disposition: string) => {
  switch (disposition) {
    case 'qualified': return CheckCircle;
    case 'not_interested': return XCircle;
    case 'voicemail': return Voicemail;
    case 'no_answer': return PhoneOff;
    case 'dnc_request': return Ban;
    default: return Phone;
  }
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export default function ClientPortalCallReports() {
  const [selectedCampaign, setSelectedCampaign] = useState('all');

  // Fetch client's campaigns
  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-reports'],
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

  // Fetch call reports
  const { data: reportData, isLoading } = useQuery({
    queryKey: ['client-portal-call-reports', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/call-reports?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch reports');
      return res.json();
    },
  });

  const summary = reportData?.summary || { totalCalls: 0, totalDuration: 0, avgDuration: 0 };
  const dispositions = reportData?.dispositions || [];
  const campaignBreakdown = reportData?.campaignBreakdown || [];

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
                  
                
                Call Reports
              
              Performance metrics for your campaigns
            
          
        

        {/* Campaign Filter */}
        
          
            Filters
          
          
            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((c: any) => (
                    {c.name}
                  ))}
                
              
            
          
        

        {isLoading ? (
          
            
          
        ) : (
          <>
            {/* Summary Cards */}
            
              
                
                  Total Calls
                  
                
                
                  {summary.totalCalls.toLocaleString()}
                
              
              
                
                  Total Duration
                  
                
                
                  {formatDuration(summary.totalDuration)}
                
              
              
                
                  Avg Duration
                  
                
                
                  {formatDuration(summary.avgDuration)}
                
              
              
                
                  Active Campaigns
                  
                
                
                  {campaignBreakdown.length}
                
              
            

            {/* Disposition Breakdown */}
            {dispositions.length > 0 && (
              
                
                  
                    Call Dispositions
                    Breakdown of call outcomes
                  
                  
                    
                      {dispositions.map((disp: any) => {
                        const Icon = getDispositionIcon(disp.disposition);
                        return (
                          
                            
                              
                              {disp.disposition.replace(/_/g, ' ')}
                            
                            {disp.count}
                          
                        );
                      })}
                    
                  
                

                
                  
                    Disposition Chart
                  
                  
                    
                      
                        
                          {dispositions.map((entry: any, index: number) => (
                            
                          ))}
                        
                        
                        
                      
                    
                  
                
              
            )}

            {/* Campaign Breakdown */}
            {campaignBreakdown.length > 0 && (
              
                
                  Campaign Performance
                
                
                  
                    {campaignBreakdown.map((campaign: any) => (
                      
                        
                          {campaign.campaignName}
                          {campaign.totalCalls} calls
                        
                        
                          
                            Qualified
                            {campaign.qualified}
                          
                          
                            Not Interested
                            {campaign.notInterested}
                          
                          
                            Voicemail
                            {campaign.voicemail}
                          
                          
                            No Answer
                            {campaign.noAnswer}
                          
                          
                            DNC
                            {campaign.dncRequest}
                          
                        
                      
                    ))}
                  
                
              
            )}

            {/* Empty State */}
            {summary.totalCalls === 0 && (
              
                
                  
                  No Call Data Yet
                  
                    Call reports will appear here once campaigns start making calls.
                  
                
              
            )}
          
        )}
      
    
  );
}