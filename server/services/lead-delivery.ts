import { db } from "../db";
import { leads, campaigns, contacts, accounts, orderCampaignLinks, campaignOrders, exportTemplates } from "@shared/schema";
import { eq } from "drizzle-orm";
import { applyExportTemplate } from "../lib/apply-export-template";
import { buildCanonicalGcsUrlFromKey, canonicalizeGcsRecordingUrl } from "../lib/recording-url-policy";

interface LeadDeliveryResult {
  success: boolean;
  deliveryMethod?: string;
  destination?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Trigger lead delivery when a lead is approved
 * Finds associated campaign order via orderCampaignLinks bridge table
 * Formats lead data using export template
 * Sends to webhook URL configured in campaign order
 */
export async function triggerLeadDelivery(leadId: string): Promise<LeadDeliveryResult> {
  try {
    console.log(`[LEAD-DELIVERY] Starting delivery for lead ${leadId}`);

    // Get lead with related data
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) {
      throw new Error('Lead not found');
    }

    if (lead.qaStatus !== 'approved') {
      console.log(`[LEAD-DELIVERY] Lead ${leadId} not approved, skipping delivery`);
      return {
        success: false,
        error: 'Lead not approved',
        timestamp: new Date()
      };
    }

    // Get campaign
    const [campaign] = lead.campaignId
      ? await db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).limit(1)
      : [];

    if (!campaign) {
      console.log(`[LEAD-DELIVERY] No campaign found for lead ${leadId}`);
      return {
        success: false,
        error: 'No campaign associated with lead',
        timestamp: new Date()
      };
    }

    // Find campaign order via bridge table
    const [orderLink] = await db
      .select()
      .from(orderCampaignLinks)
      .where(eq(orderCampaignLinks.campaignId, campaign.id))
      .limit(1);

    if (!orderLink) {
      console.log(`[LEAD-DELIVERY] No campaign order linked to campaign ${campaign.id}`);
      return {
        success: false,
        error: 'No campaign order linked to this campaign',
        timestamp: new Date()
      };
    }

    // Get campaign order
    const [order] = await db
      .select()
      .from(campaignOrders)
      .where(eq(campaignOrders.id, orderLink.orderId))
      .limit(1);

    if (!order) {
      throw new Error('Campaign order not found');
    }

    // Check if webhook URL is configured
    if (!order.webhookUrl) {
      console.log(`[LEAD-DELIVERY] No webhook URL configured for order ${order.id}`);
      return {
        success: false,
        error: 'No webhook URL configured in campaign order',
        timestamp: new Date()
      };
    }

    // Get contact and account data
    const [contact] = lead.contactId
      ? await db.select().from(contacts).where(eq(contacts.id, lead.contactId)).limit(1)
      : [];

    const [account] = contact?.accountId
      ? await db.select().from(accounts).where(eq(accounts.id, contact.accountId)).limit(1)
      : [];

    // Resolve GCS recording URL for delivery payload
    const gcsRecordingUrl =
      buildCanonicalGcsUrlFromKey(lead.recordingS3Key) ||
      canonicalizeGcsRecordingUrl({ recordingUrl: lead.recordingUrl, recordingS3Key: lead.recordingS3Key });

    // Get export template if configured in campaign
    let formattedData: any = {
      leadId: lead.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      qaStatus: lead.qaStatus,
      approvedAt: lead.approvedAt,
      gcsRecordingUrl: gcsRecordingUrl || null,
      contact: contact || null,
      account: account || null,
      lead: lead
    };

    if (campaign.deliveryTemplateId) {
      console.log(`[LEAD-DELIVERY] Applying export template ${campaign.deliveryTemplateId}`);
      const [template] = await db
        .select()
        .from(exportTemplates)
        .where(eq(exportTemplates.id, campaign.deliveryTemplateId))
        .limit(1);

      if (template) {
        // Apply template to format the data
        const templateConfig = template.templateConfig as any;
        formattedData = applyTemplateFormatting(lead, contact, account, templateConfig);
      }
    }

