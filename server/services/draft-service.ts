import { db } from "../db";
import { emailDrafts, type InsertEmailDraft } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function listDrafts(
  userId: string,
  options: { limit?: number; offset?: number } = {}
) {
  const { limit = 50, offset = 0 } = options;
  return db
    .select()
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId))
    .orderBy(desc(emailDrafts.lastSavedAt))
    .limit(limit)
    .offset(offset);
}

export async function getDraft(userId: string, draftId: string) {
  const [draft] = await db
    .select()
    .from(emailDrafts)
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)))
    .limit(1);
  return draft ?? null;
}

export async function createDraft(data: InsertEmailDraft) {
  const [draft] = await db.insert(emailDrafts).values(data).returning();
  return draft;
}

export async function updateDraft(
  userId: string,
  draftId: string,
  data: Partial<Omit<InsertEmailDraft, "userId">>
) {
  const [updated] = await db
    .update(emailDrafts)
    .set({ ...data, lastSavedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function deleteDraft(userId: string, draftId: string) {
  const result = await db
    .delete(emailDrafts)
    .where(and(eq(emailDrafts.id, draftId), eq(emailDrafts.userId, userId)));
  return (result.rowCount ?? 0) > 0;
}

export async function getDraftCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(emailDrafts)
    .where(eq(emailDrafts.userId, userId));
  return Number(result?.count ?? 0);
}
