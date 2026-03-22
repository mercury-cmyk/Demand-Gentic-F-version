import { Router, Request, Response } from "express";
import { db } from "../db";
import { requireAuth, requireRole } from "../auth";
import {
  userSessions,
  userStatus,
  teamMemberActivity,
  moduleTimeTracking,
  activitySummary,
  crmInteractionLog,
  communicationLog,
  users,
  iamTeams,
} from "@shared/schema";
import {
  eq,
  and,
  desc,
  asc,
  gte,
  lte,
  inArray,
  isNull,
  sql,
  count,
  sum,
} from "drizzle-orm";
import { addDays, startOfDay, endOfDay, format } from "date-fns";

const router = Router();

// ==================== SESSION MANAGEMENT ====================

/**
 * POST /team-activity/sessions
 * Create a new user session (login)
 */
router.post("/sessions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { ipAddress, userAgent } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Generate session token
    const sessionToken = Buffer.from(
      `${userId}-${Date.now()}-${Math.random().toString(36)}`
    )
      .toString("base64")
      .substring(0, 64);

    const session = await db
      .insert(userSessions)
      .values({
        userId,
        sessionToken,
        ipAddress: ipAddress || req.ip,
        userAgent: userAgent || req.get("user-agent"),
        loginAt: new Date(),
        isActive: true,
      })
      .returning();

    // Update user status to online
    await db
      .update(userStatus)
      .set({
        status: "online",
        currentSessionId: session[0].id,
        lastSeenAt: new Date(),
      })
      .where(eq(userStatus.userId, userId));

    res.json({ session: session[0], sessionToken });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ message: "Failed to create session" });
  }
});

/**
 * POST /team-activity/sessions/:sessionId/logout
 * End a user session (logout)
 */
router.post(
  "/sessions/:sessionId/logout",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.userId;

      const session = await db
        .update(userSessions)
        .set({
          logoutAt: new Date(),
          isActive: false,
        })
        .where(
          and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId))
        )
        .returning();

      if (!session.length) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Update user status to offline
      await db
        .update(userStatus)
        .set({
          status: "offline",
          lastSeenAt: new Date(),
          currentSessionId: isNull(userStatus.currentSessionId),
        })
        .where(eq(userStatus.userId, userId));

      res.json({ message: "Logged out successfully", session: session[0] });
    } catch (error) {
      console.error("Error ending session:", error);
      res.status(500).json({ message: "Failed to end session" });
    }
  }
);

/**
 * GET /team-activity/sessions
 * Get active sessions for authenticated user
 */
router.get("/sessions", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { limit = 10, offset = 0 } = req.query;

    const sessions = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, userId!))
      .orderBy(desc(userSessions.loginAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json({ sessions });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ message: "Failed to fetch sessions" });
  }
});

// ==================== USER STATUS ====================

/**
 * PUT /team-activity/status
 * Update current user status
 */
router.put("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, statusMessage } = req.body;
    const userId = req.user?.userId;

    // Validate status enum
    const validStatuses = ["online", "offline", "away", "busy", "do_not_disturb"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const existing = await db
      .select()
      .from(userStatus)
      .where(eq(userStatus.userId, userId!));

    let result;
    if (existing.length > 0) {
      result = await db
        .update(userStatus)
        .set({
          status,
          statusMessage: statusMessage || null,
          lastSeenAt: new Date(),
          isAutoAway: false,
        })
        .where(eq(userStatus.userId, userId!))
        .returning();
    } else {
      result = await db
        .insert(userStatus)
        .values({
          userId: userId!,
          status,
          statusMessage: statusMessage || undefined,
        })
        .returning();
    }

    res.json({ status: result[0] });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
});

/**
 * GET /team-activity/team/:teamId/status
 * Get status of all team members
 */
