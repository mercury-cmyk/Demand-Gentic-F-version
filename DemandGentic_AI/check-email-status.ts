import { db } from "./server/db";
import { emailSends, emailEvents } from "./shared/schema";
import { sql, desc, eq, count } from "drizzle-orm";

async function checkEmailStatus() {
  console.log("Checking email status...");

  // Count by status
  console.log("\n--- Email Sends by Status ---");
  const statusCounts = await db
    .select({
      status: emailSends.status,
      count: count(),
    })
    .from(emailSends)
    .groupBy(emailSends.status);

  if (statusCounts.length === 0) {
    console.log("No email sends found.");
  } else {
    statusCounts.forEach((row) => {
      console.log(`${row.status}: ${row.count}`);
    });
  }

  // Get recent sent emails
  console.log("\n--- Recent Sent Emails ---");
  const recentSends = await db
    .select()
    .from(emailSends)
    .where(eq(emailSends.status, 'sent'))
    .orderBy(desc(emailSends.sentAt))
    .limit(5);

  if (recentSends.length === 0) {
    console.log("No sent emails found.");
  } else {
    recentSends.forEach((email) => {
      console.log(`- ID: ${email.id}, To Contact ID: ${email.contactId}, Sent At: ${email.sentAt}`);
    });
  }
  
    // Count by event type
  console.log("\n--- Email Events by Type ---");
  const eventCounts = await db
    .select({
      type: emailEvents.type,
      count: count(),
    })
    .from(emailEvents)
    .groupBy(emailEvents.type);

  if (eventCounts.length === 0) {
    console.log("No email events found.");
  } else {
    eventCounts.forEach((row) => {
      console.log(`${row.type}: ${row.count}`);
    });
  }

  process.exit(0);
}

checkEmailStatus().catch((err) => {
  console.error("Error checking email status:", err);
  process.exit(1);
});