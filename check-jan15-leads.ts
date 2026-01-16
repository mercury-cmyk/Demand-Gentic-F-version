import { db } from './server/db';
import { sql } from 'drizzle-orm';

const result = await db.execute(sql`
  SELECT
    id,
    contact_name,
    account_name,
    contact_email,
    qa_status,
    ai_score,
    transcript,
    qa_data,
    ai_analysis,
    created_at
  FROM leads
  WHERE created_at::date = '2026-01-15'
  ORDER BY ai_score DESC NULLS LAST
  LIMIT 5
`);

console.log(`Found ${result.rows.length} leads from Jan 15\n`);

if (result.rows.length === 0) {
  console.log('No leads found. Checking if any leads exist at all...');
  const count = await db.execute(sql`SELECT COUNT(*) as count FROM leads`);
  console.log(`Total leads in database: ${count.rows[0]?.count || 0}`);
} else {
  result.rows.forEach((lead: any, i: number) => {
    console.log(`\n=== LEAD ${i + 1} ===`);
    console.log(`ID: ${lead.id}`);
    console.log(`Name: ${lead.contact_name || 'N/A'}`);
    console.log(`Company: ${lead.account_name || 'N/A'}`);
    console.log(`Email: ${lead.contact_email || 'N/A'}`);
    console.log(`QA Status: ${lead.qa_status || 'N/A'}`);
    console.log(`AI Score: ${lead.ai_score || 'N/A'}`);
    console.log(`Has Transcript: ${lead.transcript ? 'YES' : 'NO'}`);
    console.log(`Has QA Data: ${lead.qa_data ? 'YES' : 'NO'}`);
    console.log(`Has AI Analysis: ${lead.ai_analysis ? 'YES' : 'NO'}`);

    if (lead.transcript) {
      console.log(`\nTranscript Preview (first 200 chars):`);
      console.log(lead.transcript.substring(0, 200) + '...');
    }

    if (lead.qa_data) {
      console.log(`\nQA Data:`);
      console.log(JSON.stringify(lead.qa_data, null, 2));
    }
  });
}

process.exit(0);
