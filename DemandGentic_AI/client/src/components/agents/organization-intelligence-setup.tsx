/**
 * Organization Intelligence Setup Component
 * 
 * Used in agent creation flow to select OI mode:
 * - Mode A: Use existing organization intelligence
 * - Mode B: Run fresh research for this organization
 * - Mode C: Do not use organization intelligence
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
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Globe,
  Search,
  Database,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  FileText,
} from 'lucide-react';

// ==================== TYPES ====================

export type OrgIntelligenceMode = 'use_existing' | 'fresh_research' | 'none';

export interface OrgIntelligenceConfig {
  mode: OrgIntelligenceMode;
  snapshotId?: string;
  masterOrgIntelligenceId?: number;
  // For fresh research
  organizationName?: string;
  websiteUrl?: string;
  industry?: string;
  notes?: string;
  saveAsReusable?: boolean;
}

export interface OrganizationIntelligenceSetupProps {
  config: OrgIntelligenceConfig;
  onConfigChange: (config: OrgIntelligenceConfig) => void;
  campaignId?: string;
  onResearchComplete?: (snapshotId: string) => void;
  disabled?: boolean;
}

interface AvailableSource {
  masterOrgIntelligence: {
    id: number;
    domain: string;
    companyName: string;
    updatedAt: string;
  } | null;
  reusableSnapshots: Array;
  modes: Array;
}

// ==================== COMPONENT ====================

export function OrganizationIntelligenceSetup({
  config,
  onConfigChange,
  campaignId,
  onResearchComplete,
  disabled = false,
}: OrganizationIntelligenceSetupProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isResearching, setIsResearching] = useState(false);
  const [researchResult, setResearchResult] = useState(null);

  // Fetch available OI sources
  const { data: sources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['/api/unified-agents/org-intelligence/available-sources'],
  });

  // Research mutation
  const researchMutation = useMutation({
    mutationFn: async (input: {
      organizationName: string;
      websiteUrl: string;
      industry?: string;
      notes?: string;
      saveAsReusable?: boolean;
    }) => {
      const response = await apiRequest(
        'POST',
        '/api/unified-agents/org-intelligence/research',
        input
      );
      return response.json();
    },
    onSuccess: (data) => {
      setResearchResult({
        success: true,
        summary: data.researchSummary,
        snapshotId: data.snapshot.id,
      });
      onConfigChange({
        ...config,
        snapshotId: data.snapshot.id,
      });
      if (onResearchComplete) {
        onResearchComplete(data.snapshot.id);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/unified-agents/org-intelligence/available-sources'] });
      toast({
        title: 'Research Complete',
        description: data.researchSummary,
      });
    },
    onError: (error: any) => {
      setResearchResult({
        success: false,
        summary: error.message || 'Research failed',
        snapshotId: '',
      });
      toast({
        title: 'Research Failed',
        description: error.message || 'Failed to research organization',
        variant: 'destructive',
      });
    },
  });

  // Handle mode change
  const handleModeChange = (mode: OrgIntelligenceMode) => {
    setResearchResult(null);
    onConfigChange({
      ...config,
      mode,
      snapshotId: mode === 'none' ? undefined : config.snapshotId,
    });
  };

  // Handle existing source selection
  const handleSourceSelect = (sourceId: string) => {
    if (sourceId === 'master') {
      onConfigChange({
        ...config,
        masterOrgIntelligenceId: sources?.masterOrgIntelligence?.id,
        snapshotId: undefined,
      });
    } else {
      onConfigChange({
        ...config,
        snapshotId: sourceId,
        masterOrgIntelligenceId: undefined,
      });
    }
  };

  // Handle research form submit
  const handleRunResearch = async () => {
    if (!config.organizationName || !config.websiteUrl) {
      toast({
        title: 'Missing Information',
        description: 'Organization name and website URL are required',
        variant: 'destructive',
      });
      return;
    }

    setIsResearching(true);
    try {
      await researchMutation.mutateAsync({
        organizationName: config.organizationName,
        websiteUrl: config.websiteUrl,
        industry: config.industry,
        notes: config.notes,
        saveAsReusable: config.saveAsReusable,
      });
    } finally {
      setIsResearching(false);
    }
  };

  return (
    
      
        
          
          Organization Intelligence Setup
        
        
          How should this agent understand the organization it represents?
        
      
      
        {/* Mode Selection */}
         handleModeChange(value as OrgIntelligenceMode)}
          disabled={disabled}
          className="space-y-3"
        >
          {/* Mode A: Use Existing */}
          
            
            
              
                
                Use Existing Organization Intelligence
              
              
                Load from saved organization profile or previous research snapshot. Best for your own organization or known clients.
              
            
          

          {/* Mode B: Fresh Research */}
          
            
            
              
                
                Run Fresh Research
              
              
                Research a new organization from their website. Creates a campaign-scoped snapshot you control with
                the same level of intelligence as the Organization Profile workflow.
              
            
          

          {/* Mode C: None */}
          
            
            
              
                
                No Organization Intelligence
              
              
                Agent operates as a neutral researcher without representing a brand. Good for market research or discovery calls.
              
            
          
        

        {/* Mode A: Source Selection */}
        {config.mode === 'use_existing' && (
          
            Select Organization Intelligence Source
            
            {sourcesLoading ? (
              
                
                
              
            ) : (
              
                
                  
                
                
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

                  {!sources?.masterOrgIntelligence && !sources?.reusableSnapshots?.length && (
                    
                      No existing organization intelligence found.
                      Run fresh research or create one in AI Studio.
                    
                  )}
                
              
            )}

            {/* Source Info */}
            {(config.masterOrgIntelligenceId || config.snapshotId) && (
              
                
                
                  Organization intelligence will be loaded at runtime
                
              
            )}
          
        )}

        {/* Mode B: Fresh Research Form */}
        {config.mode === 'fresh_research' && (
          
            
              
              AI will research this organization and build a campaign-scoped intelligence snapshot
            

            
              
                
                  Organization Name *
                
                 onConfigChange({ ...config, organizationName: e.target.value })}
                  disabled={disabled || isResearching}
                />
              

              
                
                  Website URL *
                
                
                  
                   onConfigChange({ ...config, websiteUrl: e.target.value })}
                    disabled={disabled || isResearching}
                    className="pl-10"
                  />
                
              

              
                Industry (optional)
                 onConfigChange({ ...config, industry: e.target.value })}
                  disabled={disabled || isResearching}
                />
              

              
                Research Notes (optional)
                 onConfigChange({ ...config, notes: e.target.value })}
                  disabled={disabled || isResearching}
                  rows={3}
                />
              

              
                 onConfigChange({ ...config, saveAsReusable: e.target.checked })}
                  disabled={disabled || isResearching}
                  className="h-4 w-4 rounded border-gray-300"
                />
                
                  Save for future campaigns (make reusable)
                
              

              
                {isResearching ? (
                  <>
                    
                    Researching Organization...
                  
                ) : (
                  <>
                    
                    Run Organization Intelligence Research
                  
                )}
              
            

            {/* Research Result */}
            {researchResult && (
              
                {researchResult.success ? (
                  
                ) : (
                  
                )}
                
                  {researchResult.success ? 'Research Complete' : 'Research Failed'}
                  {researchResult.summary}
                
              
            )}
          
        )}

        {/* Mode C: No OI Info */}
        {config.mode === 'none' && (
          
            
              
              
                Neutral Agent Mode
                
                  The agent will operate without representing any organization. 
                  Useful for market research, voice-of-customer interviews, or discovery calls.
                
              
            
          
        )}
      
    
  );
}

export default OrganizationIntelligenceSetup;