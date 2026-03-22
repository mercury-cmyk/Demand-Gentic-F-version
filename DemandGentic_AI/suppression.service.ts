import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, suppressionList } from "@/db/schema";
import crypto from "crypto";

type SuppressionReason = 'email' | 'cav_id' | 'cav_user_id' | 'full_name+company' | null;

export async function getSuppressionReason(contactId: string): Promise {
  // Fetch normalized fields for the contact
  const [c] = await db.select({
      id: contacts.id,
      emailNorm: contacts.emailNorm,
      cavId: contacts.cavId,
      cavUserId: contacts.cavUserId,
      fullNameNorm: contacts.fullNameNorm,
      companyNorm: contacts.companyNorm,
      nameCompanyHash: contacts.nameCompanyHash
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!c) return null;

  // 1. Email Match (Highest Priority)
  if (c.emailNorm) {
    const [{ exists }] = await db.execute(sql`
      SELECT EXISTS(SELECT 1 FROM suppression_list s WHERE s.email_norm = ${c.emailNorm}) AS exists
    `);
    if (exists) return 'email';
  }

  // 2. CAV ID Match
  if (c.cavId) {
    const [{ exists }] = await db.execute(sql`
      SELECT EXISTS(SELECT 1 FROM suppression_list s WHERE s.cav_id = ${c.cavId}) AS exists
    `);
    if (exists) return 'cav_id';
  }

  // 3. CAV User ID Match
  if (c.cavUserId) {
    const [{ exists }] = await db.execute(sql`
      SELECT EXISTS(SELECT 1 FROM suppression_list s WHERE s.cav_user_id = ${c.cavUserId}) AS exists
    `);
    if (exists) return 'cav_user_id';
  }

  // 4. Full Name + Company Match (Strict: Both must match)
  if (c.fullNameNorm && c.companyNorm) {
    const [{ exists }] = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM suppression_list s
        WHERE (s.full_name_norm = ${c.fullNameNorm} AND s.company_norm = ${c.companyNorm})
           OR (s.name_company_hash = ${c.nameCompanyHash})
      ) AS exists
    `);
    if (exists) return 'full_name+company';
  }

  return null;
}