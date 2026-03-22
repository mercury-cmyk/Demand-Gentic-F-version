import { pool } from "./server/db";
import * as fs from "fs";
import * as path from "path";

async function exportJan15TranscriptsForAnalysis() {
  console.log("========================================");
  console.log("EXPORT JAN 15+ TRANSCRIPTS FOR ANALYSIS");
  console.log("========================================\n");

  // Get all calls with transcripts
  const result = await pool.query(`
    SELECT 
      id,
      contact_name,
      dialed_number,
      call_duration,
      created_at,
      updated_at,
      transcript,
      LENGTH(transcript) AS transcript_length,
      ai_score,
      ai_qualification_status,
      telnyx_call_id
    FROM leads
    WHERE updated_at >= '2026-01-15'
      AND call_duration > 0
      AND transcript IS NOT NULL
      AND LENGTH(transcript) > 50
    ORDER BY updated_at DESC
  `);

  console.log(`Found ${result.rows.length} calls with transcripts\n`);

  const exportData = {
    exportedAt: new Date().toISOString(),
    totalCalls: result.rows.length,
    calls: result.rows.map(row => ({
      id: row.id,
      contactName: row.contact_name,
      dialedNumber: row.dialed_number,
      duration: row.call_duration,
      callTime: row.updated_at,
      transcriptLength: row.transcript_length,
      aiScore: row.ai_score,
      aiQualificationStatus: row.ai_qualification_status,
      telnyxCallId: row.telnyx_call_id,
      transcript: row.transcript
    }))
  };

  // Save to JSON file
  const outputPath = path.join(process.cwd(), 'jan15-transcripts-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  
  console.log(`✓ Exported to: ${outputPath}\n`);

  // Print summary statistics
  console.log("STATISTICS:");
  console.log(`  Total calls with transcripts: ${exportData.totalCalls}`);
  
  const avgLength = exportData.calls.reduce((sum, c) => sum + c.transcriptLength, 0) / exportData.totalCalls;
  console.log(`  Average transcript length: ${Math.round(avgLength)} chars`);
  
  const minLength = Math.min(...exportData.calls.map(c => c.transcriptLength));
  const maxLength = Math.max(...exportData.calls.map(c => c.transcriptLength));
  console.log(`  Min length: ${minLength} chars`);
  console.log(`  Max length: ${maxLength} chars`);
  
  const avgDuration = exportData.calls.reduce((sum, c) => sum + c.duration, 0) / exportData.totalCalls;
  console.log(`  Average duration: ${Math.round(avgDuration)} seconds`);

  console.log("\nSAMPLE TRANSCRIPT (first call):");
  console.log("================================");
  if (exportData.calls.length > 0) {
    const sample = exportData.calls[0];
    console.log(`Call ID: ${sample.id}`);
    console.log(`Contact: ${sample.contactName}`);
    console.log(`Phone: ${sample.dialedNumber}`);
    console.log(`Duration: ${sample.duration}s`);
    console.log(`Transcript (${sample.transcriptLength} chars):`);
    console.log(sample.transcript.substring(0, 500) + '...\n');
  }

  // Also create a simple text report
  const reportPath = path.join(process.cwd(), 'jan15-transcripts-report.txt');
  let report = `TELNYX CALLS ANALYSIS - JAN 15+ 2026\n`;
  report += `Generated: ${new Date().toISOString()}\n`;
  report += `=`.repeat(80) + '\n\n';
  report += `Total Calls: ${exportData.totalCalls}\n`;
  report += `Average Duration: ${Math.round(avgDuration)}s\n`;
  report += `Average Transcript Length: ${Math.round(avgLength)} chars\n\n`;
  report += `=`.repeat(80) + '\n\n';

  exportData.calls.forEach((call, index) => {
    report += `CALL ${index + 1}\n`;
    report += `-`.repeat(80) + '\n';
    report += `ID: ${call.id}\n`;
    report += `Contact: ${call.contactName || 'N/A'}\n`;
    report += `Phone: ${call.dialedNumber}\n`;
    report += `Duration: ${call.duration}s\n`;
    report += `Call Time: ${call.callTime}\n`;
    report += `Telnyx ID: ${call.telnyxCallId || 'N/A'}\n`;
    report += `AI Score: ${call.aiScore || 'N/A'}\n`;
    report += `AI Status: ${call.aiQualificationStatus || 'N/A'}\n`;
    report += `\nTRANSCRIPT:\n${call.transcript}\n\n`;
    report += `=`.repeat(80) + '\n\n';
  });

  fs.writeFileSync(reportPath, report);
  console.log(`✓ Report saved to: ${reportPath}`);

  process.exit(0);
}

exportJan15TranscriptsForAnalysis().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});