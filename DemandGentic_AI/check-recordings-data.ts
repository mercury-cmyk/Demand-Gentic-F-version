import { db } from './server/db';
import { callSessions } from './shared/schema';
import { desc, count, isNotNull, or } from 'drizzle-orm';

async function check() {
  console.log('=== Checking Call Sessions ===\n');
  
  const total = await db.select({ count: count() }).from(callSessions);
  console.log('Total call sessions:', total[0].count);
  
  // Count with recordings
  const withRecordings = await db
    .select({ count: count() })
    .from(callSessions)
    .where(or(isNotNull(callSessions.recordingS3Key), isNotNull(callSessions.recordingUrl)));
  console.log('Sessions with recordings:', withRecordings[0].count);
  
  // Recent sessions
  const sessions = await db
    .select({
      id: callSessions.id,
      telnyxCallId: callSessions.telnyxCallId,
      startedAt: callSessions.startedAt,
      recordingUrl: callSessions.recordingUrl,
      recordingS3Key: callSessions.recordingS3Key,
      recordingStatus: callSessions.recordingStatus,
      fromNumber: callSessions.fromNumber,
      toNumber: callSessions.toNumberE164,
    })
    .from(callSessions)
    .orderBy(desc(callSessions.startedAt))
    .limit(10);
    
  console.log('\nRecent 10 sessions:');
  sessions.forEach((s, i) => {
    console.log(`${i + 1}. ${s.startedAt?.toISOString()?.slice(0, 19) || 'no date'}`);
    console.log(`   Phone: ${s.toNumber || s.fromNumber || 'N/A'}`);
    console.log(`   Recording: status=${s.recordingStatus || 'null'}, hasS3=${!!s.recordingS3Key}, hasUrl=${!!s.recordingUrl}`);
    console.log(`   Telnyx ID: ${s.telnyxCallId?.slice(0, 30) || 'N/A'}`);
    console.log('');
  });
  
  // Check Telnyx API key
  console.log('\n=== Checking Telnyx Config ===');
  console.log('TELNYX_API_KEY:', process.env.TELNYX_API_KEY ? 'Set (' + process.env.TELNYX_API_KEY.slice(0, 10) + '...)' : 'NOT SET');
  
  process.exit(0);
}

check().catch(e => { 
  console.error('Error:', e.message); 
  process.exit(1); 
});