import { Router, Request, Response } from "express";
import { verifyApiKey, verifyHmac } from "../lib/webhookVerify";
import { db } from "../db";
import { contentEvents, insertContentEventSchema, leads, calls, campaignQueue, suppressionPhones, campaignSuppressionAccounts, callSessions, activityLog } from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import { eq, or, and, sql } from "drizzle-orm";
import { mapTelnyxHangupCause, shouldTriggerSuppression } from "../lib/contact-suppression";
import { updateContactSuppression } from "../services/disposition-engine";

const router = Router();

// Webhook event payload schema
const webhookEventSchema = z.object({
  api_key: z.string(),
  event: z.enum(["page_view", "form_submission"]),
  data: z.object({
    content_type: z.string().optional(),
    content_id: z.string().optional(),
    slug: z.string().optional(),
    title: z.string().optional(),
    community: z.string().optional(),
    contact_id: z.string().optional(),
    email: z.string().optional(),
    url: z.string().optional(),
    form_id: z.string().optional(),
    fields: z.record(z.any()).optional(),
    ts: z.string()
  })
});

/**
 * Webhook receiver for Resources Centre events (page_view, form_submission)
 * Security: HMAC-SHA256 signature validation + API key
 * Deduplication: unique constraint on uniq_key
 */
router.post("/resources-centre", async (req, res) => {
  try {
    const {
      WEBHOOK_API_KEY,
      WEBHOOK_SHARED_SECRET,
      SIG_TTL_SECONDS = "300"
    } = process.env;

    if (!WEBHOOK_API_KEY || !WEBHOOK_SHARED_SECRET) {
      console.error("Missing webhook configuration");
      return res.status(500).json({ status: "error", message: "Webhook not configured" });
    }

    // Verify API key
    if (!verifyApiKey(req, WEBHOOK_API_KEY)) {
      console.warn("Webhook: Invalid API key");
      return res.status(401).json({ status: "error", message: "Invalid API key" });
    }

    // Verify HMAC signature
    if (!verifyHmac(req, WEBHOOK_SHARED_SECRET, Number(SIG_TTL_SECONDS))) {
      console.warn("Webhook: Invalid signature or expired timestamp");
      return res.status(401).json({ status: "error", message: "Invalid signature" });
    }

    // Validate payload
    const validation = webhookEventSchema.safeParse(req.body);
    if (!validation.success) {
      console.warn("Webhook: Invalid payload", validation.error);
      return res.status(400).json({ status: "error", message: "Invalid payload" });
    }

    const { event, data } = validation.data;

    // Build deduplication key
    const now = new Date(data.ts || Date.now());
    const dayBucket = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
    const minuteBucket = `${dayBucket}-${now.getUTCHours()}-${now.getUTCMinutes()}`;

    let uniqKey = event;
    if (event === "page_view") {
      // Dedupe: same content + same contact + same day
      uniqKey += `|${data.content_id || ""}|${data.contact_id || ""}|${dayBucket}`;
    } else if (event === "form_submission") {
      // Dedupe: same form + same contact/email + same minute
      uniqKey += `|${data.form_id || ""}|${data.contact_id || data.email || ""}|${minuteBucket}`;
    } else {
      uniqKey += `|${minuteBucket}`;
    }

    // Insert event (ON CONFLICT DO NOTHING via unique constraint)
    try {
      await db.insert(contentEvents).values({
        eventName: event,
        contentType: data.content_type || null,
        contentId: data.content_id || null,
        slug: data.slug || null,
        title: data.title || null,
        community: data.community || null,
        contactId: data.contact_id || null,
        email: data.email || null,
        url: data.url || null,
        payloadJson: data,
        ts: new Date(data.ts),
        uniqKey
      });

      console.log(`Webhook: Stored ${event} event for ${data.contact_id || data.email || "anonymous"}`);
    } catch (e: any) {
      // If duplicate key, silently succeed (deduplication working)
      if (e.code === "23505" || e.message?.includes("unique constraint")) {
        console.log(`Webhook: Duplicate ${event} event ignored (dedupe)`);
      } else {
        throw e;
      }
    }

    return res.json({ status: "ok" });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return res.status(500).json({ status: "error", message: e.message });
  }
});

