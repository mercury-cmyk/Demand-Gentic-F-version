/**
 * Campaign Organization Intelligence Binding Component
 * 
 * Used in campaign creation/editing to bind OI to the campaign.
 * This ensures that OI is campaign-scoped (not agent-scoped).
 * 
 * The same agent logic can serve multiple clients with different org contexts.
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
  Building2,
  Globe,
  Database,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Info,
} from 'lucide-react';

export type OrgIntelligenceMode = 'use_existing' | 'fresh_research' | 'none';

interface CampaignOIBinding {
  id: string;
  campaignId: string;
  mode: OrgIntelligenceMode;
  snapshotId: string | null;
  masterOrgIntelligenceId: number | null;
  disclosureLevel: string;
  boundAt: string;
}

interface SnapshotInfo {
  id: string;
  organizationName: string;
  domain: string | null;
  confidenceScore: number | null;
  createdAt: string;
}

interface CampaignOrgIntelligenceBindingProps {
  campaignId: string;
  onBindingChange?: (binding: CampaignOIBinding | null) => void;
  readOnly?: boolean;
}

export function CampaignOrgIntelligenceBinding({
  campaignId,
  onBindingChange,
  readOnly = false,
}: CampaignOrgIntelligenceBindingProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current binding
  const { data: bindingData, isLoading: bindingLoading } = useQuery({
    queryKey: [`/api/unified-agents/org-intelligence/campaigns/${campaignId}/binding`],
    enabled: !!campaignId,
  });

  // Fetch available sources
  const { data: sources, isLoading: sourcesLoading } = useQuery;
    modes: Array;
  }>({
    queryKey: ['/api/unified-agents/org-intelligence/available-sources'],
  });

  // Bind mutation
  const bindMutation = useMutation({
    mutationFn: async (params: {
      mode: OrgIntelligenceMode;
      snapshotId?: string;
      masterOrgIntelligenceId?: number;
      disclosureLevel?: string;
    }) => {
      const response = await apiRequest(
        'POST',
        `/api/unified-agents/org-intelligence/campaigns/${campaignId}/bind`,
        params
      );
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/unified-agents/org-intelligence/campaigns/${campaignId}/binding`] 
      });
      if (onBindingChange) {
        onBindingChange(data.binding);
      }
      toast({
        title: 'Organization Intelligence Bound',
        description: 'Campaign will use this organization context for all agent interactions.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Binding Failed',
        description: error.message || 'Failed to bind organization intelligence',
        variant: 'destructive',
      });
    },
  });

  const handleModeChange = (mode: OrgIntelligenceMode) => {
    if (mode === 'none') {
      bindMutation.mutate({ mode });
    }
  };

  const handleSourceSelect = (sourceId: string, type: 'master' | 'snapshot') => {
    if (type === 'master') {
      bindMutation.mutate({
        mode: 'use_existing',
        masterOrgIntelligenceId: parseInt(sourceId),
      });
    } else {
      bindMutation.mutate({
        mode: 'use_existing',
        snapshotId: sourceId,
      });
    }
  };

  if (bindingLoading || sourcesLoading) {
    return (
      
        
          
            
            Organization Intelligence
          
        
        
          
            
            
          
        
      
    );
  }

  const currentBinding = bindingData?.binding;
  const currentSnapshot = bindingData?.snapshotInfo;

  return (
    
      
        
          
            
            Campaign Organization Intelligence
          
          {currentBinding && (
            
              {currentBinding.mode === 'use_existing' && 'Using Existing OI'}
              {currentBinding.mode === 'fresh_research' && 'Fresh Research'}
              {currentBinding.mode === 'none' && 'No OI'}
            
          )}
        
        
          Organization context that agents will use when executing this campaign
        
      
      
        {/* Current Binding Status */}
        {currentBinding && (
          
            {currentBinding.mode !== 'none' ? (
              
            ) : (
              
            )}
            
              {currentBinding.mode !== 'none' && currentSnapshot ? (
                <>
                  
                    {currentSnapshot.organizationName}
                  
                  
                    {currentSnapshot.domain && {currentSnapshot.domain} • }
                    {currentSnapshot.confidenceScore && (
                      Confidence: {Math.round(currentSnapshot.confidenceScore * 100)}%
                    )}
                  
                
              ) : currentBinding.mode !== 'none' && currentBinding.masterOrgIntelligenceId ? (
                <>
                  
                    Using Primary Organization Intelligence
                  
                  
                    Bound at {new Date(currentBinding.boundAt).toLocaleDateString()}
                  
                
              ) : (
                <>
                  
                    Neutral Agent Mode
                  
                  
                    Agents will operate without organization context
                  
                
              )}
            
          
        )}

        {/* Change OI Binding */}
        {!readOnly && (
          
            Select Organization Intelligence Source
            
             {
                if (value === 'none') {
                  handleModeChange('none');
                } else if (value.startsWith('master_')) {
                  handleSourceSelect(value.replace('master_', ''), 'master');
                } else if (value.startsWith('snapshot_')) {
                  handleSourceSelect(value.replace('snapshot_', ''), 'snapshot');
                }
              }}
              disabled={bindMutation.isPending}
            >
              
                
              
              
                {/* Master Org Intelligence */}
                {sources?.masterOrgIntelligence && (
                  
                    
                      
                      {sources.masterOrgIntelligence.companyName}
                      Primary
                    
                  
                )}

                {/* Reusable Snapshots */}
                {sources?.reusableSnapshots?.map((snapshot) => (
                  
                    
                      
                      {snapshot.organizationName}
                      {snapshot.confidenceScore && (
                        
                          {Math.round(snapshot.confidenceScore * 100)}%
                        
                      )}
                    
                  
                ))}

                {/* None option */}
                
                  
                    
                    No Organization Intelligence (Neutral Mode)
                  
                
              
            

            {bindMutation.isPending && (
              
                
                Binding organization intelligence...
              
            )}
          
        )}

        {/* Info about campaign-scoped OI */}
        
          
          
            Campaign-Scoped Intelligence
            
              This organization context is bound to the campaign, not to individual agents. 
              The same agent can serve multiple campaigns with different organization contexts.
            
          
        
      
    
  );
}

export default CampaignOrgIntelligenceBinding;