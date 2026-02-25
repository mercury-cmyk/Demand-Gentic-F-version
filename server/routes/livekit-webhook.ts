import { Router, Request, Response } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import { db } from "../db";
import { callSessions, callSessionEvents } from "@shared/schema";
import { eq } from "drizzle-orm";

const LOG = "[LiveKit Webhook]";

// Lazy-init receiver (env vars may not be available at import time)
let receiver: WebhookReceiver | null = null;

function getReceiver(): WebhookReceiver {
  if (!receiver) {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required for webhook verification");
    }
    receiver = new WebhookReceiver(apiKey, apiSecret);
  }
  return receiver;
}

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;

  if (!rawBody || !authHeader) {
    console.warn(`${LOG} Missing rawBody or Authorization header`);
    return res.status(401).json({ error: "Missing signature" });
  }

  let event: any;
  try {
    event = await getReceiver().receive(rawBody, authHeader);
  } catch (err) {
    console.error(`${LOG} Signature verification failed:`, err);
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Acknowledge receipt immediately
  res.status(200).json({ received: true });

  // Log every event
  console.log(`${LOG} Event: ${event.event}`, JSON.stringify({
    room: event.room?.name,
    roomSid: event.room?.sid,
    participant: event.participant?.identity,
    participantSid: event.participant?.sid,
    track: event.track?.sid,
    id: event.id,
    createdAt: event.createdAt?.toString(),
  }));

  // Process lifecycle events
  try {
    await handleLiveKitEvent(event);
  } catch (err) {
    console.error(`${LOG} Error processing event ${event.event}:`, err);
  }
});

async function handleLiveKitEvent(event: any): Promise<void> {
  const roomName = event.room?.name;

  switch (event.event) {
    case "room_started":
      console.log(`${LOG} Room started: ${roomName} (${event.room?.sid})`);
      break;

    case "participant_joined": {
      const identity = event.participant?.identity;
      const isAgent = identity?.startsWith("agent-") ||
        event.participant?.metadata?.includes('"agent"');
      console.log(`${LOG} Participant joined: ${identity} in room ${roomName} (agent=${isAgent})`);

      // SIP participant (phone callee) joined → mark session connected
      if (!isAgent && roomName) {
        await updateCallSessionStatus(roomName, "connected");
      }
      break;
    }

    case "participant_left": {
      console.log(`${LOG} Participant left: ${event.participant?.identity} from room ${roomName}`);
      break;
    }

    case "room_finished": {
      console.log(`${LOG} Room finished: ${roomName} (${event.room?.sid})`);
      if (roomName) {
        await finalizeCallSession(roomName, event);
      }
      break;
    }

    case "track_published":
    case "track_unpublished":
      console.log(`${LOG} Track ${event.event}: ${event.track?.sid} type=${event.track?.type} source=${event.track?.source} in room ${roomName}`);
      break;

    default:
      console.log(`${LOG} Unhandled event: ${event.event}`);
  }
}

async function updateCallSessionStatus(
  roomName: string,
  status: "connecting" | "ringing" | "connected" | "completed"
): Promise<void> {
  const sessions = await db
    .select({ id: callSessions.id })
    .from(callSessions)
    .where(eq(callSessions.aiConversationId, roomName))
    .limit(1);

  if (sessions.length > 0) {
    await db.update(callSessions)
      .set({ status, updatedAt: new Date() } as any)
      .where(eq(callSessions.id, sessions[0].id));
    console.log(`${LOG} Updated session ${sessions[0].id} status → ${status}`);
  }
}

async function finalizeCallSession(roomName: string, event: any): Promise<void> {
  const sessions = await db
    .select()
    .from(callSessions)
    .where(eq(callSessions.aiConversationId, roomName))
    .limit(1);

  if (sessions.length === 0) return;

  const session = sessions[0];
  const endedAt = new Date();
  const durationSec = session.startedAt
    ? Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000)
    : undefined;

  await db.update(callSessions)
    .set({ status: "completed" as any, endedAt, durationSec })
    .where(eq(callSessions.id, session.id));

  console.log(`${LOG} Finalized session ${session.id}: duration=${durationSec}s`);

  // Audit trail
  try {
    await db.insert(callSessionEvents).values({
      callSessionId: session.id,
      eventKey: "livekit_room_finished",
      eventTs: endedAt,
      valueNum: durationSec?.toString(),
      metadata: {
        roomName,
        roomSid: event.room?.sid,
        numParticipants: event.room?.numParticipants,
      },
    });
  } catch (err) {
    console.error(`${LOG} Failed to insert audit event:`, err);
  }
}

export default router;
