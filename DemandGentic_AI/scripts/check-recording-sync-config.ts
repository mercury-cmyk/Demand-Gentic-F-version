/**
 * Check Recording Auto-Sync Configuration
 * Verifies that campaigns are configured to automatically sync recordings to GCS
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function checkConfig() {
  console.log('\n========================================');
  console.log('  RECORDING AUTO-SYNC CONFIGURATION');
  console.log('========================================\n');

  // Check if auto-recording sync worker exists and is configured
  console.log('1. Checking auto-recording sync worker...\n');

  // Check campaigns table for recording-related columns
  const columns = await db.execute(sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'campaigns'
      AND (column_name LIKE '%recording%' OR column_name LIKE '%sync%')
    ORDER BY ordinal_position
  `);

  if (columns.rows.length > 0) {
    console.log('Recording-related columns in campaigns table:');
    for (const row of columns.rows) {
      const r = row as any;
      console.log(`  - ${r.column_name}: ${r.data_type} (default: ${r.column_default || 'none'})`);
    }
  } else {
    console.log('No recording-specific columns found in campaigns table.');
  }
  console.log('');

  // Check recent call attempts for recording status
  console.log('2. Recent call recording status...\n');
  const recentCalls = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(recording_url) as with_url,
      COUNT(CASE WHEN recording_url LIKE 'https://storage.googleapis.com%' THEN 1 END) as gcs_stored,
      COUNT(CASE WHEN recording_url LIKE 'https://s3.amazonaws.com/telephony-recorder-prod%' THEN 1 END) as telnyx_url
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '7 days'
      AND call_duration_seconds > 30
  `);

  const stats = recentCalls.rows[0] as any;
  console.log('Last 7 days (calls > 30s):');
  console.log(`  Total calls: ${stats.total}`);
  console.log(`  With recording URL: ${stats.with_url}`);
  console.log(`  Stored in GCS: ${stats.gcs_stored}`);
  console.log(`  Telnyx URLs (may expire): ${stats.telnyx_url}`);
  console.log('');

  // Check if there's a webhook handler for recording completion
  console.log('3. Checking disposition engine for auto-sync...\n');

  // Check leads for recording storage
  const leadStats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(recording_url) as with_url,
      COUNT(recording_s3_key) as with_gcs_key
    FROM leads
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);

  const ls = leadStats.rows[0] as any;
  console.log('Leads (last 30 days):');
  console.log(`  Total leads: ${ls.total}`);
  console.log(`  With recording URL: ${ls.with_url}`);
  console.log(`  With GCS key (permanent): ${ls.with_gcs_key}`);
  console.log('');

  // Check environment variables
  console.log('4. Environment configuration...\n');
  console.log(`  GCS_BUCKET: ${process.env.GCS_BUCKET ? 'SET ✓' : 'NOT SET'}`);
  console.log(`  GCS_PROJECT_ID: ${process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT ? 'SET ✓' : 'NOT SET'}`);
  console.log(`  TELNYX_API_KEY: ${process.env.TELNYX_API_KEY ? 'SET ✓' : 'NOT SET'}`);
  console.log('');

  console.log('========================================');
  console.log('  RECOMMENDATIONS');
  console.log('========================================\n');

  if (parseInt(ls.with_gcs_key)  0) {
    console.log('⚠️  Some recordings still have Telnyx URLs (will expire).');
    console.log('   These should be downloaded to GCS immediately after calls.\n');
  }

  process.exit(0);
}

checkConfig().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});