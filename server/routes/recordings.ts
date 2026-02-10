/**
 * Recordings API Router
 * 
 * Provides endpoints for:
 * - Listing call recordings with filters
 * - Getting individual recordings with presigned URLs
 * - Streaming recordings for playback
 * 
 * NOTE: Recordings are primarily stored in the `leads` table (recordingS3Key)
 * and in GCS under the 'recordings/' prefix.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { callSessions, campaigns, contacts, accounts, leads, dialerCallAttempts } from '@shared/schema';
import { eq, desc, and, gte, lte, like, or, sql, isNotNull, count } from 'drizzle-orm';
import { getCallSessionRecordingUrl, isRecordingStorageEnabled, getRecordingUrl } from '../services/recording-storage';

const AGENT_TYPES = ['human', 'ai'] as const;
const RECORDING_STATUSES = ['pending', 'failed', 'recording', 'uploading', 'stored'] as const;
const QA_STATUSES = ['new', 'under_review', 'approved', 'rejected', 'returned', 'published'] as const;

type AgentType = (typeof AGENT_TYPES)[number];
type RecordingStatus = (typeof RECORDING_STATUSES)[number];
type QAStatusType = (typeof QA_STATUSES)[number];

const normalizeAgentType = (value: unknown): AgentType | undefined =>
  typeof value === 'string' && AGENT_TYPES.includes(value as AgentType) ? (value as AgentType) : undefined;

const normalizeRecordingStatus = (value: unknown): RecordingStatus | undefined =>
  typeof value === 'string' && RECORDING_STATUSES.includes(value as RecordingStatus) ? (value as RecordingStatus) : undefined;

const normalizeQAStatus = (value: unknown): QAStatusType | undefined =>
  typeof value === 'string' && QA_STATUSES.includes(value as QAStatusType) ? (value as QAStatusType) : undefined;

const router = Router();

/**
 * GET /api/recordings
 * List recordings with filters
 *
 * Query params:
 * - campaignId: Filter by campaign
 * - agentType: 'ai' | 'human' | 'all'
 * - status: 'stored' | 'pending' | 'failed' | 'all'
 * - disposition: Filter by disposition (qualified, meeting_booked, callback, etc.)
 * - qualifiedOnly: 'true' to show only qualified dispositions for QA
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - search: Search in phone number or contact name/company
 * - page: Page number (1-indexed)
 * - limit: Items per page (default 20, max 100)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      agentType = 'all',
      status = 'all',
      disposition,
      qualifiedOnly,
      startDate,
      endDate,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions - query call_sessions where recordings are stored
    const conditions: any[] = [];

    // Only include sessions that have a recording of any kind
    conditions.push(
      or(
        isNotNull(callSessions.recordingS3Key),
        isNotNull(callSessions.recordingUrl)
      )
    );

    if (campaignId && campaignId !== 'all') {
      conditions.push(eq(callSessions.campaignId, campaignId as string));
    }

    if (startDate) {
      conditions.push(gte(callSessions.startedAt, new Date(startDate as string)));
    }

    if (endDate) {
      conditions.push(lte(callSessions.startedAt, new Date(endDate as string)));
    }

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          like(callSessions.toNumberE164, searchPattern),
          like(contacts.firstName, searchPattern),
          like(contacts.lastName, searchPattern),
          like(accounts.name, searchPattern)
        )
      );
    }

    const normalizedAgentType = normalizeAgentType(agentType);
    if (normalizedAgentType) {
      conditions.push(eq(callSessions.agentType, normalizedAgentType));
    }

    const normalizedStatus = normalizeRecordingStatus(status);
    if (normalizedStatus) {
      conditions.push(eq(callSessions.recordingStatus, normalizedStatus));
    }

    // Filter by specific disposition
    if (disposition && disposition !== 'all') {
      conditions.push(eq(callSessions.aiDisposition, disposition as string));
    }

    // Filter for qualified dispositions only (for QA analysis)
    const qualifiedDispositions = [
      'meeting_booked', 'callback_requested', 'callback', 'qualified',
      'lead', 'qualified_lead', 'positive_intent', 'expressed_interest'
    ];
    if (qualifiedOnly === 'true') {
      conditions.push(
        or(
          ...qualifiedDispositions.map(d => eq(callSessions.aiDisposition, d))
        )
      );
    }

    // Query call sessions with recordings, join contacts/campaigns/accounts
    const recordings = await db
      .select({
        id: callSessions.id,
        fromNumber: callSessions.fromNumber,
        toNumber: callSessions.toNumberE164,
        startedAt: callSessions.startedAt,
        endedAt: callSessions.endedAt,
        durationSec: callSessions.durationSec,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingDurationSec: callSessions.recordingDurationSec,
        recordingStatus: callSessions.recordingStatus,
        recordingFormat: callSessions.recordingFormat,
        recordingFileSizeBytes: callSessions.recordingFileSizeBytes,
        agentType: callSessions.agentType,
        aiDisposition: callSessions.aiDisposition,
        disposition: callSessions.aiDisposition,
        status: callSessions.status,
        campaignId: callSessions.campaignId,
        contactId: callSessions.contactId,
        aiAgentId: callSessions.aiAgentId,
        transcript: callSessions.aiTranscript,
        telnyxCallId: callSessions.telnyxCallId,
        // Join fields
        campaignName: campaigns.name,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        accountName: accounts.name,
      })
      .from(callSessions)
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .where(and(...conditions))
      .orderBy(desc(callSessions.startedAt))
      .limit(limitNum)
      .offset(offset);

    // Get total count for pagination (include joins since conditions may reference them)
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callSessions)
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .where(and(...conditions));
    
    const total = countResult[0]?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    // Deduplicate by telnyxCallId — keep the first (most recent due to ORDER BY desc)
    const seenCallIds = new Set<string>();
    const dedupedRecordings = recordings.filter(rec => {
      if (rec.telnyxCallId && seenCallIds.has(rec.telnyxCallId)) return false;
      if (rec.telnyxCallId) seenCallIds.add(rec.telnyxCallId);
      return true;
    });

    // Transform results
    const items = dedupedRecordings.map(rec => ({
      id: rec.id,
      fromNumber: rec.fromNumber,
      toNumber: rec.toNumber,
      startedAt: rec.startedAt?.toISOString(),
      endedAt: rec.endedAt?.toISOString() || null,
      durationSec: rec.durationSec,
      recordingDurationSec: rec.recordingDurationSec,
      recordingStatus: rec.recordingStatus || (rec.recordingS3Key ? 'stored' : 'pending'),
      recordingFormat: rec.recordingFormat || (rec.recordingS3Key?.endsWith('.wav') ? 'wav' : 'mp3'),
      fileSizeBytes: rec.recordingFileSizeBytes,
      hasRecording: !!(rec.recordingS3Key || rec.recordingUrl),
      agentType: rec.agentType as 'ai' | 'human',
      disposition: rec.aiDisposition || rec.disposition,
      status: rec.status,
      campaign: rec.campaignId ? {
        id: rec.campaignId,
        name: rec.campaignName,
      } : null,
      contact: rec.contactId ? {
        id: rec.contactId,
        name: [rec.contactFirstName, rec.contactLastName].filter(Boolean).join(' ') || null,
        accountName: rec.accountName || null,
      } : null,
      aiAgentId: rec.aiAgentId || null,
      hasTranscript: !!rec.transcript,
    }));

    res.json({
      success: true,
      recordings: items, // Frontend expects 'recordings' not 'data.items'
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      meta: {
        storageEnabled: isRecordingStorageEnabled(),
        source: 'call_sessions', // Indicates data is from call_sessions table
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error listing recordings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list recordings',
      message: error.message,
    });
  }
});

/**
 * GET /api/recordings/qa
 * Get recordings for QA analysis - qualified leads from leads table
 *
 * Query params:
 * - campaignId: Filter by campaign
 * - qaStatus: Filter by QA status (new, under_review, approved, rejected)
 * - qualificationStatus: Filter by AI qualification status (qualified, not_qualified, needs_review)
 * - page: Page number (1-indexed)
 * - limit: Items per page (default 20, max 100)
 */
