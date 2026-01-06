import { useLocation } from "wouter";
import { CampaignWizard, type CampaignWizardStep } from "@/components/campaign-builder/campaign-wizard";
import { Step1AudienceSelection } from "@/components/campaign-builder/step1-audience-selection";
import { Step2TelemarketingContent } from "@/components/campaign-builder/step2-telemarketing-content";
import { Step2bDialModeConfig } from "@/components/campaign-builder/step2b-dial-mode-config";
import { Step3Scheduling } from "@/components/campaign-builder/step3-scheduling";
import { Step4Compliance } from "@/components/campaign-builder/step4-compliance";
import { Step4bSuppressions } from "@/components/campaign-builder/step4b-suppressions";
import { StepQAParameters } from "@/components/campaign-builder/step-qa-parameters";
import { Step5Summary } from "@/components/campaign-builder/step5-summary";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function TelemarketingCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const steps: CampaignWizardStep[] = [
    {
      id: "audience",
      title: "Audience",
      description: "Select your target audience for calling",
      component: Step1AudienceSelection,
    },
    {
      id: "content",
      title: "Call Script",
      description: "Create your call script and qualification questions",
      component: Step2TelemarketingContent,
    },
    {
      id: "dial-mode",
      title: "Dial Mode",
      description: "Configure manual or power dial with AMD settings",
      component: Step2bDialModeConfig,
    },
    {
      id: "scheduling",
      title: "Scheduling",
      description: "Configure call windows, agent assignment, and pacing",
      component: Step3Scheduling,
    },
    {
      id: "compliance",
      title: "Compliance",
      description: "Automated DNC checks and compliance verification",
      component: Step4Compliance,
    },
    {
      id: "suppressions",
      title: "Suppressions",
      description: "Optional campaign-level exclusions (accounts, contacts, domains)",
      component: Step4bSuppressions,
    },
    {
      id: "qa-parameters",
      title: "AI Quality",
      description: "Configure AI lead qualification criteria and scoring",
      component: StepQAParameters,
    },
    {
      id: "summary",
      title: "Summary",
      description: "Review and launch your dialer campaign",
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
        type: "call",
        status: data.action === "draft" ? "draft" : "active",
        audienceRefs,
        callScript: data.content?.script,
        qualificationQuestions: data.content?.qualificationFields,
        dialMode: data.dialMode || 'manual',
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
      };

      await apiRequest("POST", "/api/campaigns", campaignPayload);

      if (data.action === "draft") {
        toast({
          title: "Draft Saved",
          description: "Your dialer campaign has been saved as a draft.",
        });
      } else {
        toast({
          title: "Campaign Launched!",
          description: "Your dialer campaign is now running. Agents can start calling.",
        });
      }

      setLocation("/campaigns/telemarketing");
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
    setLocation("/campaigns/telemarketing");
  };

  return (
    <div className="max-w-7xl mx-auto">
      <CampaignWizard
        campaignType="telemarketing"
        steps={steps}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    </div>
  );
}