/**
 * Campaign Intelligence Bindings Page
 *
 * Manages the relationships between campaigns and intelligence configurations.
 * Shows which campaigns use which organization intelligence and virtual agents.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Phone,
  Bot,
  Building2,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Campaign {
  id: number;
  name: string;
  type: string;
  status: string;
  dialMode?: string;
  aiAgentId?: number;
  organizationIntelligenceId?: number;
}

interface VirtualAgent {
  id: number;
  name: string;
  voiceProvider: string;
}

interface OrganizationIntelligence {
  id: number;
  name: string;
}

export default function CampaignIntelligencePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { token } = useAuth();

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
    enabled: !!token,
  });

  // Fetch virtual agents
  const { data: virtualAgents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['/api/virtual-agents'],
    queryFn: async () => {
      const response = await fetch('/api/virtual-agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch virtual agents');
      return response.json();
    },
    enabled: !!token,
  });

  // Fetch organization intelligence
  const { data: orgIntelligence = [], isLoading: orgLoading } = useQuery(
    {
      queryKey: ['/api/organization-intelligence'],
      queryFn: async () => {
        const response = await fetch('/api/organization-intelligence', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return [];
        return response.json();
      },
      enabled: !!token,
    }
  );

  const isLoading = campaignsLoading || agentsLoading || orgLoading;

  // Filter to phone campaigns only
  const phoneCampaigns = campaigns.filter(
    c => c.type === 'call' || c.type === 'telemarketing'
  );

  const filteredCampaigns = phoneCampaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to get agent name
  const getAgentName = (agentId?: number) => {
    if (!agentId) return null;
    const agent = virtualAgents.find(a => a.id === agentId);
    return agent?.name || `Agent #${agentId}`;
  };

  // Helper to get org intelligence name
  const getOrgIntelligenceName = (orgId?: number) => {
    if (!orgId) return null;
    const org = orgIntelligence.find(o => o.id === orgId);
    return org?.name || `Organization #${orgId}`;
  };

  const getStatusBadge = (status: string) => {
    const config: Record = {
      active: { variant: 'default', className: 'bg-green-500' },
      draft: { variant: 'secondary' },
      paused: { variant: 'outline', className: 'border-amber-300 text-amber-700' },
      completed: { variant: 'outline' },
    };
    const { variant, className } = config[status] || { variant: 'outline' as const };
    return (
      
        {status}
      
    );
  };

  return (
    
      {/* Header */}
      
        
          Campaign Intelligence Bindings
          
            View and manage how intelligence configurations are connected to campaigns
          
        
        
          
            
              
              Org Intelligence
            
          
          
            
              
              Virtual Agents
            
          
        
      

      {/* Summary Cards */}
      
        
          
            
              
              Phone Campaigns
            
          
          
            {phoneCampaigns.length}
            
              {phoneCampaigns.filter(c => c.dialMode === 'ai_agent').length} using AI agents
            
          
        
        
          
            
              
              Virtual Agents
            
          
          
            {virtualAgents.length}
            Available for campaigns
          
        
        
          
            
              
              Intelligence Profiles
            
          
          
            {orgIntelligence.length}
            Organization configurations
          
        
      

      {/* Bindings Table */}
      
        
          
            
              Campaign Bindings
              
                Phone campaigns and their intelligence configuration assignments
              
            
            
              
               setSearchQuery(e.target.value)}
                className="pl-8"
              />
            
          
        
        
          {isLoading ? (
            
              {[1, 2, 3].map(i => (
                
              ))}
            
          ) : filteredCampaigns.length === 0 ? (
            
              
              No campaigns found
              
                {searchQuery
                  ? 'No campaigns match your search'
                  : 'Create a phone campaign to get started'}
              
            
          ) : (
            
              
                
                  
                    Campaign
                    Status
                    Mode
                    Virtual Agent
                    Organization
                    Actions
                  
                
                
                  {filteredCampaigns.map(campaign => {
                    const agentName = getAgentName(campaign.aiAgentId);
                    const orgName = getOrgIntelligenceName(campaign.organizationIntelligenceId);
                    const isAiMode = campaign.dialMode === 'ai_agent';

                    return (
                      
                        
                          
                            
                            {campaign.name}
                          
                        
                        {getStatusBadge(campaign.status)}
                        
                          {isAiMode ? (
                            
                              
                              AI Agent
                            
                          ) : (
                            
                              {campaign.dialMode || 'manual'}
                            
                          )}
                        
                        
                          {agentName ? (
                            
                              
                              {agentName}
                            
                          ) : isAiMode ? (
                            
                              
                              Not configured
                            
                          ) : (
                            N/A
                          )}
                        
                        
                          {orgName ? (
                            
                              
                              {orgName}
                            
                          ) : (
                            Not assigned
                          )}
                        
                        
                          
                            
                              
                              Configure
                            
                          
                        
                      
                    );
                  })}
                
              
            
          )}
        
      

      {/* Visual Binding Flow */}
      
        
          Intelligence Flow
          
            How intelligence configurations connect to produce AI behavior
          
        
        
          
            
              
              Organization
              Company knowledge base
            
            
            
            
              
              Virtual Agent
              AI personality & voice
            
            
            
            
              
              Campaign
              Audience & objectives
            
          
        
      
    
  );
}