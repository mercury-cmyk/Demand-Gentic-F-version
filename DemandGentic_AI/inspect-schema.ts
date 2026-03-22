import { pool } from './server/db';

async function inspectTables() {
  try {
    const cs = await pool.query('SELECT * FROM call_sessions LIMIT 1');
    console.log('Call Sessions Columns:', Object.keys(cs.rows[0]));

    const c = await pool.query('SELECT * FROM contacts LIMIT 1');
    console.log('Contacts Columns:', Object.keys(c.rows[0]));
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
}

inspectTables();