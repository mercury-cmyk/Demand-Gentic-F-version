import { db } from "./server/db";
import { sql, desc, eq, and, gte } from "drizzle-orm";
import { dialerCallAttempts, contacts, callSessions, campaigns } from "./shared/schema";
import * as fs from 'fs';
import * as path from 'path';

async function analyzeNotInterestedLeads() {
  console.log("Analyzing 'Not Interested' leads for the last 48 hours...");

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const results = await db
    .select({
      id: dialerCallAttempts.id,
      contactName: contacts.fullName,
      contactPhone: contacts.directPhone,
      campaignName: campaigns.name,
      callTime: dialerCallAttempts.callStartedAt,
      duration: dialerCallAttempts.callDurationSeconds,
      transcript: dialerCallAttempts.fullTranscript,
      notes: dialerCallAttempts.notes,
      aiAnalysis: callSessions.aiAnalysis,
      recordingUrl: dialerCallAttempts.recordingUrl,
    })
    .from(dialerCallAttempts)
    .leftJoin(contacts, eq(dialerCallAttempts.contactId, contacts.id))
    .leftJoin(campaigns, eq(dialerCallAttempts.campaignId, campaigns.id))
    .leftJoin(callSessions, eq(dialerCallAttempts.callSessionId, callSessions.id))
    .where(
      and(
        eq(dialerCallAttempts.disposition, "not_interested"),
        gte(dialerCallAttempts.callStartedAt, twoDaysAgo)
      )
    )
    .orderBy(desc(dialerCallAttempts.callStartedAt));

  console.log(`Found ${results.length} calls marked as 'Not Interested'.\n`);

  const csvRows = [
    ["Campaign", "Contact Name", "Phone", "Time", "Duration", "AI Outcome", "Summary", "Transcript Snippet", "Recording URL"]
  ];

  for (const call of results) {
    const analysis = call.aiAnalysis as any || {};
    const summary = analysis.summary || call.notes || "N/A";
    const outcome = analysis.outcome || "N/A";
    const transcriptSnippet = call.transcript ? call.transcript.substring(0, 100).replace(/\n/g, " ") : "N/A";
    
    // Console output for quick view
    console.log("---------------------------------------------------");
    console.log(`Contact: ${call.contactName} (${call.contactPhone})`);
    console.log(`Campaign: ${call.campaignName}`);
    console.log(`Time: ${call.callTime?.toLocaleString()}`);
    console.log(`Reason/Summary: ${summary}`);
    console.log(`Transcript: ${transcriptSnippet}...`);

    // Prepare CSV row
    csvRows.push([
      `"${call.campaignName || ''}"`,
      `"${call.contactName || ''}"`,
      `"${call.contactPhone || ''}"`,
      `"${call.callTime?.toISOString() || ''}"`,
      `${call.duration}`,
      `"${outcome}"`,
      `"${summary.replace(/"/g, '""')}"`, // Escape quotes
      `"${transcriptSnippet.replace(/"/g, '""')}..."`,
      `"${call.recordingUrl || ''}"`
    ]);
  }

  // Write CSV
  const csvContent = csvRows.map(row => row.join(",")).join("\n");
  const outputPath = path.join(process.cwd(), "not_interested_analysis.csv");
  fs.writeFileSync(outputPath, csvContent);
  console.log(`\nAnalysis saved to: ${outputPath}`);
}

analyzeNotInterestedLeads().catch(console.error);