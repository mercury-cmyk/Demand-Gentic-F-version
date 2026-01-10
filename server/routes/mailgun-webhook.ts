
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
  const messageId = event["message-id"] || event.messageId || null;
  const recipientEmail = event.recipient || event["recipient"] || null;

  // Look up campaign/contact/account IDs if possible (pseudo-code, adjust as needed)
  let campaignId = null;
  let contactId = null;
  let accountId = null;
  try {
    if (messageId) {
      // Example: Query your DB for campaign/contact/account by messageId or recipient
      // const result = await pool.query('SELECT campaign_id, contact_id, account_id FROM email_messages WHERE message_id = $1', [messageId]);
      // if (result.rows[0]) { campaignId = result.rows[0].campaign_id; contactId = result.rows[0].contact_id; accountId = result.rows[0].account_id; }
    }
  } catch (err) {
    console.error('[MailgunWebhook] Error looking up related IDs:', err);
  }

  // Store event in mailgun_events table
  try {
    await pool.query(
      `INSERT INTO mailgun_events (event_type, message_id, recipient_email, campaign_id, contact_id, account_id, event_data) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventType, messageId, recipientEmail, campaignId, contactId, accountId, JSON.stringify(event)]
    );
  } catch (err) {
    console.error('[MailgunWebhook] Failed to insert event:', err);
  }

  res.status(200).json({ status: "ok" });
});

export default router;
