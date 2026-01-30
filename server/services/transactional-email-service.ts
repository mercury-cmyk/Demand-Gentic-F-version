/**
 * Transactional Email Service
 *
 * Handles event-triggered transactional emails via connected SMTP providers.
 *
 * Features:
 * - Event-based email triggers
 * - Template variable resolution
 * - HTML/text content rendering
 * - Async queue integration
 * - Comprehensive logging
 */

import { db } from "../db";
import {
  smtpProviders,
  transactionalEmailTemplates,
  transactionalEmailLogs,
  users,
  type SmtpProvider,
  type TransactionalEmailTemplate,
  type TransactionalEventType,
  type InsertTransactionalEmailLog,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { smtpOAuthService } from "./smtp-oauth-service";
import { queueTransactionalEmail } from "../workers/transactional-email-worker";

export interface TransactionalEmailRequest {
  eventType: TransactionalEventType;
  recipientEmail: string;
  recipientUserId?: string;
  recipientName?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, unknown>;
  triggerSource?: string;
  templateId?: string; // Optional: use specific template instead of default
  smtpProviderId?: string; // Optional: use specific provider instead of default
}

export interface TransactionalEmailResult {
  success: boolean;
  logId?: string;
  messageId?: string;
  error?: string;
  queued?: boolean;
}

export interface ResolvedEmail {
  subject: string;
  htmlContent: string;
  textContent?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

export class TransactionalEmailService {
  /**
   * Send a transactional email based on event type
   */
  async sendTransactionalEmail(request: TransactionalEmailRequest): Promise<TransactionalEmailResult> {
    try {
      // 1. Get the template (specific or default for event type)
      const template = await this.getTemplate(request.eventType, request.templateId);
      if (!template) {
        return {
          success: false,
          error: `No template found for event type: ${request.eventType}`,
        };
      }

      // 2. Get the SMTP provider (specific, template-assigned, or default)
      const provider = await this.getProvider(request.smtpProviderId, template.smtpProviderId);
      if (!provider) {
        return {
          success: false,
          error: "No active SMTP provider available",
        };
      }

      // 3. Check rate limits
      const rateLimitCheck = await smtpOAuthService.checkRateLimits(provider);
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          error: rateLimitCheck.reason,
        };
      }

      // 4. Resolve template variables
      const resolvedEmail = this.resolveTemplate(template, provider, request.variables || {});

      // 5. Create log entry
      const logEntry: InsertTransactionalEmailLog = {
        templateId: template.id,
        smtpProviderId: provider.id,
        eventType: request.eventType,
        triggerSource: request.triggerSource || "api",
        recipientEmail: request.recipientEmail,
        recipientUserId: request.recipientUserId,
        recipientName: request.recipientName,
        subject: resolvedEmail.subject,
        variablesUsed: request.variables,
        status: "pending",
        metadata: request.metadata,
      };

      const [log] = await db.insert(transactionalEmailLogs).values(logEntry).returning();

      // 6. Queue for async sending
      await queueTransactionalEmail({
        logId: log.id,
        providerId: provider.id,
        to: request.recipientEmail,
        toName: request.recipientName,
        from: resolvedEmail.fromEmail,
        fromName: resolvedEmail.fromName,
        replyTo: resolvedEmail.replyTo,
        subject: resolvedEmail.subject,
        html: resolvedEmail.htmlContent,
        text: resolvedEmail.textContent,
      });

      // Update log status to queued
      await db
        .update(transactionalEmailLogs)
        .set({ status: "queued", queuedAt: new Date() })
        .where(eq(transactionalEmailLogs.id, log.id));

      return {
        success: true,
        logId: log.id,
        queued: true,
      };
    } catch (error: any) {
      console.error("[TransactionalEmailService] Error sending email:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email immediately (synchronous, for testing)
   */
  async sendImmediate(request: TransactionalEmailRequest): Promise<TransactionalEmailResult> {
    try {
      const template = await this.getTemplate(request.eventType, request.templateId);
      if (!template) {
        return { success: false, error: `No template found for event type: ${request.eventType}` };
      }

      const provider = await this.getProvider(request.smtpProviderId, template.smtpProviderId);
      if (!provider) {
        return { success: false, error: "No active SMTP provider available" };
      }

      const rateLimitCheck = await smtpOAuthService.checkRateLimits(provider);
      if (!rateLimitCheck.allowed) {
        return { success: false, error: rateLimitCheck.reason };
      }

      const resolvedEmail = this.resolveTemplate(template, provider, request.variables || {});

      // Create log entry
      const [log] = await db.insert(transactionalEmailLogs).values({
        templateId: template.id,
        smtpProviderId: provider.id,
        eventType: request.eventType,
        triggerSource: request.triggerSource || "api_immediate",
        recipientEmail: request.recipientEmail,
        recipientUserId: request.recipientUserId,
        recipientName: request.recipientName,
        subject: resolvedEmail.subject,
        variablesUsed: request.variables,
        status: "sending",
        metadata: request.metadata,
      }).returning();

      // Send immediately
      const transporter = await smtpOAuthService.createTransporter(provider);
      const info = await transporter.sendMail({
        from: `${resolvedEmail.fromName} <${resolvedEmail.fromEmail}>`,
        to: request.recipientName
          ? `${request.recipientName} <${request.recipientEmail}>`
          : request.recipientEmail,
        replyTo: resolvedEmail.replyTo,
        subject: resolvedEmail.subject,
        html: resolvedEmail.htmlContent,
        text: resolvedEmail.textContent,
      });

      // Update log
      await db
        .update(transactionalEmailLogs)
        .set({
          status: "sent",
          messageId: info.messageId,
          sentAt: new Date(),
        })
        .where(eq(transactionalEmailLogs.id, log.id));

      // Update rate limits
      await smtpOAuthService.updateRateLimits(provider.id);

      return {
        success: true,
        logId: log.id,
        messageId: info.messageId,
      };
    } catch (error: any) {
      console.error("[TransactionalEmailService] Error sending immediate email:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get template for event type
   */
  private async getTemplate(
    eventType: TransactionalEventType,
    templateId?: string
  ): Promise<TransactionalEmailTemplate | null> {
    if (templateId) {
      const [template] = await db
        .select()
        .from(transactionalEmailTemplates)
        .where(
          and(
            eq(transactionalEmailTemplates.id, templateId),
            eq(transactionalEmailTemplates.isActive, true)
          )
        );
      return template || null;
    }

    // Get default template for event type
    const [template] = await db
      .select()
      .from(transactionalEmailTemplates)
      .where(
        and(
          eq(transactionalEmailTemplates.eventType, eventType),
          eq(transactionalEmailTemplates.isActive, true),
          eq(transactionalEmailTemplates.isDefault, true)
        )
      );

    return template || null;
  }

  /**
   * Get SMTP provider
   */
  private async getProvider(
    providerId?: string | null,
    templateProviderId?: string | null
  ): Promise<SmtpProvider | null> {
    // Priority: explicit > template-assigned > default
    const targetId = providerId || templateProviderId;

    if (targetId) {
      const [provider] = await db
        .select()
        .from(smtpProviders)
        .where(
          and(
            eq(smtpProviders.id, targetId),
            eq(smtpProviders.isActive, true),
            eq(smtpProviders.verificationStatus, "verified")
          )
        );
      if (provider) return provider;
    }

    // Fall back to default provider
    const [defaultProvider] = await db
      .select()
      .from(smtpProviders)
      .where(
        and(
          eq(smtpProviders.isActive, true),
          eq(smtpProviders.isDefault, true),
          eq(smtpProviders.verificationStatus, "verified")
        )
      );

    return defaultProvider || null;
  }

  /**
   * Resolve template variables
   */
  private resolveTemplate(
    template: TransactionalEmailTemplate,
    provider: SmtpProvider,
    variables: Record<string, string>
  ): ResolvedEmail {
    let subject = template.subject;
    let htmlContent = template.htmlContent;
    let textContent = template.textContent || "";

    // Replace variables in all content
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
      subject = subject.replace(placeholder, value);
      htmlContent = htmlContent.replace(placeholder, value);
      textContent = textContent.replace(placeholder, value);
    }

    // Handle missing variables with defaults
    const templateVars = template.variables as Array<{
      name: string;
      defaultValue?: string;
    }> || [];

    for (const varDef of templateVars) {
      if (!variables[varDef.name] && varDef.defaultValue) {
        const placeholder = new RegExp(`\\{\\{${varDef.name}\\}\\}`, "gi");
        subject = subject.replace(placeholder, varDef.defaultValue);
        htmlContent = htmlContent.replace(placeholder, varDef.defaultValue);
        textContent = textContent.replace(placeholder, varDef.defaultValue);
      }
    }

    return {
      subject,
      htmlContent,
      textContent: textContent || undefined,
      fromEmail: provider.emailAddress,
      fromName: provider.displayName || "DemandGentic",
      replyTo: provider.replyToAddress || undefined,
    };
  }

  // ==================== EVENT TRIGGERS ====================

  /**
   * Trigger welcome email for new user
   */
  async triggerWelcomeEmail(user: { id: string; email: string; firstName?: string }): Promise<TransactionalEmailResult> {
    return this.sendTransactionalEmail({
      eventType: "welcome",
      recipientEmail: user.email,
      recipientUserId: user.id,
      recipientName: user.firstName,
      variables: {
        firstName: user.firstName || "there",
        email: user.email,
      },
      triggerSource: "user_signup",
    });
  }

  /**
   * Trigger password reset email
   */
  async triggerPasswordResetEmail(
    email: string,
    resetLink: string,
    expiresIn: string = "1 hour"
  ): Promise<TransactionalEmailResult> {
    return this.sendTransactionalEmail({
      eventType: "password_reset",
      recipientEmail: email,
      variables: {
        resetLink,
        expiresIn,
      },
      triggerSource: "password_reset_request",
    });
  }

  /**
   * Trigger lead alert email
   */
  async triggerLeadAlertEmail(
    recipientEmail: string,
    leadDetails: {
      leadName: string;
      company: string;
      campaign: string;
      score?: number;
      viewLink: string;
    }
  ): Promise<TransactionalEmailResult> {
    return this.sendTransactionalEmail({
      eventType: "lead_alert",
      recipientEmail,
      variables: {
        leadName: leadDetails.leadName,
        company: leadDetails.company,
        campaign: leadDetails.campaign,
        score: leadDetails.score?.toString() || "N/A",
        viewLink: leadDetails.viewLink,
      },
      triggerSource: "qualified_lead",
    });
  }

  /**
   * Trigger campaign completed email
   */
  async triggerCampaignCompletedEmail(
    recipientEmail: string,
    campaignDetails: {
      campaignName: string;
      totalSent: number;
      totalDelivered: number;
      totalOpens: number;
      totalClicks: number;
      reportLink: string;
    }
  ): Promise<TransactionalEmailResult> {
    return this.sendTransactionalEmail({
      eventType: "campaign_completed",
      recipientEmail,
      variables: {
        campaignName: campaignDetails.campaignName,
        totalSent: campaignDetails.totalSent.toString(),
        totalDelivered: campaignDetails.totalDelivered.toString(),
        totalOpens: campaignDetails.totalOpens.toString(),
        totalClicks: campaignDetails.totalClicks.toString(),
        reportLink: campaignDetails.reportLink,
      },
      triggerSource: "campaign_completion",
    });
  }

  /**
   * Trigger report ready email
   */
  async triggerReportReadyEmail(
    recipientEmail: string,
    reportDetails: {
      reportName: string;
      reportType: string;
      downloadLink: string;
    }
  ): Promise<TransactionalEmailResult> {
    return this.sendTransactionalEmail({
      eventType: "report_ready",
      recipientEmail,
      variables: {
        reportName: reportDetails.reportName,
        reportType: reportDetails.reportType,
        downloadLink: reportDetails.downloadLink,
      },
      triggerSource: "report_generation",
    });
  }

  /**
   * Trigger generic notification email
   */
  async triggerNotificationEmail(
    recipientEmail: string,
    notification: {
      title: string;
      message: string;
      actionLabel?: string;
      actionLink?: string;
    }
  ): Promise<TransactionalEmailResult> {
    return this.sendTransactionalEmail({
      eventType: "notification",
      recipientEmail,
      variables: {
        title: notification.title,
        message: notification.message,
        actionLabel: notification.actionLabel || "View Details",
        actionLink: notification.actionLink || "#",
      },
      triggerSource: "system_notification",
    });
  }

  /**
   * Trigger 2FA code email
   */
  async triggerTwoFactorCodeEmail(
    email: string,
    code: string,
    expiresIn: string = "10 minutes"
  ): Promise<TransactionalEmailResult> {
    return this.sendTransactionalEmail({
      eventType: "two_factor_code",
      recipientEmail: email,
      variables: {
        code,
        expiresIn,
      },
      triggerSource: "two_factor_auth",
    });
  }

  // ==================== TEMPLATE MANAGEMENT ====================

  /**
   * Get all templates for an event type
   */
  async getTemplatesForEventType(eventType: TransactionalEventType): Promise<TransactionalEmailTemplate[]> {
    return db
      .select()
      .from(transactionalEmailTemplates)
      .where(eq(transactionalEmailTemplates.eventType, eventType));
  }

  /**
   * Preview a template with sample variables
   */
  async previewTemplate(
    templateId: string,
    sampleVariables: Record<string, string>
  ): Promise<{ subject: string; html: string; text?: string } | null> {
    const [template] = await db
      .select()
      .from(transactionalEmailTemplates)
      .where(eq(transactionalEmailTemplates.id, templateId));

    if (!template) return null;

    // Use a dummy provider for preview
    const dummyProvider: SmtpProvider = {
      id: "preview",
      name: "Preview",
      providerType: "gmail",
      authType: "oauth2",
      emailAddress: "preview@example.com",
      displayName: "DemandGentic",
      isActive: true,
      isDefault: false,
      verificationStatus: "verified",
      clientId: null,
      clientSecretEncrypted: null,
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      tokenExpiresAt: null,
      tokenScopes: null,
      smtpHost: null,
      smtpPort: null,
      smtpSecure: true,
      smtpUsername: null,
      smtpPasswordEncrypted: null,
      replyToAddress: null,
      dailySendLimit: 500,
      hourlySendLimit: 100,
      sentToday: 0,
      sentThisHour: 0,
      sentTodayResetAt: null,
      sentHourResetAt: null,
      lastVerifiedAt: null,
      lastVerificationError: null,
      lastUsedAt: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const resolved = this.resolveTemplate(template, dummyProvider, sampleVariables);

    return {
      subject: resolved.subject,
      html: resolved.htmlContent,
      text: resolved.textContent,
    };
  }

  // ==================== LOGGING & ANALYTICS ====================

  /**
   * Get email logs with pagination
   */
  async getLogs(options: {
    eventType?: TransactionalEventType;
    status?: string;
    recipientEmail?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = db.select().from(transactionalEmailLogs);

    if (options.eventType) {
      query = query.where(eq(transactionalEmailLogs.eventType, options.eventType)) as any;
    }
    if (options.status) {
      query = query.where(eq(transactionalEmailLogs.status, options.status)) as any;
    }
    if (options.recipientEmail) {
      query = query.where(eq(transactionalEmailLogs.recipientEmail, options.recipientEmail)) as any;
    }

    return query.limit(options.limit || 50).offset(options.offset || 0);
  }

  /**
   * Get email statistics by event type
   */
  async getStatsByEventType(eventType: TransactionalEventType) {
    const logs = await db
      .select()
      .from(transactionalEmailLogs)
      .where(eq(transactionalEmailLogs.eventType, eventType));

    const stats = {
      total: logs.length,
      sent: logs.filter((l) => l.status === "sent" || l.status === "delivered").length,
      failed: logs.filter((l) => l.status === "failed" || l.status === "bounced").length,
      pending: logs.filter((l) => l.status === "pending" || l.status === "queued" || l.status === "sending").length,
    };

    return stats;
  }
}

// Export singleton instance
export const transactionalEmailService = new TransactionalEmailService();
