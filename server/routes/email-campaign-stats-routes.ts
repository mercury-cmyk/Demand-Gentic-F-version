import { Router } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import {
  campaigns,
  emailSends,
  emailEvents,
} from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

const router = Router();

function toInt(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) return Number(value);
  return 0;
}

function parseLimit(value: unknown, fallback = 100, max = 500): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

async function getCampaignEmailStats(campaignId: string) {
  const [sendStats] = await db
    .select({
      totalSent: sql<number>`COUNT(*)::int`,
      delivered: sql<number>`COUNT(CASE WHEN ${emailSends.status} = 'sent' THEN 1 END)::int`,
      bounced: sql<number>`COUNT(CASE WHEN ${emailSends.status} = 'bounced' THEN 1 END)::int`,
      failed: sql<number>`COUNT(CASE WHEN ${emailSends.status} = 'failed' THEN 1 END)::int`,
    })
    .from(emailSends)
    .where(eq(emailSends.campaignId, campaignId));

  const [eventStats] = await db
    .select({
      totalOpens: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'opened' THEN 1 END)::int`,
      uniqueOpens: sql<number>`COUNT(DISTINCT CASE WHEN ${emailEvents.type} = 'opened' THEN ${emailEvents.recipient} END)::int`,
      totalClicks: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'clicked' THEN 1 END)::int`,
      uniqueClicks: sql<number>`COUNT(DISTINCT CASE WHEN ${emailEvents.type} = 'clicked' THEN ${emailEvents.recipient} END)::int`,
      unsubscribed: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'unsubscribed' THEN 1 END)::int`,
      spamComplaints: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'complained' THEN 1 END)::int`,
      hardBounces: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'bounced' AND ${emailEvents.bounceType} = 'hard' THEN 1 END)::int`,
      softBounces: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'bounced' AND ${emailEvents.bounceType} = 'soft' THEN 1 END)::int`,
    })
    .from(emailEvents)
    .where(eq(emailEvents.campaignId, campaignId));

  return {
    totalSent: toInt(sendStats?.totalSent),
    delivered: toInt(sendStats?.delivered),
    bounced: toInt(sendStats?.bounced),
    failed: toInt(sendStats?.failed),
    totalOpens: toInt(eventStats?.totalOpens),
    uniqueOpens: toInt(eventStats?.uniqueOpens),
    totalClicks: toInt(eventStats?.totalClicks),
    uniqueClicks: toInt(eventStats?.uniqueClicks),
    unsubscribed: toInt(eventStats?.unsubscribed),
    spamComplaints: toInt(eventStats?.spamComplaints),
    hardBounces: toInt(eventStats?.hardBounces),
    softBounces: toInt(eventStats?.softBounces),
  };
}

/**
 * Get email campaign statistics
 * GET /api/campaigns/:campaignId/email-stats
 */
router.get('/:campaignId/email-stats', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    const stats = await getCampaignEmailStats(campaignId);

    const deliveryRate = stats.totalSent > 0 ? stats.delivered / stats.totalSent : 0;
    const openRate = stats.delivered > 0 ? stats.uniqueOpens / stats.delivered : 0;
    const clickRate = stats.delivered > 0 ? stats.uniqueClicks / stats.delivered : 0;
    const clickToOpenRate = stats.uniqueOpens > 0 ? stats.uniqueClicks / stats.uniqueOpens : 0;
    const bounceRate = stats.totalSent > 0 ? stats.bounced / stats.totalSent : 0;
    const unsubscribeRate = stats.delivered > 0 ? stats.unsubscribed / stats.delivered : 0;

    res.json({
      campaignId,
      campaignName: campaign.name,
      status: campaign.status,
      sentAt: campaign.launchedAt,
      totalSent: stats.totalSent,
      delivered: stats.delivered,
      opened: stats.totalOpens,
      uniqueOpens: stats.uniqueOpens,
      clicked: stats.totalClicks,
      uniqueClicks: stats.uniqueClicks,
      bounced: stats.bounced,
      failed: stats.failed,
      hardBounces: stats.hardBounces,
      softBounces: stats.softBounces,
      unsubscribed: stats.unsubscribed,
      spamComplaints: stats.spamComplaints,
      deliveryRate,
      openRate,
      clickRate,
      clickToOpenRate,
      bounceRate,
      unsubscribeRate,
    });
  } catch (error: any) {
    console.error('[EMAIL-STATS] Error:', error);
    res.status(500).json({ message: 'Failed to fetch email stats' });
  }
});

/**
 * Get link click statistics
 * GET /api/campaigns/:campaignId/link-stats
 */
router.get('/:campaignId/link-stats', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const linkStats = await db.execute(sql`
      SELECT
        COALESCE(
          NULLIF(ev.metadata->>'url', ''),
          NULLIF(ev.metadata->'url'->>'original', ''),
          NULLIF(ev.metadata->'url'->>'href', ''),
          NULLIF(ev.metadata->>'linkUrl', ''),
          NULLIF(ev.metadata->>'link_url', ''),
          'unknown'
        ) AS url,
        COUNT(*)::int AS clicks,
        COUNT(DISTINCT ev.recipient)::int AS "uniqueClicks"
      FROM email_events ev
      WHERE ev.campaign_id = ${campaignId}
        AND ev.type = 'clicked'
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `);

    const totalClicks = (linkStats.rows as any[]).reduce((sum, row) => sum + toInt(row.clicks), 0);

    res.json((linkStats.rows as any[]).map((row) => ({
      url: row.url,
      clicks: toInt(row.clicks),
      uniqueClicks: toInt(row.uniqueClicks),
      percentage: totalClicks > 0 ? (toInt(row.clicks) / totalClicks) * 100 : 0,
    })));
  } catch (error: any) {
    console.error('[LINK-STATS] Error:', error);
    res.status(500).json({ message: 'Failed to fetch link stats' });
  }
});

/**
 * Get device statistics
 * GET /api/campaigns/:campaignId/device-stats
 */
router.get('/:campaignId/device-stats', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const deviceStats = await db.execute(sql`
      SELECT
        COALESCE(
          NULLIF(LOWER(ev.metadata->'client-info'->>'device-type'), ''),
          NULLIF(LOWER(ev.metadata->'client-info'->>'client-type'), ''),
          NULLIF(LOWER(ev.metadata->>'deviceType'), ''),
          'unknown'
        ) AS device,
        COUNT(*)::int AS count
      FROM email_events ev
      WHERE ev.campaign_id = ${campaignId}
        AND ev.type = 'opened'
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `);

    const total = (deviceStats.rows as any[]).reduce((sum, row) => sum + toInt(row.count), 0);

    res.json((deviceStats.rows as any[]).map((row) => ({
      device: row.device || 'unknown',
      count: toInt(row.count),
      percentage: total > 0 ? (toInt(row.count) / total) * 100 : 0,
    })));
  } catch (error: any) {
    console.error('[DEVICE-STATS] Error:', error);
    res.status(500).json({ message: 'Failed to fetch device stats' });
  }
});

/**
 * Get engagement timeline
 * GET /api/campaigns/:campaignId/engagement-timeline
 */
router.get('/:campaignId/engagement-timeline', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { range = '7d' } = req.query;

    let startDate = new Date();
    switch (range) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'all':
        startDate = new Date('2020-01-01');
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
        break;
    }

    const groupByInterval = range === '24h' ? 'hour' : 'day';

    const timelineRows = await db.execute(sql`
      SELECT
        date_trunc(${sql.raw(groupByInterval)}, ev.created_at) AS timestamp,
        COUNT(CASE WHEN ev.type = 'opened' THEN 1 END)::int AS opens,
        COUNT(CASE WHEN ev.type = 'clicked' THEN 1 END)::int AS clicks
      FROM email_events ev
      WHERE ev.campaign_id = ${campaignId}
        AND ev.type IN ('opened', 'clicked')
        AND ev.created_at >= ${startDate.toISOString()}
      GROUP BY 1
      ORDER BY 1
    `);

    let cumulativeOpens = 0;
    let cumulativeClicks = 0;

    const result = (timelineRows.rows as any[]).map((row) => {
      const opens = toInt(row.opens);
      const clicks = toInt(row.clicks);
      cumulativeOpens += opens;
      cumulativeClicks += clicks;

      return {
        timestamp: row.timestamp?.toISOString?.() || row.timestamp,
        opens,
        clicks,
        cumulative_opens: cumulativeOpens,
        cumulative_clicks: cumulativeClicks,
      };
    });

    res.json(result);
  } catch (error: any) {
    console.error('[TIMELINE] Error:', error);
    res.status(500).json({ message: 'Failed to fetch engagement timeline' });
  }
});

