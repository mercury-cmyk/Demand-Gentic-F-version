import { db } from "../db";
import { inboxSettings, type InsertInboxSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function getSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(inboxSettings)
    .where(eq(inboxSettings.userId, userId))
    .limit(1);
  return settings ?? null;
}

export async function upsertSettings(userId: string, data: Partial>) {
  const existing = await getSettings(userId);
  if (existing) {
    const [updated] = await db
      .update(inboxSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inboxSettings.userId, userId))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(inboxSettings)
    .values({ ...data, userId })
    .returning();
  return created;
}