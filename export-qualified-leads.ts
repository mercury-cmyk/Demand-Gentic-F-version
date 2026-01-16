import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function exportQualifiedLeads() {
  console.log('========================================');
  console.log('QUALIFIED LEADS & MEETINGS BOOKED');
  console.log('========================================\n');

  // Get all Meeting Booked and Qualified Lead sessions
  const leads = await db.execute(sql`
    SELECT
      cs.id,
      cs.ai_disposition,
      cs.contact_id,
      cs.campaign_id,
      cs.created_at,
      cs.to_number_e164 as phone,
      cs.duration_sec,
      cs.ai_transcript,
      c.first_name,
      c.last_name,
      c.email,
      c.job_title,
      c.direct_phone_e164,
      c.mobile_phone_e164,
      a.name as company_name,
      camp.name as campaign_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    WHERE cs.ai_disposition IN ('Meeting Booked', 'Qualified Lead')
    ORDER BY cs.created_at DESC
  `);

  console.log(`Found ${leads.rows.length} qualified leads/meetings:\n`);

  for (const row of leads.rows) {
    const r = row as any;
    const date = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'N/A';

    console.log('═══════════════════════════════════════');
    console.log(`📞 ${r.ai_disposition}`);
    console.log('═══════════════════════════════════════');
    console.log(`Name:      ${r.first_name || 'Unknown'} ${r.last_name || ''}`);
    console.log(`Company:   ${r.company_name || 'N/A'}`);
    console.log(`Title:     ${r.job_title || 'N/A'}`);
    console.log(`Email:     ${r.email || 'N/A'}`);
    console.log(`Phone:     ${r.phone || r.direct_phone_e164 || r.mobile_phone_e164 || 'N/A'}`);
    console.log(`Campaign:  ${r.campaign_name || 'N/A'}`);
    console.log(`Date:      ${date}`);
    console.log(`Duration:  ${r.duration_sec || 0} seconds`);

    // Parse and display transcript
    if (r.ai_transcript) {
      try {
        let transcript = r.ai_transcript;
        if (typeof transcript === 'string') {
          transcript = JSON.parse(transcript);
        }

        console.log(`\nConversation Transcript:`);
        console.log('------------------------');

        if (Array.isArray(transcript)) {
          for (const turn of transcript) {
            const role = turn.role === 'agent' ? '🤖 Agent' : '👤 Contact';
            const text = turn.message || turn.text || turn.content || '';
            if (text && text.length > 0) {
              console.log(`${role}: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
            }
          }
        } else if (typeof transcript === 'string') {
          console.log(transcript.substring(0, 500));
        }
      } catch (e) {
        console.log(`Transcript: ${String(r.ai_transcript).substring(0, 300)}...`);
      }
    }

    console.log('\n');
  }

  // Summary by disposition type
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');

  const summary = await db.execute(sql`
    SELECT
      ai_disposition,
      COUNT(*) as count
    FROM call_sessions
    WHERE ai_disposition IN ('Meeting Booked', 'Qualified Lead')
    GROUP BY ai_disposition
    ORDER BY count DESC
  `);

  for (const row of summary.rows) {
    const r = row as any;
    console.log(`  ${r.ai_disposition}: ${r.count}`);
  }

  process.exit(0);
}

exportQualifiedLeads().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
