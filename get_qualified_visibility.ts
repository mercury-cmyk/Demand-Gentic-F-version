
import { pool } from './server/db';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log(`\n=== QUALIFIED LEADS FULL VISIBILITY REPORT ===\n`);

  try {
    // We look for 'qualified' or 'qualified_lead' in ai_disposition
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
      WHERE ai_disposition ILIKE '%qualified%'
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    const res = await pool.query(query);
    
    if (res.rows.length === 0) {
      console.log('No qualified leads found in call_sessions.');
      return;
    }

    console.log(`Found ${res.rows.length} qualified leads in call_sessions.\n`);

    const report = res.rows.map(row => {
      // Parse transcript
      let transcript = row.ai_transcript;
      try {
        if (typeof transcript === 'string' && (transcript.startsWith('[') || transcript.startsWith('{'))) {
           transcript = JSON.parse(transcript);
        }
      } catch (e) { }

      // Parse analysis
      let analysis = row.ai_analysis;
      if (typeof analysis === 'string') {
          try {
              analysis = JSON.parse(analysis);
          } catch(e) {}
      }

      return {
        id: row.id,
        date: new Date(row.created_at).toLocaleString(),
        phone: row.to_number_e164,
        duration: `${row.duration_sec}s`,
        disposition: row.ai_disposition,
        recording: row.recording_url,
        intelligence: analysis,
        transcript: transcript
      };
    });

    // Save JSON
    const outputPath = path.join(process.cwd(), 'qualified_visibility_report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📂 Saved detailed JSON to: ${outputPath}\n`);

    // Print summary to console
    report.forEach((call, index) => {
      console.log(`\n=========================================================`);
      console.log(`[${index + 1}] QUALIFIED LEAD | ${call.date}`);
      console.log(`---------------------------------------------------------`);
      console.log(`ID:        ${call.id}`);
      console.log(`Phone:     ${call.phone}`);
      console.log(`Duration:  ${call.duration}`);
      console.log(`Disp:      ${call.disposition}`);
      console.log(`Recording: ${call.recording || 'MISSING'}`);
      
      console.log(`\n🧠 INTELLIGENCE SUMMARY:`);
      if (call.intelligence) {
         // Show specific fields if available
         const summary = call.intelligence.summary || call.intelligence.call_summary || 'Analysis available (see JSON)';
         console.log(summary);
      } else {
         console.log('No intelligence data found.');
      }

      console.log(`\n📝 FULL TRANSCRIPT:`);
      if (Array.isArray(call.transcript)) {
        call.transcript.forEach((msg: any) => {
            const role = String(msg.role || msg.type || 'unknown').toUpperCase();
            const content = msg.content || msg.message || msg.text || '';
            console.log(`  ${role}: ${content}`);
        });
      } else if (typeof call.transcript === 'string') {
         console.log(`  ${call.transcript}`);
      } else {
         console.log('  No transcript available.');
      }
      console.log(`=========================================================`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

main();
