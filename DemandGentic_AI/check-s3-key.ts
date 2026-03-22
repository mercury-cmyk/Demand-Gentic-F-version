import { db } from './server/db';
import { callSessions } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkS3Key() {
  const id = 'f23c7c8a-96ee-4ff3-9f66-8fdca06481e3';
  const session = await db.select().from(callSessions).where(eq(callSessions.id, id));

  console.log(JSON.stringify(session, null, 2));
}

checkS3Key().catch(console.error).finally(() => process.exit(0));