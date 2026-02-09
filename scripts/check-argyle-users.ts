import { neon } from '@neondatabase/serverless';
const sql = neon('postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require');

async function check() {
  // List all users for the Argyle account
  const users = await sql`SELECT id, first_name, last_name, email, client_account_id 
    FROM client_users 
    WHERE client_account_id = '073ac22d-8c16-4db5-bf4f-667021dc0717'`;
  console.log('Argyle client users:', JSON.stringify(users, null, 2));
}

check();
