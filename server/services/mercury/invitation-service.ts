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
import { eq, and, isNull, lt, desc, count, sql, inArray, or } from 'drizzle-orm';
import {
  clientUsers,
  clientAccounts,
  mercuryInvitationTokens,
  mercuryEmailOutbox,
  passwordResetTokens,
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
  private invitationSchemaInitPromise: Promise<void> | null = null;

  private async createClientPasswordResetLink(params: {
    clientUserId: string;
    email: string;
    portalBaseUrl: string;
  }): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MERCURY_DEFAULTS.inviteExpiryDays);

    await db.insert(passwordResetTokens).values({
      token,
      userId: null,
      clientUserId: params.clientUserId,
      email: params.email.toLowerCase(),
      userType: 'client',
      expiresAt,
    });

    return `${params.portalBaseUrl}/reset-password?token=${token}&type=client`;
  }

  private async ensureInvitationTokenSchema(): Promise<void> {
    if (!this.invitationSchemaInitPromise) {
      this.invitationSchemaInitPromise = (async () => {
        await db.execute(sql`
          ALTER TABLE mercury_invitation_tokens
            ADD COLUMN IF NOT EXISTS token_hash varchar,
            ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
            ADD COLUMN IF NOT EXISTS revoked_by varchar,
            ADD COLUMN IF NOT EXISTS replaced_by_token_id varchar;
        `);

        await db.execute(sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'mercury_invite_revoked_by_fkey'
            ) THEN
              ALTER TABLE mercury_invitation_tokens
                ADD CONSTRAINT mercury_invite_revoked_by_fkey
                FOREIGN KEY (revoked_by)
                REFERENCES users(id)
                ON DELETE SET NULL;
            END IF;
          END $$;
        `);

        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS mercury_invite_token_hash_idx
            ON mercury_invitation_tokens(token_hash)
            WHERE token_hash IS NOT NULL;
        `);

        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS mercury_invite_revoked_idx
            ON mercury_invitation_tokens(revoked_at);
        `);
      })().catch((error) => {
        this.invitationSchemaInitPromise = null;
        throw error;
      });
    }

    await this.invitationSchemaInitPromise;
  }

  private hashInviteToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private tokenLookupClause(token: string) {
    const tokenHash = this.hashInviteToken(token);
    return or(
      eq(mercuryInvitationTokens.tokenHash, tokenHash),
      eq(mercuryInvitationTokens.token, token), // Backward compatibility for legacy tokens
    );
  }

  /**
   * Get all eligible and ineligible invitation candidates.
   */
  async getCandidates(): Promise<{
    eligible: InvitationCandidate[];
    skipped: InvitationCandidate[];
  }> {
    await this.ensureInvitationTokenSchema();

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
        id: mercuryInvitationTokens.id,
        clientUserId: mercuryInvitationTokens.clientUserId,
        expiresAt: mercuryInvitationTokens.expiresAt,
        usedAt: mercuryInvitationTokens.usedAt,
        revokedAt: mercuryInvitationTokens.revokedAt,
        createdAt: mercuryInvitationTokens.createdAt,
      })
      .from(mercuryInvitationTokens)
      .orderBy(desc(mercuryInvitationTokens.createdAt));

    // Build token lookup (latest token per user)
    const tokenMap = new Map<string, { expiresAt: Date; usedAt: Date | null; revokedAt: Date | null; createdAt: Date }>();
    for (const token of existingTokens) {
      if (!tokenMap.has(token.clientUserId)) {
        tokenMap.set(token.clientUserId, {
          expiresAt: token.expiresAt,
          usedAt: token.usedAt,
          revokedAt: token.revokedAt,
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
      const inviteRevoked = existingToken ? !!existingToken.revokedAt : false;

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
      } else if (alreadyInvited && !inviteExpired && !inviteUsed && !inviteRevoked) {
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
          const tokenHash = this.hashInviteToken(token);
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + MERCURY_DEFAULTS.inviteExpiryDays);

          // Build password reset link for existing client users
          const resetLink = await this.createClientPasswordResetLink({
            clientUserId: candidate.clientUserId,
            email: candidate.email,
            portalBaseUrl: params.portalBaseUrl,
          });

          // Render template
          const rendered = await mercuryEmailService.renderTemplate(this.INVITE_TEMPLATE_KEY, {
            firstName: candidate.firstName || 'there',
            lastName: candidate.lastName || '',
            email: candidate.email,
            companyName: candidate.clientAccountName,
            inviteLink: resetLink, // Backward compatibility with existing template variable name
            resetLink,
            expiryDays: MERCURY_DEFAULTS.inviteExpiryDays.toString(),
            portalUrl: params.portalBaseUrl,
          });

          if (!rendered) {
            console.error(`[Mercury/Invite] Template "${this.INVITE_TEMPLATE_KEY}" not found`);
            totalSkipped++;
            continue;
          }

          // Idempotency key: per-user — prevents duplicate invites across jobs
          const idempotencyKey = `invite_client_${candidate.clientUserId}`;

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
            tokenHash,
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
    errorCode?: string;
  }> {
    await this.ensureInvitationTokenSchema();

    const [record] = await db
      .select()
      .from(mercuryInvitationTokens)
      .where(this.tokenLookupClause(token))
      .limit(1);

    if (!record) {
      console.warn(`[Mercury/Invite] Token not found in DB (first 8 chars: ${token.slice(0, 8)}...)`);
      return { valid: false, reason: 'This invitation link is not recognized. It may have been replaced by a newer invitation — please check for the most recent email from us.', errorCode: 'TOKEN_NOT_FOUND' };
    }
    if (record.usedAt) {
      console.info(`[Mercury/Invite] Token already used (userId: ${record.clientUserId}, usedAt: ${record.usedAt})`);
      return { valid: false, reason: 'This invitation has already been accepted. You can log in with the password you created during setup.', errorCode: 'TOKEN_USED' };
    }
    if (record.revokedAt) {
      console.info(`[Mercury/Invite] Token revoked (userId: ${record.clientUserId}, revokedAt: ${record.revokedAt})`);
      return { valid: false, reason: 'This invitation link has been revoked and replaced. Please use the most recent invitation email.', errorCode: 'TOKEN_REVOKED' };
    }
    if (new Date(record.expiresAt) < new Date()) {
      console.info(`[Mercury/Invite] Token expired (userId: ${record.clientUserId}, expiredAt: ${record.expiresAt})`);
      return { valid: false, reason: 'This invitation has expired. Please contact your administrator to send a new invitation.', errorCode: 'TOKEN_EXPIRED' };
    }

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
    await this.ensureInvitationTokenSchema();

    await db.update(mercuryInvitationTokens).set({
      usedAt: new Date(),
    }).where(
      and(
        this.tokenLookupClause(token),
        isNull(mercuryInvitationTokens.usedAt),
        isNull(mercuryInvitationTokens.revokedAt),
      )
    );
  }

  /**
   * Send a single invitation email to a specific client user.
   * Reuses the same logic as bulk invitations but for one recipient.
   */
  async sendSingleInvitation(params: {
    clientUserId: string;
    adminUserId: string;
    portalBaseUrl: string;
    forceResend?: boolean;
  }): Promise<{ success: boolean; token?: string; error?: string }> {
    await this.ensureInvitationTokenSchema();

    if (!isFeatureEnabled('smtp_email_enabled')) {
      return { success: false, error: 'SMTP email sending is disabled (smtp_email_enabled flag is OFF)' };
    }

    // Look up client user and account
    const [user] = await db
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
      .leftJoin(clientAccounts, eq(clientUsers.clientAccountId, clientAccounts.id))
      .where(eq(clientUsers.id, params.clientUserId))
      .limit(1);

    if (!user) return { success: false, error: 'Client user not found' };
    if (!user.email) return { success: false, error: 'Client user has no email address' };
    if (!user.isActive) return { success: false, error: 'Client user is inactive' };

    // Guard: check for existing active (non-expired, non-used) invitation token
    const activePendingTokens = await db
      .select({ id: mercuryInvitationTokens.id, expiresAt: mercuryInvitationTokens.expiresAt })
      .from(mercuryInvitationTokens)
      .where(
        and(
          eq(mercuryInvitationTokens.clientUserId, params.clientUserId),
          isNull(mercuryInvitationTokens.usedAt),
          isNull(mercuryInvitationTokens.revokedAt),
        )
      )
      .orderBy(desc(mercuryInvitationTokens.createdAt))
      .limit(10);

    const validActiveTokenIds = activePendingTokens
      .filter((token) => new Date(token.expiresAt) > new Date())
      .map((token) => token.id);

    if (!params.forceResend && validActiveTokenIds.length > 0) {
      return { success: false, error: 'This user already has an active pending invitation. Please wait for it to expire or be used before sending a new one.' };
    }

    if (params.forceResend && validActiveTokenIds.length > 0) {
      await db
        .update(mercuryInvitationTokens)
        .set({
          revokedAt: new Date(),
          revokedBy: params.adminUserId,
        })
        .where(inArray(mercuryInvitationTokens.id, validActiveTokenIds));
    }

    try {
      // Generate invitation token
      const token = mercuryEmailService.generateInviteToken();
      const tokenHash = this.hashInviteToken(token);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + MERCURY_DEFAULTS.inviteExpiryDays);

      // Build password reset link for existing client users
      const resetLink = await this.createClientPasswordResetLink({
        clientUserId: user.id,
        email: user.email,
        portalBaseUrl: params.portalBaseUrl,
      });

      // Render template
      const rendered = await mercuryEmailService.renderTemplate(this.INVITE_TEMPLATE_KEY, {
        firstName: user.firstName || 'there',
        lastName: user.lastName || '',
        email: user.email,
        companyName: user.accountName || 'Unknown',
        inviteLink: resetLink, // Backward compatibility with existing template variable name
        resetLink,
        expiryDays: MERCURY_DEFAULTS.inviteExpiryDays.toString(),
        portalUrl: params.portalBaseUrl,
      });

      if (!rendered) {
        return { success: false, error: `Template "${this.INVITE_TEMPLATE_KEY}" not found. Run template seeding first.` };
      }

      const jobId = `single_invite_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      // Idempotency key: per-user — prevents duplicate invites across requests
      const idempotencyKey = `invite_client_${user.id}`;

      // Queue email
      const { outboxId, skipped } = await mercuryEmailService.queueEmail({
        templateKey: this.INVITE_TEMPLATE_KEY,
        recipientEmail: user.email,
        recipientName: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        recipientUserId: user.id,
        recipientUserType: 'client',
        tenantId: user.clientAccountId,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey,
        metadata: {
          jobId,
          inviteToken: token,
          singleInvite: true,
        },
      });

      if (skipped) {
        return { success: false, error: 'Email was skipped (duplicate idempotency key)' };
      }

      // Save invitation token
      const [insertedToken] = await db.insert(mercuryInvitationTokens).values({
        clientUserId: user.id,
        clientAccountId: user.clientAccountId,
        token,
        tokenHash,
        expiresAt,
        emailOutboxId: outboxId,
      }).returning({ id: mercuryInvitationTokens.id });

      if (params.forceResend && validActiveTokenIds.length > 0 && insertedToken?.id) {
        await db
          .update(mercuryInvitationTokens)
          .set({ replacedByTokenId: insertedToken.id })
          .where(inArray(mercuryInvitationTokens.id, validActiveTokenIds));
      }

      // Trigger outbox processing
      mercuryEmailService.processOutbox().catch(err => {
        console.error('[Mercury/Invite] Outbox processing error:', err.message);
      });

      console.log(`[Mercury/Invite] Single invite queued for ${user.email} (token: ${token.slice(0, 8)}...)`);
      return { success: true, token };
    } catch (err: any) {
      console.error(`[Mercury/Invite] Single invite error for ${user.email}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Resend a single invitation by revoking existing active tokens and issuing a fresh token.
   */
  async resendSingleInvitation(params: {
    clientUserId: string;
    adminUserId: string;
    portalBaseUrl: string;
  }): Promise<{ success: boolean; token?: string; error?: string }> {
    return this.sendSingleInvitation({
      ...params,
      forceResend: true,
    });
  }

  /**
   * Revoke pending invitation(s) for a user or a specific token.
   */
  async revokeInvitations(params: {
    adminUserId: string;
    clientUserId?: string;
    token?: string;
  }): Promise<{ success: boolean; revokedCount: number; error?: string }> {
    await this.ensureInvitationTokenSchema();

    if (!params.clientUserId && !params.token) {
      return { success: false, revokedCount: 0, error: 'Either clientUserId or token is required' };
    }

    try {
      const now = new Date();
      let revokedCount = 0;

      if (params.token) {
        const result = await db
          .update(mercuryInvitationTokens)
          .set({
            revokedAt: now,
            revokedBy: params.adminUserId,
          })
          .where(
            and(
              this.tokenLookupClause(params.token),
              isNull(mercuryInvitationTokens.usedAt),
              isNull(mercuryInvitationTokens.revokedAt),
            )
          )
          .returning({ id: mercuryInvitationTokens.id });
        revokedCount = result.length;
      } else if (params.clientUserId) {
        const result = await db
          .update(mercuryInvitationTokens)
          .set({
            revokedAt: now,
            revokedBy: params.adminUserId,
          })
          .where(
            and(
              eq(mercuryInvitationTokens.clientUserId, params.clientUserId),
              isNull(mercuryInvitationTokens.usedAt),
              isNull(mercuryInvitationTokens.revokedAt),
            )
          )
          .returning({ id: mercuryInvitationTokens.id });
        revokedCount = result.length;
      }

      return { success: true, revokedCount };
    } catch (err: any) {
      return { success: false, revokedCount: 0, error: err.message };
    }
  }

  /**
   * Preview what an invitation email would look like for a specific client user.
   * Does not send anything or generate real tokens.
   */
  async previewInvitationEmail(params: {
    clientUserId: string;
    portalBaseUrl: string;
  }): Promise<{ subject: string; html: string; text?: string } | null> {
    // Look up client user and account
    const [user] = await db
      .select({
        id: clientUsers.id,
        email: clientUsers.email,
        firstName: clientUsers.firstName,
        lastName: clientUsers.lastName,
        clientAccountId: clientUsers.clientAccountId,
        accountName: clientAccounts.name,
      })
      .from(clientUsers)
      .leftJoin(clientAccounts, eq(clientUsers.clientAccountId, clientAccounts.id))
      .where(eq(clientUsers.id, params.clientUserId))
      .limit(1);

    if (!user) return null;

    const sampleLink = `${params.portalBaseUrl}/reset-password?token=PREVIEW_TOKEN&type=client`;

    const rendered = await mercuryEmailService.renderTemplate(this.INVITE_TEMPLATE_KEY, {
      firstName: user.firstName || 'there',
      lastName: user.lastName || '',
      email: user.email,
      companyName: user.accountName || 'Unknown',
      inviteLink: sampleLink,
      resetLink: sampleLink,
      expiryDays: MERCURY_DEFAULTS.inviteExpiryDays.toString(),
      portalUrl: params.portalBaseUrl,
    });

    if (!rendered) return null;

    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    };
  }
}

// Singleton
export const bulkInvitationService = new BulkInvitationService();
