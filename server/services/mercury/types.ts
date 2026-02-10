/**
 * Mercury Bridge — Type Definitions
 * 
 * Central type definitions for the Mercury notification system.
 */

// ─── Mercury Configuration ──────────────────────────────────────────────────

export const MERCURY_DEFAULTS = {
  fromEmail: 'mercury@pivotal-b2b.com',
  fromName: 'Pivotal B2B',
  replyTo: undefined as string | undefined,
  maxRetries: 3,
  batchSize: 50,
  batchDelayMs: 2000,
  inviteExpiryDays: 7,
} as const;

export const MERCURY_COMPANY_FOOTER = `
<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
  <p style="margin: 4px 0;">Pivotal B2B &mdash; DemandGentic.ai Platform</p>
  <p style="margin: 4px 0;">This is an automated notification. Please do not reply directly to this email.</p>
  <p style="margin: 4px 0;"><a href="{{unsubscribeUrl}}" style="color: #3b82f6; text-decoration: underline;">Manage notification preferences</a></p>
</div>
`;

// ─── Notification Event Types ────────────────────────────────────────────────

export type MercuryEventType =
  | 'client_invite'
  | 'project_request_approved'
  | 'project_request_rejected'
  | 'campaign_launched'
  | 'leads_delivered'
  | 'test_notification'
  | 'welcome_client'
  | 'password_reset_client'
  | string; // extensible

// ─── Recipient Resolver Types ────────────────────────────────────────────────

export type RecipientResolverType =
  | 'requester'       // the user who triggered the original action
  | 'tenant_admins'   // all client users for the tenant
  | 'all_tenant_users'// all active users in the tenant
  | 'custom';         // explicit list provided in rule

// ─── Email Send Request ──────────────────────────────────────────────────────

export interface MercurySendRequest {
  to: string;
  toName?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface MercurySendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  outboxId?: string;
}

// ─── Template Rendering ──────────────────────────────────────────────────────

export interface TemplateRenderRequest {
  templateKey: string;
  variables: Record<string, string>;
  includeFooter?: boolean;
}

export interface TemplateRenderResult {
  subject: string;
  html: string;
  text?: string;
}

// ─── Bulk Invitation ─────────────────────────────────────────────────────────

export interface InvitationCandidate {
  clientUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  clientAccountId: string;
  clientAccountName: string;
  alreadyInvited: boolean;
  inviteExpired: boolean;
  reason?: string;
}

export interface BulkInviteDryRunResult {
  eligibleCount: number;
  skippedCount: number;
  eligible: InvitationCandidate[];
  skipped: InvitationCandidate[];
  templatePreview: TemplateRenderResult;
}

export interface BulkInviteResult {
  totalQueued: number;
  totalSkipped: number;
  batchCount: number;
  jobId: string;
}

// ─── Notification Dispatch ───────────────────────────────────────────────────

export interface NotificationDispatchRequest {
  eventType: MercuryEventType;
  tenantId?: string;
  actorUserId?: string;
  payload: Record<string, any>;
}

export interface NotificationDispatchResult {
  eventId: string;
  emailsQueued: number;
  errors: string[];
}

// ─── SMTP Status ─────────────────────────────────────────────────────────────

export interface SmtpConnectionStatus {
  configured: boolean;
  verified: boolean;
  providerName?: string;
  fromEmail: string;
  lastVerifiedAt?: Date;
  error?: string;
}
