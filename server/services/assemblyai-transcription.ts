import { db } from "../db";
import { leads } from "@shared/schema";
import { eq } from "drizzle-orm";

const OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

interface TranscriptionResult {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  error?: string;
}

/**
 * Submit audio URL to OpenAI Whisper for transcription
 */
export async function submitTranscription(audioUrl: string): Promise<string | null> {
  if (!OPENAI_API_KEY) {
    console.error('[Transcription] OpenAI API key not configured');
    return null;
  }

  try {
    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error('[Transcription] Failed to download audio:', audioResponse.statusText);
      return null;
    }

    const audioBlob = await audioResponse.blob();
    
    // Create form data for Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Transcription] Failed to submit transcription:', response.statusText, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[Transcription] Transcription completed successfully');
    
    // Return the text directly since Whisper processes synchronously
    return data.text;
  } catch (error) {
    console.error('[Transcription] Error submitting transcription:', error);
    return null;
  }
}

/**
 * Transcribe call recording for a lead using OpenAI Whisper
 */
export async function transcribeLeadCall(leadId: string): Promise<boolean> {
  try {
    // Get lead data
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);

    if (!lead || !lead.recordingUrl) {
      console.log('[Transcription] No recording URL for lead:', leadId);
      return false;
    }

    // Update status to processing
    await db.update(leads)
      .set({ transcriptionStatus: 'processing' })
      .where(eq(leads.id, leadId));

    // Submit for transcription (OpenAI Whisper is synchronous)
    const transcriptText = await submitTranscription(lead.recordingUrl);
    
    if (!transcriptText) {
      await db.update(leads)
        .set({ transcriptionStatus: 'failed' })
        .where(eq(leads.id, leadId));
      return false;
    }

    // Save transcript
    await db.update(leads)
      .set({
        transcript: transcriptText,
        transcriptionStatus: 'completed',
      })
      .where(eq(leads.id, leadId));
    
    console.log('[Transcription] Transcription completed for lead:', leadId);
    return true;

  } catch (error) {
    console.error('[Transcription] Error transcribing lead call:', error);
    await db.update(leads)
      .set({ transcriptionStatus: 'failed' })
      .where(eq(leads.id, leadId))
      .catch(() => {}); // Ignore if update fails
    return false;
  }
}

/**
 * Background job to process pending transcriptions
 */
export async function processPendingTranscriptions(): Promise<void> {
  try {
    const pendingLeads = await db.select()
      .from(leads)
      .where(eq(leads.transcriptionStatus, 'pending'))
      .limit(10);

    for (const lead of pendingLeads) {
      await transcribeLeadCall(lead.id);
    }
  } catch (error) {
    console.error('[Transcription] Error processing pending transcriptions:', error);
  }
}
