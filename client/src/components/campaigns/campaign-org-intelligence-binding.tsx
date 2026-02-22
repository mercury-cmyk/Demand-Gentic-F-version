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
  const { data: bindingData, isLoading: bindingLoading } = useQuery<{
    binding: CampaignOIBinding | null;
    snapshotInfo: SnapshotInfo | null;
  }>({
    queryKey: [`/api/unified-agents/org-intelligence/campaigns/${campaignId}/binding`],
    enabled: !!campaignId,
  });

  // Fetch available sources
  const { data: sources, isLoading: sourcesLoading } = useQuery<{
    masterOrgIntelligence: {
      id: number;
      domain: string;
      companyName: string;
      updatedAt: string;
    } | null;
    reusableSnapshots: Array<{
      id: string;
      organizationName: string;
      domain: string;
      industry: string | null;
      confidenceScore: number | null;
      createdAt: string;
    }>;
    modes: Array<{
      value: OrgIntelligenceMode;
      label: string;
      description: string;
    }>;
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentBinding = bindingData?.binding;
  const currentSnapshot = bindingData?.snapshotInfo;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Campaign Organization Intelligence</CardTitle>
          </div>
          {currentBinding && (
            <Badge variant={currentBinding.mode === 'none' ? 'secondary' : 'default'}>
              {currentBinding.mode === 'use_existing' && 'Using Existing OI'}
              {currentBinding.mode === 'fresh_research' && 'Fresh Research'}
              {currentBinding.mode === 'none' && 'No OI'}
            </Badge>
          )}
        </div>
        <CardDescription>
          Organization context that agents will use when executing this campaign
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Binding Status */}
        {currentBinding && (
          <div className={`flex items-start gap-3 p-3 rounded-lg ${
            currentBinding.mode === 'none' 
              ? 'bg-muted' 
              : 'bg-green-50 dark:bg-green-950'
          }`}>
            {currentBinding.mode !== 'none' ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            ) : (
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
            )}
            <div className="flex-1">
              {currentBinding.mode !== 'none' && currentSnapshot ? (
                <>
                  <p className="font-medium text-green-700 dark:text-green-300">
                    {currentSnapshot.organizationName}
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    {currentSnapshot.domain && <span>{currentSnapshot.domain} • </span>}
                    {currentSnapshot.confidenceScore && (
                      <span>Confidence: {Math.round(currentSnapshot.confidenceScore * 100)}%</span>
                    )}
                  </p>
                </>
              ) : currentBinding.mode !== 'none' && currentBinding.masterOrgIntelligenceId ? (
                <>
                  <p className="font-medium text-green-700 dark:text-green-300">
                    Using Primary Organization Intelligence
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Bound at {new Date(currentBinding.boundAt).toLocaleDateString()}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-muted-foreground">
                    Neutral Agent Mode
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Agents will operate without organization context
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Change OI Binding */}
        {!readOnly && (
          <div className="space-y-3">
            <Label>Select Organization Intelligence Source</Label>
            
            <Select
              value={
                currentBinding?.masterOrgIntelligenceId 
                  ? `master_${currentBinding.masterOrgIntelligenceId}`
                  : currentBinding?.snapshotId 
                    ? `snapshot_${currentBinding.snapshotId}` 
                    : currentBinding?.mode === 'none' 
                      ? 'none' 
                      : ''
              }
              onValueChange={(value) => {
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
              <SelectTrigger>
                <SelectValue placeholder="Choose organization intelligence source..." />
              </SelectTrigger>
              <SelectContent>
                {/* Master Org Intelligence */}
                {sources?.masterOrgIntelligence && (
                  <SelectItem value={`master_${sources.masterOrgIntelligence.id}`}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span>{sources.masterOrgIntelligence.companyName}</span>
                      <Badge variant="secondary" className="text-xs">Primary</Badge>
                    </div>
                  </SelectItem>
                )}

                {/* Reusable Snapshots */}
                {sources?.reusableSnapshots?.map((snapshot) => (
                  <SelectItem key={snapshot.id} value={`snapshot_${snapshot.id}`}>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span>{snapshot.organizationName}</span>
                      {snapshot.confidenceScore && (
                        <Badge variant="outline" className="text-xs">
                          {Math.round(snapshot.confidenceScore * 100)}%
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}

                {/* None option */}
                <SelectItem value="none">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Database className="h-4 w-4" />
                    <span>No Organization Intelligence (Neutral Mode)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {bindMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Binding organization intelligence...
              </div>
            )}
          </div>
        )}

        {/* Info about campaign-scoped OI */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium">Campaign-Scoped Intelligence</p>
            <p>
              This organization context is bound to the campaign, not to individual agents. 
              The same agent can serve multiple campaigns with different organization contexts.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CampaignOrgIntelligenceBinding;