/**
 * Telnyx webhook schema for recording.completed events
 */
const telnyxWebhookSchema = z.object({
  data: z.object({
    event_type: z.string(),
    id: z.string(),
    occurred_at: z.string(),
    payload: z.object({
      call_control_id: z.string(),
      call_leg_id: z.string(),
      call_session_id: z.string(),
      recording_urls: z.object({
        mp3: z.string().optional(),
        wav: z.string().optional(),
      }),
      public_recording_urls: z.object({
        mp3: z.string().optional(),
        wav: z.string().optional(),
      }).optional(),
    }),
  }),
  meta: z.object({
    attempt: z.number().optional(),
    delivered_to: z.string().optional(),
  }).optional(),
});

/**
 * Verify Telnyx webhook signature
 */
function verifyTelnyxSignature(
  body: string,
  signature: string | undefined,
  timestamp: string | undefined,
  publicKey: string
): boolean {
  if (!signature || !timestamp) {
    return false;
  }

  // Telnyx uses timestamp|body format for signature
  const signedPayload = `${timestamp}|${body}`;
  
  try {
    const verify = crypto.createVerify('sha256');
    verify.update(signedPayload);
    verify.end();
    
    // Signature is base64 encoded
    return verify.verify(publicKey, signature, 'base64');
  } catch (error) {
    console.error('[Telnyx Webhook] Signature verification error:', error);
    return false;
  }
}

/**
 * Telnyx webhook endpoint for Call Control and recording events
 * Handles: recording.completed, call.speak.ended, call.gather.ended, call.answered, call.hangup
 * 
 * Security: Verifies Telnyx signature using public key (optional)
 * 
 * To configure in Telnyx dashboard:
 * 1. Go to Portal > Call Control Apps > Your App > Settings
 * 2. Add webhook URL: https://your-domain.replit.app/api/webhooks/telnyx
 * 3. Enable required events
 */
