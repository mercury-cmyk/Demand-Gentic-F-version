import "dotenv/config";
import "../server/env";
import { db } from "../server/db";
import { emailDrafts, clientNotifications } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  const NOTIFICATION_ID = "a42a6cfd-e999-49b7-b143-cec772c987c1";
  const DRAFT_ID = "d2fa7603-4205-4222-b2e2-110a08ab9662";

  // 1. Check all columns of the notification via raw SQL
  const raw = await db.execute(sql`SELECT subject, length(html_content) as html_len, length(text_content) as text_len FROM client_notifications WHERE id = ${NOTIFICATION_ID}`);
  console.log("Notification row:", raw.rows[0]);

  // 2. Fetch htmlContent
  const [notification] = await db
    .select({ htmlContent: clientNotifications.htmlContent, subject: clientNotifications.subject })
    .from(clientNotifications)
    .where(eq(clientNotifications.id, NOTIFICATION_ID))
    .limit(1);

  if (!notification) {
    console.error("Notification not found");
    process.exit(1);
  }

  const htmlLen = notification.htmlContent?.length ?? 0;
  console.log("htmlContent length:", htmlLen, "chars");

  if (htmlLen === 0) {
    console.error("htmlContent is empty! Cannot update draft.");
    process.exit(1);
  }

  // 3. Update the existing draft with the HTML content
  const [draft] = await db.update(emailDrafts)
    .set({
      bodyHtml: notification.htmlContent,
      bodyPlain: "Your Pipeline & Engagement Dashboard is Live for the Argyle Executive Forum campaign.",
      lastSavedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailDrafts.id, DRAFT_ID))
    .returning();

  console.log("\n✅ Draft updated with branded HTML!");
  console.log("Draft ID:", draft.id);
  console.log("bodyHtml length:", draft.bodyHtml?.length ?? 0, "chars");
}

main().catch(console.error);