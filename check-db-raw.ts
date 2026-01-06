
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkDb() {
  try {
    console.log("Connecting to DB...");
    const result = await db.execute(sql`SELECT count(*) FROM users`);
    console.log("Query result:", result);
    console.log("Data exists!");
  } catch (error) {
    console.error("DB Error:", error);
  }
  process.exit(0);
}

checkDb();
