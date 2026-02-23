import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function run() {
  const cid = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';
  
  // 1. How many leads have non-qualified call attempt dispositions?
  const bad = await pool.query(`
    SELECT dca.disposition, COUNT(*) as c
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.campaign_id = $1
    AND dca.disposition NOT IN ('qualified_lead', 'callback_requested')
    GROUP BY dca.disposition ORDER BY c DESC
  `, [cid]);
  console.log('=== BAD LEADS by call_attempt disposition ===');
  let totalBad = 0;
  for (const r of bad.rows) { console.log(r.disposition + ': ' + r.c); totalBad += Number(r.c); }
  console.log('Total bad leads:', totalBad);

  // 2. Good leads
  const good = await pool.query(`
    SELECT dca.disposition, COUNT(*) as c
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.campaign_id = $1
    AND dca.disposition IN ('qualified_lead', 'callback_requested')
    GROUP BY dca.disposition ORDER BY c DESC
  `, [cid]);
  console.log('\n=== GOOD LEADS by call_attempt disposition ===');
  for (const r of good.rows) console.log(r.disposition + ': ' + r.c);

  // 3. When were bad leads created? (date distribution)
  const badDates = await pool.query(`
    SELECT DATE(l.created_at) as dt, COUNT(*) as c
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.campaign_id = $1
    AND dca.disposition NOT IN ('qualified_lead', 'callback_requested')
    GROUP BY DATE(l.created_at) ORDER BY dt DESC LIMIT 20
  `, [cid]);
  console.log('\n=== BAD LEADS by creation date ===');
  for (const r of badDates.rows) console.log(r.dt.toISOString().split('T')[0] + ': ' + r.c);

  // 4. Check lead notes distribution
  const notePatterns = await pool.query(`
    SELECT SUBSTRING(l.notes FROM 1 FOR 80) as note_start, COUNT(*) as c
    FROM leads l
    WHERE l.campaign_id = $1
    GROUP BY SUBSTRING(l.notes FROM 1 FOR 80) ORDER BY c DESC LIMIT 10
  `, [cid]);
  console.log('\n=== Lead notes patterns ===');
  for (const r of notePatterns.rows) console.log(r.c + 'x: ' + r.note_start);

  // 5. Check if the call_attempt's disposition was CHANGED after lead creation
  const raceCheck = await pool.query(`
    SELECT l.id, l.created_at::text as lead_created, l.call_duration as lead_dur,
           dca.disposition, dca.call_duration_seconds as attempt_dur, 
           dca.updated_at::text as attempt_updated, dca.created_at::text as attempt_created
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.campaign_id = $1
    AND dca.disposition NOT IN ('qualified_lead', 'callback_requested')
    ORDER BY l.created_at DESC LIMIT 5
  `, [cid]);
  console.log('\n=== RACE CONDITION CHECK (lead created vs attempt updated) ===');
  for (const r of raceCheck.rows) {
    console.log('Lead:', r.id.substring(0,8), '| leadCreated:', r.lead_created, '| attemptUpdated:', r.attempt_updated, '| attemptDispo:', r.disposition, '| attemptDur:', r.attempt_dur + 's');
  }

  // 6. Check the processCallbackRequested code path — what call_session disposition was at creation time?
  const sessionCheck = await pool.query(`
    SELECT l.id, l.created_at::text, l.call_duration,
           cs.ai_disposition, cs.call_status, cs.duration_seconds as session_dur,
           dca.disposition as attempt_dispo
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN call_sessions cs ON cs.call_attempt_id = l.call_attempt_id
    WHERE l.campaign_id = $1
    AND dca.disposition NOT IN ('qualified_lead', 'callback_requested')
    ORDER BY l.created_at DESC LIMIT 10
  `, [cid]);
  console.log('\n=== SESSION CHECK for bad leads ===');
  for (const r of sessionCheck.rows) {
    console.log('Lead:', r.id.substring(0,8), '| aiDispo:', r.ai_disposition, '| callStatus:', r.call_status, '| sessionDur:', r.session_dur + 's', '| attemptDispo:', r.attempt_dispo);
  }

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
