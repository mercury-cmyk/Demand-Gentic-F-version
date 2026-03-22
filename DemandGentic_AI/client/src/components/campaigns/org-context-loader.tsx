/**
 * Organization Context Loader Component
 * 
 * Allows users to select an organization and automatically populate
 * campaign context from the organization's intelligence data.
 * This is used during campaign creation to quickly bootstrap context.
 */

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Building2,
  Zap,
  Loader2,
  Check,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import type { StructuredCampaignContext } from '@shared/campaign-context-types';

interface Organization {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  description?: string;
}

interface CampaignContextResponse {
  success: boolean;
  campaignContext: Partial;
  organization: Organization;
  message: string;
}

interface OrgContextLoaderProps {
  onContextLoaded?: (context: Partial, organization: Organization) => void;
  campaignType?: 'email' | 'telemarketing' | 'voice';
}

export function OrgContextLoader({
  onContextLoaded,
  campaignType,
}: OrgContextLoaderProps) {
  const { toast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);

  // Fetch organizations
  const { data: organizations = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/organizations');
      const data = await res.json();
      // API returns { organizations: [...] }, extract the array
      return data.organizations || [];
    },
  });

  // Load context mutation
  const loadContextMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await apiRequest('GET', `/api/org-intelligence/campaign-context/${orgId}`);
      return res.json() as Promise;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Campaign Context Loaded',
          description: `Successfully loaded context from ${data.organization.name}`,
        });
        
        if (onContextLoaded) {
          onContextLoaded(data.campaignContext, data.organization);
        }
        
        setShowConfirmation(false);
        setSelectedOrgId('');
        setSelectedOrg(null);
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Error Loading Context',
        description: error.message || 'Failed to load campaign context',
        variant: 'destructive',
      });
    },
  });

  const handleOrgSelect = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setSelectedOrgId(orgId);
      setSelectedOrg(org);
      setShowConfirmation(true);
    }
  };

  const handleConfirmLoad = () => {
    if (selectedOrgId) {
      loadContextMutation.mutate(selectedOrgId);
    }
  };

  if (orgsLoading) {
    return (
      
        
          
            
            Load Organization Context
          
          
            Get campaign context from your organization's intelligence
          
        
        
          
          
        
      
    );
  }

  if (organizations.length === 0) {
    return (
      
        
          
            
            Load Organization Context
          
          
            Get campaign context from your organization's intelligence
          
        
        
          
            
            
              No Organizations Yet
              
                Create or select an organization to load its context automatically
              
            
          
        
      
    );
  }

  return (
    <>
      
        
          
            
              
                
                Load Organization Context
              
              
                Automatically populate campaign context from organization intelligence
              
            
            {selectedOrgId && !loadContextMutation.isPending && (
              
                
                Selected
              
            )}
          
        
        
          
            
              Select Organization
            
            
              
                
              
              
                {organizations.map((org) => (
                  
                    
                      
                      {org.name}
                      {org.industry && (
                        
                          {org.industry}
                        
                      )}
                    
                  
                ))}
              
            
          

          {selectedOrg && (
            
              
                
                
                  {selectedOrg.name}
                  {selectedOrg.description && (
                    
                      {selectedOrg.description}
                    
                  )}
                  {selectedOrg.domain && (
                    
                      {selectedOrg.domain}
                    
                  )}
                
              
            
          )}

          
             setShowConfirmation(true)}
              disabled={!selectedOrgId || loadContextMutation.isPending}
              className="gap-2 flex-1"
            >
              {loadContextMutation.isPending && (
                
              )}
              {loadContextMutation.isPending ? 'Loading...' : 'Load Context'}
              {!loadContextMutation.isPending && selectedOrgId && (
                
              )}
            
            {selectedOrgId && (
               {
                  setSelectedOrgId('');
                  setSelectedOrg(null);
                }}
                disabled={loadContextMutation.isPending}
              >
                Clear
              
            )}
          

          
            📋 This will pre-fill your campaign objectives, audience targeting, messaging, and more from the organization's intelligence data.
          
        
      

      
        
          Load Campaign Context?
          
            This will populate your campaign context with data from{' '}
            {selectedOrg?.name}'s
            organization intelligence. This includes:
            
              Campaign objectives and goals
              Target audience (industries, job titles, seniority)
              Core messaging and talking points
              Email angles and call openers
              Conversation flow and objection handling
            
            You can review and adjust all context before launching.
          
          
            Cancel
            
              {loadContextMutation.isPending && (
                
              )}
              Load Context
            
          
        
      
    
  );
}