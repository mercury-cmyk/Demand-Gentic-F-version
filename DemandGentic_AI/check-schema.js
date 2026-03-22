const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: true
});

(async () => {
  try {
    const result = await pool.query(
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'campaigns'
      ORDER BY ordinal_position;
    );
    console.log('Campaigns columns:');
    result.rows.forEach(col => {
      console.log(\  \: \ \\);
    });
  } finally {
    await pool.end();
  }
})();