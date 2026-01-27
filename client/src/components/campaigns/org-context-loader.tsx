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
  campaignContext: Partial<StructuredCampaignContext>;
  organization: Organization;
  message: string;
}

interface OrgContextLoaderProps {
  onContextLoaded?: (context: Partial<StructuredCampaignContext>, organization: Organization) => void;
  campaignType?: 'email' | 'telemarketing' | 'voice';
}

export function OrgContextLoader({
  onContextLoaded,
  campaignType,
}: OrgContextLoaderProps) {
  const { toast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  // Fetch organizations
  const { data: organizations = [], isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ['organizations'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/organizations');
      return res.json();
    },
  });

  // Load context mutation
  const loadContextMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await apiRequest('GET', `/api/org-intelligence/campaign-context/${orgId}`);
      return res.json() as Promise<CampaignContextResponse>;
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Load Organization Context
          </CardTitle>
          <CardDescription>
            Get campaign context from your organization's intelligence
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (organizations.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Load Organization Context
          </CardTitle>
          <CardDescription>
            Get campaign context from your organization's intelligence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
            <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No Organizations Yet</p>
              <p className="text-xs text-muted-foreground">
                Create or select an organization to load its context automatically
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Load Organization Context
              </CardTitle>
              <CardDescription>
                Automatically populate campaign context from organization intelligence
              </CardDescription>
            </div>
            {selectedOrgId && !loadContextMutation.isPending && (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                Selected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Select Organization
            </label>
            <Select value={selectedOrgId} onValueChange={handleOrgSelect} disabled={loadContextMutation.isPending}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an organization..." />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      <span>{org.name}</span>
                      {org.industry && (
                        <Badge variant="outline" className="text-[10px] ml-1">
                          {org.industry}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedOrg && (
            <div className="p-3 bg-background rounded-lg border border-primary/20 space-y-2">
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{selectedOrg.name}</p>
                  {selectedOrg.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {selectedOrg.description}
                    </p>
                  )}
                  {selectedOrg.domain && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedOrg.domain}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowConfirmation(true)}
              disabled={!selectedOrgId || loadContextMutation.isPending}
              className="gap-2 flex-1"
            >
              {loadContextMutation.isPending && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {loadContextMutation.isPending ? 'Loading...' : 'Load Context'}
              {!loadContextMutation.isPending && selectedOrgId && (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
            {selectedOrgId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedOrgId('');
                  setSelectedOrg(null);
                }}
                disabled={loadContextMutation.isPending}
              >
                Clear
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            📋 This will pre-fill your campaign objectives, audience targeting, messaging, and more from the organization's intelligence data.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogTitle>Load Campaign Context?</AlertDialogTitle>
          <AlertDialogDescription>
            This will populate your campaign context with data from{' '}
            <span className="font-semibold text-foreground">{selectedOrg?.name}</span>'s
            organization intelligence. This includes:
            <ul className="list-disc list-inside mt-3 space-y-1 text-sm">
              <li>Campaign objectives and goals</li>
              <li>Target audience (industries, job titles, seniority)</li>
              <li>Core messaging and talking points</li>
              <li>Email angles and call openers</li>
              <li>Conversation flow and objection handling</li>
            </ul>
            <p className="mt-3">You can review and adjust all context before launching.</p>
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLoad}>
              {loadContextMutation.isPending && (
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
              )}
              Load Context
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
