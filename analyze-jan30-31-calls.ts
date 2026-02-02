/**
 * Analyze calls from January 30-31, 2026 for disposition issues
 * Identifies calls that may have incorrect dispositions based on transcript analysis
 */

import "dotenv/config";
import { db } from "./server/db";
import { callSessions, campaigns } from "./shared/schema";
import { sql, and, gte, lt, isNotNull } from "drizzle-orm";
import {
  loadCampaignQualificationContext,
  determineSmartDisposition,
} from "./server/services/smart-disposition-analyzer";

const LOG_PREFIX = "[Jan30-31 Analysis]";

interface CallAnalysis {
  sessionId: string;
  campaignId: string;
  campaignName: string;
  currentDisposition: string | null;
  suggestedDisposition: string;
  shouldOverride: boolean;
  confidence: number;
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  durationSec: number | null;
  transcriptPreview: string;
  callDate: Date;
}

async function analyzeJan30_31Calls() {
  console.log(`${LOG_PREFIX} Analyzing calls from January 30-31, 2026...\n`);

  // Get all calls from Jan 30-31, 2026
  const startDate = new Date("2026-01-30T00:00:00Z");
  const endDate = new Date("2026-02-01T00:00:00Z");

  const sessions = await db
    .select({
      id: callSessions.id,
      campaignId: callSessions.campaignId,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
      startedAt: callSessions.startedAt,
    })
    .from(callSessions)
    .where(
      and(
        gte(callSessions.startedAt, startDate),
        lt(callSessions.startedAt, endDate),
        isNotNull(callSessions.campaignId)
      )
    )
    .orderBy(callSessions.startedAt);

  console.log(`${LOG_PREFIX} Found ${sessions.length} calls from Jan 30-31, 2026\n`);

  // Group by disposition
  const dispositionCounts: Record<string, number> = {};
  sessions.forEach((s) => {
    const disp = s.aiDisposition || "NULL";
    dispositionCounts[disp] = (dispositionCounts[disp] || 0) + 1;
  });

  console.log("📊 CURRENT DISPOSITION BREAKDOWN:");
  Object.entries(dispositionCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([disp, count]) => {
      console.log(`  ${disp}: ${count}`);
    });
  console.log();

  // Cache campaign contexts
  const campaignContexts: Map<string, any> = new Map();
  const campaignNames: Map<string, string> = new Map();

  // Get campaign names
  const campaignIds = [...new Set(sessions.map((s) => s.campaignId).filter(Boolean))] as string[];
  if (campaignIds.length > 0) {
    const campaignData = await db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(sql`${campaigns.id} IN ${campaignIds}`);
    campaignData.forEach((c) => campaignNames.set(c.id, c.name));
  }

  // Analyze each session
  const analyses: CallAnalysis[] = [];
  const issuesByType: Record<string, CallAnalysis[]> = {
    "no_answer_should_be_qualified": [],
    "no_answer_should_be_needs_review": [],
    "voicemail_should_be_needs_review": [],
    "other_issues": [],
  };

  let processedCount = 0;
  for (const session of sessions) {
    processedCount++;
    if (processedCount % 50 === 0) {
      console.log(`${LOG_PREFIX} Processing ${processedCount}/${sessions.length}...`);
    }

    if (!session.campaignId) continue;

    // Get or load campaign context
    let context = campaignContexts.get(session.campaignId);
    if (!context) {
      context = await loadCampaignQualificationContext(session.campaignId);
      if (context) {
        campaignContexts.set(session.campaignId, context);
      }
    }

    if (!context) continue;

    // Parse transcript
    let transcriptArray: any[] = [];
    if (session.aiTranscript) {
      if (typeof session.aiTranscript === "string") {
        try {
          transcriptArray = JSON.parse(session.aiTranscript);
        } catch {
          transcriptArray = [];
        }
      } else if (Array.isArray(session.aiTranscript)) {
        transcriptArray = session.aiTranscript;
      }
    }

    if (transcriptArray.length === 0) continue;

    const currentDisp = session.aiDisposition || "NULL";
    const durationSec = session.durationSec || 0;

    // Run smart disposition analysis
    const analysis = determineSmartDisposition(
      currentDisp as any,
      transcriptArray.map((t) => ({
        role: t.role === "user" ? "user" : "assistant",
        text: t.message || t.text || "",
        timestamp: new Date(),
      })),
      context,
      durationSec
    );

    // Build transcript preview
    const userMessages = transcriptArray
      .filter((t) => t.role === "user")
      .map((t) => t.message || t.text || "")
      .join(" | ");
    const transcriptPreview = userMessages.substring(0, 200) + (userMessages.length > 200 ? "..." : "");

    const callAnalysis: CallAnalysis = {
      sessionId: session.id,
      campaignId: session.campaignId,
      campaignName: campaignNames.get(session.campaignId) || "Unknown",
      currentDisposition: currentDisp,
      suggestedDisposition: analysis.suggestedDisposition,
      shouldOverride: analysis.shouldOverride,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      positiveSignals: analysis.positiveSignals,
      negativeSignals: analysis.negativeSignals,
      durationSec: session.durationSec,
      transcriptPreview,
      callDate: session.startedAt!,
    };

    analyses.push(callAnalysis);

    // Categorize issues
    if (analysis.shouldOverride) {
      if (currentDisp === "no_answer" && analysis.suggestedDisposition === "qualified_lead") {
        issuesByType["no_answer_should_be_qualified"].push(callAnalysis);
      } else if (currentDisp === "no_answer" && analysis.suggestedDisposition === "needs_review") {
        issuesByType["no_answer_should_be_needs_review"].push(callAnalysis);
      } else if (currentDisp === "voicemail" && analysis.suggestedDisposition === "needs_review") {
        issuesByType["voicemail_should_be_needs_review"].push(callAnalysis);
      } else {
        issuesByType["other_issues"].push(callAnalysis);
      }
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("📊 DISPOSITION ISSUE ANALYSIS SUMMARY");
  console.log("=".repeat(80));

  const totalIssues = Object.values(issuesByType).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`\nTotal calls analyzed: ${analyses.length}`);
  console.log(`Total disposition issues found: ${totalIssues}`);

  console.log("\n📋 ISSUE BREAKDOWN:");
  console.log(`  🔴 no_answer → qualified_lead: ${issuesByType["no_answer_should_be_qualified"].length}`);
  console.log(`  🟡 no_answer → needs_review: ${issuesByType["no_answer_should_be_needs_review"].length}`);
  console.log(`  🟠 voicemail → needs_review: ${issuesByType["voicemail_should_be_needs_review"].length}`);
  console.log(`  ⚪ other issues: ${issuesByType["other_issues"].length}`);

  // Show examples of each issue type
  console.log("\n" + "=".repeat(80));
  console.log("🔴 NO_ANSWER CALLS THAT SHOULD BE QUALIFIED_LEAD:");
  console.log("=".repeat(80));

  const qualifiedExamples = issuesByType["no_answer_should_be_qualified"].slice(0, 10);
  for (const ex of qualifiedExamples) {
    console.log(`\n📞 Session: ${ex.sessionId}`);
    console.log(`   Campaign: ${ex.campaignName}`);
    console.log(`   Duration: ${ex.durationSec}s`);
    console.log(`   Date: ${ex.callDate.toISOString()}`);
    console.log(`   Current: ${ex.currentDisposition} → Suggested: ${ex.suggestedDisposition}`);
    console.log(`   Confidence: ${(ex.confidence * 100).toFixed(0)}%`);
    console.log(`   Positive signals: ${ex.positiveSignals.join(", ") || "none"}`);
    console.log(`   Reasoning: ${ex.reasoning}`);
    console.log(`   User said: "${ex.transcriptPreview}"`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("🟡 NO_ANSWER CALLS THAT SHOULD BE NEEDS_REVIEW:");
  console.log("=".repeat(80));

  const reviewExamples = issuesByType["no_answer_should_be_needs_review"].slice(0, 10);
  for (const ex of reviewExamples) {
    console.log(`\n📞 Session: ${ex.sessionId}`);
    console.log(`   Campaign: ${ex.campaignName}`);
    console.log(`   Duration: ${ex.durationSec}s`);
    console.log(`   Date: ${ex.callDate.toISOString()}`);
    console.log(`   Current: ${ex.currentDisposition} → Suggested: ${ex.suggestedDisposition}`);
    console.log(`   Confidence: ${(ex.confidence * 100).toFixed(0)}%`);
    console.log(`   Reasoning: ${ex.reasoning}`);
    console.log(`   User said: "${ex.transcriptPreview}"`);
  }

  // Group issues by campaign
  console.log("\n" + "=".repeat(80));
  console.log("📊 ISSUES BY CAMPAIGN:");
  console.log("=".repeat(80));

  const issuesByCampaign: Record<string, { name: string; qualified: number; review: number; voicemail: number; other: number }> = {};
  
  for (const [type, issues] of Object.entries(issuesByType)) {
    for (const issue of issues) {
      if (!issuesByCampaign[issue.campaignId]) {
        issuesByCampaign[issue.campaignId] = {
          name: issue.campaignName,
          qualified: 0,
          review: 0,
          voicemail: 0,
          other: 0,
        };
      }
      if (type === "no_answer_should_be_qualified") issuesByCampaign[issue.campaignId].qualified++;
      else if (type === "no_answer_should_be_needs_review") issuesByCampaign[issue.campaignId].review++;
      else if (type === "voicemail_should_be_needs_review") issuesByCampaign[issue.campaignId].voicemail++;
      else issuesByCampaign[issue.campaignId].other++;
    }
  }

  for (const [campaignId, stats] of Object.entries(issuesByCampaign)) {
    const total = stats.qualified + stats.review + stats.voicemail + stats.other;
    console.log(`\n${stats.name}:`);
    console.log(`  Total issues: ${total}`);
    if (stats.qualified > 0) console.log(`    → qualified_lead: ${stats.qualified}`);
    if (stats.review > 0) console.log(`    → needs_review: ${stats.review}`);
    if (stats.voicemail > 0) console.log(`    → voicemail fix: ${stats.voicemail}`);
    if (stats.other > 0) console.log(`    → other: ${stats.other}`);
  }

  // Return summary for potential fix
  console.log("\n" + "=".repeat(80));
  console.log("🔧 FIX RECOMMENDATION:");
  console.log("=".repeat(80));
  console.log(`\nTo fix these ${totalIssues} disposition issues, run:`);
  console.log(`  npx tsx fix-jan30-31-dispositions.ts --apply`);
  console.log(`\nOr for a specific date:`);
  console.log(`  npx tsx reanalyze-dispositions.ts --apply --start-date 2026-01-30 --end-date 2026-02-01`);

  return {
    totalAnalyzed: analyses.length,
    totalIssues,
    issuesByType: {
      qualifiedLeads: issuesByType["no_answer_should_be_qualified"].length,
      needsReview: issuesByType["no_answer_should_be_needs_review"].length,
      voicemailFix: issuesByType["voicemail_should_be_needs_review"].length,
      other: issuesByType["other_issues"].length,
    },
    sessionIds: {
      toQualified: issuesByType["no_answer_should_be_qualified"].map((a) => a.sessionId),
      toReview: issuesByType["no_answer_should_be_needs_review"].map((a) => a.sessionId),
    },
  };
}

// Run the analysis
analyzeJan30_31Calls()
  .then((result) => {
    console.log("\n✅ Analysis complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
