/**
 * Mercury Bridge — Default Template Definitions
 * 
 * Seed templates that are created on first access if they don't exist.
 * These can be edited by admins via the UI after creation.
 */

import { db } from '../../db';
import { eq } from 'drizzle-orm';
import { mercuryTemplates } from '@shared/schema';

export interface DefaultTemplate {
  templateKey: string;
  name: string;
  description: string;
  category: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  variables: Array<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
    exampleValue?: string;
  }>;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    templateKey: 'client_invite',
    name: 'Client Portal Invitation',
    description: 'Invitation email sent to client users to access the client portal.',
    category: 'invitation',
    subjectTemplate: 'You\'re invited to the {{companyName}} Client Portal',
    htmlTemplate: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to Pivotal B2B</h1>
  </div>
  <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; color: #374151;">Hi {{firstName}},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      You've been invited to access the <strong>{{companyName}}</strong> Client Portal on the Pivotal B2B platform.
      From here you can track your campaigns, review leads, and manage your projects.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{inviteLink}}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block;">
        Accept Invitation
      </a>
    </div>
    <p style="font-size: 13px; color: #6b7280;">
      This invitation link expires in <strong>{{expiryDays}} days</strong>.
      If you didn't expect this email, you can safely ignore it.
    </p>
    {{#if portalUrl}}
    <p style="font-size: 12px; color: #9ca3af; margin-top: 16px;">
      Or copy this link: <a href="{{inviteLink}}" style="color: #3b82f6;">{{inviteLink}}</a>
    </p>
    {{/if}}
  </div>
</div>`,
    textTemplate: `Hi {{firstName}},

You've been invited to access the {{companyName}} Client Portal on Pivotal B2B.

Accept your invitation: {{inviteLink}}

This link expires in {{expiryDays}} days.

If you didn't expect this email, you can safely ignore it.`,
    variables: [
      { name: 'firstName', description: 'Recipient first name', required: true, exampleValue: 'Jane' },
      { name: 'lastName', description: 'Recipient last name', required: false, exampleValue: 'Smith' },
      { name: 'email', description: 'Recipient email', required: true, exampleValue: 'jane@example.com' },
      { name: 'companyName', description: 'Client account name', required: true, exampleValue: 'Acme Corp' },
      { name: 'inviteLink', description: 'Invitation URL with token', required: true, exampleValue: 'https://app.pivotal-b2b.com/client-portal/accept-invite?token=abc123' },
      { name: 'expiryDays', description: 'Number of days until expiration', required: true, defaultValue: '7', exampleValue: '7' },
      { name: 'portalUrl', description: 'Client portal base URL', required: false, exampleValue: 'https://app.pivotal-b2b.com' },
    ],
  },
  {
    templateKey: 'project_request_approved',
    name: 'Project Request Approved',
    description: 'Notification sent to client when their project/campaign request is approved by admin.',
    category: 'notification',
    subjectTemplate: 'Your project "{{projectName}}" has been approved!',
    htmlTemplate: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Project Approved ✓</h1>
  </div>
  <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; color: #374151;">Hi {{recipientName}},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      Great news! Your project request <strong>"{{projectName}}"</strong> has been approved.
    </p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="margin: 4px 0; font-size: 14px; color: #166534;"><strong>Project:</strong> {{projectName}}</p>
      <p style="margin: 4px 0; font-size: 14px; color: #166534;"><strong>Approved on:</strong> {{approvalDate}}</p>
      {{#if approvedBy}}
      <p style="margin: 4px 0; font-size: 14px; color: #166534;"><strong>Approved by:</strong> {{approvedBy}}</p>
      {{/if}}
    </div>
    {{#if portalLink}}
    <div style="text-align: center; margin: 24px 0;">
      <a href="{{portalLink}}" style="background-color: #059669; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
        View in Client Portal
      </a>
    </div>
    {{/if}}
    <p style="font-size: 13px; color: #6b7280;">
      Your campaign is now being set up. We'll notify you when leads start coming in.
    </p>
  </div>
</div>`,
    textTemplate: `Hi {{recipientName}},

Great news! Your project request "{{projectName}}" has been approved.

Project: {{projectName}}
Approved on: {{approvalDate}}

View in Client Portal: {{portalLink}}

Your campaign is now being set up. We'll notify you when leads start coming in.`,
    variables: [
      { name: 'recipientName', description: 'Recipient full name', required: true, exampleValue: 'Jane Smith' },
      { name: 'projectName', description: 'Name of the approved project', required: true, exampleValue: 'Q1 Lead Generation Campaign' },
      { name: 'approvalDate', description: 'Date of approval', required: true, exampleValue: 'February 9, 2026' },
      { name: 'approvedBy', description: 'Admin who approved', required: false, exampleValue: 'Admin User' },
      { name: 'portalLink', description: 'Link to view project in portal', required: false, exampleValue: 'https://app.pivotal-b2b.com/client-portal/projects/123' },
    ],
  },
  {
    templateKey: 'project_request_rejected',
    name: 'Project Request Rejected',
    description: 'Notification sent to client when their project/campaign request is rejected.',
    category: 'notification',
    subjectTemplate: 'Update on your project "{{projectName}}"',
    htmlTemplate: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #9333ea 0%, #a855f7 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Project Update</h1>
  </div>
  <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; color: #374151;">Hi {{recipientName}},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      We've reviewed your project request <strong>"{{projectName}}"</strong> and unfortunately we're unable to proceed with it at this time.
    </p>
    {{#if rejectionReason}}
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Reason:</strong> {{rejectionReason}}</p>
    </div>
    {{/if}}
    <p style="font-size: 13px; color: #6b7280;">
      You can submit a new request or contact your account manager for more details.
    </p>
  </div>
</div>`,
    textTemplate: `Hi {{recipientName}},

We've reviewed your project request "{{projectName}}" and unfortunately we're unable to proceed with it at this time.

{{#if rejectionReason}}Reason: {{rejectionReason}}{{/if}}

You can submit a new request or contact your account manager for more details.`,
    variables: [
      { name: 'recipientName', description: 'Recipient full name', required: true, exampleValue: 'Jane Smith' },
      { name: 'projectName', description: 'Name of the rejected project', required: true, exampleValue: 'Q1 Campaign Request' },
      { name: 'rejectionReason', description: 'Reason for rejection', required: false, exampleValue: 'Budget not approved for this quarter' },
    ],
  },
  {
    templateKey: 'campaign_launched',
    name: 'Campaign Launched',
    description: 'Notification that a campaign has been launched and is live.',
    category: 'notification',
    subjectTemplate: 'Campaign "{{campaignName}}" is now live!',
    htmlTemplate: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Campaign Live 🚀</h1>
  </div>
  <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; color: #374151;">Hi {{recipientName}},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      Your campaign <strong>"{{campaignName}}"</strong> is now live and leads will start being generated.
    </p>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="margin: 4px 0; font-size: 14px; color: #1e40af;"><strong>Campaign:</strong> {{campaignName}}</p>
      <p style="margin: 4px 0; font-size: 14px; color: #1e40af;"><strong>Started:</strong> {{launchDate}}</p>
      {{#if targetLeadCount}}
      <p style="margin: 4px 0; font-size: 14px; color: #1e40af;"><strong>Target Leads:</strong> {{targetLeadCount}}</p>
      {{/if}}
    </div>
    {{#if portalLink}}
    <div style="text-align: center; margin: 24px 0;">
      <a href="{{portalLink}}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
        Track Progress
      </a>
    </div>
    {{/if}}
  </div>
</div>`,
    textTemplate: `Hi {{recipientName}},

Your campaign "{{campaignName}}" is now live and leads will start being generated.

Campaign: {{campaignName}}
Started: {{launchDate}}

Track progress: {{portalLink}}`,
    variables: [
      { name: 'recipientName', description: 'Recipient name', required: true, exampleValue: 'Jane Smith' },
      { name: 'campaignName', description: 'Campaign name', required: true, exampleValue: 'Q1 Lead Gen' },
      { name: 'launchDate', description: 'Launch date', required: true, exampleValue: 'February 9, 2026' },
      { name: 'targetLeadCount', description: 'Target number of leads', required: false, exampleValue: '500' },
      { name: 'portalLink', description: 'Link to campaign in portal', required: false, exampleValue: 'https://app.pivotal-b2b.com/client-portal' },
    ],
  },
  {
    templateKey: 'leads_delivered',
    name: 'Leads Delivered',
    description: 'Notification that new leads have been delivered for a campaign.',
    category: 'notification',
    subjectTemplate: '{{leadCount}} new leads delivered for "{{campaignName}}"',
    htmlTemplate: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Leads Delivered</h1>
  </div>
  <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; color: #374151;">Hi {{recipientName}},</p>
    <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
      <strong>{{leadCount}} new leads</strong> have been delivered for campaign <strong>"{{campaignName}}"</strong>.
    </p>
    {{#if portalLink}}
    <div style="text-align: center; margin: 24px 0;">
      <a href="{{portalLink}}" style="background-color: #059669; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
        View Leads
      </a>
    </div>
    {{/if}}
  </div>
</div>`,
    textTemplate: `Hi {{recipientName}},

{{leadCount}} new leads have been delivered for campaign "{{campaignName}}".

View leads: {{portalLink}}`,
    variables: [
      { name: 'recipientName', description: 'Recipient name', required: true, exampleValue: 'Jane Smith' },
      { name: 'campaignName', description: 'Campaign name', required: true, exampleValue: 'Q1 Lead Gen' },
      { name: 'leadCount', description: 'Number of leads delivered', required: true, exampleValue: '25' },
      { name: 'portalLink', description: 'Link to view leads', required: false, exampleValue: 'https://app.pivotal-b2b.com/client-portal/leads' },
    ],
  },
  {
    templateKey: 'test_notification',
    name: 'Test Notification',
    description: 'A test email template for verifying Mercury Bridge configuration.',
    category: 'system',
    subjectTemplate: '[Mercury Test] Email delivery test at {{timestamp}}',
    htmlTemplate: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Mercury Bridge — Test Email</h1>
  </div>
  <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; color: #374151;">This is a test email from the Mercury Bridge notification system.</p>
    <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="margin: 4px 0; font-size: 14px; color: #4338ca;"><strong>Timestamp:</strong> {{timestamp}}</p>
      <p style="margin: 4px 0; font-size: 14px; color: #4338ca;"><strong>Sent by:</strong> {{adminName}}</p>
      <p style="margin: 4px 0; font-size: 14px; color: #4338ca;"><strong>Environment:</strong> {{environment}}</p>
    </div>
    <p style="font-size: 13px; color: #6b7280;">
      If you received this email, the Mercury Bridge SMTP configuration is working correctly.
    </p>
  </div>
</div>`,
    textTemplate: `Mercury Bridge — Test Email

This is a test email from the Mercury Bridge notification system.

Timestamp: {{timestamp}}
Sent by: {{adminName}}
Environment: {{environment}}

If you received this email, the Mercury Bridge SMTP configuration is working correctly.`,
    variables: [
      { name: 'timestamp', description: 'Current timestamp', required: true, exampleValue: new Date().toISOString() },
      { name: 'adminName', description: 'Name of admin who triggered the test', required: true, exampleValue: 'Admin' },
      { name: 'environment', description: 'Environment name', required: false, defaultValue: 'production', exampleValue: 'production' },
    ],
  },
];

/**
 * Seed default Mercury templates if they don't exist.
 * Safe to call multiple times — skips existing templates.
 */
export async function seedDefaultTemplates(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const template of DEFAULT_TEMPLATES) {
    const [existing] = await db
      .select({ id: mercuryTemplates.id })
      .from(mercuryTemplates)
      .where(eq(mercuryTemplates.templateKey, template.templateKey))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(mercuryTemplates).values({
      templateKey: template.templateKey,
      name: template.name,
      description: template.description,
      category: template.category,
      subjectTemplate: template.subjectTemplate,
      htmlTemplate: template.htmlTemplate,
      textTemplate: template.textTemplate,
      variables: template.variables,
    });

    created++;
  }

  console.log(`[Mercury] Templates seeded: created=${created}, skipped=${skipped}`);
  return { created, skipped };
}