router.get(
  "/team/:teamId/status",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;

      const statuses = await db
        .select({
          userId: userStatus.userId,
          username: users.username,
          status: userStatus.status,
          statusMessage: userStatus.statusMessage,
          lastSeenAt: userStatus.lastSeenAt,
        })
        .from(userStatus)
        .innerJoin(users, eq(userStatus.userId, users.id))
        .where(eq(userStatus.teamId, teamId));

      res.json({ statuses });
    } catch (error) {
      console.error("Error fetching team status:", error);
      res.status(500).json({ message: "Failed to fetch team status" });
    }
  }
);

// ==================== ACTIVITY LOGGING ====================

/**
 * POST /team-activity/log
 * Log a team member activity
 */
router.post("/log", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      teamId,
      activityType,
      module,
      entityType,
      entityId,
      entityName,
      description,
      metadata,
      duration,
    } = req.body;

    const userId = req.user?.userId;

    const activity = await db
      .insert(teamMemberActivity)
      .values({
        userId: userId!,
        teamId,
        activityType,
        module,
        entityType: entityType || null,
        entityId: entityId || null,
        entityName: entityName || null,
        description: description || null,
        metadata: metadata || null,
        duration: duration || null,
        ipAddress: req.ip || null,
      })
      .returning();

    res.json({ activity: activity[0] });
  } catch (error) {
    console.error("Error logging activity:", error);
    res.status(500).json({ message: "Failed to log activity" });
  }
});

/**
 * GET /team-activity/log/:teamId
 * Get activity log for a team
 */
router.get(
  "/log/:teamId",
  requireAuth,
  requireRole("admin", "manager"),
  async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const { userId, module, limit = 100, offset = 0, days = 7 } = req.query;

      const startDate = addDays(new Date(), -parseInt(days as string));

      let query = db
        .select()
        .from(teamMemberActivity)
        .where(
          and(
            eq(teamMemberActivity.teamId, teamId),
            gte(teamMemberActivity.createdAt, startDate)
          )
        );

      if (userId) {
        query = query.where(eq(teamMemberActivity.userId, userId as string));
      }

      if (module) {
        query = query.where(eq(teamMemberActivity.module, module as string));
      }

      const activities = await query
        .orderBy(desc(teamMemberActivity.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      const total = await db
        .select({ count: count() })
        .from(teamMemberActivity)
        .where(
          and(
            eq(teamMemberActivity.teamId, teamId),
            gte(teamMemberActivity.createdAt, startDate)
          )
        );

      res.json({
        activities,
        total: total[0].count,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error) {
      console.error("Error fetching activity log:", error);
      res.status(500).json({ message: "Failed to fetch activity log" });
    }
  }
);

// ==================== TIME TRACKING ====================

/**
 * POST /team-activity/time-tracking/start
 * Start tracking time on a module
 */
router.post(
  "/time-tracking/start",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { teamId, module, subModule, metadata } = req.body;
      const userId = req.user?.userId;

      const tracking = await db
        .insert(moduleTimeTracking)
        .values({
          userId: userId!,
          teamId,
          module,
          subModule: subModule || null,
          metadata: metadata || null,
          startTime: new Date(),
          isActive: true,
        })
        .returning();

      res.json({ tracking: tracking[0] });
    } catch (error) {
      console.error("Error starting time tracking:", error);
      res.status(500).json({ message: "Failed to start time tracking" });
    }
  }
);

/**
 * POST /team-activity/time-tracking/:trackingId/end
 * End time tracking session
 */
router.post(
  "/time-tracking/:trackingId/end",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { trackingId } = req.params;
      const userId = req.user?.userId;

      const session = await db
        .select()
        .from(moduleTimeTracking)
        .where(
          and(
            eq(moduleTimeTracking.id, trackingId),
            eq(moduleTimeTracking.userId, userId!)
          )
        );

      if (!session.length) {
        return res.status(404).json({ message: "Tracking session not found" });
      }

      const endTime = new Date();
      const startTime = session[0].startTime;
      const totalSeconds = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 1000
      );

      const updated = await db
        .update(moduleTimeTracking)
        .set({
          endTime,
          totalSeconds,
          isActive: false,
        })
        .where(eq(moduleTimeTracking.id, trackingId))
        .returning();

      res.json({ tracking: updated[0] });
    } catch (error) {
      console.error("Error ending time tracking:", error);
      res.status(500).json({ message: "Failed to end time tracking" });
    }
  }
);

