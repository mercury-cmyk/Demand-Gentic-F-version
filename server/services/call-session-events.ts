import { db } from "../db";
import { callSessionEvents } from "@shared/schema";

export interface CallSessionEventInput {
  eventKey: string;
  eventTs?: Date;
  valueNum?: number | null;
  valueText?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function emitCallSessionEvent(
  callSessionId: string,
  event: CallSessionEventInput
): Promise<void> {
  await db.insert(callSessionEvents).values({
    callSessionId,
    eventKey: event.eventKey,
    eventTs: event.eventTs || new Date(),
    valueNum: event.valueNum ?? null,
    valueText: event.valueText ?? null,
    metadata: (event.metadata || null) as any,
  });
}

export async function emitCallSessionEvents(
  callSessionId: string,
  events: CallSessionEventInput[]
): Promise<void> {
  if (!events.length) return;

  await db.insert(callSessionEvents).values(
    events.map((event) => ({
      callSessionId,
      eventKey: event.eventKey,
      eventTs: event.eventTs || new Date(),
      valueNum: event.valueNum ?? null,
      valueText: event.valueText ?? null,
      metadata: (event.metadata || null) as any,
    }))
  );
}

