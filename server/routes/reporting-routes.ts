
import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  callSessions,
  callJobs,
  callDispositions,
  dispositions,
  campaigns, 
  users, 
  leads,
  contacts,
  accounts,
  agentQueue
} from "@shared/schema";
import { eq, and, gte, lte, inArray, sql, desc, isNotNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";

const router = Router();

/**
 * GET /api/reports/calls/queue/global
 * 
 * Global queue statistics across all campaigns and agents
 */
router.get('/queue/global', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.query;
    
    const conditions: any[] = [];
    if (campaignId) {
      conditions.push(eq(agentQueue.campaignId, campaignId as string));
    }
    
    // Get queue stats by status (count unique contacts, not duplicate queue entries)
    const queueStats = await db
      .select({
        status: agentQueue.queueState,
        count: sql<number>`COUNT(DISTINCT ${agentQueue.contactId})::int`,
      })
      .from(agentQueue)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(agentQueue.queueState);
    
    // Get campaign breakdown (count unique contacts, not duplicate queue entries)
    const campaignBreakdown = await db
      .select({
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        total: sql<number>`COUNT(DISTINCT ${agentQueue.contactId})::int`,
        queued: sql<number>`COUNT(DISTINCT CASE WHEN ${agentQueue.queueState} = 'queued' THEN ${agentQueue.contactId} END)::int`,
        inProgress: sql<number>`COUNT(DISTINCT CASE WHEN ${agentQueue.queueState} = 'in_progress' THEN ${agentQueue.contactId} END)::int`,
        completed: sql<number>`COUNT(DISTINCT CASE WHEN ${agentQueue.queueState} = 'completed' THEN ${agentQueue.contactId} END)::int`,
      })
      .from(agentQueue)
      .innerJoin(campaigns, eq(agentQueue.campaignId, campaigns.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(campaigns.id, campaigns.name);
    
    // Get agent breakdown (count contacts assigned to each agent)
    const agentBreakdown = await db
      .select({
        agentId: agentQueue.agentId,
        agentName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        total: sql<number>`COUNT(DISTINCT ${agentQueue.contactId})::int`,
        queued: sql<number>`COUNT(DISTINCT CASE WHEN ${agentQueue.queueState} = 'queued' THEN ${agentQueue.contactId} END)::int`,
        inProgress: sql<number>`COUNT(DISTINCT CASE WHEN ${agentQueue.queueState} = 'in_progress' THEN ${agentQueue.contactId} END)::int`,
        completed: sql<number>`COUNT(DISTINCT CASE WHEN ${agentQueue.queueState} = 'completed' THEN ${agentQueue.contactId} END)::int`,
      })
      .from(agentQueue)
      .innerJoin(users, eq(agentQueue.agentId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(agentQueue.agentId, users.firstName, users.lastName);
    
    // Calculate totals
    const totalContacts = queueStats.reduce((sum, stat) => sum + stat.count, 0);
    const queuedCount = queueStats.find(s => s.status === 'queued')?.count || 0;
    const inProgressCount = queueStats.find(s => s.status === 'in_progress')?.count || 0;
    const completedCount = queueStats.find(s => s.status === 'completed')?.count || 0;
    
    res.json({
      summary: {
        totalContacts,
        queued: queuedCount,
        inProgress: inProgressCount,
        completed: completedCount,
      },
      statusBreakdown: queueStats,
      campaignBreakdown,
      agentBreakdown,
    });
  } catch (error) {
    console.error('Error fetching queue reports:', error);
    res.status(500).json({ error: 'Failed to fetch queue reports' });
  }
});

/**
 * GET /api/reports/calls/global
 * 
 * Global dashboard call statistics across all campaigns
 */
router.get('/global', requireAuth, async (req: Request, res: Response) => {
  try {
    const { from, to, campaignId } = req.query;
    
    // Build conditions for callSessions table
    const sessionConditions: any[] = [];
    const jobConditions: any[] = [];
    
    if (from) {
      sessionConditions.push(gte(callSessions.startedAt, new Date(from as string)));
    }
    if (to) {
      sessionConditions.push(lte(callSessions.startedAt, new Date(to as string)));
    }
    if (campaignId) {
      jobConditions.push(eq(callJobs.campaignId, campaignId as string));
    }
    
    // Get call stats by disposition
    const allConditions = [...sessionConditions, ...jobConditions].filter(Boolean);
    const dispositionStats = await db
      .select({
        disposition: dispositions.label,
        dispositionAction: dispositions.systemAction,
        count: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        totalDuration: sql<number>`SUM(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined)
      .groupBy(dispositions.label, dispositions.systemAction);
    
    // Get QA stats (leads linked through contact)
    const qaConditions = [...allConditions, isNotNull(leads.qaStatus)].filter(Boolean);
    const qaStats = await db
      .select({
        qaStatus: leads.qaStatus,
        count: sql<number>`COUNT(DISTINCT ${leads.id})::int`,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(callJobs, eq(contacts.id, callJobs.contactId))
      .innerJoin(callSessions, eq(callJobs.id, callSessions.callJobId))
      .where(qaConditions.length > 0 ? and(...qaConditions) : undefined)
      .groupBy(leads.qaStatus);
    
    // Get campaign breakdown
    const campaignBreakdown = await db
      .select({
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        totalCalls: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        qualified: sql<number>`COUNT(DISTINCT CASE WHEN ${dispositions.systemAction} = 'converted_qualified' THEN ${callSessions.id} END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .innerJoin(campaigns, eq(callJobs.campaignId, campaigns.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined)
      .groupBy(campaigns.id, campaigns.name);
    
    // Get agent performance
    const agentConditions = [...allConditions, isNotNull(callJobs.agentId)].filter(Boolean);
    const agentStats = await db
      .select({
        agentId: callJobs.agentId,
        agentName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        totalCalls: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        qualified: sql<number>`COUNT(DISTINCT CASE WHEN ${dispositions.systemAction} = 'converted_qualified' THEN ${callSessions.id} END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .innerJoin(users, eq(callJobs.agentId, users.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(agentConditions.length > 0 ? and(...agentConditions) : undefined)
      .groupBy(callJobs.agentId, users.firstName, users.lastName);
    
    // Calculate totals
    const totalCalls = dispositionStats.reduce((sum, stat) => sum + stat.count, 0);
    const totalDuration = dispositionStats.reduce((sum, stat) => sum + stat.totalDuration, 0);
    
    res.json({
      summary: {
        totalCalls,
        totalDuration,
        avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
      },
      dispositions: dispositionStats,
      qaStats,
      campaignBreakdown,
      agentStats,
    });
  } catch (error) {
    console.error('Error fetching global call reports:', error);
    res.status(500).json({ error: 'Failed to fetch global call reports' });
  }
});

/**
 * GET /api/reports/calls/campaign/:campaignId
 * 
 * Campaign-level call statistics
 */
router.get('/campaign/:campaignId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { from, to } = req.query;
    
    // Build conditions
    const sessionConditions: any[] = [];
    
    if (from) {
      sessionConditions.push(gte(callSessions.startedAt, new Date(from as string)));
    }
    if (to) {
      sessionConditions.push(lte(callSessions.startedAt, new Date(to as string)));
    }
    
    // Get campaign info
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Get disposition breakdown
    const campaignConditions = [eq(callJobs.campaignId, campaignId), ...sessionConditions].filter(Boolean);
    const dispositionStats = await db
      .select({
        disposition: dispositions.label,
        dispositionAction: dispositions.systemAction,
        count: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        totalDuration: sql<number>`SUM(COALESCE(${callSessions.durationSec}, 0))::int`,
        avgDuration: sql<number>`AVG(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(campaignConditions.length > 0 ? and(...campaignConditions) : undefined)
      .groupBy(dispositions.label, dispositions.systemAction);
    
    // Get QA breakdown for this campaign
    const qaConditions = [...campaignConditions, isNotNull(leads.qaStatus)].filter(Boolean);
    const qaStats = await db
      .select({
        qaStatus: leads.qaStatus,
        count: sql<number>`COUNT(DISTINCT ${leads.id})::int`,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(callJobs, eq(contacts.id, callJobs.contactId))
      .innerJoin(callSessions, eq(callJobs.id, callSessions.callJobId))
      .where(qaConditions.length > 0 ? and(...qaConditions) : undefined)
      .groupBy(leads.qaStatus);
    
    // Get agent performance for this campaign
    const agentConditions = [...campaignConditions, isNotNull(callJobs.agentId)].filter(Boolean);
    const agentStats = await db
      .select({
        agentId: callJobs.agentId,
        agentName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        totalCalls: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        qualified: sql<number>`COUNT(DISTINCT CASE WHEN ${dispositions.systemAction} = 'converted_qualified' THEN ${callSessions.id} END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .innerJoin(users, eq(callJobs.agentId, users.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(agentConditions.length > 0 ? and(...agentConditions) : undefined)
      .groupBy(callJobs.agentId, users.firstName, users.lastName);
    
    // Get daily trend data
    const dailyTrend = await db
      .select({
        date: sql<string>`DATE(${callSessions.startedAt})`,
        totalCalls: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        qualified: sql<number>`COUNT(DISTINCT CASE WHEN ${dispositions.systemAction} = 'converted_qualified' THEN ${callSessions.id} END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(campaignConditions.length > 0 ? and(...campaignConditions) : undefined)
      .groupBy(sql`DATE(${callSessions.startedAt})`)
      .orderBy(sql`DATE(${callSessions.startedAt})`);
    
    // Calculate totals
    const totalCalls = dispositionStats.reduce((sum, stat) => sum + stat.count, 0);
    const totalDuration = dispositionStats.reduce((sum, stat) => sum + stat.totalDuration, 0);
    
    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        type: campaign.type,
        status: campaign.status,
      },
      summary: {
        totalCalls,
        totalDuration,
        avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
      },
      dispositions: dispositionStats,
      qaStats,
      agentStats,
      dailyTrend,
    });
  } catch (error) {
    console.error('Error fetching campaign call reports:', error);
    res.status(500).json({ error: 'Failed to fetch campaign call reports' });
  }
});

/**
 * GET /api/reports/calls/agent/:agentId
 * 
 * Agent-level call statistics
 */
router.get('/agent/:agentId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { from, to, campaignId } = req.query;
    const user = (req as any).user;
    
    // RBAC: Only allow access to own stats unless admin
    const userRoles = user?.roles || [user?.role];
    const isAdmin = userRoles.includes('admin') || userRoles.includes('campaign_manager');
    
    if (!isAdmin && user?.userId !== agentId) {
      return res.status(403).json({ error: 'You can only view your own statistics' });
    }
    
    // Build conditions
    const sessionConditions: any[] = [];
    const jobConditions: any[] = [eq(callJobs.agentId, agentId)];
    
    if (from) {
      sessionConditions.push(gte(callSessions.startedAt, new Date(from as string)));
    }
    if (to) {
      sessionConditions.push(lte(callSessions.startedAt, new Date(to as string)));
    }
    if (campaignId) {
      jobConditions.push(eq(callJobs.campaignId, campaignId as string));
    }
    
    // Get agent info
    const [agent] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, agentId));
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Get overall stats
    const allConditions = [...jobConditions, ...sessionConditions].filter(Boolean);
    const dispositionStats = await db
      .select({
        disposition: dispositions.label,
        dispositionAction: dispositions.systemAction,
        count: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        totalDuration: sql<number>`SUM(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined)
      .groupBy(dispositions.label, dispositions.systemAction);
    
    // Get campaign breakdown for this agent
    const campaignStats = await db
      .select({
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        totalCalls: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        qualified: sql<number>`COUNT(DISTINCT CASE WHEN ${dispositions.systemAction} = 'converted_qualified' THEN ${callSessions.id} END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .innerJoin(campaigns, eq(callJobs.campaignId, campaigns.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined)
      .groupBy(campaigns.id, campaigns.name);
    
    // Get daily trend
    const dailyTrend = await db
      .select({
        date: sql<string>`DATE(${callSessions.startedAt})`,
        totalCalls: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
        qualified: sql<number>`COUNT(DISTINCT CASE WHEN ${dispositions.systemAction} = 'converted_qualified' THEN ${callSessions.id} END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${callSessions.durationSec}, 0))::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined)
      .groupBy(sql`DATE(${callSessions.startedAt})`)
      .orderBy(sql`DATE(${callSessions.startedAt})`);
    
    // Calculate totals
    const totalCalls = dispositionStats.reduce((sum, stat) => sum + stat.count, 0);
    const totalDuration = dispositionStats.reduce((sum, stat) => sum + stat.totalDuration, 0);
    const qualified = dispositionStats
      .filter(s => s.dispositionAction === 'converted_qualified')
      .reduce((sum, stat) => sum + stat.count, 0);
    
    res.json({
      agent: {
        id: agent.id,
        name: `${agent.firstName} ${agent.lastName}`,
        email: agent.email,
        role: agent.role,
      },
      summary: {
        totalCalls,
        totalDuration,
        avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
        qualifiedLeads: qualified,
        conversionRate: totalCalls > 0 ? ((qualified / totalCalls) * 100).toFixed(2) : '0.00',
      },
      dispositions: dispositionStats,
      campaignStats,
      dailyTrend,
    });
  } catch (error) {
    console.error('Error fetching agent call reports:', error);
    res.status(500).json({ error: 'Failed to fetch agent call reports' });
  }
});

/**
 * GET /api/reports/calls/details
 * 
 * Get detailed call list with filters
 */
router.get('/details', requireAuth, async (req: Request, res: Response) => {
  try {
    const { 
      from, 
      to, 
      campaignId, 
      agentId, 
      disposition: dispositionFilter,
      limit = '100',
      offset = '0'
    } = req.query;
    
    const user = (req as any).user;
    const userRoles = user?.roles || [user?.role];
    const isAdmin = userRoles.includes('admin') || userRoles.includes('campaign_manager');
    
    // Build conditions
    const sessionConditions: any[] = [];
    const jobConditions: any[] = [];
    
    if (from) {
      sessionConditions.push(gte(callSessions.startedAt, new Date(from as string)));
    }
    if (to) {
      sessionConditions.push(lte(callSessions.startedAt, new Date(to as string)));
    }
    if (campaignId) {
      jobConditions.push(eq(callJobs.campaignId, campaignId as string));
    }
    if (agentId) {
      // RBAC: Non-admin users can only filter by their own ID
      if (!isAdmin && user?.userId !== agentId) {
        return res.status(403).json({ error: 'You can only view your own calls' });
      }
      jobConditions.push(eq(callJobs.agentId, agentId as string));
    } else if (!isAdmin) {
      // If no agent filter and not admin, default to their own calls
      jobConditions.push(eq(callJobs.agentId, user?.userId));
    }
    
    // Get detailed call list
    const allConditions = [
      ...sessionConditions,
      ...jobConditions,
      dispositionFilter ? eq(dispositions.label, dispositionFilter as string) : null
    ].filter(Boolean);
    
    const calls = await db
      .select({
        callId: callSessions.id,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        agentId: callJobs.agentId,
        agentName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        contactId: contacts.id,
        contactName: sql<string>`CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})`,
        contactEmail: contacts.email,
        contactPhone: contacts.directPhoneE164,
        accountId: accounts.id,
        accountName: accounts.name,
        disposition: dispositions.label,
        dispositionAction: dispositions.systemAction,
        dispositionNotes: callDispositions.notes,
        startedAt: callSessions.startedAt,
        endedAt: callSessions.endedAt,
        durationSec: callSessions.durationSec,
        recordingUrl: callSessions.recordingUrl,
        status: callSessions.status,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .innerJoin(campaigns, eq(callJobs.campaignId, campaigns.id))
      .innerJoin(contacts, eq(callJobs.contactId, contacts.id))
      .innerJoin(accounts, eq(callJobs.accountId, accounts.id))
      .leftJoin(users, eq(callJobs.agentId, users.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined)
      .orderBy(desc(callSessions.startedAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    // Get total count for pagination
    const [{ total }] = await db
      .select({
        total: sql<number>`COUNT(DISTINCT ${callSessions.id})::int`,
      })
      .from(callSessions)
      .innerJoin(callJobs, eq(callSessions.callJobId, callJobs.id))
      .leftJoin(callDispositions, eq(callSessions.id, callDispositions.callSessionId))
      .leftJoin(dispositions, eq(callDispositions.dispositionId, dispositions.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined);
    
    res.json({
      calls,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + parseInt(limit as string) < total,
      },
    });
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({ error: 'Failed to fetch call details' });
  }
});

export default router;
