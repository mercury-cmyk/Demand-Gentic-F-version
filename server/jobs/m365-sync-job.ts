import * as cron from "node-cron";
import { m365SyncService } from "../services/m365-sync-service";

let syncJob: ReturnType<typeof cron.schedule> | null = null;

export function startM365SyncJob() {
  if (syncJob) {
    console.log("[M365SyncJob] Job already running");
    return;
  }

  syncJob = cron.schedule("*/5 * * * *", async () => {
    try {
      console.log("[M365SyncJob] Starting scheduled email sync...");
      const result = await m365SyncService.syncAllMailboxes();
      console.log(`[M365SyncJob] Sync complete - Total: ${result.total}, Synced: ${result.synced}, Errors: ${result.errors}`);
    } catch (error) {
      console.error("[M365SyncJob] Error during sync:", error);
    }
  });

  console.log("[M365SyncJob] Started - runs every 5 minutes (*/5 * * * *)");
}

export function stopM365SyncJob() {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
    console.log("[M365SyncJob] Stopped");
  }
}
