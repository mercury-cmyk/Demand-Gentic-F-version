/**
 * Telnyx Direct Transcription Service
 *
 * Uses Telnyx API directly for all transcription needs:
 * - Real-time transcription during calls via Call Control
 * - Post-call transcription from recordings
 * - Speaker diarization (AI agent vs prospect)
 *
 * This replaces Google Cloud Speech-to-Text for a unified voice stack.
 */

import { db } from "../db";
import { leads, dialerCallAttempts, activityLog, campaigns } from "@shared/schema";
import { eq } from "drizzle-orm";

const LOG_PREFIX = "[TelnyxTranscription]";
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || "";
const TELNYX_API_BASE = "https://api.telnyx.com/v2";

// ==================== TYPES ====================

export interface TranscriptionSegment {
  speaker: "agent" | "prospect" | "unknown";
  text: string;
  startTime: number; // milliseconds
  endTime: number;
  confidence: number;
}

export interface TranscriptionResult {
  success: boolean;
  text: string;
  segments: TranscriptionSegment[];
  wordCount: number;
  durationSeconds: number;
  speakerCount: number;
  confidence: number;
  provider: "telnyx";
  error?: string;
}

export interface RealTimeTranscriptEvent {
  callControlId: string;
  transcriptionData: {
    text: string;
    isFinal: boolean;
    confidence: number;
    speaker?: string;
  };
  timestamp: Date;
}

export interface CallTranscriptAccumulator {
  callControlId: string;
  campaignId: string;
  contactId: string;
  segments: TranscriptionSegment[];
  startedAt: Date;
  lastUpdatedAt: Date;
}

// ==================== REAL-TIME TRANSCRIPTION STORE ====================

// In-memory store for active call transcripts (use Redis in production)
const activeTranscripts = new Map<string, CallTranscriptAccumulator>();

/**
 * Initialize real-time transcription for a call
 */
export function initializeCallTranscription(
  callControlId: string,
  campaignId: string,
  contactId: string
): void {
  activeTranscripts.set(callControlId, {
    callControlId,
    campaignId,
    contactId,
    segments: [],
    startedAt: new Date(),
    lastUpdatedAt: new Date(),
  });

  console.log(`${LOG_PREFIX} 🎙️ Initialized transcription for call ${callControlId}`);
}

/**
 * Add a real-time transcript segment to the accumulator
 */
export function addTranscriptSegment(
  callControlId: string,
  segment: TranscriptionSegment
): void {
  const transcript = activeTranscripts.get(callControlId);
  if (!transcript) {
    console.warn(`${LOG_PREFIX} No active transcript for call ${callControlId}`);
    return;
  }

  transcript.segments.push(segment);
  transcript.lastUpdatedAt = new Date();

  console.log(
    `${LOG_PREFIX} 📝 [${segment.speaker}] ${segment.text.substring(0, 50)}...`
  );
}

/**
 * Get the current transcript for an active call
 */
export function getActiveTranscript(callControlId: string): CallTranscriptAccumulator | null {
  return activeTranscripts.get(callControlId) || null;
}

/**
 * Finalize and retrieve the complete transcript for a call
 */
export function finalizeCallTranscription(callControlId: string): TranscriptionResult | null {
  const transcript = activeTranscripts.get(callControlId);
  if (!transcript) {
    return null;
  }

  const fullText = transcript.segments.map((s) => s.text).join(" ");
  const durationMs = transcript.lastUpdatedAt.getTime() - transcript.startedAt.getTime();
  const avgConfidence =
    transcript.segments.length > 0
      ? transcript.segments.reduce((sum, s) => sum + s.confidence, 0) / transcript.segments.length
      : 0;

  // Clean up
  activeTranscripts.delete(callControlId);

  return {
    success: true,
    text: fullText,
    segments: transcript.segments,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
    durationSeconds: Math.round(durationMs / 1000),
    speakerCount: new Set(transcript.segments.map((s) => s.speaker)).size,
    confidence: avgConfidence,
    provider: "telnyx",
  };
}

// ==================== TELNYX CALL CONTROL TRANSCRIPTION ====================

/**
 * Enable real-time transcription on a Telnyx call
 * Uses Telnyx Call Control transcription_start command
 */
