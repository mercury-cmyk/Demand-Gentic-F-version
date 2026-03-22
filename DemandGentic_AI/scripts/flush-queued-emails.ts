import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../server/db';
import { mercuryEmailService } from '../server/services/mercury';

const BATCH_SIZE = 200;
const MAX_ROUNDS = 25;

async function getMercuryStatusCounts() {
  const result = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count
    FROM mercury_email_outbox
    GROUP BY status
    ORDER BY status;
  `);
  return ((result as any)?.rows ?? []) as Array;
}

async function getTransactionalPendingCounts() {
  const result = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count
    FROM transactional_email_logs
    WHERE status IN ('pending', 'queued', 'sending')
    GROUP BY status
    ORDER BY status;
  `);
  return ((result as any)?.rows ?? []) as Array;
}

async function main() {
  const mercuryBefore = await getMercuryStatusCounts();
  const txBefore = await getTransactionalPendingCounts();

  const rounds: Array = [];

  for (let i = 1; i  sum + r.processed, 0);
  const totalSucceeded = rounds.reduce((sum, r) => sum + r.succeeded, 0);
  const totalFailed = rounds.reduce((sum, r) => sum + r.failed, 0);

  console.log(
    JSON.stringify(
      {
        mercury: {
          before: mercuryBefore,
          after: mercuryAfter,
          flush: {
            batchSize: BATCH_SIZE,
            maxRounds: MAX_ROUNDS,
            rounds,
            totalProcessed,
            totalSucceeded,
            totalFailed,
          },
        },
        transactional: {
          beforePendingLike: txBefore,
          afterPendingLike: txAfter,
          note:
            'Transactional emails in this codepath are sent immediately; pending/queued/sending rows here are historical logs and not auto-replayed by outbox flush.',
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to flush queued emails:', error);
    process.exit(1);
  });