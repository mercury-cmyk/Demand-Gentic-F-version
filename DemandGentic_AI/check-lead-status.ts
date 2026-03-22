import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkLeadStatus() {
  console.log('=== QUALIFIED LEADS STATUS CHECK ===\n');

  // Check dialer_call_attempts status
  const callStatus = await db.execute(sql`
    SELECT 
      dca.disposition,
      dca.connected,
      dca.voicemail_detected,
      COUNT(*) as cnt
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'qualified_lead'
    GROUP BY dca.disposition, dca.connected, dca.voicemail_detected
  `);
  
  console.log('Call Attempts Status:');
  for (const r of callStatus.rows) {
    console.log(`  ${r.disposition} | connected=${r.connected} | vm=${r.voicemail_detected} | count=${r.cnt}`);
  }

  // Check if there's a leads table or qualified_leads table
  const leadDetails = await db.execute(sql`
    SELECT 
      dca.id as call_id,
      c.full_name,
      a.name as company,
      dca.connected,
      dca.call_duration_seconds,
      dca.created_at,
      c.id as contact_id
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca.contact_id = c.id
    LEFT JOIN accounts a ON c.account_id = a.id
    WHERE dca.disposition = 'qualified_lead'
    ORDER BY dca.created_at DESC
  `);

  console.log('\nQualified Lead Details:');
  for (const r of leadDetails.rows) {
    console.log(`  ${r.full_name} @ ${r.company}`);
    console.log(`    connected=${r.connected} | duration=${r.call_duration_seconds}s | date=${r.created_at}`);
    console.log(`    contact_id=${r.contact_id}`);
  }

  // Check if there's a separate leads table
  try {
    const leadsTable = await db.execute(sql`
      SELECT 
        l.id,
        l.status,
        l.contact_id,
        c.full_name
      FROM leads l
      LEFT JOIN contacts c ON l.contact_id = c.id
      ORDER BY l.created_at DESC
      LIMIT 20
    `);
    
    console.log('\n=== LEADS TABLE ===');
    for (const r of leadsTable.rows) {
      console.log(`  ${r.full_name} | status=${r.status} | lead_id=${r.id}`);
    }
  } catch (e) {
    console.log('\nNo separate leads table found or error:', (e as Error).message);
  }

  process.exit(0);
}

checkLeadStatus();