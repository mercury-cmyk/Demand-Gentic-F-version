import { type JobContext, WorkerOptions, Cli, defineAgent, llm, MultimodalAgent } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { z } from 'zod';
import { db } from "../../db";
import { contacts, campaigns, campaignQueue, dialerCallAttempts, callSessions, type CanonicalDisposition } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { processDisposition } from "../disposition-engine";
import { createCallSessionSafely } from '../../lib/call-session-factory';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Types & Interfaces (Ported from gemini-live-dialer.ts) ---

interface CallContext {
  contactName?: string;
  contactFirstName?: string;
  contactJobTitle?: string;
  accountName?: string;
  organizationName?: string;
  campaignName?: string;
  campaignPurpose?: string;
  campaignType?: string;
  firstMessage?: string;
  campaignObjective?: string;
  successCriteria?: string;
  targetAudienceDescription?: string;
  productServiceInfo?: string;
  talkingPoints?: string[];
  maxCallDurationSeconds?: number;
  queueItemId?: string;
  callAttemptId?: string;
  campaignId?: string;
  contactId?: string;
  phoneNumber?: string;
  disposition?: CanonicalDisposition;
  callerNumberId?: string | null;
}

// --- Helper Functions (Ported) ---

function substitutePromptPlaceholders(prompt: string, context: CallContext): string {
  let result = prompt;
  const substitutions: Record<string, string | undefined> = {
    '{{contact.full_name}}': context.contactName,
    '{{contact.fullName}}': context.contactName,
    '{{contact.first_name}}': context.contactFirstName,
    '{{contact.firstName}}': context.contactFirstName,
    '{{contact.job_title}}': context.contactJobTitle,
    '{{contact.jobTitle}}': context.contactJobTitle,
    '{{account.name}}': context.accountName,
    '{{org.name}}': context.organizationName || 'Pivotal B2B',
    '{{organization.name}}': context.organizationName || 'Pivotal B2B',
    '{{agent.name}}': context.organizationName || 'Pivotal B2B',
    '{{campaign.name}}': context.campaignName,
    '{{campaign.purpose}}': context.campaignPurpose,
  };

  for (const [placeholder, value] of Object.entries(substitutions)) {
    if (value) {
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
  }
  return result;
}

function buildDemandGenticIdentityPreamble(context: CallContext): string {
  const orgRef = context.organizationName || 'Pivotal B2B';
  let talkingPointsStr = '';
  if (context.talkingPoints && Array.isArray(context.talkingPoints) && context.talkingPoints.length > 0) {
    talkingPointsStr = context.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');
  }

  let reasonForCalling = '';
  if (context.productServiceInfo) {
    reasonForCalling = context.productServiceInfo.substring(0, 150);
  } else if (talkingPointsStr) {
    reasonForCalling = "I wanted to have a quick conversation about some opportunities that might be relevant to you";
  } else {
    reasonForCalling = "I'm reaching out to learn more about your current priorities and see if there might be some synergies";
  }

  return `## CRITICAL: CONVERSATION INITIATION RULES

**DO NOT SPEAK until you receive a specific instruction message from the system.**

This is an OUTBOUND call. The call flow is:
1. You will receive audio from the phone connection
2. The human will answer and typically say "Hello?" or similar
3. ONLY THEN will you receive an instruction telling you what to say
4. Follow that instruction EXACTLY

**If you hear audio but haven't received an instruction to speak yet, STAY SILENT.**

---

## YOUR IDENTITY (CRITICAL)

You are an AI voice assistant calling on behalf of ${orgRef}.

**How to introduce yourself after identity is confirmed:**
- Say: "I'm calling on behalf of ${orgRef}."
- Do NOT say your name is "Agent Name" or any placeholder
${context.contactName ? `
**The person you are calling:**
- Contact Name: ${context.contactName}
- Use their name naturally in conversation: "${context.contactFirstName || context.contactName}"
` : ''}${context.contactJobTitle ? `- Job Title: ${context.contactJobTitle}` : ''}${context.accountName ? `
- Company: ${context.accountName}` : ''}

**Opening (after phone is answered):**
"Hello, may I please speak with ${context.contactName || '[the contact]'}${context.contactJobTitle ? `, the ${context.contactJobTitle}` : ''}${context.accountName ? ` at ${context.accountName}` : ''}?"

## CRITICAL: GATEKEEPER vs RIGHT PARTY DETECTION

**LISTEN CAREFULLY to the response after your opening. You MUST determine WHO you're speaking with:**

### GATEKEEPER RESPONSES (someone OTHER than the contact):
- "Who's calling?" / "What's this regarding?"
- "May I ask what this is about?"
- "Let me check if they're available"

**HOW TO HANDLE GATEKEEPERS:**
1. Be polite and professional: "I'm calling on behalf of ${orgRef}"
2. If they ask what it's about, be brief: "I'm following up on a business matter with ${context.contactName || 'them'}"
3. If they can transfer you: "That would be great, thank you"
4. If the person is unavailable: "When would be a good time to reach them?" then use submit_disposition with "no_answer" and end_call

### RIGHT PARTY RESPONSES (the actual contact you're calling):
- "Yes" / "Yeah" / "That's me" / "Speaking"
- "This is ${context.contactName || '[name]'}"

**HOW TO HANDLE RIGHT PARTY:**
Only AFTER they confirm identity, proceed to introduce yourself and your purpose.

${context.campaignObjective ? `## INTERNAL CAMPAIGN OBJECTIVE (DO NOT SAY THIS TO THE PROSPECT)
Your internal goal for this call is: ${context.campaignObjective}
` : ''}

${context.productServiceInfo ? `## WHAT TO SAY ABOUT YOUR OFFERING
When explaining what you do, say something like:
"${context.productServiceInfo}"
` : ''}${talkingPointsStr ? `## KEY TALKING POINTS
${talkingPointsStr}
` : ''}

## IDENTITY CONFIRMATION RESPONSE (AFTER THEY CONFIRM)

After receiving explicit confirmation, respond promptly:
1. Give a very brief acknowledgment (optional): "Thanks for confirming."
2. IMMEDIATELY deliver identity + purpose in the same turn:
  "This is [Agent] calling on behalf of ${orgRef}. Quick reason for my call: ${reasonForCalling}"
3. Ask one concise engagement question.

## RECORDING CALL OUTCOME (CRITICAL)

BEFORE ending any call, you MUST call \`submit_disposition\` to record the call outcome.
`;
}

// --- LiveKit Agent Definition ---

export default defineAgent({
  entry: async (ctx: JobContext) => {
    console.log('[LiveKit Worker] 🚀 New job started');
    await ctx.connect();
    console.log('[LiveKit Worker] ✅ Connected to room:', ctx.room.name);

    // 1. Extract Call Context from SIP Headers or Metadata
    // LiveKit SIP passes headers in participant attributes or metadata
    let callContext: CallContext = {};
    const participant = await ctx.waitForParticipant();
    
    console.log('[LiveKit Worker] 👤 Participant connected:', participant.identity);
    console.log('[LiveKit Worker] 📋 Participant attributes:', participant.attributes);

    // Try to parse client_state from attributes (passed via SIP X-Client-State header)
    const clientStateB64 = participant.attributes?.['client_state'] || participant.attributes?.['X-Client-State'];
    
    if (clientStateB64) {
      try {
        const config = JSON.parse(Buffer.from(clientStateB64, 'base64').toString());
        callContext = {
          contactName: config.contact_name || config.contactName,
          contactFirstName: config.contact_first_name || config.contactFirstName,
          contactJobTitle: config.contact_job_title || config.contactJobTitle,
          accountName: config.account_name || config.accountName,
          organizationName: config.organization_name || config.organizationName,
          campaignName: config.campaign_name || config.campaignName,
          campaignPurpose: config.campaign_purpose || config.campaignPurpose,
          firstMessage: config.first_message || config.firstMessage,
          campaignObjective: config.campaign_objective || config.campaignObjective,
          successCriteria: config.success_criteria || config.successCriteria,
          targetAudienceDescription: config.target_audience_description || config.targetAudienceDescription,
          productServiceInfo: config.product_service_info || config.productServiceInfo,
          talkingPoints: config.talking_points || config.talkingPoints,
          maxCallDurationSeconds: Number(config.max_call_duration_seconds || config.maxCallDurationSeconds),
          queueItemId: config.queue_item_id || config.queueItemId,
          callAttemptId: config.call_attempt_id || config.callAttemptId,
          campaignId: config.campaign_id || config.campaignId,
          contactId: config.contact_id || config.contactId,
          phoneNumber: config.to_number || config.toNumber || config.phone_number,
          callerNumberId: config.caller_number_id || config.callerNumberId,
        };
        console.log('[LiveKit Worker] ✅ Parsed Call Context:', JSON.stringify(callContext, null, 2));
      } catch (e) {
        console.error('[LiveKit Worker] ❌ Failed to parse client_state:', e);
      }
    }

    // 1b. Create call session with room name for webhook correlation
    if (callContext.callAttemptId) {
      try {
        const session = await createCallSessionSafely({
          toNumberE164: callContext.phoneNumber || 'unknown',
          startedAt: new Date(),
          status: 'connecting',
          agentType: 'ai',
          aiAgentId: 'livekit-gemini',
          aiConversationId: ctx.room.name,
          campaignId: callContext.campaignId || null,
          contactId: callContext.contactId || null,
          queueItemId: callContext.queueItemId || null,
          validateCampaignId: true,
          validateContactId: true,
        });

        if (session) {
          await db.update(dialerCallAttempts)
            .set({ callSessionId: session.id })
            .where(eq(dialerCallAttempts.id, callContext.callAttemptId));
          console.log(`[LiveKit Worker] ✅ Created call session ${session.id} for room ${ctx.room.name}`);
        }
      } catch (err) {
        console.error('[LiveKit Worker] Failed to create call session:', err);
      }
    }

    // 2. Define Tools
    const fncCtx = new llm.FunctionContext();

    fncCtx.register({
      name: 'book_appointment',
      description: 'Books an appointment or meeting for the user. Call this when the user confirms a date and time.',
      parameters: z.object({
        date: z.string().describe('The date of the appointment (YYYY-MM-DD)'),
        time: z.string().describe('The time of the appointment (HH:mm)'),
        notes: z.string().optional().describe('Any additional notes or context for the meeting'),
      }),
      execute: async ({ date, time, notes }) => {
        console.log(`[LiveKit Worker] 📅 Booking appointment: ${date} at ${time}`);
        // In a real implementation, save to DB here
        return `Success: Appointment confirmed for ${date} at ${time}.`;
      },
    });

    fncCtx.register({
      name: 'lookup_lead_info',
      description: 'Looks up information about a lead or contact from the database using their email or phone number.',
      parameters: z.object({
        email: z.string().optional().describe('The email address of the contact to look up.'),
        phone: z.string().optional().describe('The phone number of the contact to look up.'),
      }),
      execute: async ({ email, phone }) => {
        console.log(`[LiveKit Worker] 🔍 Looking up lead: ${email || phone}`);
        try {
          const conditions = [];
          if (email) conditions.push(eq(contacts.email, email));
          if (phone) conditions.push(eq(contacts.directPhone, phone));

          const results = conditions.length > 0 
            ? await db.select().from(contacts).where(or(...conditions)).limit(1)
            : [];

          if (results.length > 0) {
            const contact = results[0];
            return {
              found: true,
              name: `${contact.firstName} ${contact.lastName}`,
              email: contact.email,
              phone: contact.directPhone,
              jobTitle: (contact as any).jobTitle || (contact as any).title,
              company: (contact as any).companyName
            };
          }
          return { found: false, message: "No contact found." };
        } catch (err) {
          console.error('[LiveKit Worker] Lookup failed:', err);
          return { found: false, error: "Database error." };
        }
      },
    });

    fncCtx.register({
      name: 'submit_disposition',
      description: 'Submit the call outcome/disposition. Call this BEFORE end_call.',
      parameters: z.object({
        disposition: z.enum(['qualified_lead', 'not_interested', 'do_not_call', 'voicemail', 'no_answer', 'invalid_data', 'callback_requested', 'gatekeeper_block', 'needs_review'])
          .describe('The call outcome'),
        notes: z.string().optional().describe('Brief notes about the call'),
        callback_date: z.string().optional().describe('If callback_requested, the preferred date/time'),
        interest_level: z.string().optional().describe('Level of interest: high, medium, low, none'),
      }),
      execute: async ({ disposition, notes, callback_date, interest_level }) => {
        console.log(`[LiveKit Worker] 📊 Disposition submitted: ${disposition}`);
        
        if (callContext.callAttemptId) {
          try {
            // Map to canonical
            let canonical: CanonicalDisposition = 'no_answer';
            if (['qualified_lead', 'not_interested', 'do_not_call', 'voicemail', 'no_answer', 'invalid_data', 'callback_requested'].includes(disposition)) {
              canonical = disposition as CanonicalDisposition;
            } else if (disposition === 'gatekeeper_block' || disposition === 'needs_review') {
              canonical = 'no_answer';
            }

            callContext.disposition = canonical;
            await processDisposition(callContext.callAttemptId, canonical, 'livekit_agent');
            
            // Update queue item
            if (callContext.queueItemId) {
              let status = 'queued';
              if (canonical === 'qualified_lead' || canonical === 'not_interested') status = 'done';
              if (canonical === 'do_not_call' || canonical === 'invalid_data') status = 'removed';
              
              await db.update(campaignQueue)
                .set({ status: status as any, updatedAt: new Date(), enqueuedReason: `AI Disposition: ${disposition}` })
                .where(eq(campaignQueue.id, callContext.queueItemId));
            }
            return `Disposition "${disposition}" recorded. You can now end the call.`;
          } catch (err) {
            console.error('[LiveKit Worker] Failed to process disposition:', err);
            return "Error recording disposition.";
          }
        }
        return "Disposition received (no tracking ID).";
      },
    });

    fncCtx.register({
      name: 'end_call',
      description: 'Ends the phone call gracefully. Call this AFTER saying goodbye.',
      parameters: z.object({
        reason: z.string().describe('Reason for ending the call'),
      }),
      execute: async ({ reason }) => {
        console.log(`[LiveKit Worker] 👋 Ending call. Reason: ${reason}`);
        // LiveKit agent will disconnect automatically if we return or if we explicitly disconnect
        // We can trigger a disconnect on the room
        setTimeout(() => {
            ctx.room.disconnect();
        }, 1000);
        return "Call ending initiated.";
      },
    });

    // 3. Build System Prompt
    const identityPreamble = buildDemandGenticIdentityPreamble(callContext);
    let basePrompt = "You are a helpful AI assistant."; // Default
    // If we have a custom prompt in context (passed via client_state), use it
    // Otherwise use the default system prompt logic
    // For now, we'll just use the preamble + base
    const systemPrompt = identityPreamble + basePrompt;

    // 4. Initialize Gemini Agent
    const agent = new google.MultimodalAgent({
      model: 'gemini-2.0-flash-exp', // Or use env var
      fncCtx,
      systemInstruction: systemPrompt,
    });

    // 5. Start Agent
    console.log('[LiveKit Worker] 🎙️ Starting Gemini Agent');
    await agent.start(ctx.room, participant);

    // 6. Handle Opening Message (Wait for human or speak first)
    // For outbound calls, we usually wait for "Hello?"
    // LiveKit VAD will handle this naturally.
    // If we want to speak first (e.g. after silence), we can use agent.say()
    
    // Example: Wait 2 seconds, if no user speech, say hello
    setTimeout(() => {
        // Check if user has spoken (agent.isSpeaking or similar state)
        // This is simplified; real implementation might use events
    }, 2000);

    // Handle disconnection
    ctx.room.on('disconnected', async () => {
        console.log('[LiveKit Worker] 🔌 Room disconnected');
        // Handle fallback disposition if needed
        if (callContext.callAttemptId && !callContext.disposition) {
            console.log('[LiveKit Worker] ⚠️ Call ended without disposition - marking no_answer');
            await processDisposition(callContext.callAttemptId, 'no_answer', 'livekit_disconnect');
        }
    });
  },
});

// Export a runner function for server/index.ts
export async function startLiveKitWorker() {
    // This runs the worker in the same process
    // We need to construct the CLI or Worker manually if not using the CLI entry point
    // However, @livekit/agents usually expects to be the main entry point.
    // For embedded usage, we can use the Worker class directly.
    
    const { Worker } = await import('@livekit/agents');
    const { fileURLToPath } = await import('url');
    
    // We need to point to this file as the agent definition
    // Or pass the agent definition directly if supported (depends on SDK version)
    // The SDK typically loads the agent from a file path.
    
    const worker = new Worker({
        agent: fileURLToPath(import.meta.url),
        workerType: 'process', // or 'thread'
        wsURL: process.env.LIVEKIT_URL,
        apiKey: process.env.LIVEKIT_API_KEY,
        apiSecret: process.env.LIVEKIT_API_SECRET,
    });

    worker.run();
}