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
  const [researchResult, setResearchResult] = useState<{
    success: boolean;
    summary: string;
    snapshotId: string;
  } | null>(null);

  // Fetch available OI sources
  const { data: sources, isLoading: sourcesLoading } = useQuery<AvailableSource>({
    queryKey: ['/api/org-intelligence-injection/available-sources'],
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
        '/api/org-intelligence-injection/research',
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
      queryClient.invalidateQueries({ queryKey: ['/api/org-intelligence-injection/available-sources'] });
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
    <Card className="border-2">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Organization Intelligence Setup</CardTitle>
        </div>
        <CardDescription>
          How should this agent understand the organization it represents?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Selection */}
        <RadioGroup
          value={config.mode}
          onValueChange={(value) => handleModeChange(value as OrgIntelligenceMode)}
          disabled={disabled}
          className="space-y-3"
        >
          {/* Mode A: Use Existing */}
          <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="use_existing" id="use_existing" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="use_existing" className="font-medium cursor-pointer flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-500" />
                Use Existing Organization Intelligence
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Load from saved organization profile or previous research snapshot. Best for your own organization or known clients.
              </p>
            </div>
          </div>

          {/* Mode B: Fresh Research */}
          <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="fresh_research" id="fresh_research" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="fresh_research" className="font-medium cursor-pointer flex items-center gap-2">
                <Search className="h-4 w-4 text-green-500" />
                Run Fresh Research
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Research a new organization from their website. Creates a campaign-scoped snapshot you control with
                the same level of intelligence as the Organization Profile workflow.
              </p>
            </div>
          </div>

          {/* Mode C: None */}
          <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="none" id="none" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="none" className="font-medium cursor-pointer flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500" />
                No Organization Intelligence
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Agent operates as a neutral researcher without representing a brand. Good for market research or discovery calls.
              </p>
            </div>
          </div>
        </RadioGroup>

        {/* Mode A: Source Selection */}
        {config.mode === 'use_existing' && (
          <div className="space-y-4 pt-4 border-t">
            <Label className="font-medium">Select Organization Intelligence Source</Label>
            
            {sourcesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Select
                value={config.masterOrgIntelligenceId ? 'master' : config.snapshotId || ''}
                onValueChange={handleSourceSelect}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization intelligence source" />
                </SelectTrigger>
                <SelectContent>
                  {/* Master Org Intelligence */}
                  {sources?.masterOrgIntelligence && (
                    <SelectItem value="master">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span>{sources.masterOrgIntelligence.companyName}</span>
                        <Badge variant="secondary" className="text-xs">Primary</Badge>
                      </div>
                    </SelectItem>
                  )}
                  
                  {/* Reusable Snapshots */}
                  {sources?.reusableSnapshots?.map((snapshot) => (
                    <SelectItem key={snapshot.id} value={snapshot.id}>
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

                  {!sources?.masterOrgIntelligence && !sources?.reusableSnapshots?.length && (
                    <div className="p-4 text-center text-muted-foreground">
                      <p>No existing organization intelligence found.</p>
                      <p className="text-sm">Run fresh research or create one in AI Studio.</p>
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}

            {/* Source Info */}
            {(config.masterOrgIntelligenceId || config.snapshotId) && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Organization intelligence will be loaded at runtime
                </span>
              </div>
            )}
          </div>
        )}

        {/* Mode B: Fresh Research Form */}
        {config.mode === 'fresh_research' && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              <span>AI will research this organization and build a campaign-scoped intelligence snapshot</span>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="orgName" className="font-medium">
                  Organization Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="orgName"
                  placeholder="e.g., Acme Corporation"
                  value={config.organizationName || ''}
                  onChange={(e) => onConfigChange({ ...config, organizationName: e.target.value })}
                  disabled={disabled || isResearching}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="websiteUrl" className="font-medium">
                  Website URL <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="websiteUrl"
                    placeholder="https://www.example.com"
                    value={config.websiteUrl || ''}
                    onChange={(e) => onConfigChange({ ...config, websiteUrl: e.target.value })}
                    disabled={disabled || isResearching}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry (optional)</Label>
                <Input
                  id="industry"
                  placeholder="e.g., SaaS, Healthcare, Manufacturing"
                  value={config.industry || ''}
                  onChange={(e) => onConfigChange({ ...config, industry: e.target.value })}
                  disabled={disabled || isResearching}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Research Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any specific focus areas or context for the research..."
                  value={config.notes || ''}
                  onChange={(e) => onConfigChange({ ...config, notes: e.target.value })}
                  disabled={disabled || isResearching}
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="saveReusable"
                  checked={config.saveAsReusable || false}
                  onChange={(e) => onConfigChange({ ...config, saveAsReusable: e.target.checked })}
                  disabled={disabled || isResearching}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="saveReusable" className="text-sm font-normal">
                  Save for future campaigns (make reusable)
                </Label>
              </div>

              <Button
                type="button"
                onClick={handleRunResearch}
                disabled={disabled || isResearching || !config.organizationName || !config.websiteUrl}
                className="w-full"
              >
                {isResearching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Researching Organization...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Run Organization Intelligence Research
                  </>
                )}
              </Button>
            </div>

            {/* Research Result */}
            {researchResult && (
              <div className={`flex items-start gap-2 p-3 rounded-lg ${
                researchResult.success 
                  ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300' 
                  : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
              }`}>
                {researchResult.success ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                )}
                <div className="text-sm">
                  <p className="font-medium">{researchResult.success ? 'Research Complete' : 'Research Failed'}</p>
                  <p>{researchResult.summary}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode C: No OI Info */}
        {config.mode === 'none' && (
          <div className="pt-4 border-t">
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <Info className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-700 dark:text-amber-300">
                <p className="font-medium">Neutral Agent Mode</p>
                <p>
                  The agent will operate without representing any organization. 
                  Useful for market research, voice-of-customer interviews, or discovery calls.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OrganizationIntelligenceSetup;
