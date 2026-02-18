import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { leads, campaigns } from '@shared/schema';
import { eq, and, isNotNull, desc, asc, inArray } from 'drizzle-orm';
import { requireAuth } from '../auth';
import jwt from 'jsonwebtoken';
import { fetchTelnyxRecordings } from '../services/telnyx-sync-service';
import { getPlayableRecordingLink } from '../services/recording-link-resolver';
import { canonicalizeGcsRecordingUrl } from '../lib/recording-url-policy';

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
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        campaignId: leads.campaignId,
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
        const gcsRecordingUrl = canonicalizeGcsRecordingUrl({
          recordingS3Key: l.recordingS3Key,
          recordingUrl: l.recordingUrl,
        });
        return {
          ...l,
          recordingUrl: gcsRecordingUrl,
          hasRecording: !!gcsRecordingUrl,
          hasTranscript: !!l.hasTranscript,
          // Optionally, expose a "recordingAvailable" boolean for UI
          recordingAvailable: !!gcsRecordingUrl && l.recordingStatus === 'completed',
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
    // Get all campaigns with at least one approved/submitted lead
    const campaignsData = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
        status: campaigns.status,
      })
      .from(campaigns)
      .where(isNotNull(campaigns.id));
    res.json(campaignsData);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch campaigns', error: err instanceof Error ? err.message : err });
  }
});

// GET /api/client-portal/qualified-leads/recordings
// Added here as a hard fallback so this exact path never 404s.
router.get('/recordings', requireClientAuth, async (req, res) => {
  try {
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

    // Limit Telnyx fetch scope to requested page/batch size to avoid loading huge recording sets.
    const telnyxFetchPageSize = Math.min(100, pageSize);
    const telnyxFetchMaxPages = Math.max(1, page);

    const telnyxRecordings = await fetchTelnyxRecordings({
      startDate,
      endDate,
      phoneNumber: phone || undefined,
      pageSize: telnyxFetchPageSize,
      maxPages: telnyxFetchMaxPages,
    });

    const normalizedSearch = phone.replace(/\D/g, '');
    const filtered = telnyxRecordings
      .filter((recording) => {
        if (!normalizedSearch) return true;
        const from = (recording.from || '').replace(/\D/g, '');
        const to = (recording.to || '').replace(/\D/g, '');
        return from.includes(normalizedSearch) || to.includes(normalizedSearch);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize).map((recording) => ({
      id: recording.id,
      callControlId: recording.call_control_id || null,
      callLegId: recording.call_leg_id || null,
      callSessionId: recording.call_session_id || null,
      createdAt: recording.created_at,
      recordingStartedAt: recording.recording_started_at || null,
      recordingEndedAt: recording.recording_ended_at || null,
      from: recording.from || null,
      to: recording.to || null,
      durationMillis: recording.duration_millis || 0,
      durationSec: Math.floor((recording.duration_millis || 0) / 1000),
      status: recording.status,
      channels: recording.channels || null,
      hasMp3: Boolean(recording.download_urls?.mp3),
      hasWav: Boolean(recording.download_urls?.wav),
      primaryFormat: recording.download_urls?.mp3 ? 'mp3' : recording.download_urls?.wav ? 'wav' : null,
    }));

    res.json({ total, page, pageSize, items, source: 'telnyx' });
  } catch (error: any) {
    console.error('[CLIENT PORTAL QUALIFIED LEADS] Failed to list Telnyx recordings:', error);
    res.status(502).json({
      message: 'Failed to fetch recordings from Telnyx',
      details: error?.message || 'Unknown error',
    });
  }
});

// GET /api/client-portal/qualified-leads/recordings/:recordingId/stream
router.get('/recordings/:recordingId/stream', requireClientAuth, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const resolved = await getPlayableRecordingLink(recordingId);
    if (!resolved?.url) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(404).send('Recording audio not available');
    }

    const audioResponse = await fetch(resolved.url);
    if (!audioResponse.ok) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(502).send('Failed to fetch recording audio');
    }

    const upstreamContentType = (audioResponse.headers.get('content-type') || '').toLowerCase();
    const contentType =
      upstreamContentType.startsWith('audio/')
        ? upstreamContentType
        : (resolved.mimeType || 'audio/mpeg');
    const contentLength = audioResponse.headers.get('content-length');
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=300');

    const reader = audioResponse.body?.getReader();
    if (!reader) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(500).send('Failed to read audio stream');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(value);
    }
    res.end();
  } catch (error: any) {
    console.error('[CLIENT PORTAL QUALIFIED LEADS] Recording stream error:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/plain');
      res.status(500).send('Failed to stream recording');
    } else {
      res.end();
    }
  }
});

export default router;
