import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  // Find leads with "Call Assist by Google" transcript (AI call screening)
  const leads = await db.execute(sql`
    SELECT l.id, l.qa_status, l.ai_qualification_status, l.ai_analysis,
           l.created_at, c.full_name, l.transcript, ca.disposition
    FROM leads l 
    JOIN contacts c ON l.contact_id = c.id
    LEFT JOIN call_attempts ca ON l.call_attempt_id = ca.id
    WHERE l.transcript ILIKE '%Call Assist by Google%' 
    ORDER BY l.created_at DESC LIMIT 5
  `);
  
  console.log("=== TIM SCHERMETTI LEADS ===");
  for (const lead of leads.rows as any[]) {
    console.log("\n--- LEAD ---");
    console.log("ID:", lead.id);
    console.log("Status:", lead.status);
    console.log("Disposition:", lead.disposition);
    console.log("Qualification:", lead.qualification_status);
    console.log("AI Disposition:", lead.ai_disposition);
    console.log("Created:", lead.created_at);
    console.log("AI Analysis:", JSON.stringify(lead.ai_analysis, null, 2)?.substring(0, 500));
    console.log("Transcript:", lead.transcript?.substring(0, 800));
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
