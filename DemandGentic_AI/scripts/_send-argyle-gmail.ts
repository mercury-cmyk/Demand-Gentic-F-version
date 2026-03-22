import "dotenv/config";
import "../server/env";
import { db } from "../server/db";
import { emailDrafts } from "../shared/schema";
import { eq } from "drizzle-orm";
import { gmailSyncService } from "../server/services/gmail-sync-service";

async function main() {
  const DRAFT_ID = "d2fa7603-4205-4222-b2e2-110a08ab9662";
  const GOOGLE_MAILBOX_ID = "3b8ebbdd-373a-4633-80fc-e14d38d05592"; // zahid.m@pivotal-b2b.com via google

  // 1. Fetch the draft
  const [draft] = await db
    .select()
    .from(emailDrafts)
    .where(eq(emailDrafts.id, DRAFT_ID))
    .limit(1);

  if (!draft) {
    console.error("Draft not found:", DRAFT_ID);
    process.exit(1);
  }

  console.log("Found draft:", draft.subject);
  console.log("To:", draft.toEmails?.join(", "));
  console.log("bodyHtml length:", draft.bodyHtml?.length ?? 0, "chars");

  if (!draft.bodyHtml || draft.bodyHtml.length === 0) {
    console.error("Draft body is empty!");
    process.exit(1);
  }

  // 2. Send via Gmail sync service
  console.log("\n📧 Sending via Gmail (zahid.m@pivotal-b2b.com)...");

  const toEmails = draft.toEmails?.join(", ") ?? "";

  const result = await gmailSyncService.sendEmail(GOOGLE_MAILBOX_ID, {
    to: toEmails,
    subject: draft.subject ?? "Your Pipeline & Engagement Dashboard is Live — Argyle Executive Forum",
    body: draft.bodyHtml,
  });

  console.log("\n✅ Email sent successfully!");
  console.log("Gmail Message ID:", result.messageId);
  console.log("Recipients:", toEmails);

  // 3. Clean up the draft
  await db.delete(emailDrafts).where(eq(emailDrafts.id, DRAFT_ID));
  console.log("Draft cleaned up.");
}

main().catch((err) => {
  console.error("\n❌ Failed to send:", err.message || err);
  process.exit(1);
});