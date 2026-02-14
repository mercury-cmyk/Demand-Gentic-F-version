import { db } from '../db';
import { emailSends, contacts, accounts, campaigns, lists, segments } from '@shared/schema';
import { eq, inArray, and, isNull, or } from 'drizzle-orm';
import { emailTrackingService } from '../lib/email-tracking-service';
import { initializeEmailQueue, type EmailJobData } from '../workers/email-worker';
import { checkCampaignSuppression } from '../lib/campaign-suppression';
import { buildFilterQuery, type FilterGroup } from '../filter-builder';

export interface BulkEmailRecipient {
  email: string;
  contactId: string;
  customVariables?: Record<string, string>;
}

export interface BulkEmailOptions {
  campaignId: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  preheader?: string;
  recipients: BulkEmailRecipient[];
  tags?: string[];
  espAdapter?: string;
  batchSize?: number;
  delayBetweenBatches?: number;
}

export interface BulkEmailResult {
  total: number;
  enqueued: number;
  sent: number;
  failed: number;
  suppressed: number;
  errors: Array<{ email: string; error: string }>;
}

function injectPreheader(html: string, preheader?: string): string {
  if (!preheader) return html;

  const preheaderHtml = `
    <div style="display:none;font-size:1px;color:#fefefe;line-height:1px;font-family: Arial, sans-serif; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
      ${preheader}
    </div>
  `;

  const bodyIndex = html.indexOf('</head>');
  if (bodyIndex !== -1) {
    return html.slice(0, bodyIndex) + preheaderHtml + html.slice(bodyIndex);
  }

  return preheaderHtml + html;
}