router.get('/qa', async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      qaStatus = 'all',
      qualificationStatus,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions for qualified leads with recordings
    const conditions: any[] = [
      or(
        isNotNull(leads.recordingS3Key),
        isNotNull(leads.recordingUrl)
      )
    ];

    if (campaignId && campaignId !== 'all') {
      conditions.push(eq(leads.campaignId, campaignId as string));
    }

    const normalizedQAStatus = normalizeQAStatus(qaStatus);
    if (normalizedQAStatus) {
      conditions.push(eq(leads.qaStatus, normalizedQAStatus));
    }

    // Filter by AI qualification status if specified
    if (qualificationStatus && qualificationStatus !== 'all') {
      conditions.push(eq(leads.aiQualificationStatus, qualificationStatus as string));
    }

    // Get qualified leads with recordings, join with dialerCallAttempts for disposition
    const recordings = await db
      .select({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        dialedNumber: leads.dialedNumber,
        callDuration: leads.callDuration,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        transcript: leads.transcript,
        qaStatus: leads.qaStatus,
        aiScore: leads.aiScore,
        aiQualificationStatus: leads.aiQualificationStatus,
        campaignId: leads.campaignId,
        contactId: leads.contactId,
        accountName: leads.accountName,
        accountIndustry: leads.accountIndustry,
        callAttemptId: leads.callAttemptId,
        createdAt: leads.createdAt,
        campaignName: campaigns.name,
        // Get disposition from call attempt if available
        callAttemptDisposition: dialerCallAttempts.disposition,
        callAttemptAgentType: dialerCallAttempts.agentType,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .leftJoin(dialerCallAttempts, eq(leads.callAttemptId, dialerCallAttempts.id))
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(...conditions));

    const total = countResult[0]?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    const items = recordings.map(rec => ({
      id: rec.id,
      contactName: rec.contactName,
      contactEmail: rec.contactEmail,
      phone: rec.dialedNumber,
      callTimestamp: rec.createdAt?.toISOString(),
      callDuration: rec.callDuration,
      hasRecording: !!(rec.recordingS3Key || rec.recordingUrl),
      recordingStatus: rec.recordingS3Key ? 'stored' : (rec.recordingUrl ? 'pending' : 'none'),
      hasTranscript: !!rec.transcript,
      disposition: rec.callAttemptDisposition || rec.aiQualificationStatus,
      qaStatus: rec.qaStatus,
      aiScore: rec.aiScore,
      aiQualificationStatus: rec.aiQualificationStatus,
      agentType: rec.callAttemptAgentType || 'ai',
      campaign: rec.campaignId ? {
        id: rec.campaignId,
        name: rec.campaignName,
      } : null,
      accountName: rec.accountName,
      accountIndustry: rec.accountIndustry,
      createdAt: rec.createdAt?.toISOString(),
    }));

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },
      meta: {
        source: 'leads',
        forQA: true,
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error listing QA recordings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list QA recordings',
      message: error.message,
    });
  }
});

