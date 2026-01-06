/**
 * Submission Exclusion System
 * Automatically excludes contacts submitted in the last 2 years from eligibility
 */

import { db } from '../db';
import { verificationContacts, verificationLeadSubmissions } from '@shared/schema';
import { sql, and, eq, gte } from 'drizzle-orm';

export interface ExclusionStats {
  checked: number;
  excluded: number;
  reactivated: number;
}

/**
 * Check and update eligibility for submitted contacts
 * - Contacts submitted < 2 years ago: Mark as Ineligible_Recently_Submitted
 * - Contacts submitted >= 2 years ago: Re-evaluate eligibility
 */
export async function enforceSubmissionExclusion(campaignId: string): Promise<ExclusionStats> {
  console.log(`[SUBMISSION EXCLUSION] Starting 2-year exclusion check for campaign ${campaignId}`);
  
  const stats: ExclusionStats = {
    checked: 0,
    excluded: 0,
    reactivated: 0,
  };
  
  try {
    // TWO YEAR exclusion period
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    // Step 1: Find the MOST RECENT submission for each contact in this campaign
    // CRITICAL: Group by contact to avoid reactivating contacts with ANY recent submission
    const submittedContactsResult = await db.execute(sql`
      SELECT 
        contact_id,
        MAX(created_at) as most_recent_submission
      FROM verification_lead_submissions
      WHERE campaign_id = ${campaignId}
      GROUP BY contact_id
    `);
    
    const submittedContacts = submittedContactsResult.rows as Array<{
      contact_id: string;
      most_recent_submission: Date;
    }>;
    
    stats.checked = submittedContacts.length;
    console.log(`[SUBMISSION EXCLUSION] Found ${stats.checked} unique submitted contacts`);
    
    if (submittedContacts.length === 0) {
      return stats;
    }
    
    // Step 2: Separate based on MOST RECENT submission only
    const recentContactIds: string[] = [];
    const oldContactIds: string[] = [];
    
    for (const contact of submittedContacts) {
      const mostRecentDate = new Date(contact.most_recent_submission);
      if (mostRecentDate >= twoYearsAgo) {
        // Has at least one submission within 2 years - EXCLUDE
        recentContactIds.push(contact.contact_id);
      } else {
        // All submissions are >= 2 years old - REACTIVATE
        oldContactIds.push(contact.contact_id);
      }
    }
    
    // Step 3: Mark recent submissions as Ineligible_Recently_Submitted
    // CRITICAL: Filter by campaign_id to prevent affecting contacts in other campaigns
    if (recentContactIds.length > 0) {
      const excludeResult = await db.execute(sql`
        UPDATE verification_contacts
        SET 
          eligibility_status = 'Ineligible_Recently_Submitted',
          updated_at = NOW()
        WHERE id = ANY(ARRAY[${sql.join(recentContactIds.map(id => sql`${id}`), sql`, `)}])
          AND campaign_id = ${campaignId}
          AND eligibility_status != 'Ineligible_Recently_Submitted'
      `);
      
      stats.excluded = excludeResult.rowCount || 0;
      console.log(`[SUBMISSION EXCLUSION] Excluded ${stats.excluded} recently submitted contacts from campaign ${campaignId}`);
    }
    
    // Step 4: Reactivate old submissions (>= 2 years)
    // Clear Ineligible_Recently_Submitted status so they can be re-evaluated
    if (oldContactIds.length > 0) {
      const reactivateResult = await db.execute(sql`
        UPDATE verification_contacts
        SET 
          eligibility_status = 'Pending_Email_Validation',
          updated_at = NOW()
        WHERE id = ANY(ARRAY[${sql.join(oldContactIds.map(id => sql`${id}`), sql`, `)}])
          AND campaign_id = ${campaignId}
          AND eligibility_status = 'Ineligible_Recently_Submitted'
      `);
      
      stats.reactivated = reactivateResult.rowCount || 0;
      console.log(`[SUBMISSION EXCLUSION] Reactivated ${stats.reactivated} contacts (>= 2 years since submission)`);
      console.log(`[SUBMISSION EXCLUSION] These contacts can now be re-evaluated for eligibility`);
    }
    
    return stats;
  } catch (error) {
    console.error('[SUBMISSION EXCLUSION] Error:', error);
    throw error;
  }
}
