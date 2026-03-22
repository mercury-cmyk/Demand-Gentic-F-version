/**
 * Generate a branded Mercury email notification for Argyle Executive Forum
 * Pipeline & Engagement dashboard launch notification
 */
import { clientNotificationService } from '../server/services/mercury/client-notification-service';

const ARGYLE_ACCOUNT_ID = '073ac22d-8c16-4db5-bf4f-667021dc0717';
const ARGYLE_CAMPAIGN_ID = '51a13b6a-d7d8-4259-92e6-14b2b9821e4d';

async function main() {
  console.log('🎨 Generating branded email for Argyle Executive Forum...\n');

  // Step 1: Generate AI-powered branded email template
  const template = await clientNotificationService.generateTemplate({
    clientAccountId: ARGYLE_ACCOUNT_ID,
    campaignId: ARGYLE_CAMPAIGN_ID,
    notificationType: 'pipeline_update',
    customPrompt: `This is a notification to Argyle Executive Forum that their Client Portal is now live and ready for use. 
    
Key highlights to communicate:
- Their Pipeline & Engagement Dashboard is live with real-time visibility into their campaign
- Their active campaign "March and April: CIO / IT / Security" is actively running
- Current pipeline stats: 59 pipeline accounts across stages — 31 in Outreach, 14 Engaged, 10 Qualified, 1 Appointment Set
- 39 leads have been delivered and are available for review
- They can log in at https://demandgentic.ai/client-portal/login using their email address
- Features available: Campaign Dashboard, Lead Pipeline Review, Call Recordings & Transcripts, AI-Powered Analytics & Reporting

The email should be addressed to the Argyle team (not a specific person since it goes to 3 people: Joe Rosenberg, Paul Price, and Iliana Lavara).
Include a prominent CTA button linking to https://demandgentic.ai/client-portal/login with text "Access Your Portal".
Mention that they can reach out to their Pivotal B2B account team for any questions.`,
    context: {
      portalUrl: 'https://demandgentic.ai/client-portal/login',
      campaignName: 'March and April: CIO / IT / Security',
      pipelineAccounts: '59',
      outreachStage: '31',
      engagedStage: '14',
      qualifiedStage: '10',
      appointmentSetStage: '1',
      leadsDelivered: '39',
      totalCalls: '39,634',
    },
  });

  console.log('✅ Template generated successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📧 Subject: ${template.subject}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 2: Create the notification as a draft
  const recipients = [
    'jrosenberg@argyleforum.com',
    'pprice@argyleforum.com',
    'ilavara@argyleforum.com',
  ];

  const notification = await clientNotificationService.createNotification({
    clientAccountId: ARGYLE_ACCOUNT_ID,
    campaignId: ARGYLE_CAMPAIGN_ID,
    notificationType: 'pipeline_update',
    subject: template.subject,
    htmlContent: template.htmlContent,
    textContent: template.textContent,
    recipientEmails: recipients,
    status: 'draft',
    aiGenerated: true,
    aiPrompt: 'Pipeline & Engagement Dashboard Launch — Argyle Executive Forum',
    metadata: {
      generatedAt: new Date().toISOString(),
      pipelineStats: { outreach: 31, engaged: 14, qualified: 10, appointmentSet: 1 },
      leadsDelivered: 39,
    },
  });

  console.log(`📋 Draft notification created: ${notification.id}`);
  console.log(`   Status: ${notification.status}`);
  console.log(`   Recipients: ${recipients.join(', ')}`);
  console.log(`   Type: ${notification.notificationType}\n`);

  // Step 3: Output the HTML for preview
  console.log('━━━━━━━━━ HTML PREVIEW ━━━━━━━━━');
  console.log(template.htmlContent);
  console.log('\n━━━━━━━━━ TEXT FALLBACK ━━━━━━━━━');
  console.log(template.textContent);

  console.log('\n\n✅ Draft saved. To send, use:');
  console.log(`   POST /api/admin/client-notifications/${notification.id}/send`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});