import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { leads, campaigns, callSessions, clientCampaignAccess, contacts, accounts } from '@shared/schema';
import { eq, and, isNotNull, desc, asc, inArray, like, or, sql } from 'drizzle-orm';
import { requireAuth } from '../auth';
import jwt from 'jsonwebtoken';
import { resolvePlayableRecordingUrl, buildCanonicalGcsUrlFromKey, canonicalizeGcsRecordingUrl } from '../lib/recording-url-policy';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";

interface ClientJWTPayload {
  clientUserId: string;
  clientAccountId: string;
  email: string;
  isClient: true;
}

function requireClientAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ message: "Invalid token - please log in again" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as ClientJWTPayload;
    if (!payload?.isClient) {
      return res.status(401).json({ message: "Invalid client token" });
    }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// GET /api/client-portal/qualified-leads
router.get('/', requireAuth, async (req, res) => {
  try {
    // Only show approved, submitted leads; allow controlled sorting.
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 25;
    const offset = (page - 1) * pageSize;
    const sortByParam = req.query.sortBy;
    const sortOrderParam = req.query.sortOrder;

    type QualifiedLeadSortField = 'approvedAt' | 'aiScore' | 'callDuration' | 'accountName';
    const sortBy: QualifiedLeadSortField =
      sortByParam === 'aiScore' ||
      sortByParam === 'callDuration' ||
      sortByParam === 'accountName' ||
      sortByParam === 'approvedAt'
        ? sortByParam
        : 'approvedAt';
    const isAscSort = sortOrderParam === 'asc';

    const sortColumns: Record<
      QualifiedLeadSortField,
      typeof leads.approvedAt | typeof leads.aiScore | typeof leads.callDuration | typeof leads.accountName
    > = {
      approvedAt: leads.approvedAt,
      aiScore: leads.aiScore,
      callDuration: leads.callDuration,
      accountName: leads.accountName,
    };
    const sortColumn = sortColumns[sortBy];

    const qualifiedLeadFilter = and(
      inArray(leads.qaStatus, ['approved', 'published']),
      eq(leads.submittedToClient, true),
      isNotNull(leads.contactId)
    );
    if (!qualifiedLeadFilter) {
      throw new Error('Failed to construct qualified lead filter');
    }

    const leadsResult = await db
      .select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: sql<string | null>`COALESCE(${accounts.name}, ${leads.accountName})`.as('account_name_resolved'),
        accountIndustry: sql<string | null>`COALESCE(${accounts.industryStandardized}, ${leads.accountIndustry})`.as('account_industry_resolved'),
        campaignId: leads.campaignId,
        campaignName: campaigns.name,
        aiScore: leads.aiScore,
        callDuration: leads.callDuration,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        telnyxRecordingId: leads.telnyxRecordingId,
        telnyxCallId: leads.telnyxCallId,
        recordingProvider: leads.recordingProvider,
        recordingStatus: leads.recordingStatus,
        hasTranscript: leads.transcript,
        qaStatus: leads.qaStatus,
        createdAt: leads.createdAt,
        approvedAt: leads.approvedAt,
      })
      .from(leads)
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .where(qualifiedLeadFilter)
      .orderBy(isAscSort ? asc(sortColumn) : desc(sortColumn))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ id: leads.id })
      .from(leads)
      .where(qualifiedLeadFilter);
    const total = countResult.length;

    res.json({
      leads: leadsResult.map(l => {
        const playableRecordingUrl = resolvePlayableRecordingUrl({
          recordingS3Key: l.recordingS3Key,
          recordingUrl: l.recordingUrl,
        });
        // Canonical GCS URL (permanent, non-presigned) — always available when storage key exists
        const gcsRecordingUrl =
          buildCanonicalGcsUrlFromKey(l.recordingS3Key) ||
          canonicalizeGcsRecordingUrl({ recordingUrl: l.recordingUrl, recordingS3Key: l.recordingS3Key });
        const hasRecording = !!(playableRecordingUrl || gcsRecordingUrl);
        return {
          ...l,
          recordingUrl: playableRecordingUrl || gcsRecordingUrl,
          gcsRecordingUrl,
          hasRecording,
          hasTranscript: !!l.hasTranscript,
          recordingAvailable: hasRecording,
        };
      }),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch qualified leads', error: err instanceof Error ? err.message : err });
  }
});

