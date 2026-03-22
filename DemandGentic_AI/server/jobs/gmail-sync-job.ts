import * as cron from "node-cron";
import { gmailSyncService } from "../services/gmail-sync-service";

let syncJob: ReturnType | null = null;

export function startGmailSyncJob() {
  if (syncJob) {
    console.log("[GmailSyncJob] Job already running");
    return;
  }

  syncJob = cron.schedule("*/5 * * * *", async () => {
    try {
      console.log("[GmailSyncJob] Starting scheduled Gmail sync...");
      const result = await gmailSyncService.syncAllMailboxes();
      console.log(`[GmailSyncJob] Sync complete - Total: ${result.total}, Synced: ${result.synced}, Errors: ${result.errors}`);
    } catch (error) {
      console.error("[GmailSyncJob] Error during sync:", error);
    }
  });

  console.log("[GmailSyncJob] Started - runs every 5 minutes (*/5 * * * *)");
}

export function stopGmailSyncJob() {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
    console.log("[GmailSyncJob] Stopped");
  }
}