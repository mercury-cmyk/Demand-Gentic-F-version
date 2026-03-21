import { db } from '../server/db';
import { unifiedPipelines } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const [p] = await db.select({
    name: unifiedPipelines.name,
    status: unifiedPipelines.status,
    orgId: unifiedPipelines.organizationId,
    clientAccountId: unifiedPipelines.clientAccountId,
    objective: unifiedPipelines.objective,
  }).from(unifiedPipelines)
    .where(eq(unifiedPipelines.id, 'ad09d43f-48e4-4545-bf22-82b41c736638'))
    .limit(1);

  if (!p) {
    console.log('Pipeline NOT FOUND');
  } else {
    console.log('Name:', p.name);
    console.log('Status:', p.status);
    console.log('OrgId:', p.orgId);
    console.log('ClientAccountId:', p.clientAccountId);
    console.log('Objective:', p.objective?.slice(0, 100));
  }
  process.exit(0);
}
main();