export async function enableCallTranscription(
  callControlId: string,
  options: {
    language?: string;
    interimResults?: boolean;
  } = {}
): Promise<boolean> {
  if (!TELNYX_API_KEY) {
    console.error(`${LOG_PREFIX} TELNYX_API_KEY not configured`);
    return false;
  }

  try {
    const response = await fetch(
      `${TELNYX_API_BASE}/calls/${callControlId}/actions/transcription_start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
        body: JSON.stringify({
          language: options.language || "en",
          interim_results: options.interimResults !== false,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} Failed to enable transcription: ${response.status} - ${errorText}`);
      return false;
    }

    console.log(`${LOG_PREFIX} ✅ Real-time transcription enabled for call ${callControlId}`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error enabling transcription:`, error);
    return false;
  }
}

/**
 * Disable real-time transcription on a Telnyx call
 */
export async function disableCallTranscription(callControlId: string): Promise<boolean> {
  if (!TELNYX_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(
      `${TELNYX_API_BASE}/calls/${callControlId}/actions/transcription_stop`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} Failed to disable transcription: ${response.status} - ${errorText}`);
      return false;
    }

    console.log(`${LOG_PREFIX} ⏹️ Real-time transcription disabled for call ${callControlId}`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error disabling transcription:`, error);
    return false;
  }
}

// ==================== POST-CALL TRANSCRIPTION ====================

/**
 * Transcribe a recording using Telnyx's AI transcription API
 * This is used for post-call transcription from recording URLs
 */
export async function transcribeRecording(recordingUrl: string): Promise<TranscriptionResult> {
  if (!TELNYX_API_KEY) {
    return {
      success: false,
      text: "",
      segments: [],
      wordCount: 0,
      durationSeconds: 0,
      speakerCount: 0,
      confidence: 0,
      provider: "telnyx",
      error: "TELNYX_API_KEY not configured",
    };
  }

  try {
    console.log(`${LOG_PREFIX} 🎤 Submitting recording for transcription: ${recordingUrl.substring(0, 50)}...`);

    // Telnyx AI Transcription API
    const response = await fetch(`${TELNYX_API_BASE}/ai/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        audio_url: recordingUrl,
        language: "en",
        // Enable speaker diarization
        diarize: true,
        // Return word-level timestamps
        timestamps: "word",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} Transcription API error: ${response.status} - ${errorText}`);

      return {
        success: false,
        text: "",
        segments: [],
        wordCount: 0,
        durationSeconds: 0,
        speakerCount: 0,
        confidence: 0,
        provider: "telnyx",
        error: `API error: ${response.status}`,
      };
    }

    const result = await response.json();
    const data = result.data || result;

    // Parse transcription response
    const text = data.text || data.transcript || "";
    const segments: TranscriptionSegment[] = [];

    // Parse speaker-diarized segments if available
    if (data.utterances && Array.isArray(data.utterances)) {
      for (const utterance of data.utterances) {
        segments.push({
          speaker: mapSpeakerLabel(utterance.speaker),
          text: utterance.text || "",
          startTime: utterance.start * 1000 || 0,
          endTime: utterance.end * 1000 || 0,
          confidence: utterance.confidence || 0.9,
        });
      }
    } else if (data.words && Array.isArray(data.words)) {
      // Build segments from word-level data
      let currentSegment: TranscriptionSegment | null = null;
      for (const word of data.words) {
        if (!currentSegment || currentSegment.speaker !== mapSpeakerLabel(word.speaker)) {
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            speaker: mapSpeakerLabel(word.speaker),
            text: word.word || word.text || "",
            startTime: word.start * 1000 || 0,
            endTime: word.end * 1000 || 0,
            confidence: word.confidence || 0.9,
          };
        } else {
          currentSegment.text += " " + (word.word || word.text || "");
          currentSegment.endTime = word.end * 1000 || currentSegment.endTime;
        }
      }
      if (currentSegment) {
        segments.push(currentSegment);
      }
    }

    const durationSeconds = data.audio_duration || data.duration || 0;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const speakerCount = new Set(segments.map((s) => s.speaker)).size || 2;
    const avgConfidence =
      segments.length > 0
        ? segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
        : data.confidence || 0.9;

    console.log(
      `${LOG_PREFIX} ✅ Transcription completed | Words: ${wordCount} | Duration: ${durationSeconds}s | Confidence: ${(avgConfidence * 100).toFixed(1)}%`
    );

    return {
      success: true,
      text,
      segments,
      wordCount,
      durationSeconds,
      speakerCount,
      confidence: avgConfidence,
      provider: "telnyx",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Transcription error:`, error);

    return {
      success: false,
      text: "",
      segments: [],
      wordCount: 0,
      durationSeconds: 0,
      speakerCount: 0,
      confidence: 0,
      provider: "telnyx",
      error: errorMessage,
    };
  }
}

