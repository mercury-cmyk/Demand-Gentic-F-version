/**
 * Directly regenerate transcripts for missing calls using Telnyx phone lookup
 * This script processes calls directly without using HTTP API
 */

import "./server/env.ts";
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function regenerateMissingTranscripts() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found in environment");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log(`\n🚀 Direct transcription regeneration via Telnyx phone lookup\n`);

  try {
    // Get all missing transcription call IDs
    console.log(`📥 Fetching all missing transcriptions...`);

    const callSessionsResult = await db.execute(sql`
      SELECT 
        id,
        to_number_e164 as phone,
        from_number,
        started_at,
        telnyx_call_id,
        'call_sessions' as source
      FROM call_sessions
      WHERE started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(duration_sec, 0) > 30
        AND (ai_transcript IS NULL OR length(ai_transcript) = NOW() - INTERVAL '10 days'
        AND COALESCE(call_duration_seconds, 0) > 30
        AND (full_transcript IS NULL OR length(full_transcript)  r.status === 'completed');
            
            if (completed) {
              const audioUrl = completed.download_urls?.mp3 || completed.download_urls?.wav;
              if (audioUrl) {
                // Trigger transcription
                const result = await transcribeFromRecording(audioUrl, { telnyxCallId: call.telnyx_call_id });
                if (result?.transcript && result.transcript.length >= 20) {
                  await db.execute(sql`
                    UPDATE call_sessions 
                    SET ai_transcript = ${result.transcript}
                    WHERE id = ${call.id}
                  `);
                  
                  succeeded++;
                } else {
                  failed++;
                  errors.push(`${call.id}: Transcription returned empty`);
                }
              } else {
                failed++;
                errors.push(`${call.id}: No download URL found`);
              }
            } else {
              failed++;
              errors.push(`${call.id}: No completed recording found`);
            }
          } catch (err: any) {
            failed++;
            errors.push(`${call.id}: ${err.message}`);
          }
        } else {
          // dialer_call_attempts - use fallback attempt function
          const result = await attemptFallbackTranscription(call.id, null, call.telnyx_call_id);
          if (result.success) {
            succeeded++;
          } else {
            failed++;
            errors.push(`${call.id}: ${result.error || 'Unknown error'}`);
          }
        }
      } catch (error: any) {
        failed++;
        errors.push(`${call.id}: ${error.message}`);
      }
    }

    // Summary report
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 REGENERATION COMPLETE`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Calls Processed: ${allCalls.length}`);
    console.log(`Succeeded:             ${succeeded}`);
    console.log(`Failed:                ${failed}`);
    console.log(`Success Rate:          ${((succeeded / processed) * 100).toFixed(2)}%`);

    if (errors.length > 0) {
      console.log(`\n⚠️  Sample errors:`);
      errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }

    console.log(`\n✨ Transcription regeneration complete!\n`);

  } catch (error) {
    console.error("\n❌ Error during regeneration:", error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

regenerateMissingTranscripts();