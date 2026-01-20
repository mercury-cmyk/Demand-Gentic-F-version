/**
 * Backfill Conversation Quality for All Campaigns
 *
 * This script processes all campaigns and backfills:
 * - Transcription (via Telnyx API) for leads with recordings
 * - Quality analysis for leads with transcripts
 *
 * Usage: npx tsx backfill-conversation-quality.ts [--limit=N] [--campaign=ID]
 */

import { db } from "./server/db";
import { leads, campaigns } from "./shared/schema";
import { eq, and, isNotNull, sql, desc } from "drizzle-orm";
import { transcribeLeadCall } from "./server/services/telnyx-transcription";
import { analyzeCall } from "./server/services/call-quality-analyzer";

interface BackfillStats {
  campaignId: string;
  campaignName: string;
  totalFound: number;
  processed: number;
  transcribed: number;
  analyzed: number;
  errors: string[];
}

async function backfillAllCampaigns(options: { limit?: number; campaignId?: string } = {}) {
  const { limit = 100, campaignId } = options;

  console.log("=".repeat(60));
  console.log("🎙️  CONVERSATION QUALITY BACKFILL");
  console.log("=".repeat(60));
  console.log(`Limit per campaign: ${limit}`);
  if (campaignId) {
    console.log(`Single campaign mode: ${campaignId}`);
  }
  console.log("");

  // Get campaigns to process
  const campaignsQuery = campaignId
    ? db.select().from(campaigns).where(eq(campaigns.id, campaignId))
    : db.select().from(campaigns).orderBy(desc(campaigns.createdAt));

  const allCampaigns = await campaignsQuery;

  if (allCampaigns.length === 0) {
    console.log("No campaigns found.");
    return;
  }

  console.log(`Found ${allCampaigns.length} campaign(s) to process\n`);

  const allStats: BackfillStats[] = [];
  let totalProcessed = 0;
  let totalTranscribed = 0;
  let totalAnalyzed = 0;
  let totalErrors = 0;

  for (const campaign of allCampaigns) {
    console.log("-".repeat(60));
    console.log(`📋 Campaign: ${campaign.name} (${campaign.id})`);
    console.log("-".repeat(60));

    const stats: BackfillStats = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      totalFound: 0,
      processed: 0,
      transcribed: 0,
      analyzed: 0,
      errors: []
    };

    try {
      // Find leads with recording but no transcript or analysis
      const leadsToProcess = await db
        .select({
          id: leads.id,
          recordingUrl: leads.recordingUrl,
          transcript: leads.transcript,
          aiAnalysis: leads.aiAnalysis
        })
        .from(leads)
        .where(
          and(
            eq(leads.campaignId, campaign.id),
            isNotNull(leads.recordingUrl),
            sql`(${leads.transcript} IS NULL OR ${leads.transcript} = '' OR ${leads.aiAnalysis} IS NULL)`
          )
        )
        .limit(limit);

      stats.totalFound = leadsToProcess.length;
      console.log(`Found ${leadsToProcess.length} leads needing processing`);

      if (leadsToProcess.length === 0) {
        console.log("✅ No leads need backfilling for this campaign\n");
        allStats.push(stats);
        continue;
      }

      for (let i = 0; i < leadsToProcess.length; i++) {
        const lead = leadsToProcess[i];
        const progress = `[${i + 1}/${leadsToProcess.length}]`;

        try {
          process.stdout.write(`${progress} Lead ${lead.id}: `);

          // Check if needs transcription
          const needsTranscription = !lead.transcript || lead.transcript.trim() === '';
          const needsAnalysis = !lead.aiAnalysis;

          if (needsTranscription) {
            process.stdout.write("transcribing... ");
            const didTranscribe = await transcribeLeadCall(lead.id);
            if (didTranscribe) {
              stats.transcribed++;
              process.stdout.write("✓ ");
            } else {
              process.stdout.write("(skipped) ");
            }
          } else {
            process.stdout.write("(has transcript) ");
          }

          if (needsAnalysis || needsTranscription) {
            process.stdout.write("analyzing... ");
            const analysis = await analyzeCall(lead.id);
            if (analysis) {
              stats.analyzed++;
              process.stdout.write("✓");
            } else {
              process.stdout.write("(no analysis)");
            }
          }

          stats.processed++;
          console.log("");

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          stats.errors.push(`Lead ${lead.id}: ${errorMsg}`);
          console.log(`❌ Error: ${errorMsg}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Campaign error: ${errorMsg}`);
      stats.errors.push(`Campaign error: ${errorMsg}`);
    }

    allStats.push(stats);
    totalProcessed += stats.processed;
    totalTranscribed += stats.transcribed;
    totalAnalyzed += stats.analyzed;
    totalErrors += stats.errors.length;

    console.log(`\n📊 Campaign Summary: ${stats.processed}/${stats.totalFound} processed, ${stats.transcribed} transcribed, ${stats.analyzed} analyzed`);
    if (stats.errors.length > 0) {
      console.log(`⚠️  ${stats.errors.length} errors`);
    }
    console.log("");
  }

  // Final Summary
  console.log("=".repeat(60));
  console.log("📈 FINAL SUMMARY");
  console.log("=".repeat(60));
  console.log(`Campaigns processed: ${allCampaigns.length}`);
  console.log(`Total leads processed: ${totalProcessed}`);
  console.log(`Total transcribed: ${totalTranscribed}`);
  console.log(`Total analyzed: ${totalAnalyzed}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log("");

  // Show per-campaign breakdown
  console.log("Per-Campaign Breakdown:");
  console.log("-".repeat(60));
  for (const stat of allStats) {
    const status = stat.errors.length > 0 ? "⚠️" : "✅";
    console.log(`${status} ${stat.campaignName}: ${stat.processed}/${stat.totalFound} (T:${stat.transcribed} A:${stat.analyzed})`);
  }

  // Show errors if any
  if (totalErrors > 0) {
    console.log("\n⚠️  Errors encountered:");
    for (const stat of allStats) {
      for (const error of stat.errors) {
        console.log(`  - [${stat.campaignName}] ${error}`);
      }
    }
  }

  console.log("\n✅ Backfill complete!");
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: { limit?: number; campaignId?: string } = {};

for (const arg of args) {
  if (arg.startsWith('--limit=')) {
    options.limit = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--campaign=')) {
    options.campaignId = arg.split('=')[1];
  }
}

backfillAllCampaigns(options)
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
