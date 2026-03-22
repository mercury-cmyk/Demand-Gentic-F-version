import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function analyze() {
  console.log('=== DISPOSITION ANALYSIS ===\n');

  // Check disposition breakdown with duration
  const dispAnalysis = await db.execute(sql`
    SELECT
      disposition,
      COUNT(*) as count,
      AVG(call_duration_seconds) as avg_duration,
      MAX(call_duration_seconds) as max_duration,
      COUNT(CASE WHEN call_duration_seconds >= 30 THEN 1 END) as over_30s,
      COUNT(CASE WHEN connected = true THEN 1 END) as connected_count
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY disposition
    ORDER BY count DESC
  `);

  console.log('Disposition      | Count  | Avg Dur | Max Dur | Over 30s | Connected');
  console.log('-'.repeat(80));
  for (const d of dispAnalysis.rows as any[]) {
    const disp = (d.disposition || 'NULL').padEnd(16);
    const count = String(d.count).padEnd(6);
    const avgDur = (Math.round(d.avg_duration || 0) + 's').padEnd(7);
    const maxDur = (Math.round(d.max_duration || 0) + 's').padEnd(7);
    const over30 = String(d.over_30s).padEnd(8);
    console.log(`${disp} | ${count} | ${avgDur} | ${maxDur} | ${over30} | ${d.connected_count}`);
  }

  // Check if any qualified_lead dispositions exist
  console.log('\n\n=== QUALIFIED LEAD DISPOSITIONS ===');
  const qualified = await db.execute(sql`
    SELECT id, disposition, call_duration_seconds, created_at
    FROM dialer_call_attempts
    WHERE disposition = 'qualified_lead'
    ORDER BY created_at DESC
    LIMIT 5
  `);
  if (qualified.rows.length === 0) {
    console.log('❌ NO qualified_lead dispositions found!');
    console.log('   The AI is NOT classifying any calls as qualified leads.');
  } else {
    console.log(`Found ${qualified.rows.length} qualified_lead dispositions`);
    for (const q of qualified.rows as any[]) {
      console.log(`  - ID: ${q.id}, Duration: ${q.call_duration_seconds}s, Date: ${q.created_at}`);
    }
  }

  // Check leads table
  console.log('\n=== ALL LEADS IN DATABASE ===');
  const leads = await db.execute(sql`
    SELECT l.id, l.qa_status, l.call_duration, l.created_at, c.first_name, c.last_name
    FROM leads l
    JOIN contacts c ON l.contact_id = c.id
    ORDER BY l.created_at DESC
    LIMIT 10
  `);
  if (leads.rows.length === 0) {
    console.log('❌ NO LEADS in database at all!');
  } else {
    console.log(`Found ${leads.rows.length} leads:`);
    for (const lead of leads.rows as any[]) {
      console.log(`  - ${lead.first_name} ${lead.last_name}, QA: ${lead.qa_status}, Duration: ${lead.call_duration}s, Created: ${lead.created_at}`);
    }
  }

  // Check if disposition_processed is being set
  console.log('\n=== DISPOSITION PROCESSED STATUS (last 24h) ===');
  const processed = await db.execute(sql`
    SELECT
      disposition_processed,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY disposition_processed
  `);
  for (const p of processed.rows as any[]) {
    console.log(`  disposition_processed=${p.disposition_processed}: ${p.count} calls`);
  }

  // Check calls with duration > 60s but not qualified
  console.log('\n=== LONG CALLS (>60s) NOT QUALIFIED ===');
  const longCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.connected,
      c.first_name,
      c.last_name,
      dca.created_at
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca.contact_id = c.id
    WHERE dca.call_duration_seconds > 60
    AND dca.disposition != 'qualified_lead'
    AND dca.created_at > NOW() - INTERVAL '7 days'
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 10
  `);

  if (longCalls.rows.length === 0) {
    console.log('  No long calls found');
  } else {
    console.log(`Found ${longCalls.rows.length} calls over 60s that weren't qualified:`);
    for (const call of longCalls.rows as any[]) {
      console.log(`  - ${call.first_name} ${call.last_name}: ${call.call_duration_seconds}s, Disposition: ${call.disposition || 'NULL'}, Connected: ${call.connected}`);
    }
  }

  // Check what AI transcripts show
  console.log('\n=== SAMPLE TRANSCRIPT DATA ===');
  const transcripts = await db.execute(sql`
    SELECT
      dca.id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.transcript,
      dca.created_at
    FROM dialer_call_attempts dca
    WHERE dca.call_duration_seconds > 30
    AND dca.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 3
  `);

  for (const t of transcripts.rows as any[]) {
    console.log(`\n  Call ID: ${t.id}, Duration: ${t.call_duration_seconds}s, Disposition: ${t.disposition}`);
    if (t.transcript) {
      const preview = t.transcript.substring(0, 500);
      console.log(`  Transcript preview: ${preview}...`);
    } else {
      console.log('  No transcript available');
    }
  }

  process.exit(0);
}

analyze().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});