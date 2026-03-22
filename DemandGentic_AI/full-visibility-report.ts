import { pool } from './server/db';
import fs from 'fs';
import path from 'path';

async function main() {
  const limit = 50; // Get last 50 calls
  console.log(`\n=== FULL VISIBILITY REPORT (Last ${limit} Calls) ===\n`);

  try {
    const query = `
      SELECT 
        id,
        created_at,
        to_number_e164,
        duration_sec,
        ai_disposition,
        ai_analysis,
        ai_transcript,
        recording_url
      FROM call_sessions
      ORDER BY created_at DESC
      LIMIT $1
    `;
    
    const res = await pool.query(query, [limit]);
    
    if (res.rows.length === 0) {
      console.log('No calls found.');
      return;
    }

    const report = res.rows.map(row => {
      // Parse transcript if it's a stringified JSON
      let transcript = row.ai_transcript;
      try {
        if (typeof transcript === 'string' && (transcript.startsWith('[') || transcript.startsWith('{'))) {
           transcript = JSON.parse(transcript);
        }
      } catch (e) {
        // Keep as string if parsing fails
      }

      // Parse analysis if it's a stringified JSON (often JSONB comes as object, but if text/string...)
      let analysis = row.ai_analysis;
      if (typeof analysis === 'string') {
          try {
              analysis = JSON.parse(analysis);
          } catch(e) {}
      }

      return {
        id: row.id,
        date: row.created_at,
        phone: row.to_number_e164,
        duration: `${row.duration_sec}s`,
        disposition: row.ai_disposition || 'N/A',
        intelligence: analysis || 'N/A',
        recording: row.recording_url || 'N/A',
        transcript: transcript || 'N/A'
      };
    });

    const outputPath = path.join(process.cwd(), 'full_visibility_report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

    console.log(`✅ Report generated for ${res.rows.length} calls.`);
    console.log(`📂 Output saved to: ${outputPath}`);
    console.log('\n--- SUMMARY PREVIEW (First 5 Calls) ---');

    report.slice(0, 5).forEach((call, index) => {
      console.log(`\n[${index + 1}] ID: ${call.id} | ${call.date}`);
      console.log(`    Disposition: ${call.disposition}`);
      console.log(`    Duration: ${call.duration}`);
      console.log(`    Recording: ${call.recording !== 'N/A' ? 'AVAILABLE' : 'MISSING'}`);
      console.log(`    Intelligence: ${call.intelligence !== 'N/A' ? 'AVAILABLE' : 'MISSING'}`);
      console.log(`    Transcript Length: ${JSON.stringify(call.transcript).length} chars`);
    });

  } catch (err) {
    console.error('Error generating report:', err);
  } finally {
    process.exit();
  }
}

main();