import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function listTables() {
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  
  console.log('\n📋 Production Database Tables:\n');
  tables.forEach(t => console.log('  -', t.table_name));
  console.log(`\nTotal: ${tables.length} tables\n`);
}

listTables().catch(console.error);
