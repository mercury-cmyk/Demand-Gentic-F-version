const { Pool } = require('@neondatabase/serverless');
require('dotenv').config();

const p = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const c = await p.connect();
  
  // First check the table structure
  const schema = await c.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name='client_organization_links'
    ORDER BY ordinal_position
  `);
  console.log('Table Schema:', JSON.stringify(schema.rows, null, 2));
  
  // Insert the link for Argyle client account to Argyle Executive Forum, LLC organization
  const result = await c.query(`
    INSERT INTO client_organization_links (id, client_account_id, campaign_organization_id, is_primary, linked_by)
    VALUES (gen_random_uuid(), $1, $2, true, $3)
    RETURNING *
  `, [
    '073ac22d-8c16-4db5-bf4f-667021dc0717',  // Argyle client account
    '3d871180-5405-4747-8b5b-4f2f123ec7ce',  // Argyle Executive Forum, LLC organization
    'da0c653b-c853-47b9-82df-de9b7b754378'   // linked by user id
  ]);
  
  console.log('Created link:', JSON.stringify(result.rows, null, 2));
  
  c.release();
  await p.end();
})().catch(console.error);