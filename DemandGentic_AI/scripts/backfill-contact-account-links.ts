import {
  auditContactAccountLinks,
  backfillMissingContactAccountLinks,
} from '../server/services/contact-account-linking';
import { pool } from '../server/db';

function getNumberArg(name: string): number | undefined {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return undefined;

  const value = Number(raw.split('=')[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function main(): Promise {
  const execute = process.argv.includes('--execute');
  const batchSize = getNumberArg('batch');
  const maxContacts = getNumberArg('max');

  console.log('[ContactAccountLinks] Audit before backfill');
  const before = await auditContactAccountLinks();
  console.log(JSON.stringify(before, null, 2));

  if (!execute) {
    console.log('[ContactAccountLinks] Dry run only. Re-run with --execute to backfill missing account links.');
    return;
  }

  console.log('[ContactAccountLinks] Running backfill...');
  const stats = await backfillMissingContactAccountLinks({
    batchSize,
    maxContacts,
  });
  console.log(JSON.stringify(stats, null, 2));

  console.log('[ContactAccountLinks] Audit after backfill');
  const after = await auditContactAccountLinks();
  console.log(JSON.stringify(after, null, 2));
}

main().catch((error) => {
  console.error('[ContactAccountLinks] Failed:', error);
  process.exit(1);
}).finally(async () => {
  await pool.end();
});