import { db } from "@/db";
import { queueItems } from "@/db/schema";
import { eq, lt, and } from "drizzle-orm";

/**
 * Resets queue items that have been stuck in 'in_progress' for too long.
 * This ensures the campaign slots open up and calls continue.
 */
export async function cleanupStaleQueueItems() {
  const STALE_THRESHOLD_MINUTES = 45;
  const thresholdDate = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

  const result = await db.update(queueItems)
    .set({
      status: "pending",
      virtualAgentId: null, // Release the agent lock
      updatedAt: new Date(),
    })
    .where(and(
      eq(queueItems.status, "in_progress"),
      lt(queueItems.updatedAt, thresholdDate)
    ));

  console.log(`[QueueMaintenance] Reset ${result.rowCount} stale queue items.`);
}