import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Target, BarChart3, Users, Building2, FileText, TestTube, Mail, Bot, Loader2, CheckCircle, TrendingUp, Phone, Download } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

// Define types for props
interface Campaign {
  id: string;
  name: string;
  status: string;
  eligibleCount: number;
  totalContacts: number;
  verifiedCount: number;
  deliveredCount: number;
  type?: string;
  campaignType?: string;
  // Add other campaign properties as needed
}

interface CampaignDetailViewProps {
  campaign: Campaign;
  onBack: () => void;
}

async function fetchCampaignData(campaignId: string, dataType: 'accounts' | 'contacts') {
  const token = localStorage.getItem('clientPortalToken');
  const params = new URLSearchParams({ campaignId, limit: '1000' });
  const res = await fetch(`/api/client-portal/crm/${dataType}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${dataType}`);
  return res.json();
}

export function CampaignDetailView({ campaign, onBack }: CampaignDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['campaign-accounts', campaign.id],
    queryFn: () => fetchCampaignData(campaign.id, 'accounts'),
  });

  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['campaign-contacts', campaign.id],
    queryFn: () => fetchCampaignData(campaign.id, 'contacts'),
  });

  const { data: promoSubmissionsData, isLoading: isLoadingSubmissions } = useQuery({
    queryKey: ['campaign-promo-submissions', campaign.id],
    queryFn: async () => {
      const token = localStorage.getItem('clientPortalToken');
      const res = await fetch(`/api/client-portal/campaigns/${campaign.id}/promo-submissions?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch submissions');
      return res.json();
    },
  });

  const promoSubmissions = promoSubmissionsData?.submissions || [];
  const promoSubmissionsTotal = promoSubmissionsData?.total || 0;

  const campaignAccounts = accountsData?.accounts || [];
  const campaignContacts = contactsData?.contacts || [];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'progress', label: 'Progress', icon: BarChart3 },
    { id: 'accounts', label: 'Accounts', icon: Building2 },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'context', label: 'Context', icon: FileText },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'email-test', label: 'Email Test', icon: Mail },
    { id: 'ai-call-test', label: 'AI Call Test', icon: Bot },
  ];

  return (
    
      
        
          
        
        
          {campaign.name}
          Campaign Details
        
      

      
        
          {tabs.map(tab => (
            
              
              {tab.label}
            
          ))}
        
        
        
          
            
              Campaign Overview
              High-level summary and key metrics for this campaign.
            
            
              
                
                  
                    Total Contacts
                    
                  
                  
                    {campaign.totalContacts?.toLocaleString() || 'N/A'}
                  
                
                
                  
                    Delivered
                    
                  
                  
                    {campaign.deliveredCount?.toLocaleString() || 'N/A'}
                  
                
                
                  
                    Delivery Rate
                    
                  
                  
                    
                      {campaign.totalContacts > 0
                        ? `${((campaign.deliveredCount / campaign.totalContacts) * 100).toFixed(1)}%`
                        : 'N/A'}
                    
                  
                
                
                  
                    Type
                    {campaign.campaignType === 'email' ?  : }
                  
                  
                    {campaign.campaignType || campaign.type || 'N/A'}
                  
                
              
            
          
        

        
          
            
              Progress
              Detailed campaign performance and progress towards goals.
            
            
              
                
                  Overall Progress
                  
                    {campaign.deliveredCount?.toLocaleString()} / {campaign.totalContacts?.toLocaleString()}
                  
                
                
                
                  {campaign.totalContacts ? ((campaign.deliveredCount / campaign.totalContacts) * 100).toFixed(1) : '0.0'}% of total contacts reached.
                
              

              
                
                  Verified Contacts
                   
                    {campaign.verifiedCount?.toLocaleString()} / {campaign.totalContacts?.toLocaleString()}
                  
                
                *]:bg-green-500" />
                 
                  {campaign.totalContacts ? ((campaign.verifiedCount / campaign.totalContacts) * 100).toFixed(1) : '0.0'}% of contacts have been verified.
                
              
            
          
        

        
          
            
              Accounts
              Accounts targeted in this campaign.
            
            
              {isLoadingAccounts ? (
                
                  
                
              ) : campaignAccounts.length > 0 ? (
                
                  
                    
                      
                        Company Name
                        Industry
                        Website
                      
                    
                    
                      {campaignAccounts.map((account: any) => (
                        
                          {account.name}
                          {account.industry}
                          
                            
                              {account.website}
                            
                          
                        
                      ))}
                    
                  
                
              ) : (
                No accounts associated with this campaign.
              )}
            
          
        

        
          
            
              Contacts
              Contacts targeted in this campaign.
            
            
              {isLoadingContacts ? (
                
                  
                
              ) : campaignContacts.length > 0 ? (
                
                  
                    
                      
                        Name
                        Email
                        Phone
                        Company
                      
                    
                    
                      {campaignContacts.map((contact: any) => (
                        
                          {contact.firstName} {contact.lastName}
                          {contact.email}
                          {contact.phone}
                          {contact.company}
                        
                      ))}
                    
                  
                
              ) : (
                No contacts associated with this campaign.
              )}
            
          
        

        
          
            
              Campaign Context
              Contextual information for the AI agent.
            
            
              Campaign context content for {campaign.name}.
            
          
        

        
          
            
              
                Reports
                {promoSubmissionsTotal > 0 && (
                  {promoSubmissionsTotal} submissions
                )}
              
              Email campaign performance analytics and engagement metrics.
            
            
              {isLoadingSubmissions ? (
                
                  
                
              ) : promoSubmissions.length === 0 ? (
                
                  
                  No form submissions yet
                  Submissions from content promotion pages linked to this campaign will appear here.
                
              ) : (
                
                  
                    
                      
                        Name
                        Email
                        Company
                        Job Title
                        Submitted At
                      
                    
                    
                      {promoSubmissions.map((sub: any) => (
                        
                          
                            {[sub.visitorFirstName, sub.visitorLastName].filter(Boolean).join(' ') || '—'}
                          
                          {sub.visitorEmail || '—'}
                          {sub.visitorCompany || '—'}
                          {sub.jobTitle || '—'}
                          
                            {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            }) : '—'}
                          
                        
                      ))}
                    
                  
                
              )}
            
          
        

        
          
            
              Email Test
              Send test emails for this campaign.
            
            
              Email test content for {campaign.name}.
            
          
        

        
          
            
              AI Call Test
              Perform test calls with the AI agent.
            
            
              AI call test content for {campaign.name}.
            
          
        

      
    
  );
}