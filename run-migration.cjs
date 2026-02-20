const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to database');

  // Check if column already exists
  const check = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'dialing_phone_e164'
  `);

  if (check.rows.length > 0) {
    console.log('Column dialing_phone_e164 already exists - no migration needed');
    await client.end();
    return;
  }

  console.log('Adding dialing_phone_e164 column...');

  // Add the column
  await client.query('ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dialing_phone_e164 text');
  console.log('Column added successfully');

  // Back-fill existing contacts
  const backfill = await client.query(`
    UPDATE contacts
    SET dialing_phone_e164 = COALESCE(
      CASE WHEN direct_phone_e164 IS NOT NULL
                AND direct_phone_e164 ~ E'^\\\\+[1-9]\\\\d{7,14}$'
           THEN direct_phone_e164
      END,
      CASE WHEN mobile_phone_e164 IS NOT NULL
                AND mobile_phone_e164 ~ E'^\\\\+[1-9]\\\\d{7,14}$'
           THEN mobile_phone_e164
      END
    )
    WHERE dialing_phone_e164 IS NULL
      AND (direct_phone_e164 IS NOT NULL OR mobile_phone_e164 IS NOT NULL)
  `);
  console.log('Back-filled', backfill.rowCount, 'contacts');

  // Create index
  await client.query(`
    CREATE INDEX IF NOT EXISTS contacts_dialing_phone_idx
    ON contacts (dialing_phone_e164)
    WHERE dialing_phone_e164 IS NOT NULL
  `);
  console.log('Index created');

  await client.end();
  console.log('Migration complete!');
}

run().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
