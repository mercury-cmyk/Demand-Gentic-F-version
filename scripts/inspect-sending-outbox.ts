import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`
    SELECT id, recipient_email, status, created_at, sent_at, failed_at
    FROM mercury_email_outbox
    WHERE status = 'sending'
    ORDER BY created_at ASC;
  `);

  console.log(JSON.stringify({ sendingRows: (result as any)?.rows ?? [] }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to inspect sending outbox rows:', error);
    process.exit(1);
  });
