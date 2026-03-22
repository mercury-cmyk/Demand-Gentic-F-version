/**
 * SimpleCampaignBuilder - Main Orchestrator for 3-Page Campaign Flow
 *
 * Flow:
 * Page 1: Campaign Intent (name, client, project, sender, subject)
 * Page 2: Template Builder (full-screen email editor with org/project context)
 * Page 3: Audience & Send (pre-populated client/project, audience, schedule)
 *
 * Design Philosophy:
 * - Collect intent first → design message second → execute immediately
 * - Client & Project selected upfront so AI can align email with project goals
 */

import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { CampaignIntentForm, type CampaignIntent } from "./CampaignIntentForm";
import { SimpleTemplateBuilder } from "./SimpleTemplateBuilder";
import { AudienceSendPage } from "./AudienceSendPage";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { FilterGroup } from "@shared/filter-types";

interface TemplateData {
  subject: string;
  preheader: string;
  bodyContent: string;
  htmlContent: string;
  ctaUrl?: string;
}

interface LaunchData {
  audienceType: "segment" | "list" | "filters" | "all";
  audienceId?: string;
  audienceName?: string;
  audienceCount: number;
  filterGroup?: FilterGroup;
  sendType: "now" | "scheduled";
  scheduledDate?: string;
  scheduledTime?: string;
  timezone?: string;
  throttlingLimit?: number;
  clientAccountId: string;
  projectId: string;
}

