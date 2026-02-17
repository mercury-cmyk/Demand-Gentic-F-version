import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const NEW_HOURLY_LIMIT = 25;

async function main() {
  await db.execute(
    sql`ALTER TABLE smtp_providers ALTER COLUMN hourly_send_limit SET DEFAULT 25;`,
  );

  const updated = await db.execute(sql`
    UPDATE smtp_providers
    SET hourly_send_limit = ${NEW_HOURLY_LIMIT}, updated_at = NOW()
    WHERE hourly_send_limit IS DISTINCT FROM ${NEW_HOURLY_LIMIT}
    RETURNING id, name, email_address, hourly_send_limit;
  `);

  const current = await db.execute(sql`
    SELECT id, name, email_address, hourly_send_limit
    FROM smtp_providers
    ORDER BY created_at DESC
    LIMIT 50;
  `);

  const updatedRows = (updated as any)?.rows ?? [];
  const currentRows = (current as any)?.rows ?? [];

  console.log(
    JSON.stringify(
      {
        appliedHourlyLimit: NEW_HOURLY_LIMIT,
        updatedCount: updatedRows.length,
        updatedProviders: updatedRows,
        currentProviders: currentRows,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to apply SMTP hourly limit:', error);
    process.exit(1);
  });
