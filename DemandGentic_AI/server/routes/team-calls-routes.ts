import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  voiceCalls, callParticipants, callRecordings, callTranscripts,
  chatChannels, users
} from '../../shared/schema';
import { eq, and, desc, asc, count, avg } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ==================== CALL MANAGEMENT ====================

// POST /calls/initiate - Start a new call
router.post('/calls/initiate', async (req: Request, res: Response) => {
  try {
    const { teamId, recipientIds, channelId, callType = 'voice' } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const callId = uuidv4();

    // Create call
    const call = await db.insert(voiceCalls).values({
      id: callId,
      teamId,
      initiatorId: userId,
      recipientIds,
      channelId,
      callType,
      status: 'ringing',
    }).returning();

    // Create participant records
    const participants = [userId, ...recipientIds].map(participantId => ({
      id: uuidv4(),
      callId,
      userId: participantId,
      status: participantId === userId ? 'active' : 'invited',
    }));

    await db.insert(callParticipants).values(participants);

    res.status(201).json({ call: call[0], callId });
  } catch (err) {
    console.error('[Team Calls] Initiate call error:', err);
    res.status(500).json({ message: 'Failed to initiate call' });
  }
});

// POST /calls/:callId/accept - Accept a call
router.post('/calls/:callId/accept', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = (req as any).user?.id;

    const updateParticipant = await db
      .update(callParticipants)
      .set({
        status: 'active',
        joinTime: new Date(),
      })
      .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)))
      .returning();

    if (!updateParticipant.length) {
      return res.status(404).json({ message: 'Call or participant not found' });
    }

    // Update call status to active if at least one participant is active
    const allParticipants = await db
      .select({ status: callParticipants.status })
      .from(callParticipants)
      .where(eq(callParticipants.callId, callId));

    const hasActiveParticipant = allParticipants.some(p => p.status === 'active');

    if (hasActiveParticipant) {
      await db
        .update(voiceCalls)
        .set({ status: 'active', startTime: new Date() })
        .where(eq(voiceCalls.id, callId));
    }

    res.json({ participant: updateParticipant[0] });
  } catch (err) {
    console.error('[Team Calls] Accept call error:', err);
    res.status(500).json({ message: 'Failed to accept call' });
  }
});

// POST /calls/:callId/decline - Decline a call
router.post('/calls/:callId/decline', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = (req as any).user?.id;

    await db
      .update(callParticipants)
      .set({ status: 'declined' })
      .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)));

    res.json({ success: true });
  } catch (err) {
    console.error('[Team Calls] Decline call error:', err);
    res.status(500).json({ message: 'Failed to decline call' });
  }
});

// POST /calls/:callId/end - End a call
router.post('/calls/:callId/end', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = (req as any).user?.id;

    // Mark participant as left
    const leaveTime = new Date();
    const participant = await db
      .select({ joinTime: callParticipants.joinTime })
      .from(callParticipants)
      .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)))
      .limit(1);

    if (participant.length && participant[0].joinTime) {
      const duration = Math.floor(
        (leaveTime.getTime() - participant[0].joinTime.getTime()) / 1000,
      );

      await db
        .update(callParticipants)
        .set({
          leaveTime,
          participationDuration: duration,
          status: 'left',
        })
        .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)));
    }

    // Check if all participants left
    const remaining = await db
      .select({ id: callParticipants.id })
      .from(callParticipants)
      .where(and(eq(callParticipants.callId, callId), eq(callParticipants.status, 'active')))
      .limit(1);

    if (!remaining.length) {
      // Calculate total duration
      const call = await db
        .select({ startTime: voiceCalls.startTime })
        .from(voiceCalls)
        .where(eq(voiceCalls.id, callId))
        .limit(1);

      const callDuration = call.length && call[0].startTime
        ? Math.floor((leaveTime.getTime() - call[0].startTime.getTime()) / 1000)
        : 0;

      await db
        .update(voiceCalls)
        .set({
          status: 'ended',
          endTime: leaveTime,
          callDuration,
        })
        .where(eq(voiceCalls.id, callId));
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Team Calls] End call error:', err);
    res.status(500).json({ message: 'Failed to end call' });
  }
});

// GET /calls/:callId - Get call details
router.get('/calls/:callId', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;

    const call = await db
      .select({ call: voiceCalls })
      .from(voiceCalls)
      .where(eq(voiceCalls.id, callId))
      .limit(1);

    if (!call.length) {
      return res.status(404).json({ message: 'Call not found' });
    }

    // Get participants with user info
    const participants = await db
      .select({
        participant: callParticipants,
        user: users,
      })
      .from(callParticipants)
      .innerJoin(users, eq(callParticipants.userId, users.id))
      .where(eq(callParticipants.callId, callId))
      .orderBy(asc(callParticipants.joinTime));

    // Get recording if exists
    const recording = await db
      .select({ recording: callRecordings })
      .from(callRecordings)
      .where(eq(callRecordings.callId, callId))
      .limit(1);

    res.json({
      call: call[0].call,
      participants: participants.map(p => ({
        ...p.participant,
        user: p.user,
      })),
      recording: recording.length ? recording[0].recording : null,
    });
  } catch (err) {
    console.error('[Team Calls] Get call error:', err);
    res.status(500).json({ message: 'Failed to fetch call' });
  }
});

// ==================== CALL HISTORY ====================