    // Get delivery config
    const deliveryConfig = (order.deliveryConfig as any) || { method: 'webhook', format: 'json' };

    // Send webhook
    console.log(`[LEAD-DELIVERY] Sending webhook to ${order.webhookUrl}`);
    const response = await sendWebhook(order.webhookUrl, formattedData, deliveryConfig);

    if (response.success) {
      console.log(`[LEAD-DELIVERY] Successfully delivered lead ${leadId} to ${order.webhookUrl}`);
      
      // Update lead with delivery timestamp
      await db.update(leads)
        .set({
          deliveredAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(leads.id, leadId));

      return {
        success: true,
        deliveryMethod: 'webhook',
        destination: order.webhookUrl,
        timestamp: new Date()
      };
    } else {
      throw new Error(response.error || 'Webhook delivery failed');
    }

  } catch (error) {
    console.error(`[LEAD-DELIVERY] Error delivering lead ${leadId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date()
    };
  }
}

/**
 * Apply template formatting to lead data
 */
function applyTemplateFormatting(
  lead: any,
  contact: any,
  account: any,
  templateConfig: any
): any {
  const formatted: any = {};

  if (!templateConfig?.selectedFields) {
    // No template config, return raw data
    return { lead, contact, account };
  }

  // Map selected fields from template
  for (const field of templateConfig.selectedFields) {
    const { source, fieldName, alias } = field;
    const outputName = alias || fieldName;

    if (source === 'lead' && lead) {
      formatted[outputName] = lead[fieldName];
    } else if (source === 'contact' && contact) {
      formatted[outputName] = contact[fieldName];
    } else if (source === 'account' && account) {
      formatted[outputName] = account[fieldName];
    }
  }

  return formatted;
}

/**
 * Send webhook POST request with retry logic and exponential backoff
 */
async function sendWebhook(
  url: string,
  data: any,
  config: { method: string; format: string; auth?: any }
): Promise<{ success: boolean; error?: string; attempts: number }> {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 1000; // 1 second
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Pivotal-B2B-CRM/1.0'
  };

  // Add authentication if configured
  if (config.auth) {
    if (config.auth.type === 'bearer') {
      headers['Authorization'] = `Bearer ${config.auth.token}`;
    } else if (config.auth.type === 'apikey') {
      headers[config.auth.headerName || 'X-API-Key'] = config.auth.apiKey;
    } else if (config.auth.type === 'basic') {
      const credentials = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }
  }

  let lastError: string | undefined;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[LEAD-DELIVERY] Webhook attempt ${attempt}/${MAX_RETRIES} to ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `HTTP ${response.status}: ${errorText}`;
        
        // Retry on 5xx errors or 429 (rate limit)
        if ((response.status >= 500 && response.status < 600) || response.status === 429) {
          console.warn(`[LEAD-DELIVERY] Retryable error on attempt ${attempt}: ${lastError}`);
          
          if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`[LEAD-DELIVERY] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // Non-retryable error (4xx except 429)
        console.error(`[LEAD-DELIVERY] Non-retryable error: ${lastError}`);
        return {
          success: false,
          error: lastError,
          attempts: attempt
        };
      }

      console.log(`[LEAD-DELIVERY] Webhook delivered successfully on attempt ${attempt}`);
      return { 
        success: true,
        attempts: attempt
      };

    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[LEAD-DELIVERY] Network error on attempt ${attempt}: ${lastError}`);
      
      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, attempt - 1);
        console.log(`[LEAD-DELIVERY] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  // All retries exhausted
  console.error(`[LEAD-DELIVERY] All ${MAX_RETRIES} delivery attempts failed. Last error: ${lastError}`);
  return {
    success: false,
    error: `All ${MAX_RETRIES} attempts failed. Last error: ${lastError}`,
    attempts: MAX_RETRIES
  };
}