/**
 * Map speaker labels to standardized format
 */
function mapSpeakerLabel(speaker: string | number | undefined): "agent" | "prospect" | "unknown" {
  if (speaker === undefined || speaker === null) return "unknown";
  const label = String(speaker).toLowerCase();

  // Speaker 0 or "speaker_0" is typically the caller (AI agent)
  if (label === "0" || label === "speaker_0" || label === "agent" || label === "a") {
    return "agent";
  }
  // Speaker 1 or "speaker_1" is typically the prospect
  if (label === "1" || label === "speaker_1" || label === "prospect" || label === "b") {
    return "prospect";
  }
  return "unknown";
}

// ==================== LEAD TRANSCRIPTION ====================

/**
 * Transcribe call recording for a lead using Telnyx API
 */
export async function transcribeLeadCall(leadId: string): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Get lead data
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);

    if (!lead || !lead.recordingUrl) {
      console.log(`${LOG_PREFIX} ⚠️ No recording URL for lead: ${leadId}`);
      return false;
    }

    // Log transcription started
    console.log(`${LOG_PREFIX} 🎙️ STARTED: Lead ${leadId} | Recording: ${lead.recordingUrl.substring(0, 50)}...`);

    // Update status to processing
    await db
      .update(leads)
      .set({ transcriptionStatus: "processing" })
      .where(eq(leads.id, leadId));

    // Insert activity log for transcription started
    try {
      await db.insert(activityLog).values({
        entityType: "lead",
        entityId: leadId,
        eventType: "transcription_started",
        payload: {
          recordingUrl: lead.recordingUrl,
          campaignId: lead.campaignId,
          contactId: lead.contactId,
          provider: "telnyx",
        },
        createdBy: null,
      });
    } catch (logErr) {
      console.error(`${LOG_PREFIX} Failed to log transcription_started:`, logErr);
    }

    // Submit for transcription using Telnyx
    const result = await transcribeRecording(lead.recordingUrl);
    const duration = Date.now() - startTime;

    if (!result.success || !result.text) {
      console.error(
        `${LOG_PREFIX} ❌ FAILED: Lead ${leadId} | Duration: ${duration}ms | Error: ${result.error || "No transcript returned"}`
      );

      await db
        .update(leads)
        .set({ transcriptionStatus: "failed" })
        .where(eq(leads.id, leadId));

      // Insert activity log for transcription failed
      try {
        await db.insert(activityLog).values({
          entityType: "lead",
          entityId: leadId,
          eventType: "transcription_failed",
          payload: {
            recordingUrl: lead.recordingUrl,
            campaignId: lead.campaignId,
            contactId: lead.contactId,
            durationMs: duration,
            provider: "telnyx",
            error: result.error || "No transcript returned",
          },
          createdBy: null,
        });
      } catch (logErr) {
        console.error(`${LOG_PREFIX} Failed to log transcription_failed:`, logErr);
      }

      return false;
    }

    // Format transcript with speaker labels for readability
    const formattedTranscript = formatTranscriptWithSpeakers(result.segments, result.text);

    // Save transcript
    await db
      .update(leads)
      .set({
        transcript: formattedTranscript,
        transcriptionStatus: "completed",
      })
      .where(eq(leads.id, leadId));

    console.log(
      `${LOG_PREFIX} ✅ COMPLETED: Lead ${leadId} | Duration: ${duration}ms | Words: ${result.wordCount}`
    );

    // Insert activity log for transcription completed
    try {
      await db.insert(activityLog).values({
        entityType: "lead",
        entityId: leadId,
        eventType: "transcription_completed",
        payload: {
          recordingUrl: lead.recordingUrl,
          campaignId: lead.campaignId,
          contactId: lead.contactId,
          durationMs: duration,
          wordCount: result.wordCount,
          transcriptLength: result.text.length,
          speakerCount: result.speakerCount,
          confidence: result.confidence,
          provider: "telnyx",
        },
        createdBy: null,
      });
    } catch (logErr) {
      console.error(`${LOG_PREFIX} Failed to log transcription_completed:`, logErr);
    }

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    console.error(`${LOG_PREFIX} ❌ ERROR: Lead ${leadId} | Duration: ${duration}ms | Error: ${errorMessage}`);

    await db
      .update(leads)
      .set({ transcriptionStatus: "failed" })
      .where(eq(leads.id, leadId))
      .catch(() => {}); // Ignore if update fails

    // Insert activity log for transcription failed
    try {
      await db.insert(activityLog).values({
        entityType: "lead",
        entityId: leadId,
        eventType: "transcription_failed",
        payload: {
          durationMs: duration,
          error: errorMessage,
          provider: "telnyx",
        },
        createdBy: null,
      });
    } catch (logErr) {
      // Ignore logging errors
    }

    return false;
  }
}

