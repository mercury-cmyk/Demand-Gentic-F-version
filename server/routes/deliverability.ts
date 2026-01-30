/**
 * Deliverability Routes
 *
 * API endpoints for deliverability monitoring, blacklist checking, and health analytics.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import {
  domainAuth,
  domainHealthScores,
  blacklistMonitors,
  blacklistCheckHistory,
  domainWarmupSchedule,
  perDomainStats,
} from '../../shared/schema';
import { eq, desc, gte, and, sql } from 'drizzle-orm';
import { blacklistMonitorService, RBL_PROVIDERS } from '../services/blacklist-monitor';
import { deliverabilityScorer } from '../services/deliverability-scorer';

const router = Router();

// =============================================================================
// Dashboard Overview
// =============================================================================

/**
 * GET /api/deliverability/dashboard
 * Get overall deliverability dashboard data
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // Get all domains with their latest health scores
    const domains = await db
      .select({
        id: domainAuth.id,
        domain: domainAuth.domain,
        spfStatus: domainAuth.spfStatus,
        dkimStatus: domainAuth.dkimStatus,
        dmarcStatus: domainAuth.dmarcStatus,
      })
      .from(domainAuth);

    // Get health scores for each domain
    const domainHealthData = await Promise.all(
      domains.map(async (d) => {
        const health = await db
          .select()
          .from(domainHealthScores)
          .where(eq(domainHealthScores.domainAuthId, d.id))
          .orderBy(desc(domainHealthScores.scoredAt))
          .limit(1);

        const blacklistSummary = await blacklistMonitorService.getDomainBlacklistSummary(d.id);

        return {
          ...d,
          healthScore: health[0]?.overallScore || 0,
          authenticationScore: health[0]?.authenticationScore || 0,
          reputationScore: health[0]?.reputationScore || 0,
          engagementScore: health[0]?.engagementScore || 0,
          blacklistScore: health[0]?.blacklistScore || 100,
          warmupPhase: health[0]?.warmupPhase || 'not_started',
          blacklistListings: blacklistSummary.listedMonitors,
        };
      })
    );

    // Calculate aggregate metrics
    const totalDomains = domainHealthData.length;
    const healthyDomains = domainHealthData.filter((d) => d.healthScore >= 80).length;
    const warningDomains = domainHealthData.filter(
      (d) => d.healthScore >= 60 && d.healthScore < 80
    ).length;
    const criticalDomains = domainHealthData.filter((d) => d.healthScore < 60).length;
    const blacklistedDomains = domainHealthData.filter((d) => d.blacklistListings > 0).length;

    // Get sending stats for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sendingStats = await db
      .select({
        totalDelivered: sql<number>`COALESCE(SUM(${perDomainStats.delivered}), 0)`,
        totalBounced: sql<number>`COALESCE(SUM(${perDomainStats.bouncesHard} + ${perDomainStats.bouncesSoft}), 0)`,
        totalComplaints: sql<number>`COALESCE(SUM(${perDomainStats.complaints}), 0)`,
        totalOpens: sql<number>`COALESCE(SUM(${perDomainStats.opens}), 0)`,
        totalClicks: sql<number>`COALESCE(SUM(${perDomainStats.clicks}), 0)`,
      })
      .from(perDomainStats);

    const { totalDelivered, totalBounced, totalComplaints, totalOpens, totalClicks } =
      sendingStats[0] || {};

    const totalSent = (totalDelivered || 0) + (totalBounced || 0);

    res.json({
      summary: {
        totalDomains,
        healthyDomains,
        warningDomains,
        criticalDomains,
        blacklistedDomains,
        averageHealthScore:
          totalDomains > 0
            ? Math.round(
                domainHealthData.reduce((acc, d) => acc + d.healthScore, 0) / totalDomains
              )
            : 0,
      },
      metrics: {
        totalSent,
        delivered: totalDelivered || 0,
        bounced: totalBounced || 0,
        complaints: totalComplaints || 0,
        opens: totalOpens || 0,
        clicks: totalClicks || 0,
        deliveryRate: totalSent > 0 ? ((totalDelivered || 0) / totalSent) * 100 : 0,
        bounceRate: totalSent > 0 ? ((totalBounced || 0) / totalSent) * 100 : 0,
        complaintRate: totalSent > 0 ? ((totalComplaints || 0) / totalSent) * 100 : 0,
        openRate: totalDelivered > 0 ? ((totalOpens || 0) / totalDelivered) * 100 : 0,
        clickRate: totalDelivered > 0 ? ((totalClicks || 0) / totalDelivered) * 100 : 0,
      },
      domains: domainHealthData,
    });
  } catch (error: any) {
    console.error('Error fetching deliverability dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch deliverability dashboard' });
  }
});

// =============================================================================
// Blacklist Monitoring
// =============================================================================

/**
 * GET /api/deliverability/blacklists
 * Get all blacklist monitors and their status
 */
