/**
 * Verification Schema Initialization
 * 
 * Ensures verification campaign schema has all required columns
 * Handles schema evolution across environments (dev, staging, prod)
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * Initialize or update verification campaigns schema
 * 
 * Adds workflow_triggered_at column if it doesn't exist
 * Safe to run multiple times (uses IF NOT EXISTS)
 */
export async function initializeVerificationCampaignSchema(): Promise {
  console.log('[VerificationSchema] Checking schema...');
  
  try {
    // Add workflow_triggered_at column if it doesn't exist
    await db.execute(sql`
      ALTER TABLE verification_campaigns 
      ADD COLUMN IF NOT EXISTS workflow_triggered_at TIMESTAMP;
    `);
    
    console.log('[VerificationSchema] ✅ Schema initialized successfully');
  } catch (error) {
    console.error('[VerificationSchema] ❌ Schema initialization failed:', error);
    throw error;
  }
}