import { db } from "./server/db";
import { dialerCallAttempts, leads } from "./shared/schema";
import { desc } from "drizzle-orm";

async function checkCalls() {
  console.log("Recent call attempts:");
  const attempts = await db
    .select()
    .from(dialerCallAttempts)
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(5);

  for (const a of attempts) {
    console.log("  -", a.id.slice(0,8), "|", a.status, "|", a.disposition || "no-disp", "|", a.telnyxCallId || "no-telnyx-id", "|", a.createdAt);
  }

  console.log("\nRecent leads:");
  const recentLeads = await db
    .select()
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .limit(5);

  for (const l of recentLeads) {
    console.log("  -", l.id.slice(0,8), "|", l.status, "|", l.telnyxCallId || "no-call-id", "|", l.createdAt);
  }
}

checkCalls().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });