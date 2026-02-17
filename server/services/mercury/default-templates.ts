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
    description: 'Premium invitation email sent to client users to set up their portal account.',
    category: 'invitation',
    subjectTemplate: '{{companyName}} — Set Your Portal Password',
    htmlTemplate: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
:root { color-scheme: light only; }
@media only screen and (max-width: 620px) {
  .main-table { width: 100% !important; min-width: 100% !important; }
  .mobile-padding { padding: 24px 20px !important; }
  .mobile-header { padding: 40px 24px !important; }
  .mobile-text { font-size: 15px !important; line-height: 1.6 !important; }
  .mobile-btn { padding: 14px 32px !important; }
  .feature-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; }
}
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap { background-color: #ffffff !important; }
  .card-wrap td { background-color: #ffffff !important; }
  h1, h2, h3, p, td, span, a { color: inherit !important; }
  .header-band { background-color: #1e293b !important; }
  .header-band h1 { color: #ffffff !important; }
  .header-band p { color: #cbd5e1 !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #475569 !important; }
  .cta-btn { background-color: #2563eb !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #1e293b !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .header-band p { color: #cbd5e1 !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #475569 !important; }
[data-ogsc] .cta-btn { background-color: #2563eb !important; color: #ffffff !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;">
  <!-- Preheader -->
  <div style="display:none; font-size:1px; color:#f0f2f5; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    Your workspace is ready — create your password to activate access. No previous password is required.
  </div>

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="body-wrap" style="background-color:#f0f2f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Main Card -->
        <table role="presentation" class="main-table card-wrap" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:16px;">

          <!-- Header Band -->
          <tr>
            <td class="mobile-header header-band" style="background-color:#1e293b; padding: 52px 40px; text-align: center;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 auto;"><tr><td style="width:56px; height:56px; background-color:#293548; border-radius:14px; text-align:center; vertical-align:middle; font-size:28px; line-height:56px;">&#9889;</td></tr></table>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#ffffff; margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:26px; font-weight:700; letter-spacing:-0.3px;">Your Portal is Ready</h1>
                    <p style="color:#cbd5e1; margin:10px 0 0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; font-weight:400;">Pivotal B2B &middot; DemandGentic.ai</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td class="mobile-padding" style="padding: 44px 40px 20px;">
              <h2 class="body-text" style="margin:0 0 8px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:20px; color:#0f172a; font-weight:600;">Hi {{firstName}},</h2>

              <p class="mobile-text body-text-light" style="margin:0 0 28px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#475569;">
                You've been invited to the <strong style="color:#0f172a;">{{companyName}}</strong> workspace on our demand generation platform. Your account is ready — create your password to activate access. You do <strong style="color:#0f172a;">not</strong> need a previous password.
              </p>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td align="center" style="padding: 4px 0 32px;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{inviteLink}}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="19%" stroke="f" fillcolor="#2563eb">
                          <w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;">Set Up My Account</center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-->
                          <a href="{{inviteLink}}" target="_blank" class="mobile-btn cta-btn" style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; text-decoration:none; padding:16px 44px; border-radius:10px; display:inline-block; letter-spacing:0.2px; background-color:#2563eb;">
                            Set Up My Account
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Feature Highlights -->
          <tr>
            <td class="mobile-padding" style="padding: 0 40px 36px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; border-radius:12px; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 24px 28px 8px;">
                    <p style="margin:0 0 16px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.8px;">What you'll get access to</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px 24px;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td class="feature-cell" style="padding: 6px 0; vertical-align:top; width:50%;">
                          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width:28px; vertical-align:top; padding-top:2px;">
                                <div style="width:20px; height:20px; background-color:#dbeafe; border-radius:50%; text-align:center; line-height:20px; font-size:11px;">&#10003;</div>
                              </td>
                              <td style="padding-left:8px;">
                                <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#334155; line-height:1.4;">Real-time campaign dashboard</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td class="feature-cell" style="padding: 6px 0; vertical-align:top; width:50%;">
                          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width:28px; vertical-align:top; padding-top:2px;">
                                <div style="width:20px; height:20px; background-color:#dbeafe; border-radius:50%; text-align:center; line-height:20px; font-size:11px;">&#10003;</div>
                              </td>
                              <td style="padding-left:8px;">
                                <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#334155; line-height:1.4;">Lead review &amp; approvals</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td class="feature-cell" style="padding: 6px 0; vertical-align:top; width:50%;">
                          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width:28px; vertical-align:top; padding-top:2px;">
                                <div style="width:20px; height:20px; background-color:#dbeafe; border-radius:50%; text-align:center; line-height:20px; font-size:11px;">&#10003;</div>
                              </td>
                              <td style="padding-left:8px;">
                                <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#334155; line-height:1.4;">Call recordings &amp; analytics</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td class="feature-cell" style="padding: 6px 0; vertical-align:top; width:50%;">
                          <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width:28px; vertical-align:top; padding-top:2px;">
                                <div style="width:20px; height:20px; background-color:#dbeafe; border-radius:50%; text-align:center; line-height:20px; font-size:11px;">&#10003;</div>
                              </td>
                              <td style="padding-left:8px;">
                                <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#334155; line-height:1.4;">AI-powered reporting</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Expiry Notice -->
          <tr>
            <td class="mobile-padding" style="padding: 0 40px 32px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:#fffbeb; border-radius:8px; border: 1px solid #fde68a; padding: 14px 20px;">
                    <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; color:#92400e; line-height:1.5;">
                      <strong>Heads up:</strong> This invitation link expires in <strong>{{expiryDays}} days</strong>. If it expires, ask your admin to resend your invitation.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #e2e8f0;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px; text-align: center;">
              <p style="margin:0 0 8px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; color:#94a3b8; line-height:1.5;">
                Button not working? Copy and paste this link into your browser:
              </p>
              <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5;">
                <a href="{{inviteLink}}" style="color:#2563eb; text-decoration:none; word-break:break-all;">{{inviteLink}}</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Below-Card Footer -->
        <table role="presentation" width="600" class="main-table" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="padding: 28px 20px;">
              <p style="margin:0 0 4px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; color:#94a3b8;">
                Pivotal B2B &middot; DemandGentic.ai Platform
              </p>
              <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; color:#cbd5e1;">
                &copy; 2026 Pivotal B2B. All rights reserved.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`,
    textTemplate: `Set Your Portal Password
  =========================

Hi {{firstName}},

You've been invited to the {{companyName}} workspace on the Pivotal B2B demand generation platform.

  Your account is ready — click the link below to create your password and activate access.

  You do not need an existing password from us.

Set Up Your Account: {{inviteLink}}

What you'll get access to:
- Real-time campaign dashboard
- Lead review & approvals
- Call recordings & analytics
- AI-powered reporting

This invitation link expires in {{expiryDays}} days.

If you have trouble with the link, copy and paste this URL into your browser:
{{inviteLink}}

--
Pivotal B2B - DemandGentic.ai Platform`,
    variables: [
      { name: 'firstName', description: 'Recipient first name', required: true, exampleValue: 'Jane' },
      { name: 'lastName', description: 'Recipient last name', required: false, exampleValue: 'Smith' },
      { name: 'email', description: 'Recipient email', required: true, exampleValue: 'jane@example.com' },
      { name: 'companyName', description: 'Client account name', required: true, exampleValue: 'Acme Corp' },
      { name: 'inviteLink', description: 'Password reset URL with token (legacy variable name)', required: true, exampleValue: 'https://demandgentic.ai/reset-password?token=abc123&type=client' },
      { name: 'resetLink', description: 'Password reset URL with token', required: false, exampleValue: 'https://demandgentic.ai/reset-password?token=abc123&type=client' },
      { name: 'expiryDays', description: 'Number of days until expiration', required: true, defaultValue: '7', exampleValue: '7' },
      { name: 'portalUrl', description: 'Client portal base URL', required: false, exampleValue: 'https://demandgentic.ai' },
    ],
  },
  {
    templateKey: 'project_request_approved',
    name: 'Project Request Approved',
    description: 'Notification sent to client when their project/campaign request is approved by admin.',
    category: 'notification',
    subjectTemplate: 'Your project "{{projectName}}" has been approved!',
    htmlTemplate: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #059669 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #059669 !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #059669 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #059669 !important; color: #ffffff !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="body-wrap" style="background-color:#f0f2f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="card-wrap" style="background-color:#ffffff;">
  <tr><td class="header-band" style="background-color:#059669; padding:24px 32px;">
    <h1 style="color:#ffffff; margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:24px; font-weight:700;">Project Approved</h1>
  </td></tr>
  <tr><td style="padding:32px; font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <p class="body-text" style="font-size:16px; color:#374151; margin:0 0 16px;">Hi {{recipientName}},</p>
    <p class="body-text-light" style="font-size:14px; color:#4b5563; line-height:1.6; margin:0 0 16px;">Great news! Your project request <strong>"{{projectName}}"</strong> has been approved.</p>
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:16px 0;"><tr><td style="background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:16px;">
      <p style="margin:4px 0; font-size:14px; color:#166534;"><strong>Project:</strong> {{projectName}}</p>
      <p style="margin:4px 0; font-size:14px; color:#166534;"><strong>Approved on:</strong> {{approvalDate}}</p>
      {{#if approvedBy}}<p style="margin:4px 0; font-size:14px; color:#166534;"><strong>Approved by:</strong> {{approvedBy}}</p>{{/if}}
    </td></tr></table>
    {{#if portalLink}}
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;" align="center"><tr><td align="center">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{portalLink}}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="14%" stroke="f" fillcolor="#059669"><w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;">View in Client Portal</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="{{portalLink}}" style="background-color:#059669; color:#ffffff; padding:12px 28px; border-radius:6px; text-decoration:none; font-size:15px; font-weight:600; display:inline-block; font-family:'Segoe UI',Helvetica,Arial,sans-serif;">View in Client Portal</a><!--<![endif]-->
    </td></tr></table>
    {{/if}}
    <p style="font-size:13px; color:#6b7280; margin:16px 0 0;">Your campaign is now being set up. We'll notify you when leads start coming in.</p>
  </td></tr>
</table>
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px;"><p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; color:#94a3b8;">Pivotal B2B &middot; DemandGentic.ai</p></td></tr></table>
</td></tr></table>
</body></html>`,
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
      { name: 'portalLink', description: 'Link to view project in portal', required: false, exampleValue: 'https://demandgentic.ai/client-portal/projects/123' },
    ],
  },
  {
    templateKey: 'project_request_rejected',
    name: 'Project Request Rejected',
    description: 'Notification sent to client when their project/campaign request is rejected.',
    category: 'notification',
    subjectTemplate: 'Update on your project "{{projectName}}"',
    htmlTemplate: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #7c3aed !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #7c3aed !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="body-wrap" style="background-color:#f0f2f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="card-wrap" style="background-color:#ffffff;">
  <tr><td class="header-band" style="background-color:#7c3aed; padding:24px 32px;">
    <h1 style="color:#ffffff; margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:24px; font-weight:700;">Project Update</h1>
  </td></tr>
  <tr><td style="padding:32px; font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <p class="body-text" style="font-size:16px; color:#374151; margin:0 0 16px;">Hi {{recipientName}},</p>
    <p class="body-text-light" style="font-size:14px; color:#4b5563; line-height:1.6; margin:0 0 16px;">We've reviewed your project request <strong>"{{projectName}}"</strong> and unfortunately we're unable to proceed with it at this time.</p>
    {{#if rejectionReason}}
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:16px 0;"><tr><td style="background-color:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:16px;">
      <p style="margin:0; font-size:14px; color:#991b1b;"><strong>Reason:</strong> {{rejectionReason}}</p>
    </td></tr></table>
    {{/if}}
    <p style="font-size:13px; color:#6b7280; margin:16px 0 0;">You can submit a new request or contact your account manager for more details.</p>
  </td></tr>
</table>
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px;"><p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; color:#94a3b8;">Pivotal B2B &middot; DemandGentic.ai</p></td></tr></table>
</td></tr></table>
</body></html>`,
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
    htmlTemplate: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #2563eb !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #2563eb !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #2563eb !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #2563eb !important; color: #ffffff !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="body-wrap" style="background-color:#f0f2f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="card-wrap" style="background-color:#ffffff;">
  <tr><td class="header-band" style="background-color:#2563eb; padding:24px 32px;">
    <h1 style="color:#ffffff; margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:24px; font-weight:700;">Campaign Live</h1>
  </td></tr>
  <tr><td style="padding:32px; font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <p class="body-text" style="font-size:16px; color:#374151; margin:0 0 16px;">Hi {{recipientName}},</p>
    <p class="body-text-light" style="font-size:14px; color:#4b5563; line-height:1.6; margin:0 0 16px;">Your campaign <strong>"{{campaignName}}"</strong> is now live and leads will start being generated.</p>
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:16px 0;"><tr><td style="background-color:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:16px;">
      <p style="margin:4px 0; font-size:14px; color:#1e40af;"><strong>Campaign:</strong> {{campaignName}}</p>
      <p style="margin:4px 0; font-size:14px; color:#1e40af;"><strong>Started:</strong> {{launchDate}}</p>
      {{#if targetLeadCount}}<p style="margin:4px 0; font-size:14px; color:#1e40af;"><strong>Target Leads:</strong> {{targetLeadCount}}</p>{{/if}}
    </td></tr></table>
    {{#if portalLink}}
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;" align="center"><tr><td align="center">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{portalLink}}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="14%" stroke="f" fillcolor="#2563eb"><w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;">Track Progress</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="{{portalLink}}" style="background-color:#2563eb; color:#ffffff; padding:12px 28px; border-radius:6px; text-decoration:none; font-size:15px; font-weight:600; display:inline-block; font-family:'Segoe UI',Helvetica,Arial,sans-serif;">Track Progress</a><!--<![endif]-->
    </td></tr></table>
    {{/if}}
  </td></tr>
</table>
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px;"><p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; color:#94a3b8;">Pivotal B2B &middot; DemandGentic.ai</p></td></tr></table>
</td></tr></table>
</body></html>`,
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
      { name: 'portalLink', description: 'Link to campaign in portal', required: false, exampleValue: 'https://demandgentic.ai/client-portal' },
    ],
  },
  {
    templateKey: 'leads_delivered',
    name: 'Leads Delivered',
    description: 'Notification that new leads have been delivered for a campaign.',
    category: 'notification',
    subjectTemplate: '{{leadCount}} new leads delivered for "{{campaignName}}"',
    htmlTemplate: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #059669 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
  .cta-btn { background-color: #059669 !important; color: #ffffff !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #059669 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
[data-ogsc] .cta-btn { background-color: #059669 !important; color: #ffffff !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="body-wrap" style="background-color:#f0f2f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="card-wrap" style="background-color:#ffffff;">
  <tr><td class="header-band" style="background-color:#059669; padding:24px 32px;">
    <h1 style="color:#ffffff; margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:24px; font-weight:700;">New Leads Delivered</h1>
  </td></tr>
  <tr><td style="padding:32px; font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <p class="body-text" style="font-size:16px; color:#374151; margin:0 0 16px;">Hi {{recipientName}},</p>
    <p class="body-text-light" style="font-size:14px; color:#4b5563; line-height:1.6; margin:0 0 16px;"><strong>{{leadCount}} new leads</strong> have been delivered for campaign <strong>"{{campaignName}}"</strong>.</p>
    {{#if portalLink}}
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0;" align="center"><tr><td align="center">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{portalLink}}" style="height:44px;v-text-anchor:middle;width:180px;" arcsize="14%" stroke="f" fillcolor="#059669"><w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;">View Leads</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="{{portalLink}}" style="background-color:#059669; color:#ffffff; padding:12px 28px; border-radius:6px; text-decoration:none; font-size:15px; font-weight:600; display:inline-block; font-family:'Segoe UI',Helvetica,Arial,sans-serif;">View Leads</a><!--<![endif]-->
    </td></tr></table>
    {{/if}}
  </td></tr>
</table>
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px;"><p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; color:#94a3b8;">Pivotal B2B &middot; DemandGentic.ai</p></td></tr></table>
</td></tr></table>
</body></html>`,
    textTemplate: `Hi {{recipientName}},

{{leadCount}} new leads have been delivered for campaign "{{campaignName}}".

View leads: {{portalLink}}`,
    variables: [
      { name: 'recipientName', description: 'Recipient name', required: true, exampleValue: 'Jane Smith' },
      { name: 'campaignName', description: 'Campaign name', required: true, exampleValue: 'Q1 Lead Gen' },
      { name: 'leadCount', description: 'Number of leads delivered', required: true, exampleValue: '25' },
      { name: 'portalLink', description: 'Link to view leads', required: false, exampleValue: 'https://demandgentic.ai/client-portal/leads' },
    ],
  },
  {
    templateKey: 'showcase_recordings_shared',
    name: 'Showcase Recordings Shared',
    description: 'Client notification with direct path to showcase call recordings in the portal.',
    category: 'notification',
    subjectTemplate: 'Your showcase call recordings are ready',
    htmlTemplate: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0; padding:0; background:#f4f6f8; font-family:'Segoe UI',Arial,sans-serif; color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden;">
          <tr>
            <td style="background:#0f766e; color:#ffffff; padding:20px 28px; font-size:22px; font-weight:700;">
              Showcase Call Recordings
            </td>
          </tr>
          <tr>
            <td style="padding:28px; font-size:15px; line-height:1.65;">
              <p style="margin:0 0 14px;">Hi {{recipientName}},</p>
              <p style="margin:0 0 14px;">We've published your latest showcase call recordings for review.</p>
              <p style="margin:0 0 20px;">
                Access them here:
                <a href="https://demandgentic.ai{{showcasePath}}" style="color:#0f766e; text-decoration:none; font-weight:600;">https://demandgentic.ai{{showcasePath}}</a>
              </p>
              <p style="margin:0 0 20px;">Path reference: <code>{{showcasePath}}</code></p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 18px;">
                <tr>
                  <td style="background:#0f766e; border-radius:8px;">
                    <a href="https://demandgentic.ai{{showcasePath}}" style="display:inline-block; padding:12px 24px; color:#ffffff; text-decoration:none; font-weight:600;">Open Showcase Calls</a>
                  </td>
                </tr>
              </table>

              {{#if notes}}
              <p style="margin:0 0 16px;"><strong>Notes:</strong> {{notes}}</p>
              {{/if}}

              <p style="margin:0; color:#6b7280; font-size:13px;">If the button doesn't work, copy and paste the link above into your browser.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    textTemplate: `Hi {{recipientName}},

We've published your latest showcase call recordings for review.

Open Showcase Calls:
https://demandgentic.ai{{showcasePath}}

Path reference: {{showcasePath}}

{{#if notes}}Notes: {{notes}}{{/if}}

If the link doesn't open directly, copy and paste it into your browser.`,
    variables: [
      { name: 'recipientName', description: 'Recipient name', required: true, exampleValue: 'Jane Smith' },
      { name: 'showcasePath', description: 'Portal path for showcase call recordings', required: true, defaultValue: '/client-portal/showcase-calls', exampleValue: '/client-portal/showcase-calls' },
      { name: 'notes', description: 'Optional note to include in the email', required: false, exampleValue: 'New highlighted calls from this week are now available.' },
    ],
  },
  {
    templateKey: 'test_notification',
    name: 'Test Notification',
    description: 'A test email template for verifying Mercury Bridge configuration.',
    category: 'system',
    subjectTemplate: '[Mercury Test] Email delivery test at {{timestamp}}',
    htmlTemplate: `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root { color-scheme: light only; }
@media (prefers-color-scheme: dark) {
  body, .body-wrap { background-color: #f0f2f5 !important; }
  .card-wrap, .card-wrap td { background-color: #ffffff !important; }
  .header-band { background-color: #6366f1 !important; }
  .header-band h1 { color: #ffffff !important; }
  .body-text { color: #374151 !important; }
  .body-text-light { color: #4b5563 !important; }
}
[data-ogsc] .body-wrap { background-color: #f0f2f5 !important; }
[data-ogsc] .card-wrap, [data-ogsc] .card-wrap td { background-color: #ffffff !important; }
[data-ogsc] .header-band { background-color: #6366f1 !important; }
[data-ogsc] .header-band h1 { color: #ffffff !important; }
[data-ogsc] .body-text { color: #374151 !important; }
[data-ogsc] .body-text-light { color: #4b5563 !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="body-wrap" style="background-color:#f0f2f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="card-wrap" style="background-color:#ffffff;">
  <tr><td class="header-band" style="background-color:#6366f1; padding:24px 32px;">
    <h1 style="color:#ffffff; margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:24px; font-weight:700;">Mercury Bridge &#8212; Test Email</h1>
  </td></tr>
  <tr><td style="padding:32px; font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <p class="body-text" style="font-size:16px; color:#374151; margin:0 0 16px;">This is a test email from the Mercury Bridge notification system.</p>
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:16px 0;"><tr><td style="background-color:#f5f3ff; border:1px solid #ddd6fe; border-radius:6px; padding:16px;">
      <p style="margin:4px 0; font-size:14px; color:#4338ca;"><strong>Timestamp:</strong> {{timestamp}}</p>
      <p style="margin:4px 0; font-size:14px; color:#4338ca;"><strong>Sent by:</strong> {{adminName}}</p>
      <p style="margin:4px 0; font-size:14px; color:#4338ca;"><strong>Environment:</strong> {{environment}}</p>
    </td></tr></table>
    <p style="font-size:13px; color:#6b7280; margin:16px 0 0;">If you received this email, the Mercury Bridge SMTP configuration is working correctly.</p>
  </td></tr>
</table>
<table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px;"><p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; color:#94a3b8;">Pivotal B2B &middot; DemandGentic.ai</p></td></tr></table>
</td></tr></table>
</body></html>`,
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
