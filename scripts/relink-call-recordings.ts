
import { db } from '../server/db';
import { callSessions } from '../shared/schema';
import { eq, like, or, isNull, and, gte, lte } from 'drizzle-orm';
import dotenv from 'dotenv';
import { fetch } from 'undici';

dotenv.config();

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

if (!TELNYX_API_KEY) {
  console.error('TELNYX_API_KEY is missing');
  process.exit(1);
}

// 60 minutes window to search for recordings
const SEARCH_WINDOW_MS = 60 * 60 * 1000;

async function run() {
  console.log('Searching for call sessions with batch/invalid IDs...');

  // Find problematic sessions
  const sessions = await db
    .select()
    .from(callSessions)
    .where(
        or(
            like(callSessions.telnyxCallId, 'batch-%'),
            isNull(callSessions.telnyxCallId)
        )
    )
    .orderBy(callSessions.startedAt); // Process in order

  console.log(`Found ${sessions.length} sessions with invalid Telnyx Call IDs.`);
  
  if (sessions.length === 0) {
      console.log('No sessions to fix.');
      process.exit(0);
  }

  // Determine time range to fetch from Telnyx
  // We'll just take the min start time and max start time of the sessions + buffer
  const minDate = new Date(sessions[0].startedAt!.getTime() - SEARCH_WINDOW_MS);
  const maxDate = new Date(sessions[sessions.length - 1].startedAt!.getTime() + SEARCH_WINDOW_MS);
  
  console.log(`Fetching Telnyx recordings between ${minDate.toISOString()} and ${maxDate.toISOString()}...`);

  let allRecordings: any[] = [];
  let pageNumber = 1;
  let hasMore = true;

  try {
      while (hasMore) {
          console.log(`Store fetching page ${pageNumber}...`);
          const response = await fetch(
            `${TELNYX_API_BASE}/recordings?filter[created_at][gte]=${minDate.toISOString()}&filter[created_at][lte]=${maxDate.toISOString()}&page[number]=${pageNumber}&page[size]=100`,
            {
              headers: {
                Authorization: `Bearer ${TELNYX_API_KEY}`,
                'Content-Type': 'application/json',
              },
            }
          );
      
          if (!response.ok) {
              const text = await response.text();
              console.error(`Telnyx API error: ${response.status} ${text}`);
              break;
          }
      
          const data: any = await response.json();
          const pageRecordings = data.data || [];
          allRecordings = [...allRecordings, ...pageRecordings];
          
          if (pageRecordings.length < 100) {
              hasMore = false;
          } else {
              pageNumber++;
          }
      }
      
      console.log(`Fetched ${allRecordings.length} recordings from Telnyx.`);

      // Now try to match sessions
      for (const session of sessions) {
          if (!session.startedAt) continue;
          
          const sessionStart = session.startedAt.getTime();
          
          // Find recordings created within +/- 2 minutes of session start
          // Note: Telnyx 'created_at' is when the recording finished? or started? usually finished.
          // 'recording_started_at' is better.
          
          const candidates = allRecordings.filter(rec => {
              const recStart = new Date(rec.recording_started_at).getTime();
              return Math.abs(recStart - sessionStart) < 3 * 60 * 1000; // 3 min tolerance
          });
          
          console.log(`\nSession ${session.id} (${session.startedAt.toISOString()}) - ${candidates.length} candidates`);
          
          if (candidates.length === 1) {
              const match = candidates[0];
              console.log(`✅ MATCH FOUND!`);
              console.log(`   Session: ${session.telnyxCallId} -> Match: ${match.call_leg_id}`);
              console.log(`   Recording ID: ${match.id}`);
              
              // Update DB
              await db.update(callSessions)
                .set({
                    telnyxCallId: match.call_leg_id, // This is the real call ID
                    telnyxRecordingId: match.id,
                    recordingUrl: match.download_urls?.mp3 || match.download_urls?.wav,
                    recordingStatus: 'stored'
                })
                .where(eq(callSessions.id, session.id));
                
              console.log(`   Updated session.`);
          } else if (candidates.length > 1) {
              console.log(`   ⚠️ Multiple candidates. Need distinct matching logic.`);
              // Could match by duration...
              const sessionDur = session.durationSec || 0;
              const durationMatches = candidates.filter(c => {
                   const recDurSec = (c.duration_millis || 0) / 1000;
                   return Math.abs(recDurSec - sessionDur) < 5; // 5 sec diff
              });
              
              if (durationMatches.length === 1) {
                  const match = durationMatches[0];
                  console.log(`✅ MATCH FOUND BY DURATION! (${sessionDur}s vs ${(match.duration_millis||0)/1000}s)`);
                  
                  await db.update(callSessions)
                    .set({
                        telnyxCallId: match.call_leg_id,
                        telnyxRecordingId: match.id,
                        recordingUrl: match.download_urls?.mp3 || match.download_urls?.wav,
                        recordingStatus: 'stored'
                    })
                    .where(eq(callSessions.id, session.id));
                  console.log(`   Updated session.`);
              } else {
                  console.log(`   Could not disambiguate.`);
              }
          } else {
              console.log(`   ❌ No matching recording found in time window.`);
          }
      }

  } catch (error) {
    console.error('Error:', error);
  }
}

run();

