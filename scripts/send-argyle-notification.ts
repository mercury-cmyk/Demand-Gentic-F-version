/**
 * Send the Argyle branded email notification draft
 */
import { clientNotificationService } from '../server/services/mercury/client-notification-service';

const NOTIFICATION_ID = 'a42a6cfd-e999-49b7-b143-cec772c987c1';

async function main() {
  // Preview before sending
  const notification = await clientNotificationService.getNotification(NOTIFICATION_ID);
  if (!notification) {
    console.error('Notification not found:', NOTIFICATION_ID);
    process.exit(1);
  }

  console.log('📧 Sending Argyle notification...');
  console.log(`   Subject: ${notification.subject}`);
  console.log(`   Recipients: ${(notification.recipientEmails || []).join(', ')}`);
  console.log(`   Status: ${notification.status}\n`);

  const result = await clientNotificationService.sendNotification({
    notificationId: NOTIFICATION_ID,
    sentBy: 'da0c653b-c853-47b9-82df-de9b7b754378', // zahid.m@pivotal-b2b.com
  });

  if (result.success) {
    console.log(`✅ Email sent successfully! ${result.sentCount} recipient(s) received the email.`);
  } else {
    console.log(`❌ Send failed: ${result.error}`);
    console.log(`   Sent to ${result.sentCount} of ${(notification.recipientEmails || []).length} recipients`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
