import "dotenv/config";
import "../server/env";
import { db } from "../server/db";
import { clientNotifications } from "../shared/schema";
import { eq } from "drizzle-orm";
import { gmailSyncService } from "../server/services/gmail-sync-service";

async function main() {
  const NOTIFICATION_ID = "a42a6cfd-e999-49b7-b143-cec772c987c1";
  const GOOGLE_MAILBOX_ID = "3b8ebbdd-373a-4633-80fc-e14d38d05592";

  // 1. Fetch the branded HTML
  const [notification] = await db
    .select()
    .from(clientNotifications)
    .where(eq(clientNotifications.id, NOTIFICATION_ID))
    .limit(1);

  if (!notification) {
    console.error("Notification not found");
    process.exit(1);
  }

  console.log("Subject:", notification.subject);
  console.log("HTML length:", notification.htmlContent.length, "chars");

  const toEmails = "jrosenberg@argyleforum.com, pprice@argyleforum.com, ilavara@argyleforum.com";

  // 2. Send via Gmail WITH skipTracking: true (no tracking injection)
  console.log("\n📧 Resending via Gmail WITHOUT tracking...");

  const result = await gmailSyncService.sendEmail(GOOGLE_MAILBOX_ID, {
    to: toEmails,
    subject: notification.subject,
    body: notification.htmlContent,
    skipTracking: true,
  });

  console.log("\n✅ Email sent (clean, no tracking)!");
  console.log("Gmail Message ID:", result.messageId);
  console.log("Recipients:", toEmails);

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Failed to send:", err.message || err);
  process.exit(1);
});