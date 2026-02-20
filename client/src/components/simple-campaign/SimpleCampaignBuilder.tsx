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

  const [currentPage, setCurrentPage] = useState<BuilderPage>("intent");
  const [campaignIntent, setCampaignIntent] = useState<CampaignIntent | null>(null);
  const [template, setTemplate] = useState<TemplateData | null>(null);

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
        // Client & project preserved from campaign record
        clientAccountId: initialCampaign.clientAccountId || "",
        clientName: initialCampaign.clientName || "",
        projectId: initialCampaign.projectId || "",
        projectName: initialCampaign.projectName || "",
        projectDescription: initialCampaign.projectDescription,
        campaignOrganizationId: initialCampaign.problemIntelligenceOrgId,
      });

      const htmlContent = initialCampaign.emailHtmlContent || "";
      setTemplate({
        subject: initialCampaign.emailSubject || "",
        preheader: initialCampaign.emailPreheader || "",
        bodyContent: htmlContent,
        htmlContent: htmlContent,
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
      preheader: prev?.preheader || "",
      bodyContent: prev?.bodyContent || "",
      htmlContent: prev?.htmlContent || ""
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
        senderProfileId: campaignIntent.senderProfileId
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

      const campaignPayload = {
        name: campaignIntent.campaignName,
        type: "email",
        status: launchData.sendType === "now" ? "active" : "scheduled",
        clientAccountId: launchData.clientAccountId,
        projectId: launchData.projectId,
        // Auto-link org intelligence from project's campaignOrganizationId
        problemIntelligenceOrgId: campaignIntent.campaignOrganizationId || undefined,
        audienceRefs,
        emailSubject: template.subject,
        emailHtmlContent: template.htmlContent,
        emailPreheader: template.preheader,
        senderProfileId: campaignIntent.senderProfileId,
        senderName: campaignIntent.senderName,
        replyToEmail: campaignIntent.replyToEmail,
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
        <CampaignIntentForm
          initialData={campaignIntent || undefined}
          onNext={handleIntentComplete}
          onCancel={handleCancel}
        />
      );

    case "template":
      if (!campaignIntent) {
        setCurrentPage("intent");
        return null;
      }
      return (
        <SimpleTemplateBuilder
          campaignIntent={campaignIntent}
          initialTemplate={template || undefined}
          organizationName={organizationName}
          organizationAddress={organizationAddress}
          onSave={handleTemplateSave}
          onSendTest={handleSendTest}
          onBack={handleBackToIntent}
        />
      );

    case "audience":
      if (!campaignIntent || !template) {
        setCurrentPage("intent");
        return null;
      }
      return (
        <AudienceSendPage
          campaignIntent={campaignIntent}
          template={template}
          onBack={handleBackToTemplate}
          onEditTemplate={handleBackToTemplate}
          onLaunch={handleLaunch}
        />
      );

    default:
      return null;
  }
}

export default SimpleCampaignBuilder;