/**
 * GET /api/recordings/all
 * Unified endpoint that combines:
 * - Local call_sessions recordings
 * - Direct Telnyx API recordings (for any not yet in database)
 * 
 * Query params:
 * - source: 'all' | 'local' | 'telnyx' (default: 'all')
 * - startDate: ISO date string
 * - endDate: ISO date string  
 * - phoneNumber: Filter by phone number
 * - callId: Filter by call control ID
 * - search: General search term
 * - page: Page number
 * - limit: Items per page
 * 
 * NOTE: This must be defined BEFORE /:id route to avoid path conflicts
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const {
      source = 'all',
      startDate,
      endDate,
      phoneNumber,
      callId,
      search,
      minDurationSec,
      maxDurationSec,
      page = '1',
      limit = '20',
    } = req.query;

    const parseDurationParam = (value: unknown) => {
      if (!value || Array.isArray(value)) return undefined;
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return undefined;
      return Math.max(0, Math.round(parsed));
    };

    const minDurationFilter = parseDurationParam(minDurationSec);
    const maxDurationFilter = parseDurationParam(maxDurationSec);

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    const allRecordings: any[] = [];
    const seenCallIds = new Set<string>();
    const matchesDurationFilter = (duration: number | null | undefined) => {
      if (duration == null) return true;
      if (minDurationFilter !== undefined && duration < minDurationFilter) {
        return false;
      }
      if (maxDurationFilter !== undefined && duration > maxDurationFilter) {
        return false;
      }
      return true;
    };

    // 1. Fetch from local database (call_sessions)
    if (source === 'all' || source === 'local') {
      const conditions: any[] = [
        or(
          isNotNull(callSessions.recordingS3Key),
          isNotNull(callSessions.recordingUrl)
        )
      ];
      const durationExpression = sql<number>`COALESCE(${callSessions.recordingDurationSec}, ${callSessions.durationSec})`;
      if (minDurationFilter !== undefined) {
        conditions.push(gte(durationExpression, minDurationFilter));
      }
      if (maxDurationFilter !== undefined) {
        conditions.push(lte(durationExpression, maxDurationFilter));
      }

      if (startDate) {
        conditions.push(gte(callSessions.startedAt, new Date(startDate as string)));
      }
      if (endDate) {
        conditions.push(lte(callSessions.startedAt, new Date(endDate as string)));
      }
      if (phoneNumber) {
        const phonePattern = `%${phoneNumber}%`;
        conditions.push(
          or(
            like(callSessions.toNumberE164, phonePattern),
            like(callSessions.fromNumber, phonePattern)
          )
        );
      }
      if (callId) {
        conditions.push(eq(callSessions.telnyxCallId, callId as string));
      }
      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(
          or(
            like(callSessions.toNumberE164, searchPattern),
            like(callSessions.fromNumber, searchPattern),
            like(callSessions.telnyxCallId, searchPattern),
            like(contacts.firstName, searchPattern),
            like(contacts.lastName, searchPattern)
          )
        );
      }

      const localRecordings = await db
        .select({
          id: callSessions.id,
          telnyxCallId: callSessions.telnyxCallId,
          fromNumber: callSessions.fromNumber,
          toNumber: callSessions.toNumberE164,
          startedAt: callSessions.startedAt,
          endedAt: callSessions.endedAt,
          durationSec: callSessions.durationSec,
          recordingUrl: callSessions.recordingUrl,
          recordingS3Key: callSessions.recordingS3Key,
          recordingDurationSec: callSessions.recordingDurationSec,
          recordingStatus: callSessions.recordingStatus,
          recordingFormat: callSessions.recordingFormat,
          agentType: callSessions.agentType,
          aiDisposition: callSessions.aiDisposition,
          aiTranscript: callSessions.aiTranscript,
          campaignId: callSessions.campaignId,
          contactId: callSessions.contactId,
          campaignName: campaigns.name,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          aiAgentSettings: campaigns.aiAgentSettings,
          // Lead information (if recording is already a lead)
          leadId: leads.id,
          leadQaStatus: leads.qaStatus,
        })
        .from(callSessions)
        .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
        .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
        .leftJoin(leads, eq(callSessions.telnyxCallId, leads.telnyxCallId))
        .where(and(...conditions))
        .orderBy(desc(callSessions.startedAt));

      // Deduplicate by callSessions.id — the leads leftJoin can produce
      // multiple rows for the same session when several leads share a telnyxCallId
      const seenSessionIds = new Set<string>();

      for (const rec of localRecordings) {
        if (seenSessionIds.has(rec.id)) continue;
        seenSessionIds.add(rec.id);

        if (rec.telnyxCallId) {
          seenCallIds.add(rec.telnyxCallId);
        }

        const contactName = [rec.contactFirstName, rec.contactLastName].filter(Boolean).join(' ') || null;
        const aiSettings = rec.aiAgentSettings as any;
        const agentName = aiSettings?.persona?.name || aiSettings?.persona?.agentName || null;

        allRecordings.push({
          id: rec.id,
          telnyxCallId: rec.telnyxCallId,
          fromNumber: rec.fromNumber,
          toNumber: rec.toNumber,
          contactName,
          contactPhone: rec.toNumber,
          contactId: rec.contactId,
          campaignId: rec.campaignId,
          campaignName: rec.campaignName,
          agentName,
          startedAt: rec.startedAt?.toISOString(),
          endedAt: rec.endedAt?.toISOString(),
          durationSec: rec.recordingDurationSec || rec.durationSec, // Include for display
          recordingDurationSec: rec.recordingDurationSec || rec.durationSec,
          recordingStatus: rec.recordingStatus || (rec.recordingS3Key ? 'stored' : 'pending'),
          recordingFormat: rec.recordingFormat,
          recordingUrl: rec.recordingUrl, // Include for direct playback
          recordingS3Key: rec.recordingS3Key, // Include to determine if stored in GCS
          agentType: rec.agentType,
          disposition: rec.aiDisposition,
          hasTranscript: !!rec.aiTranscript,
          hasRecording: !!(rec.recordingS3Key || rec.recordingUrl),
          source: 'local',
          // Lead tracking - if this recording is already linked to a lead
          leadId: rec.leadId || null,
          leadQaStatus: rec.leadQaStatus || null,
        });
      }
    }

    // 2. Fetch from Telnyx API (for recordings not yet synced)
    if (source === 'all' || source === 'telnyx') {
      try {
        const { getTelnyxRecordingsForDashboard } = await import('../services/telnyx-sync-service');
        
        const telnyxResult = await getTelnyxRecordingsForDashboard({
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
          phoneNumber: phoneNumber as string | undefined,
          callId: callId as string | undefined,
          page: 1,
          limit: 500, // Fetch more to merge with local
        });

        // Add Telnyx recordings that aren't already in local
        // Build a phone+time index for fuzzy dedup when telnyxCallId doesn't match
        const localPhoneTimeKeys = new Set<string>();
        for (const r of allRecordings) {
          if (r.toNumber && r.startedAt) {
            // Round to nearest 2-minute window for fuzzy matching
            const ts = Math.floor(new Date(r.startedAt).getTime() / 120_000);
            localPhoneTimeKeys.add(`${r.toNumber}|${ts}`);
            // Also add adjacent window to handle edge cases
            localPhoneTimeKeys.add(`${r.toNumber}|${ts - 1}`);
            localPhoneTimeKeys.add(`${r.toNumber}|${ts + 1}`);
          }
        }

        for (const rec of telnyxResult.recordings) {
          if (!matchesDurationFilter(rec.recordingDurationSec ?? rec.durationSec)) {
            continue;
          }
          // Skip if telnyxCallId already seen
          if (seenCallIds.has(rec.telnyxCallId)) {
            continue;
          }
          // Also skip if same phone + similar time already in local recordings
          if (rec.toNumber && rec.startedAt) {
            const ts = Math.floor(new Date(rec.startedAt).getTime() / 120_000);
            if (localPhoneTimeKeys.has(`${rec.toNumber}|${ts}`)) {
              continue;
            }
          }
          allRecordings.push({
            ...rec,
            contactName: null,
            contactPhone: rec.toNumber,
            campaignId: null,
            campaignName: null,
            disposition: null,
            hasTranscript: false,
            agentType: 'ai',
          });
        }
      } catch (telnyxError) {
        console.error('[Recordings API] Error fetching from Telnyx:', telnyxError);
        // Continue with local recordings only
      }
    }

    // Sort by date descending
    allRecordings.sort((a, b) => {
      const dateA = new Date(a.startedAt || 0).getTime();
      const dateB = new Date(b.startedAt || 0).getTime();
      return dateB - dateA;
    });

    // Apply pagination
    const total = allRecordings.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedRecordings = allRecordings.slice(offset, offset + limitNum);

    res.json({
      success: true,
      recordings: paginatedRecordings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      meta: {
        source: source as string,
        localCount: allRecordings.filter(r => r.source === 'local').length,
        telnyxCount: allRecordings.filter(r => r.source === 'telnyx').length,
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error fetching all recordings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recordings',
      message: error.message,
    });
  }
});

/**
 * GET /api/recordings/:id
 * Get a single recording with presigned URL
 *
 * UPDATED: First tries call_sessions table (from main list),
 * then falls back to leads table (for QA recordings)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { source } = req.query; // Optional: 'call_sessions' or 'leads' to force source

    // First try call_sessions (primary source from main recordings list)
    if (source !== 'leads') {
      const [callSession] = await db
        .select({
          id: callSessions.id,
          telnyxCallId: callSessions.telnyxCallId,
          fromNumber: callSessions.fromNumber,
          toNumber: callSessions.toNumberE164,
          startedAt: callSessions.startedAt,
          endedAt: callSessions.endedAt,
          durationSec: callSessions.durationSec,
          recordingUrl: callSessions.recordingUrl,
          recordingS3Key: callSessions.recordingS3Key,
          recordingDurationSec: callSessions.recordingDurationSec,
          recordingStatus: callSessions.recordingStatus,
          recordingFormat: callSessions.recordingFormat,
          recordingFileSizeBytes: callSessions.recordingFileSizeBytes,
          agentType: callSessions.agentType,
          aiDisposition: callSessions.aiDisposition,
          aiTranscript: callSessions.aiTranscript,
          aiAnalysis: callSessions.aiAnalysis,
          status: callSessions.status,
          campaignId: callSessions.campaignId,
          contactId: callSessions.contactId,
          aiAgentId: callSessions.aiAgentId,
          campaignName: campaigns.name,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          contactEmail: contacts.email,
          contactPhone: contacts.directPhoneE164,
          contactJobTitle: contacts.jobTitle,
          accountName: accounts.name,
        })
        .from(callSessions)
        .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
        .where(eq(callSessions.id, id));

      if (callSession) {
        // Get presigned URL for playback
        let playbackUrl: string | null = null;
        let playbackSource: string = 'unknown';

        if (callSession.recordingS3Key) {
          try {
            const urlResult = await getCallSessionRecordingUrl(id);
            playbackUrl = urlResult.url;
            playbackSource = urlResult.source || 'gcs';
          } catch (err) {
            console.error('[Recordings API] Error getting presigned URL from call_sessions:', err);
          }
        } else if (callSession.recordingUrl) {
          playbackUrl = callSession.recordingUrl;
          playbackSource = 'telnyx';
        }

        const contactName = [callSession.contactFirstName, callSession.contactLastName].filter(Boolean).join(' ') || null;

        return res.json({
          success: true,
          data: {
            id: callSession.id,
            telnyxCallId: callSession.telnyxCallId,
            fromNumber: callSession.fromNumber,
            toNumber: callSession.toNumber,
            startedAt: callSession.startedAt?.toISOString(),
            endedAt: callSession.endedAt?.toISOString() || null,
            durationSec: callSession.durationSec,
            recordingDurationSec: callSession.recordingDurationSec,
            recordingStatus: callSession.recordingStatus || (callSession.recordingS3Key ? 'stored' : 'pending'),
            recordingFormat: callSession.recordingFormat || (callSession.recordingS3Key?.endsWith('.wav') ? 'wav' : 'mp3'),
            fileSizeBytes: callSession.recordingFileSizeBytes,
            playbackUrl,
            playbackSource,
            agentType: callSession.agentType || 'ai',
            disposition: callSession.aiDisposition,
            transcript: callSession.aiTranscript,
            analysis: callSession.aiAnalysis,
            status: callSession.status,
            campaign: callSession.campaignId ? {
              id: callSession.campaignId,
              name: callSession.campaignName,
            } : null,
            contact: callSession.contactId ? {
              id: callSession.contactId,
              name: contactName,
              firstName: callSession.contactFirstName,
              lastName: callSession.contactLastName,
              email: callSession.contactEmail,
              phone: callSession.contactPhone,
              jobTitle: callSession.contactJobTitle,
              accountName: callSession.accountName,
            } : null,
            aiAgentId: callSession.aiAgentId || null,
          },
          meta: {
            source: 'call_sessions',
          },
        });
      }
    }

    // Fallback to leads table (for QA recordings and backward compatibility)
    const [recording] = await db
      .select({
        id: leads.id,
        dialedNumber: leads.dialedNumber,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: leads.accountName,
        callDuration: leads.callDuration,
        recordingUrl: leads.recordingUrl,
        recordingS3Key: leads.recordingS3Key,
        transcript: leads.transcript,
        qaStatus: leads.qaStatus,
        aiQualificationStatus: leads.aiQualificationStatus,
        callAttemptId: leads.callAttemptId,
        campaignId: leads.campaignId,
        contactId: leads.contactId,
        createdAt: leads.createdAt,
        campaignName: campaigns.name,
        // Join contact for additional details
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactJobTitle: contacts.jobTitle,
        contactPhone: contacts.directPhoneE164,
        contactAccountId: contacts.accountId,
        // Get disposition and agentType from call attempt if available
        callAttemptDisposition: dialerCallAttempts.disposition,
        callAttemptAgentType: dialerCallAttempts.agentType,
      })
      .from(leads)
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(dialerCallAttempts, eq(leads.callAttemptId, dialerCallAttempts.id))
      .where(eq(leads.id, id));

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    // Get presigned URL for playback from GCS
    let playbackUrl: string | null = null;
    let playbackSource: string = 'unknown';

    if (recording.recordingS3Key) {
      try {
        const urlResult = await getRecordingUrl(id);
        playbackUrl = urlResult.url;
        playbackSource = urlResult.source || 'gcs';
      } catch (err) {
        console.error('[Recordings API] Error getting presigned URL:', err);
      }
    } else if (recording.recordingUrl) {
      playbackUrl = recording.recordingUrl;
      playbackSource = 'telnyx';
    }

    // Build contact name from available data
    const contactDisplayName = recording.contactName ||
      [recording.contactFirstName, recording.contactLastName].filter(Boolean).join(' ') ||
      'Unknown';

    res.json({
      success: true,
      data: {
        id: recording.id,
        telnyxCallId: null,
        fromNumber: null,
        toNumber: recording.dialedNumber || recording.contactPhone,
        startedAt: recording.createdAt?.toISOString(),
        endedAt: null,
        durationSec: recording.callDuration,
        recordingDurationSec: recording.callDuration,
        recordingStatus: recording.recordingS3Key ? 'stored' : 'pending',
        recordingFormat: recording.recordingS3Key?.endsWith('.wav') ? 'wav' : 'mp3',
        fileSizeBytes: null,
        playbackUrl,
        playbackSource,
        agentType: recording.callAttemptAgentType || 'ai',
        disposition: recording.callAttemptDisposition || recording.aiQualificationStatus || recording.qaStatus,
        transcript: recording.transcript,
        analysis: null,
        status: recording.qaStatus,
        campaign: recording.campaignId ? {
          id: recording.campaignId,
          name: recording.campaignName,
        } : null,
        contact: {
          id: recording.contactId || recording.id,
          name: contactDisplayName,
          firstName: recording.contactFirstName,
          lastName: recording.contactLastName,
          email: recording.contactEmail,
          phone: recording.dialedNumber || recording.contactPhone,
          jobTitle: recording.contactJobTitle,
          accountName: recording.accountName,
        },
        aiAgentId: null,
      },
      meta: {
        source: 'leads',
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error getting recording:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recording',
      message: error.message,
    });
  }
});

/**
 * GET /api/recordings/:id/url
 * Get just the presigned URL for a recording (lightweight endpoint for audio player)
 *
 * UPDATED: Fetches fresh URLs from Telnyx API since stored URLs expire after 10 minutes
 */
