/**
 * Update the Argyle notification draft with a properly branded HTML email.
 * The AI generation failed (expired key), so we craft the branded email manually
 * using the Mercury design system (dark header #1e293b, blue CTA #2563eb, etc.)
 */
import { db } from '../server/db';
import { clientNotifications } from '../shared/schema';
import { eq } from 'drizzle-orm';

const NOTIFICATION_ID = 'a42a6cfd-e999-49b7-b143-cec772c987c1';

const subject = 'Your Pipeline & Engagement Dashboard is Live — Argyle Executive Forum';

const htmlContent = `<!DOCTYPE html>
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
  .stat-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; }
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
    Your client portal is live with real-time pipeline visibility, lead tracking, and AI-powered analytics for your campaign.
  </div>

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="body-wrap" style="background-color:#f0f2f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Main Card -->
        <table role="presentation" class="main-table card-wrap" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden;">

          <!-- Header Band -->
          <tr>
            <td class="mobile-header header-band" style="background-color:#1e293b; padding: 52px 40px; text-align: center;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding-bottom: 16px;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                      <tr>
                        <td style="width:56px; height:56px; background-color:#293548; border-radius:14px; text-align:center; vertical-align:middle; font-size:28px; line-height:56px;">&#128202;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#ffffff; margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:26px; font-weight:700; letter-spacing:-0.3px;">Pipeline &amp; Engagement Dashboard</h1>
                    <p style="color:#cbd5e1; margin:10px 0 0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; font-weight:400;">Pivotal B2B &middot; DemandGentic.ai</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td class="mobile-padding" style="padding: 44px 40px 20px;">
              <h2 class="body-text" style="margin:0 0 8px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:20px; color:#0f172a; font-weight:600;">Hi Argyle Team,</h2>

              <p class="mobile-text body-text-light" style="margin:0 0 20px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#475569;">
                Great news! Your <strong style="color:#0f172a;">Client Portal</strong> is now live with full access to your Pipeline &amp; Engagement Dashboard. You can now track your campaign performance in real time.
              </p>

              <p class="mobile-text body-text-light" style="margin:0 0 28px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.7; color:#475569;">
                Your active campaign <strong style="color:#0f172a;">March and April: CIO / IT / Security</strong> is currently running, and here&rsquo;s a snapshot of your pipeline:
              </p>

              <!-- Pipeline Stats Grid -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 28px; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                <tr>
                  <td class="stat-cell" style="width:25%; padding:20px 12px; text-align:center; border-right:1px solid #e5e7eb;">
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:28px; font-weight:700; color:#2563eb; line-height:1;">31</div>
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-top:6px;">Outreach</div>
                  </td>
                  <td class="stat-cell" style="width:25%; padding:20px 12px; text-align:center; border-right:1px solid #e5e7eb;">
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:28px; font-weight:700; color:#0ea5e9; line-height:1;">14</div>
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-top:6px;">Engaged</div>
                  </td>
                  <td class="stat-cell" style="width:25%; padding:20px 12px; text-align:center; border-right:1px solid #e5e7eb;">
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:28px; font-weight:700; color:#10b981; line-height:1;">10</div>
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-top:6px;">Qualified</div>
                  </td>
                  <td class="stat-cell" style="width:25%; padding:20px 12px; text-align:center;">
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:28px; font-weight:700; color:#8b5cf6; line-height:1;">1</div>
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-top:6px;">Appt. Set</div>
                  </td>
                </tr>
              </table>

              <!-- Leads Delivered Callout -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background-color:#f0f9ff; border-radius:10px; padding:16px 20px; border-left:4px solid #2563eb;">
                    <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; color:#0f172a; line-height:1.6;">
                      &#128230; <strong>39 leads</strong> have been delivered and are available for your review in the portal.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Features Section -->
              <h3 class="body-text" style="margin:0 0 14px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:16px; color:#0f172a; font-weight:600;">What You Can Access</h3>

              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:24px; vertical-align:top; padding-top:2px;">
                          <span style="color:#10b981; font-size:16px;">&#10003;</span>
                        </td>
                        <td style="padding-left:8px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#374151; line-height:1.5;">
                          <strong>Campaign Dashboard</strong> &mdash; Real-time campaign performance and engagement metrics
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:24px; vertical-align:top; padding-top:2px;">
                          <span style="color:#10b981; font-size:16px;">&#10003;</span>
                        </td>
                        <td style="padding-left:8px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#374151; line-height:1.5;">
                          <strong>Lead Pipeline Review</strong> &mdash; Track accounts across Outreach, Engaged, Qualified, and Appointment Set stages
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:24px; vertical-align:top; padding-top:2px;">
                          <span style="color:#10b981; font-size:16px;">&#10003;</span>
                        </td>
                        <td style="padding-left:8px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#374151; line-height:1.5;">
                          <strong>Call Recordings &amp; Transcripts</strong> &mdash; Listen to conversations and review AI-generated transcripts
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:24px; vertical-align:top; padding-top:2px;">
                          <span style="color:#10b981; font-size:16px;">&#10003;</span>
                        </td>
                        <td style="padding-left:8px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; color:#374151; line-height:1.5;">
                          <strong>AI-Powered Analytics &amp; Reporting</strong> &mdash; Insights, disposition breakdowns, and performance trends
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td align="center" style="padding: 4px 0 32px;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="https://demandgentic.ai/client-portal/login" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="19%" stroke="f" fillcolor="#2563eb">
                          <w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;">Access Your Portal</center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-->
                          <a href="https://demandgentic.ai/client-portal/login" target="_blank" class="mobile-btn cta-btn" style="font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; text-decoration:none; padding:16px 44px; border-radius:10px; display:inline-block; letter-spacing:0.2px; background-color:#2563eb;">
                            Access Your Portal
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Login Instructions -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                <tr>
                  <td style="background-color:#f8fafc; border-radius:10px; padding:16px 20px;">
                    <p style="margin:0 0 4px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; font-weight:600; color:#0f172a;">How to Log In</p>
                    <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; color:#475569; line-height:1.6;">
                      Visit <a href="https://demandgentic.ai/client-portal/login" style="color:#2563eb; text-decoration:underline;">demandgentic.ai/client-portal/login</a> and enter the email address associated with your account. If this is your first visit, you&rsquo;ll be prompted to create a password.
                    </p>
                  </td>
                </tr>
              </table>

              <p class="mobile-text body-text-light" style="margin:0 0 8px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:14px; line-height:1.7; color:#64748b;">
                If you have any questions, please reach out to your Pivotal B2B account team &mdash; we&rsquo;re here to help.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #e5e7eb; text-align:center;">
              <p style="margin:0 0 4px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; color:#6b7280;">
                Pivotal B2B &mdash; DemandGentic.ai Platform
              </p>
              <p style="margin:0; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; color:#9ca3af;">
                Argyle Executive Forum &middot; Pipeline &amp; Engagement Update
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const textContent = `Pipeline & Engagement Dashboard — Argyle Executive Forum

