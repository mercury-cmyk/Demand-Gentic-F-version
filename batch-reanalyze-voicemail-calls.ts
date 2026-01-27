/**
 * Batch Reanalysis Script for Voicemail Misclassification Fix
 * 
 * Purpose:
 * - Query all calls from Jan 15 onward with specific statuses
 * - For each voicemail call that was marked as a lead, reanalyze using DeepSeek
 * - Correct dispositions and update database
 * - Generate report of corrections made
 * 
 * Usage: npx ts-node batch-reanalyze-voicemail-calls.ts
 */

import { config } from 'dotenv';
import { db } from './server/db.ts';
import { dialerCallAttempts, leads } from './shared/schema.ts';
import { eq, gte, and, inArray } from 'drizzle-orm';
import OpenAI from 'openai';
import fs from 'fs';

config({ path: '.env' });

interface VoicemailAnalysisResult {
  callAttemptId: string;
  contactId: string;
  currentDisposition: string | null;
  voicemailDetected: boolean;
  leadId: string | null;
  analysisResult: {
    isVoicemail: boolean;
    confidence: number;
    reasoning: string;
    recommendedDisposition: string;
  };
  correctionMade: boolean;
  error?: string;
}

const JAN_15_2025 = new Date('2025-01-15T00:00:00Z');
const BATCH_SIZE = 50;
const ANALYSIS_RESULTS: VoicemailAnalysisResult[] = [];

async function initializeDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com/v1',
  });
}

/**
 * Query calls from Jan 15 onward with specified statuses
 */
async function queryHistoricalCalls() {
  console.log('📊 Querying historical calls from Jan 15 onward...');
  
  const calls = await db
    .select({
      id: dialerCallAttempts.id,
      contactId: dialerCallAttempts.contactId,
      campaignId: dialerCallAttempts.campaignId,
      disposition: dialerCallAttempts.disposition,
      voicemailDetected: dialerCallAttempts.voicemailDetected,
      recordingUrl: dialerCallAttempts.recordingUrl,
      callDurationSeconds: dialerCallAttempts.callDurationSeconds,
      connected: dialerCallAttempts.connected,
      createdAt: dialerCallAttempts.createdAt,
    })
    .from(dialerCallAttempts)
    .where(
      and(
        gte(dialerCallAttempts.createdAt, JAN_15_2025),
        inArray(dialerCallAttempts.disposition, ['voicemail', 'no_answer', 'not_interested', 'qualified_lead'])
      )
    );

  console.log(`✅ Found ${calls.length} calls from Jan 15 onward`);
  return calls;
}

/**
 * Check if a lead was created for this call attempt
 */
async function checkForExistingLead(callAttemptId: string): Promise<string | null> {
  const existingLead = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.callAttemptId, callAttemptId))
    .limit(1);
  
  return existingLead.length > 0 ? existingLead[0].id : null;
}

/**
 * Analyze call using DeepSeek to determine if it's actually a voicemail
 */
