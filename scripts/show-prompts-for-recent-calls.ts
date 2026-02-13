
import { db } from "../server/db";
import { callSessions, campaigns } from "@shared/schema";
import { eq, gt, desc, sql, and, isNotNull } from "drizzle-orm";

async function main() {
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 3); // A bit more buffer

  console.log("Searching for calls since:", twoDaysAgo.toISOString());

  // Find recent call sessions that have AI analysis
  const recentSessions = await db
    .select({
      sessionId: callSessions.id,
      campaignId: callSessions.campaignId,
      createdAt: callSessions.createdAt,
      aiAnalysis: callSessions.aiAnalysis,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
      aiDisposition: callSessions.aiDisposition,
    })
    .from(callSessions)
    .where(
      and(
        gt(callSessions.createdAt, twoDaysAgo),
        isNotNull(callSessions.campaignId)
      )
    )
    .orderBy(desc(callSessions.createdAt))
    .limit(100);

  console.log(`Found ${recentSessions.length} recent sessions.`);

  const campaignsMap = new Map<string, typeof recentSessions[0]>();

  // Group by campaign, taking the most recent one
  for (const session of recentSessions) {
    if (session.campaignId && !campaignsMap.has(session.campaignId)) {
        // Only if it has analysis data or at least transcript to be useful
        if (session.aiAnalysis || session.aiTranscript) {
             campaignsMap.set(session.campaignId, session);
        }
    }
  }

  console.log(`Found ${campaignsMap.size} unique active campaigns with AI data.`);

  for (const [campaignId, session] of campaignsMap) {
    console.log(`\n\n================================================================================================`);
    console.log(`Analyzing Campaign ID: ${campaignId}`);
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));

    if (!campaign) {
      console.log("Campaign not found in DB.");
      continue;
    }

    // Extract data for prompt reconstruction
    const talkingPoints = (campaign.talkingPoints as string[] | null) || [];
    const qaParams = (campaign.qaParameters as Record<string, unknown> | null) || {};
    
    let metrics = {
      totalTurns: 0, agentTurns: 0, contactTurns: 0,
      agentWords: 0, contactWords: 0,
      agentTalkRatio: 0,
      avgResponseTimeSec: 0,
    };

    let fullTranscript = session.aiTranscript || "";

    // Try to get metrics from aiAnalysis if available
    if (session.aiAnalysis) {
        const analysis = session.aiAnalysis as any;
        if (analysis.postCallAnalysis) {
            if (analysis.postCallAnalysis.metrics) {
                metrics = analysis.postCallAnalysis.metrics;
            }
            if (analysis.postCallAnalysis.fullTranscript) {
                fullTranscript = analysis.postCallAnalysis.fullTranscript;
            }
        }
    }
    
    const callDurationSec = session.durationSec || 0;
    const disposition = session.aiDisposition;

    // construct the prompt
    const prompt = `You are evaluating a completed B2B phone call against specific campaign criteria.

CAMPAIGN: ${campaign.name || "Unknown"}
OBJECTIVE: ${campaign.campaignObjective || "Not specified"}
CONTEXT: ${campaign.campaignContextBrief || "Not specified"}
SUCCESS CRITERIA: ${campaign.successCriteria || "Not specified"}
TALKING POINTS: ${talkingPoints.join(" | ") || "None specified"}
QUALIFICATION PARAMETERS: ${JSON.stringify(qaParams)}

CALL METRICS:
- Duration: ${callDurationSec}s
- Total turns: ${metrics.totalTurns} (Agent: ${metrics.agentTurns}, Contact: ${metrics.contactTurns})
- Agent words: ${metrics.agentWords}, Contact words: ${metrics.contactWords}
- Agent talk ratio: ${(metrics.agentTalkRatio * 100).toFixed(0)}%
- Avg response time: ${metrics.avgResponseTimeSec}s
- Current disposition: ${disposition || "not set"}

FULL TRANSCRIPT:
${fullTranscript.substring(0, 500)}... [TRUNCATED for display purposes]

Evaluate this call and return JSON with this exact shape:
{
  "objectiveAchieved": true | false,
  "alignmentScore": 0-100,
  "coveredTalkingPoints": ["string"],
  "missedTalkingPoints": ["string"],
  "successCriteriaMet": true | false,
  "qualificationResult": "qualified" | "not_qualified" | "partial" | "unknown",
  "criteriaChecks": [{"criterion": "string", "met": true | false, "evidence": "string"}],
  "recommendedDisposition": "qualified_lead" | "not_interested" | "do_not_call" | "voicemail" | "no_answer" | "invalid_data",
  "dispositionAccurate": true | false,
  "notes": ["string"]
}

CRITICAL RULES:
1. Base evaluation ONLY on what was actually said in the transcript.
2. Do not assume the agent should have left a voicemail — the system does not leave voicemails.
3. STT artifacts (misspellings, garbled words) are NOT agent errors.
4. Focus on: objective achievement, talking point coverage, qualification, and disposition accuracy.`;

    console.log("--- RUNTIME PROMPT EXECUTED (Reconstructed) ---");
    console.log(prompt);
    console.log("-----------------------------------------------");
  }

  process.exit(0);
}

main().catch(console.error);
