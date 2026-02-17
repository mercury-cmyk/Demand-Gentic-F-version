import 'dotenv/config';
import { db } from '../server/db';
import { and, asc, eq } from 'drizzle-orm';
import { clientAccounts, clientUsers } from '../shared/schema';
import { mercuryEmailService } from '../server/services/mercury';

type Recipient = {
  clientUserId: string;
  clientAccountId: string;
  accountName: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

function getArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function buildRecipientName(r: Recipient): string {
  const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
  return fullName || r.accountName || 'there';
}

async function getActiveClientRecipients(limit?: number): Promise<Recipient[]> {
  const rows = await db
    .select({
      clientUserId: clientUsers.id,
      clientAccountId: clientUsers.clientAccountId,
      accountName: clientAccounts.name,
      email: clientUsers.email,
      firstName: clientUsers.firstName,
      lastName: clientUsers.lastName,
    })
    .from(clientUsers)
    .innerJoin(clientAccounts, eq(clientAccounts.id, clientUsers.clientAccountId))
    .where(
      and(
        eq(clientUsers.isActive, true),
        eq(clientAccounts.isActive, true),
      ),
    )
    .orderBy(asc(clientAccounts.name), asc(clientUsers.email));

  const deduped = new Map<string, Recipient>();
  for (const row of rows) {
    const email = (row.email || '').trim().toLowerCase();
    if (!email) continue;
    if (!deduped.has(email)) {
      deduped.set(email, {
        clientUserId: row.clientUserId,
        clientAccountId: row.clientAccountId,
        accountName: row.accountName || 'Client',
        email,
        firstName: row.firstName,
        lastName: row.lastName,
      });
    }
  }

  const recipients = Array.from(deduped.values());
  return typeof limit === 'number' && limit > 0 ? recipients.slice(0, limit) : recipients;
}

async function main() {
  const execute = hasFlag('execute');
  const sendNow = hasFlag('send-now');
  const showTemplate = hasFlag('show-template');
  const showcasePath = getArg('showcasePath', '/client-portal/showcase-calls') || '/client-portal/showcase-calls';
  const notes = getArg('notes', '');
  const limitRaw = getArg('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const batchTag = getArg('batchTag', new Date().toISOString().slice(0, 10)) || new Date().toISOString().slice(0, 10);

  if (limitRaw && Number.isNaN(limit)) {
    throw new Error(`Invalid --limit value: ${limitRaw}`);
  }

  const templatePreview = await mercuryEmailService.previewTemplate('showcase_recordings_shared', {
    recipientName: 'Jane Smith',
    showcasePath,
    notes,
  });

  if (!templatePreview) {
    throw new Error('Template "showcase_recordings_shared" not found or disabled.');
  }

  const recipients = await getActiveClientRecipients(limit);

  if (!execute) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          templateKey: 'showcase_recordings_shared',
          recipientCount: recipients.length,
          showcasePath,
          notes,
          sampleRecipients: recipients.slice(0, 10).map((r) => ({
            email: r.email,
            recipientName: buildRecipientName(r),
            accountName: r.accountName,
          })),
          templatePreview: showTemplate
            ? {
                subject: templatePreview.rendered.subject,
                html: templatePreview.rendered.html,
                text: templatePreview.rendered.text,
              }
            : {
                subject: templatePreview.rendered.subject,
                htmlSnippet: templatePreview.rendered.html.slice(0, 600),
                textSnippet: templatePreview.rendered.text?.slice(0, 240) || null,
                hint: 'Use --show-template to print full HTML/text in dry-run output.',
              },
          nextStep:
            'Re-run with --execute to queue emails. Add --send-now to process outbox immediately.',
        },
        null,
        2,
      ),
    );
    return;
  }

  let queued = 0;
  let skipped = 0;
  const errors: Array<{ email: string; error: string }> = [];

  for (const recipient of recipients) {
    try {
      const recipientName = buildRecipientName(recipient);
      const rendered = await mercuryEmailService.renderTemplate('showcase_recordings_shared', {
        recipientName,
        showcasePath,
        notes,
      });

      if (!rendered) {
        throw new Error('Template render failed');
      }

      const idempotencyKey = `showcase_recordings_shared_${batchTag}_${recipient.clientUserId}`;

      const result = await mercuryEmailService.queueEmail({
        templateKey: 'showcase_recordings_shared',
        recipientEmail: recipient.email,
        recipientName,
        recipientUserId: recipient.clientUserId,
        recipientUserType: 'client',
        tenantId: recipient.clientAccountId,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey,
        metadata: {
          source: 'script:send-showcase-recordings-shared-to-all-clients',
          batchTag,
          showcasePath,
          notes,
          accountName: recipient.accountName,
        },
      });

      if (result.skipped) skipped++;
      else queued++;
    } catch (error: any) {
      errors.push({ email: recipient.email, error: error?.message || String(error) });
    }
  }

  let outboxProcessed: { processed: number; succeeded: number; failed: number } | null = null;
  if (sendNow) {
    outboxProcessed = await mercuryEmailService.processOutbox();
  }

  console.log(
    JSON.stringify(
      {
        mode: 'execute',
        templateKey: 'showcase_recordings_shared',
        totalRecipients: recipients.length,
        queued,
        skipped,
        errorsCount: errors.length,
        errors: errors.slice(0, 25),
        outboxProcessed,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to send showcase recordings shared template:', error);
    process.exit(1);
  });
