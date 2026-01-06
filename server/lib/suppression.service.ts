import { db } from "../db";
import { contacts, suppressionList, accounts } from "@shared/schema";
import { sql, eq, inArray, and, or, isNull } from "drizzle-orm";
import * as crypto from "crypto";

/**
 * STRICT SUPPRESSION RULES - Only suppress when ONE of these matches:
 * 1. Email matches (exact, case-insensitive)
 * 2. CAV ID matches (exact)
 * 3. CAV User ID matches (exact)
 * 4. BOTH Full Name AND Company match (together - requires all fields non-empty)
 * 
 * EXPLICITLY FORBIDDEN:
 * - First name only
 * - Last name only
 * - Company only
 * - Full name only (without company)
 */

/**
 * Normalize text: lowercase, trim, collapse whitespace
 */
export function normalizeText(text?: string | null): string | null {
  if (!text) return null;
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Compute SHA256 hash for full name + company combination
 * Uses "|" separator to prevent collisions
 * Returns hex string for compatibility with PostgreSQL ENCODE(DIGEST(...), 'hex')
 */
export function computeNameCompanyHash(
  fullNameNorm: string | null,
  companyNorm: string | null
): string | null {
  // CRITICAL: Both fields must be non-empty
  if (!fullNameNorm || !companyNorm) {
    return null;
  }
  
  // Normalize inputs
  const name = fullNameNorm.toLowerCase().trim();
  const company = companyNorm.toLowerCase().trim();
  
  if (!name || !company) {
    return null;
  }
  
  // Use separator to prevent collision: "John Smith|Acme" vs "John|Smith Acme"
  const hashInput = `${name}|${company}`;
  
  // SHA256 hex digest (matches PostgreSQL)
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Check suppression reason for a single contact
 * Returns the reason if suppressed, null otherwise
 */
export async function getSuppressionReason(
  contactId: string
): Promise<string | null> {
  const result = await db.execute(sql`
    WITH contact_data AS (
      SELECT 
        c.id,
        LOWER(TRIM(c.email)) AS email_norm,
        c.cav_id,
        c.cav_user_id,
        c.full_name_norm,
        c.company_norm,
        c.name_company_hash
      FROM contacts c
      WHERE c.id = ${contactId}
        AND c.deleted_at IS NULL
    )
    SELECT
      CASE
        -- Rule 1: Email exact match (case-insensitive)
        WHEN EXISTS (
          SELECT 1 FROM suppression_list s
          WHERE s.email_norm = contact_data.email_norm
            AND contact_data.email_norm IS NOT NULL
            AND contact_data.email_norm != ''
        ) THEN 'email'
        
        -- Rule 2: CAV ID exact match
        WHEN EXISTS (
          SELECT 1 FROM suppression_list s
          WHERE s.cav_id = contact_data.cav_id
            AND contact_data.cav_id IS NOT NULL
            AND contact_data.cav_id != ''
        ) THEN 'cav_id'
        
        -- Rule 3: CAV User ID exact match
        WHEN EXISTS (
          SELECT 1 FROM suppression_list s
          WHERE s.cav_user_id = contact_data.cav_user_id
            AND contact_data.cav_user_id IS NOT NULL
            AND contact_data.cav_user_id != ''
        ) THEN 'cav_user_id'
        
        -- Rule 4: Full Name + Company match TOGETHER (both required)
        WHEN (
          contact_data.full_name_norm IS NOT NULL
          AND contact_data.full_name_norm != ''
          AND contact_data.company_norm IS NOT NULL
          AND contact_data.company_norm != ''
          AND contact_data.name_company_hash IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM suppression_list s
            WHERE s.name_company_hash = contact_data.name_company_hash
              AND s.name_company_hash IS NOT NULL
              AND s.name_company_hash != ''
          )
        ) THEN 'full_name+company'
        
        ELSE NULL
      END AS suppression_reason
    FROM contact_data
  `);
  
  const row = result.rows[0] as { suppression_reason: string | null } | undefined;
  return row?.suppression_reason || null;
}

/**
 * Check suppression for multiple contacts
 * Returns a map of contactId -> suppression reason
 */
export async function checkSuppressionBulk(
  contactIds: string[]
): Promise<Map<string, string>> {
  if (contactIds.length === 0) {
    return new Map();
  }
  
  // Process in batches of 500 to avoid parameter limits
  const BATCH_SIZE = 500;
  const suppressionMap = new Map<string, string>();
  
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    
    // Single set-based query using Drizzle ORM's safe parameter binding
    // This joins contacts with suppression_list to check all rules efficiently
    const results = await db.execute(sql`
      SELECT
        c.id,
        CASE
          -- Rule 1: Email exact match (case-insensitive)
          WHEN EXISTS (
            SELECT 1 FROM ${suppressionList} s
            WHERE s.email_norm = LOWER(TRIM(c.email))
              AND LOWER(TRIM(c.email)) IS NOT NULL
              AND LOWER(TRIM(c.email)) != ''
          ) THEN 'email'
          
          -- Rule 2: CAV ID exact match
          WHEN EXISTS (
            SELECT 1 FROM ${suppressionList} s
            WHERE s.cav_id = c.cav_id
              AND c.cav_id IS NOT NULL
              AND c.cav_id != ''
          ) THEN 'cav_id'
          
          -- Rule 3: CAV User ID exact match
          WHEN EXISTS (
            SELECT 1 FROM ${suppressionList} s
            WHERE s.cav_user_id = c.cav_user_id
              AND c.cav_user_id IS NOT NULL
              AND c.cav_user_id != ''
          ) THEN 'cav_user_id'
          
          -- Rule 4: Full Name + Company match TOGETHER (both required)
          WHEN (
            c.full_name_norm IS NOT NULL
            AND c.full_name_norm != ''
            AND c.company_norm IS NOT NULL
            AND c.company_norm != ''
            AND c.name_company_hash IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM ${suppressionList} s
              WHERE s.name_company_hash = c.name_company_hash
                AND s.name_company_hash IS NOT NULL
                AND s.name_company_hash != ''
            )
          ) THEN 'full_name+company'
          
          ELSE NULL
        END AS suppression_reason
      FROM ${contacts} c
      WHERE c.id IN ${batch}
        AND c.deleted_at IS NULL
    `);
    
    for (const row of results.rows as Array<{ id: string; suppression_reason: string | null }>) {
      if (row.suppression_reason) {
        suppressionMap.set(row.id, row.suppression_reason);
      }
    }
  }
  
  return suppressionMap;
}

/**
 * Add entries to suppression list
 * Computes normalized fields and hash for name+company matching
 */
export async function addToSuppressionList(
  entries: Array<{
    email?: string;
    fullName?: string;
    companyName?: string;
    cavId?: string;
    cavUserId?: string;
    reason?: string;
    source?: string;
  }>
): Promise<number> {
  if (entries.length === 0) return 0;
  
  const values = entries.map(entry => {
    // Rule 1: Email normalization (lowercase, trim)
    const emailNorm = entry.email ? normalizeText(entry.email) : null;
    
    // Rules 2 & 3: CAV IDs (exact match, just trim)
    const cavId = entry.cavId?.trim() || null;
    const cavUserId = entry.cavUserId?.trim() || null;
    
    // Normalize full name and company
    const fullNameNorm = entry.fullName ? normalizeText(entry.fullName) : null;
    const companyNorm = entry.companyName ? normalizeText(entry.companyName) : null;
    
    // Rule 4: Name+Company hash
    // CRITICAL: Only compute hash when BOTH fields are present
    // This prevents company-only or name-only false positives
    const nameCompanyHash = computeNameCompanyHash(fullNameNorm, companyNorm);
    
    return {
      email: entry.email || null,
      emailNorm,
      fullName: entry.fullName || null,
      fullNameNorm,
      companyName: entry.companyName || null,
      companyNorm,
      nameCompanyHash,
      cavId,
      cavUserId,
      reason: entry.reason || null,
      source: entry.source || null,
    };
  });
  
  const result = await db.insert(suppressionList).values(values).returning();
  return result.length;
}

/**
 * Remove entries from suppression list by ID
 */
export async function removeFromSuppressionList(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  
  const result = await db
    .delete(suppressionList)
    .where(inArray(suppressionList.id, ids))
    .returning();
    
  return result.length;
}

/**
 * Get all suppression list entries
 */
export async function getSuppressionList(options?: {
  limit?: number;
  offset?: number;
}): Promise<{ data: any[]; total: number }> {
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  
  const data = await db
    .select()
    .from(suppressionList)
    .orderBy(suppressionList.createdAt)
    .limit(limit)
    .offset(offset);
  
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(suppressionList);
  
  return { data, total: count };
}
