import { db } from './server/db';
import { sql } from 'drizzle-orm';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function transcribeWithWhisper(recordingUrl: string): Promise<string | null> {
  try {
    console.log(`  Downloading audio...`);
    
    // Download the audio file
    const response = await fetch(recordingUrl);
    if (!response.ok) {
      console.error(`  Failed to download: ${response.status}`);
      return null;
    }
    
    const audioBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    
    console.log(`  Transcribing with OpenAI Whisper...`);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    
    // Call OpenAI Whisper API
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });
    
    if (!whisperResponse.ok) {
      const error = await whisperResponse.text();
      console.error(`  Whisper API error: ${error}`);
      return null;
    }
    
    const data = await whisperResponse.json();
    return data.text || null;
  } catch (error) {
    console.error('  Transcription error:', error);
    return null;
  }
}

async function main() {
  console.log('========================================');
  console.log('  TRANSCRIBE CALLS FOR LEADS');
  console.log('========================================\n');

  if (!OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY not configured');
    process.exit(1);
  }

  // Get the two leads that need transcription
  const callsToTranscribe = [
    { name: 'Adrian Love', callId: '0c675ff6-15f6-41aa-84f8-013525211427' },
    { name: 'Julie Parrish', callId: '1236812a-35b3-4e80-95c9-4f1934c20746' },
  ];

  for (const item of callsToTranscribe) {
    console.log(`\n📞 ${item.name}`);
    console.log('─'.repeat(40));

    // Get the call details
    const callResult = await db.execute(sql`
      SELECT 
        dca.id,
        dca.recording_url,
        dca.call_duration_seconds,
        dca.disposition,
        dca.notes,
        c.full_name,
        c.email
      FROM dialer_call_attempts dca
      JOIN contacts c ON c.id = dca.contact_id
      WHERE dca.id = ${item.callId}
    `);

    if (callResult.rows.length === 0) {
      console.log(`  ⚠️ Call not found: ${item.callId}`);
      continue;
    }

    const call = callResult.rows[0] as any;
    console.log(`  Duration: ${call.call_duration_seconds}s`);
    console.log(`  Disposition: ${call.disposition}`);

    if (!call.recording_url) {
      console.log(`  ⚠️ No recording URL available`);
      continue;
    }

    // Check if already has transcript
    if (call.notes && call.notes.includes('[Call Transcript]')) {
      console.log(`  ✓ Already has transcript`);
      continue;
    }

    console.log(`  Recording: ${call.recording_url.substring(0, 80)}...`);

    // Transcribe the call
    const transcript = await transcribeWithWhisper(call.recording_url);

    if (!transcript) {
      console.log(`  ❌ Transcription failed`);
      continue;
    }

    console.log(`  ✅ Transcription successful (${transcript.length} chars)`);
    console.log(`\n  --- TRANSCRIPT ---`);
    console.log(`  ${transcript.substring(0, 500)}${transcript.length > 500 ? '...' : ''}`);
    console.log(`  --- END ---\n`);

    // Update the call with transcript
    const updatedNotes = (call.notes || '') + '\n\n[Call Transcript]\n' + transcript;
    
    await db.execute(sql`
      UPDATE dialer_call_attempts
      SET notes = ${updatedNotes}
      WHERE id = ${item.callId}
    `);

    console.log(`  ✅ Updated call notes with transcript`);
  }

  console.log('\n\n✅ Done!');
  process.exit(0);
}

main().catch(console.error);
