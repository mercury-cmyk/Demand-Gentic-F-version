/**
 * Client Portal Analytics Routes
 *
 * Provides analytics, call reports, recordings, conversation quality,
 * and email campaign data for client portal users, scoped to their
 * assigned campaigns via clientCampaignAccess.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, or, isNotNull, inArray, gte, lte, ilike } from 'drizzle-orm';
import {
  clientCampaignAccess,
  clientAccounts,
  campaigns,
  callSessions,
  callQualityRecords,
  clientMockCalls,
  qaGatedContent,
  contacts,
  accounts,
  leads,
  emailSends,
  emailEvents,
  emailTemplates,
} from '@shared/schema';
import { resolvePlayableRecordingUrl } from '../lib/recording-url-policy';
import { requireClientFeature } from '../middleware/client-feature-gate';

const router = Router();

/**
 * Helper: Get all campaign IDs the client has access to
 */
async function getClientCampaignIds(clientAccountId: string): Promise<string[]> {
  const regularAccess = await db
    .select({ campaignId: clientCampaignAccess.regularCampaignId })
    .from(clientCampaignAccess)
    .where(
      and(
        eq(clientCampaignAccess.clientAccountId, clientAccountId),
        isNotNull(clientCampaignAccess.regularCampaignId)
      )
    );

  return regularAccess
    .map(a => a.campaignId)
    .filter((id): id is string => id !== null);
}

/**
 * GET /call-reports
 *
 * Call report data with disposition breakdowns and campaign performance
 * for the client's assigned campaigns.
 */
router.get('/call-reports', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { campaignId } = req.query;
    const campaignIds = await getClientCampaignIds(clientAccountId);

    if (campaignIds.length === 0) {
      return res.json({
        summary: { totalCalls: 0, totalDuration: 0, avgDuration: 0 },
        dispositions: [],
        campaignBreakdown: [],
      });
    }

    const targetIds = campaignId && campaignId !== 'all'
      ? [campaignId as string].filter(id => campaignIds.includes(id))
      : campaignIds;

    if (targetIds.length === 0) {
      return res.json({
        summary: { totalCalls: 0, totalDuration: 0, avgDuration: 0 },
        dispositions: [],
        campaignBreakdown: [],
      });
    }

    // Summary stats
    const [summary] = await db
      .select({
        totalCalls: sql<number>`COUNT(*)::int`,
        totalDuration: sql<number>`COALESCE(SUM(${callSessions.durationSec}), 0)::int`,
        avgDuration: sql<number>`COALESCE(AVG(${callSessions.durationSec}), 0)::int`,
      })
      .from(callSessions)
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed')
        )
      );

    // Disposition breakdown
    const dispositions = await db
      .select({
        disposition: sql<string>`COALESCE(${callSessions.aiDisposition}, 'unknown')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(callSessions)
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed')
        )
      )
      .groupBy(sql`COALESCE(${callSessions.aiDisposition}, 'unknown')`)
      .orderBy(desc(sql`COUNT(*)`));

    // Campaign breakdown
    const campaignBreakdown = await db
      .select({
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        totalCalls: sql<number>`COUNT(*)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} IN ('qualified', 'qualified_lead', 'converted_qualified') THEN 1 END)::int`,
        notInterested: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} = 'not_interested' THEN 1 END)::int`,
        voicemail: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} = 'voicemail' THEN 1 END)::int`,
        noAnswer: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} = 'no_answer' THEN 1 END)::int`,
        dncRequest: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} IN ('dnc_request', 'do_not_call', 'dnc_added') THEN 1 END)::int`,
      })
      .from(callSessions)
      .innerJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed')
        )
      )
      .groupBy(campaigns.id, campaigns.name);

    res.json({
      summary: summary || { totalCalls: 0, totalDuration: 0, avgDuration: 0 },
      dispositions,
      campaignBreakdown,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Call reports error:', error);
    res.status(500).json({ message: 'Failed to fetch call reports' });
  }
});

/**
 * GET /recordings
 *
 * Call recordings for the client's assigned campaigns.
 * Respects visibility settings for recordings.
 */
router.get('/recordings', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    // Check recording visibility
    const [clientAccount] = await db
      .select({ visibilitySettings: clientAccounts.visibilitySettings })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientAccountId))
      .limit(1);

    const visibility = (clientAccount?.visibilitySettings || {}) as Record<string, boolean>;
    if (visibility.showRecordings === false) {
      return res.json([]);
    }

    const { campaignId, search } = req.query;
    const campaignIds = await getClientCampaignIds(clientAccountId);

    if (campaignIds.length === 0) return res.json([]);

    const targetIds = campaignId && campaignId !== 'all'
      ? [campaignId as string].filter(id => campaignIds.includes(id))
      : campaignIds;

    if (targetIds.length === 0) return res.json([]);

    const conditions = [
      inArray(callSessions.campaignId, targetIds),
      eq(callSessions.status, 'completed'),
    ];

    const recordings = await db
      .select({
        id: callSessions.id,
        campaignId: callSessions.campaignId,
        campaignName: campaigns.name,
        contactName: sql<string>`COALESCE(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
        accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
        phoneNumber: callSessions.toNumberE164,
        disposition: callSessions.aiDisposition,
        duration: callSessions.durationSec,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        transcript: callSessions.aiTranscript,
        createdAt: callSessions.createdAt,
      })
      .from(callSessions)
      .innerJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(callSessions.createdAt))
      .limit(200);

    // Apply search filter in-memory if provided (simpler than complex SQL for contact/account names)
    let filtered = recordings;
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.toLowerCase();
      filtered = recordings.filter(r =>
        r.contactName.toLowerCase().includes(term) ||
        r.accountName.toLowerCase().includes(term) ||
        (r.phoneNumber && r.phoneNumber.includes(term))
      );
    }

    const normalizedRecordings = filtered.map((recording) => {
      const normalizedRecordingUrl = resolvePlayableRecordingUrl({
        recordingS3Key: recording.recordingS3Key,
        recordingUrl: recording.recordingUrl,
      });
      return {
        ...recording,
        recordingUrl: normalizedRecordingUrl,
      };
    });

    res.json(normalizedRecordings);
  } catch (error) {
    console.error('[CLIENT PORTAL] Recordings error:', error);
    res.status(500).json({ message: 'Failed to fetch recordings' });
  }
});

