
import { pool } from './server/db';

async function analyzeUKEFLeads() {
  console.log('=== ANALYZING QUALIFIED LEADS FOR UK EXPORT FINANCE CAMPAIGNS ===\n');

  // First, find all UKEF campaigns
  const campaigns = await pool.query(`
    SELECT id, name, type, created_at
    FROM campaigns
    WHERE name ILIKE '%UK Export%' OR name ILIKE '%UKEF%' OR name ILIKE '%export finance%'
    ORDER BY created_at DESC
  `);

  if (campaigns.rows.length === 0) {
    console.log('No UK Export Finance campaigns found.');
    await pool.end();
    return;
  }

  console.log(`Found ${campaigns.rows.length} UKEF campaign(s):\n`);
  for (const c of campaigns.rows) {
    console.log(`  - ${c.name} (${c.id}) [type: ${c.type}]`);
  }
  console.log('');

  const campaignIds = campaigns.rows.map((c: any) => c.id);

  // Get qualified lead sessions across all UKEF campaigns
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
      c.company_norm as company_name,
      camp.name as campaign_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON cs.contact_id = c.id
    LEFT JOIN campaigns camp ON cs.campaign_id = camp.id
    WHERE cs.campaign_id = ANY($1)
      AND cs.ai_disposition = 'qualified_lead'
    ORDER BY cs.created_at DESC
  `, [campaignIds]);

  console.log(`Total qualified leads found: ${result.rows.length}\n`);

  if (result.rows.length === 0) {
    console.log('No qualified leads found.');
    await pool.end();
    return;
  }

  for (const row of result.rows) {
    console.log(`Lead ID: ${row.id}`);
    console.log(`Campaign: ${row.campaign_name}`);
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

    // Output full transcript
    if (row.ai_transcript) {
      console.log('Transcript:');
      console.log(row.ai_transcript);
    } else {
      console.log('No transcript available.');
    }

    console.log('-'.repeat(60) + '\n');
  }

  await pool.end();
}

analyzeUKEFLeads().catch(console.error);
