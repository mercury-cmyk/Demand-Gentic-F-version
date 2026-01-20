import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('========================================');
  console.log('  MANUAL REVIEW UPDATES');
  console.log('========================================\n');

  // Reject the 3 leads based on manual review
  const rejects = [
    { name: 'Garima Kalra', reason: 'Call cut off mid-pitch - no prospect engagement' },
    { name: 'Don Fritz', reason: 'Call cut off mid-pitch - no prospect engagement' },
    { name: 'Cathy Calver', reason: 'Voicemail stuck loop - not a real conversation' },
  ];

  for (const r of rejects) {
    const reason = r.reason;
    const namePattern = '%' + r.name + '%';
    const reviewedAt = new Date().toISOString();
    
    const result = await db.execute(sql`
      UPDATE leads l
      SET qa_status = 'rejected',
          ai_analysis = jsonb_build_object(
            'manualReview', true::boolean,
            'reason', ${reason}::text,
            'reviewedAt', ${reviewedAt}::text
          ),
          updated_at = NOW()
      FROM contacts c
      WHERE l.contact_id = c.id
        AND c.full_name ILIKE ${namePattern}
      RETURNING l.id, c.full_name
    `);

    if (result.rows.length > 0) {
      console.log(`❌ Rejected: ${(result.rows[0] as any).full_name}`);
      console.log(`   Reason: ${reason}\n`);
    }
  }

  // Delete orphan leads (0 calls)
  console.log('\n--- Cleaning up orphan leads (no calls) ---\n');
  
  const orphans = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      c.full_name,
      c.email
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    WHERE l.qa_status = 'new'
      AND NOT EXISTS (
        SELECT 1 FROM dialer_call_attempts dca 
        WHERE dca.contact_id = l.contact_id
      )
  `);

  console.log(`Found ${orphans.rows.length} leads with no call attempts:`);
  
  for (const orphan of orphans.rows as any[]) {
    console.log(`  • ${orphan.full_name} (${orphan.email})`);
    await db.execute(sql`DELETE FROM leads WHERE id = ${orphan.lead_id}`);
  }
  
  if (orphans.rows.length > 0) {
    console.log(`\n✅ Deleted ${orphans.rows.length} orphan leads`);
  }

  // Show Adrian Love and Julie Parrish call details
  console.log('\n\n--- Calls needing transcription ---\n');

  for (const name of ['Adrian Love', 'Julie Parrish']) {
    const calls = await db.execute(sql`
      SELECT
        dca.id,
        dca.call_duration_seconds,
        dca.disposition,
        dca.recording_url,
        dca.created_at
      FROM dialer_call_attempts dca
      JOIN contacts c ON c.id = dca.contact_id
      WHERE c.full_name ILIKE ${'%' + name + '%'}
      ORDER BY dca.call_duration_seconds DESC
      LIMIT 3
    `);

    console.log(`${name}:`);
    for (const call of calls.rows as any[]) {
      console.log(`  Duration: ${call.call_duration_seconds}s`);
      console.log(`  Disposition: ${call.disposition}`);
      console.log(`  Recording: ${call.recording_url ? 'YES ✓' : 'NO'}`);
      console.log(`  Call ID: ${call.id}`);
      console.log('');
    }
  }

  // Final summary
  const summary = await db.execute(sql`
    SELECT qa_status, COUNT(*) as cnt
    FROM leads
    GROUP BY qa_status
    ORDER BY cnt DESC
  `);

  console.log('\n--- Lead Status Summary ---\n');
  const emojiMap: Record<string, string> = {
    new: '📋',
    approved: '✅',
    under_review: '🔍',
    rejected: '❌',
  };
  for (const row of summary.rows as any[]) {
    const emoji = emojiMap[row.qa_status] || '❓';
    console.log(`  ${emoji} ${row.qa_status}: ${row.cnt}`);
  }

  process.exit(0);
}

main().catch(console.error);
