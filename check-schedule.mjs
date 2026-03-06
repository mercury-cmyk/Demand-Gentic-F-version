import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" });
await client.connect();

const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';

// Get all campaign columns that might relate to schedule
const cols = await client.query(`
  SELECT column_name FROM information_schema.columns WHERE table_name = 'campaigns'
  AND (column_name LIKE '%time%' OR column_name LIKE '%hour%' OR column_name LIKE '%schedule%' OR column_name LIKE '%zone%')
`);
console.log('Schedule-related columns:', cols.rows.map(r => r.column_name));

// Get full campaign data for scheduling
const campaign = await client.query(`SELECT * FROM campaigns WHERE id = $1`, [campaignId]);
const c = campaign.rows[0];
if (c) {
  // Print all non-null values that might affect scheduling
  for (const [key, val] of Object.entries(c)) {
    if (val !== null && (key.includes('time') || key.includes('hour') || key.includes('schedule') || key.includes('zone') || key.includes('calling') || key.includes('dial'))) {
      console.log(`  ${key}: ${val}`);
    }
  }
}

await client.end();