/**
 * GET /team-activity/time-tracking/:teamId
 * Get time tracking summary for team
 */
router.get(
  "/time-tracking/:teamId",
  requireAuth,
  requireRole("admin", "manager"),
  async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const { userId, module, days = 7 } = req.query;

      const startDate = addDays(new Date(), -parseInt(days as string));

      let query = db
        .select({
          module: moduleTimeTracking.module,
          totalSeconds: sum(moduleTimeTracking.totalSeconds),
          sessionCount: count(),
        })
        .from(moduleTimeTracking)
        .where(
          and(
            eq(moduleTimeTracking.teamId, teamId),
            gte(moduleTimeTracking.startTime, startDate)
          )
        );

      if (userId) {
        query = query.where(eq(moduleTimeTracking.userId, userId as string));
      }

      if (module) {
        query = query.where(eq(moduleTimeTracking.module, module as string));
      }

      const results = await query.groupBy(moduleTimeTracking.module);

      res.json({ timeTracking: results });
    } catch (error) {
      console.error("Error fetching time tracking:", error);
      res.status(500).json({ message: "Failed to fetch time tracking" });
    }
  }
);

// ==================== CRM INTERACTIONS ====================

/**
 * POST /team-activity/crm-interaction
 * Log a CRM interaction
 */
router.post(
  "/crm-interaction",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        teamId,
        interactionType,
        entityType,
        entityId,
        entityName,
        details,
        duration,
        outcome,
        linkedDocuments,
      } = req.body;

      const userId = req.user?.userId;

      const interaction = await db
        .insert(crmInteractionLog)
        .values({
          userId: userId!,
          teamId,
          interactionType,
          entityType,
          entityId,
          entityName: entityName || null,
          details: details || null,
          duration: duration || null,
          outcome: outcome || null,
          linkedDocuments: linkedDocuments || null,
        })
        .returning();

      res.json({ interaction: interaction[0] });
    } catch (error) {
      console.error("Error logging CRM interaction:", error);
      res.status(500).json({ message: "Failed to log CRM interaction" });
    }
  }
);

/**
 * GET /team-activity/crm-interaction/:teamId
 * Get CRM interactions for team
 */
router.get(
  "/crm-interaction/:teamId",
  requireAuth,
  requireRole("admin", "manager"),
  async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const {
        userId,
        interactionType,
        limit = 100,
        offset = 0,
        days = 30,
      } = req.query;

      const startDate = addDays(new Date(), -parseInt(days as string));

      let query = db
        .select()
        .from(crmInteractionLog)
        .where(
          and(
            eq(crmInteractionLog.teamId, teamId),
            gte(crmInteractionLog.createdAt, startDate)
          )
        );

      if (userId) {
        query = query.where(eq(crmInteractionLog.userId, userId as string));
      }

      if (interactionType) {
        query = query.where(
          eq(crmInteractionLog.interactionType, interactionType as string)
        );
      }

      const interactions = await query
        .orderBy(desc(crmInteractionLog.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      const total = await db
        .select({ count: count() })
        .from(crmInteractionLog)
        .where(
          and(
            eq(crmInteractionLog.teamId, teamId),
            gte(crmInteractionLog.createdAt, startDate)
          )
        );

      res.json({
        interactions,
        total: total[0].count,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error) {
      console.error("Error fetching CRM interactions:", error);
      res.status(500).json({ message: "Failed to fetch CRM interactions" });
    }
  }
);

// ==================== ACTIVITY SUMMARY & REPORTING ====================

/**
 * GET /team-activity/summary/:teamId
 * Get activity summary for team
 */
router.get(
  "/summary/:teamId",
  requireAuth,
  requireRole("admin", "manager"),
  async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const { userId, days = 7 } = req.query;

      const startDate = startOfDay(addDays(new Date(), -parseInt(days as string)));
      const endDate = endOfDay(new Date());

      let query = db
        .select()
        .from(activitySummary)
        .where(
          and(
            eq(activitySummary.teamId, teamId),
            gte(activitySummary.date, startDate)
          )
        );

      if (userId) {
        query = query.where(eq(activitySummary.userId, userId as string));
      }

      const summaries = await query.orderBy(desc(activitySummary.date));

      res.json({ summaries });
    } catch (error) {
      console.error("Error fetching activity summary:", error);
      res.status(500).json({ message: "Failed to fetch activity summary" });
    }
  }
);

