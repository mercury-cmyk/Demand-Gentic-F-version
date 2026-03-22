import { db } from '../server/db';
import { callSessions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getPlayableRecordingLink } from '../server/services/recording-link-resolver';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function diagnose(callSessionId: string) {
  console.log(`Diagnosing Call Session: ${callSessionId}`);

  // 1. Check DB
  const [session] = await db
    .select()
    .from(callSessions)
    .where(eq(callSessions.id, callSessionId));

  if (!session) {
    console.error('❌ Call session NOT FOUND in database.');
    process.exit(1);
  }

  console.log('✅ Call session found:', {
    id: session.id,
    telnyxCallId: session.telnyxCallId,
    telnyxRecordingId: session.telnyxRecordingId,
    recordingUrl: session.recordingUrl,
    recordingS3Key: session.recordingS3Key,
    recordingStatus: session.recordingStatus,
  });

  // 2. Check Telnyx API Key
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    console.error('❌ TELNYX_API_KEY is missing in environment variables.');
  } else {
    console.log('✅ TELNYX_API_KEY is set.');
  }

  // 3. Attempt Resolution
  console.log('\nAttempting to resolve recording link...');
  try {
    const result = await getPlayableRecordingLink(callSessionId);
    if (result) {
      console.log('✅ Recording resolved:', result);
    } else {
      console.error('❌ Failed to resolve recording link (returned null).');
    }
  } catch (error: any) {
    console.error('❌ Error during resolution:', error.message);
    console.error(error);
  }
  
  process.exit(0);
}

const idArg = process.argv[2];
if (!idArg) {
  console.error('Please provide a call session ID.');
  process.exit(1);
}

diagnose(idArg);