export async function queueBulkEmails(options: BulkEmailOptions): Promise<BulkEmailResult> {
  const {
    campaignId,
    from,
    fromName,
    replyTo,
    subject,
    html,
    preheader,
    text,
    recipients,
    tags = [],
    espAdapter,
  } = options;

  const result: BulkEmailResult = {
    total: recipients.length,
    enqueued: 0,
    sent: 0,
    failed: 0,
    suppressed: 0,
    errors: [],
  };

  console.log(`[Bulk Email] Processing ${recipients.length} recipients for campaign ${campaignId}`);

  for (const recipient of recipients) {
    try {
      if (!recipient.contactId) continue;

      const suppression = await checkCampaignSuppression(campaignId, recipient.contactId);
      if (suppression.suppressed) {
        result.suppressed++;
        console.log(`[Bulk Email] Skipping suppressed contact ${recipient.contactId}: ${suppression.reason}`);
        continue;
      }

      const [emailSendRecord] = await db
        .insert(emailSends)
        .values({
          campaignId,
          contactId: recipient.contactId,
          status: 'pending',
          sendAt: new Date(),
          provider: espAdapter || 'mailgun',
        })
        .returning();

      const unsubscribeUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/unsubscribe/${emailSendRecord.id}`;
      const htmlWithPreheader = injectPreheader(html, preheader);
      
      // Replace merge tags with contact variables before tracking
      let renderedHtml = htmlWithPreheader
        .replace(/\[UNSUBSCRIBE_LINK\]/g, unsubscribeUrl)
        .replace(/\{\{\s*unsubscribeUrl\s*\}\}/gi, unsubscribeUrl);

      if (recipient.customVariables) {
        for (const [key, value] of Object.entries(recipient.customVariables)) {
          const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
          renderedHtml = renderedHtml.replace(pattern, value);
        }
      }

      // Also replace subject merge tags
      let personalizedSubject = subject;
      if (recipient.customVariables) {
        for (const [key, value] of Object.entries(recipient.customVariables)) {
          const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
          personalizedSubject = personalizedSubject.replace(pattern, value);
        }
      }

      const finalHtml = emailTrackingService.applyTracking(renderedHtml, {
        messageId: emailSendRecord.id,
        recipientEmail: recipient.email,
      });

      // Initialize/get the email queue (lazy initialization)
      const queue = initializeEmailQueue();
      await queue.add(`send-${emailSendRecord.id}`, {
        sendId: emailSendRecord.id,
        options: {
          to: recipient.email,
          from,
          fromName,
          replyTo,
          subject: personalizedSubject,
          html: finalHtml,
          text,
          espAdapter,
          listUnsubscribeUrl: unsubscribeUrl,
          campaignId,
          contactId: recipient.contactId,
          sendId: emailSendRecord.id,
          tags: [...tags, 'bulk-send'],
          customVariables: recipient.customVariables,
        }
      });
      result.enqueued++;
      result.sent++;
    } catch (error: any) {
      result.failed++;
      result.errors.push({
        email: recipient.email,
        error: error.message || 'Unknown error',
      });
      console.error(`[Bulk Email] Failed to enqueue ${recipient.email}:`, error);
    }
  }

  console.log(`[Bulk Email] Finished: ${result.enqueued} enqueued, ${result.suppressed} suppressed, ${result.failed} failed`);

  return result;
}

export const sendBulkEmails = queueBulkEmails;

/**
 * Send campaign emails to all contacts in campaign audience
 */
export async function sendCampaignEmails(campaignId: string): Promise<BulkEmailResult> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  if (!campaign.emailSubject || !campaign.emailHtmlContent) {
    throw new Error('Campaign missing required email content');
  }

  // Resolve campaign audience from audienceRefs (filterGroup, lists, segments)
  const audienceRefs = campaign.audienceRefs as any;
  const uniqueContactIds = new Set<string>();
  let campaignContacts: any[] = [];

  // Resolve from filterGroup (advanced filters)
  if (audienceRefs?.filterGroup) {
    console.log(`[sendCampaignEmails] Resolving contacts from filterGroup for campaign ${campaignId}`);
    const filterSQL = buildFilterQuery(audienceRefs.filterGroup as FilterGroup, contacts);
    if (filterSQL) {
      const audienceContacts = await db.select()
        .from(contacts)
        .where(filterSQL);
      audienceContacts.forEach(c => uniqueContactIds.add(c.id));
    }
  }

  // Resolve from lists
  const listIds = audienceRefs?.lists || audienceRefs?.selectedLists || [];
  if (listIds.length > 0) {
    for (const listId of listIds) {
      const [list] = await db.select()
        .from(lists)
        .where(eq(lists.id, listId))
        .limit(1);

      if (list && list.recordIds && Array.isArray(list.recordIds) && list.recordIds.length > 0) {
        list.recordIds.forEach((id: string) => uniqueContactIds.add(id));
      }
    }
  }

  // Resolve from segments
  const segmentIds = audienceRefs?.segments || audienceRefs?.selectedSegments || [];
  if (segmentIds.length > 0) {
    for (const segmentId of segmentIds) {
      const [segment] = await db.select()
        .from(segments)
        .where(eq(segments.id, segmentId))
        .limit(1);

      if (segment && segment.definitionJson) {
        const filterSQL = buildFilterQuery(segment.definitionJson as FilterGroup, contacts);
        if (filterSQL) {
          const segmentContacts = await db.select()
            .from(contacts)
            .where(filterSQL);
          segmentContacts.forEach(c => uniqueContactIds.add(c.id));
        }
      }
    }
  }

  // Convert contact IDs to full contact objects (with batching)
  if (uniqueContactIds.size > 0) {
    const contactIdsArray = Array.from(uniqueContactIds);
    const batchSize = 500;

    for (let i = 0; i < contactIdsArray.length; i += batchSize) {
      const batch = contactIdsArray.slice(i, i + batchSize);
      const batchContacts = await db.select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        fullName: contacts.fullName,
        email: contacts.email,
        jobTitle: contacts.jobTitle,
        accountId: contacts.accountId,
        company: accounts.name,
      })
        .from(contacts)
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(inArray(contacts.id, batch));
      campaignContacts.push(...batchContacts);
    }
  }

  // Remove duplicates
  const uniqueContacts = Array.from(
    new Map(campaignContacts.map(c => [c.id, c])).values()
  );

  console.log(`[sendCampaignEmails] Resolved ${uniqueContacts.length} unique contacts from audience`);

  const recipients: BulkEmailRecipient[] = uniqueContacts
    .filter(c => c.email)
    .map(contact => ({
      email: contact.email!,
      contactId: contact.id,
      customVariables: {
        first_name: contact.firstName || '',
        firstName: contact.firstName || '',
        last_name: contact.lastName || '',
        lastName: contact.lastName || '',
        full_name: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        fullName: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        name: contact.firstName || contact.fullName || '',
        company: contact.company || '',
        company_name: contact.company || '',
        companyName: contact.company || '',
        job_title: contact.jobTitle || '',
        jobTitle: contact.jobTitle || '',
      },
    }));

  return queueBulkEmails({
    campaignId,
    from: process.env.DEFAULT_FROM_EMAIL || 'noreply@example.com',
    subject: campaign.emailSubject,
    html: campaign.emailHtmlContent,
    recipients,
    tags: ['campaign', `campaign-${campaignId}`],
  });
}

/**
 * Send test email(s) - directly via Mailgun without database records
 */
export async function sendTestEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
}): Promise<{ success: boolean; messageId?: string; sent: number; error?: string }> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const apiBase = process.env.MAILGUN_API_BASE || 'https://api.mailgun.net/v3';

  if (!apiKey || !domain) {
    console.error('[Test Email] Mailgun not configured');
    return {
      success: false,
      sent: 0,
      error: 'Mailgun not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables.'
    };
  }

  const toEmails = Array.isArray(options.to) ? options.to : [options.to];
  const fromEmail = options.from || process.env.DEFAULT_FROM_EMAIL || `noreply@${domain}`;
  const from = options.fromName 
    ? `${options.fromName} <${fromEmail}>`
    : fromEmail;

  let sent = 0;
  let lastMessageId: string | undefined;
  let lastError: string | undefined;

  for (const toEmail of toEmails) {
    try {
      // Build form data for Mailgun API using FormData
      const formData = new FormData();
      formData.append('from', from);
      formData.append('to', toEmail);
      formData.append('subject', options.subject);
      formData.append('html', options.html);
      
      if (options.replyTo) {
        formData.append('h:Reply-To', options.replyTo);
      }
      
      // Add test tag
      formData.append('o:tag', 'test-email');
      
      // Enable tracking
      formData.append('o:tracking', 'yes');
      formData.append('o:tracking-clicks', 'yes');
      formData.append('o:tracking-opens', 'yes');

      const auth = Buffer.from(`api:${apiKey}`).toString('base64');
      
      console.log(`[Test Email] Sending to ${toEmail} via Mailgun...`);
      console.log(`[Test Email] HTML content length: ${options.html.length} chars`);
      console.log(`[Test Email] Has DOCTYPE: ${options.html.includes('<!DOCTYPE')}`);
      console.log(`[Test Email] First 200 chars (escaped):`, JSON.stringify(options.html.substring(0, 200)));
      
      const response = await fetch(`${apiBase}/${domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Test Email] Mailgun API error for ${toEmail}:`, response.status, errorText);
        lastError = `Mailgun error (${response.status}): ${errorText}`;
        continue;
      }

      const result = await response.json();
      lastMessageId = result.id || result.message;
      sent++;
      console.log(`[Test Email] Successfully sent to ${toEmail}, messageId: ${lastMessageId}`);
    } catch (error: any) {
      console.error(`[Test Email] Failed to send to ${toEmail}:`, error);
      lastError = error.message || 'Unknown error';
    }
  }

  return {
    success: sent > 0,
    messageId: lastMessageId,
    sent,
    error: sent === 0 ? lastError : undefined
  };
}
