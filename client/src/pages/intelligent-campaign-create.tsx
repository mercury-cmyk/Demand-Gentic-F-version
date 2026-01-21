/**
 * Intelligent Campaign Creation Page
 * 
 * Full-page campaign creation experience using multi-modal
 * AI-powered campaign wizard with structured context.
 */

import React, { useState, useCallback } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IntelligentCampaignWizard } from '@/components/campaign-builder/intelligent-campaign-wizard';
import { InlineOrgCreator } from '@/components/campaigns/inline-org-creator';
import {
  Wand2,
  MessageSquare,
  Phone,
  ArrowLeft,
  Sparkles,
  Building2,
  Target,
  Users,
  Zap,
  Bot,
  FileText,
  Plus,
} from 'lucide-react';
import type { StructuredCampaignContext } from '@shared/campaign-context-types';

// ============================================================
// TYPES
// ============================================================

interface Organization {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
}

// ============================================================
// PAGE COMPONENT
// ============================================================

export default function IntelligentCampaignCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // State
  const [campaignType, setCampaignType] = useState<'telemarketing' | 'email'>('telemarketing');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [showWizard, setShowWizard] = useState(false);

  // Fetch organizations
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['organizations'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/organizations');
      return res.json();
    },
  });

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (data: { context: StructuredCampaignContext; legacyFields: Record<string, any> }) => {
      const campaignPayload = {
        name: data.legacyFields.campaignObjective?.substring(0, 100) || 'New Campaign',
        type: campaignType,
        status: 'draft',
        organizationId: selectedOrgId || undefined,
        
        // Legacy fields for backward compatibility
        campaignObjective: data.legacyFields.campaignObjective,
        productServiceInfo: data.legacyFields.productServiceInfo,
        coreMessage: data.legacyFields.coreMessage,
        talkingPoints: data.legacyFields.talkingPoints,
        targetAudienceDescription: data.legacyFields.targetAudienceDescription,
        campaignObjections: data.legacyFields.campaignObjections,
        successCriteria: data.legacyFields.successCriteria,
        qualificationRequirements: data.legacyFields.qualificationRequirements,
        campaignContextBrief: data.legacyFields.campaignContextBrief,
        
        // New structured context
        structuredContext: data.context,
      };

      const res = await apiRequest('POST', '/api/campaigns', campaignPayload);
      return res.json();
    },
    onSuccess: (campaign) => {
      toast({
        title: 'Campaign Created',
        description: 'Your campaign has been created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setLocation(`/campaigns/phone/${campaign.id}/edit`);
    },
    onError: (error: any) => {
      toast({
        title: 'Creation Failed',
        description: error.message || 'Failed to create campaign',
        variant: 'destructive',
      });
    },
  });

  const handleWizardComplete = useCallback((context: StructuredCampaignContext, legacyFields: Record<string, any>) => {
    createCampaignMutation.mutate({ context, legacyFields });
  }, [createCampaignMutation]);

  const handleCancel = useCallback(() => {
    if (showWizard) {
      setShowWizard(false);
    } else {
      setLocation('/campaigns');
    }
  }, [showWizard, setLocation]);

  // If wizard is active, show full-screen wizard
  if (showWizard) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <div className="border-b px-4 py-2 flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              <span className="font-semibold">Intelligent Campaign Creator</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1">
              {campaignType === 'telemarketing' ? (
                <><Phone className="h-3 w-3" /> Telemarketing</>
              ) : (
                <><MessageSquare className="h-3 w-3" /> Email</>
              )}
            </Badge>
            {selectedOrgId && organizations.find(o => o.id === selectedOrgId) && (
              <Badge variant="secondary" className="gap-1">
                <Building2 className="h-3 w-3" />
                {organizations.find(o => o.id === selectedOrgId)?.name}
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <IntelligentCampaignWizard
            organizationId={selectedOrgId}
            onComplete={handleWizardComplete}
            onCancel={handleCancel}
          />
        </div>
      </div>
    );
  }

  // Otherwise show setup screen
  return (
    <div className="container max-w-4xl py-8 space-y-8">
      {/* Page Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/campaigns" className="hover:underline">Campaigns</Link>
          <span>/</span>
          <span>Create with AI</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Wand2 className="h-8 w-8 text-primary" />
          Create Campaign with AI
        </h1>
        <p className="text-muted-foreground">
          Use our intelligent wizard to create a structured, high-converting campaign
        </p>
      </div>

      {/* Campaign Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Campaign Type
          </CardTitle>
          <CardDescription>
            Choose the type of outreach for this campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={campaignType} onValueChange={(v) => setCampaignType(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="telemarketing" className="gap-2">
                <Phone className="h-4 w-4" />
                Telemarketing / AI Calling
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Email Campaign
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="telemarketing" className="mt-4">
              <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">AI-Powered Calling Campaigns</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create intelligent outbound calling campaigns with AI agents. 
                    Define your objectives, target audience, and conversation flow - 
                    our AI will handle the rest.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="secondary">AI Voice Agents</Badge>
                    <Badge variant="secondary">Smart Qualification</Badge>
                    <Badge variant="secondary">Real-time Transcription</Badge>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="email" className="mt-4">
              <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-medium">Intelligent Email Campaigns</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create personalized email sequences with AI-generated content.
                    Define your message and let AI craft compelling emails.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="secondary">AI Copywriting</Badge>
                    <Badge variant="secondary">Personalization</Badge>
                    <Badge variant="secondary">A/B Testing</Badge>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Organization Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization
          </CardTitle>
          <CardDescription>
            Select or create the organization this campaign belongs to
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select organization (optional)" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{org.name}</span>
                      {org.industry && (
                        <Badge variant="outline" className="text-[10px]">
                          {org.industry}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <InlineOrgCreator
              onOrgCreated={(orgId) => setSelectedOrgId(orgId)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Feature Highlights */}
      <Card className="bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            What You'll Get
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h5 className="font-medium text-sm">Conversational Setup</h5>
                <p className="text-xs text-muted-foreground">
                  Describe your campaign in natural language - text or voice
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h5 className="font-medium text-sm">Structured Context</h5>
                <p className="text-xs text-muted-foreground">
                  AI extracts goals, audience, messaging automatically
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h5 className="font-medium text-sm">Intelligent Targeting</h5>
                <p className="text-xs text-muted-foreground">
                  Role expansion suggests additional relevant titles
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h5 className="font-medium text-sm">Approval Workflow</h5>
                <p className="text-xs text-muted-foreground">
                  Review and approve each section before launch
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setLocation('/campaigns')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Campaigns
        </Button>
        
        <Button size="lg" onClick={() => setShowWizard(true)}>
          <Wand2 className="h-5 w-5 mr-2" />
          Start Intelligent Campaign Creator
        </Button>
      </div>
    </div>
  );
}
