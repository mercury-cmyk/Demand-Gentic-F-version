import { useLocation, useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CampaignWizard, type CampaignWizardStep } from "@/components/campaign-builder/campaign-wizard";
import { Step1AudienceSelection } from "@/components/campaign-builder/step1-audience-selection";
import { Step0CampaignType } from "@/components/campaign-builder/step0-campaign-type";
import { StepClientProject } from "@/components/campaign-builder/step-client-project";
import { StepAIVoice } from "@/components/campaign-builder/step-ai-voice";
import { Step3Scheduling } from "@/components/campaign-builder/step3-scheduling";
import { Step4Compliance } from "@/components/campaign-builder/step4-compliance";
import { StepQAParameters } from "@/components/campaign-builder/step-qa-parameters";
import { Step5Summary } from "@/components/campaign-builder/step5-summary";
import { StepContentContext } from "@/components/campaign-builder/step-content-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function TelemarketingCreatePage() {
  const [, setLocation] = useLocation();
  // Support multiple route patterns: /phone-campaigns/:id/edit, /campaigns/telemarketing/:id/edit, /campaigns/:campaignType/edit/:id
  const params = useParams<{ id?: string; campaignType?: string }>();
  const campaignId = params?.id;
  const isEditMode = !!campaignId;
  const { toast } = useToast();
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);

  // Read client/project from URL query params (e.g. from project approval flow)
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const urlClientId = searchParams.get('clientId') || '';
  const urlProjectId = searchParams.get('projectId') || '';
  const [isStartingCalls, setIsStartingCalls] = useState(false);

  // Fetch existing campaign data when in edit mode
  const { data: existingCampaign, isLoading: isLoadingCampaign } = useQuery({
    queryKey: ['/api/campaigns', campaignId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/campaigns/${campaignId}`);
      return res.json();
    },
    enabled: isEditMode,
  });

  // Transform existing campaign data to wizard format
  const getInitialData = () => {
    if (!existingCampaign) return {};

    return {
      // Basic info
      name: existingCampaign.name,
      type: existingCampaign.type,
      // Client & Project
      clientAccountId: existingCampaign.clientAccountId,
      projectId: existingCampaign.projectId,
      organizationId: existingCampaign.problemIntelligenceOrgId,
      // Phone
      callerPhoneNumberId: existingCampaign.callerPhoneNumberId,
      callerPhoneNumber: existingCampaign.callerPhoneNumber,
      // Number pool rotation config
      numberPoolConfig: existingCampaign.numberPoolConfig || { enabled: true, rotationStrategy: 'reputation_based', maxCallsPerNumber: 50, cooldownHours: 4 },
      // Content
      content: {
        script: existingCampaign.callScript,
        qualificationFields: existingCampaign.qualificationQuestions,
      },
      // Campaign context
      campaignObjective: existingCampaign.campaignObjective,
      productServiceInfo: existingCampaign.productServiceInfo,
      talkingPoints: existingCampaign.talkingPoints,
      targetAudienceDescription: existingCampaign.targetAudienceDescription,
      successCriteria: existingCampaign.successCriteria,
      campaignObjections: existingCampaign.campaignObjections,
      // Scheduling
      scheduling: {
        type: existingCampaign.scheduleJson?.type || 'immediate',
        ...existingCampaign.scheduleJson,
        dialingPace: existingCampaign.throttlingConfig?.pace,
        targetQualifiedLeads: existingCampaign.targetQualifiedLeads,
        startDate: existingCampaign.startDate,
        endDate: existingCampaign.endDate,
        costPerLead: existingCampaign.costPerLead,
      },
      // QA
      qaParameters: existingCampaign.qaParameters,
      // Account cap
      accountCap: {
        enabled: existingCampaign.accountCapEnabled,
        leadsPerAccount: existingCampaign.accountCapValue,
        mode: existingCampaign.accountCapMode,
      },
      // AI Agent settings (voice, persona)
      aiAgentSettings: existingCampaign.aiAgentSettings,
      // Dial mode
      dialMode: existingCampaign.dialMode || 'ai_agent',
    };
  };

  // Start AI Calls handler
  const handleStartAiCalls = async () => {
    if (!createdCampaignId) return;
    setIsStartingCalls(true);
    try {
      await apiRequest('POST', '/api/ai-calls/batch-start', {
        campaignId: createdCampaignId,
        limit: 10,
        delayBetweenCalls: 3000,
      });
      toast({
        title: "AI Calls Started",
        description: "AI agents are now making calls for your campaign.",
      });
      setShowSuccessDialog(false);
      setLocation("/campaigns");
    } catch (error: any) {
      toast({
        title: "Failed to Start Calls",
        description: error?.message || "Please try again from the campaigns page.",
        variant: "destructive",
      });
    } finally {
      setIsStartingCalls(false);
    }
  };

  // Simplified wizard: 9 steps (down from 13)
  // Combined: Campaign Context + Call Script → Content & Context
  // Removed: Phone Number (uses default number pool)
  // Combined: Compliance includes suppressions and account cap
  const steps: CampaignWizardStep[] = [
    {
      id: "type",
      title: "Type",
      description: "Select campaign objective",
      component: Step0CampaignType,
    },
    {
      id: "client-project",
      title: "Client & Project",
      description: "Link this campaign to a client and project",
      component: StepClientProject,
    },
    {
      id: "content-context",
      title: "Content & Context",
      description: "Define objective, talking points, and AI context",
      component: StepContentContext,
    },
    {
      id: "audience",
      title: "Audience",
      description: "Select your target audience for calling",
      component: Step1AudienceSelection,
    },
    {
      id: "ai-voice",
      title: "AI Voice",
      description: "Select the AI voice and persona",
      component: StepAIVoice,
    },
    {
      id: "scheduling",
      title: "Scheduling",
      description: "Configure call windows and pacing",
      component: Step3Scheduling,
    },
    {
      id: "compliance",
      title: "Compliance",
      description: "DNC checks, account caps, and suppressions",
      component: Step4Compliance,
    },
    {
      id: "summary",
      title: "Summary",
      description: "Review and launch your campaign",
      component: Step5Summary,
    },
  ];

  const handleComplete = async (data: any) => {
    try {
      // Transform audience data to match schema
      const audienceRefs: any = {};

      if (data.audience?.source === 'segment' && data.audience.selectedSegments?.length > 0) {
        audienceRefs.segments = data.audience.selectedSegments;
      }
      if (data.audience?.source === 'list' && data.audience.selectedLists?.length > 0) {
        audienceRefs.lists = data.audience.selectedLists;
      }
      if (data.audience?.source === 'domain_set' && data.audience.selectedDomainSets?.length > 0) {
        audienceRefs.domainSets = data.audience.selectedDomainSets;
      }
      if (data.audience?.source === 'filters' && data.audience.filterGroup) {
        audienceRefs.filterGroup = data.audience.filterGroup;
      }

      // Add exclusions if present
      if (data.audience?.excludedSegments?.length > 0) {
        audienceRefs.excludedSegments = data.audience.excludedSegments;
      }
      if (data.audience?.excludedLists?.length > 0) {
        audienceRefs.excludedLists = data.audience.excludedLists;
      }

      // Build throttling config
      const throttlingConfig = data.scheduling?.dialingPace ? {
        pace: data.scheduling.dialingPace,
      } : undefined;

      // Build schedule config
      const scheduleJson = data.scheduling?.type === 'scheduled' ? {
        type: 'scheduled',
        date: data.scheduling.date,
        time: data.scheduling.time,
        timezone: data.scheduling.timezone,
      } : undefined;

      const campaignPayload = {
        name: data.name || `Dialer Campaign ${new Date().toISOString()}`,
        type: data.type || "call",
        status: data.action === "draft" ? "draft" : "active",
        clientAccountId: data.clientAccountId,
        projectId: data.projectId,
        problemIntelligenceOrgId: data.organizationId || null,
        audienceRefs,
        callScript: data.content?.script,
        qualificationQuestions: data.content?.qualificationFields,
        dialMode: 'ai_agent', // AI Agent mode is the default and only supported mode
        hybridSettings: data.hybridSettings || undefined,
        aiAgentSettings: data.aiAgentSettings || undefined,
        scheduleJson,
        assignedTeams: data.scheduling?.assignedAgents || [],
        throttlingConfig,
        accountCapEnabled: data.accountCap?.enabled || false,
        accountCapValue: data.accountCap?.enabled ? data.accountCap.leadsPerAccount : null,
        accountCapMode: data.accountCap?.enabled ? data.accountCap.mode : null,
        targetQualifiedLeads: data.scheduling?.targetQualifiedLeads ? parseInt(data.scheduling.targetQualifiedLeads) : null,
        startDate: data.scheduling?.startDate || null,
        endDate: data.scheduling?.endDate || null,
        costPerLead: data.scheduling?.costPerLead ? parseFloat(data.scheduling.costPerLead) : null,
        qaParameters: data.qaParameters || null,
        // Telnyx Phone Number Assignment
        callerPhoneNumberId: data.callerPhoneNumberId || null,
        callerPhoneNumber: data.callerPhoneNumber || null,
        // Number Pool Rotation Configuration
        numberPoolConfig: data.numberPoolConfig || { enabled: true, rotationStrategy: 'reputation_based', maxCallsPerNumber: 50, cooldownHours: 4 },
        // Campaign Context fields (AI Agent Campaign Layer)
        campaignObjective: data.campaignObjective || null,
        productServiceInfo: data.productServiceInfo || null,
        talkingPoints: data.talkingPoints?.length > 0 ? data.talkingPoints : null,
        targetAudienceDescription: data.targetAudienceDescription || null,
        successCriteria: data.successCriteria || null,
        campaignObjections: data.campaignObjections?.length > 0 ? data.campaignObjections : null,
      };

      let result;
      if (isEditMode && campaignId) {
        // Update existing campaign
        result = await apiRequest("PATCH", `/api/campaigns/${campaignId}`, campaignPayload);
        toast({
          title: "Campaign Updated",
          description: "Your campaign changes have been saved.",
        });
        setLocation("/campaigns");
      } else {
        // Create new campaign
        const response = await apiRequest("POST", "/api/campaigns", campaignPayload);
        result = await response.json();

        if (data.action === "draft") {
          toast({
            title: "Draft Saved",
            description: "Your dialer campaign has been saved as a draft.",
          });
          setLocation("/campaigns");
        } else {
          // Show success dialog with option to start AI calls
          setCreatedCampaignId(result.id || result.campaign?.id);
          setShowSuccessDialog(true);
        }
      }
    } catch (error: any) {
      console.error("Campaign save error:", error);
      toast({
        title: "Error",
        description: error?.message || `Failed to ${isEditMode ? 'update' : 'create'} campaign. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setLocation("/campaigns");
  };

  // Show loading state when fetching existing campaign
  if (isEditMode && isLoadingCampaign) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading campaign...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <CampaignWizard
        campaignType="telemarketing"
        steps={steps}
        onComplete={handleComplete}
        onCancel={handleCancel}
        initialData={isEditMode ? getInitialData() : {
          ...(urlClientId && { clientAccountId: urlClientId }),
          ...(urlProjectId && { projectId: urlProjectId }),
        }}
        title={isEditMode ? "Edit Campaign" : undefined}
      />

      {/* Post-Creation Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-green-500">&#10003;</span>
              Campaign Created Successfully!
            </DialogTitle>
            <DialogDescription>
              Your campaign is now active. Would you like to start AI calls immediately?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Starting AI calls will begin dialing contacts from your audience queue.
              You can also start calls later from the Campaigns dashboard.
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowSuccessDialog(false);
                setLocation("/campaigns");
              }}
            >
              Go to Dashboard
            </Button>
            <Button
              onClick={handleStartAiCalls}
              disabled={isStartingCalls}
              className="bg-green-600 hover:bg-green-700"
            >
              {isStartingCalls ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start AI Calls Now"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
