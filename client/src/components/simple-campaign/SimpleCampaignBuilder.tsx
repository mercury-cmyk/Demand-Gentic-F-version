/**
 * SimpleCampaignBuilder - Main Orchestrator for 3-Page Campaign Flow
 * 
 * Flow:
 * Page 1: Campaign Intent (name, sender, subject)
 * Page 2: Template Builder (full-screen email editor)
 * Page 3: Audience & Send (select audience, review, launch)
 * 
 * Design Philosophy:
 * - Collect intent first → design message second → execute immediately
 * - No wizards. No clutter. No cognitive overload.
 */

import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { CampaignIntentForm } from "./CampaignIntentForm";
import { SimpleTemplateBuilder } from "./SimpleTemplateBuilder";
import { AudienceSendPage } from "./AudienceSendPage";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { FilterGroup } from "@shared/filter-types";

interface CampaignIntent {
  campaignName: string;
  senderProfileId: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  subject: string;
}

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
  throttlingLimit?: number; // Max emails per hour for throttling (Demand Gen)
}

type BuilderPage = "intent" | "template" | "audience";

interface SimpleCampaignBuilderProps {
  onCancel?: () => void;
  onSuccess?: (campaignId: string) => void;
  // Organization settings for footer
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
  
  // Current page state
  const [currentPage, setCurrentPage] = useState<BuilderPage>("intent");
  
  // Campaign data
  const [campaignIntent, setCampaignIntent] = useState<CampaignIntent | null>(null);
  const [template, setTemplate] = useState<TemplateData | null>(null);
  
  // Track if we're in edit mode
  const isEditMode = !!campaignId && !!initialCampaign;
  
  // Initialize state from existing campaign when editing
  useEffect(() => {
    if (initialCampaign) {
      // Populate intent from campaign
      setCampaignIntent({
        campaignName: initialCampaign.name || "",
        senderProfileId: initialCampaign.senderProfileId || "",
        senderName: initialCampaign.senderName || "",
        fromEmail: initialCampaign.fromEmail || "",
        replyToEmail: initialCampaign.replyToEmail || "",
        subject: initialCampaign.emailSubject || "",
      });
      
      // Populate template from campaign
      // Use htmlContent for bodyContent when editing (they're the same for branded templates)
      const htmlContent = initialCampaign.emailHtmlContent || "";
      setTemplate({
        subject: initialCampaign.emailSubject || "",
        preheader: initialCampaign.emailPreheader || "",
        bodyContent: htmlContent, // Use HTML content as body content for editing
        htmlContent: htmlContent,
      });
    }
  }, [initialCampaign]);
  
  // Handle cancel - go back to campaigns list
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      setLocation("/email-campaigns");
    }
  }, [onCancel, setLocation]);
  
  // Page 1 → Page 2: Save intent, go to template builder
  const handleIntentComplete = useCallback((intent: CampaignIntent) => {
    setCampaignIntent(intent);
    // Pre-populate template with subject from intent
    setTemplate(prev => ({
      subject: intent.subject,
      preheader: prev?.preheader || "",
      bodyContent: prev?.bodyContent || "",
      htmlContent: prev?.htmlContent || ""
    }));
    setCurrentPage("template");
  }, []);
  
  // Page 2 → Page 3: Save template, go to audience selection
  const handleTemplateSave = useCallback((templateData: TemplateData) => {
    setTemplate(templateData);
    // Update subject in intent if changed
    if (campaignIntent && templateData.subject !== campaignIntent.subject) {
      setCampaignIntent({
        ...campaignIntent,
        subject: templateData.subject
      });
    }
    setCurrentPage("audience");
    
    toast({
      title: "Template saved",
      description: "Now select your audience and launch"
    });
  }, [campaignIntent, toast]);
  
  // Page 2: Send test email
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
      // Build audience refs based on selection
      const audienceRefs: any = {};
      
      if (launchData.audienceType === "segment" && launchData.audienceId) {
        audienceRefs.segments = [launchData.audienceId];
      } else if (launchData.audienceType === "list" && launchData.audienceId) {
        audienceRefs.lists = [launchData.audienceId];
      } else if (launchData.audienceType === "filters" && launchData.filterGroup) {
        audienceRefs.filterGroup = launchData.filterGroup;
      }
      // For "all", audienceRefs stays empty (will select all contacts)
      
      // Build schedule config
      const scheduleJson = launchData.sendType === "scheduled" ? {
        type: "scheduled",
        date: launchData.scheduledDate,
        time: launchData.scheduledTime,
        timezone: launchData.timezone
      } : undefined;
      
      // Build throttling config for Demand Gen (warm-up/safety)
      // Pass throttlingLimit directly for API consumption
      // Demand Gen: Explicit overrides for identity & reply management
      const campaignPayload = {
        name: campaignIntent.campaignName,
        type: "email",
        status: launchData.sendType === "now" ? "active" : "scheduled",
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
        // Update existing campaign
        const response = await apiRequest("PATCH", `/api/campaigns/${campaignId}`, campaignPayload);
        campaign = await response.json();
      } else {
        // Create new campaign
        const response = await apiRequest("POST", "/api/campaigns", campaignPayload);
        campaign = await response.json();
      }
      
      // If send now, trigger send
      if (launchData.sendType === "now" && campaign.id) {
        await apiRequest("POST", `/api/campaigns/${campaign.id}/send`);
      }
      
      toast({
        title: launchData.sendType === "now" ? "Campaign launched!" : "Campaign scheduled!",
        description: launchData.sendType === "now" 
          ? `Sending to ${launchData.audienceCount.toLocaleString()} recipients`
          : `Scheduled for ${launchData.scheduledDate} at ${launchData.scheduledTime}`
      });
      
      // Callback or redirect
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
  
  // Navigation handlers
  const handleBackToIntent = useCallback(() => {
    setCurrentPage("intent");
  }, []);
  
  const handleBackToTemplate = useCallback(() => {
    setCurrentPage("template");
  }, []);
  
  // Render current page
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
        // Shouldn't happen, but safety fallback
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
        // Shouldn't happen, but safety fallback
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
