import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { mercuryEmailService } from '../server/services/mercury';

const STALE_MINUTES = 10;

async function main() {
  const requeueResult = await db.execute(sql`
    UPDATE mercury_email_outbox
    SET
      status = 'queued',
      error_message = COALESCE(error_message, '') || CASE WHEN COALESCE(error_message, '') = '' THEN '' ELSE ' | ' END || 'Auto-requeued stale sending record',
      retry_count = COALESCE(retry_count, 0),
      failed_at = NULL
    WHERE status = 'sending'
      AND created_at  process.exit(0))
  .catch((error) => {
    console.error('Failed to requeue stale sending emails:', error);
    process.exit(1);
  });