// GET /calls/history/:teamId - Get call history for a team
router.get('/calls/history/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { limit = 50, offset = 0, userId, status } = req.query;

    let query = db
      .select({
        call: voiceCalls,
        initiator: users,
        participantCount: count(callParticipants.id),
      })
      .from(voiceCalls)
      .innerJoin(users, eq(voiceCalls.initiatorId, users.id))
      .leftJoin(callParticipants, eq(callParticipants.callId, voiceCalls.id))
      .where(eq(voiceCalls.teamId, teamId as string));

    if (userId) {
      // Filter by user involvement (initiator or recipient)
      query = query.where(
        eq(voiceCalls.initiatorId, userId as string),
      );
    }

    if (status) {
      query = query.where(eq(voiceCalls.status, status as string));
    }

    const calls = await query
      .groupBy(voiceCalls.id, users.id)
      .orderBy(desc(voiceCalls.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      calls: calls.map(c => ({
        ...c.call,
        initiator: c.initiator,
        participantCount: c.participantCount,
      })),
      total: calls.length,
    });
  } catch (err) {
    console.error('[Team Calls] Get history error:', err);
    res.status(500).json({ message: 'Failed to fetch call history' });
  }
});

// GET /calls/user/:userId - Get calls for a specific user
router.get('/calls/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const calls = await db
      .select({
        call: voiceCalls,
        initiator: users,
      })
      .from(voiceCalls)
      .innerJoin(users, eq(voiceCalls.initiatorId, users.id))
      .where(
        eq(voiceCalls.initiatorId, userId),
      )
      .orderBy(desc(voiceCalls.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      calls: calls.map(c => ({ ...c.call, initiator: c.initiator })),
      total: calls.length,
    });
  } catch (err) {
    console.error('[Team Calls] Get user calls error:', err);
    res.status(500).json({ message: 'Failed to fetch user calls' });
  }
});

// ==================== RECORDINGS & TRANSCRIPTS ====================

// POST /calls/:callId/recording - Save call recording
router.post('/calls/:callId/recording', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const { recordingUrl, recordingDuration, fileSize, format = 'mp3' } = req.body;

    const recording = await db.insert(callRecordings).values({
      id: uuidv4(),
      callId,
      recordingUrl,
      recordingDuration,
      fileSize: BigInt(fileSize),
      format,
    }).returning();

    res.status(201).json({ recording: recording[0] });
  } catch (err) {
    console.error('[Team Calls] Save recording error:', err);
    res.status(500).json({ message: 'Failed to save recording' });
  }
});

// GET /calls/:callId/recording - Get call recording
router.get('/calls/:callId/recording', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;

    const recording = await db
      .select({ recording: callRecordings })
      .from(callRecordings)
      .where(eq(callRecordings.callId, callId))
      .limit(1);

    if (!recording.length) {
      return res.status(404).json({ message: 'Recording not found' });
    }

    res.json({ recording: recording[0].recording });
  } catch (err) {
    console.error('[Team Calls] Get recording error:', err);
    res.status(500).json({ message: 'Failed to fetch recording' });
  }
});

// POST /calls/:callId/transcript - Save call transcript
router.post('/calls/:callId/transcript', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const { transcriptText, transcriptJson, summary, keyPoints, sentiment } = req.body;

    const transcript = await db.insert(callTranscripts).values({
      id: uuidv4(),
      callId,
      transcriptText,
      transcriptJson,
      summary,
      keyPoints: keyPoints || [],
      sentiment,
    }).returning();

    res.status(201).json({ transcript: transcript[0] });
  } catch (err) {
    console.error('[Team Calls] Save transcript error:', err);
    res.status(500).json({ message: 'Failed to save transcript' });
  }
});

// GET /calls/:callId/transcript - Get call transcript
router.get('/calls/:callId/transcript', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;

    const transcript = await db
      .select({ transcript: callTranscripts })
      .from(callTranscripts)
      .where(eq(callTranscripts.callId, callId))
      .limit(1);

    if (!transcript.length) {
      return res.status(404).json({ message: 'Transcript not found' });
    }

    res.json({ transcript: transcript[0].transcript });
  } catch (err) {
    console.error('[Team Calls] Get transcript error:', err);
    res.status(500).json({ message: 'Failed to fetch transcript' });
  }
});

// ==================== CALL STATISTICS ====================

// GET /calls/stats/:teamId - Get call statistics for a team
router.get('/calls/stats/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // Total calls
    const callStats = await db
      .select({
        totalCalls: count(voiceCalls.id),
        totalDuration: 0, // Will calculate via raw query
        avgDuration: avg(voiceCalls.callDuration),
        activeCalls: count(
          eq(voiceCalls.status, 'active'),
        ),
      })
      .from(voiceCalls)
      .where(and(
        eq(voiceCalls.teamId, teamId as string),
        // createdAt >= startDate (would need raw query)
      ));

    // Calls by status
    const callsByStatus = await db
      .select({
        status: voiceCalls.status,
        count: count(voiceCalls.id),
      })
      .from(voiceCalls)
      .where(eq(voiceCalls.teamId, teamId as string))
      .groupBy(voiceCalls.status);

    // Top initiators
    const topInitiators = await db
      .select({
        user: users,
        callCount: count(voiceCalls.id),
        totalDuration: 0, // Would need aggregation
      })
      .from(voiceCalls)
      .innerJoin(users, eq(voiceCalls.initiatorId, users.id))
      .where(eq(voiceCalls.teamId, teamId as string))
      .groupBy(users.id)
      .orderBy(desc(count(voiceCalls.id)))
      .limit(10);

    res.json({
      summary: callStats[0] || {},
      byStatus: callsByStatus,
      topInitiators,
    });
  } catch (err) {
    console.error('[Team Calls] Get stats error:', err);
    res.status(500).json({ message: 'Failed to fetch call statistics' });
  }
});

export default router;