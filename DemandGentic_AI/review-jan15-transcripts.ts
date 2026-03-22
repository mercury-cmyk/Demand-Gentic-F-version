import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { writeFileSync } from "fs";

const TRANSCRIPT_MARKER = "[Call Transcript]";

const VOICEMAIL = /(voicemail|leave (me )?a message|at the tone|after the beep|not available|sorry i missed your call|please leave|record your message)/i;
const IVR = /(press (one|1|two|2|three|3|four|4|five|5)|menu options|for sales|for support|please listen|dial extension)/i;
const POSITIVE = /(interested|sounds good|sounds interesting|tell me more|schedule|book|meeting|demo|follow[- ]?up|send (me|us)|next step|calendar)/i;
const NEGATIVE = /(not interested|no thanks|remove me|do not call|don't call|stop calling|unsubscribe)/i;

function extractTranscript(notes: string): string | null {
  const idx = notes.indexOf(TRANSCRIPT_MARKER);
  if (idx  {
  console.error("Error:", e);
  process.exit(1);
});