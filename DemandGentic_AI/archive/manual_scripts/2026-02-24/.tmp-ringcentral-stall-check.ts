import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
  const campaignName = "RingCentral_AppointmentGen";
  const res = await db.execute(sql`
    SELECT id, name, status, dial_mode, last_stall_reason, last_stall_reason_at, updated_at
    FROM campaigns
    WHERE name = ${campaignName}
    LIMIT 1
  `);
  console.log(JSON.stringify(res.rows?.[0] ?? null, null, 2));
}

run().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});