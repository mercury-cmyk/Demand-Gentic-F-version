
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
  agentQueue,
  dialerCallAttempts,
  dialerRuns,
  virtualAgents
} from "@shared/schema";
import { eq, and, gte, lte, inArray, sql, desc, isNotNull, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";

/**
 * Canonical disposition mapping to unified display labels
 * Maps both legacy callSessions dispositions and new dialerCallAttempts canonical dispositions
 */
const DISPOSITION_DISPLAY_MAP: Record<string, { label: string; category: 'positive' | 'negative' | 'neutral' }> = {
  // New canonical dispositions (dialerCallAttempts)
  'qualified_lead': { label: 'Qualified Lead', category: 'positive' },
  'not_interested': { label: 'Not Interested', category: 'negative' },
  'do_not_call': { label: 'DNC Request', category: 'negative' },
  'voicemail': { label: 'Voicemail', category: 'neutral' },
  'no_answer': { label: 'No Answer', category: 'neutral' },
  'invalid_data': { label: 'Invalid Data', category: 'negative' },
  // Legacy dispositions (callSessions via dispositions table)
  'converted_qualified': { label: 'Qualified Lead', category: 'positive' },
  'schedule_callback': { label: 'Callback Scheduled', category: 'positive' },
  'dnc_added': { label: 'DNC Request', category: 'negative' },
};

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
 * UNIFIED: Combines data from both legacy callSessions and new dialerCallAttempts tables
 */
router.get('/global', requireAuth, async (req: Request, res: Response) => {
  try {
    const { from, to, campaignId } = req.query;
    
    // ========== LEGACY CALL SESSIONS DATA ==========
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
    
    const legacyConditions = [...sessionConditions, ...jobConditions].filter(Boolean);
    const legacyDispositionStats = await db
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
      .where(legacyConditions.length > 0 ? and(...legacyConditions) : undefined)
      .groupBy(dispositions.label, dispositions.systemAction);
    
    // ========== NEW DIALER CALL ATTEMPTS DATA ==========
    const dialerConditions: any[] = [];
    
    if (from) {
      dialerConditions.push(gte(dialerCallAttempts.createdAt, new Date(from as string)));
    }
    if (to) {
      dialerConditions.push(lte(dialerCallAttempts.createdAt, new Date(to as string)));
    }
    if (campaignId) {
      dialerConditions.push(eq(dialerCallAttempts.campaignId, campaignId as string));
    }
    
    const dialerDispositionStats = await db
      .select({
        disposition: dialerCallAttempts.disposition,
        count: sql<number>`COUNT(*)::int`,
        totalDuration: sql<number>`SUM(COALESCE(${dialerCallAttempts.callDurationSeconds}, 0))::int`,
        connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
      })
      .from(dialerCallAttempts)
      .where(dialerConditions.length > 0 ? and(...dialerConditions) : undefined)
      .groupBy(dialerCallAttempts.disposition);
    
    // ========== MERGE DISPOSITION STATS ==========
    const dispositionMap = new Map<string, { count: number; totalDuration: number; action?: string }>();
    
    // Add legacy stats
    for (const stat of legacyDispositionStats) {
      const key = stat.disposition || 'Unknown';
      const existing = dispositionMap.get(key) || { count: 0, totalDuration: 0 };
      dispositionMap.set(key, {
        count: existing.count + stat.count,
        totalDuration: existing.totalDuration + stat.totalDuration,
        action: stat.dispositionAction || existing.action
      });
    }
    
    // Add dialer stats (map canonical dispositions to display labels)
    for (const stat of dialerDispositionStats) {
      const mapping = DISPOSITION_DISPLAY_MAP[stat.disposition || ''];
      const displayLabel = mapping?.label || stat.disposition || 'Unknown';
      const existing = dispositionMap.get(displayLabel) || { count: 0, totalDuration: 0 };
      dispositionMap.set(displayLabel, {
        count: existing.count + stat.count,
        totalDuration: existing.totalDuration + stat.totalDuration,
        action: stat.disposition === 'qualified_lead' ? 'converted_qualified' : existing.action
      });
    }
    
    const mergedDispositions = Array.from(dispositionMap.entries()).map(([label, data]) => ({
      disposition: label,
      dispositionAction: data.action || null,
      count: data.count,
      totalDuration: data.totalDuration
    }));
    
    // ========== CAMPAIGN BREAKDOWN (UNIFIED) ==========
    // Legacy campaign stats
    const legacyCampaignStats = await db
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
      .where(legacyConditions.length > 0 ? and(...legacyConditions) : undefined)
      .groupBy(campaigns.id, campaigns.name);
    
    // Dialer campaign stats
    const dialerCampaignStats = await db
      .select({
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        totalCalls: sql<number>`COUNT(*)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 END)::int`,
        connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${dialerCallAttempts.callDurationSeconds}, 0))::int`,
      })
      .from(dialerCallAttempts)
      .innerJoin(campaigns, eq(dialerCallAttempts.campaignId, campaigns.id))
      .where(dialerConditions.length > 0 ? and(...dialerConditions) : undefined)
      .groupBy(campaigns.id, campaigns.name);
    
    // Merge campaign stats
    const campaignMap = new Map<string, { id: string; name: string; totalCalls: number; qualified: number; connected: number; totalDuration: number; count: number }>();
    
    for (const stat of legacyCampaignStats) {
      campaignMap.set(stat.campaignId, {
        id: stat.campaignId,
        name: stat.campaignName,
        totalCalls: stat.totalCalls,
        qualified: stat.qualified,
        connected: stat.totalCalls, // Legacy assumes connected if session exists
        totalDuration: stat.avgDuration * stat.totalCalls,
        count: stat.totalCalls
      });
    }
    
    for (const stat of dialerCampaignStats) {
      const existing = campaignMap.get(stat.campaignId);
      if (existing) {
        existing.totalCalls += stat.totalCalls;
        existing.qualified += stat.qualified;
        existing.connected += stat.connected;
        existing.totalDuration += stat.avgDuration * stat.totalCalls;
        existing.count += stat.totalCalls;
      } else {
        campaignMap.set(stat.campaignId, {
          id: stat.campaignId,
          name: stat.campaignName,
          totalCalls: stat.totalCalls,
          qualified: stat.qualified,
          connected: stat.connected,
          totalDuration: stat.avgDuration * stat.totalCalls,
          count: stat.totalCalls
        });
      }
    }
    
    const campaignBreakdown = Array.from(campaignMap.values()).map(c => ({
      campaignId: c.id,
      campaignName: c.name,
      totalCalls: c.totalCalls,
      qualified: c.qualified,
      connected: c.connected,
      avgDuration: c.count > 0 ? Math.round(c.totalDuration / c.count) : 0
    }));
    
    // ========== AGENT STATS (UNIFIED) ==========
    // Legacy agent stats
    const legacyAgentConditions = [...legacyConditions, isNotNull(callJobs.agentId)].filter(Boolean);
    const legacyAgentStats = await db
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
      .where(legacyAgentConditions.length > 0 ? and(...legacyAgentConditions) : undefined)
      .groupBy(callJobs.agentId, users.firstName, users.lastName);
    
    // Dialer human agent stats
    const dialerHumanAgentConditions = [...dialerConditions, isNotNull(dialerCallAttempts.humanAgentId)].filter(Boolean);
    const dialerHumanAgentStats = await db
      .select({
        agentId: dialerCallAttempts.humanAgentId,
        agentName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        totalCalls: sql<number>`COUNT(*)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 END)::int`,
        connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${dialerCallAttempts.callDurationSeconds}, 0))::int`,
      })
      .from(dialerCallAttempts)
      .innerJoin(users, eq(dialerCallAttempts.humanAgentId, users.id))
      .where(dialerHumanAgentConditions.length > 0 ? and(...dialerHumanAgentConditions) : undefined)
      .groupBy(dialerCallAttempts.humanAgentId, users.firstName, users.lastName);
    
    // Dialer AI agent stats
    const dialerAIAgentConditions = [...dialerConditions, isNotNull(dialerCallAttempts.virtualAgentId)].filter(Boolean);
    const dialerAIAgentStats = await db
      .select({
        agentId: dialerCallAttempts.virtualAgentId,
        agentName: virtualAgents.name,
        agentType: sql<string>`'ai'`,
        totalCalls: sql<number>`COUNT(*)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 END)::int`,
        connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
        avgDuration: sql<number>`AVG(COALESCE(${dialerCallAttempts.callDurationSeconds}, 0))::int`,
      })
      .from(dialerCallAttempts)
      .innerJoin(virtualAgents, eq(dialerCallAttempts.virtualAgentId, virtualAgents.id))
      .where(dialerAIAgentConditions.length > 0 ? and(...dialerAIAgentConditions) : undefined)
      .groupBy(dialerCallAttempts.virtualAgentId, virtualAgents.name);
    
    // Merge agent stats
    const agentMap = new Map<string, { id: string; name: string; type: string; totalCalls: number; qualified: number; connected: number; totalDuration: number; count: number }>();
    
    for (const stat of legacyAgentStats) {
      if (!stat.agentId) continue;
      agentMap.set(stat.agentId, {
        id: stat.agentId,
        name: stat.agentName,
        type: 'human',
        totalCalls: stat.totalCalls,
        qualified: stat.qualified,
        connected: stat.totalCalls,
        totalDuration: stat.avgDuration * stat.totalCalls,
        count: stat.totalCalls
      });
    }
    
    for (const stat of dialerHumanAgentStats) {
      if (!stat.agentId) continue;
      const existing = agentMap.get(stat.agentId);
      if (existing) {
        existing.totalCalls += stat.totalCalls;
        existing.qualified += stat.qualified;
        existing.connected += stat.connected;
        existing.totalDuration += stat.avgDuration * stat.totalCalls;
        existing.count += stat.totalCalls;
      } else {
        agentMap.set(stat.agentId, {
          id: stat.agentId,
          name: stat.agentName,
          type: 'human',
          totalCalls: stat.totalCalls,
          qualified: stat.qualified,
          connected: stat.connected,
          totalDuration: stat.avgDuration * stat.totalCalls,
          count: stat.totalCalls
        });
      }
    }
    
    for (const stat of dialerAIAgentStats) {
      if (!stat.agentId) continue;
      agentMap.set(`ai_${stat.agentId}`, {
        id: stat.agentId,
        name: `🤖 ${stat.agentName}`,
        type: 'ai',
        totalCalls: stat.totalCalls,
        qualified: stat.qualified,
        connected: stat.connected,
        totalDuration: stat.avgDuration * stat.totalCalls,
        count: stat.totalCalls
      });
    }
    
    const agentStats = Array.from(agentMap.values()).map(a => ({
      agentId: a.id,
      agentName: a.name,
      agentType: a.type,
      totalCalls: a.totalCalls,
      qualified: a.qualified,
      connected: a.connected,
      avgDuration: a.count > 0 ? Math.round(a.totalDuration / a.count) : 0
    }));
    
    // ========== QA STATS ==========
    const qaConditions = [...legacyConditions, isNotNull(leads.qaStatus)].filter(Boolean);
    const qaStats = await db
      .select({
        qaStatus: leads.qaStatus,
        count: sql<number>`COUNT(DISTINCT ${leads.id})::int`,
      })
      .from(leads)
      .where(isNotNull(leads.qaStatus))
      .groupBy(leads.qaStatus);
    
    // ========== CALCULATE TOTALS ==========
    const totalCalls = mergedDispositions.reduce((sum, stat) => sum + stat.count, 0);
    const totalDuration = mergedDispositions.reduce((sum, stat) => sum + stat.totalDuration, 0);
    
    // Total connected from dialer stats
    const totalConnected = dialerDispositionStats.reduce((sum, stat) => sum + stat.connected, 0) +
      legacyDispositionStats.reduce((sum, stat) => sum + stat.count, 0); // Legacy assumes connected
    
    res.json({
      summary: {
        totalCalls,
        totalConnected,
        totalDuration,
        avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
      },
      dispositions: mergedDispositions,
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
