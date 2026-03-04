import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { moduleTimeTracking, teamMemberActivity } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// Store active tracking sessions per user per module
interface ActiveTracking {
  trackingId: string;
  module: string;
  startTime: Date;
}

const userTrackingSessions = new Map<string, Map<string, ActiveTracking>>();

/**
 * Middleware to automatically track time spent in different modules
 * Attach to routes like:
 *   app.use('/api/campaigns', activityTrackingMiddleware('campaigns'));
 */
export function activityTrackingMiddleware(module: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const userId = req.user?.userId;
    const teamId = req.body?.teamId || req.query?.teamId;

    if (!userId || !teamId) {
      return next();
    }

    // Extract submodule from path if applicable
    const pathParts = req.path.split("/");
    const subModule = pathParts[1] || null;

    // Initialize user's tracking map if needed
    if (!userTrackingSessions.has(userId)) {
      userTrackingSessions.set(userId, new Map());
    }

    const userSessions = userTrackingSessions.get(userId)!;

    // Check if already tracking this module
    if (!userSessions.has(module)) {
      try {
        const tracking = await db
          .insert(moduleTimeTracking)
          .values({
            userId,
            teamId: teamId as string,
            module,
            subModule: subModule || null,
            startTime: new Date(),
            isActive: true,
          })
          .returning();

        userSessions.set(module, {
          trackingId: tracking[0].id,
          module,
          startTime: new Date(),
        });

        // Store tracking ID in request for later use
        (req as any).trackingId = tracking[0].id;
      } catch (error) {
        console.error("Error starting activity tracking:", error);
        // Continue anyway - don't block request
      }
    } else {
      (req as any).trackingId = userSessions.get(module)!.trackingId;
    }

    // Intercept response to end tracking if this is the last request
    const originalSend = res.send;
    res.send = function (data: any) {
      // Don't end tracking immediately - let it continue until user navigates away
      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Middleware to automatically log specific CRM activities
 */
export function crmActivityLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.userId;
  const teamId = req.body?.teamId || req.query?.teamId;

  if (!userId || !teamId) {
    return next();
  }

  // Determine activity type based on method and path
  let activityType = "view";
  if (req.method === "POST") activityType = "create";
  else if (req.method === "PUT") activityType = "update";
  else if (req.method === "DELETE") activityType = "delete";

  const module = req.path.split("/")[1] || "unknown";

  // Log the activity asynchronously
  (async () => {
    try {
      await db.insert(teamMemberActivity).values({
        userId,
        teamId: teamId as string,
        module,
        activityType: activityType as any,
        description: `${req.method} ${req.path}`,
        metadata: {
          method: req.method,
          path: req.path,
          queryParams: req.query,
        },
        ipAddress: req.ip || null,
      });
    } catch (error) {
      console.error("Error logging CRM activity:", error);
    }
  })();

  next();
}

/**
 * Helper function to end tracking session for a module
 */
export async function endModuleTracking(userId: string, module: string) {
  const userSessions = userTrackingSessions.get(userId);
  if (!userSessions || !userSessions.has(module)) {
    return;
  }

  const session = userSessions.get(module)!;

  try {
    const endTime = new Date();
    const totalSeconds = Math.floor(
      (endTime.getTime() - session.startTime.getTime()) / 1000
    );

    await db
      .update(moduleTimeTracking)
      .set({
        endTime,
        totalSeconds,
        isActive: false,
      })
      .where(eq(moduleTimeTracking.id, session.trackingId));

    userSessions.delete(module);
  } catch (error) {
    console.error("Error ending module tracking:", error);
  }
}

/**
 * Helper function to end all tracking sessions for a user (on logout)
 */
export async function endAllUserTracking(userId: string) {
  const userSessions = userTrackingSessions.get(userId);
  if (!userSessions || userSessions.size === 0) {
    return;
  }

  const endTime = new Date();

  for (const [module, session] of userSessions) {
    try {
      const totalSeconds = Math.floor(
        (endTime.getTime() - session.startTime.getTime()) / 1000
      );

      await db
        .update(moduleTimeTracking)
        .set({
          endTime,
          totalSeconds,
          isActive: false,
        })
        .where(eq(moduleTimeTracking.id, session.trackingId));
    } catch (error) {
      console.error(`Error ending tracking for ${module}:`, error);
    }
  }

  userTrackingSessions.delete(userId);
}

/**
 * Middleware to handle logout and cleanup
 */
export function activityCleanupMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;

    if (userId && req.path.includes("logout")) {
      await endAllUserTracking(userId);
    }

    next();
  };
}
