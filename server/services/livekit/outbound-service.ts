import { db } from "../../db";
import { dialerCallAttempts, campaigns, contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { selectNumber, recordCallOutcome } from "../number-pool/number-router-service";
import { Buffer } from 'buffer';

// Configuration
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const LIVEKIT_SIP_URI = process.env.LIVEKIT_SIP_URI; // e.g., sip:my-room@my-project.sip.livekit.cloud
const BASE_URL = process.env.BASE_URL || 'https://demandgentic.ai';

if (!TELNYX_API_KEY) console.error("[LiveKit Outbound] Missing TELNYX_API_KEY");

interface OutboundCallContext {
  contactId: string;
  campaignId: string;
  queueItemId?: string;
  overridePhoneNumber?: string;
  existingCallAttemptId?: string;
}

/**
 * Initiates an outbound call using the Number Pool and bridges it to LiveKit
 */
export async function startOutboundCall(context: OutboundCallContext) {
  if (!LIVEKIT_SIP_URI) {
    throw new Error("LIVEKIT_SIP_URI is not configured in environment variables");
  }

  // 1. Fetch Contact & Campaign Data
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, context.contactId)).limit(1);
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, context.campaignId)).limit(1);

  if (!contact || !campaign) throw new Error("Invalid contact or campaign ID");

  const phoneNumber = context.overridePhoneNumber || contact.directPhone || contact.workPhone;
  if (!phoneNumber) throw new Error("Contact has no phone number");

  // 2. Select Best Number from Pool (Rotates your 49 numbers)
  const numberSelection = await selectNumber({
    campaignId: context.campaignId,
    prospectNumber: phoneNumber,
    prospectRegion: contact.state || undefined,
  });

  console.log(`[LiveKit Outbound] Selected number ${numberSelection.numberE164} for prospect ${phoneNumber}`);

  // 3. Create or Update Call Attempt Record
  let attempt;
  if (context.existingCallAttemptId) {
    [attempt] = await db.update(dialerCallAttempts).set({
      phoneDialed: phoneNumber,
      numberPoolId: numberSelection.numberId,
      status: 'initiating',
      startedAt: new Date(),
    })
    .where(eq(dialerCallAttempts.id, context.existingCallAttemptId))
    .returning();
  } else {
    [attempt] = await db.insert(dialerCallAttempts).values({
      campaignId: context.campaignId,
      contactId: context.contactId,
      queueItemId: context.queueItemId,
      phoneDialed: phoneNumber,
      numberPoolId: numberSelection.numberId,
      status: 'initiating',
      startedAt: new Date(),
    }).returning();
  }

  // 4. Construct Client State (Context for LiveKit Agent)
  // This will be passed to Telnyx, echoed back in webhooks, and then sent to LiveKit via SIP headers
  const clientStateObj = {
    call_attempt_id: attempt.id,
    campaign_id: campaign.id,
    contact_id: contact.id,
    queue_item_id: context.queueItemId,
    contact_name: `${contact.firstName} ${contact.lastName}`,
    contact_first_name: contact.firstName,
    contact_job_title: (contact as any).jobTitle,
    account_name: (contact as any).companyName,
    organization_name: (campaign as any).organizationName || 'Pivotal B2B',
    campaign_name: campaign.name,
    campaign_purpose: (campaign as any).purpose,
    // Pass selected number info so we can track reputation later
    caller_number_id: numberSelection.numberId,
    to_number: phoneNumber
  };

  const clientStateBase64 = Buffer.from(JSON.stringify(clientStateObj)).toString('base64');

  // 5. Initiate Call via Telnyx Call Control
  // We dial the PROSPECT first. When they answer, we bridge to LiveKit.
  const response = await fetch('https://api.telnyx.com/v2/calls', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TELNYX_API_KEY}`
    },
    body: JSON.stringify({
      to: phoneNumber,
      from: numberSelection.numberE164,
      connection_id: process.env.TELNYX_CONNECTION_ID, // Your Telnyx App ID
      webhook_url: `${BASE_URL}/api/webhooks/telnyx-livekit`,
      webhook_url_method: "POST",
      // Pass state to be echoed back in webhooks
      client_state: clientStateBase64,
      // Standard answering machine detection
      answering_machine_detection: 'detect',
      answering_machine_detection_config: {
        total_analysis_time_millis: 3500
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telnyx Call Failed: ${err}`);
  }

  const callData = await response.json();
  return { callId: callData.data.call_control_id, attemptId: attempt.id };
}

/**
 * Handles Telnyx Webhooks to bridge answered calls to LiveKit
 */
export async function handleTelnyxEvent(event: any) {
  const { event_type, payload } = event.data;
  const callControlId = payload.call_control_id;
  const clientState = payload.client_state; // This is our Base64 context

  console.log(`[Telnyx Event] ${event_type} for ${callControlId}`);

  if (event_type === 'call.answered') {
    if (!LIVEKIT_SIP_URI) {
      console.error("[LiveKit Outbound] Cannot bridge: LIVEKIT_SIP_URI missing");
      return;
    }

    console.log(`[LiveKit Outbound] 📞 Call answered! Bridging to LiveKit: ${LIVEKIT_SIP_URI}`);

    // Bridge the prospect to LiveKit SIP Ingress
    // We pass the client_state as a SIP Header so the LiveKit Worker can read it
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/dial`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`
      },
      body: JSON.stringify({
        to: LIVEKIT_SIP_URI,
        custom_headers: [
          { name: "X-Client-State", value: clientState }
        ]
      })
    });
  }
  
  else if (event_type === 'call.hangup') {
    // Handle call completion and number pool stats
    if (clientState) {
      try {
        const state = JSON.parse(Buffer.from(clientState, 'base64').toString());
        if (state.caller_number_id) {
          // Update number pool stats (calls today, etc.)
          await recordCallOutcome(state.caller_number_id, {
            answered: payload.start_time && payload.end_time,
            durationSec: payload.duration || 0,
            disposition: payload.hangup_cause || 'unknown',
            failed: false,
            prospectNumber: state.to_number
          });
        }
      } catch (e) {
        console.error("[LiveKit Outbound] Failed to parse client_state on hangup", e);
      }
    }
  }
}