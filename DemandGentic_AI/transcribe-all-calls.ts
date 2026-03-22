import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  console.log('=== Call Transcription Analysis (Last 7 Days) ===');
  console.log(`Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

  // Find calls with recordings but no transcripts
  const stats = await db.execute(sql`
    SELECT 
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL) as with_recording,
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL AND transcript IS NULL) as needs_transcription,
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL AND transcript IS NOT NULL) as already_transcribed,
      COUNT(*) as total_calls
    FROM dialer_call_attempts
    WHERE created_at >= ${startDate.toISOString()}
  `);

  const row = stats.rows[0] as any;
  console.log('Stats:');
  console.log(`  Total calls: ${row.total_calls}`);
  console.log(`  With recording: ${row.with_recording}`);
  console.log(`  Already transcribed: ${row.already_transcribed}`);
  console.log(`  Needs transcription: ${row.needs_transcription}\n`);

  // Get calls that need transcription
  const callsToTranscribe = await db.execute(sql`
    SELECT id, recording_url, call_duration_seconds, disposition
    FROM dialer_call_attempts
    WHERE created_at >= ${startDate.toISOString()}
      AND recording_url IS NOT NULL
      AND transcript IS NULL
    ORDER BY created_at DESC
    LIMIT 500
  `);

  console.log(`Found ${callsToTranscribe.rows.length} calls to transcribe\n`);

  if (callsToTranscribe.rows.length === 0) {
    console.log('No calls need transcription.');
    process.exit(0);
  }

  // Trigger transcription via the background job API
  console.log('Triggering transcription job...\n');
  
  const response = await fetch('http://localhost:5000/api/admin/jobs/transcription/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 500 })
  });

  if (response.ok) {
    const result = await response.json();
    console.log('Transcription job triggered successfully:', result);
  } else {
    console.log('Failed to trigger via API, running inline transcription...');
    
    // Import transcription service
    const { transcribeRecordingWithWhisper } = await import('./server/services/whisper-transcription');
    
    let transcribed = 0;
    let failed = 0;
    
    for (const call of callsToTranscribe.rows as any[]) {
      try {
        console.log(`Transcribing call ${call.id} (${call.call_duration_seconds}s, ${call.disposition})...`);
        
        const transcript = await transcribeRecordingWithWhisper(call.recording_url);
        
        if (transcript) {
          await db.execute(sql`
            UPDATE dialer_call_attempts 
            SET transcript = ${transcript}, updated_at = NOW()
            WHERE id = ${call.id}
          `);
          transcribed++;
          console.log(`  ✅ Transcribed (${transcript.length} chars)`);
        } else {
          failed++;
          console.log(`  ❌ No transcript returned`);
        }
      } catch (error: any) {
        failed++;
        console.log(`  ❌ Error: ${error.message}`);
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`\n=== Transcription Complete ===`);
    console.log(`  Transcribed: ${transcribed}`);
    console.log(`  Failed: ${failed}`);
  }

  process.exit(0);
}

main().catch(console.error);