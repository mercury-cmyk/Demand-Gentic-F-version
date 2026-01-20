import { pool } from './server/db';

async function main() {
  const callId = '0c675ff6-15f6-41aa-84f8-013525211427';
  
  const result = await pool.query(`
    SELECT * FROM call_attempts WHERE id = $1
  `, [callId]);
  
  console.log('Call attempt:', JSON.stringify(result.rows[0], null, 2));
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
