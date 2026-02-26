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
      connection_id: process.env.TELNYX_CALL_CONTROL_APP_ID || process.env.TELNYX_CONNECTION_ID,
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

  // Log full payload for debugging SIP transfer issues
  if (event_type === 'call.hangup' || event_type === 'call.initiated') {
    console.log(`[Telnyx Event Detail] ${event_type}:`, JSON.stringify({
      hangup_cause: payload.hangup_cause,
      hangup_source: payload.hangup_source,
      sip_hangup_cause: payload.sip_hangup_cause,
      from: payload.from,
      to: payload.to,
      direction: payload.direction,
      state: payload.state,
      client_state: payload.client_state ? '(present)' : '(none)',
    }));
  }

  if (event_type === 'call.answered') {
    if (!LIVEKIT_SIP_URI) {
      console.error("[LiveKit Outbound] Cannot bridge: LIVEKIT_SIP_URI missing");
      return;
    }

    // Parse client state to get call_attempt_id for room naming
    let callAttemptId = `call-${Date.now()}`;
    if (clientState) {
      try {
        const state = JSON.parse(Buffer.from(clientState, 'base64').toString());
        callAttemptId = state.call_attempt_id || callAttemptId;
      } catch (e) {
        console.error("[LiveKit Outbound] Failed to parse client_state for room ID", e);
      }
    }

    // Build SIP URI with user part — LiveKit dispatch rule needs this to create a room
    // LIVEKIT_SIP_URI = "sip:demandgentic-wmczsvyo.sip.livekit.cloud"
    // We need: "sip:<user>@demandgentic-wmczsvyo.sip.livekit.cloud"
    const sipHost = LIVEKIT_SIP_URI.replace('sip:', '');
    const sipUri = `sip:${callAttemptId}@${sipHost}`;

    console.log(`[LiveKit Outbound] 📞 Call answered! Bridging to LiveKit: ${sipUri}`);

    // Bridge the prospect to LiveKit SIP Ingress
    // Trunk uses IP-based auth (0.0.0.0/0) so no SIP credentials needed
    const bridgeResponse = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`
      },
      body: JSON.stringify({
        to: sipUri,
        from: payload.from,
        // Pass client state via custom SIP headers (LiveKit maps X-Client-State → client_state attribute)
        custom_headers: [
          { name: "X-Client-State", value: clientState }
        ],
        webhook_url: `${BASE_URL}/api/webhooks/telnyx-livekit`,
        webhook_url_method: "POST",
      })
    });

    const bridgeResult = await bridgeResponse.text();
    if (!bridgeResponse.ok) {
      console.error(`[LiveKit Outbound] ❌ Bridge failed (${bridgeResponse.status}):`, bridgeResult);
    } else {
      console.log(`[LiveKit Outbound] ✅ Bridge transfer initiated to ${sipUri}`);
    }
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