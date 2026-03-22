import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth";

const router = Router();

// GET /api/campaigns/:campaignId/contacts-by-event?event=open|click|bounce
router.get("/campaigns/:campaignId/contacts-by-event", requireAuth, async (req, res) => {
  const { campaignId } = req.params;
  const { event, accountId } = req.query;
  if (!campaignId || !event) {
    return res.status(400).json({ error: "Missing campaignId or event type" });
  }

  try {
    // Query mailgun_events for contacts with this event type in this campaign, optionally filtered by account
    let query = `SELECT DISTINCT recipient_email, contact_id FROM mailgun_events WHERE campaign_id = $1 AND event_type = $2`;
    const params: any[] = [campaignId, event];
    if (accountId) {
      query += ` AND account_id = $3`;
      params.push(accountId);
    }
    const result = await pool.query(query, params);
    res.json({ contacts: result.rows });
  } catch (err) {
    console.error("[API] Failed to fetch contacts by event:", err);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

export default router;