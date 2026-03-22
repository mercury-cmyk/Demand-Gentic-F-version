import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { execSync } from "child_process";
import "dotenv/config";

async function checkAndFixGCSRecordings() {
  const missing = await db.execute(sql`
    SELECT DISTINCT ON (l.id)
      l.id, l.contact_name, l.qa_status, l.ai_score
    FROM leads l
    WHERE l.deleted_at IS NULL
      AND l.qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND l.created_at >= NOW() - INTERVAL '7 days'
      AND l.recording_s3_key IS NULL
    ORDER BY l.id
  `);

  console.log(`=== Checking GCS bucket for ${missing.rows.length} lead recordings ===\n`);

  // Get list of all recording files in GCS
  const gcsList = execSync('gcloud storage ls gs://demandgentic-prod-storage-2026/recordings/', { encoding: 'utf-8' });
  const gcsFiles = new Set(gcsList.split('\n').map(f => f.replace('gs://demandgentic-prod-storage-2026/', '').trim()).filter(Boolean));
  console.log(`Total files in GCS recordings/: ${gcsFiles.size}\n`);

  // Also get call-recordings
  let callRecFiles: string[] = [];
  try {
    const callRecList = execSync('gcloud storage ls gs://demandgentic-prod-storage-2026/call-recordings/ --recursive', { encoding: 'utf-8' });
    callRecFiles = callRecList.split('\n').map(f => f.replace('gs://demandgentic-prod-storage-2026/', '').trim()).filter(f => f && !f.endsWith('/'));
  } catch (e) {}
  console.log(`Total files in GCS call-recordings/: ${callRecFiles.length}\n`);

  let found = 0;
  let notFound = 0;

  for (const row of missing.rows as any[]) {
    const leadId = row.id;
    const wavKey = `recordings/${leadId}.wav`;
    const mp3Key = `recordings/${leadId}.mp3`;

    if (gcsFiles.has(wavKey)) {
      console.log(`  ✅ Found: ${row.contact_name} -> ${wavKey}`);
      await db.execute(sql`UPDATE leads SET recording_s3_key = ${wavKey}, updated_at = NOW() WHERE id = ${leadId}`);
      found++;
    } else if (gcsFiles.has(mp3Key)) {
      console.log(`  ✅ Found: ${row.contact_name} -> ${mp3Key}`);
      await db.execute(sql`UPDATE leads SET recording_s3_key = ${mp3Key}, updated_at = NOW() WHERE id = ${leadId}`);
      found++;
    } else {
      // Check call-recordings by looking for any file with matching lead/session patterns
      const matchingCallRec = callRecFiles.find(f => f.includes(leadId));
      if (matchingCallRec) {
        console.log(`  ✅ Found (call-rec): ${row.contact_name} -> ${matchingCallRec}`);
        await db.execute(sql`UPDATE leads SET recording_s3_key = ${matchingCallRec}, updated_at = NOW() WHERE id = ${leadId}`);
        found++;
      } else {
        console.log(`  ❌ Not in GCS: ${row.contact_name} (${leadId}) | score: ${row.ai_score}`);
        notFound++;
      }
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`  Found in GCS: ${found}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Total: ${missing.rows.length}`);
}

checkAndFixGCSRecordings().catch(console.error).finally(() => process.exit(0));