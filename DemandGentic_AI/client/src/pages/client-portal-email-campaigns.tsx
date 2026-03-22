import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Loader2,
  Send,
  Eye,
  MousePointer,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const getToken = () => localStorage.getItem('clientPortalToken');

interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

const statusColors: Record = {
  draft: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  scheduled: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  sending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  sent: 'bg-green-500/10 text-green-600 border-green-500/20',
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  paused: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

export default function ClientPortalEmailCampaigns() {
  const { data: emailCampaigns = [], isLoading } = useQuery({
    queryKey: ['client-portal-email-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/email-campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch email campaigns');
      return res.json();
    },
  });

  const totalSent = emailCampaigns.reduce((sum, c) => sum + (c.sent || 0), 0);
  const totalOpened = emailCampaigns.reduce((sum, c) => sum + (c.opened || 0), 0);
  const totalClicked = emailCampaigns.reduce((sum, c) => sum + (c.clicked || 0), 0);
  const overallOpenRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const overallClickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
              
              Email Campaigns
            
            View email campaign performance and metrics
          
        

        {isLoading ? (
          
            
          
        ) : (
          <>
            {/* Summary Stats */}
            
              
                
                  Total Campaigns
                  
                
                
                  {emailCampaigns.length}
                
              
              
                
                  Total Sent
                  
                
                
                  {totalSent.toLocaleString()}
                
              
              
                
                  Open Rate
                  
                
                
                  {overallOpenRate}%
                
              
              
                
                  Click Rate
                  
                
                
                  {overallClickRate}%
                
              
            

            {/* Campaigns List */}
            {emailCampaigns.length === 0 ? (
              
                
                  
                  No Email Campaigns
                  
                    Email campaign data will appear here once campaigns are created and assigned.
                  
                
              
            ) : (
              
                {emailCampaigns.map((campaign) => {
                  const openRate = campaign.sent > 0 ? Math.round((campaign.opened / campaign.sent) * 100) : 0;
                  const clickRate = campaign.sent > 0 ? Math.round((campaign.clicked / campaign.sent) * 100) : 0;
                  const deliveryRate = campaign.sent > 0 ? Math.round((campaign.delivered / campaign.sent) * 100) : 0;

                  return (
                    
                      
                        
                          
                            {campaign.name}
                            
                              Subject: {campaign.subject}
                            
                          
                          
                            {campaign.status}
                          
                        
                      
                      
                        
                          
                            
                               Recipients
                            
                            {campaign.totalRecipients.toLocaleString()}
                          
                          
                            
                               Sent
                            
                            {campaign.sent.toLocaleString()}
                          
                          
                            
                               Delivered
                            
                            {deliveryRate}%
                          
                          
                            
                               Opened
                            
                            {openRate}%
                          
                          
                            
                               Clicked
                            
                            {clickRate}%
                          
                          
                            
                               Bounced
                            
                            {campaign.bounced}
                          
                        
                        {campaign.sentAt && (
                          
                            Sent on {new Date(campaign.sentAt).toLocaleDateString()} at {new Date(campaign.sentAt).toLocaleTimeString()}
                          
                        )}
                      
                    
                  );
                })}
              
            )}
          
        )}
      
    
  );
}