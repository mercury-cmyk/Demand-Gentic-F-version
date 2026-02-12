
import { pool } from './server/db';

async function analyzeQualifiedLeads() {
  console.log('=== ANALYZING QUALIFIED LEADS FOR RINGCENTRAL CAMPAIGN ===\n');
  
  const campaignId = '664aff97-ac3c-4fbb-a943-9b123ddb3fda'; // RingCentral

  // Get qualified lead sessions
  const result = await pool.query(`
    SELECT 
      cs.id,
      cs.to_number_e164 as phone,
      cs.ai_disposition,
      cs.duration_sec,
      cs.recording_url,
      cs.ai_transcript,
      cs.ai_analysis,
      cs.status,
      cs.created_at,
      c.first_name,
      c.last_name,
      c.company_norm as company_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON cs.contact_id = c.id
    WHERE cs.campaign_id = $1
      AND cs.ai_disposition = 'qualified_lead'
    ORDER BY cs.created_at DESC
  `, [campaignId]);

  console.log(`Total qualified leads found: ${result.rows.length}\n`);

  if (result.rows.length === 0) {
    console.log('No qualified leads found.');
    return;
  }

  for (const row of result.rows) {
    console.log(`Lead ID: ${row.id}`);
    console.log(`Name: ${row.first_name || 'Unknown'} ${row.last_name || ''}`);
    console.log(`Company: ${row.company_name || 'N/A'}`);
    console.log(`Phone: ${row.phone}`);
    console.log(`Date: ${new Date(row.created_at).toLocaleString()}`);
    console.log(`Duration: ${row.duration_sec}s`);

    let analysis = 'No AI analysis provided.';
    if (row.ai_analysis) {
      try {
        const parsedAnalysis = typeof row.ai_analysis === 'string' 
          ? JSON.parse(row.ai_analysis) 
          : row.ai_analysis;
        
        // Extract summary or reasoning if available
        if (parsedAnalysis.summary) {
            analysis = `Summary: ${parsedAnalysis.summary}`;
        } else if (parsedAnalysis.reasoning) {
            analysis = `Reasoning: ${parsedAnalysis.reasoning}`;
        } else if (typeof parsedAnalysis === 'string') {
             analysis = parsedAnalysis;
        } else {
             analysis = JSON.stringify(parsedAnalysis, null, 2);
        }
      } catch (e) {
        analysis = `Raw Analysis: ${row.ai_analysis}`;
      }
    }
    
    console.log(`AI Evaluation: ${analysis}`);
    
    // Output full transcript as it is a string
    if (row.ai_transcript) {
        console.log('Transcript:');
        console.log(row.ai_transcript);
    } else {
        console.log('No transcript available.');
    }

    console.log('-'.repeat(50) + '\n');
  }

  await pool.end();
}

analyzeQualifiedLeads().catch(console.error);
