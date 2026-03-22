import { db } from './server/db';
import { sql } from 'drizzle-orm';

// Check all JSONB fields in leads table for transcripts
const result = await db.execute(sql`
  SELECT
    id,
    contact_name,
    account_name,
    qa_status,
    call_attempt_id,
    -- Check if transcript is in the original transcript field
    CASE
      WHEN transcript IS NOT NULL THEN 'transcript'
      ELSE NULL
    END as has_transcript_field,
    -- Check if it's in qa_data
    CASE
      WHEN qa_data->'transcript' IS NOT NULL THEN 'qa_data.transcript'
      ELSE NULL
    END as has_qa_data_transcript,
    -- Check if it's in ai_analysis
    CASE
      WHEN ai_analysis->'transcript' IS NOT NULL THEN 'ai_analysis.transcript'
      ELSE NULL
    END as has_ai_analysis_transcript,
    -- Check call_attempts table for notes with transcripts
    (SELECT notes FROM dialer_call_attempts WHERE id = leads.call_attempt_id LIMIT 1) as call_notes
  FROM leads
  WHERE created_at::date = '2026-01-15'
  LIMIT 5
`);

console.log('Checking where transcripts are stored...\n');

for (const lead of result.rows as any[]) {
  console.log(`\n=== ${lead.contact_name} @ ${lead.account_name} ===`);
  console.log(`Lead ID: ${lead.id}`);
  console.log(`Call Attempt ID: ${lead.call_attempt_id || 'N/A'}`);
  console.log(`Has transcript field: ${lead.has_transcript_field || 'NO'}`);
  console.log(`Has qa_data.transcript: ${lead.has_qa_data_transcript || 'NO'}`);
  console.log(`Has ai_analysis.transcript: ${lead.has_ai_analysis_transcript || 'NO'}`);

  if (lead.call_notes) {
    const hasTranscript = lead.call_notes.includes('[Call Transcript]');
    console.log(`Call notes has transcript marker: ${hasTranscript ? 'YES' : 'NO'}`);

    if (hasTranscript) {
      const markerIndex = lead.call_notes.indexOf('[Call Transcript]');
      const transcript = lead.call_notes.substring(markerIndex + '[Call Transcript]'.length).trim();
      console.log(`\nTranscript Preview (first 300 chars):`);
      console.log('─────────────────────────────────────────');
      console.log(transcript.substring(0, 300) + '...');
      console.log('─────────────────────────────────────────');
    }
  } else {
    console.log(`Call notes: N/A (no call_attempt_id link)`);
  }
}

console.log('\n\n========================================');
console.log('SOLUTION');
console.log('========================================\n');

console.log('The transcripts are stored in the dialer_call_attempts table (notes field).');
console.log('To view transcripts for leads, we need to JOIN with dialer_call_attempts.\n');

console.log('Creating a script to view transcripts properly...');

process.exit(0);