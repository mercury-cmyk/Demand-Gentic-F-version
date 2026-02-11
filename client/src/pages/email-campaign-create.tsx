import { useLocation, useSearch } from "wouter";
import { CampaignWizard, type CampaignWizardStep } from "@/components/campaign-builder/campaign-wizard";
import { StepClientProject } from "@/components/campaign-builder/step-client-project";
import { Step1AudienceSelection } from "@/components/campaign-builder/step1-audience-selection";
import { Step2EmailContentEnhanced } from "@/components/campaign-builder/step2-email-content-enhanced";
import { Step3Scheduling } from "@/components/campaign-builder/step3-scheduling";
import { Step4Compliance } from "@/components/campaign-builder/step4-compliance";
import { Step5Summary } from "@/components/campaign-builder/step5-summary";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function EmailCampaignCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Read client/project from URL query params (e.g. from project approval flow)
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const urlClientId = searchParams.get('clientId') || '';
  const urlProjectId = searchParams.get('projectId') || '';

  const steps: CampaignWizardStep[] = [
    {
      id: "client-project",
      title: "Client & Project",
      description: "Link this campaign to a client and project",
      component: StepClientProject,
    },
    {
      id: "audience",
      title: "Audience",
      description: "Select your target audience using filters, segments, lists, or domain sets",
      component: Step1AudienceSelection,
    },
    {
      id: "content",
      title: "Content",
      description: "Design your email with rich HTML editor and personalization",
      component: Step2EmailContentEnhanced,
    },
    {
      id: "scheduling",
      title: "Scheduling",
      description: "Configure send time, timezone, and pacing",
      component: Step3Scheduling,
    },
    {
      id: "compliance",
      title: "Compliance",
      description: "Automated pre-flight checks for deliverability and compliance",
      component: Step4Compliance,
    },
    {
      id: "summary",
      title: "Summary",
      description: "Review and launch your email campaign",
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
      const throttlingConfig = data.scheduling?.throttle ? {
        limit: data.scheduling.throttle,
      } : undefined;

      // Build schedule config
      const scheduleJson = data.scheduling?.type === 'scheduled' ? {
        type: 'scheduled',
        date: data.scheduling.date,
        time: data.scheduling.time,
        timezone: data.scheduling.timezone,
      } : undefined;

      const campaignPayload = {
        name: data.name || `Email Campaign ${new Date().toISOString()}`,
        type: "email",
        status: data.action === "draft" ? "draft" : "active",
        clientAccountId: data.clientAccountId,
        projectId: data.projectId,
        audienceRefs,
        emailSubject: data.content?.subject,
        emailHtmlContent: data.content?.html,
        emailPreheader: data.content?.preheader,
        senderProfileId: data.content?.senderProfileId,
        scheduleJson,
        throttlingConfig,
      };

      await apiRequest("POST", "/api/campaigns", campaignPayload);

      if (data.action === "draft") {
        toast({
          title: "Draft Saved",
          description: "Your email campaign has been saved as a draft.",
        });
      } else {
        toast({
          title: "Campaign Launched!",
          description: "Your email campaign is now running.",
        });
      }

      setLocation("/campaigns/email");
    } catch (error: any) {
      console.error("Campaign creation error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to create campaign. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setLocation("/campaigns/email");
  };

  return (
    <div className="max-w-7xl mx-auto">
      <CampaignWizard
        campaignType="email"
        steps={steps}
        onComplete={handleComplete}
        onCancel={handleCancel}
        initialData={{
          ...(urlClientId && { clientAccountId: urlClientId }),
          ...(urlProjectId && { projectId: urlProjectId }),
        }}
      />
    </div>
  );
}
