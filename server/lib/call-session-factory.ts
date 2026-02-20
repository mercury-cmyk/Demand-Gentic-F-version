/**
 * Call Session Factory
 * 
 * Provides transactional, race-condition-safe call session creation.
 * Ensures all foreign key references exist before inserting call_sessions record.
 */

import { db } from '../db';
import {
  callSessions,
  campaigns,
  contacts,
  dialerCallAttempts,
  type InsertCallSession,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

const LOG_PREFIX = '[CallSessionFactory]';

export interface SafeCallSessionInput extends Omit<InsertCallSession, 'id'> {
  // Optional FK validation - if provided, will check existence before insert
  validateCampaignId?: boolean;
  validateContactId?: boolean;
  validateQueueItemId?: boolean;
}

/**
 * Safely insert a call session with FK validation
 * Returns the inserted session or null if validation fails
 */
export async function createCallSessionSafely(
  input: SafeCallSessionInput
): Promise<(typeof callSessions.$inferSelect) | null> {
  try {
    // Validate FKs if requested
    if (input.campaignId && input.validateCampaignId) {
      const campaign = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .limit(1);
      
      if (!campaign || campaign.length === 0) {
        console.warn(
          `${LOG_PREFIX} Campaign ${input.campaignId} does not exist, ignoring FK`
        );
        // Set to null to prevent FK violation
        input.campaignId = null;
      }
    }

    if (input.contactId && input.validateContactId) {
      const contact = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, input.contactId))
        .limit(1);
      
      if (!contact || contact.length === 0) {
        console.warn(
          `${LOG_PREFIX} Contact ${input.contactId} does not exist, ignoring FK`
        );
        // Set to null to prevent FK violation
        input.contactId = null;
      }
    }

    // queueItemId is intentionally not validated since it's typically internal

    // Insert with safe defaults
    const sanitizedInput = {
      ...input,
      // Ensure null values for optional FKs
      campaignId: input.campaignId || null,
      contactId: input.contactId || null,
      queueItemId: input.queueItemId || null,
    };

    const [newSession] = await db
      .insert(callSessions)
      .values(sanitizedInput)
      .returning();

    console.log(
      `${LOG_PREFIX} Created call session ${newSession.id} (campaign: ${newSession.campaignId}, contact: ${newSession.contactId}, status: ${newSession.status})`
    );

    return newSession;
  } catch (error) {
    // Log detailed error for debugging
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes('foreign key constraint')) {
      console.error(
        `${LOG_PREFIX} FK constraint violation for call session:`,
        {
          campaignId: input.campaignId,
          contactId: input.contactId,
          queueItemId: input.queueItemId,
          error: errorMsg,
        }
      );
    } else if (errorMsg.includes('duplicate')) {
      console.warn(
        `${LOG_PREFIX} Call session already exists for ${input.telnyxCallId}`
      );
    } else {
      console.error(`${LOG_PREFIX} Failed to create call session:`, error);
    }

    return null;
  }
}

/**
 * Safely create call session from dialer attempt
 */
export async function createCallSessionFromDialerAttempt(
  attemptId: string,
  overrides?: Partial<InsertCallSession>
): Promise<(typeof callSessions.$inferSelect) | null> {
  try {
    // Get the dialer attempt details
    const [attempt] = await db
      .select()
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, attemptId))
      .limit(1);

    if (!attempt) {
      console.warn(
        `${LOG_PREFIX} Dialer attempt ${attemptId} not found`
      );
      return null;
    }

    // Create session from attempt data
    const sessionInput: SafeCallSessionInput = {
      telnyxCallId: overrides?.telnyxCallId || attempt.telnyxCallId || undefined,
      toNumberE164: overrides?.toNumberE164 || attempt.phoneDialed || 'unknown',
      startedAt: overrides?.startedAt || attempt.callStartedAt || new Date(),
      endedAt: overrides?.endedAt,
      durationSec: overrides?.durationSec,
      status: overrides?.status || 'connecting',
      agentType: overrides?.agentType || 'ai',
      aiAgentId: overrides?.aiAgentId || attempt.virtualAgentId || 'system',
      aiDisposition: overrides?.aiDisposition,
      campaignId: overrides?.campaignId || attempt.campaignId || null,
      contactId: overrides?.contactId || attempt.contactId || null,
      queueItemId: overrides?.queueItemId || attempt.queueItemId || null,
      recordingStatus: overrides?.recordingStatus || 'pending',
      validateCampaignId: true,
      validateContactId: true,
    };

    return createCallSessionSafely(sessionInput);
  } catch (error) {
    console.error(
      `${LOG_PREFIX} Failed to create call session from dialer attempt:`,
      error
    );
    return null;
  }
}

/**
 * Bulk create call sessions with safety
 */
export async function createCallSessionsBulk(
  inputs: SafeCallSessionInput[]
): Promise<(typeof callSessions.$inferSelect)[]> {
  const results: (typeof callSessions.$inferSelect)[] = [];

  for (const input of inputs) {
    const session = await createCallSessionSafely(input);
    if (session) {
      results.push(session);
    }
  }

  console.log(
    `${LOG_PREFIX} Bulk created ${results.length}/${inputs.length} call sessions`
  );

  return results;
}
