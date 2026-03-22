import { neon } from '@neondatabase/serverless';
const sql = neon('postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require');

async function check() {
  // Find Joseph's client account
  const users = await sql`SELECT cu.id, cu.first_name, cu.last_name, cu.email, ca.id as account_id, ca.name as account_name 
    FROM client_users cu 
    JOIN client_accounts ca ON cu.client_account_id = ca.id 
    WHERE cu.first_name ILIKE '%Joseph%' 
    LIMIT 5`;
  console.log('Joseph users:', JSON.stringify(users, null, 2));

  // Check for Argyle client account
  const argyle = await sql`SELECT id, name FROM client_accounts WHERE name ILIKE '%Argyle%' LIMIT 5`;
  console.log('\nArgyle accounts:', JSON.stringify(argyle, null, 2));
}

check();