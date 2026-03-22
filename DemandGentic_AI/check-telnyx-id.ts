import { pool } from "./server/db";

async function checkTelnyxId() {
  const telnyxId = "2439b838-f231-11f0-b4f2-02420aef95a1";
  
  console.log("========================================");
  console.log(`SEARCHING FOR TELNYX ID: ${telnyxId}`);
  console.log("========================================\n");

  // Search in leads
  const leadsResult = await pool.query(`
    SELECT 
      id,
      contact_name,
      dialed_number,
      call_duration,
      created_at,
      updated_at,
      telnyx_call_id,
      recording_url,
      LENGTH(transcript) as transcript_length
    FROM leads
    WHERE telnyx_call_id = $1
       OR recording_url LIKE $2
    ORDER BY updated_at DESC
  `, [telnyxId, `%${telnyxId}%`]);

  if (leadsResult.rows.length > 0) {
    console.log("FOUND IN LEADS:");
    leadsResult.rows.forEach(row => {
      console.log(`\nCall ID: ${row.id}`);
      console.log(`Contact: ${row.contact_name}`);
      console.log(`Phone: ${row.dialed_number}`);
      console.log(`Duration: ${row.call_duration}s`);
      console.log(`Created: ${row.created_at}`);
      console.log(`Telnyx ID: ${row.telnyx_call_id}`);
      console.log(`Transcript Length: ${row.transcript_length || 0} chars`);
      console.log(`Recording URL: ${row.recording_url || 'NULL'}`);
    });
  } else {
    console.log("Not found in leads table");
  }

  // Search in call_sessions
  console.log("\n========================================");
  console.log("CHECKING CALL_SESSIONS");
  console.log("========================================\n");

  const sessionsResult = await pool.query(`
    SELECT 
      id,
      created_at,
      status,
      recording_url,
      LENGTH(ai_transcript) as transcript_length
    FROM call_sessions
    WHERE id = $1
       OR recording_url LIKE $2
    ORDER BY created_at DESC
  `, [telnyxId, `%${telnyxId}%`]);

  if (sessionsResult.rows.length > 0) {
    console.log("FOUND IN CALL_SESSIONS:");
    sessionsResult.rows.forEach(row => {
      console.log(`\nSession ID: ${row.id}`);
      console.log(`Created: ${row.created_at}`);
      console.log(`Status: ${row.status}`);
      console.log(`Transcript Length: ${row.transcript_length || 0} chars`);
      console.log(`Recording URL: ${row.recording_url || 'NULL'}`);
    });
  } else {
    console.log("Not found in call_sessions table");
  }

  // Check if this might be in the recording URL
  console.log("\n========================================");
  console.log("SEARCHING IN RECORDING URLS");
  console.log("========================================\n");

  const urlSearchResult = await pool.query(`
    SELECT 
      id,
      contact_name,
      dialed_number,
      call_duration,
      created_at,
      recording_url,
      LENGTH(transcript) as transcript_length
    FROM leads
    WHERE recording_url LIKE '%2439b838-f231-11f0%'
    ORDER BY updated_at DESC
    LIMIT 5
  `);

  if (urlSearchResult.rows.length > 0) {
    console.log("FOUND IN RECORDING URLS:");
    urlSearchResult.rows.forEach(row => {
      console.log(`\nCall ID: ${row.id}`);
      console.log(`Contact: ${row.contact_name}`);
      console.log(`Phone: ${row.dialed_number}`);
      console.log(`Duration: ${row.call_duration}s`);
      console.log(`Created: ${row.created_at}`);
      console.log(`Transcript Length: ${row.transcript_length || 0} chars`);
      console.log(`Recording URL:`);
      console.log(`  ${row.recording_url}`);
    });
  } else {
    console.log("Not found in any recording URLs");
  }

  process.exit(0);
}

checkTelnyxId().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});