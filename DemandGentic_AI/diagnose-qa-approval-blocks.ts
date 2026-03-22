/**
 * Diagnose QA Approval Blocks
 * Check how many leads in pending status would be blocked by quality validation
 */

import { db } from "./server/db";
import { leads } from "@shared/schema";
import { inArray } from "drizzle-orm";

async function diagnosePendingLeads() {
  console.log('\n🔍 DIAGNOSING QA APPROVAL WORKFLOW ISSUES\n');
  
  // Get all leads in pending review status
  const pendingLeads = await db
    .select({
      id: leads.id,
      contactEmail: leads.contactEmail,
      contactName: leads.contactName,
      accountName: leads.accountName,
      qaStatus: leads.qaStatus,
      recordingUrl: leads.recordingUrl,
      recordingS3Key: leads.recordingS3Key,
      transcript: leads.transcript,
      structuredTranscript: leads.structuredTranscript,
      aiAnalysis: leads.aiAnalysis,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      inArray(leads.qaStatus, ['new', 'under_review'])
    );

  console.log(`📊 Found ${pendingLeads.length} leads in pending status (new or under_review)\n`);

  if (pendingLeads.length === 0) {
    console.log('✅ No pending leads found.\n');
    return;
  }

  // Analyze quality check failures
  let blockedCount = 0;
  let missingRecording = 0;
  let missingTranscript = 0;
  let missingAIAnalysis = 0;

  const blockedLeads: typeof pendingLeads = [];

  pendingLeads.forEach(lead => {
    const errors: string[] = [];

    // Check recording
    if (!lead.recordingUrl && !lead.recordingS3Key) {
      errors.push("Missing recording");
      missingRecording++;
    }

    // Check transcript
    const hasTranscript = lead.transcript && lead.transcript.trim().length > 0;
    const hasStructuredTranscript = !!lead.structuredTranscript;
    if (!hasTranscript && !hasStructuredTranscript) {
      errors.push("Missing transcript");
      missingTranscript++;
    }

    // Check AI analysis
    if (!lead.aiAnalysis) {
      errors.push("Missing AI analysis");
      missingAIAnalysis++;
    }

    if (errors.length > 0) {
      blockedCount++;
      blockedLeads.push(lead);
    }
  });

  console.log('📈 QUALITY VALIDATION ANALYSIS:\n');
  console.log(`  Total pending leads: ${pendingLeads.length}`);
  console.log(`  ✅ Would pass quality checks: ${pendingLeads.length - blockedCount}`);
  console.log(`  ❌ Would be blocked from approval: ${blockedCount} (${Math.round(blockedCount / pendingLeads.length * 100)}%)\n`);

  console.log('📋 BLOCKING REASONS:\n');
  console.log(`  Missing recording: ${missingRecording}`);
  console.log(`  Missing transcript: ${missingTranscript}`);
  console.log(`  Missing AI analysis: ${missingAIAnalysis}\n`);

  if (blockedLeads.length > 0) {
    console.log(`⚠️  BLOCKED LEADS (showing first 10 of ${blockedLeads.length}):\n`);
    blockedLeads.slice(0, 10).forEach((lead, idx) => {
      const issues: string[] = [];
      if (!lead.recordingUrl && !lead.recordingS3Key) issues.push('No recording');
      if (!lead.transcript && !lead.structuredTranscript) issues.push('No transcript');
      if (!lead.aiAnalysis) issues.push('No AI analysis');

      console.log(`  ${idx + 1}. ${lead.contactEmail || 'No email'} - ${lead.contactName || 'No name'}`);
      console.log(`     Company: ${lead.accountName || 'Unknown'}`);
      console.log(`     Status: ${lead.qaStatus}`);
      console.log(`     Issues: ${issues.join(', ')}`);
      console.log(`     Created: ${lead.createdAt?.toISOString().split('T')[0]}\n`);
    });
  }

  console.log('\n💡 RECOMMENDATION:\n');
  console.log('  The quality validation is blocking QA analysts from approving leads.');
  console.log('  Options:');
  console.log('    1. Make quality validation optional for QA analysts (allow manual override)');
  console.log('    2. Add a bypass flag for leads that are manually verified');
  console.log('    3. Complete intelligence data (recordings, transcripts) for all leads first\n');
}

diagnosePendingLeads()
  .then(() => {
    console.log('✅ Diagnosis complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });