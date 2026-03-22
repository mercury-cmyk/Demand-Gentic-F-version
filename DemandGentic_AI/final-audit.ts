import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('=== FINAL AUDIT: Qualified Leads Recording Status (Last 7 Days) ===\n');
  
  // Count total qualified leads
  const total = await sql`
    SELECT COUNT(*) as cnt FROM leads
    WHERE qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND created_at >= NOW() - INTERVAL '7 days'
  `;
  console.log(`Total qualified leads (last 7 days): ${total[0].cnt}`);
  
  // Count with GCS recording key
  const withKey = await sql`
    SELECT COUNT(*) as cnt FROM leads
    WHERE qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND created_at >= NOW() - INTERVAL '7 days'
      AND recording_s3_key IS NOT NULL
  `;
  console.log(`With GCS recording key: ${withKey[0].cnt}`);
  
  // Count with recording URL but no GCS key
  const withUrlOnly = await sql`
    SELECT COUNT(*) as cnt FROM leads
    WHERE qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND created_at >= NOW() - INTERVAL '7 days'
      AND recording_s3_key IS NULL
      AND recording_url IS NOT NULL
  `;
  console.log(`With recording URL only (no GCS key): ${withUrlOnly[0].cnt}`);
  
  // Count missing both
  const missing = await sql`
    SELECT l.id, l.contact_name, l.ai_score, l.qa_status, l.recording_url, l.recording_s3_key
    FROM leads l
    WHERE l.qa_status IN ('under_review', 'approved', 'pending_pm_review', 'published')
      AND l.created_at >= NOW() - INTERVAL '7 days'
      AND l.recording_s3_key IS NULL
      AND l.recording_url IS NULL
    ORDER BY l.ai_score DESC NULLS LAST
  `;
  console.log(`Missing both URL and GCS key: ${missing.length}`);
  
  if (missing.length > 0) {
    console.log('\n--- Leads still missing recordings ---');
    for (const r of missing) {
      console.log(`  ${r.contact_name} | score: ${r.ai_score} | qa: ${r.qa_status}`);
    }
  }
  
  // Coverage percentage
  const totalCount = parseInt(total[0].cnt as string);
  const withKeyCount = parseInt(withKey[0].cnt as string);
  const pct = totalCount > 0 ? ((withKeyCount / totalCount) * 100).toFixed(1) : '0';
  console.log(`\n=== Coverage: ${withKeyCount}/${totalCount} (${pct}%) have GCS recording keys ===`);
}

main().catch(console.error);