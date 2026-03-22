/**
 * Mercury Bridge — Email Service
 * 
 * Core SMTP email sending service that wraps the existing smtpOAuthService
 * with Mercury-specific defaults (mercury@pivotal-b2b.com sender) and
 * integrates with the Mercury outbox for tracking + idempotency.
 * 
 * Safety:
 * - All sends gated behind `smtp_email_enabled` feature flag
 * - Never logs SMTP passwords or full email bodies
 * - Logs IDs + metadata only
 */

import { db } from '../../db';
import { eq, and, desc, isNull, sql, count, lt } from 'drizzle-orm';
import {
  mercuryEmailOutbox,
  mercuryTemplates,
  smtpProviders,
  type MercuryTemplate,
  type SmtpProvider,
} from '@shared/schema';
import { smtpOAuthService } from '../smtp-oauth-service';
import { isFeatureEnabled } from '../../feature-flags';
import {
  renderTemplate,
  applyDefaults,
  validateTemplateVariables,
  generateSampleVariables,
} from './template-engine';
import {
  MERCURY_DEFAULTS,
  MERCURY_COMPANY_FOOTER,
  type MercurySendRequest,
  type MercurySendResult,
  type TemplateRenderResult,
  type SmtpConnectionStatus,
} from './types';
import crypto from 'crypto';

