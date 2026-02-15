import { pool } from '../server/db';

async function main() {
  // First get column names
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='leads' ORDER BY ordinal_position`);
  const colNames = cols.rows.map((r: any) => r.column_name);
  console.log('Leads columns:', colNames.join(', '));

  // Find name-like columns
  const nameCol = colNames.find((c: string) => c === 'contact_name' || c === 'name' || c === 'full_name') || 'contact_name';
  const fnCol = colNames.find((c: string) => c === 'first_name' || c === 'firstname');
  const lnCol = colNames.find((c: string) => c === 'last_name' || c === 'lastname');

  let query: string;
  if (fnCol && lnCol) {
    query = `SELECT * FROM leads WHERE (${fnCol} ILIKE '%Jackie%' AND ${lnCol} ILIKE '%Chen%') OR (${fnCol} ILIKE '%Jackie%' AND ${lnCol} ILIKE '%YC%') LIMIT 10`;
  } else {
    // Use whatever name column exists
    query = `SELECT * FROM leads WHERE ${nameCol} ILIKE '%Jackie%Chen%' OR ${nameCol} ILIKE '%Jackie%YC%Chen%' LIMIT 10`;
  }
  
  console.log('\nQuery:', query);
  const r = await pool.query(query);
  console.log('\n=== Results:', r.rows.length, '===');
  r.rows.forEach(row => console.log(JSON.stringify(row, null, 2)));

  // Broader search if no results
  if (r.rows.length === 0) {
    console.log('\nNo exact match. Trying broader "Chen" search...');
    const broadQuery = fnCol && lnCol 
      ? `SELECT * FROM leads WHERE ${lnCol} ILIKE '%Chen%' ORDER BY created_at DESC LIMIT 10`
      : `SELECT * FROM leads WHERE ${nameCol} ILIKE '%Chen%' ORDER BY created_at DESC LIMIT 10`;
    const broad = await pool.query(broadQuery);
    console.log('=== All "Chen" leads:', broad.rows.length, '===');
    broad.rows.forEach(row => console.log(JSON.stringify(row, null, 2)));
  }

  // Also check call_sessions
  if (r.rows.length > 0) {
    const leadIds = r.rows.map((row: any) => row.id);
    const calls = await pool.query(`
      SELECT id, lead_id, ai_disposition, duration_sec, created_at, phone_number
      FROM call_sessions WHERE lead_id = ANY($1) ORDER BY created_at DESC LIMIT 20
    `, [leadIds]);
    console.log('\n=== Related call sessions:', calls.rows.length, '===');
    calls.rows.forEach((row: any) => console.log(JSON.stringify(row, null, 2)));
  }

  // Also search contacts table
  const contactCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='contacts' ORDER BY ordinal_position`);
  if (contactCols.rows.length > 0) {
    const cColNames = contactCols.rows.map((r: any) => r.column_name);
    console.log('\nContacts columns:', cColNames.join(', '));
    const cNameCol = cColNames.find((c: string) => c === 'name' || c === 'full_name' || c === 'contact_name') || 'name';
    const cFnCol = cColNames.find((c: string) => c === 'first_name' || c === 'firstname');
    const cLnCol = cColNames.find((c: string) => c === 'last_name' || c === 'lastname');
    
    let cQuery: string;
    if (cFnCol && cLnCol) {
      cQuery = `SELECT * FROM contacts WHERE (${cFnCol} ILIKE '%Jackie%' AND ${cLnCol} ILIKE '%Chen%') LIMIT 10`;
    } else {
      cQuery = `SELECT * FROM contacts WHERE ${cNameCol} ILIKE '%Jackie%' OR ${cNameCol} ILIKE '%Chen%' LIMIT 20`;
    }
    const contacts = await pool.query(cQuery);
    console.log('\n=== Contacts table results:', contacts.rows.length, '===');
    contacts.rows.forEach(row => console.log(JSON.stringify(row, null, 2)));
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
