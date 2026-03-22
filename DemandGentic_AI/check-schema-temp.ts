import { pool } from './server/db';

async function checkSchema() {
  try {
    const res = await pool.query('SELECT * FROM call_sessions LIMIT 1');
    if (res.rows.length > 0) {
      console.log('Columns in call_sessions:');
      console.log(Object.keys(res.rows[0]).join('\n'));
    } else {
      console.log('No rows in call_sessions');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

checkSchema();