import 'dotenv/config';
import { db } from './server/db';
import { campaignOrganizations } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const orgs = await db.select().from(campaignOrganizations).where(eq(campaignOrganizations.isActive, true));
  console.log('Organizations in DB:', orgs.length);
  orgs.forEach(o => console.log('-', o.name, '| ID:', o.id.slice(0,8)));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
