/**
 * Send the Argyle branded email via Mailgun API directly
 * Bypasses OAuth SMTP provider (disabled) — uses Mailgun HTTP API
 */
import { db } from '../server/db';
import { clientNotifications } from '../shared/schema';
import { eq } from 'drizzle-orm';

const NOTIFICATION_ID = 'a42a6cfd-e999-49b7-b143-cec772c987c1';

async function main() {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error('MAILGUN_API_KEY and MAILGUN_DOMAIN must be set');
    process.exit(1);
  }

  // Load the notification
  const [notification] = await db
    .select()
    .from(clientNotifications)
    .where(eq(clientNotifications.id, NOTIFICATION_ID))
    .limit(1);

  if (!notification) {
    console.error('Notification not found:', NOTIFICATION_ID);
    process.exit(1);
  }

  console.log('📧 Sending Argyle notification via Mailgun API...');
  console.log(`   Subject: ${notification.subject}`);
  console.log(`   Recipients: ${(notification.recipientEmails || []).join(', ')}`);
  console.log(`   Domain: ${MAILGUN_DOMAIN}\n`);

  const recipients = notification.recipientEmails || [];
  let sentCount = 0;

  for (const recipientEmail of recipients) {
    try {
      const formData = new URLSearchParams();
      formData.append('from', `Pivotal B2B <noreply@${MAILGUN_DOMAIN}>`);
      formData.append('to', recipientEmail);
      formData.append('subject', notification.subject);
      formData.append('html', notification.htmlContent);
      if (notification.textContent) {
        formData.append('text', notification.textContent);
      }
      formData.append('h:Reply-To', 'connect@demandgentic.ai');

      const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
      const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (response.ok) {
        const result = await response.json() as { id?: string; message?: string };
        console.log(`   ✅ Sent to ${recipientEmail} — Message ID: ${result.id}`);
        sentCount++;
      } else {
        const errorText = await response.text();
        console.error(`   ❌ Failed to send to ${recipientEmail}: ${response.status} ${errorText}`);
      }
    } catch (err: any) {
      console.error(`   ❌ Error sending to ${recipientEmail}: ${err.message}`);
    }
  }

  // Update notification status
  if (sentCount > 0) {
    await db.update(clientNotifications).set({
      status: 'sent',
      sentAt: new Date(),
      sentBy: 'da0c653b-c853-47b9-82df-de9b7b754378', // zahid.m@pivotal-b2b.com
      updatedAt: new Date(),
    }).where(eq(clientNotifications.id, NOTIFICATION_ID));
  }

  console.log(`\n📊 Result: ${sentCount}/${recipients.length} emails sent successfully`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
