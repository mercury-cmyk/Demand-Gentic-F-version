/**
 * Migration: Legacy Email Validation Status Mapping
 * 
 * This migration safely remaps legacy statuses to the new 10-status system.
 * 
 * Legacy Mapping:
 * - ok → safe_to_send (high quality, was externally verified)
 * - invalid → invalid (unchanged)
 * - risky → risky (unchanged)
 * - accept_all → accept_all (unchanged)
 * - disposable → disposable (unchanged)
 * - unknown → unknown (unchanged)
 * 
 * Run this to ensure backwards compatibility with legacy data.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export async function migrateEmailValidationStatuses() {
  console.log('[MIGRATION] Starting email validation status migration...');
  
  try {
    // Count records needing migration
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM verification_email_validations 
      WHERE status = 'ok'
    `);
    
    const legacyCount = Number(countResult.rows[0]?.count || 0);
    console.log(`[MIGRATION] Found ${legacyCount} records with legacy 'ok' status`);
    
    if (legacyCount === 0) {
      console.log('[MIGRATION] No legacy statuses found - migration complete');
      return { success: true, migrated: 0 };
    }
    
    // Remap 'ok' → 'safe_to_send' (treating legacy 'ok' as highest quality)
    const result = await db.execute(sql`
      UPDATE verification_email_validations
      SET status = 'safe_to_send'
      WHERE status = 'ok'
    `);
    
    const migratedCount = result.rowCount || 0;
    console.log(`[MIGRATION] Successfully migrated ${migratedCount} records from 'ok' to 'safe_to_send'`);
    
    // Verify migration
    const verifyResult = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM verification_email_validations 
      WHERE status = 'ok'
    `);
    
    const remainingLegacy = Number(verifyResult.rows[0]?.count || 0);
    
    if (remainingLegacy > 0) {
      throw new Error(`Migration incomplete: ${remainingLegacy} records still have 'ok' status`);
    }
    
    console.log('[MIGRATION] Email validation status migration complete');
    return { success: true, migrated: migratedCount };
    
  } catch (error) {
    console.error('[MIGRATION] Email validation status migration failed:', error);
    throw error;
  }
}

// Run migration if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  migrateEmailValidationStatuses()
    .then(result => {
      console.log('[MIGRATION] Result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('[MIGRATION] Failed:', error);
      process.exit(1);
    });
}