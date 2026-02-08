import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function reserveSipNumber() {
  const sipNumber = '+13023601514';

  console.log(`Reserving ${sipNumber} for Agent Console SIP calls...\n`);

  // Update the number to 'suspended' status with reason
  await db.execute(sql`
    UPDATE telnyx_numbers
    SET
      status = 'suspended',
      status_reason = 'Reserved for Agent Console SIP calls',
      status_changed_at = NOW(),
      updated_at = NOW()
    WHERE phone_number_e164 = ${sipNumber}
  `);

  console.log(`✅ ${sipNumber} marked as suspended (reserved for Agent Console)`);

  // Verify and show remaining active numbers
  const activeNumbers = await db.execute(sql`
    SELECT phone_number_e164, status
    FROM telnyx_numbers
    WHERE status = 'active'
    ORDER BY phone_number_e164
  `);

  console.log(`\nRemaining ${activeNumbers.rows.length} active numbers for outbound pool:`);
  for (const n of activeNumbers.rows) {
    const num = n as any;
    console.log(`  ${num.phone_number_e164}`);
  }

  process.exit(0);
}

reserveSipNumber();
