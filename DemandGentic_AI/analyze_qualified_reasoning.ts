import { pool } from './server/db';

async function main() {
  console.log('=== QUALIFIED LEADS ANALYSIS REASONING ===\n');

  try {
    const query = `
      SELECT 
        id,
        to_number_e164,
        ai_disposition,
        ai_analysis
      FROM call_sessions
      WHERE ai_disposition ILIKE '%qualified%'
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const res = await pool.query(query);
    
    for (const row of res.rows) {
      console.log(`\nID: ${row.id} | Phone: ${row.to_number_e164}`);
      
      let analysis = row.ai_analysis;
      if (typeof analysis === 'string') {
        try {
          analysis = JSON.parse(analysis);
        } catch (e) {
          console.log('  [Analysis is raw string]');
        }
      }

      if (analysis) {
        console.log('  Analysis Summary:', analysis.summary || analysis.call_summary || 'N/A');
        console.log('  Customer Sentiment:', analysis.sentiment || 'N/A');
        console.log('  Success Criteria:', analysis.success_criteria || 'N/A');
        // Check for specific qualification flags often used in JSON
        if (analysis.qualification) console.log('  Qualification Details:', analysis.qualification);
      } else {
        console.log('  [No Analysis JSON found]');
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

main();