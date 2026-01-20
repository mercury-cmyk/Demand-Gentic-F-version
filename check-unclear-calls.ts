import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  // Find call attempts without leads, grouped by disposition
  const result = await db.execute(sql`
    SELECT ca.disposition, COUNT(*) as count 
    FROM call_attempts ca 
    LEFT JOIN leads l ON l.call_attempt_id = ca.id 
    WHERE ca.created_at >= '2026-01-15' 
    AND l.id IS NULL 
    GROUP BY ca.disposition 
    ORDER BY count DESC
  `);
  
  console.log("=== CALL ATTEMPTS WITHOUT LEADS (since Jan 15) ===");
  console.log("By disposition:");
  for (const row of result.rows as any[]) {
    console.log(`  ${row.disposition || 'NULL'}: ${row.count}`);
  }
  
  // Get total
  const total = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM call_attempts ca 
    LEFT JOIN leads l ON l.call_attempt_id = ca.id 
    WHERE ca.created_at >= '2026-01-15' 
    AND l.id IS NULL
  `);
  console.log(`\nTotal call attempts without leads: ${(total.rows[0] as any).count}`);
  
  // Sample of unclear dispositions
  const unclear = await db.execute(sql`
    SELECT ca.id, ca.disposition, c.full_name, ca.created_at
    FROM call_attempts ca 
    JOIN contacts c ON ca.contact_id = c.id
    LEFT JOIN leads l ON l.call_attempt_id = ca.id 
    WHERE ca.created_at >= '2026-01-15' 
    AND l.id IS NULL
    ORDER BY ca.created_at DESC
    LIMIT 20
  `);
  
  console.log("\n=== CALL ATTEMPTS WITHOUT LEADS ===");
  for (const row of unclear.rows as any[]) {
    console.log(`  ${row.full_name}: ${row.disposition || 'NULL'} - ${row.created_at}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
