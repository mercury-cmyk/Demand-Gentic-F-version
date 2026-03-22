import { pool } from './server/db';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== ANALYZING "NEEDS REVIEW" DISPOSITIONS ===\n');

  try {
    const query = `
      SELECT 
        id,
        created_at,
        to_number_e164,
        duration_sec,
        ai_disposition,
        ai_transcript,
        ai_analysis,
        recording_url
      FROM call_sessions
      WHERE ai_disposition = 'needs_review'
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    const res = await pool.query(query);

    if (res.rows.length === 0) {
      console.log('No "needs_review" calls found.');
      return;
    }

    console.log(`Found ${res.rows.length} calls marked as "Needs Review".\n`);

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
    const outputPath = path.join(process.cwd(), 'needs_review_report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📂 Detailed JSON saved to: ${outputPath}\n`);

    // Print readable summary
    report.forEach((call, index) => {
      console.log(`\n=========================================================`);
      console.log(`[${index + 1}] NEEDS REVIEW | ${call.date}`);
      console.log(`---------------------------------------------------------`);
      console.log(`ID:        ${call.id}`);
      console.log(`Phone:     ${call.phone}`);
      console.log(`Duration:  ${call.duration}`);
      console.log(`Recording: ${call.recording || 'MISSING'}`);
      
      console.log(`\n🧠 INTELLIGENCE SUMMARY:`);
      if (call.intelligence) {
         const summary = call.intelligence.summary || call.intelligence.call_summary || 
                         (call.intelligence.reason ? `Reason: ${call.intelligence.reason}` : 'No summary provided');
         console.log(summary);
      } else {
         console.log('No intelligence analysis found.');
      }

      console.log(`\n📝 TRANSCRIPT PREVIEW:`);
      if (Array.isArray(call.transcript)) {
        // Show first 5 and last 3 lines to get context and ending
        const len = call.transcript.length;
        const preview = len > 8 
            ? [...call.transcript.slice(0, 5), {role: '...', content: '...'}, ...call.transcript.slice(-3)]
            : call.transcript;

        preview.forEach((msg: any) => {
            const role = String(msg.role || msg.type || 'unknown').toUpperCase();
            const content = msg.content || msg.message || msg.text || '';
            console.log(`  ${role}: ${content.substring(0, 100).replace(/\n/g, ' ')}`);
        });
      } else if (typeof call.transcript === 'string') {
         console.log(`  ${call.transcript.substring(0, 300)}...`);
      } else {
         console.log('  No transcript available.');
      }
      console.log(`=========================================================`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

main();