export class MercuryEmailService {
  /**
   * Send an email directly via SMTP (bypasses outbox).
   * Used for test sends and immediate single sends.
   */
  async sendDirect(request: MercurySendRequest): Promise {
    if (!isFeatureEnabled('smtp_email_enabled')) {
      return { success: false, error: 'Mercury email sending is disabled (smtp_email_enabled flag is OFF)' };
    }

    try {
      const provider = await this.getDefaultProvider();

      let transporter;
      if (provider) {
        // Rate limit check (only for DB providers)
        const rateLimitCheck = await smtpOAuthService.checkRateLimits(provider);
        if (!rateLimitCheck.allowed) {
          return { success: false, error: `Rate limit exceeded: ${rateLimitCheck.reason}` };
        }
        transporter = await smtpOAuthService.createTransporter(provider);
      } else {
        // Fallback: use SMTP_HOST/SMTP_USER/SMTP_PASS env vars
        transporter = smtpOAuthService.createEnvTransporter();
        if (!transporter) {
          console.error('[Mercury] No SMTP provider available. Configure a provider via Mercury admin UI or set SMTP_HOST, SMTP_USER, SMTP_PASS env vars.');
          return { success: false, error: 'No active SMTP provider configured and SMTP_HOST/SMTP_USER/SMTP_PASS env vars are not set' };
        }
      }

      const mailOptions = {
        from: {
          name: request.fromName || MERCURY_DEFAULTS.fromName,
          address: request.fromEmail || (provider?.emailAddress || process.env.SMTP_USER || MERCURY_DEFAULTS.fromEmail),
        },
        to: request.to,
        cc: request.cc?.join(', '),
        bcc: request.bcc?.join(', '),
        subject: request.subject,
        html: request.html,
        text: request.text,
        replyTo: request.replyTo || MERCURY_DEFAULTS.replyTo,
        attachments: request.attachments,
      };

      const info = await transporter.sendMail(mailOptions);

      // Update rate limits (only for DB providers)
      if (provider) {
        await smtpOAuthService.updateRateLimits(provider.id);
      }

      console.log(`[Mercury] Email sent: to=${request.to}, subject="${request.subject.substring(0, 50)}...", messageId=${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: any) {
      console.error(`[Mercury] Send failed: to=${request.to}, error=${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Queue an email via the Mercury outbox for async sending.
   * Supports idempotency keys to prevent duplicate sends.
   */
  async queueEmail(params: {
    templateKey: string;
    recipientEmail: string;
    recipientName?: string;
    recipientUserId?: string;
    recipientUserType?: string;
    tenantId?: string;
    subject: string;
    html: string;
    text?: string;
    fromEmail?: string;
    fromName?: string;
    idempotencyKey?: string;
    metadata?: Record;
    scheduledAt?: Date;
  }): Promise {
    // Check idempotency — skip if key already exists
    if (params.idempotencyKey) {
      const [existing] = await db
        .select({ id: mercuryEmailOutbox.id, status: mercuryEmailOutbox.status })
        .from(mercuryEmailOutbox)
        .where(eq(mercuryEmailOutbox.idempotencyKey, params.idempotencyKey))
        .limit(1);

      if (existing) {
        console.log(`[Mercury] Idempotent skip: key=${params.idempotencyKey}, existingId=${existing.id}`);
        return { outboxId: existing.id, skipped: true };
      }
    }

    const [entry] = await db.insert(mercuryEmailOutbox).values({
      templateKey: params.templateKey,
      recipientEmail: params.recipientEmail,
      recipientName: params.recipientName,
      recipientUserId: params.recipientUserId,
      recipientUserType: params.recipientUserType || 'client',
      tenantId: params.tenantId,
      subject: params.subject,
      htmlBody: params.html,
      textBody: params.text,
      fromEmail: params.fromEmail || MERCURY_DEFAULTS.fromEmail,
      fromName: params.fromName || MERCURY_DEFAULTS.fromName,
      status: 'queued',
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
      scheduledAt: params.scheduledAt,
    }).returning();

    console.log(`[Mercury] Queued: id=${entry.id}, to=${params.recipientEmail}, template=${params.templateKey}`);
    return { outboxId: entry.id, skipped: false };
  }

  /**
   * Process queued emails from the outbox in batches.
   * Called by the background processor or explicitly by admin.
   */
  async processOutbox(batchSize: number = MERCURY_DEFAULTS.batchSize): Promise {
    if (!isFeatureEnabled('smtp_email_enabled')) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    // Recover stuck "sending" entries (older than 5 minutes) back to "queued"
    // so they can be retried. This handles cases where the process crashed mid-send.
    const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000);
    await db.update(mercuryEmailOutbox)
      .set({ status: 'queued' })
      .where(
        and(
          eq(mercuryEmailOutbox.status, 'sending'),
          sql`${mercuryEmailOutbox.createdAt}  new Date()) {
        continue;
      }

      // Mark as sending
      await db.update(mercuryEmailOutbox)
        .set({ status: 'sending' })
        .where(eq(mercuryEmailOutbox.id, entry.id));

      const result = await this.sendDirect({
        to: entry.recipientEmail,
        subject: entry.subject,
        html: entry.htmlBody,
        text: entry.textBody || undefined,
        fromEmail: entry.fromEmail,
        fromName: entry.fromName,
      });

      if (result.success) {
        await db.update(mercuryEmailOutbox).set({
          status: 'sent',
          messageId: result.messageId,
          sentAt: new Date(),
        }).where(eq(mercuryEmailOutbox.id, entry.id));
        succeeded++;
      } else {
        const newRetryCount = entry.retryCount + 1;
        const exhausted = newRetryCount >= entry.maxRetries;
        await db.update(mercuryEmailOutbox).set({
          status: exhausted ? 'failed' : 'queued',
          errorMessage: result.error,
          retryCount: newRetryCount,
          failedAt: exhausted ? new Date() : undefined,
        }).where(eq(mercuryEmailOutbox.id, entry.id));
        failed++;
      }

      // Rate limit pause between sends
      if (queued.indexOf(entry)  setTimeout(resolve, 100));
      }
    }

    return { processed: queued.length, succeeded, failed };
  }

  /**
   * Render a Mercury template with variables.
   */
  async renderTemplate(templateKey: string, variables: Record, includeFooter = true): Promise {
    const [template] = await db
      .select()
      .from(mercuryTemplates)
      .where(and(eq(mercuryTemplates.templateKey, templateKey), eq(mercuryTemplates.isEnabled, true)))
      .limit(1);

    if (!template) return null;

    const varDefs = (template.variables || []) as Array;
    const mergedVars = applyDefaults(varDefs, variables);

    const subject = renderTemplate(template.subjectTemplate, mergedVars);
    let html = renderTemplate(template.htmlTemplate, mergedVars);

    if (includeFooter) {
      html += renderTemplate(MERCURY_COMPANY_FOOTER, {
        unsubscribeUrl: mergedVars.unsubscribeUrl || '#',
        ...mergedVars,
      });
    }

    const text = template.textTemplate
      ? renderTemplate(template.textTemplate, mergedVars)
      : undefined;

    return { subject, html, text };
  }

  /**
   * Preview a template with sample data (no send).
   */
  async previewTemplate(templateKey: string, sampleVarsOverride?: Record): Promise;
  } | null> {
    const [template] = await db
      .select()
      .from(mercuryTemplates)
      .where(eq(mercuryTemplates.templateKey, templateKey))
      .limit(1);

    if (!template) return null;

    const varDefs = (template.variables || []) as Array;
    const sampleVars = sampleVarsOverride || generateSampleVariables(varDefs);

    const rendered = await this.renderTemplate(templateKey, sampleVars, true);
    if (!rendered) return null;

    return {
      template,
      rendered,
      variables: Object.entries(sampleVars).map(([name, value]) => ({ name, value })),
    };
  }

  /**
   * Send a test email using a Mercury template.
   * Logs the action for audit purposes.
   */
  async sendTestEmail(params: {
    templateKey: string;
    testRecipientEmail: string;
    testRecipientName?: string;
    variables?: Record;
    adminUserId: string;
  }): Promise {
    const rendered = await this.renderTemplate(params.templateKey, params.variables || {}, true);
    if (!rendered) {
      return { success: false, error: `Template "${params.templateKey}" not found or disabled` };
    }

    // Queue with metadata flagging as test
    const { outboxId } = await this.queueEmail({
      templateKey: params.templateKey,
      recipientEmail: params.testRecipientEmail,
      recipientName: params.testRecipientName,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `test_${params.templateKey}_${params.testRecipientEmail}_${Date.now()}`,
      metadata: {
        isTest: true,
        triggeredBy: params.adminUserId,
        triggeredAt: new Date().toISOString(),
      },
    });

    // Process immediately (test sends are synchronous)
    const processResult = await this.processOutbox(1);

    // Fetch result
    const [outboxEntry] = await db
      .select()
      .from(mercuryEmailOutbox)
      .where(eq(mercuryEmailOutbox.id, outboxId))
      .limit(1);

    return {
      success: outboxEntry?.status === 'sent',
      messageId: outboxEntry?.messageId || undefined,
      error: outboxEntry?.errorMessage || undefined,
      outboxId,
    };
  }

  /**
   * Verify SMTP connection without sending an email.
   */
  async verifyConnection(): Promise {
    const provider = await this.getDefaultProvider();

    // If we have a DB provider, test that
    if (provider) {
      try {
        await smtpOAuthService.testConnection(provider);
        return {
          configured: true,
          verified: true,
          providerName: provider.name,
          fromEmail: provider.emailAddress || MERCURY_DEFAULTS.fromEmail,
          lastVerifiedAt: new Date(),
        };
      } catch (error: any) {
        return {
          configured: true,
          verified: false,
          providerName: provider.name,
          fromEmail: provider.emailAddress || MERCURY_DEFAULTS.fromEmail,
          error: error.message,
        };
      }
    }

    // Fallback: try env-var SMTP
    const envTransporter = smtpOAuthService.createEnvTransporter();
    if (!envTransporter) {
      return {
        configured: false,
        verified: false,
        fromEmail: MERCURY_DEFAULTS.fromEmail,
        error: 'No active SMTP provider configured and SMTP_HOST/SMTP_USER/SMTP_PASS env vars are not set',
      };
    }

    try {
      await envTransporter.verify();
      return {
        configured: true,
        verified: true,
        providerName: `ENV (${process.env.SMTP_HOST})`,
        fromEmail: process.env.SMTP_USER || MERCURY_DEFAULTS.fromEmail,
        lastVerifiedAt: new Date(),
      };
    } catch (error: any) {
      return {
        configured: true,
        verified: false,
        providerName: `ENV (${process.env.SMTP_HOST})`,
        fromEmail: process.env.SMTP_USER || MERCURY_DEFAULTS.fromEmail,
        error: error.message,
      };
    }
  }

  /**
   * Get the default active SMTP provider.
   */
  async getDefaultProvider(): Promise {
    const [provider] = await db
      .select()
      .from(smtpProviders)
      .where(
        and(
          eq(smtpProviders.isActive, true),
          eq(smtpProviders.isDefault, true),
        )
      )
      .limit(1);

    if (provider) return provider;

    // Fallback: any active provider
    const [fallback] = await db
      .select()
      .from(smtpProviders)
      .where(eq(smtpProviders.isActive, true))
      .orderBy(desc(smtpProviders.createdAt))
      .limit(1);

    return fallback || null;
  }

  /**
   * Get outbox logs with pagination and filtering.
   */
  async getLogs(params: {
    status?: string;
    templateKey?: string;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }): Promise {
    const conditions = [];
    if (params.status) conditions.push(eq(mercuryEmailOutbox.status, params.status));
    if (params.templateKey) conditions.push(eq(mercuryEmailOutbox.templateKey, params.templateKey));
    if (params.tenantId) conditions.push(eq(mercuryEmailOutbox.tenantId, params.tenantId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, totalResult] = await Promise.all([
      db.select({
        id: mercuryEmailOutbox.id,
        templateKey: mercuryEmailOutbox.templateKey,
        recipientEmail: mercuryEmailOutbox.recipientEmail,
        recipientName: mercuryEmailOutbox.recipientName,
        subject: mercuryEmailOutbox.subject,
        status: mercuryEmailOutbox.status,
        messageId: mercuryEmailOutbox.messageId,
        errorMessage: mercuryEmailOutbox.errorMessage,
        retryCount: mercuryEmailOutbox.retryCount,
        metadata: mercuryEmailOutbox.metadata,
        sentAt: mercuryEmailOutbox.sentAt,
        failedAt: mercuryEmailOutbox.failedAt,
        createdAt: mercuryEmailOutbox.createdAt,
      })
        .from(mercuryEmailOutbox)
        .where(whereClause)
        .orderBy(desc(mercuryEmailOutbox.createdAt))
        .limit(params.limit || 50)
        .offset(params.offset || 0),
      db.select({ count: count() }).from(mercuryEmailOutbox).where(whereClause),
    ]);

    return { logs, total: totalResult[0]?.count || 0 };
  }

  /**
   * Retry a failed outbox entry.
   */
  async retryOutboxEntry(outboxId: string): Promise {
    const [entry] = await db
      .select()
      .from(mercuryEmailOutbox)
      .where(eq(mercuryEmailOutbox.id, outboxId))
      .limit(1);

    if (!entry) return { success: false, error: 'Outbox entry not found' };
    if (entry.status !== 'failed') return { success: false, error: 'Only failed entries can be retried' };

    await db.update(mercuryEmailOutbox).set({
      status: 'queued',
      retryCount: 0,
      errorMessage: null,
      failedAt: null,
    }).where(eq(mercuryEmailOutbox.id, outboxId));

    const result = await this.processOutbox(1);
    return { success: result.succeeded > 0, outboxId };
  }

  /**
   * Generate a secure invitation token.
   */
  generateInviteToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Singleton export
export const mercuryEmailService = new MercuryEmailService();