/**
 * Account Email Deliverability Scoring Service
 * Calculates aggregate email quality metrics at the account level
 */

import { db } from '../db';
import { accounts, contacts } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * Email status weights for deliverability scoring
 * Higher weight = better deliverability
 */
const EMAIL_STATUS_WEIGHTS: Record = {
  'safe_to_send': 100,
  'valid': 95,
  'send_with_caution': 70,
  'risky': 50,
  'accept_all': 60, // Moderate score - uncertain deliverability
  'unknown': 40,
  'invalid': 0,
  'disabled': 0,
  'disposable': 10,
  'spam_trap': 0,
};

export interface EmailDeliverabilityResult {
  score: number;
  totalContacts: number;
  validatedContacts: number;
  statusBreakdown: Record;
  timestamp: Date;
}

/**
 * Calculate email deliverability score for an account
 * Score is weighted average of all associated contacts' email statuses
 * 
 * @param accountId - Account ID to calculate score for
 * @returns EmailDeliverabilityResult with score and breakdown
 */
export async function calculateAccountEmailDeliverability(
  accountId: string
): Promise {
  // Get all non-deleted contacts for this account with emails
  const accountContacts = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      emailStatus: contacts.emailStatus,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.accountId, accountId),
        isNull(contacts.deletedAt)
      )
    );

  const totalContacts = accountContacts.length;
  
  if (totalContacts === 0) {
    return {
      score: 0,
      totalContacts: 0,
      validatedContacts: 0,
      statusBreakdown: {},
      timestamp: new Date(),
    };
  }

  // Count contacts by email status
  const statusBreakdown: Record = {};
  let totalScore = 0;
  let validatedContacts = 0;

  for (const contact of accountContacts) {
    const status = contact.emailStatus || 'unknown';
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    
    const weight = EMAIL_STATUS_WEIGHTS[status] ?? 40; // Default to 'unknown' weight
    totalScore += weight;
    
    if (status !== 'unknown') {
      validatedContacts++;
    }
  }

  // Calculate weighted average score
  const score = Math.round(totalScore / totalContacts);

  return {
    score,
    totalContacts,
    validatedContacts,
    statusBreakdown,
    timestamp: new Date(),
  };
}

/**
 * Update account's email deliverability score in database
 * 
 * @param accountId - Account ID to update
 * @returns Updated score and metadata
 */
export async function updateAccountEmailDeliverabilityScore(
  accountId: string
): Promise {
  console.log(`[Account Email Scoring] Calculating deliverability for account: ${accountId}`);
  
  const result = await calculateAccountEmailDeliverability(accountId);

  // Update account record with new score
  await db
    .update(accounts)
    .set({
      emailDeliverabilityScore: result.score.toString(),
      emailDeliverabilityUpdatedAt: result.timestamp,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));

  console.log(`[Account Email Scoring] Updated account ${accountId} - Score: ${result.score} (${result.validatedContacts}/${result.totalContacts} contacts validated)`);

  return result;
}

/**
 * Batch update email deliverability scores for multiple accounts
 * Useful for bulk operations or scheduled maintenance
 * 
 * @param accountIds - Array of account IDs to update
 * @returns Array of results for each account
 */
export async function batchUpdateAccountEmailScores(
  accountIds: string[]
): Promise {
  console.log(`[Account Email Scoring] Batch updating ${accountIds.length} accounts`);
  
  const results: EmailDeliverabilityResult[] = [];

  for (const accountId of accountIds) {
    try {
      const result = await updateAccountEmailDeliverabilityScore(accountId);
      results.push(result);
    } catch (error) {
      console.error(`[Account Email Scoring] Error updating account ${accountId}:`, error);
      // Continue with next account
    }
  }

  return results;
}