router.post("/telnyx", async (req, res) => {
  try {
    console.log(`[Telnyx Webhook] Received event:`, JSON.stringify(req.body).substring(0, 500));
    
    const TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY;
    
    // If public key is configured, verify signature for security
    if (TELNYX_PUBLIC_KEY) {
      const signature = req.headers['telnyx-signature-ed25519'] as string | undefined;
      const timestamp = req.headers['telnyx-timestamp-ed25519'] as string | undefined;
      
      const bodyString = JSON.stringify(req.body);
      const isValid = verifyTelnyxSignature(bodyString, signature, timestamp, TELNYX_PUBLIC_KEY);
      
      if (!isValid) {
        console.warn('[Telnyx Webhook] Invalid signature');
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Extract event data - handle different Telnyx payload formats
    const eventData = req.body.data || req.body;
    let eventType = eventData.event_type || req.body.event_type;
    const payload = eventData.payload || eventData;
    const callbackSource = payload.CallbackSource || payload.callback_source;

    if (!eventType && callbackSource === 'call-progress-events') {
      console.log(`[Telnyx Webhook] call-progress event detected (CallStatus=${payload.CallStatus}) - normalizing to call.hangup`);
      payload.call_control_id = payload.call_control_id || payload.CallSid || payload.CallSidLegacy || payload.CallSid;
      payload.call_leg_id = payload.call_leg_id || payload.CallLegId;
      payload.status = payload.CallStatus || payload.CallStatus;
      eventType = 'call.hangup';
    }

    // Handle Cost/Billing events (no event_type)
    if (!eventType && payload.CallbackSource === 'call-cost-events') {
      return res.json({ status: "ignored", reason: "cost_event" });
    }

    if (!eventType) {
      console.log(`[Telnyx Webhook] Received payload without event_type:`, JSON.stringify(payload).substring(0, 200));
      return res.json({ status: "ignored", reason: "missing_event_type" });
    }

    console.log(`[Telnyx Webhook] Processing event: ${eventType}`);

    // Import AI bridge for handling AI call events
    const { getTelnyxAiBridge } = await import('../services/telnyx-ai-bridge');
    const bridge = getTelnyxAiBridge();

    // Handle different event types
    switch (eventType) {
      case 'call.answered':
        console.log(`[Telnyx Webhook] Call answered: ${payload.call_control_id}`);

        // Always mark the call as answered in the bridge for polling to detect
        bridge.markCallAnswered(payload.call_control_id);

        // Check if this is an OpenAI Realtime call by looking at client_state
        let clientState: any = null;
        if (payload.client_state) {
          try {
            clientState = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf-8'));
          } catch (e) {
            // Not base64 encoded or invalid JSON
          }
        }

        // TeXML calls handle streaming automatically via <Stream bidirectionalMode="rtp" />
        // The TeXML endpoint returns XML with <Stream> directive that auto-connects to WebSocket
        if (clientState?.provider === 'openai_realtime') {
          console.log(`[Telnyx Webhook] OpenAI Realtime TeXML call answered: ${payload.call_control_id}`);
          console.log(`[Telnyx Webhook] Streaming handled automatically by TeXML <Stream> verb`);
          return res.json({ status: "ok", event_type: eventType });
        }

        await bridge.handleSimpleWebhookEvent('answered', payload);
        return res.json({ status: "ok", event_type: eventType });

      case 'call.speak.ended':
        console.log(`[Telnyx Webhook] Speak ended: ${payload.call_control_id}`);
        await bridge.handleSimpleWebhookEvent('speak_ended', payload);
        return res.json({ status: "ok", event_type: eventType });

      case 'call.gather.ended':
        console.log(`[Telnyx Webhook] Gather ended: ${payload.call_control_id}, speech: ${payload.speech?.result}`);
        await bridge.handleSimpleWebhookEvent('gather_ended', payload);
        return res.json({ status: "ok", event_type: eventType });

      case 'call.hangup': {
        console.log(`[Telnyx Webhook] Call hangup: ${payload.call_control_id}`);

        // Handle pre-connect hangups (busy, rejected, etc.) for contact suppression
        // These happen before the AI can process disposition, so we handle them here
        const hangupCause = payload.hangup_cause || payload.sip_hangup_cause || 'normal_clearing';
        const mappedOutcome = mapTelnyxHangupCause(hangupCause);

        // Only apply suppression for pre-connect failures (busy, rejected, no_answer, etc.)
        if (shouldTriggerSuppression(mappedOutcome)) {
          // Try to get contact_id from client_state
          let clientStateData: any = null;
          if (payload?.client_state) {
            try {
              clientStateData = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf-8'));
            } catch (e) {
              // Not base64 encoded or invalid JSON, ignore
            }
          }

          // Fallback: get from bridge's state map
          if (!clientStateData) {
            clientStateData = bridge.getClientStateByControlId?.(payload.call_control_id);
          }

          if (clientStateData?.contact_id) {
            try {
              await updateContactSuppression(clientStateData.contact_id, mappedOutcome);
              console.log(`[Telnyx Webhook] Pre-connect hangup: ${hangupCause} -> ${mappedOutcome}, suppression applied for contact ${clientStateData.contact_id}`);
            } catch (err) {
              console.error(`[Telnyx Webhook] Failed to update contact suppression:`, err);
            }
          }
        }

        await bridge.handleSimpleWebhookEvent('hangup', payload);
        return res.json({ status: "ok", event_type: eventType });
      }

      case 'call.machine.detection.ended': {
        // Handle machine/voicemail detection - enforce "NEVER leave voicemail" rule
        const amdResult = payload?.result || payload?.machine_detection_result;
        const amdConfidence = payload?.confidence || payload?.machine_detection_confidence;
        console.log(`[Telnyx Webhook] Machine detection result: ${amdResult} (confidence: ${amdConfidence}) for call ${payload.call_control_id}`);
        
        if (amdResult === 'machine' || amdResult === 'machine_end_beep' || amdResult === 'machine_end_silence' || amdResult === 'machine_end_other') {
          // Machine/voicemail detected - hang up immediately and record disposition
          try {
            const telnyxApiKey = process.env.TELNYX_API_KEY;
            
            // Hang up immediately to avoid leaving voicemail
            await fetch(`https://api.telnyx.com/v2/calls/${payload.call_control_id}/actions/hangup`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${telnyxApiKey}`,
              },
              body: JSON.stringify({ client_state: payload?.client_state }),
            });
            console.log(`[Telnyx Webhook] Hung up machine-detected call ${payload.call_control_id}`);
            
            // Try to get client_state from webhook payload first
            let clientStateData: any = null;
            if (payload?.client_state) {
              try {
                clientStateData = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf-8'));
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            // Fallback: get client_state from bridge's state map if not in webhook
            if (!clientStateData) {
              clientStateData = bridge.getClientStateByControlId(payload.call_control_id);
              if (clientStateData) {
                console.log(`[Telnyx Webhook] Retrieved client state from bridge for call ${payload.call_control_id}`);
              }
            }
            
            // Record voicemail disposition
            if (clientStateData?.queue_item_id) {
              const { db } = await import('../db');
              const { campaignQueue } = await import('@shared/schema');
              const { eq } = await import('drizzle-orm');
              
              // Schedule retry in 3-7 days (random) - voicemail retry logic
              const retryDays = 3 + Math.floor(Math.random() * 5);
              const nextAttemptAt = new Date();
              nextAttemptAt.setDate(nextAttemptAt.getDate() + retryDays);
              
              await db.update(campaignQueue)
                .set({
                  status: 'queued',
                  nextAttemptAt,
                  agentId: null,
                  virtualAgentId: null,
                  lockExpiresAt: null,
                  updatedAt: new Date()
                })
                .where(eq(campaignQueue.id, clientStateData.queue_item_id));
              console.log(`[Telnyx Webhook] 📠 VOICEMAIL DETECTED: Queue ${clientStateData.queue_item_id} | Contact: ${clientStateData.contact_id || 'unknown'} | Retry: ${nextAttemptAt.toISOString()} | Confidence: ${amdConfidence}`);

              // Insert activity log for voicemail detection
              try {
                if (clientStateData.contact_id) {
                  await db.insert(activityLog).values({
                    entityType: 'contact',
                    entityId: clientStateData.contact_id,
                    eventType: 'voicemail_detected',
                    payload: {
                      callControlId: payload.call_control_id,
                      queueItemId: clientStateData.queue_item_id,
                      campaignId: clientStateData.campaign_id || null,
                      amdResult: amdResult,
                      amdConfidence: amdConfidence,
                      nextAttemptAt: nextAttemptAt.toISOString(),
                      retryDays: retryDays,
                    },
                    createdBy: null,
                  });
                }
              } catch (logErr) {
                console.error('[Telnyx Webhook] Failed to log voicemail_detected activity:', logErr);
              }
            } else {
              console.log(`[Telnyx Webhook] AMD detected machine but no queue_item_id available for disposition`);
            }
          } catch (hangupErr) {
            console.error(`[Telnyx Webhook] Failed to process machine-detected call:`, hangupErr);
          }
        } else if (amdResult === 'human' || amdResult === 'human_residence' || amdResult === 'human_business') {
          console.log(`[Telnyx Webhook] 👤 HUMAN DETECTED: Call ${payload.call_control_id} | Type: ${amdResult} | Confidence: ${amdConfidence} - continuing with AI conversation`);

          // Try to get client_state for activity logging
          let clientStateData: any = null;
          if (payload?.client_state) {
            try {
              clientStateData = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf-8'));
            } catch (e) {
              // Ignore parse errors
            }
          }

          // Insert activity log for human detection
          try {
            if (clientStateData?.contact_id) {
              await db.insert(activityLog).values({
                entityType: 'contact',
                entityId: clientStateData.contact_id,
                eventType: 'amd_human_detected',
                payload: {
                  callControlId: payload.call_control_id,
                  campaignId: clientStateData.campaign_id || null,
                  amdResult: amdResult,
                  amdConfidence: amdConfidence,
                },
                createdBy: null,
              });
            }
          } catch (logErr) {
            console.error('[Telnyx Webhook] Failed to log amd_human_detected activity:', logErr);
          }
          // Human detected - the AI conversation will continue normally via the WebSocket stream
        }
        return res.json({ status: "ok", event_type: eventType, amd_result: amdResult });
      }

      case 'recording.completed':
        // Handle recording completed (existing logic)
        break;

      default:
        // Log for traceability but don't treat as error
        console.log(`[Telnyx Webhook] Event type: ${eventType} (no handler)`);
        return res.json({ status: "ignored", event_type: eventType });
    }

    // Recording completed handling (original logic)
    if (eventType !== 'recording.completed') {
      return res.json({ status: "ignored", event_type: eventType });
    }

    const { call_control_id, recording_urls, public_recording_urls } = payload;
    
    // Prefer public URLs, fallback to signed URLs (mp3 preferred over wav)
    const recordingUrl = 
      public_recording_urls?.mp3 || 
      public_recording_urls?.wav || 
      recording_urls.mp3 || 
      recording_urls.wav;

    if (!recordingUrl) {
      console.warn('[Telnyx Webhook] No recording URL in payload');
      return res.status(400).json({ error: "No recording URL" });
    }

    console.log(`[Telnyx Webhook] Processing recording.completed for call_control_id: ${call_control_id}`);

    // Import recording storage service for permanent S3 storage
    const { storeRecordingFromWebhook, isRecordingStorageEnabled } = await import('../services/recording-storage');

    // Update leads table
    const updatedLeads = await db
      .update(leads)
      .set({ 
        recordingUrl,
        recordingStatus: 'completed'
      })
      .where(eq(leads.telnyxCallId, call_control_id))
      .returning({ id: leads.id });

    // Update calls table (for manual calls) - calls table doesn't have recordingStatus
    const updatedCalls = await db
      .update(calls)
      .set({ 
        recordingUrl
      })
      .where(eq(calls.telnyxCallId, call_control_id))
      .returning({ id: calls.id });

    const totalUpdated = updatedLeads.length + updatedCalls.length;

    if (totalUpdated === 0) {
      console.log(`[Telnyx Webhook] No matching lead/call found for call_control_id: ${call_control_id}`);
      // Still return 200 to prevent Telnyx from retrying
      return res.json({ status: "ok", updated: 0, message: "No matching records" });
    }

    console.log(`[Telnyx Webhook] ✅ Updated ${totalUpdated} record(s) with recording URL`);
    
    // Store recordings permanently in S3 (async, don't block webhook response)
    if (isRecordingStorageEnabled()) {
      // Store lead recordings in background
      for (const lead of updatedLeads) {
        storeRecordingFromWebhook(lead.id, recordingUrl).catch((err) => {
          console.error(`[Telnyx Webhook] Failed to store recording in S3 for lead ${lead.id}:`, err);
        });
      }
      console.log(`[Telnyx Webhook] Initiated S3 storage for ${updatedLeads.length} lead recording(s)`);
    }
    
    return res.json({ 
      status: "ok", 
      updated: totalUpdated,
      leads: updatedLeads.length,
      calls: updatedCalls.length,
      s3Storage: isRecordingStorageEnabled() ? 'initiated' : 'disabled'
    });

  } catch (error: any) {
    console.error('[Telnyx Webhook] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ElevenLabs Integration Removed - Using Voice Dialer exclusively
// ============================================================================
// All AI agent disposition handling is performed by Voice Dialer (Gemini/OpenAI)
// See server/services/voice-dialer.ts for unified disposition handling

// Signature verification removed - ElevenLabs integration discontinued

// Disposition mapping removed - ElevenLabs integration discontinued



// ============================================================================
// ElevenLabs Endpoints Removed - Using Voice Dialer exclusively
// ============================================================================
// All AI agent disposition handling is performed by Voice Dialer (Gemini/OpenAI)
// See server/services/voice-dialer.ts

/**
 * Telnyx Recording Sync - Fetch recordings from Telnyx and update call_sessions
 * Uses Telnyx V1 API to look up recordings by dialed number
 */
router.post("/sync-telnyx-recordings", async (req: Request, res: Response) => {
  try {
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    if (!TELNYX_API_KEY) {
      return res.status(400).json({ error: "TELNYX_API_KEY not configured" });
    }

    console.log(`[Telnyx Recording Sync] Starting sync...`);

    // Find call_sessions without recording_url from the last 24 hours
    const sessionsResult = await db.execute(sql`
      SELECT id, to_number_e164, campaign_id, contact_id, created_at, ai_conversation_id
      FROM call_sessions
      WHERE recording_url IS NULL
        AND agent_type = 'ai'
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const sessions = sessionsResult.rows as any[];
    console.log(`[Telnyx Recording Sync] Found ${sessions.length} sessions without recordings`);

    if (sessions.length === 0) {
      return res.json({ status: "ok", message: "No sessions need recording sync", synced: 0 });
    }

    let synced = 0;
    let errors = 0;

    // Fetch recordings from Telnyx V1 API
    for (const session of sessions) {
      try {
        const phoneNumber = session.to_number_e164;
        if (!phoneNumber) continue;

        // Query Telnyx V1 API for recordings to this number
        const response = await fetch(
          `https://api.telnyx.com/v1/recordings?to=${encodeURIComponent(phoneNumber)}`,
          {
            headers: {
              'Authorization': `Bearer ${TELNYX_API_KEY}`,
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          console.log(`[Telnyx Recording Sync] API error for ${phoneNumber}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const recordings = data.data || [];

        if (recordings.length === 0) continue;

        // Find the most recent recording for this phone number
        // Filter by time window (within 5 minutes of session creation)
        const sessionTime = new Date(session.created_at).getTime();
        const matchingRecording = recordings.find((r: any) => {
          const recordingTime = new Date(r.created_at).getTime();
          const timeDiff = Math.abs(recordingTime - sessionTime);
          return timeDiff < 5 * 60 * 1000; // Within 5 minutes
        });

        if (!matchingRecording) continue;

        // Get the download URL (prefer MP3)
        const recordingUrl = matchingRecording.download_urls?.mp3 || matchingRecording.download_urls?.wav;
        
        if (!recordingUrl) continue;

        // Update call_session with recording URL
        await db.execute(sql`
          UPDATE call_sessions 
          SET recording_url = ${recordingUrl}
          WHERE id = ${session.id}
        `);

        // Also update lead if exists
        if (session.contact_id && session.campaign_id) {
          await db.execute(sql`
            UPDATE leads
            SET recording_url = ${recordingUrl}
            WHERE contact_id = ${session.contact_id}
              AND campaign_id = ${session.campaign_id}
          `);
        }

        console.log(`[Telnyx Recording Sync] ✅ Synced recording for ${phoneNumber}`);
        synced++;

      } catch (err: any) {
        console.error(`[Telnyx Recording Sync] Error for session ${session.id}:`, err.message);
        errors++;
      }
    }

    console.log(`[Telnyx Recording Sync] Complete: ${synced} synced, ${errors} errors`);
    return res.json({ 
      status: "ok", 
      message: `Synced ${synced} recordings`,
      synced,
      errors,
      total: sessions.length
    });

  } catch (error: any) {
    console.error('[Telnyx Recording Sync] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