/**
 * Format transcript with speaker labels for readability
 */
function formatTranscriptWithSpeakers(segments: TranscriptionSegment[], fallbackText: string): string {
  if (segments.length === 0) {
    return fallbackText;
  }

  return segments
    .map((segment) => {
      const speakerLabel = segment.speaker === "agent" ? "Agent:" : segment.speaker === "prospect" ? "Contact:" : "Unknown:";
      return `${speakerLabel} ${segment.text}`;
    })
    .join("\n");
}

// ==================== CALL ATTEMPT TRANSCRIPTION ====================

/**
 * Transcribe recording for a call attempt
 */
export async function transcribeCallAttempt(callAttemptId: string): Promise<boolean> {
  try {
    const [attempt] = await db
      .select()
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!attempt || !attempt.recordingUrl) {
      console.log(`${LOG_PREFIX} ⚠️ No recording URL for call attempt: ${callAttemptId}`);
      return false;
    }

    const result = await transcribeRecording(attempt.recordingUrl);

    if (result.success) {
      const formattedTranscript = formatTranscriptWithSpeakers(result.segments, result.text);

      await db
        .update(dialerCallAttempts)
        .set({
          transcript: formattedTranscript,
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, callAttemptId));

      console.log(`${LOG_PREFIX} ✅ Call attempt ${callAttemptId} transcribed | Words: ${result.wordCount}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error transcribing call attempt ${callAttemptId}:`, error);
    return false;
  }
}

// ==================== WEBHOOK HANDLER ====================

/**
 * Handle Telnyx transcription webhook events
 * Called from the main Telnyx webhook handler
 */
export function handleTranscriptionWebhook(
  eventType: string,
  payload: {
    call_control_id: string;
    transcription_data?: {
      transcript: string;
      is_final: boolean;
      confidence: number;
    };
  }
): void {
  const callControlId = payload.call_control_id;

  switch (eventType) {
    case "call.transcription":
      if (payload.transcription_data) {
        const { transcript, is_final, confidence } = payload.transcription_data;

        // Only process final transcriptions for segments
        if (is_final && transcript) {
          addTranscriptSegment(callControlId, {
            speaker: "prospect", // Telnyx transcription captures user speech
            text: transcript,
            startTime: Date.now(),
            endTime: Date.now(),
            confidence: confidence || 0.9,
          });
        }
      }
      break;

    case "call.transcription.stopped":
      console.log(`${LOG_PREFIX} Transcription stopped for call ${callControlId}`);
      break;
  }
}

// ==================== BACKGROUND PROCESSING ====================

/**
 * Background job to process pending transcriptions
 */
export async function processPendingTranscriptions(): Promise<void> {
  try {
    const pendingLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.transcriptionStatus, "pending"))
      .limit(10);

    if (pendingLeads.length > 0) {
      console.log(`${LOG_PREFIX} Processing ${pendingLeads.length} pending transcriptions with Telnyx`);
    }

    for (const lead of pendingLeads) {
      await transcribeLeadCall(lead.id);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing pending transcriptions:`, error);
  }
}

// ==================== EXPORTS ====================

export default {
  // Real-time transcription
  initializeCallTranscription,
  addTranscriptSegment,
  getActiveTranscript,
  finalizeCallTranscription,
  enableCallTranscription,
  disableCallTranscription,

  // Post-call transcription
  transcribeRecording,
  transcribeLeadCall,
  transcribeCallAttempt,

  // Webhook handling
  handleTranscriptionWebhook,

  // Background processing
  processPendingTranscriptions,
};
