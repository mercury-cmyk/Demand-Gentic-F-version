/**
 * Gemini-based audio transcription service
 * Uses Gemini 2.5 Flash for fast, accurate transcription
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db";
import { leads } from "../../shared/schema";
import { eq } from "drizzle-orm";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

interface TranscriptionResult {
  success: boolean;
  transcript?: string;
  error?: string;
}

/**
 * Fetch audio file and convert to base64
 */
async function fetchAudioAsBase64(url: string): Promise {
  try {
    console.log(`[Gemini Transcription] Fetching audio from: ${url.substring(0, 80)}...`);

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Gemini Transcription] Failed to fetch audio: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    // Determine mime type from URL or response headers
    const contentType = response.headers.get('content-type') || 'audio/wav';
    const mimeType = url.includes('.mp3') ? 'audio/mp3' :
                     url.includes('.wav') ? 'audio/wav' :
                     contentType;

    console.log(`[Gemini Transcription] Audio fetched: ${(buffer.length / 1024).toFixed(1)}KB, type: ${mimeType}`);

    return { data: base64, mimeType };
  } catch (error: any) {
    console.error(`[Gemini Transcription] Error fetching audio:`, error.message);
    return null;
  }
}

/**
 * Transcribe audio using Gemini 1.5 Flash
 */
export async function transcribeWithGemini(audioUrl: string): Promise {
  if (!GEMINI_API_KEY) {
    return { success: false, error: "GEMINI_API_KEY not configured" };
  }

  try {
    console.log(`[Gemini Transcription] Starting transcription...`);

    // Fetch audio as base64
    const audio = await fetchAudioAsBase64(audioUrl);
    if (!audio) {
      return { success: false, error: "Failed to fetch audio file" };
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Create the transcription prompt
    const prompt = `Please transcribe this phone call audio accurately.
Format the transcription as a conversation with speaker labels:
- Use "Agent:" for the AI agent/caller
- Use "Contact:" for the person who answered

Transcribe every word spoken, including filler words like "um", "uh", etc.
If you can't understand a word, use [inaudible].
Start the transcription immediately without any preamble.`;

    // Send to Gemini with audio
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: audio.mimeType,
          data: audio.data,
        },
      },
    ]);

    const response = result.response;
    const transcript = response.text();

    if (transcript && transcript.trim().length > 0) {
      console.log(`[Gemini Transcription] ✅ Success - ${transcript.length} chars`);
      return { success: true, transcript: transcript.trim() };
    } else {
      return { success: false, error: "Empty transcript returned" };
    }
  } catch (error: any) {
    console.error(`[Gemini Transcription] Error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Transcribe a lead's recording using Gemini
 */
export async function transcribeLeadWithGemini(leadId: string): Promise {
  console.log(`[Gemini Transcription] Processing lead: ${leadId}`);

  // Get lead with recording URL
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!lead) {
    console.error(`[Gemini Transcription] Lead not found: ${leadId}`);
    return false;
  }

  if (!lead.recordingUrl) {
    console.error(`[Gemini Transcription] No recording URL for lead: ${leadId}`);
    return false;
  }

  // Update status to processing
  await db
    .update(leads)
    .set({ transcriptionStatus: "processing" })
    .where(eq(leads.id, leadId));

  // Transcribe
  const result = await transcribeWithGemini(lead.recordingUrl);

  if (result.success && result.transcript) {
    // Update lead with transcript
    await db
      .update(leads)
      .set({
        transcript: result.transcript,
        transcriptionStatus: "completed",
      })
      .where(eq(leads.id, leadId));

    console.log(`[Gemini Transcription] ✅ Lead ${leadId} transcribed successfully`);
    return true;
  } else {
    // Update status to failed
    await db
      .update(leads)
      .set({
        transcriptionStatus: "failed",
        notes: lead.notes ? `${lead.notes}\nTranscription error: ${result.error}` : `Transcription error: ${result.error}`,
      })
      .where(eq(leads.id, leadId));

    console.error(`[Gemini Transcription] ❌ Lead ${leadId} transcription failed: ${result.error}`);
    return false;
  }
}