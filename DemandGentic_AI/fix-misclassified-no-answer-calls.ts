/**
 * Fix misclassified calls: "no_answer" that are actually invalid numbers / IVR systems
 * 
 * Pattern: Call has transcript showing automated system / wrong number / unassigned number
 * but was classified as "no_answer" instead of "invalid_data"
 */

import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

// Patterns indicating invalid number / automated system (not voicemail)
const INVALID_NUMBER_PATTERNS = [
  /unassigned number/i,
  /disconnected number/i,
  /number (is|has been) (disconnected|not in service)/i,
  /this number is no longer/i,
  /you have reached a number that/i,
  /the number you (have )?dial(ed|led) is not/i,
  /not a working number/i,
  /cannot be completed as dialed/i,
  /call cannot be completed/i,
  /this is a recording/i,
  /this call is being recorded/i,
  /for directory assistance/i,
  /press \d+ for/i, // IVR menu systems
  /dial \d+ (for|to)/i,
  /automated system/i,
  /automated message/i,
  /automatic voice system/i,
];

async function fixMisclassifiedNoAnswerCalls() {
  console.log("\n=== Fixing Misclassified No Answer Calls ===\n");

  // Find no_answer calls with transcripts that indicate invalid numbers
  const result = await db.execute(sql`
    SELECT 
      id,
      contact_id,
      status,
      ai_disposition,
      ai_transcript,
      created_at
    FROM call_sessions
    WHERE ai_disposition = 'no_answer'
      AND ai_transcript IS NOT NULL
      AND ai_transcript != ''
    ORDER BY created_at DESC
    LIMIT 100
  `);

  console.log(`Found ${result.rows.length} no_answer calls with transcripts\n`);

  let invalidNumberCount = 0;
  let ivrSystemCount = 0;
  const callsToUpdate: Array = [];

  for (const row of result.rows) {
    const transcript = (row.ai_transcript as string || "").toLowerCase();
    
    for (const pattern of INVALID_NUMBER_PATTERNS) {
      if (pattern.test(transcript)) {
        const match = transcript.match(pattern)?.[0];
        
        // Determine if this is invalid number or IVR
        const isIVR = /press \d+|dial \d+/i.test(transcript);
        
        if (isIVR) {
          ivrSystemCount++;
        } else {
          invalidNumberCount++;
        }

        callsToUpdate.push({
          id: row.id as string,
          reason: isIVR ? "IVR System" : "Invalid Number",
          snippet: match || transcript.substring(0, 100),
        });
        
        console.log(`\n❌ Misclassified Call: ${row.id}`);
        console.log(`   Current: no_answer`);
        console.log(`   Should be: invalid_data`);
        console.log(`   Reason: ${isIVR ? "IVR System" : "Invalid Number"}`);
        console.log(`   Match: "${match}"`);
        console.log(`   Transcript snippet: ${transcript.substring(0, 200)}...`);
        
        break; // Only need one pattern match
      }
    }
  }

  console.log(`\n\n=== Summary ===`);
  console.log(`Total misclassified: ${callsToUpdate.length}`);
  console.log(`  - Invalid numbers: ${invalidNumberCount}`);
  console.log(`  - IVR systems: ${ivrSystemCount}`);

  if (callsToUpdate.length > 0) {
    console.log(`\n\nUpdate these ${callsToUpdate.length} calls to invalid_data? (Run update query manually)`);
    console.log(`\nUPDATE call_sessions SET ai_disposition = 'invalid_data' WHERE id IN (`);
    console.log(callsToUpdate.map(c => `  '${c.id}'`).join(',\n'));
    console.log(`);`);
  }

  console.log("\n✅ Analysis Complete\n");
}

fixMisclassifiedNoAnswerCalls().catch(console.error);