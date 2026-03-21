import "dotenv/config";
import "../server/env";
import { db } from "../server/db";
import { dealConversations, dealMessages } from "../shared/schema";

async function main() {
  const GMAIL_MESSAGE_ID = "19d0de1d50d095da";
  const GOOGLE_MAILBOX_ID = "3b8ebbdd-373a-4633-80fc-e14d38d05592";
  const FROM_EMAIL = "zahid.m@pivotal-b2b.com";
  const TO_EMAILS = [
    "jrosenberg@argyleforum.com",
    "pprice@argyleforum.com",
    "ilavara@argyleforum.com",
  ];
  const SUBJECT = "Your Pipeline & Engagement Dashboard is Live — Argyle Executive Forum";
  const now = new Date();

  // 1. Create dealConversation
  const [conversation] = await db.insert(dealConversations).values({
    opportunityId: null,
    subject: SUBJECT,
    threadId: null,
    participantEmails: [FROM_EMAIL, ...TO_EMAILS],
    messageCount: 1,
    lastMessageAt: now,
    direction: "outbound",
    status: "active",
  }).returning();

  console.log("Created conversation:", conversation.id);

  // 2. Create dealMessage
  const [message] = await db.insert(dealMessages).values({
    conversationId: conversation.id,
    opportunityId: null,
    m365MessageId: `google:${GOOGLE_MAILBOX_ID}:${GMAIL_MESSAGE_ID}`,
    fromEmail: FROM_EMAIL,
    toEmails: TO_EMAILS,
    ccEmails: [],
    subject: SUBJECT,
    bodyPreview: "Your Pipeline & Engagement Dashboard is Live for the Argyle Executive Forum campaign. View your real-time dashboard at the client portal.",
    bodyContent: "<p>Branded HTML email sent to Argyle team.</p>",
    direction: "outbound",
    messageStatus: "delivered",
    sentAt: now,
    receivedAt: now,
    isFromCustomer: false,
    hasAttachments: false,
    importance: "normal",
  }).returning();

  console.log("Created deal message:", message.id);
  console.log("\n✅ Sent record created — should now appear in Inbox → Sent folder.");
}

main().catch((err) => {
  console.error("❌ Error:", err.message || err);
  process.exit(1);
});
