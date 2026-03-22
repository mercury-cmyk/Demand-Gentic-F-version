/**
 * Add new campaign type enum values to the database
 */
import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const newTypes = [
  'webinar_invite',
  'bant_qualification',
  'appointment_setting',
  'demo_request',
  'follow_up',
  'nurture',
  're_engagement'
];

async function addEnumValues() {
  console.log('Checking and adding new campaign type enum values...\n');

  // First, check existing values
  const existing = await db.execute(sql`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'campaign_type')
  `);

  const existingValues = new Set((existing.rows as any[]).map(r => r.enumlabel));
  console.log('Existing values:', [...existingValues].join(', '));
  console.log('');

  for (const typeName of newTypes) {
    if (existingValues.has(typeName)) {
      console.log(`  [EXISTS] ${typeName}`);
    } else {
      try {
        // PostgreSQL ALTER TYPE ADD VALUE cannot run in a transaction
        await db.execute(sql.raw(`ALTER TYPE campaign_type ADD VALUE '${typeName}'`));
        console.log(`  [ADDED]  ${typeName}`);
      } catch (e: any) {
        if (e.message?.includes('already exists')) {
          console.log(`  [EXISTS] ${typeName}`);
        } else {
          console.error(`  [ERROR]  ${typeName}: ${e.message}`);
        }
      }
    }
  }

  console.log('\nDone!');
}

addEnumValues()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
  });