import { Router } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import { 
  campaigns, 
  emailOpens, 
  emailLinkClicks,
  campaignQueue,
  contacts,
  accounts
} from '@shared/schema';
import { eq, sql, and, desc, gte, count, countDistinct } from 'drizzle-orm';

const router = Router();

/**
 * Get email campaign statistics
 * GET /api/campaigns/:campaignId/email-stats
 */
router.get('/:campaignId/email-stats', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Get campaign details
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Get total sent count from campaign queue
    const [sentResult] = await db
      .select({ count: count() })
      .from(campaignQueue)
      .where(eq(campaignQueue.campaignId, campaignId));
    
    const totalSent = sentResult?.count || 0;

    // Get delivered count (sent - bounced)
    // For now, assume all sent are delivered unless marked as bounced
    const delivered = totalSent; // This should be updated with actual delivery tracking

    // Get unique opens
    const [opensResult] = await db
      .select({ 
        total: count(),
        unique: countDistinct(emailOpens.recipientEmail)
      })
      .from(emailOpens)
      .where(eq(emailOpens.messageId, campaignId));
    
    const totalOpens = opensResult?.total || 0;
    const uniqueOpens = opensResult?.unique || 0;

    // Get unique clicks
    const [clicksResult] = await db
      .select({ 
        total: count(),
        unique: countDistinct(emailLinkClicks.recipientEmail)
      })
      .from(emailLinkClicks)
      .where(eq(emailLinkClicks.messageId, campaignId));
    
    const totalClicks = clicksResult?.total || 0;
    const uniqueClicks = clicksResult?.unique || 0;

    // Calculate rates
    const deliveryRate = totalSent > 0 ? delivered / totalSent : 0;
    const openRate = delivered > 0 ? uniqueOpens / delivered : 0;
    const clickRate = delivered > 0 ? uniqueClicks / delivered : 0;
    const clickToOpenRate = uniqueOpens > 0 ? uniqueClicks / uniqueOpens : 0;

    // TODO: Implement bounce and unsubscribe tracking
    const bounced = 0;
    const hardBounces = 0;
    const softBounces = 0;
    const unsubscribed = 0;
    const spamComplaints = 0;
    const bounceRate = 0;
    const unsubscribeRate = 0;

    res.json({
      campaignId,
      campaignName: campaign.name,
      status: campaign.status,
      sentAt: campaign.launchedAt,
      totalSent,
      delivered,
      opened: totalOpens,
      uniqueOpens,
      clicked: totalClicks,
      uniqueClicks,
      bounced,
      hardBounces,
      softBounces,
      unsubscribed,
      spamComplaints,
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

    // Get click counts by URL
    const linkStats = await db
      .select({
        url: emailLinkClicks.linkUrl,
        clicks: count(),
        uniqueClicks: countDistinct(emailLinkClicks.recipientEmail),
      })
      .from(emailLinkClicks)
      .where(eq(emailLinkClicks.messageId, campaignId))
      .groupBy(emailLinkClicks.linkUrl)
      .orderBy(desc(count()));

    // Calculate total clicks for percentage
    const totalClicks = linkStats.reduce((sum, link) => sum + Number(link.clicks), 0);

    const result = linkStats.map(link => ({
      url: link.url,
      clicks: Number(link.clicks),
      uniqueClicks: Number(link.uniqueClicks),
      percentage: totalClicks > 0 ? (Number(link.clicks) / totalClicks) * 100 : 0,
    }));

    res.json(result);
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

    // Get opens by device type
    const deviceStats = await db
      .select({
        device: emailOpens.deviceType,
        count: count(),
      })
      .from(emailOpens)
      .where(eq(emailOpens.messageId, campaignId))
      .groupBy(emailOpens.deviceType);

    // Calculate total for percentage
    const total = deviceStats.reduce((sum, d) => sum + Number(d.count), 0);

    const result = deviceStats.map(d => ({
      device: d.device || 'unknown',
      count: Number(d.count),
      percentage: total > 0 ? (Number(d.count) / total) * 100 : 0,
    }));

    res.json(result);
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

    // Calculate date range
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
    }

    // Get opens over time (grouped by hour/day depending on range)
    const groupByInterval = range === '24h' ? 'hour' : 'day';
    
    // Get opens by time interval
    const opensTimeline = await db.execute(sql`
      SELECT 
        date_trunc(${groupByInterval}, opened_at) as timestamp,
        COUNT(*) as opens
      FROM email_opens
      WHERE message_id = ${campaignId}
        AND opened_at >= ${startDate.toISOString()}
      GROUP BY date_trunc(${groupByInterval}, opened_at)
      ORDER BY timestamp
    `);

    // Get clicks by time interval
    const clicksTimeline = await db.execute(sql`
      SELECT 
        date_trunc(${groupByInterval}, clicked_at) as timestamp,
        COUNT(*) as clicks
      FROM email_link_clicks
      WHERE message_id = ${campaignId}
        AND clicked_at >= ${startDate.toISOString()}
      GROUP BY date_trunc(${groupByInterval}, clicked_at)
      ORDER BY timestamp
    `);

    // Merge opens and clicks into timeline
    const timelineMap = new Map<string, { opens: number; clicks: number }>();
    
    for (const row of opensTimeline.rows as any[]) {
      const ts = row.timestamp?.toISOString() || row.timestamp;
      if (ts) {
        timelineMap.set(ts, { opens: Number(row.opens), clicks: 0 });
      }
    }
    
    for (const row of clicksTimeline.rows as any[]) {
      const ts = row.timestamp?.toISOString() || row.timestamp;
      if (ts) {
        const existing = timelineMap.get(ts) || { opens: 0, clicks: 0 };
        timelineMap.set(ts, { ...existing, clicks: Number(row.clicks) });
      }
    }

    // Convert to array and calculate cumulative
    const timeline = Array.from(timelineMap.entries())
      .map(([timestamp, data]) => ({ timestamp, ...data }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let cumulativeOpens = 0;
    let cumulativeClicks = 0;
    const result = timeline.map(item => {
      cumulativeOpens += item.opens;
      cumulativeClicks += item.clicks;
      return {
        ...item,
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
    const { limit = '100' } = req.query;

    // Get all recipients from campaign queue with their engagement
    const recipients = await db.execute(sql`
      SELECT 
        cq.contact_id,
        c.first_name,
        c.last_name,
        c.email,
        a.name as company,
        CASE 
          WHEN elc.id IS NOT NULL THEN 'clicked'
          WHEN eo.id IS NOT NULL THEN 'opened'
          ELSE 'delivered'
        END as status,
        eo.opened_at,
        elc.clicked_at,
        (SELECT COUNT(*) FROM email_link_clicks WHERE message_id = ${campaignId} AND recipient_email = c.email) as click_count,
        eo.device_type
      FROM campaign_queue cq
      JOIN contacts c ON cq.contact_id = c.id
      LEFT JOIN accounts a ON c.account_id = a.id
      LEFT JOIN LATERAL (
        SELECT id, opened_at, device_type 
        FROM email_opens 
        WHERE message_id = ${campaignId} AND recipient_email = c.email 
        ORDER BY opened_at DESC LIMIT 1
      ) eo ON true
      LEFT JOIN LATERAL (
        SELECT id, clicked_at 
        FROM email_link_clicks 
        WHERE message_id = ${campaignId} AND recipient_email = c.email 
        ORDER BY clicked_at DESC LIMIT 1
      ) elc ON true
      WHERE cq.campaign_id = ${campaignId}
      ORDER BY COALESCE(elc.clicked_at, eo.opened_at, cq.created_at) DESC
      LIMIT ${parseInt(limit as string)}
    `);

    const result = (recipients.rows as any[]).map(row => ({
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      company: row.company,
      status: row.status,
      openedAt: row.opened_at,
      clickedAt: row.clicked_at,
      clickCount: Number(row.click_count),
      deviceType: row.device_type,
    }));

    res.json(result);
  } catch (error: any) {
    console.error('[RECIPIENT-ACTIVITY] Error:', error);
    res.status(500).json({ message: 'Failed to fetch recipient activity' });
  }
});

export default router;
