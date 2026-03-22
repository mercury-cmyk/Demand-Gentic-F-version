import express from "express";
import { pool } from "../db";

const router = express.Router();

// Mailgun webhook endpoint
router.post("/mailgun/webhook", express.json(), async (req, res) => {
  const event = req.body["event-data"] || req.body;
  if (!event) {
    console.warn("[MailgunWebhook] No event-data in request body", req.body);
    return res.status(400).json({ error: "Missing event-data" });
  }

  const eventType = event.event || event["event"];
  const messageId = event.message?.headers?.["message-id"] || event["message-id"] || event.messageId || null;
  const recipientEmail = event.recipient || event["recipient"] || null;

  // Extract custom variables sent with the email (campaign_id, contact_id, send_id)
  const userVariables = event["user-variables"] || {};
  const sendId = userVariables.send_id || null;
  const eventCampaignId = userVariables.campaign_id || null;
  const eventContactId = userVariables.contact_id || null;

  // Look up the emailSends record using send_id (most reliable) or providerMessageId
  let campaignId = eventCampaignId;
  let contactId = eventContactId;
  let accountId = null;
  let emailSendId = sendId;

  try {
    if (sendId) {
      // Direct lookup by send_id (our internal email send record ID)
      const result = await pool.query(
        'SELECT id, campaign_id, contact_id FROM email_sends WHERE id = $1',
        [sendId]
      );
      if (result.rows[0]) {
        emailSendId = result.rows[0].id;
        campaignId = campaignId || result.rows[0].campaign_id;
        contactId = contactId || result.rows[0].contact_id;
      }
    } else if (messageId) {
      // Fallback: lookup by provider message ID
      const result = await pool.query(
        'SELECT id, campaign_id, contact_id FROM email_sends WHERE provider_message_id = $1 LIMIT 1',
        [messageId]
      );
      if (result.rows[0]) {
        emailSendId = result.rows[0].id;
        campaignId = campaignId || result.rows[0].campaign_id;
        contactId = contactId || result.rows[0].contact_id;
      }
    }
  } catch (err) {
    console.error('[MailgunWebhook] Error looking up emailSends record:', err);
  }

  // Store event in mailgun_events table
  try {
    await pool.query(
      `INSERT INTO mailgun_events (event_type, message_id, recipient_email, campaign_id, contact_id, account_id, event_data) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventType, messageId, recipientEmail, campaignId, contactId, accountId, JSON.stringify(event)]
    );
  } catch (err) {
    console.error('[MailgunWebhook] Failed to insert mailgun event:', err);
  }

  // Update emailSends status and add to suppression list for bounce/complaint/unsubscribe events
  try {
    if (emailSendId && (eventType === 'bounced' || eventType === 'failed')) {
      // Update email send status to bounced
      await pool.query(
        `UPDATE email_sends SET status = 'bounced' WHERE id = $1`,
        [emailSendId]
      );
      console.log(`[MailgunWebhook] Marked emailSend ${emailSendId} as bounced`);

      // Add to global suppression list (hard bounces)
      if (recipientEmail) {
        const normalizedEmail = recipientEmail.toLowerCase().trim();
        await pool.query(
          `INSERT INTO email_suppression_list (email, email_normalized, reason, campaign_id, contact_id, metadata)
           VALUES ($1, $2, 'hard_bounce', $3, $4, $5)
           ON CONFLICT (email_normalized) DO NOTHING`,
          [recipientEmail, normalizedEmail, campaignId, contactId, JSON.stringify({ eventType, messageId })]
        );
        console.log(`[MailgunWebhook] Added ${recipientEmail} to suppression list (hard_bounce)`);
      }
    }

    if (emailSendId && eventType === 'complained') {
      // Update email send status
      await pool.query(
        `UPDATE email_sends SET status = 'bounced' WHERE id = $1`,
        [emailSendId]
      );

      // Add to suppression list as spam complaint
      if (recipientEmail) {
        const normalizedEmail = recipientEmail.toLowerCase().trim();
        await pool.query(
          `INSERT INTO email_suppression_list (email, email_normalized, reason, campaign_id, contact_id, metadata)
           VALUES ($1, $2, 'spam_complaint', $3, $4, $5)
           ON CONFLICT (email_normalized) DO NOTHING`,
          [recipientEmail, normalizedEmail, campaignId, contactId, JSON.stringify({ eventType, messageId })]
        );
        console.log(`[MailgunWebhook] Added ${recipientEmail} to suppression list (spam_complaint)`);
      }
    }

    if (eventType === 'unsubscribed') {
      // Add to suppression list as unsubscribe
      if (recipientEmail) {
        const normalizedEmail = recipientEmail.toLowerCase().trim();
        await pool.query(
          `INSERT INTO email_suppression_list (email, email_normalized, reason, campaign_id, contact_id, metadata)
           VALUES ($1, $2, 'unsubscribe', $3, $4, $5)
           ON CONFLICT (email_normalized) DO NOTHING`,
          [recipientEmail, normalizedEmail, campaignId, contactId, JSON.stringify({ eventType, messageId })]
        );
        console.log(`[MailgunWebhook] Added ${recipientEmail} to suppression list (unsubscribe)`);
      }
    }

    // Also store in emailEvents table for detailed tracking
    if (emailSendId && recipientEmail) {
      const bounceType = eventType === 'bounced' ? (event.severity === 'temporary' ? 'soft' : 'hard') : null;
      await pool.query(
        `INSERT INTO email_events (send_id, campaign_id, contact_id, message_id, recipient, type, bounce_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [emailSendId, campaignId, contactId, messageId, recipientEmail, eventType, bounceType, JSON.stringify(event)]
      );
    }
  } catch (err) {
    console.error('[MailgunWebhook] Error processing event action:', err);
  }

  res.status(200).json({ status: "ok" });
});

export default router;