/**
 * Transcribe leads with qaStatus='new' that have recordings but no transcript.
 * 
 * Strategy:
 * 1. Find all leads with qa_status='new', no transcript, and a recording source
 * 2. For each lead, resolve the best recording URL (recording_url, recording_s3_key,
 *    or linked call_session recording)
 * 3. Transcribe using Google Speech-to-Text
 * 4. Store the transcript back on the lead
 */

import { pool } from '../server/db';
import { submitTranscription, transcribeFromRecording } from '../server/services/google-transcription';

async function transcribeNewLeads() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('TRANSCRIBE: Leads in "New" QA Status Missing Transcripts');
    console.log('='.repeat(80));
    console.log(`Run at: ${new Date().toISOString()}\n`);

    // 1. Find leads in 'new' status that have no transcript but do have a recording source
    const { rows: leadsToTranscribe } = await client.query(`
      SELECT 
        l.id AS lead_id,
        l.contact_name,
        l.account_name,
        l.campaign_id,
        l.recording_url,
        l.recording_s3_key,
        l.telnyx_call_id,
        l.telnyx_recording_id,
        l.call_attempt_id,
        l.call_duration,
        l.contact_id,
        c2.name AS campaign_name,
        -- Also check call_sessions for recordings
        cs.recording_url AS session_recording_url,
        cs.recording_s3_key AS session_recording_s3_key,
        cs.ai_transcript AS session_transcript,
        cs.id AS call_session_id,
        -- Alt session (matched by contact+campaign)
        alt_cs.alt_id AS alt_session_id,
        alt_cs.alt_rec_url AS alt_session_rec_url,
        alt_cs.alt_s3_key AS alt_session_s3_key,
        alt_cs.alt_transcript AS alt_session_transcript
      FROM leads l
      LEFT JOIN campaigns c2 ON l.campaign_id = c2.id
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN LATERAL (
        SELECT cs2.id AS alt_id, cs2.recording_url AS alt_rec_url, 
               cs2.recording_s3_key AS alt_s3_key, cs2.ai_transcript AS alt_transcript
        FROM call_sessions cs2
        WHERE cs2.contact_id = l.contact_id AND cs2.campaign_id = l.campaign_id
          AND (cs2.recording_s3_key IS NOT NULL OR cs2.recording_url IS NOT NULL 
               OR (cs2.ai_transcript IS NOT NULL AND length(cs2.ai_transcript) > 20))
        ORDER BY cs2.created_at DESC
        LIMIT 1
      ) alt_cs ON true
      WHERE l.qa_status = 'new'
        AND l.deleted_at IS NULL
        AND (l.transcript IS NULL OR length(l.transcript) < 20)
      ORDER BY l.created_at DESC
    `);

    console.log(`Found ${leadsToTranscribe.length} leads needing transcription\n`);

    if (leadsToTranscribe.length === 0) {
      console.log('All leads in "new" status already have transcripts.');
      return;
    }

    let transcribed = 0;
    let copiedFromSession = 0;
    let failed = 0;
    let noRecording = 0;

    for (let i = 0; i < leadsToTranscribe.length; i++) {
      const lead = leadsToTranscribe[i];
      console.log(`\n[${i + 1}/${leadsToTranscribe.length}] ${lead.contact_name || 'Unknown'} | ${lead.campaign_name || 'N/A'} | ${lead.call_duration || '?'}s`);

      // Step 1: Check if call_session already has a transcript we can copy
      if (lead.session_transcript && lead.session_transcript.trim().length > 20) {
        console.log(`  -> Copying transcript from call_session (${lead.session_transcript.length} chars)`);
        await client.query(`
          UPDATE leads 
          SET transcript = $1, 
              transcription_status = 'completed',
              updated_at = NOW()
          WHERE id = $2
        `, [lead.session_transcript.trim(), lead.lead_id]);
        copiedFromSession++;
        transcribed++;
        console.log(`  -> DONE (copied from session)`);
        continue;
      }

      // Step 1b: Check alt session (matched by contact+campaign)
      if (lead.alt_session_transcript && lead.alt_session_transcript.trim().length > 20) {
        console.log(`  -> Copying transcript from alt call_session ${lead.alt_session_id} (${lead.alt_session_transcript.length} chars)`);
        await client.query(`
          UPDATE leads 
          SET transcript = $1, 
              transcription_status = 'completed',
              updated_at = NOW()
          WHERE id = $2
        `, [lead.alt_session_transcript.trim(), lead.lead_id]);
        copiedFromSession++;
        transcribed++;
        console.log(`  -> DONE (copied from alt session)`);
        continue;
      }

      // Step 2: Resolve the best recording URL 
      let recordingUrl: string | null = null;
      let sourceLabel = '';

      // Priority 1: Try GCS via recording_s3_key (most reliable - permanent storage)
      // Use gs:// URI so Google Speech-to-Text reads directly from GCS (bypasses inline audio size limits)
      let useGcsUri = false;
      if (lead.recording_s3_key || lead.session_recording_s3_key || lead.alt_session_s3_key) {
        const s3Key = lead.recording_s3_key || lead.session_recording_s3_key || lead.alt_session_s3_key;
        const gcsBucket = process.env.GCS_BUCKET || 'demandgentic-storage';
        recordingUrl = `gs://${gcsBucket}/${s3Key}`;
        sourceLabel = `GCS URI (${s3Key})`;
        useGcsUri = true;
        console.log(`  -> Using GCS URI: gs://${gcsBucket}/${s3Key}`);
      }

      // Priority 2: Lead's own recording_url (may be expired pre-signed URL)
      if (!recordingUrl && lead.recording_url) {
        recordingUrl = lead.recording_url;
        sourceLabel = 'lead recording_url';
      }
      // Priority 3: Call session recording_url or alt session recording_url
      if (!recordingUrl && lead.session_recording_url) {
        recordingUrl = lead.session_recording_url;
        sourceLabel = 'call_session recording_url';
      }
      if (!recordingUrl && lead.alt_session_rec_url) {
        recordingUrl = lead.alt_session_rec_url;
        sourceLabel = 'alt call_session recording_url';
      }

      // Priority 4: Try Telnyx recording ID to fetch fresh URL
      if (!recordingUrl && lead.telnyx_recording_id) {
        try {
          const telnyxApiKey = process.env.TELNYX_API_KEY || process.env.TELNYX_V2_API_KEY;
          if (telnyxApiKey) {
            const resp = await fetch(`https://api.telnyx.com/v2/recordings/${lead.telnyx_recording_id}`, {
              headers: { 'Authorization': `Bearer ${telnyxApiKey}` }
            });
            if (resp.ok) {
              const data = await resp.json();
              const dlUrl = data?.data?.download_urls?.mp3 || data?.data?.download_urls?.wav;
              if (dlUrl) {
                recordingUrl = dlUrl;
                sourceLabel = 'Telnyx recording API';
              }
            }
          }
        } catch (err: any) {
          console.log(`  -> Telnyx recording fetch failed: ${err.message}`);
        }
      }

      // Priority 5: Try Telnyx call ID to search for recordings
      if (!recordingUrl && lead.telnyx_call_id) {
        try {
          const telnyxApiKey = process.env.TELNYX_API_KEY || process.env.TELNYX_V2_API_KEY;
          if (telnyxApiKey) {
            console.log(`  -> Searching Telnyx for recordings of call ${lead.telnyx_call_id}...`);
            const resp = await fetch(`https://api.telnyx.com/v2/recordings?filter[call_leg_id]=${lead.telnyx_call_id}`, {
              headers: { 'Authorization': `Bearer ${telnyxApiKey}` }
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data?.data?.length > 0) {
                const rec = data.data[0];
                const dlUrl = rec.download_urls?.mp3 || rec.download_urls?.wav;
                if (dlUrl) {
                  recordingUrl = dlUrl;
                  sourceLabel = 'Telnyx call recording search';
                }
              }
            }
          }
        } catch (err: any) {
          console.log(`  -> Telnyx call recording search failed: ${err.message}`);
        }
      }

      // Priority 5: Try linked dialer_call_attempt recording
      if (!recordingUrl && lead.call_attempt_id) {
        const { rows: [attempt] } = await client.query(`
          SELECT recording_url, full_transcript 
          FROM dialer_call_attempts 
          WHERE id = $1
        `, [lead.call_attempt_id]);

        if (attempt?.full_transcript && attempt.full_transcript.trim().length > 20) {
          console.log(`  -> Copying transcript from dialer_call_attempts (${attempt.full_transcript.length} chars)`);
          await client.query(`
            UPDATE leads 
            SET transcript = $1, 
                transcription_status = 'completed',
                updated_at = NOW()
            WHERE id = $2
          `, [attempt.full_transcript.trim(), lead.lead_id]);
          copiedFromSession++;
          transcribed++;
          console.log(`  -> DONE (copied from dialer attempt)`);
          continue;
        }

        if (attempt?.recording_url) {
          recordingUrl = attempt.recording_url;
          sourceLabel = 'dialer_call_attempts recording_url';
        }
      }

      if (!recordingUrl) {
        console.log(`  -> NO recording source found. Skipping.`);
        noRecording++;
        continue;
      }

      // Step 3: Transcribe!
      console.log(`  -> Transcribing from ${sourceLabel}...`);
      try {
        let transcript: string | null = null;

        if (useGcsUri) {
          // Use transcribeFromRecording which supports gs:// URIs natively (no inline limit)
          const result = await transcribeFromRecording(recordingUrl!, { throwOnError: true });
          transcript = result?.transcript || null;
        } else {
          transcript = await submitTranscription(recordingUrl!);
        }

        if (transcript && transcript.trim().length > 10) {
          // Save transcript to lead
          await client.query(`
            UPDATE leads 
            SET transcript = $1, 
                transcription_status = 'completed',
                updated_at = NOW()
            WHERE id = $2
          `, [transcript.trim(), lead.lead_id]);

          // Also update linked call_session if exists
          if (lead.call_session_id) {
            await client.query(`
              UPDATE call_sessions 
              SET ai_transcript = $1 
              WHERE id = $2 AND (ai_transcript IS NULL OR length(ai_transcript) < 20)
            `, [transcript.trim(), lead.call_session_id]);
          }

          transcribed++;
          console.log(`  -> DONE (${transcript.trim().length} chars)`);
        } else {
          console.log(`  -> Transcription returned empty/short result`);
          await client.query(`
            UPDATE leads 
            SET transcription_status = 'failed',
                updated_at = NOW()
            WHERE id = $1
          `, [lead.lead_id]);
          failed++;
        }
      } catch (err: any) {
        console.error(`  -> Transcription error: ${err.message}`);
        await client.query(`
          UPDATE leads 
          SET transcription_status = 'failed',
              updated_at = NOW()
          WHERE id = $1
        `, [lead.lead_id]);
        failed++;
      }

      // Rate limit between API calls
      await new Promise(r => setTimeout(r, 1000));
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('TRANSCRIPTION COMPLETE');
    console.log('='.repeat(80));
    console.log(`  Total leads processed:  ${leadsToTranscribe.length}`);
    console.log(`  Transcribed:            ${transcribed}`);
    console.log(`    - Copied from session:  ${copiedFromSession}`);
    console.log(`    - Freshly transcribed:  ${transcribed - copiedFromSession}`);
    console.log(`  Failed:                 ${failed}`);
    console.log(`  No recording source:    ${noRecording}`);
    console.log('='.repeat(80));

  } finally {
    client.release();
    await pool.end();
  }
}

transcribeNewLeads().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
