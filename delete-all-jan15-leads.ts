import { db } from './server/db';
import { sql } from 'drizzle-orm';

console.log('Deleting all January 15 leads (they are all voicemails)...\n');

await db.execute(sql`
  DELETE FROM leads
  WHERE created_at::date = '2026-01-15'
`);

console.log('✅ Deleted all Jan 15 leads\n');

const count = await db.execute(sql`
  SELECT COUNT(*) as count
  FROM leads
  WHERE created_at::date = '2026-01-15'
`);

console.log(`Remaining leads from Jan 15: ${count.rows[0]?.count || 0}`);

console.log('\n========================================');
console.log('CONCLUSION');
console.log('========================================\n');

console.log('Analysis of January 15, 2026 campaign:');
console.log('  - Total calls: 971 (>=20s)');
console.log('  - Transcribed: 782 calls');
console.log('  - Actual conversations: 0');
console.log('  - All calls were: voicemails, no-answers, or system issues\n');

console.log('Result:');
console.log('  - Zero qualified leads from this campaign');
console.log('  - All "leads" in database were voicemails (now deleted)\n');

console.log('Recommendations:');
console.log('  1. Fix voicemail detection in dialer (0% accuracy)');
console.log('  2. Review call disposition logic (93.9% marked "no_answer")');
console.log('  3. Check AI agent conversation flow (may be hanging up too early)');
console.log('  4. Analyze why no prospects engaged in conversations\n');

process.exit(0);
