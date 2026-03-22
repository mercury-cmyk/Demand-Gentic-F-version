import { db } from './server/db';
import { callSessions } from './shared/schema';
import { sql, and, gte, lt, eq, isNull } from 'drizzle-orm';

async function auditLongNulls() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get long NULL calls with all fields
  const longNulls = await db.select()
    .from(callSessions)
    .where(and(
      gte(callSessions.startedAt, yesterday),
      lt(callSessions.startedAt, today),
      eq(callSessions.agentType, 'ai'),
      isNull(callSessions.aiDisposition),
      gte(callSessions.durationSec, 30),
    ))
    .orderBy(sql`${callSessions.durationSec} DESC`)
    .limit(20);

  console.log(`\n📊 LONG NULL-DISPOSITION CALLS (≥30s) — Top 20 by duration\n`);
  console.log(`Total found: ${longNulls.length} (showing top 20)\n`);
  
  longNulls.forEach((c, i) => {
    console.log(`--- Call ${i+1} ---`);
    console.log(`  ID: ${c.id}`);
    console.log(`  Duration: ${c.durationSec}s`);
    console.log(`  To: ${c.toNumberE164}`);
    console.log(`  From: ${c.fromNumber}`);
    console.log(`  Campaign: ${c.campaignId}`);
    console.log(`  Started: ${c.startedAt}`);
    console.log(`  Ended: ${c.endedAt}`);
    console.log(`  Telnyx Call ID: ${c.telnyxCallId}`);
    console.log(`  Agent Type: ${c.agentType}`);
    console.log(`  Transcript: ${c.aiTranscript ? `"${c.aiTranscript.substring(0, 100)}"` : 'NULL'}`);
    console.log(`  Disposition: ${c.aiDisposition}`);
    console.log(`  Recording URL: ${(c as any).recordingUrl || 'N/A'}`);
    // Print all non-null fields
    const nonNull = Object.entries(c as any).filter(([k, v]) => v != null && v !== '' && k !== 'id' && k !== 'aiTranscript');
    console.log(`  All non-null fields: ${nonNull.map(([k, v]) => `${k}=${typeof v === 'string' ? v.substring(0, 50) : v}`).join(', ')}`);
    console.log('');
  });

  // Also check: do the 85 calls WITH disposition all have transcript?
  const withDisp = await db.select({
    id: callSessions.id,
    disposition: callSessions.aiDisposition,
    duration: callSessions.durationSec,
    hasTranscript: sql`${callSessions.aiTranscript} IS NOT NULL AND LENGTH(${callSessions.aiTranscript}) > 0`,
    transcriptLen: sql`COALESCE(LENGTH(${callSessions.aiTranscript}), 0)`,
  })
  .from(callSessions)
  .where(and(
    gte(callSessions.startedAt, yesterday),
    lt(callSessions.startedAt, today),
    eq(callSessions.agentType, 'ai'),
    sql`${callSessions.aiDisposition} IS NOT NULL`,
  ));

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📋 CALLS WITH DISPOSITION — transcript check`);
  console.log(`${'='.repeat(70)}`);
  withDisp.forEach((c, i) => {
    console.log(`  ${i+1}. ID: ${c.id} | Disposition: ${c.disposition} | Duration: ${c.duration}s | Transcript: ${c.transcriptLen} chars`);
  });

  process.exit(0);
}

auditLongNulls().catch(e => { console.error(e); process.exit(1); });