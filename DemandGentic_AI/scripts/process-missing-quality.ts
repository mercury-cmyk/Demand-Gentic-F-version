import 'dotenv/config';
import { db } from '../server/db';
import { callSessions, callQualityRecords, campaigns, contacts, accounts } from '../shared/schema';
import { and, gte, lt, isNull, isNotNull, eq, desc, notInArray, sql } from 'drizzle-orm';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';
import { logCallIntelligence } from '../server/services/call-intelligence-logger';

async function processMissingQuality() {
  console.log('Starting Quality Analysis Backfill for Showcase Candidates...');

  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 120);

  // Get IDs of calls that already have quality records
  const existingQuality = await db.select({ id: callQualityRecords.callSessionId }).from(callQualityRecords);
  const existingIds = existingQuality.map(q => q.id).filter(id => id !== null) as string[];

  console.log(`Found ${existingIds.length} existing quality records.`);

  let query = db.select({
      id: callSessions.id,
      transcript: callSessions.aiTranscript,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      duration: callSessions.durationSec,
      createdAt: callSessions.createdAt,
      aiDisposition: callSessions.aiDisposition
    })
    .from(callSessions)
    .where(and(
      gte(callSessions.createdAt, recentDate),
      isNotNull(callSessions.aiTranscript),
      existingIds.length > 0 ? notInArray(callSessions.id, existingIds) : undefined,
      gte(callSessions.durationSec, 15)
    ))
    .orderBy(
      sql`CASE 
        WHEN LOWER(${callSessions.aiDisposition}) IN (
          'qualified', 'appointment_set', 'appointment set', 
          'transferred', 'call_transferred', 'call transferred',
          'callback_scheduled', 'callback scheduled', 'converted'
        ) THEN 1 
        ELSE 0 
      END DESC`,
      desc(callSessions.durationSec)
    )
    .limit(2000);

  const candidates = await query;
  
  console.log(`Found ${candidates.length} candidates with transcripts but missing quality records.`);
  
  let successCount = 0;
  let highQualityCount = 0;

  for (const session of candidates) {
    if (!session.transcript) continue;
    
    // console.log(`Processing session ${session.id} (${session.duration}s)...`);

    try {
      let campaign = null;
      let contact = null;
      let account = null;

      if (session.campaignId) {
         [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, session.campaignId)).limit(1);
      }
      if (session.contactId) {
         [contact] = await db.select().from(contacts).where(eq(contacts.id, session.contactId)).limit(1);
         if (contact && contact.accountId) {
            [account] = await db.select().from(accounts).where(eq(accounts.id, contact.accountId)).limit(1);
         }
      }

      let transcriptText = '';
      if (typeof session.transcript === 'string') {
        if (session.transcript.trim().startsWith('[') || session.transcript.trim().startsWith('{')) {
          try {
             const parsed = JSON.parse(session.transcript);
             if (Array.isArray(parsed)) {
               transcriptText = parsed.map((t: any) => `${t.role || 'Unknown'}: ${t.message || t.content || ''}`).join('\n');
             } else {
               transcriptText = JSON.stringify(parsed); 
             }
          } catch (e) {
             transcriptText = session.transcript;
          }
        } else {
          transcriptText = session.transcript;
        }
      } else if (Array.isArray(session.transcript)) {
         transcriptText = session.transcript.map((t: any) => `${t.role || 'Unknown'}: ${t.message || t.content || ''}`).join('\n'); 
      } else {
         transcriptText = String(session.transcript);
      }
      
      if (!transcriptText || transcriptText.length = 40) {
        highQualityCount++;
        console.log(`  [HIGH SCORE] Found call with score ${analysis.qualityScore}.`);
      }
      
      if (successCount % 20 === 0) {
        console.log(`Processed ${successCount}/${candidates.length} calls so far. Found ${highQualityCount} high quality.`);
      }

    } catch (err) {
      console.error(`  Error processing session ${session.id}:`, err);
    }
  }
  console.log(`Done! Analyzed ${successCount} calls. Found ${highQualityCount} new high quality candidates.`);
}

processMissingQuality().catch(console.error);