async function analyzeCallWithDeepSeek(
  deepseek: OpenAI,
  transcription: string | null,
  callDurationSeconds: number | null
): Promise<{ isVoicemail: boolean; confidence: number; reasoning: string }> {
  if (!transcription || transcription.trim().length === 0) {
    return {
      isVoicemail: callDurationSeconds !== null && callDurationSeconds < 10,
      confidence: 0.5,
      reasoning: 'No transcription available - used call duration heuristic'
    };
  }

  const systemPrompt = `You are a call disposition analyzer. Determine if a call transcript indicates a voicemail or automated system response (not a qualified lead).

VOICEMAIL INDICATORS (100% voicemail):
- "leave a message", "leave your message", "after the beep", "after the tone", "not available", "cannot take your call", "unable to answer"
- "press pound when finished", "to disconnect press", "record your message"
- "mailbox full", "voicemail", "voice messaging system", "automatic voice message"

QUALIFIED LEAD INDICATORS (real conversation):
- Prospect confirms their name and asks questions
- Prospect engages in dialogue about products/services
- Prospect requests callback or provides information
- Prospect explicitly says "yes" to follow-up

Return a JSON response with:
{
  "is_voicemail": boolean,
  "confidence": 0-1 (1 = certain),
  "reasoning": "brief explanation"
}`;

  try {
    const result = await deepseek.chat.completions.create({
      model: process.env.VOICEMAIL_REANALYSIS_DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Analyze this call transcript and determine if it's a voicemail or qualified lead:\n\n${transcription}`
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const responseText = result.choices[0]?.message?.content || '';
    const parsed = JSON.parse(responseText);
    
    return {
      isVoicemail: parsed.is_voicemail,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning
    };
  } catch (error) {
    console.error('❌ DeepSeek analysis failed:', error);
    // Fallback: check transcription for voicemail keywords
    const lowerTranscript = transcription.toLowerCase();
    const voicemailKeywords = [
      'leave a message', 'after the beep', 'cannot take your call', 
      'voicemail', 'mailbox', 'press pound'
    ];
    const isVoicemail = voicemailKeywords.some(kw => lowerTranscript.includes(kw));
    
    return {
      isVoicemail,
      confidence: 0.6,
      reasoning: 'Fallback keyword analysis due to API error'
    };
  }
}

/**
 * Process a batch of calls
 */
type CallQueryResult = {
  id: string;
  contactId: string;
  campaignId: string;
  disposition: typeof dialerCallAttempts.$inferSelect['disposition'];
  voicemailDetected: boolean;
  recordingUrl: string | null;
  callDurationSeconds: number | null;
  connected: boolean;
  createdAt: Date;
};

async function processBatch(
  deepseek: OpenAI,
  calls: CallQueryResult[],
  batchNumber: number
) {
  const startIdx = (batchNumber - 1) * BATCH_SIZE;
  const endIdx = startIdx + BATCH_SIZE;
  const batch = calls.slice(startIdx, endIdx);

  console.log(`\n📦 Processing batch ${batchNumber} (${batch.length} calls)...`);

  for (const call of batch) {
    try {
      // Check if a lead was already created for this call
      const leadId = await checkForExistingLead(call.id);

      // Analyze call with DeepSeek (no transcription available in schema)
      const analysis = await analyzeCallWithDeepSeek(
        deepseek,
        null, // Transcription not stored in dialerCallAttempts
        call.callDurationSeconds
      );

      const result: VoicemailAnalysisResult = {
        callAttemptId: call.id,
        contactId: call.contactId,
        currentDisposition: call.disposition,
        voicemailDetected: call.voicemailDetected,
        leadId,
        analysisResult: {
          ...analysis,
          recommendedDisposition: analysis.isVoicemail ? 'voicemail' : (call.disposition || 'unknown')
        },
        correctionMade: false
      };

      // Determine if correction is needed
      if (analysis.isVoicemail && leadId) {
        // This is a voicemail that was mistakenly created as a lead
        console.log(`🚨 CORRECTION NEEDED: Call ${call.id} is a voicemail but has lead ${leadId}`);

        try {
          // Soft-delete the lead by marking it with a note about voicemail error
          await db
            .update(leads)
            .set({
              qaStatus: 'rejected',
              rejectedReason: 'voicemail_error_correction',
              deletedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(leads.id, leadId));

          // Update call attempt disposition to voicemail if it isn't already
          if (call.disposition !== 'voicemail') {
            await db
              .update(dialerCallAttempts)
              .set({
                disposition: 'voicemail',
                voicemailDetected: true,
                updatedAt: new Date()
              })
              .where(eq(dialerCallAttempts.id, call.id));
          }

          result.correctionMade = true;
          console.log(`✅ Corrected: Lead archived, disposition set to voicemail`);
        } catch (dbError) {
          result.error = `Database update failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`;
          console.error(`❌ Failed to correct lead:`, result.error);
        }
      } else if (analysis.isVoicemail && call.disposition !== 'voicemail') {
        // Voicemail but no lead - just update disposition
        try {
          await db
            .update(dialerCallAttempts)
            .set({
              disposition: 'voicemail',
              voicemailDetected: true,
              updatedAt: new Date()
            })
            .where(eq(dialerCallAttempts.id, call.id));

          result.correctionMade = true;
          console.log(`✅ Disposition corrected to voicemail (no lead created)`);
        } catch (dbError) {
          result.error = `Database update failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`;
        }
      }

      ANALYSIS_RESULTS.push(result);
    } catch (error) {
      console.error(`❌ Error processing call ${call.id}:`, error);
      ANALYSIS_RESULTS.push({
        callAttemptId: call.id,
        contactId: call.contactId,
        currentDisposition: call.disposition,
        voicemailDetected: call.voicemailDetected,
        leadId: null,
        analysisResult: {
          isVoicemail: false,
          confidence: 0,
          reasoning: 'Analysis failed',
          recommendedDisposition: 'unknown'
        },
        correctionMade: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Rate limiting: slight delay between API calls
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Generate analysis report
 */
function generateReport() {
  console.log('\n\n' + '='.repeat(80));
  console.log('📋 VOICEMAIL REANALYSIS REPORT');
  console.log('='.repeat(80));

  const stats = {
    totalProcessed: ANALYSIS_RESULTS.length,
    voicemailsIdentified: ANALYSIS_RESULTS.filter(r => r.analysisResult.isVoicemail).length,
    correctionsApplied: ANALYSIS_RESULTS.filter(r => r.correctionMade).length,
    leadsCorrected: ANALYSIS_RESULTS.filter(r => r.correctionMade && r.leadId).length,
    dispositionsCorrected: ANALYSIS_RESULTS.filter(r => r.correctionMade && !r.leadId).length,
    errors: ANALYSIS_RESULTS.filter(r => r.error).length
  };

  console.log(`\n✅ Summary Statistics:`);
  console.log(`   Total calls processed: ${stats.totalProcessed}`);
  console.log(`   Voicemails identified: ${stats.voicemailsIdentified}`);
  console.log(`   Corrections applied: ${stats.correctionsApplied}`);
  console.log(`   Leads archived: ${stats.leadsCorrected}`);
  console.log(`   Dispositions corrected: ${stats.dispositionsCorrected}`);
  console.log(`   Errors: ${stats.errors}`);

  console.log(`\n📊 Confidence Distribution:`);
  const confidenceRanges = {
    '0.0-0.3': ANALYSIS_RESULTS.filter(r => r.analysisResult.confidence <= 0.3).length,
    '0.3-0.6': ANALYSIS_RESULTS.filter(r => r.analysisResult.confidence > 0.3 && r.analysisResult.confidence <= 0.6).length,
    '0.6-0.9': ANALYSIS_RESULTS.filter(r => r.analysisResult.confidence > 0.6 && r.analysisResult.confidence <= 0.9).length,
    '0.9-1.0': ANALYSIS_RESULTS.filter(r => r.analysisResult.confidence > 0.9).length
  };
  
  Object.entries(confidenceRanges).forEach(([range, count]) => {
    console.log(`   ${range}: ${count} (${((count / stats.totalProcessed) * 100).toFixed(1)}%)`);
  });

  console.log(`\n🔍 Results by Status:`);
  const byVoicemail = ANALYSIS_RESULTS.filter(r => r.analysisResult.isVoicemail);
  const byNotVoicemail = ANALYSIS_RESULTS.filter(r => !r.analysisResult.isVoicemail);
  
  console.log(`   Voicemails: ${byVoicemail.length}`);
  console.log(`   Non-voicemails: ${byNotVoicemail.length}`);

  // Export detailed results
  const exportData = {
    generatedAt: new Date().toISOString(),
    stats,
    details: ANALYSIS_RESULTS.map(r => ({
      callAttemptId: r.callAttemptId,
      contactId: r.contactId,
      currentDisposition: r.currentDisposition,
      isVoicemail: r.analysisResult.isVoicemail,
      confidence: r.analysisResult.confidence,
      reasoning: r.analysisResult.reasoning,
      hadLead: !!r.leadId,
      correctionMade: r.correctionMade,
      error: r.error
    }))

  const reportPath = `voicemail-analysis-report-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(exportData, null, 2));
  console.log(`\n💾 Detailed report exported to: ${reportPath}`);

  console.log('\n' + '='.repeat(80));
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Starting batch reanalysis of voicemail calls...\n');
    
    const deepseek = await initializeDeepSeek();
    const calls = await queryHistoricalCalls();
    
    if (calls.length === 0) {
      console.log('✅ No calls found matching criteria. Exiting.');
      process.exit(0);
    }

    const totalBatches = Math.ceil(calls.length / BATCH_SIZE);
    console.log(`📦 Will process in ${totalBatches} batch(es) of ${BATCH_SIZE} calls each\n`);

    for (let i = 1; i <= totalBatches; i++) {
      await processBatch(deepseek, calls, i);
      
      // Add delay between batches
      if (i < totalBatches) {
        console.log(`⏳ Waiting before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    generateReport();
    console.log('\n✅ Batch reanalysis complete!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();
