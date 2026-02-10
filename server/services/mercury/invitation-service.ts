/**
 * Mercury Bridge — Bulk Invitation Service
 * 
 * Handles bulk client portal invitations with:
 * - Eligibility filtering (has email, active, not already invited / invite expired)
 * - Secure one-time-use invitation tokens
 * - Dry run mode (preview recipients + template before sending)
 * - Batched sending with delays to avoid SMTP rate limits
 * - Idempotency (retry-safe, no duplicate sends)
 */

import { db } from '../../db';
import { eq, and, isNull, lt, desc, count, sql } from 'drizzle-orm';
import {
  clientUsers,
  clientAccounts,
  mercuryInvitationTokens,
  mercuryEmailOutbox,
} from '@shared/schema';
import { mercuryEmailService } from './email-service';
import { isFeatureEnabled } from '../../feature-flags';
import {
  MERCURY_DEFAULTS,
  type InvitationCandidate,
  type BulkInviteDryRunResult,
  type BulkInviteResult,
} from './types';
import crypto from 'crypto';

export class BulkInvitationService {
  private readonly INVITE_TEMPLATE_KEY = 'client_invite';

  /**
   * Get all eligible and ineligible invitation candidates.
   */
  async getCandidates(): Promise<{
    eligible: InvitationCandidate[];
    skipped: InvitationCandidate[];
  }> {
    // Fetch all active client users with their account info
    const users = await db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        firstName: clientUsers.firstName,
        lastName: clientUsers.lastName,
        isActive: clientUsers.isActive,
        clientAccountId: clientUsers.clientAccountId,
        accountName: clientAccounts.name,
      })
      .from(clientUsers)
      .leftJoin(clientAccounts, eq(clientUsers.clientAccountId, clientAccounts.id));

    // Fetch existing invitation tokens for all users
    const existingTokens = await db
      .select({
        clientUserId: mercuryInvitationTokens.clientUserId,
        expiresAt: mercuryInvitationTokens.expiresAt,
        usedAt: mercuryInvitationTokens.usedAt,
        createdAt: mercuryInvitationTokens.createdAt,
      })
      .from(mercuryInvitationTokens)
      .orderBy(desc(mercuryInvitationTokens.createdAt));

    // Build token lookup (latest token per user)
    const tokenMap = new Map<string, { expiresAt: Date; usedAt: Date | null; createdAt: Date }>();
    for (const token of existingTokens) {
      if (!tokenMap.has(token.clientUserId)) {
        tokenMap.set(token.clientUserId, {
          expiresAt: token.expiresAt,
          usedAt: token.usedAt,
          createdAt: token.createdAt,
        });
      }
    }

    const now = new Date();
    const eligible: InvitationCandidate[] = [];
    const skipped: InvitationCandidate[] = [];

    for (const user of users) {
      const existingToken = tokenMap.get(user.id);
      const alreadyInvited = !!existingToken;
      const inviteExpired = existingToken ? new Date(existingToken.expiresAt) < now : false;
      const inviteUsed = existingToken ? !!existingToken.usedAt : false;

      const candidate: InvitationCandidate = {
        clientUserId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        clientAccountId: user.clientAccountId,
        clientAccountName: user.accountName || 'Unknown',
        alreadyInvited,
        inviteExpired,
      };

      // Eligibility rules
      if (!user.email) {
        candidate.reason = 'No email address';
        skipped.push(candidate);
      } else if (!user.isActive) {
        candidate.reason = 'User is inactive';
        skipped.push(candidate);
      } else if (alreadyInvited && !inviteExpired && !inviteUsed) {
        candidate.reason = 'Active invitation pending';
        skipped.push(candidate);
      } else {
        // Eligible: never invited, invite expired, or invite already used (re-invite)
        if (inviteExpired) candidate.reason = 'Previous invite expired — will re-invite';
        if (inviteUsed) candidate.reason = 'Previous invite used — will re-invite';
        eligible.push(candidate);
      }
    }

    return { eligible, skipped };
  }

  /**
   * Dry run — preview what a bulk invite would do.
   * No emails are sent. Returns eligible recipients + template preview.
   */
  async dryRun(): Promise<BulkInviteDryRunResult> {
    const { eligible, skipped } = await this.getCandidates();

    // Get template preview
    const preview = await mercuryEmailService.previewTemplate(this.INVITE_TEMPLATE_KEY);
    const templatePreview = preview?.rendered || {
      subject: '[Template not found: client_invite]',
      html: '<p>Template "client_invite" needs to be created.</p>',
    };

    return {
      eligibleCount: eligible.length,
      skippedCount: skipped.length,
      eligible,
      skipped,
      templatePreview,
    };
  }

  /**
   * Execute bulk invitations.
   * 
   * For each eligible user:
   * 1. Generate a secure invitation token
   * 2. Render the client_invite template with user-specific variables
   * 3. Queue the email via Mercury outbox with idempotency key
   * 
   * Batching is handled by the outbox processor.
   */
  async sendBulkInvitations(params: {
    adminUserId: string;
    portalBaseUrl: string;
  }): Promise<BulkInviteResult> {
    if (!isFeatureEnabled('bulk_invites_enabled')) {
      throw new Error('Bulk invitations are disabled (bulk_invites_enabled flag is OFF)');
    }

    if (!isFeatureEnabled('smtp_email_enabled')) {
      throw new Error('SMTP email sending is disabled (smtp_email_enabled flag is OFF)');
    }

    const { eligible } = await this.getCandidates();

    if (eligible.length === 0) {
      return { totalQueued: 0, totalSkipped: 0, batchCount: 0, jobId: '' };
    }

    const jobId = `bulk_invite_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let totalQueued = 0;
    let totalSkipped = 0;
    const batchSize = MERCURY_DEFAULTS.batchSize;
    let batchCount = 0;

    for (let i = 0; i < eligible.length; i += batchSize) {
      const batch = eligible.slice(i, i + batchSize);
      batchCount++;

      for (const candidate of batch) {
        try {
          // Generate invitation token
          const token = mercuryEmailService.generateInviteToken();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + MERCURY_DEFAULTS.inviteExpiryDays);

          // Build invitation link
          const inviteLink = `${params.portalBaseUrl}/client-portal/accept-invite?token=${token}`;

          // Render template
          const rendered = await mercuryEmailService.renderTemplate(this.INVITE_TEMPLATE_KEY, {
            firstName: candidate.firstName || 'there',
            lastName: candidate.lastName || '',
            email: candidate.email,
            companyName: candidate.clientAccountName,
            inviteLink,
            expiryDays: MERCURY_DEFAULTS.inviteExpiryDays.toString(),
            portalUrl: params.portalBaseUrl,
          });

          if (!rendered) {
            console.error(`[Mercury/Invite] Template "${this.INVITE_TEMPLATE_KEY}" not found`);
            totalSkipped++;
            continue;
          }

          // Idempotency key: per-job + per-user — ensures retries don't duplicate
          const idempotencyKey = `invite_${jobId}_${candidate.clientUserId}`;

          // Queue email
          const { outboxId, skipped } = await mercuryEmailService.queueEmail({
            templateKey: this.INVITE_TEMPLATE_KEY,
            recipientEmail: candidate.email,
            recipientName: [candidate.firstName, candidate.lastName].filter(Boolean).join(' ') || undefined,
            recipientUserId: candidate.clientUserId,
            recipientUserType: 'client',
            tenantId: candidate.clientAccountId,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            idempotencyKey,
            metadata: {
              jobId,
              inviteToken: token,
              batchNumber: batchCount,
            },
          });

          if (skipped) {
            totalSkipped++;
            continue;
          }

          // Save invitation token
          await db.insert(mercuryInvitationTokens).values({
            clientUserId: candidate.clientUserId,
            clientAccountId: candidate.clientAccountId,
            token,
            expiresAt,
            emailOutboxId: outboxId,
          });

          totalQueued++;
        } catch (err: any) {
          console.error(`[Mercury/Invite] Error for ${candidate.email}: ${err.message}`);
          totalSkipped++;
        }
      }

      // Delay between batches
      if (i + batchSize < eligible.length) {
        await new Promise(resolve => setTimeout(resolve, MERCURY_DEFAULTS.batchDelayMs));
      }
    }

    console.log(`[Mercury/Invite] Bulk invite complete: jobId=${jobId}, queued=${totalQueued}, skipped=${totalSkipped}`);

    // Trigger outbox processing (async, non-blocking)
    mercuryEmailService.processOutbox().catch(err => {
      console.error('[Mercury/Invite] Outbox processing error:', err.message);
    });

    return {
      totalQueued,
      totalSkipped,
      batchCount,
      jobId,
    };
  }

  /**
   * Get invitation status summary.
   */
  async getInvitationStatus(jobId?: string): Promise<{
    queued: number;
    sending: number;
    sent: number;
    failed: number;
    total: number;
  }> {
    const templateCondition = eq(mercuryEmailOutbox.templateKey, this.INVITE_TEMPLATE_KEY);

    const statuses = await db
      .select({
        status: mercuryEmailOutbox.status,
        count: count(),
      })
      .from(mercuryEmailOutbox)
      .where(templateCondition)
      .groupBy(mercuryEmailOutbox.status);

    const counts = { queued: 0, sending: 0, sent: 0, failed: 0, total: 0 };
    for (const row of statuses) {
      const key = row.status as keyof typeof counts;
      if (key in counts) {
        counts[key] = Number(row.count);
      }
      counts.total += Number(row.count);
    }
    return counts;
  }

  /**
   * Validate an invitation token.
   * Returns the token record if valid, null if invalid/expired/used.
   */
  async validateToken(token: string): Promise<{
    valid: boolean;
    clientUserId?: string;
    clientAccountId?: string;
    reason?: string;
  }> {
    const [record] = await db
      .select()
      .from(mercuryInvitationTokens)
      .where(eq(mercuryInvitationTokens.token, token))
      .limit(1);

    if (!record) return { valid: false, reason: 'Token not found' };
    if (record.usedAt) return { valid: false, reason: 'Token already used' };
    if (new Date(record.expiresAt) < new Date()) return { valid: false, reason: 'Token expired' };

    return {
      valid: true,
      clientUserId: record.clientUserId,
      clientAccountId: record.clientAccountId,
    };
  }

  /**
   * Mark an invitation token as used.
   */
  async markTokenUsed(token: string): Promise<void> {
    await db.update(mercuryInvitationTokens).set({
      usedAt: new Date(),
    }).where(eq(mercuryInvitationTokens.token, token));
  }
}

// Singleton
export const bulkInvitationService = new BulkInvitationService();
