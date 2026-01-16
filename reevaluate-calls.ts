import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { leads, dialerCallAttempts, contacts, accounts, callSessions, qcWorkQueue } from '@shared/schema';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface CallToEvaluate {
  id: string;
  contactId: string;
  campaignId: string;
  callDurationSeconds: number;
  notes: string | null;
  disposition: string | null;
  recordingUrl: string | null;
  phoneDialed: string;
  createdAt: Date;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
  queueItemId: string | null;
}

interface EvaluationResult {
  disposition: 'qualified_lead' | 'not_interested' | 'voicemail' | 'no_answer' | 'callback_requested';
  confidence: number;
  reason: string;
  keyTopics: string[];
  interestLevel: 'high' | 'medium' | 'low' | 'none';
  shouldCreateLead: boolean;
}

async function evaluateTranscript(transcript: string, contactName: string, company: string): Promise<EvaluationResult> {
  const prompt = `You are a lead qualification expert. Analyze this call transcript and determine the appropriate disposition.

CONTACT: ${contactName} at ${company}

TRANSCRIPT:
${transcript}

CRITERIA FOR QUALIFIED LEAD:
- Person expressed genuine interest in the offering
- Asked questions about pricing, features, or implementation
- Requested more information, demo, or callback
- Agreed to schedule a meeting or follow-up
- Engaged in meaningful conversation about their needs

CRITERIA FOR NOT INTERESTED:
- Explicitly said not interested
- Asked to be removed from list
- Was hostile or dismissive
- Said they already have a solution

CRITERIA FOR CALLBACK REQUESTED:
- Asked to be called back at a specific time
- Said they're busy now but want to talk later

CRITERIA FOR VOICEMAIL/NO_ANSWER:
- Went to voicemail
- Person was not available or didn't engage

Respond in JSON format:
{
  "disposition": "qualified_lead" | "not_interested" | "callback_requested" | "voicemail" | "no_answer",
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "keyTopics": ["topic1", "topic2"],
  "interestLevel": "high" | "medium" | "low" | "none",
  "shouldCreateLead": true/false
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      disposition: result.disposition || 'no_answer',
      confidence: result.confidence || 0,
      reason: result.reason || 'Unable to determine',
      keyTopics: result.keyTopics || [],
      interestLevel: result.interestLevel || 'none',
      shouldCreateLead: result.shouldCreateLead || false,
    };
  } catch (error) {
    console.error('Error evaluating transcript:', error);
    return {
      disposition: 'no_answer',
      confidence: 0,
      reason: 'Evaluation error',
      keyTopics: [],
      interestLevel: 'none',
      shouldCreateLead: false,
    };
  }
}

async function reevaluateCalls() {
  console.log('========================================');
  console.log('RE-EVALUATING CALLS > 90 SECONDS');
  console.log('Since January 15, 2026');
  console.log('========================================\n');

  // Find all calls with duration > 90 seconds since Jan 15 that have no_answer disposition
  const callsToEvaluate = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.campaign_id,
      dca.call_duration_seconds,
      dca.notes,
      dca.disposition,
      dca.recording_url,
      dca.phone_dialed,
      dca.queue_item_id,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email,
      a.name as company_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at >= '2026-01-15'
      AND dca.call_duration_seconds > 90
      AND (dca.disposition = 'no_answer' OR dca.disposition IS NULL)
      AND dca.notes IS NOT NULL
      AND LENGTH(dca.notes) > 50
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Found ${callsToEvaluate.rows.length} calls to evaluate\n`);

  if (callsToEvaluate.rows.length === 0) {
    console.log('No calls to evaluate');
    process.exit(0);
  }

  const results = {
    total: callsToEvaluate.rows.length,
    evaluated: 0,
    qualifiedLeads: 0,
    notInterested: 0,
    callbackRequested: 0,
    voicemail: 0,
    noAnswer: 0,
    leadsCreated: 0,
    errors: 0,
  };

  const qualifiedLeadsList: Array<{
    name: string;
    company: string;
    email: string | null;
    phone: string;
    duration: number;
    reason: string;
    keyTopics: string[];
  }> = [];

  console.log('Evaluating calls...\n');

  for (let i = 0; i < callsToEvaluate.rows.length; i++) {
    const row = callsToEvaluate.rows[i] as any;
    const contactName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown';
    const company = row.company_name || 'Unknown Company';

    // Extract transcript from notes (may be prefixed with "[Transcript]")
    let transcript = row.notes || '';
    if (transcript.startsWith('[Transcript]')) {
      transcript = transcript.replace('[Transcript]', '').trim();
    }

    // Skip if transcript is too short
    if (transcript.length < 100) {
      console.log(`[${i + 1}/${callsToEvaluate.rows.length}] ${contactName} - Transcript too short, skipping`);
      continue;
    }

    console.log(`[${i + 1}/${callsToEvaluate.rows.length}] Evaluating: ${contactName} @ ${company} (${row.call_duration_seconds}s)`);

    try {
      const evaluation = await evaluateTranscript(transcript, contactName, company);
      results.evaluated++;

      switch (evaluation.disposition) {
        case 'qualified_lead':
          results.qualifiedLeads++;
          if (evaluation.shouldCreateLead) {
            qualifiedLeadsList.push({
              name: contactName,
              company: company,
              email: row.email,
              phone: row.phone_dialed,
              duration: row.call_duration_seconds,
              reason: evaluation.reason,
              keyTopics: evaluation.keyTopics,
            });
          }
          break;
        case 'not_interested':
          results.notInterested++;
          break;
        case 'callback_requested':
          results.callbackRequested++;
          qualifiedLeadsList.push({
            name: contactName,
            company: company,
            email: row.email,
            phone: row.phone_dialed,
            duration: row.call_duration_seconds,
            reason: evaluation.reason,
            keyTopics: evaluation.keyTopics,
          });
          break;
        case 'voicemail':
          results.voicemail++;
          break;
        default:
          results.noAnswer++;
      }

      console.log(`  -> ${evaluation.disposition} (confidence: ${evaluation.confidence.toFixed(2)}) - ${evaluation.reason.substring(0, 60)}...`);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      results.errors++;
      console.error(`  -> ERROR: ${error}`);
    }
  }

  console.log('\n========================================');
  console.log('EVALUATION RESULTS');
  console.log('========================================\n');

  console.log(`Total calls analyzed: ${results.total}`);
  console.log(`Successfully evaluated: ${results.evaluated}`);
  console.log(`Errors: ${results.errors}`);
  console.log('');
  console.log('Disposition Breakdown:');
  console.log(`  Qualified Leads: ${results.qualifiedLeads}`);
  console.log(`  Not Interested: ${results.notInterested}`);
  console.log(`  Callback Requested: ${results.callbackRequested}`);
  console.log(`  Voicemail: ${results.voicemail}`);
  console.log(`  No Answer: ${results.noAnswer}`);

  if (qualifiedLeadsList.length > 0) {
    console.log('\n========================================');
    console.log('QUALIFIED LEADS IDENTIFIED');
    console.log('========================================\n');

    for (let i = 0; i < qualifiedLeadsList.length; i++) {
      const lead = qualifiedLeadsList[i];
      console.log(`\n--- Lead ${i + 1} ---`);
      console.log(`Name: ${lead.name}`);
      console.log(`Company: ${lead.company}`);
      console.log(`Email: ${lead.email || 'N/A'}`);
      console.log(`Phone: ${lead.phone}`);
      console.log(`Call Duration: ${lead.duration}s`);
      console.log(`Reason: ${lead.reason}`);
      console.log(`Key Topics: ${lead.keyTopics.join(', ') || 'N/A'}`);
    }

    console.log('\n========================================');
    console.log(`TOTAL POTENTIAL QUALIFIED LEADS: ${qualifiedLeadsList.length}`);
    console.log('========================================\n');

    console.log('To create leads for these contacts, run:');
    console.log('npx tsx create-leads-from-evaluation.ts');
  } else {
    console.log('\nNo qualified leads found.');
  }

  // Save qualified leads list to a file for later processing
  if (qualifiedLeadsList.length > 0) {
    const fs = await import('fs');
    fs.writeFileSync(
      'qualified-leads-evaluation.json',
      JSON.stringify(qualifiedLeadsList, null, 2)
    );
    console.log('\nQualified leads saved to: qualified-leads-evaluation.json');
  }

  process.exit(0);
}

reevaluateCalls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