/**
 * GET /team-activity/dashboard/:teamId
 * Get comprehensive activity dashboard for team
 */
router.get(
  "/dashboard/:teamId",
  requireAuth,
  requireRole("admin", "manager"),
  async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const { days = 7 } = req.query;

      const startDate = addDays(new Date(), -parseInt(days as string));

      // Get team members
      const members = await db
        .select()
        .from(users)
        .where(eq(users.id, teamId)); // This would need proper join in real scenario

      // Get activity stats by member
      const activityByUser = await db
        .select({
          userId: teamMemberActivity.userId,
          activityCount: count(),
          modules: sql`array_agg(distinct ${teamMemberActivity.module})`,
        })
        .from(teamMemberActivity)
        .where(
          and(
            eq(teamMemberActivity.teamId, teamId),
            gte(teamMemberActivity.createdAt, startDate)
          )
        )
        .groupBy(teamMemberActivity.userId);

      // Get time tracking stats
      const timeByModule = await db
        .select({
          module: moduleTimeTracking.module,
          totalSeconds: sum(moduleTimeTracking.totalSeconds),
        })
        .from(moduleTimeTracking)
        .where(
          and(
            eq(moduleTimeTracking.teamId, teamId),
            gte(moduleTimeTracking.startTime, startDate)
          )
        )
        .groupBy(moduleTimeTracking.module);

      // Get online status of team members
      const onlineMembers = await db
        .select({
          userId: userStatus.userId,
          status: userStatus.status,
          lastSeenAt: userStatus.lastSeenAt,
        })
        .from(userStatus)
        .where(eq(userStatus.teamId, teamId));

      // Get top interactions
      const topInteractions = await db
        .select({
          interactionType: crmInteractionLog.interactionType,
          count: count(),
        })
        .from(crmInteractionLog)
        .where(
          and(
            eq(crmInteractionLog.teamId, teamId),
            gte(crmInteractionLog.createdAt, startDate)
          )
        )
        .groupBy(crmInteractionLog.interactionType)
        .orderBy(desc(count()));

      res.json({
        dashboard: {
          period: { days: parseInt(days as string), startDate },
          activityByUser,
          timeByModule,
          onlineMembers,
          topInteractions,
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  }
);

// ==================== COMMUNICATION LOG ====================

/**
 * POST /team-activity/communication
 * Log a team communication
 */
router.post(
  "/communication",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        teamId,
        receiverId,
        communicationType,
        subject,
        content,
      } = req.body;

      const senderId = req.user?.userId;

      const message = await db
        .insert(communicationLog)
        .values({
          senderId: senderId!,
          receiverId: receiverId || null,
          teamId,
          communicationType,
          subject: subject || null,
          content: content || null,
          isRead: false,
        })
        .returning();

      res.json({ message: message[0] });
    } catch (error) {
      console.error("Error logging communication:", error);
      res.status(500).json({ message: "Failed to log communication" });
    }
  }
);

/**
 * GET /team-activity/communication/:userId
 * Get communication messages for user
 */
router.get(
  "/communication/:userId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { unreadOnly = false, limit = 50, offset = 0 } = req.query;

      let query = db
        .select()
        .from(communicationLog)
        .where(eq(communicationLog.receiverId, userId));

      if (unreadOnly === "true") {
        query = query.where(eq(communicationLog.isRead, false));
      }

      const messages = await query
        .orderBy(desc(communicationLog.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      res.json({ messages });
    } catch (error) {
      console.error("Error fetching communication:", error);
      res.status(500).json({ message: "Failed to fetch communication" });
    }
  }
);

export default router;