/**
 * GET /analytics/engagement
 *
 * Engagement analytics across the client's assigned campaigns.
 */
router.get('/analytics/engagement', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { campaignId } = req.query;
    const campaignIds = await getClientCampaignIds(clientAccountId);

    const selectedTargetIds = campaignId && campaignId !== 'all'
      ? [campaignId as string].filter(id => campaignIds.includes(id))
      : campaignIds;
    // Keep analytics operational even when no live campaign IDs are available
    // so sample/mock calls can still appear for the client.
    const targetIds = selectedTargetIds.length > 0 ? selectedTargetIds : ['__none__'];

    // Total campaigns
    const totalCampaigns = selectedTargetIds.length;

    // Call stats
    const [callStats] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} IN ('qualified', 'qualified_lead', 'converted_qualified') THEN 1 END)::int`,
      })
      .from(callSessions)
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed')
        )
      );

    // Sample/mock calls that were QA-approved for this client account
    const sampleCallConditions = [
      eq(clientMockCalls.clientAccountId, clientAccountId),
      eq(clientMockCalls.callType, 'sample'),
      inArray(qaGatedContent.qaStatus, ['approved', 'published']),
      eq(qaGatedContent.clientVisible, true),
    ];

    if (campaignId && campaignId !== 'all') {
      sampleCallConditions.push(eq(clientMockCalls.campaignId, campaignId as string));
    }

    const [sampleCallStats] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
      })
      .from(clientMockCalls)
      .innerJoin(qaGatedContent, and(
        eq(qaGatedContent.id, clientMockCalls.qaContentId),
        eq(qaGatedContent.contentType, 'mock_call')
      ))
      .where(and(...sampleCallConditions));

    // Email stats
    const [emailStats] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
      })
      .from(emailSends)
      .where(inArray(emailSends.campaignId, targetIds));

    // Lead stats
    const [leadStats] = await db
      .select({
        qualified: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} = 'approved' THEN 1 END)::int`,
      })
      .from(leads)
      .where(inArray(leads.campaignId, targetIds));

    // Timeline (last 30 days) - calls per day
    const timeline = await db
      .select({
        date: sql<string>`TO_CHAR(${callSessions.createdAt}, 'YYYY-MM-DD')`,
        calls: sql<number>`COUNT(*)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} IN ('qualified', 'qualified_lead', 'converted_qualified') THEN 1 END)::int`,
      })
      .from(callSessions)
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed'),
          gte(callSessions.createdAt, sql`NOW() - INTERVAL '30 days'`)
        )
      )
      .groupBy(sql`TO_CHAR(${callSessions.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${callSessions.createdAt}, 'YYYY-MM-DD')`);

    // Add email count to timeline (approximate)
    const emailTimeline = await db
      .select({
        date: sql<string>`TO_CHAR(${emailSends.sentAt}, 'YYYY-MM-DD')`,
        emails: sql<number>`COUNT(*)::int`,
      })
      .from(emailSends)
      .where(
        and(
          inArray(emailSends.campaignId, targetIds),
          isNotNull(emailSends.sentAt),
          gte(emailSends.sentAt, sql`NOW() - INTERVAL '30 days'`)
        )
      )
      .groupBy(sql`TO_CHAR(${emailSends.sentAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${emailSends.sentAt}, 'YYYY-MM-DD')`);

    // Merge email data into timeline
    const emailMap = new Map(emailTimeline.map(e => [e.date, e.emails]));
    const mergedTimeline = timeline.map(t => ({
      ...t,
      emails: emailMap.get(t.date) || 0,
    }));

    // Channel breakdown
    const channelBreakdown = [
      { name: 'Phone Calls', value: callStats?.total || 0 },
      { name: 'Emails', value: emailStats?.total || 0 },
    ].filter(c => c.value > 0);

    // Dispositions
    const dispositions = await db
      .select({
        disposition: sql<string>`COALESCE(${callSessions.aiDisposition}, 'unknown')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(callSessions)
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed')
        )
      )
      .groupBy(sql`COALESCE(${callSessions.aiDisposition}, 'unknown')`)
      .orderBy(desc(sql`COUNT(*)`));

    // Include dispositions from sample calls
    const sampleDispositions = await db
      .select({
        disposition: sql<string>`COALESCE(${clientMockCalls.disposition}, 'sample_call')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(clientMockCalls)
      .innerJoin(qaGatedContent, and(
        eq(qaGatedContent.id, clientMockCalls.qaContentId),
        eq(qaGatedContent.contentType, 'mock_call')
      ))
      .where(and(...sampleCallConditions))
      .groupBy(sql`COALESCE(${clientMockCalls.disposition}, 'sample_call')`)
      .orderBy(desc(sql`COUNT(*)`));

    const dispositionMap = new Map<string, number>();
    for (const row of dispositions) {
      dispositionMap.set(row.disposition, Number(row.count) || 0);
    }
    for (const row of sampleDispositions) {
      const prev = dispositionMap.get(row.disposition) || 0;
      dispositionMap.set(row.disposition, prev + (Number(row.count) || 0));
    }
    const mergedDispositions = Array.from(dispositionMap.entries())
      .map(([disposition, count]) => ({ disposition, count }))
      .sort((a, b) => b.count - a.count);

    // Agent behavior aggregate from call quality dimensions
    const [agentBehavior] = await db
      .select({
        sampleSize: sql<number>`COUNT(*)::int`,
        overall: sql<number>`COALESCE(ROUND(AVG(${callQualityRecords.overallQualityScore})), 0)::int`,
        clarity: sql<number>`COALESCE(ROUND(AVG(${callQualityRecords.clarityScore})), 0)::int`,
        engagement: sql<number>`COALESCE(ROUND(AVG(${callQualityRecords.engagementScore})), 0)::int`,
        empathy: sql<number>`COALESCE(ROUND(AVG(${callQualityRecords.empathyScore})), 0)::int`,
        objectionHandling: sql<number>`COALESCE(ROUND(AVG(${callQualityRecords.objectionHandlingScore})), 0)::int`,
        qualification: sql<number>`COALESCE(ROUND(AVG(${callQualityRecords.qualificationScore})), 0)::int`,
        closing: sql<number>`COALESCE(ROUND(AVG(${callQualityRecords.closingScore})), 0)::int`,
        flowCompliance: sql<number>`COALESCE(ROUND(AVG(${callQualityRecords.flowComplianceScore})), 0)::int`,
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed')
        )
      );

    const [sampleBehavior] = await db
      .select({
        sampleSize: sql<number>`COUNT(*)::int`,
        avgScore: sql<number>`COALESCE(ROUND(AVG(${clientMockCalls.aiScore})), 0)::int`,
      })
      .from(clientMockCalls)
      .innerJoin(qaGatedContent, and(
        eq(qaGatedContent.id, clientMockCalls.qaContentId),
        eq(qaGatedContent.contentType, 'mock_call')
      ))
      .where(and(...sampleCallConditions));

    // Recent calls: live calls + sample calls
    const liveRecentCalls = await db
      .select({
        id: callSessions.id,
        campaignName: campaigns.name,
        contactName: sql<string>`COALESCE(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
        accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
        disposition: sql<string>`COALESCE(${callSessions.aiDisposition}, 'unknown')`,
        duration: callSessions.durationSec,
        behaviorScore: callQualityRecords.overallQualityScore,
        createdAt: callSessions.createdAt,
        source: sql<'live'>`'live'`,
      })
      .from(callSessions)
      .innerJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(callQualityRecords, eq(callQualityRecords.callSessionId, callSessions.id))
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed')
        )
      )
      .orderBy(desc(callSessions.createdAt))
      .limit(25);

    const sampleRecentCalls = await db
      .select({
        id: clientMockCalls.id,
        campaignName: campaigns.name,
        contactName: sql<string>`COALESCE(${clientMockCalls.callName}, 'Sample Call')`,
        accountName: sql<string>`'Sample'`,
        disposition: sql<string>`COALESCE(${clientMockCalls.disposition}, 'sample_call')`,
        duration: clientMockCalls.durationSeconds,
        behaviorScore: clientMockCalls.aiScore,
        createdAt: clientMockCalls.createdAt,
        source: sql<'sample'>`'sample'`,
      })
      .from(clientMockCalls)
      .leftJoin(campaigns, eq(clientMockCalls.campaignId, campaigns.id))
      .innerJoin(qaGatedContent, and(
        eq(qaGatedContent.id, clientMockCalls.qaContentId),
        eq(qaGatedContent.contentType, 'mock_call')
      ))
      .where(and(...sampleCallConditions))
      .orderBy(desc(clientMockCalls.createdAt))
      .limit(25);

    const recentCalls = [...liveRecentCalls, ...sampleRecentCalls]
      .sort((a, b) => new Date(b.createdAt as Date | string).getTime() - new Date(a.createdAt as Date | string).getTime())
      .slice(0, 30)
      .map((call) => ({
        ...call,
        behaviorScore: call.behaviorScore == null ? null : Number(call.behaviorScore),
      }));

    res.json({
      totalCampaigns,
      calls: {
        total: (callStats?.total || 0) + (sampleCallStats?.total || 0),
        live: callStats?.total || 0,
        sample: sampleCallStats?.total || 0,
      },
      email: { total: emailStats?.total || 0 },
      leads: { qualified: leadStats?.qualified || 0 },
      timeline: mergedTimeline,
      channelBreakdown,
      dispositions: mergedDispositions,
      agentBehavior: {
        sampleSize: agentBehavior?.sampleSize || 0,
        overall: agentBehavior?.overall || 0,
        clarity: agentBehavior?.clarity || 0,
        engagement: agentBehavior?.engagement || 0,
        empathy: agentBehavior?.empathy || 0,
        objectionHandling: agentBehavior?.objectionHandling || 0,
        qualification: agentBehavior?.qualification || 0,
        closing: agentBehavior?.closing || 0,
        flowCompliance: agentBehavior?.flowCompliance || 0,
        sampleCallsAvgScore: sampleBehavior?.avgScore || 0,
        sampleCallsCount: sampleBehavior?.sampleSize || 0,
      },
      recentCalls,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

/**
 * GET /conversations
 *
 * Conversation quality data for the client's assigned campaigns.
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { campaignId } = req.query;
    const campaignIds = await getClientCampaignIds(clientAccountId);

    if (campaignIds.length === 0) return res.json([]);

    const targetIds = campaignId && campaignId !== 'all'
      ? [campaignId as string].filter(id => campaignIds.includes(id))
      : campaignIds;

    if (targetIds.length === 0) return res.json([]);

    const rawConversations = await db
      .select({
        id: callSessions.id,
        campaignId: callSessions.campaignId,
        campaignName: campaigns.name,
        contactName: sql<string>`COALESCE(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
        accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
        disposition: callSessions.aiDisposition,
        duration: callSessions.durationSec,
        qualityScore: callQualityRecords.overallQualityScore,
        qaStatus: leads.qaStatus,
        transcript: callSessions.aiTranscript,
        analysis: callSessions.aiAnalysis,
        createdAt: callSessions.createdAt,
        // Post-call quality dimensions from callQualityRecords
        engagementScore: callQualityRecords.engagementScore,
        clarityScore: callQualityRecords.clarityScore,
        empathyScore: callQualityRecords.empathyScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        qualificationScore: callQualityRecords.qualificationScore,
        closingScore: callQualityRecords.closingScore,
        flowComplianceScore: callQualityRecords.flowComplianceScore,
        campaignAlignmentScore: callQualityRecords.campaignAlignmentScore,
        sentiment: callQualityRecords.sentiment,
        engagementLevel: callQualityRecords.engagementLevel,
        issues: callQualityRecords.issues,
        recommendations: callQualityRecords.recommendations,
        // Recording info
        hasRecording: sql<boolean>`(${callSessions.recordingS3Key} IS NOT NULL)`,
        recordingS3Key: callSessions.recordingS3Key,
      })
      .from(callSessions)
      .innerJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(callQualityRecords, eq(callQualityRecords.callSessionId, callSessions.id))
      .leftJoin(leads, and(
        eq(leads.campaignId, callSessions.campaignId),
        eq(leads.contactId, callSessions.contactId)
      ))
      .where(
        and(
          inArray(callSessions.campaignId, targetIds),
          eq(callSessions.status, 'completed'),
        )
      )
      .orderBy(desc(callSessions.createdAt))
      .limit(200);

    // Deduplicate by callSession id (left join on leads can produce duplicates)
    const seen = new Set<string>();
    const conversations = rawConversations.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    res.json(conversations);
  } catch (error) {
    console.error('[CLIENT PORTAL] Conversations error:', error);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
});

/**
 * GET /email-campaigns
 *
 * Email campaign data for the client's assigned campaigns.
 */
router.get('/email-campaigns', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const campaignIds = await getClientCampaignIds(clientAccountId);

    if (campaignIds.length === 0) return res.json([]);

    // Get email-type campaigns and their send stats
    const emailCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(
        and(
          inArray(campaigns.id, campaignIds),
          or(
            eq(campaigns.type, 'email'),
            eq(campaigns.type, 'combo')
          )
        )
      )
      .orderBy(desc(campaigns.createdAt));

    // For each email campaign, get send stats
    const enriched = await Promise.all(
      emailCampaigns.map(async (campaign) => {
        // Send counts from emailSends
        const [sendStats] = await db
          .select({
            totalRecipients: sql<number>`COUNT(DISTINCT ${emailSends.contactId})::int`,
            sent: sql<number>`COUNT(*)::int`,
            delivered: sql<number>`COUNT(CASE WHEN ${emailSends.status} = 'delivered' THEN 1 END)::int`,
            bounced: sql<number>`COUNT(CASE WHEN ${emailSends.status} = 'bounced' THEN 1 END)::int`,
          })
          .from(emailSends)
          .where(eq(emailSends.campaignId, campaign.id));

        // Event counts from emailEvents (opened, clicked, unsubscribed)
        const [eventStats] = await db
          .select({
            opened: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'opened' THEN 1 END)::int`,
            clicked: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'clicked' THEN 1 END)::int`,
            unsubscribed: sql<number>`COUNT(CASE WHEN ${emailEvents.type} = 'unsubscribed' THEN 1 END)::int`,
          })
          .from(emailEvents)
          .where(eq(emailEvents.campaignId, campaign.id));

        // Get subject from first email template used in this campaign
        const [tmpl] = await db
          .select({ subject: emailTemplates.subject })
          .from(emailSends)
          .innerJoin(emailTemplates, eq(emailSends.templateId, emailTemplates.id))
          .where(eq(emailSends.campaignId, campaign.id))
          .limit(1);

        return {
          ...campaign,
          subject: tmpl?.subject || campaign.name,
          totalRecipients: sendStats?.totalRecipients || 0,
          sent: sendStats?.sent || 0,
          delivered: sendStats?.delivered || 0,
          opened: eventStats?.opened || 0,
          clicked: eventStats?.clicked || 0,
          bounced: sendStats?.bounced || 0,
          unsubscribed: eventStats?.unsubscribed || 0,
          scheduledAt: null,
          sentAt: null,
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error('[CLIENT PORTAL] Email campaigns error:', error);
    res.status(500).json({ message: 'Failed to fetch email campaigns' });
  }
});

// ==================== DISPOSITION INTELLIGENCE ====================

/**
 * GET /disposition-intelligence
 * Disposition overview: breakdown, accuracy, trends for client campaigns
 */
router.get('/disposition-intelligence', requireClientFeature('disposition_overview'), async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { campaignId } = req.query;
    const campaignIds = await getClientCampaignIds(clientAccountId);
    if (campaignIds.length === 0) return res.json({ dispositions: [], timeline: [], totalCalls: 0 });

    const targetIds = campaignId && campaignId !== 'all'
      ? [campaignId as string].filter(id => campaignIds.includes(id))
      : campaignIds;
    if (targetIds.length === 0) return res.json({ dispositions: [], timeline: [], totalCalls: 0 });

    // Disposition breakdown
    const dispositions = await db
      .select({
        disposition: sql<string>`COALESCE(${callSessions.aiDisposition}, 'unknown')`,
        count: sql<number>`COUNT(*)::int`,
        avgDuration: sql<number>`COALESCE(AVG(${callSessions.durationSec}), 0)::int`,
      })
      .from(callSessions)
      .where(and(inArray(callSessions.campaignId, targetIds), eq(callSessions.status, 'completed')))
      .groupBy(sql`COALESCE(${callSessions.aiDisposition}, 'unknown')`)
      .orderBy(desc(sql`COUNT(*)`));

    const [totals] = await db
      .select({ totalCalls: sql<number>`COUNT(*)::int` })
      .from(callSessions)
      .where(and(inArray(callSessions.campaignId, targetIds), eq(callSessions.status, 'completed')));

    // Daily trend (last 30 days)
    const timeline = await db
      .select({
        date: sql<string>`TO_CHAR(${callSessions.createdAt}, 'YYYY-MM-DD')`,
        total: sql<number>`COUNT(*)::int`,
        qualified: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} IN ('qualified', 'qualified_lead', 'converted_qualified') THEN 1 END)::int`,
        notInterested: sql<number>`COUNT(CASE WHEN ${callSessions.aiDisposition} = 'not_interested' THEN 1 END)::int`,
      })
      .from(callSessions)
      .where(and(
        inArray(callSessions.campaignId, targetIds),
        eq(callSessions.status, 'completed'),
        gte(callSessions.createdAt, sql`NOW() - INTERVAL '30 days'`)
      ))
      .groupBy(sql`TO_CHAR(${callSessions.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${callSessions.createdAt}, 'YYYY-MM-DD')`);

    res.json({
      dispositions,
      timeline,
      totalCalls: totals?.totalCalls || 0,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Disposition intelligence error:', error);
    res.status(500).json({ message: 'Failed to fetch disposition data' });
  }
});

/**
 * GET /potential-leads
 * AI-identified potential leads with buying signals
 */
router.get('/potential-leads', requireClientFeature('disposition_potential_leads'), async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { campaignId } = req.query;
    const campaignIds = await getClientCampaignIds(clientAccountId);
    if (campaignIds.length === 0) return res.json([]);

    const targetIds = campaignId && campaignId !== 'all'
      ? [campaignId as string].filter(id => campaignIds.includes(id))
      : campaignIds;
    if (targetIds.length === 0) return res.json([]);

    // Leads with high AI scores but not yet qualified
    const potentialLeads = await db
      .select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: leads.accountName,
        campaignName: campaigns.name,
        aiScore: leads.aiScore,
        aiQualificationStatus: leads.aiQualificationStatus,
        qaStatus: leads.qaStatus,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(and(
        inArray(leads.campaignId, targetIds),
        gte(sql`CAST(${leads.aiScore} AS numeric)`, sql`40`),
      ))
      .orderBy(desc(sql`CAST(${leads.aiScore} AS numeric)`))
      .limit(100);

    res.json(potentialLeads);
  } catch (error) {
    console.error('[CLIENT PORTAL] Potential leads error:', error);
    res.status(500).json({ message: 'Failed to fetch potential leads' });
  }
});

// ==================== COST TRACKING ====================

/**
 * GET /cost-tracking
 * Cost breakdown by campaign and activity type
 */
router.get('/cost-tracking', requireClientFeature('billing_cost_tracking'), async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const campaignIds = await getClientCampaignIds(clientAccountId);

    // Call costs (from callSessions)
    const [callCosts] = await db
      .select({
        totalCalls: sql<number>`COUNT(*)::int`,
        totalDuration: sql<number>`COALESCE(SUM(${callSessions.durationSec}), 0)::int`,
      })
      .from(callSessions)
      .where(and(
        inArray(callSessions.campaignId, campaignIds.length > 0 ? campaignIds : ['__none__']),
        eq(callSessions.status, 'completed')
      ));

    // Email costs (from emailSends)
    const [emailCosts] = await db
      .select({ totalEmails: sql<number>`COUNT(*)::int` })
      .from(emailSends)
      .where(inArray(emailSends.campaignId, campaignIds.length > 0 ? campaignIds : ['__none__']));

    // Lead costs (qualified leads)
    const [leadCosts] = await db
      .select({
        totalLeads: sql<number>`COUNT(*)::int`,
        qualifiedLeads: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} IN ('approved', 'published') THEN 1 END)::int`,
      })
      .from(leads)
      .where(inArray(leads.campaignId, campaignIds.length > 0 ? campaignIds : ['__none__']));

    // Per-campaign breakdown
    const campaignBreakdown = await Promise.all(
      campaignIds.slice(0, 20).map(async (cId) => {
        const [cInfo] = await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, cId)).limit(1);
        const [cCalls] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(callSessions).where(and(eq(callSessions.campaignId, cId), eq(callSessions.status, 'completed')));
        const [cEmails] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(emailSends).where(eq(emailSends.campaignId, cId));
        const [cLeads] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(leads).where(and(eq(leads.campaignId, cId), inArray(leads.qaStatus, ['approved', 'published'])));
        return {
          campaignId: cId,
          campaignName: cInfo?.name || 'Unknown',
          calls: cCalls?.count || 0,
          emails: cEmails?.count || 0,
          qualifiedLeads: cLeads?.count || 0,
        };
      })
    );

    res.json({
      summary: {
        totalCalls: callCosts?.totalCalls || 0,
        totalDurationMinutes: Math.round((callCosts?.totalDuration || 0) / 60),
        totalEmails: emailCosts?.totalEmails || 0,
        totalLeads: leadCosts?.totalLeads || 0,
        qualifiedLeads: leadCosts?.qualifiedLeads || 0,
      },
      campaignBreakdown,
    });
  } catch (error) {
    console.error('[CLIENT PORTAL] Cost tracking error:', error);
    res.status(500).json({ message: 'Failed to fetch cost tracking data' });
  }
});

/**
 * GET /leads/export
 * Export all leads to CSV format
 */
router.get('/leads/export', requireClientFeature('lead_export'), async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { campaignId, status } = req.query;
    const campaignIds = await getClientCampaignIds(clientAccountId);
    if (campaignIds.length === 0) return res.status(404).json({ message: 'No campaigns found' });

    const targetIds = campaignId && campaignId !== 'all'
      ? [campaignId as string].filter(id => campaignIds.includes(id))
      : campaignIds;
    if (targetIds.length === 0) return res.status(404).json({ message: 'No campaign access' });

    const conditions: any[] = [inArray(leads.campaignId, targetIds)];
    if (status === 'qualified') {
      conditions.push(inArray(leads.qaStatus, ['approved', 'published']));
    }

    const leadsData = await db
      .select({
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        contactPhone: leads.contactPhone,
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        campaignName: campaigns.name,
        aiScore: leads.aiScore,
        qaStatus: leads.qaStatus,
        aiQualificationStatus: leads.aiQualificationStatus,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(10000);

    // Generate CSV
    const headers = ['Contact Name', 'Email', 'Phone', 'Account', 'Industry', 'Campaign', 'AI Score', 'QA Status', 'AI Status', 'Date'];
    const rows = leadsData.map(l => [
      l.contactName || '', l.contactEmail || '', l.contactPhone || '',
      l.accountName || '', l.accountIndustry || '', l.campaignName || '',
      l.aiScore || '', l.qaStatus || '', l.aiQualificationStatus || '',
      l.createdAt ? new Date(l.createdAt).toISOString().split('T')[0] : '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('[CLIENT PORTAL] Leads export error:', error);
    res.status(500).json({ message: 'Failed to export leads' });
  }
});

export default router;
