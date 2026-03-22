/**
 * Quick script to check recording status for recent recordings
 */
import { db } from '../server/db';
import { callSessions } from '../shared/schema';
import { like, desc, or, isNotNull } from 'drizzle-orm';

async function check() {
  // Check recent recordings (any that have recordingUrl OR recordingS3Key)
  console.log('\n=== RECENT RECORDINGS IN call_sessions ===\n');
  
  const recentRecordings = await db.select({
    id: callSessions.id,
    toNumber: callSessions.toNumberE164,
    startedAt: callSessions.startedAt,
    recordingUrl: callSessions.recordingUrl,
    recordingS3Key: callSessions.recordingS3Key,
    recordingStatus: callSessions.recordingStatus,
  })
  .from(callSessions)
  .where(or(isNotNull(callSessions.recordingUrl), isNotNull(callSessions.recordingS3Key)))
  .orderBy(desc(callSessions.startedAt))
  .limit(5);
  
  if (recentRecordings.length === 0) {
    console.log('No recordings with URLs or S3 keys found!');
  }
  
  for (const s of recentRecordings) {
    console.log('-------------------------------------------');
    console.log('ID:', s.id);
    console.log('To:', s.toNumber);
    console.log('Started:', s.startedAt);
    console.log('Recording URL:', s.recordingUrl ? 'HAS URL (' + s.recordingUrl.substring(0, 50) + '...)' : 'MISSING');
    console.log('Recording S3 Key:', s.recordingS3Key || 'MISSING');
    console.log('Recording Status:', s.recordingStatus || 'null');
  }
  
  // Also check the most recent sessions regardless of recording status
  console.log('\n\n=== MOST RECENT 5 call_sessions (any status) ===\n');
  
  const recentSessions = await db.select({
    id: callSessions.id,
    toNumber: callSessions.toNumberE164,
    startedAt: callSessions.startedAt,
    recordingUrl: callSessions.recordingUrl,
    recordingS3Key: callSessions.recordingS3Key,
    recordingStatus: callSessions.recordingStatus,
    aiTranscript: callSessions.aiTranscript,
  })
  .from(callSessions)
  .orderBy(desc(callSessions.startedAt))
  .limit(5);
  
  for (const s of recentSessions) {
    console.log('-------------------------------------------');
    console.log('ID:', s.id);
    console.log('To:', s.toNumber);
    console.log('Started:', s.startedAt);
    console.log('Recording URL:', s.recordingUrl ? 'HAS URL' : 'MISSING');
    console.log('Recording S3 Key:', s.recordingS3Key || 'MISSING');
    console.log('Recording Status:', s.recordingStatus || 'null');
    console.log('Has Transcript:', s.aiTranscript ? s.aiTranscript.substring(0, 80) + '...' : 'NONE');
  }
  
  process.exit(0);
}

check().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});