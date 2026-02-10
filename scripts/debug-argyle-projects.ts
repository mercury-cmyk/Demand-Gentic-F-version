import { db } from '../server/db';
import { clientProjects, workOrderDrafts, externalEvents } from '../shared/schema';
import { eq } from 'drizzle-orm';

const ARGYLE_ID = '073ac22d-8c16-4db5-bf4f-667021dc0717';

async function main() {
  // 1. Check all clientProjects for Argyle
  const projects = await db.select().from(clientProjects).where(eq(clientProjects.clientAccountId, ARGYLE_ID));
  console.log('=== Argyle clientProjects ===');
  console.log(JSON.stringify(projects.map(p => ({ id: p.id, name: p.name, status: p.status, externalEventId: p.externalEventId })), null, 2));

  // 2. Check submitted drafts for Argyle
  const drafts = await db.select().from(workOrderDrafts).where(eq(workOrderDrafts.clientAccountId, ARGYLE_ID));
  console.log('\n=== Argyle workOrderDrafts ===');
  console.log(JSON.stringify(drafts.map(d => ({ id: d.id, status: d.status, externalEventId: d.externalEventId, submittedAt: d.submittedAt })), null, 2));

  // 3. Check external events for Argyle
  const events = await db.select().from(externalEvents).where(eq(externalEvents.clientAccountId, ARGYLE_ID));
  console.log('\n=== Argyle externalEvents count:', events.length);
  // Show first few with draft status
  const withDrafts = events.filter(e => e.draftStatus !== 'not_created');
  console.log('Events with drafts:', withDrafts.length);
  console.log(JSON.stringify(withDrafts.map(e => ({ id: e.id, title: e.eventTitle, draftStatus: e.draftStatus })), null, 2));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
