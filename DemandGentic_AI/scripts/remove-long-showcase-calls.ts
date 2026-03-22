import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../server/db';

const MAX_DURATION_SEC = 4 * 60;

async function main() {
  const result = await db.execute(sql`
    WITH target AS (
      SELECT cqr.call_session_id
      FROM call_quality_records cqr
      INNER JOIN call_sessions cs ON cs.id = cqr.call_session_id
      WHERE cqr.is_showcase = true
        AND COALESCE(cs.duration_sec, 0) > ${MAX_DURATION_SEC}
    )
    UPDATE call_quality_records cqr
    SET
      is_showcase = false,
      showcase_category = NULL,
      showcase_notes = NULL,
      showcased_at = NULL,
      showcased_by = NULL,
      updated_at = NOW()
    FROM target t
    WHERE cqr.call_session_id = t.call_session_id
    RETURNING cqr.call_session_id;
  `);

  const rows = (result as any)?.rows ?? [];

  console.log(
    JSON.stringify(
      {
        maxDurationSec: MAX_DURATION_SEC,
        removedCount: rows.length,
        removedCallSessionIds: rows.slice(0, 50).map((row: any) => row.call_session_id),
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to remove long showcase calls:', error);
    process.exit(1);
  });