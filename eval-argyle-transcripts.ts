import "./server/env";
import { pool, db } from "./server/db";
import { sql } from "drizzle-orm";

const ARGYLE_CLIENT_ID = "073ac22d-8c16-4db5-bf4f-667021dc0717";

async function main() {
  // 1. Get campaign QA parameters and context
  const campaigns = await db.execute(sql`
    SELECT id, name, status, type, qa_parameters, custom_qa_fields, custom_qa_rules,
           qualification_questions, campaign_objective, success_criteria, target_audience_description,
           call_script
    FROM campaigns
    WHERE client_account_id = ${ARGYLE_CLIENT_ID}
    ORDER BY created_at DESC
  `);

  for (const c of campaigns.rows) {
    console.log(`\n=== CAMPAIGN: ${c.name} (${c.id}) ===`);
    console.log(`Type: ${c.type} | Status: ${c.status}`);
    console.log(`Objective: ${c.campaign_objective || 'N/A'}`);
    console.log(`Success Criteria: ${c.success_criteria || 'N/A'}`);
    console.log(`Target Audience: ${c.target_audience_description || 'N/A'}`);
    console.log(`QA Parameters: ${JSON.stringify(c.qa_parameters, null, 2)}`);
    console.log(`Custom QA Fields: ${JSON.stringify(c.custom_qa_fields, null, 2)}`);
    console.log(`Custom QA Rules: ${c.custom_qa_rules || 'N/A'}`);
    if (c.qualification_questions) {
      console.log(`Qualification Questions: ${JSON.stringify(c.qualification_questions, null, 2)}`);
    }
  }

  const campaignIds = campaigns.rows.map((c: any) => c.id);
  const cids = campaignIds as string[];

  // 2. Get all actionable leads with their transcripts
  const leads = await db.execute(sql`
    SELECT 
      l.id, l.campaign_id, l.qa_status, l.verification_status,
      l.contact_name, l.contact_email, l.account_name,
      l.ai_score, l.ai_qualification_status, l.ai_analysis,
      l.transcript, l.structured_transcript,
      l.qa_decision, l.qa_data, l.notes,
      l.call_duration, l.recording_url,
      l.created_at,
      camp.name as campaign_name
    FROM leads l
    LEFT JOIN campaigns camp ON l.campaign_id = camp.id
    WHERE l.campaign_id IN (${sql.join(cids.map(id => sql`${id}`), sql`, `)})
      AND l.deleted_at IS NULL
      AND l.qa_status IN ('new', 'under_review', 'approved')
    ORDER BY l.qa_status, l.created_at DESC
  `);

  console.log(`\n\n========================================`);
  console.log(`TOTAL LEADS TO EVALUATE: ${leads.rows.length}`);
  console.log(`========================================\n`);

  for (const lead of leads.rows) {
    console.log(`\n--- LEAD: ${lead.id} ---`);
    console.log(`Contact: ${lead.contact_name} | ${lead.contact_email}`);
    console.log(`Account: ${lead.account_name}`);
    console.log(`Campaign: ${lead.campaign_name}`);
    console.log(`QA Status: ${lead.qa_status} | AI Score: ${lead.ai_score ?? 'N/A'} | AI Qual: ${lead.ai_qualification_status || 'N/A'}`);
    console.log(`Call Duration: ${lead.call_duration || 'N/A'}s`);
    console.log(`QA Decision: ${lead.qa_decision || 'N/A'}`);
    
    if (lead.ai_analysis) {
      const analysis = typeof lead.ai_analysis === 'string' ? lead.ai_analysis : JSON.stringify(lead.ai_analysis, null, 2);
      console.log(`\nAI Analysis: ${analysis.substring(0, 500)}`);
    }

    // Print transcript
    if (lead.structured_transcript) {
      const st = typeof lead.structured_transcript === 'string' 
        ? JSON.parse(lead.structured_transcript) 
        : lead.structured_transcript;
      if (Array.isArray(st) && st.length > 0) {
        console.log(`\n[STRUCTURED TRANSCRIPT - ${st.length} turns]`);
        for (const turn of st) {
          const speaker = turn.speaker || turn.role || 'Unknown';
          const text = turn.text || turn.content || '';
          console.log(`  ${speaker}: ${text}`);
        }
      }
    } else if (lead.transcript) {
      const t = typeof lead.transcript === 'string' ? lead.transcript : JSON.stringify(lead.transcript);
      console.log(`\n[TRANSCRIPT]`);
      console.log(t.substring(0, 3000));
      if (t.length > 3000) console.log(`... (truncated, ${t.length} total chars)`);
    } else {
      console.log(`\n[NO TRANSCRIPT AVAILABLE]`);
    }

    console.log(`\n${'='.repeat(60)}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Error:", err);
  pool.end();
  process.exit(1);
});
