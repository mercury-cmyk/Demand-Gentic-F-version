/**
 * Analyze call quality issues from recent calls
 */

import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function analyzeCallQuality() {
  console.log("\n=== Call Quality Analysis ===\n");

  // Get recent calls with transcripts showing audio issues
  const result = await db.execute(sql`
    SELECT 
      id,
      contact_id,
      ai_disposition,
      ai_transcript,
      ai_analysis,
      duration_sec,
      created_at
    FROM call_sessions
    WHERE created_at > NOW() - INTERVAL '2 hours'
      AND ai_transcript IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 50
  `);

  console.log(`Analyzing ${result.rows.length} recent calls with transcripts\n`);

  // Audio quality issue patterns
  const audioIssuePatterns = [
    /can't hear/i,
    /can not hear/i,
    /cannot hear/i,
    /bad line/i,
    /terrible line/i,
    /distortion/i,
    /breaking up/i,
    /cutting out/i,
    /garbled/i,
    /static/i,
    /crackling/i,
    /echo/i,
    /delay/i,
    /lagging/i,
    /not clear/i,
    /unclear/i,
    /muffled/i,
    /robotic/i,
  ];

  let audioIssueCount = 0;
  let shortCallCount = 0;
  let noTranscriptIssueCount = 0;
  let avgDuration = 0;
  let totalDuration = 0;

  const issueExamples: Array<{
    id: string;
    duration: number;
    disposition: string;
    issue: string;
    transcript: string;
  }> = [];

  for (const row of result.rows) {
    const transcript = (row.ai_transcript as string || "").toLowerCase();
    const duration = row.duration_sec as number || 0;
    totalDuration += duration;

    // Check for audio quality complaints
    for (const pattern of audioIssuePatterns) {
      if (pattern.test(transcript)) {
        audioIssueCount++;
        const match = transcript.match(pattern)?.[0];
        issueExamples.push({
          id: row.id as string,
          duration,
          disposition: row.ai_disposition as string,
          issue: match || "audio issue",
          transcript: transcript.substring(0, 200),
        });
        break;
      }
    }

    // Check for suspiciously short calls
    if (duration < 10) {
      shortCallCount++;
    }

    // Check for calls with minimal/no transcript
    if (transcript.length < 50) {
      noTranscriptIssueCount++;
    }
  }

  avgDuration = result.rows.length > 0 ? totalDuration / result.rows.length : 0;

  console.log("=== SUMMARY ===\n");
  console.log(`Total Calls Analyzed: ${result.rows.length}`);
  console.log(`Calls with Audio Quality Complaints: ${audioIssueCount} (${((audioIssueCount / result.rows.length) * 100).toFixed(1)}%)`);
  console.log(`Short Calls (<10s): ${shortCallCount} (${((shortCallCount / result.rows.length) * 100).toFixed(1)}%)`);
  console.log(`Calls with Minimal Transcripts (<50 chars): ${noTranscriptIssueCount} (${((noTranscriptIssueCount / result.rows.length) * 100).toFixed(1)}%)`);
  console.log(`Average Call Duration: ${avgDuration.toFixed(1)}s\n`);

  if (issueExamples.length > 0) {
    console.log("=== AUDIO QUALITY ISSUE EXAMPLES ===\n");
    for (const example of issueExamples.slice(0, 10)) {
      console.log(`Call ID: ${example.id}`);
      console.log(`  Duration: ${example.duration}s`);
      console.log(`  Disposition: ${example.disposition}`);
      console.log(`  Issue Detected: "${example.issue}"`);
      console.log(`  Transcript: ${example.transcript}...`);
      console.log("");
    }
  }

  // Check AI analysis for quality scores
  console.log("=== CONVERSATION QUALITY SCORES ===\n");
  const qualityScores = [];
  for (const row of result.rows) {
    if (row.ai_analysis) {
      try {
        const analysis = row.ai_analysis as any;
        if (analysis.conversationQuality?.overallScore) {
          qualityScores.push({
            id: row.id,
            score: analysis.conversationQuality.overallScore,
            disposition: row.ai_disposition,
          });
        }
      } catch (e) {
        // Skip malformed analysis
      }
    }
  }

  if (qualityScores.length > 0) {
    const avgQuality = qualityScores.reduce((sum, item) => sum + item.score, 0) / qualityScores.length;
    const lowQuality = qualityScores.filter(item => item.score < 50);
    
    console.log(`Calls with Quality Scores: ${qualityScores.length}`);
    console.log(`Average Quality Score: ${avgQuality.toFixed(1)}/100`);
    console.log(`Low Quality Calls (<50): ${lowQuality.length} (${((lowQuality.length / qualityScores.length) * 100).toFixed(1)}%)\n`);

    if (lowQuality.length > 0) {
      console.log("Low Quality Examples:");
      for (const item of lowQuality.slice(0, 5)) {
        console.log(`  - Call ${item.id}: Score ${item.score}, Disposition: ${item.disposition}`);
      }
      console.log("");
    }
  }

  console.log("\n=== RECOMMENDATIONS ===\n");
  
  if (audioIssueCount > result.rows.length * 0.1) {
    console.log("⚠️  HIGH AUDIO QUALITY ISSUE RATE");
    console.log("   - Check Gemini Live audio streaming configuration");
    console.log("   - Verify WebSocket audio buffer handling");
    console.log("   - Check Telnyx RTP stream quality");
    console.log("   - Monitor for audio timeout errors in logs\n");
  }

  if (shortCallCount > result.rows.length * 0.3) {
    console.log("⚠️  HIGH SHORT CALL RATE");
    console.log("   - Many calls ending within 10 seconds");
    console.log("   - May indicate connection issues or immediate hangups");
    console.log("   - Check call initiation and greeting timing\n");
  }

  if (noTranscriptIssueCount > result.rows.length * 0.2) {
    console.log("⚠️  TRANSCRIPTION ISSUES");
    console.log("   - Many calls have minimal/no transcripts");
    console.log("   - Check Gemini STT stream health");
    console.log("   - Verify audio is reaching Gemini Live API\n");
  }

  console.log("✅ Analysis Complete\n");
}

analyzeCallQuality().catch(console.error);