/**
 * Get recipient activity
 * GET /api/campaigns/:campaignId/recipient-activity
 */
router.get('/:campaignId/recipient-activity', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const limitNum = parseLimit(req.query.limit);

    const recipients = await db.execute(sql`
      SELECT
        es.contact_id,
        c.first_name,
        c.last_name,
        c.email,
        a.name AS company,
        CASE
          WHEN click_ev.clicked_at IS NOT NULL THEN 'clicked'
          WHEN open_ev.opened_at IS NOT NULL THEN 'opened'
          WHEN bounce_ev.bounced_at IS NOT NULL OR es.status = 'bounced' THEN 'bounced'
          WHEN es.status = 'failed' THEN 'failed'
          WHEN es.status = 'sent' THEN 'delivered'
          ELSE COALESCE(es.status, 'pending')
        END AS status,
        open_ev.opened_at,
        click_ev.clicked_at,
        COALESCE(click_counts.click_count, 0)::int AS click_count,
        open_ev.device_type
      FROM email_sends es
      JOIN contacts c ON es.contact_id = c.id
      LEFT JOIN accounts a ON c.account_id = a.id
      LEFT JOIN LATERAL (
        SELECT
          ev.created_at AS opened_at,
          COALESCE(
            NULLIF(LOWER(ev.metadata->'client-info'->>'device-type'), ''),
            NULLIF(LOWER(ev.metadata->'client-info'->>'client-type'), ''),
            NULLIF(LOWER(ev.metadata->>'deviceType'), '')
          ) AS device_type
        FROM email_events ev
        WHERE ev.campaign_id = es.campaign_id
          AND ev.type = 'opened'
          AND (
            ev.send_id = es.id
            OR ev.contact_id = es.contact_id
            OR LOWER(ev.recipient) = LOWER(c.email)
          )
        ORDER BY ev.created_at DESC
        LIMIT 1
      ) open_ev ON true
      LEFT JOIN LATERAL (
        SELECT ev.created_at AS clicked_at
        FROM email_events ev
        WHERE ev.campaign_id = es.campaign_id
          AND ev.type = 'clicked'
          AND (
            ev.send_id = es.id
            OR ev.contact_id = es.contact_id
            OR LOWER(ev.recipient) = LOWER(c.email)
          )
        ORDER BY ev.created_at DESC
        LIMIT 1
      ) click_ev ON true
      LEFT JOIN LATERAL (
        SELECT ev.created_at AS bounced_at
        FROM email_events ev
        WHERE ev.campaign_id = es.campaign_id
          AND ev.type = 'bounced'
          AND (
            ev.send_id = es.id
            OR ev.contact_id = es.contact_id
            OR LOWER(ev.recipient) = LOWER(c.email)
          )
        ORDER BY ev.created_at DESC
        LIMIT 1
      ) bounce_ev ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS click_count
        FROM email_events ev
        WHERE ev.campaign_id = es.campaign_id
          AND ev.type = 'clicked'
          AND (
            ev.send_id = es.id
            OR ev.contact_id = es.contact_id
            OR LOWER(ev.recipient) = LOWER(c.email)
          )
      ) click_counts ON true
      WHERE es.campaign_id = ${campaignId}
      ORDER BY COALESCE(click_ev.clicked_at, open_ev.opened_at, es.sent_at, es.created_at) DESC
      LIMIT ${limitNum}
    `);

    res.json((recipients.rows as any[]).map((row) => ({
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      company: row.company,
      status: row.status,
      openedAt: row.opened_at,
      clickedAt: row.clicked_at,
      clickCount: toInt(row.click_count),
      deviceType: row.device_type || 'unknown',
    })));
  } catch (error: any) {
    console.error('[RECIPIENT-ACTIVITY] Error:', error);
    res.status(500).json({ message: 'Failed to fetch recipient activity' });
  }
});

export default router;
