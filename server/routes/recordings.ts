/**
 * Recordings API Router
 * 
 * Provides endpoints for:
 * - Listing call recordings with filters
 * - Getting individual recordings with presigned URLs
 * - Streaming recordings for playback
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { callSessions, campaigns, contacts, accounts } from '@shared/schema';
import { eq, desc, and, gte, lte, like, or, sql, isNotNull } from 'drizzle-orm';
import { getCallSessionRecordingUrl, isRecordingStorageEnabled } from '../services/recording-storage';

const router = Router();

/**
 * GET /api/recordings
 * List recordings with filters
 * 
 * Query params:
 * - campaignId: Filter by campaign
 * - agentType: 'ai' | 'human' | 'all'
 * - status: 'stored' | 'pending' | 'failed' | 'all'
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - search: Search in phone number or contact name
 * - page: Page number (1-indexed)
 * - limit: Items per page (default 20, max 100)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      agentType = 'all',
      status = 'all',
      startDate,
      endDate,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions
    const conditions: any[] = [];

    // Only include sessions with recordings
    conditions.push(
      or(
        isNotNull(callSessions.recordingS3Key),
        isNotNull(callSessions.recordingUrl)
      )
    );

    if (campaignId && campaignId !== 'all') {
      conditions.push(eq(callSessions.campaignId, campaignId as string));
    }

    if (agentType && agentType !== 'all') {
      conditions.push(eq(callSessions.agentType, agentType as 'ai' | 'human'));
    }

    if (status && status !== 'all') {
      conditions.push(eq(callSessions.recordingStatus, status as any));
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
          like(callSessions.fromNumber, searchPattern)
        )
      );
    }

    // Query with joins for additional info
    const recordings = await db
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
        status: callSessions.status,
        campaignId: callSessions.campaignId,
        contactId: callSessions.contactId,
        aiAgentId: callSessions.aiAgentId,
        // Join fields
        campaignName: campaigns.name,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        accountName: accounts.name,
      })
      .from(callSessions)
      .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(callSessions.startedAt))
      .limit(limitNum)
      .offset(offset);

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callSessions)
      .where(and(...conditions));
    
    const total = countResult[0]?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    // Transform results
    const items = recordings.map(rec => ({
      id: rec.id,
      telnyxCallId: rec.telnyxCallId,
      fromNumber: rec.fromNumber,
      toNumber: rec.toNumber,
      startedAt: rec.startedAt?.toISOString(),
      endedAt: rec.endedAt?.toISOString(),
      durationSec: rec.durationSec,
      recordingDurationSec: rec.recordingDurationSec,
      recordingStatus: rec.recordingStatus,
      recordingFormat: rec.recordingFormat,
      fileSizeBytes: rec.recordingFileSizeBytes,
      hasRecording: !!(rec.recordingS3Key || rec.recordingUrl),
      agentType: rec.agentType,
      disposition: rec.aiDisposition,
      status: rec.status,
      campaign: rec.campaignId ? {
        id: rec.campaignId,
        name: rec.campaignName,
      } : null,
      contact: rec.contactId ? {
        id: rec.contactId,
        name: [rec.contactFirstName, rec.contactLastName].filter(Boolean).join(' ') || null,
        accountName: rec.accountName,
      } : null,
      aiAgentId: rec.aiAgentId,
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
        storageEnabled: isRecordingStorageEnabled(),
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
 * GET /api/recordings/:id
 * Get a single recording with presigned URL
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get recording details
    const [recording] = await db
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
      .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(callSessions.id, id));

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    // Get presigned URL for playback
    const { url: playbackUrl, source } = await getCallSessionRecordingUrl(
      id,
      recording.recordingUrl
    );

    res.json({
      success: true,
      data: {
        id: recording.id,
        telnyxCallId: recording.telnyxCallId,
        fromNumber: recording.fromNumber,
        toNumber: recording.toNumber,
        startedAt: recording.startedAt?.toISOString(),
        endedAt: recording.endedAt?.toISOString(),
        durationSec: recording.durationSec,
        recordingDurationSec: recording.recordingDurationSec,
        recordingStatus: recording.recordingStatus,
        recordingFormat: recording.recordingFormat,
        fileSizeBytes: recording.recordingFileSizeBytes,
        playbackUrl,
        playbackSource: source, // 'local' or 'telnyx'
        agentType: recording.agentType,
        disposition: recording.aiDisposition,
        transcript: recording.aiTranscript,
        analysis: recording.aiAnalysis,
        status: recording.status,
        campaign: recording.campaignId ? {
          id: recording.campaignId,
          name: recording.campaignName,
        } : null,
        contact: recording.contactId ? {
          id: recording.contactId,
          firstName: recording.contactFirstName,
          lastName: recording.contactLastName,
          email: recording.contactEmail,
          phone: recording.contactPhone,
          jobTitle: recording.contactJobTitle,
          accountName: recording.accountName,
        } : null,
        aiAgentId: recording.aiAgentId,
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
 */
router.get('/:id/url', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get minimal recording info
    const [recording] = await db
      .select({
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
      })
      .from(callSessions)
      .where(eq(callSessions.id, id));

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    if (!recording.recordingS3Key && !recording.recordingUrl) {
      return res.status(404).json({
        success: false,
        error: 'No recording available',
        status: recording.recordingStatus,
      });
    }

    const { url, source } = await getCallSessionRecordingUrl(
      id,
      recording.recordingUrl
    );

    if (!url) {
      return res.status(404).json({
        success: false,
        error: 'Recording URL not available',
        status: recording.recordingStatus,
      });
    }

    res.json({
      success: true,
      data: {
        url,
        source,
        expiresIn: source === 'local' ? '7 days' : 'may expire soon',
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
 * GET /api/recordings/stats
 * Get recording statistics
 */
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const { campaignId, startDate, endDate } = req.query;

    const conditions: any[] = [];

    if (campaignId && campaignId !== 'all') {
      conditions.push(eq(callSessions.campaignId, campaignId as string));
    }

    if (startDate) {
      conditions.push(gte(callSessions.startedAt, new Date(startDate as string)));
    }

    if (endDate) {
      conditions.push(lte(callSessions.startedAt, new Date(endDate as string)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get counts by status
    const stats = await db
      .select({
        recordingStatus: callSessions.recordingStatus,
        count: sql<number>`count(*)::int`,
        totalDurationSec: sql<number>`coalesce(sum(${callSessions.recordingDurationSec}), 0)::int`,
        totalFileSizeBytes: sql<number>`coalesce(sum(${callSessions.recordingFileSizeBytes}), 0)::bigint`,
      })
      .from(callSessions)
      .where(whereClause)
      .groupBy(callSessions.recordingStatus);

    const byStatus: Record<string, { count: number; durationSec: number; sizeBytes: number }> = {};
    let totalRecordings = 0;
    let totalDuration = 0;
    let totalSize = 0;

    for (const row of stats) {
      const status = row.recordingStatus || 'unknown';
      byStatus[status] = {
        count: row.count,
        durationSec: row.totalDurationSec,
        sizeBytes: Number(row.totalFileSizeBytes),
      };
      totalRecordings += row.count;
      totalDuration += row.totalDurationSec;
      totalSize += Number(row.totalFileSizeBytes);
    }

    res.json({
      success: true,
      data: {
        total: totalRecordings,
        totalDurationSec: totalDuration,
        totalDurationFormatted: formatDuration(totalDuration),
        totalFileSizeBytes: totalSize,
        totalFileSizeFormatted: formatFileSize(totalSize),
        byStatus,
        storageEnabled: isRecordingStorageEnabled(),
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

export default router;