router.get('/blacklists', async (req: Request, res: Response) => {
  try {
    const monitors = await db
      .select({
        id: blacklistMonitors.id,
        domainAuthId: blacklistMonitors.domainAuthId,
        monitorType: blacklistMonitors.monitorType,
        monitorValue: blacklistMonitors.monitorValue,
        rblName: blacklistMonitors.rblName,
        rblDisplayName: blacklistMonitors.rblDisplayName,
        rblCategory: blacklistMonitors.rblCategory,
        status: blacklistMonitors.status,
        isListed: blacklistMonitors.isListed,
        listedSince: blacklistMonitors.listedSince,
        delistedAt: blacklistMonitors.delistedAt,
        lastCheckedAt: blacklistMonitors.lastCheckedAt,
        delistingUrl: blacklistMonitors.delistingUrl,
      })
      .from(blacklistMonitors)
      .orderBy(desc(blacklistMonitors.isListed), blacklistMonitors.rblDisplayName);

    // Group by domain
    const byDomain = new Map<number, typeof monitors>();
    for (const m of monitors) {
      if (m.domainAuthId) {
        if (!byDomain.has(m.domainAuthId)) {
          byDomain.set(m.domainAuthId, []);
        }
        byDomain.get(m.domainAuthId)!.push(m);
      }
    }

    // Get domain names
    const domainIds = Array.from(byDomain.keys());
    const domains =
      domainIds.length > 0
        ? await db
            .select({ id: domainAuth.id, domain: domainAuth.domain })
            .from(domainAuth)
            .where(sql`${domainAuth.id} IN ${domainIds}`)
        : [];

    const domainMap = new Map(domains.map((d) => [d.id, d.domain]));

    const result = Array.from(byDomain.entries()).map(([domainAuthId, monitors]) => ({
      domainAuthId,
      domain: domainMap.get(domainAuthId) || 'Unknown',
      totalMonitors: monitors.length,
      listed: monitors.filter((m) => m.isListed).length,
      clean: monitors.filter((m) => !m.isListed).length,
      monitors,
    }));

    res.json({
      summary: {
        totalMonitors: monitors.length,
        totalListed: monitors.filter((m) => m.isListed).length,
        totalClean: monitors.filter((m) => !m.isListed).length,
      },
      byDomain: result,
      availableRbls: RBL_PROVIDERS.map((r) => ({
        name: r.name,
        displayName: r.displayName,
        category: r.category,
        description: r.description,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching blacklists:', error);
    res.status(500).json({ error: 'Failed to fetch blacklists' });
  }
});

/**
 * POST /api/deliverability/blacklists/check
 * Manually trigger blacklist check for a domain or IP
 */
router.post('/blacklists/check', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      target: z.string().min(1),
      type: z.enum(['ip', 'domain']),
    });

    const { target, type } = schema.parse(req.body);

    const result =
      type === 'ip'
        ? await blacklistMonitorService.checkIpBlacklists(target)
        : await blacklistMonitorService.checkDomainBlacklists(target);

    res.json(result);
  } catch (error: any) {
    console.error('Error checking blacklists:', error);
    res.status(500).json({ error: 'Failed to check blacklists' });
  }
});

/**
 * GET /api/deliverability/blacklists/:monitorId/history
 * Get check history for a specific monitor
 */
router.get('/blacklists/:monitorId/history', async (req: Request, res: Response) => {
  try {
    const { monitorId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const history = await db
      .select()
      .from(blacklistCheckHistory)
      .where(eq(blacklistCheckHistory.monitorId, monitorId))
      .orderBy(desc(blacklistCheckHistory.checkedAt))
      .limit(limit);

    res.json(history);
  } catch (error: any) {
    console.error('Error fetching blacklist history:', error);
    res.status(500).json({ error: 'Failed to fetch blacklist history' });
  }
});

/**
 * POST /api/deliverability/blacklists/run-scheduled
 * Run scheduled blacklist checks (typically called by a cron job)
 */
router.post('/blacklists/run-scheduled', async (req: Request, res: Response) => {
  try {
    const result = await blacklistMonitorService.runScheduledBlacklistChecks();
    res.json(result);
  } catch (error: any) {
    console.error('Error running scheduled blacklist checks:', error);
    res.status(500).json({ error: 'Failed to run scheduled checks' });
  }
});

// =============================================================================
// Warmup Management
// =============================================================================

/**
 * GET /api/deliverability/warmup-schedule
 * Get warmup schedule overview for all domains
 */
router.get('/warmup-schedule', async (req: Request, res: Response) => {
  try {
    // Get all domains with their warmup status
    const domainsWithWarmup = await db
      .select({
        id: domainAuth.id,
        domain: domainAuth.domain,
      })
      .from(domainAuth);

    const warmupData = await Promise.all(
      domainsWithWarmup.map(async (d) => {
        const health = await db
          .select({
            warmupPhase: domainHealthScores.warmupPhase,
            warmupStartedAt: domainHealthScores.warmupStartedAt,
            warmupCompletedAt: domainHealthScores.warmupCompletedAt,
            dailySendTarget: domainHealthScores.dailySendTarget,
            dailySendActual: domainHealthScores.dailySendActual,
          })
          .from(domainHealthScores)
          .where(eq(domainHealthScores.domainAuthId, d.id))
          .orderBy(desc(domainHealthScores.scoredAt))
          .limit(1);

        const schedule = await db
          .select()
          .from(domainWarmupSchedule)
          .where(eq(domainWarmupSchedule.domainAuthId, d.id))
          .orderBy(domainWarmupSchedule.day);

        const currentDay = schedule.find((s) => s.status === 'in_progress');
        const completedDays = schedule.filter((s) => s.status === 'completed').length;
        const totalDays = schedule.length;

        return {
          domainId: d.id,
          domain: d.domain,
          phase: health[0]?.warmupPhase || 'not_started',
          startedAt: health[0]?.warmupStartedAt,
          completedAt: health[0]?.warmupCompletedAt,
          currentDay: currentDay?.day || 0,
          totalDays,
          completedDays,
          progress: totalDays > 0 ? (completedDays / totalDays) * 100 : 0,
          todayTarget: currentDay?.targetVolume || 0,
          todayActual: health[0]?.dailySendActual || 0,
        };
      })
    );

    res.json({
      domains: warmupData,
      summary: {
        inWarmup: warmupData.filter((d) => d.phase !== 'not_started' && d.phase !== 'completed')
          .length,
        completed: warmupData.filter((d) => d.phase === 'completed').length,
        notStarted: warmupData.filter((d) => d.phase === 'not_started').length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching warmup schedule:', error);
    res.status(500).json({ error: 'Failed to fetch warmup schedule' });
  }
});

// =============================================================================
// Health Score History
// =============================================================================

/**
 * GET /api/deliverability/health-history/:domainId
 * Get health score history for a domain
 */
router.get('/health-history/:domainId', async (req: Request, res: Response) => {
  try {
    const { domainId } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    const history = await deliverabilityScorer.getHealthScoreHistory(parseInt(domainId), days);

    res.json(history);
  } catch (error: any) {
    console.error('Error fetching health history:', error);
    res.status(500).json({ error: 'Failed to fetch health history' });
  }
});

/**
 * POST /api/deliverability/health-check/:domainId
 * Run health check for a specific domain
 */
router.post('/health-check/:domainId', async (req: Request, res: Response) => {
  try {
    const { domainId } = req.params;

    const domain = await db
      .select()
      .from(domainAuth)
      .where(eq(domainAuth.id, parseInt(domainId)))
      .limit(1);

    if (domain.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const result = await deliverabilityScorer.runDomainHealthCheck(
      parseInt(domainId),
      domain[0].domain
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error running health check:', error);
    res.status(500).json({ error: 'Failed to run health check' });
  }
});

// =============================================================================
// Sending Stats
// =============================================================================

/**
 * GET /api/deliverability/sending-stats
 * Get detailed sending statistics
 */
router.get('/sending-stats', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const domain = req.query.domain as string;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let query = db
      .select({
        day: perDomainStats.day,
        delivered: sql<number>`SUM(${perDomainStats.delivered})`,
        bouncesHard: sql<number>`SUM(${perDomainStats.bouncesHard})`,
        bouncesSoft: sql<number>`SUM(${perDomainStats.bouncesSoft})`,
        complaints: sql<number>`SUM(${perDomainStats.complaints})`,
        opens: sql<number>`SUM(${perDomainStats.opens})`,
        clicks: sql<number>`SUM(${perDomainStats.clicks})`,
      })
      .from(perDomainStats)
      .groupBy(perDomainStats.day)
      .orderBy(perDomainStats.day);

    if (domain) {
      query = query.where(eq(perDomainStats.sendingDomain, domain)) as typeof query;
    }

    const stats = await query;

    // Calculate totals
    const totals = stats.reduce(
      (acc, s) => ({
        delivered: acc.delivered + (s.delivered || 0),
        bouncesHard: acc.bouncesHard + (s.bouncesHard || 0),
        bouncesSoft: acc.bouncesSoft + (s.bouncesSoft || 0),
        complaints: acc.complaints + (s.complaints || 0),
        opens: acc.opens + (s.opens || 0),
        clicks: acc.clicks + (s.clicks || 0),
      }),
      { delivered: 0, bouncesHard: 0, bouncesSoft: 0, complaints: 0, opens: 0, clicks: 0 }
    );

    const totalSent = totals.delivered + totals.bouncesHard + totals.bouncesSoft;

    res.json({
      period: { days, startDate },
      daily: stats,
      totals: {
        ...totals,
        totalSent,
        bounceRate: totalSent > 0 ? ((totals.bouncesHard + totals.bouncesSoft) / totalSent) * 100 : 0,
        complaintRate: totalSent > 0 ? (totals.complaints / totalSent) * 100 : 0,
        openRate: totals.delivered > 0 ? (totals.opens / totals.delivered) * 100 : 0,
        clickRate: totals.delivered > 0 ? (totals.clicks / totals.delivered) * 100 : 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching sending stats:', error);
    res.status(500).json({ error: 'Failed to fetch sending stats' });
  }
});

/**
 * GET /api/deliverability/provider-breakdown
 * Get delivery stats broken down by recipient provider (Gmail, Outlook, etc.)
 */
router.get('/provider-breakdown', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await db
      .select({
        recipientProvider: perDomainStats.recipientProvider,
        delivered: sql<number>`SUM(${perDomainStats.delivered})`,
        bouncesHard: sql<number>`SUM(${perDomainStats.bouncesHard})`,
        bouncesSoft: sql<number>`SUM(${perDomainStats.bouncesSoft})`,
        complaints: sql<number>`SUM(${perDomainStats.complaints})`,
        opens: sql<number>`SUM(${perDomainStats.opens})`,
        clicks: sql<number>`SUM(${perDomainStats.clicks})`,
      })
      .from(perDomainStats)
      .groupBy(perDomainStats.recipientProvider)
      .orderBy(sql`SUM(${perDomainStats.delivered}) DESC`);

    const enrichedStats = stats.map((s) => {
      const totalSent = (s.delivered || 0) + (s.bouncesHard || 0) + (s.bouncesSoft || 0);
      return {
        ...s,
        totalSent,
        deliveryRate: totalSent > 0 ? ((s.delivered || 0) / totalSent) * 100 : 0,
        bounceRate: totalSent > 0 ? (((s.bouncesHard || 0) + (s.bouncesSoft || 0)) / totalSent) * 100 : 0,
        openRate: s.delivered > 0 ? ((s.opens || 0) / s.delivered) * 100 : 0,
        clickRate: s.delivered > 0 ? ((s.clicks || 0) / s.delivered) * 100 : 0,
      };
    });

    res.json({
      period: { days },
      providers: enrichedStats,
    });
  } catch (error: any) {
    console.error('Error fetching provider breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch provider breakdown' });
  }
});

export default router;
