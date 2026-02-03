const { Pool } = require('@neondatabase/serverless');
require('dotenv').config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // Get Argyle campaign
    const result = await client.query(`
      SELECT id, name, audience_refs 
      FROM campaigns 
      WHERE name ILIKE '%Argyle%'
    `);
    
    console.log('=== Argyle Campaign ===');
    console.log(JSON.stringify(result.rows, null, 2));
    
    if (result.rows.length > 0 && result.rows[0].audience_refs) {
      const audienceRefs = result.rows[0].audience_refs;
      const listIds = audienceRefs.lists || audienceRefs.selectedLists || [];
      
      console.log('\n=== List IDs ===');
      console.log(listIds);
      
      if (listIds.length > 0) {
        const listResult = await client.query(
          'SELECT id, name, array_length(record_ids, 1) as count FROM lists WHERE id = ANY($1)',
          [listIds]
        );
        console.log('\n=== Lists ===');
        console.log(JSON.stringify(listResult.rows, null, 2));
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
