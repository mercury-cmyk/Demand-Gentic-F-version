import { leads } from "@shared/schema";
import { InferSelectModel } from "drizzle-orm";

type Lead = InferSelectModel;

export function validateLeadQuality(lead: Lead): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Check for Recording
  // We accept either a direct URL or an S3 key (which implies a stored recording)
  if (!lead.recordingUrl && !lead.recordingS3Key) {
    errors.push("Missing call recording (URL or S3 Key)");
  }

  // 2. Check for Transcription
  // We check for raw transcript text or structured transcript JSON
  const hasTranscript = (lead.transcript && lead.transcript.trim().length > 0);
  const hasStructuredTranscript = !!lead.structuredTranscript;
  
  if (!hasTranscript && !hasStructuredTranscript) {
    errors.push("Missing call transcription");
  }

  // 3. Check for AI Analysis
  // We check if the analysis JSON exists
  if (!lead.aiAnalysis) {
    errors.push("Missing AI analysis");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}