import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkColumn() {
  try {
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'problem_intelligence_org_id';
    `);
    
    console.log('Column check result:', result.rows);
    
    if (result.rows.length === 0) {
        console.log('Column missing! Attempting to add it...');
        await db.execute(sql`
            ALTER TABLE campaigns 
            ADD COLUMN IF NOT EXISTS problem_intelligence_org_id varchar;
        `);
        console.log('Column added successfully.');
    } else {
        console.log('Column exists.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkColumn();