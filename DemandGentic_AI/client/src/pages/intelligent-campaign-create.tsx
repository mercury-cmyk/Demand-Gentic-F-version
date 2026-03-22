/**
 * Intelligent Campaign Creation Page
 * 
 * Full-page campaign creation experience using multi-modal
 * AI-powered campaign wizard with structured context.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useSearch, Link } from 'wouter';
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
} from 'lucide-react';
import type { StructuredCampaignContext } from '@shared/campaign-context-types';
import { SUPER_ORG_ID, SUPER_ORG_NAME } from '@shared/schema';

// ============================================================
// TYPES
// ============================================================

interface ClientAccount {
  id: string;
  name: string;
}

interface ClientProject {
  id: string;
  name: string;
  status: string;
}

// ============================================================
// PAGE COMPONENT
// ============================================================

export default function IntelligentCampaignCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Read client/project from URL query params (e.g. from project approval flow)
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const urlClientId = searchParams.get('clientId') || '';
  const urlProjectId = searchParams.get('projectId') || '';

  // State
  const [campaignType, setCampaignType] = useState('telemarketing');
  const [selectedClientId, setSelectedClientId] = useState(urlClientId);
  const [selectedProjectId, setSelectedProjectId] = useState(urlProjectId);
  const [showWizard, setShowWizard] = useState(false);
  const [preloadedContext, setPreloadedContext] = useState | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const selectedOrgId = SUPER_ORG_ID;
  const hasLoadedSuperOrgContext = useRef(false);

  const { data: clientAccounts = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['admin-client-accounts'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/client-portal/admin/clients');
      if (!res.ok) throw new Error('Failed to load clients');
      return res.json();
    },
  });

  const { data: clientDetail, isLoading: projectsLoading } = useQuery({
    queryKey: ['admin-client-projects', selectedClientId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/client-portal/admin/clients/${selectedClientId}`);
      if (!res.ok) throw new Error('Failed to load client projects');
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  const clientProjects = clientDetail?.projects || [];

  // Automatically fetch context when organization is selected
  const fetchOrgContextMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await apiRequest('GET', `/api/org-intelligence/campaign-context/${orgId}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.campaignContext) {
        setPreloadedContext(data.campaignContext);
        const orgName = data.organization?.name || 'organization';
        toast({
          title: 'Context Auto-Loaded',
          description: `Campaign context from ${orgName} has been automatically loaded and ready to use.`,
        });
      }
      setIsLoadingContext(false);
    },
    onError: (error: any) => {
      setIsLoadingContext(false);
      // Only show error if it's not a "no intelligence" error
      if (!error.message?.includes('intelligence')) {
        toast({
          title: 'Context Load Failed',
          description: error.message || 'Could not load organization context',
          variant: 'destructive',
        });
      }
    },
  });

  // Effect to manage selectedClientId based on loaded clientAccounts and URL params
  useEffect(() => {
    if (clientsLoading) return; // Wait for clients to load

    if (urlClientId && clientAccounts.some(client => client.id === urlClientId)) {
      setSelectedClientId(urlClientId);
    } else if (clientAccounts.length > 0) {
      setSelectedClientId(clientAccounts[0].id);
    } else {
      setSelectedClientId('');
    }
  }, [clientAccounts, urlClientId, clientsLoading]);

  // Effect to manage selectedProjectId based on selectedClientId, loaded clientProjects, and URL params
  useEffect(() => {
    if (projectsLoading) return; // Wait for projects to load

    if (!selectedClientId) {
      setSelectedProjectId('');
      return;
    }

    if (urlProjectId && clientProjects.some(project => project.id === urlProjectId)) {
      setSelectedProjectId(urlProjectId);
    } else if (clientProjects.length > 0) {
      setSelectedProjectId(clientProjects[0].id);
    } else {
      setSelectedProjectId('');
    }
  }, [selectedClientId, clientProjects, urlProjectId, projectsLoading]);

  useEffect(() => {
    if (hasLoadedSuperOrgContext.current) return;
    hasLoadedSuperOrgContext.current = true;
    setIsLoadingContext(true);
    fetchOrgContextMutation.mutate(SUPER_ORG_ID);
  }, [fetchOrgContextMutation]);

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (data: { context: StructuredCampaignContext; legacyFields: Record }) => {
      const campaignPayload = {
        name: data.legacyFields.campaignObjective?.substring(0, 100) || 'New Campaign',
        type: campaignType,
        status: 'draft',
        clientAccountId: selectedClientId,
        projectId: selectedProjectId,
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

  const handleWizardComplete = useCallback((context: StructuredCampaignContext, legacyFields: Record) => {
    if (!selectedClientId || !selectedProjectId) {
      toast({
        title: 'Client & Project Required',
        description: 'Select a client and project before creating a campaign.',
        variant: 'destructive',
      });
      return;
    }
    createCampaignMutation.mutate({ context, legacyFields });
  }, [createCampaignMutation, selectedClientId, selectedProjectId, toast]);

  const handleCancel = useCallback(() => {
    if (showWizard) {
      setShowWizard(false);
    } else {
      setLocation('/campaigns');
    }
  }, [showWizard, setLocation]);

  const selectedClient = clientAccounts.find((client) => client.id === selectedClientId);
  const selectedProject = clientProjects.find((project) => project.id === selectedProjectId);
  const canStartWizard = !!selectedClientId && !!selectedProjectId;

  // If wizard is active, show full-screen wizard
  if (showWizard) {
    return (
      
        
          
            
              
              Back
            
            
              
              Intelligent Campaign Creator
            
          
          
          
            
              {campaignType === 'telemarketing' ? (
                <> Telemarketing
              ) : (
                <> Email
              )}
            
            {selectedClient && selectedProject && (
              
                
                {selectedClient.name} / {selectedProject.name}
              
            )}
            
              
              {SUPER_ORG_NAME}
            
          
        
        
        
          
        
      
    );
  }

  // Otherwise show setup screen
  return (
    
      {/* Page Header */}
      
        
          Campaigns
          /
          Create with AI
        
        
          
          Create Campaign with AI
        
        
          Use our intelligent wizard to create a structured, high-converting campaign
        
      

      {/* Campaign Type Selection */}
      
        
          
            
            Client & Project
          
          
            Link this campaign to a client and project for governance and reporting
          
        
        
          
            
              Client
              {clientsLoading ? (
                Loading clients...
              ) : (
                
                  
                    
                  
                  
                    {clientAccounts.length === 0 ? (
                      No clients found
                    ) : (
                      clientAccounts.map((client) => (
                        
                          {client.name}
                        
                      ))
                    )}
                  
                
              )}
            

            
              Project
              {!selectedClientId ? (
                Select a client first
              ) : projectsLoading ? (
                Loading projects...
              ) : (
                
                  
                    
                  
                  
                    {clientProjects.length === 0 ? (
                      No projects found
                    ) : (
                      clientProjects.map((project) => (
                        
                          {project.name} ({project.status})
                        
                      ))
                    )}
                  
                
              )}
            
          
        
      

      {/* Campaign Type Selection */}
      
        
          
            
            Campaign Type
          
          
            Choose the type of outreach for this campaign
          
        
        
           setCampaignType(v as any)}>
            
              
                
                Telemarketing / AI Calling
              
              
                
                Email Campaign
              
            
            
            
              
                
                  
                
                
                  AI-Powered Calling Campaigns
                  
                    Create intelligent outbound calling campaigns with AI agents. 
                    Define your objectives, target audience, and conversation flow - 
                    our AI will handle the rest.
                  
                  
                    AI Voice Agents
                    Smart Qualification
                    Real-time Transcription
                  
                
              
            
            
            
              
                
                  
                
                
                  Intelligent Email Campaigns
                  
                    Create personalized email sequences with AI-generated content.
                    Define your message and let AI craft compelling emails.
                  
                  
                    AI Copywriting
                    Personalization
                    A/B Testing
                  
                
              
            
          
        
      

      {/* Organization Context */}
      
        
          
            
            Organization
          
          
            Admin campaigns always run under the super organization context
          
        
        
          
            
            
              {SUPER_ORG_NAME}
              
                Super organization workspace for internal admin campaign creation.
              
            
            Super Organization
          
          
          {isLoadingContext && (
            
              
              Loading organization intelligence...
            
          )}
          
          {preloadedContext && !isLoadingContext && (
            
              
                
                
                  Context Auto-Loaded ✓
                  
                    Campaign context from organization intelligence has been automatically loaded with:
                  
                  
                    {preloadedContext.objectives && • Campaign objectives and KPIs}
                    {preloadedContext.targetAudience && • Target audience profile}
                    {preloadedContext.deliverables && • Products/services deliverables}
                    {preloadedContext.coreMessage && • Core messaging and positioning}
                    {preloadedContext.conversationFlow && • Conversation flow and talking points}
                  
                  
                    → Click "Start Intelligent Campaign Creator" below to review and customize
                  
                
              
            
          )}
        
      

      {/* Feature Highlights */}
      
        
          
            
            What You'll Get
          
        
        
          
            
              
                
              
              
                Conversational Setup
                
                  Describe your campaign in natural language - text or voice
                
              
            
            
            
              
                
              
              
                Structured Context
                
                  AI extracts goals, audience, messaging automatically
                
              
            
            
            
              
                
              
              
                Intelligent Targeting
                
                  Role expansion suggests additional relevant titles
                
              
            
            
            
              
                
              
              
                Approval Workflow
                
                  Review and approve each section before launch
                
              
            
          
        
      

      {/* Actions */}
      
         setLocation('/campaigns')}>
          
          Back to Campaigns
        
        
        
           setShowWizard(true)} disabled={!canStartWizard}>
            
            Start Intelligent Campaign Creator
          
          {!canStartWizard && (
            Select a client and project to continue
          )}
        
      
    
  );
}