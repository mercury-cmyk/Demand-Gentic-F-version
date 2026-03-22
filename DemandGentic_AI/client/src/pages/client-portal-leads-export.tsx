import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Users, Loader2, UserCheck, Search, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const getToken = () => localStorage.getItem('clientPortalToken');

interface Lead {
  id: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  accountName: string;
  accountIndustry: string;
  campaignName: string;
  aiScore: string;
  qaStatus: string;
  aiQualificationStatus: string;
  createdAt: string;
}

export default function ClientPortalLeadsExport() {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-leads'],
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

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['client-portal-potential-leads-all', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/potential-leads?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
  });

  const allLeads: Lead[] = leadsData || [];
  const filteredLeads = allLeads.filter((lead) => {
    if (statusFilter === 'qualified' && !['approved', 'published'].includes(lead.qaStatus)) return false;
    if (statusFilter === 'pending' && lead.qaStatus !== 'pending') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        (lead.contactName || '').toLowerCase().includes(term) ||
        (lead.contactEmail || '').toLowerCase().includes(term) ||
        (lead.accountName || '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      if (statusFilter === 'qualified') params.append('status', 'qualified');

      const res = await fetch(`/api/client-portal/leads/export?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast({ title: 'Export complete', description: 'Your leads have been exported to CSV.' });
    } catch {
      toast({ title: 'Export failed', description: 'Unable to export leads. Please try again.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const qualifiedCount = allLeads.filter(l => ['approved', 'published'].includes(l.qaStatus)).length;

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
                  
                
                
                  Leads & Export
                  View, search, and export your campaign leads
                
              
              
                {exporting ?  : }
                Export CSV
              
            
          
        

        {/* Stats */}
        
          
            
              
                
                  
                
                
                  Total Leads
                  {allLeads.length}
                
              
            
          
          
            
              
                
                  
                
                
                  Qualified
                  {qualifiedCount}
                
              
            
          
          
            
              
                
                  
                
                
                  Showing
                  {filteredLeads.length}
                
              
            
          
        

        {/* Filters */}
        
          
            
              
                Campaign
                
                  
                    
                  
                  
                    All Campaigns
                    {campaigns.map((c: any) => (
                      {c.name}
                    ))}
                  
                
              
              
                Status
                
                  
                    
                  
                  
                    All Leads
                    Qualified Only
                    Pending
                  
                
              
               setSearchTerm(e.target.value)}
                className="w-[300px]"
              />
            
          
        

        {/* Leads Table */}
        
          
            Leads
            {filteredLeads.length} leads matching your filters
          
          
            {isLoading ? (
              
                
              
            ) : filteredLeads.length === 0 ? (
              
                
                No leads found matching your filters
              
            ) : (
              
                
                  
                    
                      Contact
                      Account
                      Campaign
                      AI Score
                      Status
                      Date
                    
                  
                  
                    {filteredLeads.map((lead) => (
                      
                        
                          
                            {lead.contactName || 'Unknown'}
                            {lead.contactEmail || ''}
                            {lead.contactPhone && {lead.contactPhone}}
                          
                        
                        
                          
                            {lead.accountName || '—'}
                            {lead.accountIndustry && {lead.accountIndustry}}
                          
                        
                        
                          {lead.campaignName}
                        
                        
                          = 70 ? 'bg-green-500/10 text-green-600' : Number(lead.aiScore) >= 50 ? 'bg-amber-500/10 text-amber-600' : 'bg-gray-500/10 text-gray-600'}>
                            {lead.aiScore || '—'}
                          
                        
                        
                          
                            {(lead.qaStatus || 'pending').replace(/_/g, ' ')}
                          
                        
                        
                          {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
                        
                      
                    ))}
                  
                
              
            )}
          
        
      
    
  );
}