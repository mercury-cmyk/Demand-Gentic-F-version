/**
 * Re-analyze all calls after January 15, 2026
 * Uses DeepSeek to evaluate transcripts and assign correct dispositions
 */

import { db } from "./server/db.ts";
import { sql } from "drizzle-orm";
import OpenAI from "openai";

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

interface AnalysisResult {
  disposition: 'qualified_lead' | 'not_interested' | 'voicemail' | 'no_answer' | 'do_not_call' | 'invalid_data';
  confidence: number;
  reasoning: string;
  isAiCallScreening: boolean;
  isVoicemail: boolean;
  humanContactMade: boolean;
  interestSignals: string[];
}

async function analyzeTranscript(transcript: string, contactName: string): Promise {
  const prompt = `You are a call disposition analyst. Analyze this sales call transcript and determine the correct disposition.

CONTACT NAME: ${contactName}

TRANSCRIPT:
${transcript}

DISPOSITION RULES:
1. **voicemail** - Use when:
   - Automated voicemail greeting plays
   - "Leave a message after the beep"
   - AI call screening detected (e.g., "Call Assist by Google", "I'm screening calls", "Before I try to connect you, can I ask what you're calling about?")
   - "The person you're calling cannot take your call right now"
   - IVR/automated system with no human transfer

2. **no_answer** - Use when:
   - No human response at all
   - Only silence after greeting
   - Call connected but no voice detected
   - Only brief greetings or clarity questions (e.g., "hello", "who's calling") with no engagement

3. **not_interested** - Use when:
   - Prospect says "no thanks", "not interested", or similar explicit decline
   - Prospect declines to continue conversation
   - Prospect hangs up during/after pitch without interest
   - Conversation occurred but there were no positive signals

4. **do_not_call** - Use when:
   - Prospect says "don't call me again", "remove me from your list", "stop calling"

5. **invalid_data** - Use when:
   - Wrong number
   - Contact no longer works there
   - Disconnected/not in service

6. **qualified_lead** - Use ONLY when ALL THREE conditions are met:
   - Identity confirmed (prospect confirmed they are the named contact)
   - Meaningful conversation occurred (30+ seconds of actual dialogue with the REAL person)
   - Clear interest signals (asked questions about offer, requested follow-up, agreed to receive materials)
   
   IMPORTANT: Talking to an AI call screening bot does NOT count as talking to the prospect!

Respond with ONLY valid JSON:
{
  "disposition": "one of: qualified_lead, not_interested, voicemail, no_answer, do_not_call, invalid_data",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your decision",
  "isAiCallScreening": true/false,
  "isVoicemail": true/false,
  "humanContactMade": true/false,
  "interestSignals": ["list of any interest signals detected"]
}`;

  try {
    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "";
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AnalysisResult;
    }
    throw new Error("No valid JSON in response");
  } catch (error) {
    console.error("DeepSeek analysis failed:", error);
    return {
      disposition: "not_interested",
      confidence: 0.5,
      reasoning: "Analysis failed - defaulting to not_interested",
      isAiCallScreening: false,
      isVoicemail: false,
      humanContactMade: false,
      interestSignals: [],
    };
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("RE-ANALYZING ALL CALLS AFTER JANUARY 15, 2026");
  console.log("=".repeat(80));

  // Get all leads after Jan 15 with transcripts
  const leadsToAnalyze = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      l.transcript,
      l.qa_status,
      l.ai_qualification_status,
      l.created_at,
      c.full_name as contact_name,
      ca.disposition as call_disposition
    FROM leads l
    JOIN contacts c ON l.contact_id = c.id
    LEFT JOIN call_attempts ca ON l.call_attempt_id = ca.id
    WHERE l.created_at >= '2026-01-15'
    AND l.transcript IS NOT NULL
    AND l.transcript != ''
    ORDER BY l.created_at DESC
  `);

  const rows = leadsToAnalyze.rows as any[];
  console.log(`\nFound ${rows.length} leads with transcripts to analyze\n`);

  const stats = {
    total: rows.length,
    analyzed: 0,
    changed: 0,
    aiScreeningDetected: 0,
    voicemailDetected: 0,
    qualified: 0,
    notInterested: 0,
    errors: 0,
  };

  for (let i = 0; i  setTimeout(resolve, 500));

    } catch (error) {
      stats.errors++;
      console.error(`  ❌ Error analyzing lead:`, error);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("ANALYSIS COMPLETE");
  console.log("=".repeat(80));
  console.log(`\nSTATISTICS:`);
  console.log(`  Total leads processed: ${stats.total}`);
  console.log(`  Successfully analyzed: ${stats.analyzed}`);
  console.log(`  Status changed: ${stats.changed}`);
  console.log(`  AI call screening detected: ${stats.aiScreeningDetected}`);
  console.log(`  Voicemails detected: ${stats.voicemailDetected}`);
  console.log(`  Qualified leads: ${stats.qualified}`);
  console.log(`  Not interested: ${stats.notInterested}`);
  console.log(`  Errors: ${stats.errors}`);

  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});