/**
 * Mercury Bridge — Client Notification Service
 * 
 * Handles client-specific notification emails:
 * - Pipeline updates, campaign launches, leads delivered, milestones
 * - AI-generated beautiful email templates via OpenAI/DeepSeek
 * - Sends via Mercury Bridge SMTP with outbox tracking
 * - All notifications are client + campaign scoped
 */

import { db } from '../../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  clientNotifications,
  clientAccounts,
  clientUsers,
  campaigns,
  type ClientNotification,
  type InsertClientNotification,
} from '@shared/schema';
import { mercuryEmailService } from './email-service';

// ─── AI Template Generation ──────────────────────────────────────────────────

interface GenerateTemplateParams {
  notificationType: string;
  clientName: string;
  campaignName?: string;
  customPrompt?: string;
  context?: Record;
}

interface GeneratedTemplate {
  subject: string;
  htmlContent: string;
  textContent: string;
}

/**
 * Generate a beautiful, conversion-friendly email template using AI.
 */
async function generateEmailTemplate(params: GenerateTemplateParams): Promise {
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  const systemPrompt = `You are an expert email designer for a B2B demand generation platform called "Pivotal B2B / DemandGentic.ai".

Generate a professional, beautiful, conversion-friendly email notification for a client. The email must:

1. Use inline CSS only (no external stylesheets) — email-client safe
2. Be mobile-responsive with @media queries
3. Use a clean, modern design with a dark header band (#1e293b) and white card body
4. Include the Pivotal B2B branding subtly
5. Use blue (#2563eb) for CTA buttons and key accents
6. Have proper spacing, typography (system font stack), and visual hierarchy
7. Include a light gray footer with "Pivotal B2B — DemandGentic.ai Platform"
8. Be concise and professional — not salesy
9. If there's a CTA, make it clear and prominent
10. Include appropriate emoji icons where they enhance readability (sparingly)

Return ONLY valid JSON with exactly these keys:
{
  "subject": "The email subject line",
  "htmlContent": "The full HTML email markup",
  "textContent": "A plain-text fallback version"
}`;

  const contextStr = params.context
    ? Object.entries(params.context).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '';

  const userPrompt = `Generate a "${params.notificationType}" notification email for:
- Client: ${params.clientName}
${params.campaignName ? `- Campaign: ${params.campaignName}` : ''}
${contextStr ? `- Additional context:\n${contextStr}` : ''}
${params.customPrompt ? `\nSpecial instructions: ${params.customPrompt}` : ''}

Make it beautiful, clean, and professional.`;

  // Provider chain: DeepSeek (primary) → Kimi (fallback) → OpenAI (last resort)
  try {
    const OpenAI = (await import("openai")).default;
    const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;

    let client: InstanceType;
    let model: string;

    if (deepseekKey) {
      client = new OpenAI({ apiKey: deepseekKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com' });
      model = 'deepseek-chat';
    } else if (kimiKey) {
      client = new OpenAI({ apiKey: kimiKey, baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1' });
      model = process.env.KIMI_FAST_MODEL || 'moonshot-v1-8k';
    } else if (openaiKey) {
      client = new OpenAI({ apiKey: openaiKey });
      model = 'gpt-4o-mini';
    } else {
      return generateFallbackTemplate(params);
    }

    const response = await client.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return generateFallbackTemplate(params);

    const parsed = JSON.parse(content);
    return {
      subject: String(parsed.subject || ''),
      htmlContent: String(parsed.htmlContent || ''),
      textContent: String(parsed.textContent || ''),
    };
  } catch (error: any) {
    console.error('[Mercury/ClientNotification] AI generation failed:', error.message);
    return generateFallbackTemplate(params);
  }
}

/**
 * Fallback template when AI is unavailable.
 */
function generateFallbackTemplate(params: GenerateTemplateParams): GeneratedTemplate {
  const typeLabels: Record = {
    pipeline_update: 'Pipeline Update',
    campaign_launch: 'Campaign Launched',
    leads_delivered: 'New Leads Delivered',
    weekly_report: 'Weekly Performance Report',
    milestone: 'Milestone Achieved',
    custom: 'Update',
  };

  const typeLabel = typeLabels[params.notificationType] || 'Update';
  const subject = `${typeLabel} — ${params.clientName}${params.campaignName ? ` | ${params.campaignName}` : ''}`;

  const htmlContent = `





  @media only screen and (max-width: 620px) {
    .main-table { width: 100% !important; min-width: 100% !important; }
    .mobile-padding { padding: 24px 20px !important; }
    .mobile-header { padding: 40px 24px !important; }
  }



  
    
      
        
          
            ${typeLabel}
            Pivotal B2B &middot; DemandGentic.ai
          
        
        
          
            Hi ${params.clientName},
            
              We have an update for you${params.campaignName ? ` regarding ${params.campaignName}` : ''}.
            
            ${params.customPrompt ? `${params.customPrompt}` : ''}
            
              
                
                  View in Portal
                
              
            
          
        
        
          
            
              Pivotal B2B &mdash; DemandGentic.ai Platform
            
          
        
      
    
  

`;

  const textContent = `${typeLabel}\n\nHi ${params.clientName},\n\nWe have an update for you${params.campaignName ? ` regarding ${params.campaignName}` : ''}.\n\n${params.customPrompt || ''}\n\n— Pivotal B2B / DemandGentic.ai`;

  return { subject, htmlContent, textContent };
}

// ─── Client Notification CRUD + Send ─────────────────────────────────────────

export class ClientNotificationService {
  /**
   * Generate an AI-powered email template for a client notification.
   */
  async generateTemplate(params: {
    clientAccountId: string;
    campaignId?: string;
    notificationType: string;
    customPrompt?: string;
    context?: Record;
  }): Promise {
    // Fetch client info
    const [client] = await db
      .select({ name: clientAccounts.name, companyName: clientAccounts.companyName })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, params.clientAccountId))
      .limit(1);

    const clientName = client?.companyName || client?.name || 'Client';

    // Fetch campaign info if provided
    let campaignName: string | undefined;
    if (params.campaignId) {
      const [campaign] = await db
        .select({ name: campaigns.name })
        .from(campaigns)
        .where(eq(campaigns.id, params.campaignId))
        .limit(1);
      campaignName = campaign?.name;
    }

    return generateEmailTemplate({
      notificationType: params.notificationType,
      clientName,
      campaignName,
      customPrompt: params.customPrompt,
      context: params.context,
    });
  }

  /**
   * Create a notification (draft or ready-to-send).
   */
  async createNotification(params: {
    clientAccountId: string;
    campaignId?: string;
    notificationType: 'pipeline_update' | 'campaign_launch' | 'leads_delivered' | 'weekly_report' | 'milestone' | 'custom';
    subject: string;
    htmlContent: string;
    textContent?: string;
    recipientEmails: string[];
    status?: 'draft' | 'queued';
    sentBy?: string;
    aiGenerated?: boolean;
    aiPrompt?: string;
    metadata?: Record;
  }): Promise {
    const [notification] = await db.insert(clientNotifications).values({
      clientAccountId: params.clientAccountId,
      campaignId: params.campaignId || null,
      notificationType: params.notificationType,
      subject: params.subject,
      htmlContent: params.htmlContent,
      textContent: params.textContent,
      recipientEmails: params.recipientEmails,
      status: params.status || 'draft',
      sentBy: params.sentBy,
      aiGenerated: params.aiGenerated || false,
      aiPrompt: params.aiPrompt,
      metadata: params.metadata,
    }).returning();

    return notification;
  }

  /**
   * List notifications for a specific client, optionally filtered by campaign.
   */
  async listNotifications(params: {
    clientAccountId: string;
    campaignId?: string;
    limit?: number;
    offset?: number;
  }): Promise {
    const conditions = [eq(clientNotifications.clientAccountId, params.clientAccountId)];
    if (params.campaignId) {
      conditions.push(eq(clientNotifications.campaignId, params.campaignId));
    }

    const where = and(...conditions);

    const [notifications, [{ total }]] = await Promise.all([
      db.select()
        .from(clientNotifications)
        .where(where)
        .orderBy(desc(clientNotifications.createdAt))
        .limit(params.limit || 50)
        .offset(params.offset || 0),
      db.select({ total: sql`count(*)::int` })
        .from(clientNotifications)
        .where(where),
    ]);

    return { notifications, total };
  }

  /**
   * Get a single notification by ID.
   */
  async getNotification(id: string): Promise {
    const [notification] = await db
      .select()
      .from(clientNotifications)
      .where(eq(clientNotifications.id, id))
      .limit(1);
    return notification || null;
  }

  /**
   * Send a notification via Mercury Bridge.
   * Sends to all recipientEmails, tracking via the outbox.
   */
  async sendNotification(params: {
    notificationId: string;
    sentBy: string;
  }): Promise {
    const notification = await this.getNotification(params.notificationId);
    if (!notification) return { success: false, error: 'Notification not found', sentCount: 0 };
    if (notification.status === 'sent') return { success: false, error: 'Already sent', sentCount: 0 };

    const recipients = notification.recipientEmails || [];
    if (recipients.length === 0) return { success: false, error: 'No recipients', sentCount: 0 };

    // Mark as queued
    await db.update(clientNotifications)
      .set({ status: 'queued', sentBy: params.sentBy, updatedAt: new Date() })
      .where(eq(clientNotifications.id, notification.id));

    let sentCount = 0;
    let lastError: string | undefined;

    for (const recipientEmail of recipients) {
      try {
        const result = await mercuryEmailService.sendDirect({
          to: recipientEmail,
          subject: notification.subject,
          html: notification.htmlContent,
          text: notification.textContent || undefined,
        });

        if (result.success) {
          sentCount++;
        } else {
          lastError = result.error;
          console.error(`[Mercury/ClientNotification] Send failed to ${recipientEmail}: ${result.error}`);
        }
      } catch (err: any) {
        lastError = err.message;
        console.error(`[Mercury/ClientNotification] Send error to ${recipientEmail}:`, err.message);
      }
    }

    // Update status
    const finalStatus = sentCount > 0 ? 'sent' : 'failed';
    await db.update(clientNotifications).set({
      status: finalStatus,
      sentAt: sentCount > 0 ? new Date() : undefined,
      errorMessage: lastError,
      updatedAt: new Date(),
    }).where(eq(clientNotifications.id, notification.id));

    return { success: sentCount > 0, sentCount, error: lastError };
  }

  /**
   * Delete a draft notification.
   */
  async deleteNotification(id: string): Promise {
    const notification = await this.getNotification(id);
    if (!notification || notification.status === 'sent') return false;

    await db.delete(clientNotifications).where(eq(clientNotifications.id, id));
    return true;
  }

  /**
   * Resolve recipient emails for a client account.
   * Returns all active client users' emails.
   */
  async resolveClientRecipients(clientAccountId: string): Promise> {
    const users = await db
      .select({
        email: clientUsers.email,
        firstName: clientUsers.firstName,
        lastName: clientUsers.lastName,
      })
      .from(clientUsers)
      .where(
        and(
          eq(clientUsers.clientAccountId, clientAccountId),
          eq(clientUsers.isActive, true),
        )
      );

    return users.map(u => ({
      email: u.email,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
    }));
  }
}

export const clientNotificationService = new ClientNotificationService();