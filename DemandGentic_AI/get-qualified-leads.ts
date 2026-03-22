import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function getQualifiedLeads() {
  const leads = await db.execute(sql`
    SELECT 
      dca.id,
      dca.call_duration_seconds,
      dca.connected,
      dca.notes,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.full_name,
      c.job_title,
      c.email,
      c.direct_phone,
      a.name as company,
      camp.name as campaign_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca.contact_id = c.id
    LEFT JOIN accounts a ON c.account_id = a.id
    LEFT JOIN campaigns camp ON dca.campaign_id = camp.id
    WHERE dca.disposition = 'qualified_lead'
    ORDER BY dca.created_at DESC
  `);

  console.log('=== QUALIFIED LEADS (9 total) ===\n');
  
  for (const r of leads.rows) {
    console.log(`--- Lead: ${r.full_name || r.first_name || 'Unknown'} ${r.last_name || ''} ---`);
    console.log(`  Company: ${r.company || 'N/A'}`);
    console.log(`  Title: ${r.job_title || 'N/A'}`);
    console.log(`  Email: ${r.email || 'N/A'}`);
    console.log(`  Phone: ${r.direct_phone || 'N/A'}`);
    console.log(`  Campaign: ${r.campaign_name || 'N/A'}`);
    console.log(`  Call Duration: ${r.call_duration_seconds || 0}s`);
    console.log(`  Connected: ${r.connected}`);
    console.log(`  Date: ${r.created_at}`);
    const notes = (r.notes as string || '').substring(0, 400);
    console.log(`  Notes: ${notes}...`);
    console.log('');
  }
  
  process.exit(0);
}

getQualifiedLeads();