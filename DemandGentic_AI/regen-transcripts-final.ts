/**
 * Regenerate transcripts for missing calls
 * Uses the transcription-gaps/regenerate API endpoint
 */

import "./server/env.ts";
import { Pool } from '@neondatabase/serverless';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';
import https from 'https';

neonConfig.webSocketConstructor = ws;

async function makeFetchRequest(url: string, options: any): Promise {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const httpModule = parsedUrl.protocol === 'https:' ? https : require('http');

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = httpModule.request(requestOptions, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode  Promise.resolve(data),
            json: () => Promise.resolve(JSON.parse(data)),
          });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, text: () => Promise.resolve(data), json: async () => ({}) });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function regenerateTranscripts() {
  const databaseUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.PUBLIC_WEBHOOK_HOST || 'https://demandgentic.ai';

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  console.log('\n🚀 Bulk transcription regeneration\n');
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Strategy: telnyx_phone_lookup\n`);

  try {
    // Query missing transcriptions
    console.log('📥 Fetching missing transcriptions...');
    
    const csRows = await pool.query(`
      SELECT id FROM call_sessions 
      WHERE started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(duration_sec, 0) > 30
        AND (ai_transcript IS NULL OR length(ai_transcript) = NOW() - INTERVAL '10 days'
        AND COALESCE(call_duration_seconds, 0) > 30
        AND (full_transcript IS NULL OR length(full_transcript)  r.id);
    console.log(`✅ Found ${allIds.length} missing transcriptions\n`);

    const batchSize = 50;
    const totalBatches = Math.ceil(allIds.length / batchSize);
    let totalSucceeded = 0;
    let totalFailed = 0;

    console.log(`📦 Processing in ${totalBatches} batches...\n`);

    for (let i = 0; i  setTimeout(r, 500));
      }
    }

    console.log(`\n${'='.repeat(55)}`);
    console.log('📊 COMPLETE - Transcription regeneration submitted');
    console.log(`${'='.repeat(55)}`);
    console.log(`Total: ${allIds.length} | Succeeded: ${totalSucceeded} | Failed: ${totalFailed}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

regenerateTranscripts();