function firstNonEmpty(...values: Array): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function toSentence(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function buildAudienceDescriptor(launchData: LaunchData): string {
  if (launchData.audienceType === "all") {
    return "all eligible contacts";
  }

  if (launchData.audienceType === "filters") {
    return "the filtered audience";
  }

  if (launchData.audienceName?.trim()) {
    return `${launchData.audienceType} "${launchData.audienceName.trim()}"`;
  }

  return `the selected ${launchData.audienceType}`;
}

function buildCampaignContextFromProject(args: {
  campaignIntent: CampaignIntent;
  template: TemplateData;
  launchData: LaunchData;
}) {
  const { campaignIntent, template, launchData } = args;
  const projectName = firstNonEmpty(campaignIntent.projectName, campaignIntent.campaignName, "the client project");
  const clientName = firstNonEmpty(campaignIntent.clientName);
  const projectDescription = firstNonEmpty(campaignIntent.projectDescription);
  const audienceDescriptor = buildAudienceDescriptor(launchData);
  const landingPageUrl = firstNonEmpty(template.ctaUrl, campaignIntent.projectLandingPageUrl);
  const objective = toSentence(
    `Drive qualified email engagement for ${projectName}${clientName ? ` on behalf of ${clientName}` : ""}`
  );
  const productServiceInfo = projectDescription
    ? toSentence(projectDescription)
    : toSentence(
        `${campaignIntent.campaignName} should stay tightly aligned to the approved ${projectName} brief and email message`
      );
  const targetAudienceDescription = toSentence(
    `${audienceDescriptor} selected for ${clientName || "the client"}${projectName ? ` around ${projectName}` : ""}`
  );
  const successCriteria = toSentence(
    `Generate qualified replies, clicks, or registrations that show real interest in ${projectName}`
  );
  const talkingPoints = [
    projectName ? `Project focus: ${projectName}` : "",
    projectDescription ? toSentence(projectDescription) : "",
    template.subject ? `Subject line theme: ${template.subject}` : "",
    audienceDescriptor ? `Audience: ${audienceDescriptor}` : "",
    landingPageUrl ? `Primary CTA URL: ${landingPageUrl}` : "",
  ].filter(Boolean);

  return {
    campaignObjective: objective,
    productServiceInfo,
    targetAudienceDescription,
    successCriteria,
    talkingPoints: talkingPoints.length > 0 ? talkingPoints : undefined,
    landingPageUrl: landingPageUrl || undefined,
  };
}

type BuilderPage = "intent" | "template" | "audience";

interface SimpleCampaignBuilderProps {
  onCancel?: () => void;
  onSuccess?: (campaignId: string) => void;
  // Organization settings for footer (overridden by org intelligence when available)
  organizationName?: string;
  organizationAddress?: string;
  // For editing existing campaigns
  campaignId?: string;
  initialCampaign?: any;
}

export function SimpleCampaignBuilder({
  onCancel,
  onSuccess,
  organizationName = "Your Company",
  organizationAddress = "123 Business St, City, State 12345",
  campaignId,
  initialCampaign,
}: SimpleCampaignBuilderProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState("intent");
  const [campaignIntent, setCampaignIntent] = useState(null);
  const [template, setTemplate] = useState(null);

  const isEditMode = !!campaignId && !!initialCampaign;

  // Initialize state from existing campaign when editing
  useEffect(() => {
    if (initialCampaign) {
      setCampaignIntent({
        campaignName: initialCampaign.name || "",
        senderProfileId: initialCampaign.senderProfileId || "",
        senderName: initialCampaign.senderName || "",
        fromEmail: initialCampaign.fromEmail || "",
        replyToEmail: initialCampaign.replyToEmail || "",
        subject: initialCampaign.emailSubject || "",
        preheader: initialCampaign.emailPreheader || "",
        // Client & project preserved from campaign record
        clientAccountId: initialCampaign.clientAccountId || "",
        clientName: initialCampaign.clientName || "",
        projectId: initialCampaign.projectId || "",
        projectName: initialCampaign.projectName || "",
        projectDescription: initialCampaign.projectDescription,
        projectLandingPageUrl: initialCampaign.landingPageUrl || "",
        campaignOrganizationId: initialCampaign.problemIntelligenceOrgId,
      });

      const htmlContent = initialCampaign.emailHtmlContent || "";
      setTemplate({
        subject: initialCampaign.emailSubject || "",
        preheader: initialCampaign.emailPreheader || "",
        bodyContent: htmlContent,
        htmlContent: htmlContent,
        ctaUrl: initialCampaign.landingPageUrl || "",
      });
    }
  }, [initialCampaign]);

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      setLocation("/email-campaigns");
    }
  }, [onCancel, setLocation]);

  // Page 1 → Page 2
  const handleIntentComplete = useCallback((intent: CampaignIntent) => {
    setCampaignIntent(intent);
    setTemplate(prev => ({
      subject: intent.subject,
      preheader: intent.preheader || prev?.preheader || "",
      bodyContent: prev?.bodyContent || "",
      htmlContent: prev?.htmlContent || "",
      ctaUrl: intent.projectLandingPageUrl || prev?.ctaUrl || "",
    }));
    setCurrentPage("template");
  }, []);

  // Page 2 → Page 3
  const handleTemplateSave = useCallback((templateData: TemplateData) => {
    setTemplate(templateData);
    if (campaignIntent && templateData.subject !== campaignIntent.subject) {
      setCampaignIntent({ ...campaignIntent, subject: templateData.subject });
    }
    setCurrentPage("audience");

    toast({
      title: "Template saved",
      description: "Now select your audience and launch"
    });
  }, [campaignIntent, toast]);

  // Test email send
  const handleSendTest = useCallback(async (emails: string[], templateData: TemplateData) => {
    if (!campaignIntent) return;

    try {
      await apiRequest("POST", "/api/email/send-test", {
        to: emails,
        subject: templateData.subject,
        html: templateData.htmlContent,
        senderProfileId: campaignIntent.senderProfileId,
        replyToEmail: campaignIntent.replyToEmail,
      });

      toast({
        title: "Test email sent",
        description: `Sent to ${emails.join(", ")}`
      });
    } catch (error) {
      toast({
        title: "Failed to send test",
        description: "Please try again",
        variant: "destructive"
      });
    }
  }, [campaignIntent, toast]);

  // Page 3 → Complete: Create and launch campaign
  const handleLaunch = useCallback(async (launchData: LaunchData) => {
    if (!campaignIntent || !template) return;

    try {
      const audienceRefs: any = {};

      if (launchData.audienceType === "segment" && launchData.audienceId) {
        audienceRefs.segments = [launchData.audienceId];
      } else if (launchData.audienceType === "list" && launchData.audienceId) {
        audienceRefs.lists = [launchData.audienceId];
      } else if (launchData.audienceType === "filters" && launchData.filterGroup) {
        audienceRefs.filterGroup = launchData.filterGroup;
      } else if (launchData.audienceType === "all") {
        audienceRefs.allContacts = true;
      }

      const scheduleJson = launchData.sendType === "scheduled" ? {
        type: "scheduled",
        date: launchData.scheduledDate,
        time: launchData.scheduledTime,
        timezone: launchData.timezone
      } : undefined;
      const generatedContext = buildCampaignContextFromProject({
        campaignIntent,
        template,
        launchData,
      });

      const campaignPayload = {
        name: campaignIntent.campaignName,
        type: "email",
        status: launchData.sendType === "now" ? "active" : "scheduled",
        clientAccountId: launchData.clientAccountId,
        projectId: launchData.projectId,
        // Auto-link org intelligence from project's campaignOrganizationId
        problemIntelligenceOrgId: campaignIntent.campaignOrganizationId || undefined,
        landingPageUrl: generatedContext.landingPageUrl,
        campaignObjective: generatedContext.campaignObjective,
        productServiceInfo: generatedContext.productServiceInfo,
        targetAudienceDescription: generatedContext.targetAudienceDescription,
        successCriteria: generatedContext.successCriteria,
        talkingPoints: generatedContext.talkingPoints,
        audienceRefs,
        emailSubject: template.subject,
        emailHtmlContent: template.htmlContent,
        emailPreheader: template.preheader,
        senderProfileId: campaignIntent.senderProfileId,
        senderName: campaignIntent.senderName,
        fromEmail: campaignIntent.fromEmail,
        replyToEmail: campaignIntent.replyToEmail,
        campaignProviderId: campaignIntent.campaignProviderId,
        campaignProviderName: campaignIntent.campaignProviderName,
        campaignProviderKey: campaignIntent.campaignProviderKey,
        domainAuthId: campaignIntent.domainAuthId,
        domainName: campaignIntent.domainName,
        scheduleJson,
        throttlingLimit: launchData.throttlingLimit || undefined
      };

      let campaign;

      if (isEditMode && campaignId) {
        const response = await apiRequest("PATCH", `/api/campaigns/${campaignId}`, campaignPayload);
        campaign = await response.json();
      } else {
        const response = await apiRequest("POST", "/api/campaigns", campaignPayload);
        campaign = await response.json();
      }

      if (launchData.sendType === "now" && campaign.id) {
        await apiRequest("POST", `/api/campaigns/${campaign.id}/send`);
      }

      toast({
        title: launchData.sendType === "now" ? "Campaign launched!" : "Campaign scheduled!",
        description: launchData.sendType === "now"
          ? `Sending to ${launchData.audienceCount.toLocaleString()} recipients`
          : `Scheduled for ${launchData.scheduledDate} at ${launchData.scheduledTime}`
      });

      if (onSuccess) {
        onSuccess(campaign.id);
      } else {
        setLocation("/email-campaigns");
      }

    } catch (error) {
      console.error("Failed to launch campaign:", error);
      toast({
        title: isEditMode ? "Update failed" : "Launch failed",
        description: `There was an error ${isEditMode ? 'updating' : 'creating'} your campaign. Please try again.`,
        variant: "destructive"
      });
      throw error;
    }
  }, [campaignIntent, template, onSuccess, setLocation, toast, isEditMode, campaignId]);

  const handleBackToIntent = useCallback(() => setCurrentPage("intent"), []);
  const handleBackToTemplate = useCallback(() => setCurrentPage("template"), []);

  switch (currentPage) {
    case "intent":
      return (
        
      );

    case "template":
      if (!campaignIntent) {
        setCurrentPage("intent");
        return null;
      }
      return (
        
      );

    case "audience":
      if (!campaignIntent || !template) {
        setCurrentPage("intent");
        return null;
      }
      return (
        
      );

    default:
      return null;
  }
}

export default SimpleCampaignBuilder;