import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import 'dotenv/config';

neonConfig.webSocketConstructor = ws;

async function verify() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const campaignId = 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37';
  
  console.log('=== PROTON UK 2026 - DATABASE VERIFICATION ===\n');
  
  // Campaign info
  const campaign = await pool.query('SELECT name, status FROM campaigns WHERE id = $1', [campaignId]);
  console.log('Campaign:', campaign.rows[0]?.name);
  console.log('Status:', campaign.rows[0]?.status);
  console.log('');
  
  // Total calls (all time)
  const totalCalls = await pool.query(
    'SELECT COUNT(*) as count FROM call_sessions WHERE campaign_id = $1', [campaignId]
  );
  console.log('Total Calls Made:', totalCalls.rows[0].count);
  
  // Connected calls (answered)
  const connected = await pool.query(
    "SELECT COUNT(*) as count FROM call_sessions WHERE campaign_id = $1 AND status = 'connected'", [campaignId]
  );
  console.log('Calls Connected:', connected.rows[0].count);
  
  // Queue count
  const queue = await pool.query(
    'SELECT COUNT(*) as count FROM campaign_queue WHERE campaign_id = $1', [campaignId]
  );
  console.log('Contacts in Queue:', queue.rows[0].count);
  
  // Qualified leads
  const qualified = await pool.query(
    "SELECT COUNT(*) as count FROM call_sessions WHERE campaign_id = $1 AND ai_disposition = 'qualified_lead'", [campaignId]
  );
  console.log('Leads Qualified:', qualified.rows[0].count);
  
  // Not interested
  const notInterested = await pool.query(
    "SELECT COUNT(*) as count FROM call_sessions WHERE campaign_id = $1 AND ai_disposition = 'not_interested'", [campaignId]
  );
  console.log('Not Interested:', notInterested.rows[0].count);
  
  // DNC Requests
  const dnc = await pool.query(
    "SELECT COUNT(*) as count FROM call_sessions WHERE campaign_id = $1 AND ai_disposition = 'dnc'", [campaignId]
  );
  console.log('DNC Requests:', dnc.rows[0].count);
  
  // By disposition breakdown
  const byDisposition = await pool.query(
    'SELECT ai_disposition as disposition, COUNT(*) as count FROM call_sessions WHERE campaign_id = $1 GROUP BY ai_disposition ORDER BY count DESC', [campaignId]
  );
  
  console.log('\nBreakdown by Disposition:');
  byDisposition.rows.forEach((d: any) => console.log(`  ${d.disposition || 'null'}: ${d.count}`));
  
  // By call status
  const byStatus = await pool.query(
    'SELECT status, COUNT(*) as count FROM call_sessions WHERE campaign_id = $1 GROUP BY status ORDER BY count DESC', [campaignId]
  );
  
  console.log('\nBreakdown by Call Status:');
  byStatus.rows.forEach((s: any) => console.log(`  ${s.status || 'null'}: ${s.count}`));
  
  // Calculate connect rate
  const total = parseInt(totalCalls.rows[0].count);
  const conn = parseInt(connected.rows[0].count);
  const connectRate = total > 0 ? ((conn / total) * 100).toFixed(1) : 0;
  console.log(`\nCalculated Connect Rate: ${connectRate}%`);
  
  await pool.end();
  process.exit(0);
}

verify().catch(console.error);