Hi Argyle Team,

Great news! Your Client Portal is now live with full access to your Pipeline & Engagement Dashboard. You can now track your campaign performance in real time.

Your active campaign "March and April: CIO / IT / Security" is currently running. Here's a snapshot of your pipeline:

  PIPELINE OVERVIEW (59 Total Accounts)
  ──────────────────────────────────────
  Outreach:         31 accounts
  Engaged:          14 accounts
  Qualified:        10 accounts
  Appointment Set:   1 account

  39 leads have been delivered and are available for your review in the portal.

WHAT YOU CAN ACCESS
───────────────────
✓ Campaign Dashboard — Real-time campaign performance and engagement metrics
✓ Lead Pipeline Review — Track accounts across Outreach, Engaged, Qualified, and Appointment Set stages
✓ Call Recordings & Transcripts — Listen to conversations and review AI-generated transcripts
✓ AI-Powered Analytics & Reporting — Insights, disposition breakdowns, and performance trends

ACCESS YOUR PORTAL
──────────────────
Visit https://demandgentic.ai/client-portal/login and enter the email address associated with your account. If this is your first visit, you'll be prompted to create a password.

If you have any questions, please reach out to your Pivotal B2B account team — we're here to help.

— Pivotal B2B / DemandGentic.ai Platform`;

async function main() {
  console.log('Updating draft notification with branded HTML email...\n');

  const [updated] = await db.update(clientNotifications)
    .set({
      subject,
      htmlContent,
      textContent,
      updatedAt: new Date(),
    })
    .where(eq(clientNotifications.id, NOTIFICATION_ID))
    .returning();

  if (!updated) {
    console.error('Notification not found:', NOTIFICATION_ID);
    process.exit(1);
  }

  console.log('✅ Draft notification updated successfully!');
  console.log(`   ID: ${updated.id}`);
  console.log(`   Subject: ${updated.subject}`);
  console.log(`   Status: ${updated.status}`);
  console.log(`   Recipients: ${(updated.recipientEmails || []).join(', ')}`);
  console.log('\n━━━━━━━━━ HTML PREVIEW ━━━━━━━━━');
  console.log(htmlContent);
  console.log('\n━━━━━━━━━ TEXT FALLBACK ━━━━━━━━━');
  console.log(textContent);
  console.log('\n\n✅ To send this notification:');
  console.log(`   POST /api/admin/client-notifications/${updated.id}/send`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
