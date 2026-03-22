import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Phone, UserCheck, TrendingUp, Loader2, Target, AlertCircle, Sparkles } from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";

const getToken = () => localStorage.getItem('clientPortalToken');

const DISPOSITION_COLORS: Record = {
  qualified: '#22c55e',
  qualified_lead: '#16a34a',
  converted_qualified: '#15803d',
  not_interested: '#ef4444',
  callback_requested: '#f59e0b',
  voicemail: '#8b5cf6',
  no_answer: '#6b7280',
  busy: '#f97316',
  wrong_number: '#dc2626',
  do_not_call: '#991b1b',
  unknown: '#94a3b8',
};

const CHART_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#6b7280', '#f97316', '#ec4899', '#14b8a6', '#a855f7'];

interface DispositionData {
  dispositions: Array;
  timeline: Array;
  totalCalls: number;
}

interface PotentialLead {
  id: string;
  contactName: string;
  contactEmail: string;
  accountName: string;
  campaignName: string;
  aiScore: string;
  aiQualificationStatus: string;
  qaStatus: string;
  createdAt: string;
}

export default function ClientPortalDisposition() {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-disposition'],
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

  const { data: dispositionData, isLoading } = useQuery({
    queryKey: ['client-portal-disposition', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/disposition-intelligence?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch disposition data');
      return res.json();
    },
  });

  const { data: potentialLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['client-portal-potential-leads', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/potential-leads?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch potential leads');
      return res.json();
    },
    enabled: activeTab === 'potential-leads',
  });

  const dispositions = dispositionData?.dispositions || [];
  const timeline = dispositionData?.timeline || [];
  const totalCalls = dispositionData?.totalCalls || 0;

  const qualifiedCount = dispositions
    .filter(d => ['qualified', 'qualified_lead', 'converted_qualified'].includes(d.disposition))
    .reduce((sum, d) => sum + d.count, 0);
  const conversionRate = totalCalls > 0 ? ((qualifiedCount / totalCalls) * 100).toFixed(1) : '0';

  const pieData = dispositions.slice(0, 8).map(d => ({
    name: d.disposition.replace(/_/g, ' '),
    value: d.count,
    fill: DISPOSITION_COLORS[d.disposition] || '#94a3b8',
  }));

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
              
              Disposition Intelligence
            
            AI-powered call disposition analysis with trends and lead identification
          
        

        {/* Campaign Filter */}
        
          
            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((c: any) => (
                    {c.name}
                  ))}
                
              
            
          
        

        {isLoading ? (
          
            
          
        ) : (
          <>
            {/* Stats Cards */}
            
              
                
                  
                    
                      
                    
                    
                      Total Calls
                      {totalCalls.toLocaleString()}
                    
                  
                
              
              
                
                  
                    
                      
                    
                    
                      Qualified
                      {qualifiedCount.toLocaleString()}
                    
                  
                
              
              
                
                  
                    
                      
                    
                    
                      Conversion Rate
                      {conversionRate}%
                    
                  
                
              
              
                
                  
                    
                      
                    
                    
                      Dispositions
                      {dispositions.length}
                    
                  
                
              
            

            {/* Tabs */}
            
              
                Overview
                Trends
                Potential Leads
              

              
                
                  {/* Pie Chart */}
                  
                    
                      Disposition Breakdown
                      Distribution of call outcomes
                    
                    
                      
                        
                          
                             `${name} (${(percent * 100).toFixed(0)}%)`}>
                              {pieData.map((_, i) => (
                                
                              ))}
                            
                            
                          
                        
                      
                    
                  

                  {/* Disposition Table */}
                  
                    
                      Detailed Breakdown
                      All dispositions with metrics
                    
                    
                      
                        
                          
                            
                              Disposition
                              Count
                              %
                              Avg Duration
                            
                          
                          
                            {dispositions.map((d) => (
                              
                                
                                  
                                    
                                    {d.disposition.replace(/_/g, ' ')}
                                  
                                
                                {d.count}
                                
                                  {totalCalls > 0 ? ((d.count / totalCalls) * 100).toFixed(1) : '0'}%
                                
                                
                                  {Math.floor(d.avgDuration / 60)}:{String(d.avgDuration % 60).padStart(2, '0')}
                                
                              
                            ))}
                          
                        
                      
                    
                  
                
              

              
                
                  
                    30-Day Disposition Trends
                    Daily call volume with qualified vs not-interested outcomes
                  
                  
                    
                      {timeline.length > 0 ? (
                        
                          
                            
                             new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                            
                             new Date(v).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} />
                            
                            
                            
                            
                          
                        
                      ) : (
                        
                          
                            
                            No trend data available yet
                          
                        
                      )}
                    
                  
                
              

              
                
                  
                    
                      
                      AI-Identified Potential Leads
                    
                    Leads with high AI scores showing buying signals
                  
                  
                    {leadsLoading ? (
                      
                        
                      
                    ) : potentialLeads.length === 0 ? (
                      
                        
                        No potential leads identified yet
                      
                    ) : (
                      
                        
                          
                            
                              Contact
                              Account
                              Campaign
                              AI Score
                              Status
                              Date
                            
                          
                          
                            {potentialLeads.map((lead) => (
                              
                                
                                  
                                    {lead.contactName || 'Unknown'}
                                    {lead.contactEmail || ''}
                                  
                                
                                {lead.accountName || '—'}
                                
                                  {lead.campaignName}
                                
                                
                                  = 70 ? 'bg-green-500/10 text-green-600' : Number(lead.aiScore) >= 50 ? 'bg-amber-500/10 text-amber-600' : 'bg-gray-500/10 text-gray-600'}>
                                    {lead.aiScore}
                                  
                                
                                
                                  {(lead.qaStatus || lead.aiQualificationStatus || 'pending').replace(/_/g, ' ')}
                                
                                
                                  {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
                                
                              
                            ))}
                          
                        
                      
                    )}
                  
                
              
            
          
        )}
      
    
  );
}