router.get('/:id/url', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { source: requestedSource } = req.query;

    let url: string | null = null;
    let source: string = 'unknown';
    let dataSource: string = 'unknown';

    // First try call_sessions (primary source from main recordings list)
    if (requestedSource !== 'leads') {
      const [callSession] = await db
        .select({
          recordingUrl: callSessions.recordingUrl,
          recordingS3Key: callSessions.recordingS3Key,
          telnyxCallId: callSessions.telnyxCallId,
        })
        .from(callSessions)
        .where(eq(callSessions.id, id));

      if (callSession) {
        dataSource = 'call_sessions';

        // Priority 1: S3/GCS key (our own storage - never expires)
        if (callSession.recordingS3Key) {
          try {
            const urlResult = await getCallSessionRecordingUrl(id);
            url = urlResult.url;
            source = urlResult.source || 'gcs';
          } catch (err) {
            console.error('[Recordings API] Error getting presigned URL from call_sessions:', err);
          }
        }
        
        // Priority 2: Fetch fresh URL from Telnyx API (stored URLs expire)
        if (!url && callSession.telnyxCallId) {
          try {
            const { fetchTelnyxRecording } = await import('../services/telnyx-recordings');
            const freshUrl = await fetchTelnyxRecording(callSession.telnyxCallId);
            if (freshUrl) {
              url = freshUrl;
              source = 'telnyx_fresh';
            }
          } catch (err) {
            console.error('[Recordings API] Error fetching fresh URL from Telnyx:', err);
          }
        }
        
        // Priority 3: Try stored URL as fallback (might be expired)
        if (!url && callSession.recordingUrl) {
          url = callSession.recordingUrl;
          source = 'telnyx_cached';
        }
      }
    }

    // Fallback to leads table if not found in call_sessions
    if (!url) {
      const [recording] = await db
        .select({
          recordingUrl: leads.recordingUrl,
          recordingS3Key: leads.recordingS3Key,
          telnyxCallId: leads.telnyxCallId,
        })
        .from(leads)
        .where(eq(leads.id, id));

      if (recording) {
        dataSource = 'leads';

        // Priority 1: S3/GCS key
        if (recording.recordingS3Key) {
          try {
            const urlResult = await getRecordingUrl(id);
            url = urlResult.url;
            source = urlResult.source || 'gcs';
          } catch (err) {
            console.error('[Recordings API] Error getting presigned URL from leads:', err);
          }
        }
        
        // Priority 2: Fetch fresh URL from Telnyx
        if (!url && recording.telnyxCallId) {
          try {
            const { fetchTelnyxRecording } = await import('../services/telnyx-recordings');
            const freshUrl = await fetchTelnyxRecording(recording.telnyxCallId);
            if (freshUrl) {
              url = freshUrl;
              source = 'telnyx_fresh';
            }
          } catch (err) {
            console.error('[Recordings API] Error fetching fresh URL from Telnyx:', err);
          }
        }
        
        // Priority 3: Stored URL as fallback
        if (!url && recording.recordingUrl) {
          url = recording.recordingUrl;
          source = 'telnyx_cached';
        }
      }
    }

    // If still no URL, try fetching by ID as a Telnyx recording ID
    if (!url) {
      try {
        const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
        if (TELNYX_API_KEY) {
          const response = await fetch(`https://api.telnyx.com/v2/recordings/${id}`, {
            headers: {
              'Authorization': `Bearer ${TELNYX_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            url = data.data?.download_urls?.mp3 || data.data?.download_urls?.wav;
            source = 'telnyx_direct';
            dataSource = 'telnyx_api';
          }
        }
      } catch (e) {
        console.log('[Recordings API] Not a direct Telnyx recording ID:', id);
      }
    }

    if (!url) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found or no recording available',
      });
    }

    res.json({
      success: true,
      data: {
        url,
        source,
        dataSource,
        expiresIn: source === 'gcs' ? '7 days' : source.includes('fresh') ? '10 minutes' : 'may be expired',
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error getting recording URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recording URL',
      message: error.message,
    });
  }
});

/**
 * GET /api/recordings/:id/stream
 * Stream the audio file through our server (proxy to bypass CORS)
 * This allows the browser to play audio from Telnyx without CORS issues
 *
 * Tries sources in order:
 * 1. GCS storage (if recordingS3Key exists)
 * 2. Fresh Telnyx API URL (if telnyxCallId exists)
 * 3. Cached recordingUrl from database
 * 4. Direct Telnyx recording ID lookup
 */
export async function streamRecording(req: Request, res: Response) {
  try {
    const { id } = req.params;

    let audioUrl: string | null = null;
    let urlSource: string = 'unknown';
    const triedSources: string[] = [];

    // First try to get URL from call_sessions
    const [callSession] = await db
      .select({
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
        telnyxCallId: callSessions.telnyxCallId,
        telnyxRecordingId: callSessions.telnyxRecordingId,
      })
      .from(callSessions)
      .where(eq(callSessions.id, id));

    if (callSession) {
      // Priority 1: GCS storage (permanent, reliable)
      if (callSession.recordingS3Key) {
        triedSources.push('gcs');
        try {
          const urlResult = await getCallSessionRecordingUrl(id);
          if (urlResult.url) {
            audioUrl = urlResult.url;
            urlSource = 'gcs';
          }
        } catch (err: any) {
          console.warn(`[Recordings API] GCS URL failed for ${id}:`, err.message);
        }
      }

      // Priority 2: Telnyx Recording ID (stable identifier, always gets fresh URL)
      if (!audioUrl && callSession.telnyxRecordingId) {
        triedSources.push('telnyx_recording_id');
        try {
          const { fetchUrlByTelnyxRecordingId } = await import('../services/recording-link-resolver');
          const result = await fetchUrlByTelnyxRecordingId(callSession.telnyxRecordingId);
          if (result) {
            audioUrl = result.url;
            urlSource = 'telnyx_recording_id';
          }
        } catch (err: any) {
          console.warn(`[Recordings API] Telnyx recording ID lookup failed for ${id}:`, err.message);
        }
      }

      // Priority 3: Fresh Telnyx URL via call_control_id (fetches new presigned URL from API)
      if (!audioUrl && callSession.telnyxCallId) {
        triedSources.push('telnyx_fresh');
        try {
          const { fetchTelnyxRecording } = await import('../services/telnyx-recordings');
          const freshUrl = await fetchTelnyxRecording(callSession.telnyxCallId);
          if (freshUrl) {
            audioUrl = freshUrl;
            urlSource = 'telnyx_fresh';
          }
        } catch (err: any) {
          console.warn(`[Recordings API] Fresh Telnyx URL failed for ${id}:`, err.message);
        }
      }

      // Priority 3: Cached URL (may be expired but worth trying)
      if (!audioUrl && callSession.recordingUrl) {
        triedSources.push('cached');
        audioUrl = callSession.recordingUrl;
        urlSource = 'cached';
      }
    }

    // Fallback: try leads table
    if (!audioUrl) {
      const [lead] = await db
        .select({
          recordingUrl: leads.recordingUrl,
          recordingS3Key: leads.recordingS3Key,
          telnyxCallId: leads.telnyxCallId,
        })
        .from(leads)
        .where(eq(leads.id, id));

      if (lead) {
        if (lead.recordingS3Key) {
          triedSources.push('leads_gcs');
          try {
            const urlResult = await getRecordingUrl(id);
            if (urlResult.url) {
              audioUrl = urlResult.url;
              urlSource = 'leads_gcs';
            }
          } catch (err: any) {
            console.warn(`[Recordings API] Leads GCS URL failed for ${id}:`, err.message);
          }
        }

        // Try fresh Telnyx URL for lead
        if (!audioUrl && lead.telnyxCallId) {
          triedSources.push('leads_telnyx_fresh');
          try {
            const { fetchTelnyxRecording } = await import('../services/telnyx-recordings');
            const freshUrl = await fetchTelnyxRecording(lead.telnyxCallId);
            if (freshUrl) {
              audioUrl = freshUrl;
              urlSource = 'leads_telnyx_fresh';
            }
          } catch (err: any) {
            console.warn(`[Recordings API] Leads fresh Telnyx URL failed for ${id}:`, err.message);
          }
        }

        if (!audioUrl && lead.recordingUrl) {
          triedSources.push('leads_cached');
          audioUrl = lead.recordingUrl;
          urlSource = 'leads_cached';
        }
      }
    }

    // Fallback: try dialer_call_attempts table
    if (!audioUrl) {
      const [dialerAttempt] = await db
        .select({
          recordingUrl: dialerCallAttempts.recordingUrl,
          telnyxCallId: dialerCallAttempts.telnyxCallId,
        })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, id));

      if (dialerAttempt) {
        // Try fresh Telnyx URL for dialer attempt
        if (!audioUrl && dialerAttempt.telnyxCallId) {
          triedSources.push('dialer_telnyx_fresh');
          try {
            const { fetchTelnyxRecording } = await import('../services/telnyx-recordings');
            const freshUrl = await fetchTelnyxRecording(dialerAttempt.telnyxCallId);
            if (freshUrl) {
              audioUrl = freshUrl;
              urlSource = 'dialer_telnyx_fresh';
            }
          } catch (err: any) {
            console.warn(`[Recordings API] Dialer fresh Telnyx URL failed for ${id}:`, err.message);
          }
        }

        if (!audioUrl && dialerAttempt.recordingUrl) {
          triedSources.push('dialer_cached');
          audioUrl = dialerAttempt.recordingUrl;
          urlSource = 'dialer_cached';
        }
      }
    }

    // Final fallback: try as Telnyx recording ID directly
    if (!audioUrl) {
      triedSources.push('telnyx_direct');
      try {
        const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
        if (TELNYX_API_KEY) {
          const response = await fetch(`https://api.telnyx.com/v2/recordings/${id}`, {
            headers: {
              'Authorization': `Bearer ${TELNYX_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            const directUrl = data.data?.download_urls?.mp3 || data.data?.download_urls?.wav;
            if (directUrl) {
              audioUrl = directUrl;
              urlSource = 'telnyx_direct';
            }
          }
        }
      } catch (e) {
        console.log('[Recordings API] Not a direct Telnyx recording ID:', id);
      }
    }

    if (!audioUrl) {
      console.error(`[Recordings API] No audio URL found for ${id}. Tried sources: ${triedSources.join(', ')}`);
      return res.status(404).json({
        success: false,
        error: 'Recording audio not available',
        details: `Tried sources: ${triedSources.join(', ')}. Recording may have expired or storage failed.`,
      });
    }

    // Fetch and stream the audio
    console.log(`[Recordings API] Streaming ${id} from ${urlSource}: ${audioUrl.substring(0, 80)}...`);

    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      console.error(`[Recordings API] Failed to fetch audio from ${urlSource}:`, audioResponse.status, audioResponse.statusText);

      // If cached URL failed (likely expired), return helpful message
      if (urlSource === 'cached' || urlSource === 'leads_cached') {
        return res.status(410).json({
          success: false,
          error: 'Recording URL has expired',
          details: 'The Telnyx recording URL has expired (10-min lifetime). Recording may need to be re-synced.',
        });
      }

      return res.status(502).json({
        success: false,
        error: 'Failed to fetch audio from source',
        details: `Source: ${urlSource}, Status: ${audioResponse.status}`,
      });
    }

    // Set appropriate headers for audio streaming
    const contentType = audioResponse.headers.get('content-type') || 'audio/mpeg';
    const contentLength = audioResponse.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Stream the response
    const reader = audioResponse.body?.getReader();
    if (!reader) {
      return res.status(500).json({ success: false, error: 'Failed to read audio stream' });
    }

    const stream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch (err) {
        console.error('[Recordings API] Stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Stream interrupted' });
        }
      }
    };

    stream();
  } catch (error: any) {
    console.error('[Recordings API] Error streaming recording:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stream recording',
      message: error.message,
    });
  }
}

// Also register on router for backwards compatibility (when auth middleware handles it)
router.get('/:id/stream', streamRecording);

/**
 * POST /api/recordings/:id/recording-link
 * Get a fresh playable recording URL on-demand.
 *
 * Uses the recording-link-resolver to generate a fresh URL from:
 *   1. GCS presigned URL (permanent storage)
 *   2. Telnyx Recording ID (stable, always fresh)
 *   3. Telnyx Call Control ID search (fallback)
 *   4. Cached URL (last resort)
 *
 * Response: { url, expiresInSeconds, mimeType, source }
 *
 * Auth: requireAuth (applied at router level)
 */
router.post('/:id/recording-link', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { getPlayableRecordingLink } = await import('../services/recording-link-resolver');
    const result = await getPlayableRecordingLink(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
        message: 'No recording exists for this conversation, or the recording has been permanently deleted.',
      });
    }

    // Log audit event (no raw URLs logged — only IDs and source)
    console.log(`[Recording Link] Generated link for ${id} from ${result.source}${result.telnyxRecordingId ? ` (rec: ${result.telnyxRecordingId})` : ''}`);

    return res.json({
      success: true,
      url: result.url,
      expiresInSeconds: result.expiresInSeconds,
      mimeType: result.mimeType,
      source: result.source,
    });
  } catch (error: any) {
    console.error('[Recording Link] Error resolving link:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to resolve recording link',
      message: error.message,
    });
  }
});


/**
 * GET /api/recordings/stats
 * Get recording statistics
 * 
 * NOW queries from leads table where recordings are stored in GCS
 */
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const { campaignId, startDate, endDate } = req.query;

    // Build conditions for leads with recordings in GCS
    const conditions: any[] = [isNotNull(leads.recordingS3Key)];

    if (campaignId && campaignId !== 'all') {
      conditions.push(eq(leads.campaignId, campaignId as string));
    }

    if (startDate) {
      conditions.push(gte(leads.createdAt, new Date(startDate as string)));
    }

    if (endDate) {
      conditions.push(lte(leads.createdAt, new Date(endDate as string)));
    }

    const whereClause = and(...conditions);

    // Get counts from leads with recordings
    const stats = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalDurationSec: sql<number>`coalesce(sum(${leads.callDuration}), 0)::int`,
      })
      .from(leads)
      .where(whereClause);

    const totalRecordings = stats[0]?.count || 0;
    const totalDuration = stats[0]?.totalDurationSec || 0;
    
    // Estimate storage (rough: ~16KB per second for compressed audio)
    const estimatedSizeBytes = totalDuration * 1024 * 16;

    const byStatus: Record<string, { count: number; durationSec: number; sizeBytes: number }> = {
      stored: {
        count: totalRecordings,
        durationSec: totalDuration,
        sizeBytes: estimatedSizeBytes,
      },
    };

    res.json({
      success: true,
      data: {
        total: totalRecordings,
        stored: totalRecordings, // All with recordingS3Key are stored in GCS
        totalDurationSec: totalDuration,
        totalDurationFormatted: formatDuration(totalDuration),
        totalFileSizeBytes: estimatedSizeBytes,
        totalFileSizeFormatted: formatFileSize(estimatedSizeBytes),
        byStatus,
        storageEnabled: isRecordingStorageEnabled(),
        source: 'leads', // Indicates data is from leads table with GCS storage
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recording stats',
      message: error.message,
    });
  }
});

// Helper functions
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ============================================================================
// TELNYX DIRECT RECORDINGS ENDPOINTS
// ============================================================================

/**
 * GET /api/recordings/telnyx
 * Fetch recordings directly from Telnyx API (without database intermediary)
 * 
 * Query params:
 * - startDate: ISO date string (default: 30 days ago)
 * - endDate: ISO date string (default: now)
 * - phoneNumber: Filter by phone number
 * - callId: Filter by Telnyx call control ID
 * - page: Page number (1-indexed)
 * - limit: Items per page (default 20)
 */
router.get('/telnyx', async (req: Request, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      phoneNumber,
      callId,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

    // Import the sync service
    const { getTelnyxRecordingsForDashboard } = await import('../services/telnyx-sync-service');

    const result = await getTelnyxRecordingsForDashboard({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      phoneNumber: phoneNumber as string | undefined,
      callId: callId as string | undefined,
      page: pageNum,
      limit: limitNum,
    });

    res.json({
      success: true,
      recordings: result.recordings,
      pagination: result.pagination,
      meta: {
        source: 'telnyx_api',
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error fetching Telnyx recordings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Telnyx recordings',
      message: error.message,
    });
  }
});

/**
 * POST /api/recordings/telnyx/sync
 * Trigger a sync of Telnyx recordings to the local database
 * 
 * Body params:
 * - startDate: ISO date string (default: 30 days ago)
 * - endDate: ISO date string (default: now)
 * - phoneNumber: Optional filter by phone number
 */
router.post('/telnyx/sync', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, phoneNumber } = req.body;

    // Import the sync service
    const { syncTelnyxRecordingsToDatabase } = await import('../services/telnyx-sync-service');

    const result = await syncTelnyxRecordingsToDatabase({
      // Default: last 1 hour - Telnyx presigned URLs expire after 10 minutes
      startDate: startDate ? new Date(startDate) : new Date(Date.now() - 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate) : new Date(),
      phoneNumber,
    });

    res.json({
      success: result.success,
      data: {
        totalFetched: result.totalFetched,
        newRecordings: result.newRecordings,
        updatedRecordings: result.updatedRecordings,
        errors: result.errors,
      },
      message: `Synced ${result.newRecordings} new recordings, updated ${result.updatedRecordings} existing`,
    });
  } catch (error: any) {
    console.error('[Recordings API] Error syncing Telnyx recordings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync Telnyx recordings',
      message: error.message,
    });
  }
});

/**
 * POST /api/recordings/:id/transcribe
 * Trigger transcription for a recording
 * 
 * Works for both:
 * - call_sessions recordings (from database)
 * - direct Telnyx recordings (by recording ID)
 */
router.post('/:id/transcribe', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { source } = req.body; // 'telnyx' | 'call_sessions' | 'leads'

    // Import transcription service - uses Google Speech-to-Text (synchronous)
    const { submitTranscription } = await import('../services/google-transcription');
    // Use recording-link-resolver for fresh URL (never stale/expired)
    const { getPlayableRecordingLink } = await import('../services/recording-link-resolver');

    let recordingUrl: string | null = null;
    let recordSource: string = source || 'call_sessions';

    // Use the unified recording link resolver to get a fresh URL
    const linkResult = await getPlayableRecordingLink(id);
    if (linkResult) {
      recordingUrl = linkResult.url;
      recordSource = linkResult.source;
      console.log(`[Recordings API] Transcription using fresh URL from ${linkResult.source} for ${id}`);
    }

    if (!recordingUrl) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found or no audio URL available',
      });
    }

    console.log(`[Recordings API] Starting transcription for ${recordSource} recording: ${id}`);

    // Submit for transcription - Google Speech-to-Text returns transcript directly
    const transcriptText = await submitTranscription(recordingUrl);

    if (!transcriptText) {
      return res.status(500).json({
        success: false,
        error: 'Transcription failed - no text returned',
      });
    }

    console.log(`[Recordings API] Transcription completed for ${id}`);

    // Update the appropriate table with transcript
    if (recordSource === 'call_sessions') {
      await db
        .update(callSessions)
        .set({ aiTranscript: transcriptText })
        .where(eq(callSessions.id, id));
    } else if (recordSource === 'leads') {
      await db
        .update(leads)
        .set({
          transcript: transcriptText,
          transcriptionStatus: 'completed',
        })
        .where(eq(leads.id, id));
    }

    res.json({
      success: true,
      data: {
        recordId: id,
        source: recordSource,
        status: 'completed',
        transcriptLength: transcriptText.length,
        message: 'Transcription completed successfully.',
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error during transcription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to transcribe recording',
      message: error.message,
    });
  }
});

/**
 * POST /api/recordings/:id/push-to-lead
 * Push a call recording to QA as a qualified lead
 *
 * This creates a lead entry from the call_session data, linking the recording
 * to the QA workflow. Users can then review, approve, or reject the lead.
 *
 * Body params:
 * - notes: Optional notes about why this is being pushed as a lead
 */
router.post('/:id/push-to-lead', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = (req as any).user?.id;

    // Get the call session with all related data
    const [callSession] = await db
      .select({
        id: callSessions.id,
        telnyxCallId: callSessions.telnyxCallId,
        fromNumber: callSessions.fromNumber,
        toNumber: callSessions.toNumberE164,
        startedAt: callSessions.startedAt,
        endedAt: callSessions.endedAt,
        durationSec: callSessions.durationSec,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingDurationSec: callSessions.recordingDurationSec,
        aiDisposition: callSessions.aiDisposition,
        aiTranscript: callSessions.aiTranscript,
        campaignId: callSessions.campaignId,
        contactId: callSessions.contactId,
        // Contact details
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        contactJobTitle: contacts.jobTitle,
        contactAccountId: contacts.accountId,
        // Account details
        accountName: accounts.name,
        accountIndustry: accounts.industryStandardized,
      })
      .from(callSessions)
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(callSessions.id, id));

    if (!callSession) {
      return res.status(404).json({
        success: false,
        error: 'Call session not found',
      });
    }

    // Check if a lead already exists for this call session
    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.telnyxCallId, callSession.telnyxCallId || ''));

    if (existingLead) {
      return res.status(409).json({
        success: false,
        error: 'A lead already exists for this recording',
        leadId: existingLead.id,
      });
    }

    // Build contact name
    const contactName = [callSession.contactFirstName, callSession.contactLastName]
      .filter(Boolean)
      .join(' ') || null;

    // Create the lead
    const [newLead] = await db
      .insert(leads)
      .values({
        contactId: callSession.contactId,
        contactName: contactName,
        contactEmail: callSession.contactEmail,
        campaignId: callSession.campaignId,
        recordingUrl: callSession.recordingUrl,
        recordingS3Key: callSession.recordingS3Key,
        recordingStatus: callSession.recordingS3Key ? 'completed' : 'pending',
        callDuration: callSession.durationSec || callSession.recordingDurationSec,
        dialedNumber: callSession.toNumber,
        telnyxCallId: callSession.telnyxCallId,
        agentId: userId,
        qaStatus: 'new',
        accountName: callSession.accountName,
        accountIndustry: callSession.accountIndustry,
        transcript: callSession.aiTranscript,
        transcriptionStatus: callSession.aiTranscript ? 'completed' : null,
        notes: notes || `Pushed from recording dashboard at ${new Date().toISOString()}`,
        aiQualificationStatus: 'needs_review',
      })
      .returning({ id: leads.id });

    if (!newLead) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create lead',
      });
    }

    console.log(`[Recordings API] Created lead ${newLead.id} from call session ${id}`);

    res.json({
      success: true,
      leadId: newLead.id,
      message: 'Recording pushed to QA as qualified lead',
      data: {
        leadId: newLead.id,
        contactName,
        campaignId: callSession.campaignId,
        hasRecording: !!(callSession.recordingS3Key || callSession.recordingUrl),
        hasTranscript: !!callSession.aiTranscript,
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error pushing to lead:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to push recording to lead',
      message: error.message,
    });
  }
});

/**
 * POST /api/recordings/:id/retry-sync
 * Retry syncing a failed recording from Telnyx
 *
 * Attempts to:
 * 1. Fetch fresh recording URL from Telnyx using telnyxCallId
 * 2. Search Telnyx by phone number if telnyxCallId is missing
 * 3. Download and store to GCS
 * 4. Optionally trigger transcription
 *
 * Body params:
 * - transcribe: boolean (default: true) - whether to transcribe after storing
 */
router.post('/:id/retry-sync', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { transcribe = true } = req.body;

    console.log(`[Recordings API] Retrying sync for recording: ${id}`);

    // First try to get call session
    const [session] = await db
      .select({
        id: callSessions.id,
        toNumber: callSessions.toNumberE164,
        fromNumber: callSessions.fromNumber,
        startedAt: callSessions.startedAt,
        durationSec: callSessions.durationSec,
        telnyxCallId: callSessions.telnyxCallId,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
        campaignId: callSessions.campaignId,
      })
      .from(callSessions)
      .where(eq(callSessions.id, id));

    // If not found in call_sessions, check dialer_call_attempts
    if (!session) {
      const [dialerAttempt] = await db
        .select({
          id: dialerCallAttempts.id,
          phoneDialed: dialerCallAttempts.phoneDialed,
          callStartedAt: dialerCallAttempts.callStartedAt,
          callDurationSeconds: dialerCallAttempts.callDurationSeconds,
          telnyxCallId: dialerCallAttempts.telnyxCallId,
          recordingUrl: dialerCallAttempts.recordingUrl,
          fullTranscript: dialerCallAttempts.fullTranscript,
          aiTranscript: dialerCallAttempts.aiTranscript,
          callSessionId: dialerCallAttempts.callSessionId,
          campaignId: dialerCallAttempts.campaignId,
        })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, id));

      if (!dialerAttempt) {
        return res.status(404).json({
          success: false,
          error: 'Recording not found in call_sessions or dialer_call_attempts',
        });
      }

      // Handle dialer recording sync
      return await handleDialerRecordingSync(req, res, dialerAttempt, transcribe);
    }

    // If already stored, no need to retry
    if (session.recordingS3Key) {
      return res.json({
        success: true,
        message: 'Recording is already stored in GCS',
        data: { s3Key: session.recordingS3Key, status: 'already_stored' },
      });
    }

    let freshUrl: string | null = null;
    let source: string = 'unknown';

    // Strategy 1: Use telnyxCallId to fetch fresh URL
    if (session.telnyxCallId) {
      console.log(`[Recordings API] Strategy 1: Fetching via telnyxCallId: ${session.telnyxCallId}`);
      try {
        const { fetchTelnyxRecording } = await import('../services/telnyx-recordings');
        freshUrl = await fetchTelnyxRecording(session.telnyxCallId);
        if (freshUrl) {
          source = 'telnyx_call_id';
          console.log(`[Recordings API] Got fresh URL via telnyxCallId`);
        }
      } catch (err: any) {
        console.warn(`[Recordings API] telnyxCallId lookup failed:`, err.message);
      }
    }

    // Strategy 2: Search by phone number and time
    if (!freshUrl && session.toNumber && session.startedAt) {
      console.log(`[Recordings API] Strategy 2: Searching by phone number: ${session.toNumber}`);
      try {
        const { searchRecordingsByDialedNumber } = await import('../services/telnyx-recordings');

        const searchStart = new Date(session.startedAt);
        searchStart.setMinutes(searchStart.getMinutes() - 30);
        const searchEnd = new Date(session.startedAt);
        searchEnd.setMinutes(searchEnd.getMinutes() + 30);

        const recordings = await searchRecordingsByDialedNumber(
          session.toNumber,
          searchStart,
          searchEnd
        );

        if (recordings.length > 0) {
          const recording = recordings.find(r => r.status === 'completed') || recordings[0];
          freshUrl = recording.download_urls?.mp3 || recording.download_urls?.wav || null;

          if (freshUrl) {
            source = 'telnyx_phone_search';
            console.log(`[Recordings API] Found recording via phone search: ${recording.id}`);

            // Update telnyxCallId if missing
            if (!session.telnyxCallId) {
              await db.update(callSessions)
                .set({ telnyxCallId: recording.call_control_id })
                .where(eq(callSessions.id, id));
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Recordings API] Phone search failed:`, err.message);
      }
    }

    if (!freshUrl) {
      return res.status(404).json({
        success: false,
        error: 'Could not find recording in Telnyx',
        details: 'The recording may have been deleted from Telnyx (retained ~30 days) or was never created.',
        tried: {
          telnyxCallId: !!session.telnyxCallId,
          phoneSearch: !!session.toNumber && !!session.startedAt,
        },
      });
    }

    // Download and store to GCS
    console.log(`[Recordings API] Downloading recording from ${source}...`);
    const { storeCallSessionRecording } = await import('../services/recording-storage');
    const s3Key = await storeCallSessionRecording(id, freshUrl, session.durationSec || undefined);

    if (!s3Key) {
      return res.status(500).json({
        success: false,
        error: 'Failed to store recording in GCS',
        details: 'The recording URL was found but downloading/uploading failed.',
      });
    }

    console.log(`[Recordings API] Recording stored at: ${s3Key}`);

    // Optionally trigger transcription
    let transcriptStatus: string = 'not_requested';
    if (transcribe) {
      try {
        const { submitTranscription } = await import('../services/google-transcription');
        const transcript = await submitTranscription(freshUrl);
        if (transcript) {
          await db.update(callSessions)
            .set({ aiTranscript: transcript })
            .where(eq(callSessions.id, id));
          transcriptStatus = 'completed';
          console.log(`[Recordings API] Transcription completed`);
        } else {
          transcriptStatus = 'failed';
        }
      } catch (err: any) {
        console.warn(`[Recordings API] Transcription failed:`, err.message);
        transcriptStatus = 'error';
      }
    }

    res.json({
      success: true,
      message: 'Recording successfully synced from Telnyx',
      data: {
        s3Key,
        source,
        transcriptStatus,
      },
    });
  } catch (error: any) {
    console.error('[Recordings API] Error retrying sync:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry recording sync',
      message: error.message,
    });
  }
});

/**
 * Helper function to handle dialer recording sync
 *
 * For dialer_call_attempts, we:
 * 1. Fetch fresh recording URL from Telnyx
 * 2. If there's a linked callSessionId, store recording there
 * 3. Update the dialer record's recordingUrl with fresh URL
 * 4. Optionally trigger transcription
 */
async function handleDialerRecordingSync(
  req: Request,
  res: Response,
  dialerAttempt: {
    id: string;
    phoneDialed: string | null;
    callStartedAt: Date | null;
    callDurationSeconds: number | null;
    telnyxCallId: string | null;
    recordingUrl: string | null;
    fullTranscript: string | null;
    aiTranscript: string | null;
    callSessionId: string | null;
    campaignId: string;
  },
  transcribe: boolean
) {
  console.log(`[Recordings API] Handling dialer recording sync for: ${dialerAttempt.id}`);
  console.log(`[Recordings API] Dialer has telnyxCallId: ${dialerAttempt.telnyxCallId || 'NONE'}`);
  console.log(`[Recordings API] Dialer has linked callSessionId: ${dialerAttempt.callSessionId || 'NONE'}`);

  let freshUrl: string | null = null;
  let source: string = 'unknown';

  // Strategy 1: Use telnyxCallId to fetch fresh URL
  if (dialerAttempt.telnyxCallId) {
    console.log(`[Recordings API] Strategy 1: Fetching via telnyxCallId: ${dialerAttempt.telnyxCallId}`);
    try {
      const { fetchTelnyxRecording } = await import('../services/telnyx-recordings');
      freshUrl = await fetchTelnyxRecording(dialerAttempt.telnyxCallId);
      if (freshUrl) {
        source = 'telnyx_call_id';
        console.log(`[Recordings API] Got fresh URL via telnyxCallId`);
      }
    } catch (err: any) {
      console.warn(`[Recordings API] telnyxCallId lookup failed:`, err.message);
    }
  }

  // Strategy 2: Search by phone number and time
  if (!freshUrl && dialerAttempt.phoneDialed && dialerAttempt.callStartedAt) {
    console.log(`[Recordings API] Strategy 2: Searching by phone number: ${dialerAttempt.phoneDialed}`);
    try {
      const { searchRecordingsByDialedNumber } = await import('../services/telnyx-recordings');

      const searchStart = new Date(dialerAttempt.callStartedAt);
      searchStart.setMinutes(searchStart.getMinutes() - 30);
      const searchEnd = new Date(dialerAttempt.callStartedAt);
      searchEnd.setMinutes(searchEnd.getMinutes() + 30);

      const recordings = await searchRecordingsByDialedNumber(
        dialerAttempt.phoneDialed,
        searchStart,
        searchEnd
      );

      if (recordings.length > 0) {
        const recording = recordings.find(r => r.status === 'completed') || recordings[0];
        freshUrl = recording.download_urls?.mp3 || recording.download_urls?.wav || null;

        if (freshUrl) {
          source = 'telnyx_phone_search';
          console.log(`[Recordings API] Found recording via phone search: ${recording.id}`);

          // Update telnyxCallId if missing
          if (!dialerAttempt.telnyxCallId) {
            await db.update(dialerCallAttempts)
              .set({ telnyxCallId: recording.call_control_id })
              .where(eq(dialerCallAttempts.id, dialerAttempt.id));
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Recordings API] Phone search failed:`, err.message);
    }
  }

  if (!freshUrl) {
    return res.status(404).json({
      success: false,
      error: 'Could not find recording in Telnyx',
      details: 'The recording may have been deleted from Telnyx (retained ~30 days) or was never created.',
      tried: {
        telnyxCallId: !!dialerAttempt.telnyxCallId,
        phoneSearch: !!dialerAttempt.phoneDialed && !!dialerAttempt.callStartedAt,
      },
      source: 'dialer_call_attempts',
    });
  }

  let s3Key: string | null = null;
  let storageTarget: string = 'none';

  // If there's a linked call session, store recording there
  if (dialerAttempt.callSessionId) {
    console.log(`[Recordings API] Storing recording in linked call session: ${dialerAttempt.callSessionId}`);
    try {
      const { storeCallSessionRecording } = await import('../services/recording-storage');
      s3Key = await storeCallSessionRecording(
        dialerAttempt.callSessionId,
        freshUrl,
        dialerAttempt.callDurationSeconds || undefined
      );
      if (s3Key) {
        storageTarget = 'call_session';
        console.log(`[Recordings API] Recording stored in call session at: ${s3Key}`);
      }
    } catch (err: any) {
      console.warn(`[Recordings API] Failed to store in call session:`, err.message);
    }
  }

  // Always update the dialer record's recordingUrl with fresh URL
  console.log(`[Recordings API] Updating dialer record with fresh URL...`);
  await db.update(dialerCallAttempts)
    .set({ recordingUrl: freshUrl })
    .where(eq(dialerCallAttempts.id, dialerAttempt.id));

  // Optionally trigger transcription
  let transcriptStatus: string = 'not_requested';
  if (transcribe && !dialerAttempt.fullTranscript && !dialerAttempt.aiTranscript) {
    try {
      const { submitTranscription } = await import('../services/google-transcription');
      const transcript = await submitTranscription(freshUrl);
      if (transcript) {
        // Store transcript in dialer record
        await db.update(dialerCallAttempts)
          .set({ fullTranscript: transcript })
          .where(eq(dialerCallAttempts.id, dialerAttempt.id));

        // Also update linked call session if exists
        if (dialerAttempt.callSessionId) {
          await db.update(callSessions)
            .set({ aiTranscript: transcript })
            .where(eq(callSessions.id, dialerAttempt.callSessionId));
        }

        transcriptStatus = 'completed';
        console.log(`[Recordings API] Transcription completed for dialer record`);
      } else {
        transcriptStatus = 'failed';
      }
    } catch (err: any) {
      console.warn(`[Recordings API] Transcription failed:`, err.message);
      transcriptStatus = 'error';
    }
  } else if (dialerAttempt.fullTranscript || dialerAttempt.aiTranscript) {
    transcriptStatus = 'already_exists';
  }

  res.json({
    success: true,
    message: 'Dialer recording successfully synced from Telnyx',
    data: {
      s3Key,
      source,
      storageTarget,
      transcriptStatus,
      recordingUrlUpdated: true,
    },
  });
}

export default router;
