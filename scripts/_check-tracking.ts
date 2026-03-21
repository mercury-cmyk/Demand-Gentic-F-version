import "dotenv/config";
import "../server/env";
import { db } from "../server/db";
import { clientNotifications } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [n] = await db
    .select({ html: clientNotifications.htmlContent })
    .from(clientNotifications)
    .where(eq(clientNotifications.id, "a42a6cfd-e999-49b7-b143-cec772c987c1"))
    .limit(1);

  const html = n?.html ?? "";
  
  // Find all href links
  const links = html.match(/href=["']([^"']+)["']/g) || [];
  console.log("Links in original template:");
  links.forEach((l: string, i: number) => console.log(i, l));

  // Now check what tracking does to them
  const { emailTrackingService } = await import("../server/lib/email-tracking-service");
  const tracked = emailTrackingService.applyTracking(html, {
    messageId: "test-123",
    recipientEmail: "test@example.com",
  });
  
  // Find all href links in tracked version
  const trackedLinks = tracked.match(/href=["']([^"']+)["']/g) || [];
  console.log("\nLinks after tracking:");
  trackedLinks.forEach((l: string, i: number) => console.log(i, l));

  process.exit(0);
}

main().catch(console.error);
