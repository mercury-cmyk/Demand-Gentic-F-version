import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const dbUrl = 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(dbUrl);

const migration = fs.readFileSync('migrations/add-argyle-event-drafts.sql', 'utf-8');

// Remove comment-only lines and split by semicolons carefully
const statements = migration
  .replace(/--[^\n]*/g, '') // Remove SQL comments
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 5); // Filter out empty/tiny fragments

async function run() {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await sql.query(stmt);
      const preview = stmt.replace(/\s+/g, ' ').substring(0, 80);
      console.log(`[${i + 1}/${statements.length}] OK: ${preview}`);
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log(`[${i + 1}] SKIP (exists): ${stmt.replace(/\s+/g, ' ').substring(0, 60)}`);
      } else {
        console.error(`[${i + 1}] ERROR: ${e.message}`);
        console.error(`  Statement: ${stmt.replace(/\s+/g, ' ').substring(0, 120)}`);
      }
    }
  }
  console.log('\nMigration complete.');
}

run();