// GET /api/client-portal/qualified-leads/campaigns
router.get('/campaigns', requireAuth, async (req, res) => {
  try {
    // Get client account id from token
    const authHeader = req.headers.authorization;
    let clientAccountId: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = jwt.verify(token, JWT_SECRET) as ClientJWTPayload;
        clientAccountId = payload.clientAccountId;
      } catch {}
    }

    // Get campaigns with at least one approved/submitted lead and accessible to client
    const campaignWhereClauses = [isNotNull(campaigns.id)];

    // If clientAccountId is present, filter by access
    if (clientAccountId) {
      const accessRows = await db
        .select({ campaignId: clientCampaignAccess.regularCampaignId })
        .from(clientCampaignAccess)
        .where(
          and(
            eq(clientCampaignAccess.clientAccountId, clientAccountId),
            isNotNull(clientCampaignAccess.regularCampaignId)
          )
        );
      const accessibleCampaignIds = accessRows
        .map((row) => row.campaignId)
        .filter((id): id is string => Boolean(id));
      if (accessibleCampaignIds.length > 0) {
        campaignWhereClauses.push(inArray(campaigns.id, accessibleCampaignIds));
      } else {
        return res.json([]);
      }
    }

    const campaignsQuery = db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        status: campaigns.status,
      })
      .from(campaigns)
      .where(and(...campaignWhereClauses));

    // Only return campaigns with at least one approved/submitted lead
    const leadsResult = await db
      .select({ campaignId: leads.campaignId })
      .from(leads)
      .where(
        and(
          inArray(leads.qaStatus, ['approved', 'published']),
          eq(leads.submittedToClient, true),
          isNotNull(leads.contactId)
        )
      );
    const campaignIdsWithLeads = new Set(leadsResult.map(l => l.campaignId));

    const campaignsData = await campaignsQuery;
    const filteredCampaigns = campaignsData.filter(c => campaignIdsWithLeads.has(c.id));
    res.json(filteredCampaigns);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch campaigns', error: err instanceof Error ? err.message : err });
  }
});

// GET /api/client-portal/qualified-leads/recordings
// GCS URL-only listing (no Telnyx fetch, no streaming).
router.get('/recordings', requireClientAuth, async (req, res) => {
  try {
    const decoded = jwt.verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), JWT_SECRET) as ClientJWTPayload;
    const clientAccountId = decoded.clientAccountId;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || '25', 10)));
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (typeof req.query.startDate === 'string' && req.query.startDate.trim()) {
      const parsed = new Date(req.query.startDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'Invalid startDate' });
      }
      parsed.setHours(0, 0, 0, 0);
      startDate = parsed;
    }

    if (typeof req.query.endDate === 'string' && req.query.endDate.trim()) {
      const parsed = new Date(req.query.endDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'Invalid endDate' });
      }
      parsed.setHours(23, 59, 59, 999);
      endDate = parsed;
    }

    const accessRows = await db
      .select({ campaignId: clientCampaignAccess.regularCampaignId })
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

    const accessibleCampaignIds = accessRows
      .map((row) => row.campaignId)
      .filter((id): id is string => Boolean(id));

    if (accessibleCampaignIds.length === 0) {
      return res.json({ total: 0, page, pageSize, items: [], source: 'gcs' });
    }

    const conditions: any[] = [
      inArray(callSessions.campaignId, accessibleCampaignIds),
      or(
        isNotNull(callSessions.recordingS3Key),
        isNotNull(callSessions.recordingUrl),
      )!,
    ];

    if (phone) {
      const phoneTerm = `%${phone}%`;
      conditions.push(
        or(
          like(callSessions.toNumberE164, phoneTerm),
          like(callSessions.fromNumber, phoneTerm)
        )!
      );
    }

    if (startDate) {
      conditions.push(sql`${callSessions.createdAt} >= ${startDate}`);
    }

    if (endDate) {
      conditions.push(sql`${callSessions.createdAt} <= ${endDate}`);
    }

    const rows = await db
      .select({
        id: callSessions.id,
        callControlId: callSessions.telnyxCallId,
        createdAt: callSessions.createdAt,
        from: callSessions.fromNumber,
        to: callSessions.toNumberE164,
        durationSec: callSessions.durationSec,
        recordingStatus: callSessions.recordingStatus,
        recordingS3Key: callSessions.recordingS3Key,
        recordingUrl: callSessions.recordingUrl,
      })
      .from(callSessions)
      .where(and(...conditions))
      .orderBy(desc(callSessions.createdAt));

    const mapped = rows
      .map((row) => {
        const recordingUrl = resolvePlayableRecordingUrl({
          recordingS3Key: row.recordingS3Key,
          recordingUrl: row.recordingUrl,
        });

        if (!recordingUrl) return null;

        return {
          id: row.id,
          callControlId: row.callControlId || null,
          callLegId: null,
          callSessionId: row.id,
          createdAt: row.createdAt,
          recordingStartedAt: null,
          recordingEndedAt: null,
          from: row.from || null,
          to: row.to || null,
          durationMillis: Number(row.durationSec || 0) * 1000,
          durationSec: Number(row.durationSec || 0),
          status: row.recordingStatus || 'stored',
          channels: null,
          hasMp3: recordingUrl.includes('.mp3'),
          hasWav: recordingUrl.includes('.wav'),
          primaryFormat: recordingUrl.includes('.wav') ? 'wav' : 'mp3',
          recordingUrl,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const total = mapped.length;
    const offset = (page - 1) * pageSize;
    const items = mapped.slice(offset, offset + pageSize);

    res.json({ total, page, pageSize, items, source: 'gcs' });
  } catch (error: any) {
    console.error('[CLIENT PORTAL QUALIFIED LEADS] Failed to list recordings:', error);
    res.status(502).json({
      message: 'Failed to fetch recordings',
      details: error?.message || 'Unknown error',
    });
  }
});

// Streaming disabled: client portal should consume direct GCS recording URLs only.
router.get('/recordings/:recordingId/stream', requireClientAuth, async (_req, res) => {
  return res.status(410).json({
    message: 'Recording streaming is disabled. Use GCS recordingUrl from leads/recordings APIs.',
    gcsOnly: true,
  });
});

export default router;
