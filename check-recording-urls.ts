import 'dotenv/config';
import { db } from './server/db';
import { callSessions } from './shared/schema';
import { desc, isNotNull, or } from 'drizzle-orm';

async function checkUrls() {
  console.log('=== Checking Recording URLs ===\n');
  
  const sessions = await db
    .select({
      id: callSessions.id,
      recordingUrl: callSessions.recordingUrl,
      recordingS3Key: callSessions.recordingS3Key,
      recordingStatus: callSessions.recordingStatus,
    })
    .from(callSessions)
    .where(or(isNotNull(callSessions.recordingUrl), isNotNull(callSessions.recordingS3Key)))
    .orderBy(desc(callSessions.startedAt))
    .limit(5);
    
  console.log('Sample recordings from call_sessions:');
  sessions.forEach((s, i) => {
    console.log('\n' + (i+1) + '. ID:', s.id);
    console.log('   recordingUrl:', s.recordingUrl || 'null');
    console.log('   recordingS3Key:', s.recordingS3Key || 'null');
    console.log('   Status:', s.recordingStatus);
    
    // Check if URL looks valid
    if (s.recordingUrl) {
      console.log('   URL type:', 
        s.recordingUrl.startsWith('https://') ? 'HTTPS URL' :
        s.recordingUrl.startsWith('http://') ? 'HTTP URL' :
        s.recordingUrl.startsWith('gs://') ? 'GCS path' :
        'Unknown format'
      );
    }
  });

  process.exit(0);
}

checkUrls().catch(e => { 
  console.error('Error:', e.message); 
  process.exit(1); 
});
