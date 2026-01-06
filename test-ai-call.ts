/**
 * Test AI Call Script
 * Run with: npx tsx test-ai-call.ts
 * 
 * This script initiates a test AI call using the configured campaign and contact.
 */

import { getTelnyxAiBridge } from './server/services/telnyx-ai-bridge';
import { db } from './server/db';
import { campaigns, contacts, accounts, campaignQueue } from './shared/schema';
import { eq } from 'drizzle-orm';

interface AiAgentSettings {
  persona?: {
    name?: string;
    companyName?: string;
    role?: string;
    voice?: string;
  };
  scripts?: {
    opening?: string;
    gatekeeper?: string;
    pitch?: string;
    objections?: string;
    closing?: string;
  };
  handoff?: {
    enabled?: boolean;
    triggers?: string[];
    transferNumber?: string;
  };
}

interface CallContext {
  contactFirstName: string;
  contactLastName: string;
  contactTitle: string;
  contactEmail: string;
  companyName: string;
  phoneNumber: string;
  campaignId: string;
  queueItemId: string;
  agentFullName: string;
}

async function testAiCall() {
  console.log('🚀 Starting AI Call Test...\n');

  // Get campaign
  const campaignId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  
  if (!campaign) {
    console.error('❌ Campaign not found');
    process.exit(1);
  }
  console.log(`✓ Campaign: ${campaign.name}`);

  // Get contact from queue
  const queueItemId = '375a2727-0855-40ce-8d71-2c7ab47ab806';
  const [queueItem] = await db.select().from(campaignQueue).where(eq(campaignQueue.id, queueItemId));
  
  if (!queueItem) {
    console.error('❌ Queue item not found');
    process.exit(1);
  }
  
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, queueItem.contactId));
  if (!contact) {
    console.error('❌ Contact not found');
    process.exit(1);
  }
  console.log(`✓ Contact: ${contact.fullName} (${contact.jobTitle})`);

  // Get account
  const [account] = contact.accountId 
    ? await db.select().from(accounts).where(eq(accounts.id, contact.accountId))
    : [null];
  console.log(`✓ Account: ${account?.name || 'N/A'}`);

  // Get phone number
  const phoneNumber = (contact as any).directPhone || (contact as any).mobilePhone;
  if (!phoneNumber) {
    console.error('❌ Contact has no phone number');
    process.exit(1);
  }
  console.log(`✓ Phone: ${phoneNumber}`);

  // Get AI settings from campaign
  const aiSettings = campaign.aiAgentSettings as AiAgentSettings;
  if (!aiSettings) {
    console.error('❌ No AI agent settings on campaign');
    process.exit(1);
  }
  console.log(`✓ AI Settings: ${aiSettings.persona?.name || 'Default'}`);

  // Check required environment variables
  const fromNumber = process.env.TELNYX_FROM_NUMBER;
  if (!fromNumber) {
    console.error('❌ TELNYX_FROM_NUMBER not set');
    process.exit(1);
  }
  console.log(`✓ From Number: ${fromNumber}`);

  if (!process.env.TELNYX_API_KEY) {
    console.error('❌ TELNYX_API_KEY not set');
    process.exit(1);
  }
  console.log(`✓ Telnyx API Key: configured`);

  // Build call context
  const context: CallContext = {
    contactFirstName: contact.firstName || 'there',
    contactLastName: contact.lastName || '',
    contactTitle: contact.jobTitle || 'Decision Maker',
    contactEmail: contact.email || '',
    companyName: account?.name || 'your company',
    phoneNumber,
    campaignId,
    queueItemId,
    agentFullName: aiSettings.persona?.name || 'UK Export Finance Representative',
  };

  console.log('\n📞 Initiating AI Call...');
  console.log(`   To: ${context.contactFirstName} ${context.contactLastName}`);
  console.log(`   Phone: ${phoneNumber}`);
  console.log(`   Company: ${context.companyName}`);
  console.log('');

  try {
    const bridge = getTelnyxAiBridge();
    const result = await bridge.initiateAiCall(
      phoneNumber,
      fromNumber,
      aiSettings as any,
      context
    );

    console.log('✅ Call initiated successfully!');
    console.log(`   Call ID: ${result.callId}`);
    console.log(`   Call Control ID: ${result.callControlId}`);
    console.log('\n📱 Your phone should ring shortly...');
  } catch (error) {
    console.error('❌ Failed to initiate call:', error);
    process.exit(1);
  }
}

testAiCall().catch(console.error);
