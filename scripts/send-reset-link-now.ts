import 'dotenv/config';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { clientUsers, passwordResetTokens } from '../shared/schema';
import { transactionalEmailService } from '../server/services/transactional-email-service';

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) {
    throw new Error('Usage: npx tsx scripts/send-reset-link-now.ts <email>');
  }

  const [clientUser] = await db
    .select({ id: clientUsers.id, email: clientUsers.email })
    .from(clientUsers)
    .where(eq(clientUsers.email, email))
    .limit(1);

  if (!clientUser) {
    throw new Error(`No client user found for email: ${email}`);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    token,
    userId: null,
    clientUserId: clientUser.id,
    email,
    userType: 'client',
    expiresAt,
  });

  const resetLink = `https://demandgentic.ai/reset-password?token=${token}&type=client`;

  const result = await transactionalEmailService.triggerPasswordResetEmail(
    email,
    resetLink,
    '1 hour'
  );

  console.log(
    JSON.stringify(
      {
        email,
        resetLink,
        result,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
