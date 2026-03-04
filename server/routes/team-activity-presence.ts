import { Server, Socket } from "socket.io";
import { db } from "../db";
import { userStatus, userSessions, users } from "@shared/schema";
import { eq } from "drizzle-orm";

interface PresenceUpdate {
  userId: string;
  username: string;
  status: "online" | "offline" | "away" | "busy" | "do_not_disturb";
  lastSeenAt: Date;
  teamId?: string;
}

interface ActiveUser {
  userId: string;
  username: string;
  status: string;
  lastSeenAt: Date;
  socketId: string;
}

// Map to track active socket connections per team/user
const userSocketMap = new Map<string, ActiveUser>();
const teamSocketMap = new Map<string, Set<string>>();

export function initializePresenceTracking(io: Server) {
  // Namespace for real-time presence updates
  const presenceNamespace = io.of("/presence");

  presenceNamespace.on("connection", async (socket: Socket) => {
    console.log(`[Presence] User connected: ${socket.id}`);

    // When user joins with their user ID and team
    socket.on(
      "join",
      async (data: { userId: string; teamId: string; username: string }) => {
        const { userId, teamId, username } = data;

        // Store socket connection
        userSocketMap.set(userId, {
          userId,
          username,
          status: "online",
          lastSeenAt: new Date(),
          socketId: socket.id,
        });

        // Add to team room
        socket.join(`team:${teamId}`);
        if (!teamSocketMap.has(teamId)) {
          teamSocketMap.set(teamId, new Set());
        }
        teamSocketMap.get(teamId)!.add(userId);

        // Update database status
        await db
          .update(userStatus)
          .set({
            status: "online",
            lastSeenAt: new Date(),
          })
          .where(eq(userStatus.userId, userId));

        // Broadcast presence update to team
        const update: PresenceUpdate = {
          userId,
          username,
          status: "online",
          lastSeenAt: new Date(),
          teamId,
        };

        presenceNamespace.to(`team:${teamId}`).emit("user-joined", update);
        console.log(
          `[Presence] ${username} (${userId}) joined team ${teamId}`
        );
      }
    );

    // Handle status changes
    socket.on(
      "status-change",
      async (data: { userId: string; status: string; teamId: string }) => {
        const { userId, status, teamId } = data;

        // Update in memory
        const user = userSocketMap.get(userId);
        if (user) {
          user.status = status;
          user.lastSeenAt = new Date();
        }

        // Update in database
        await db
          .update(userStatus)
          .set({
            status: status as any,
            lastSeenAt: new Date(),
          })
          .where(eq(userStatus.userId, userId));

        // Broadcast to team
        presenceNamespace.to(`team:${teamId}`).emit("user-status-changed", {
          userId,
          status,
          lastSeenAt: new Date(),
        });

        console.log(`[Presence] ${userId} changed status to ${status}`);
      }
    );

    // Handle activity updates (heartbeat)
    socket.on(
      "active",
      async (data: { userId: string; teamId: string }) => {
        const { userId, teamId } = data;

        // Update last seen
        const user = userSocketMap.get(userId);
        if (user) {
          user.lastSeenAt = new Date();
        }

        // Update database
        await db
          .update(userStatus)
          .set({
            lastSeenAt: new Date(),
            isAutoAway: false,
          })
          .where(eq(userStatus.userId, userId));
      }
    );

    // Handle idle/away after inactivity
    socket.on(
      "idle",
      async (data: { userId: string; teamId: string; idleTime: number }) => {
        const { userId, teamId, idleTime } = data;

        // Update status to away if idle > 5 minutes
        if (idleTime > 300000) {
          await db
            .update(userStatus)
            .set({
              status: "away",
              isAutoAway: true,
              awayStartedAt: new Date(),
              lastSeenAt: new Date(),
            })
            .where(eq(userStatus.userId, userId));

          presenceNamespace.to(`team:${teamId}`).emit("user-status-changed", {
            userId,
            status: "away",
            isAutoAway: true,
          });
        }
      }
    );

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`[Presence] User disconnected: ${socket.id}`);

      // Find user by socket ID
      let disconnectedUserId: string | undefined;
      for (const [userId, user] of userSocketMap) {
        if (user.socketId === socket.id) {
          disconnectedUserId = userId;
          break;
        }
      }

      if (disconnectedUserId) {
        const user = userSocketMap.get(disconnectedUserId);
        const teamId = Array.from(socket.rooms).find((room) =>
          room.startsWith("team:")
        );

        // Remove from maps
        userSocketMap.delete(disconnectedUserId);
        if (teamId) {
          teamSocketMap.get(teamId.replace("team:", ""))?.delete(disconnectedUserId);
        }

        // Update database
        await db
          .update(userStatus)
          .set({
            status: "offline",
            lastSeenAt: new Date(),
          })
          .where(eq(userStatus.userId, disconnectedUserId));

        // Broadcast disconnect to team
        if (teamId) {
          presenceNamespace.to(teamId).emit("user-left", {
            userId: disconnectedUserId,
            username: user?.username,
            lastSeenAt: new Date(),
          });
        }
      }
    });

    // Handle explicit logout
    socket.on(
      "logout",
      async (data: { userId: string; teamId: string }) => {
        const { userId, teamId } = data;

        userSocketMap.delete(userId);
        teamSocketMap.get(teamId)?.delete(userId);

        await db
          .update(userStatus)
          .set({
            status: "offline",
            lastSeenAt: new Date(),
          })
          .where(eq(userStatus.userId, userId));

        presenceNamespace.to(`team:${teamId}`).emit("user-left", {
          userId,
          lastSeenAt: new Date(),
        });

        socket.leave(`team:${teamId}`);
      }
    );
  });

  // Periodic sweep for stale connections (every 5 minutes)
  setInterval(async () => {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [userId, user] of userSocketMap) {
      const idleTime = now.getTime() - user.lastSeenAt.getTime();

      if (idleTime > staleThreshold && user.status !== "offline") {
        // Mark as away
        await db
          .update(userStatus)
          .set({
            status: "away",
            isAutoAway: true,
            awayStartedAt: new Date(),
          })
          .where(eq(userStatus.userId, userId));

        // Get team rooms
        const teamRooms = Array.from(presenceNamespace.sockets.get(user.socketId)?.rooms || []).filter(
          (room) => room.startsWith("team:")
        );

        teamRooms.forEach((room) => {
          presenceNamespace.to(room).emit("user-status-changed", {
            userId,
            status: "away",
            isAutoAway: true,
          });
        });
      }
    }
  }, 5 * 60 * 1000);

  return presenceNamespace;
}

// Helper function to get team members' current status
export async function getTeamPresence(teamId: string) {
  const members = Array.from(teamSocketMap.get(teamId) || [])
    .map((userId) => userSocketMap.get(userId))
    .filter((user): user is ActiveUser => !!user);

  return members;
}

// Helper function to broadcast status update
export function broadcastStatusUpdate(io: Server, teamId: string, update: PresenceUpdate) {
  io.of("/presence").to(`team:${teamId}`).emit("user-status-changed", update);
}
