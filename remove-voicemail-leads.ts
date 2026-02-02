/**
 * Remove leads with voicemail-related keywords in notes
 */

import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log('=== REMOVING LEADS WITH VOICEMAIL KEYWORDS ===\n');
  
  // First, show what we're about to delete
  const toDelete = await db.execute(sql`
    SELECT 
      id,
      contact_name,
      company_name,
      qa_status,
      call_duration,
      LEFT(notes, 60) as notes_preview
    FROM leads
    WHERE call_attempt_id IS NULL 
      AND deleted_at IS NULL
      AND (
        LOWER(notes) LIKE '%voicemail%' OR
        LOWER(notes) LIKE '%no answer%' OR
        LOWER(notes) LIKE '%left message%' OR
        LOWER(notes) LIKE '%vm%'
      )
    ORDER BY created_at DESC
  `);
  
  console.log('Found', toDelete.rows?.length || 0, 'leads to soft-delete:\n');
  
  // Show breakdown by QA status
  const byStatus: Record<string, number> = {};
  (toDelete.rows || []).forEach((r: any) => {
    byStatus[r.qa_status] = (byStatus[r.qa_status] || 0) + 1;
  });
  console.log('By QA Status:');
  Object.entries(byStatus).forEach(([k, v]) => console.log('  ', k, ':', v));
  
  console.log('\nSample (first 10):');
  (toDelete.rows || []).slice(0, 10).forEach((r: any) => {
    console.log('  -', r.id?.slice(0,8), '|', (r.contact_name || 'N/A').slice(0,20), '|', r.qa_status, '|', (r.notes_preview || '').slice(0,40));
  });
  
  // Perform the soft delete
  console.log('\n⚠️  SOFT-DELETING...');
  
  const result = await db.execute(sql`
    UPDATE leads 
    SET 
      deleted_at = NOW(),
      notes = COALESCE(notes, '') || ' | SOFT-DELETED: Voicemail-related keywords detected (cleanup script)'
    WHERE call_attempt_id IS NULL 
      AND deleted_at IS NULL
      AND (
        LOWER(notes) LIKE '%voicemail%' OR
        LOWER(notes) LIKE '%no answer%' OR
        LOWER(notes) LIKE '%left message%' OR
        LOWER(notes) LIKE '%vm%'
      )
    RETURNING id
  `);
  
  console.log('\n✅ Soft-deleted', result.rows?.length || 0, 'leads');
  
  // Verify
  const remaining = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM leads
    WHERE call_attempt_id IS NULL 
      AND deleted_at IS NULL
      AND (
        LOWER(notes) LIKE '%voicemail%' OR
        LOWER(notes) LIKE '%no answer%' OR
        LOWER(notes) LIKE '%left message%' OR
        LOWER(notes) LIKE '%vm%'
      )
  `);
  console.log('Remaining voicemail leads:', (remaining.rows?.[0] as any)?.count || 0);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
