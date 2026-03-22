import { db } from './server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

// IVR patterns to exclude
const IVR_PATTERNS = [
  'press 1',
  'press 2',
  'press 3',
  'press 4',
  'press 5',
  'press 6',
  'press 7',
  'press 8',
  'press 9',
  'press 0',
  'press one',
  'press two',
  'press three',
  'leave a message',
  'after the tone',
  'after the beep',
  'not available',
  'mailbox is full',
  'record your message',
  'you have reached',
  'office hours',
  'please hold',
  'your call is important',
  'main menu',
  'returning call',
  'dial by name',
  'extension',
];

// Human conversation indicators
const HUMAN_INDICATORS = [
  'hi',
  'hello',
  'yes',
  'no',
  'who is this',
  'what is this about',
  'what do you want',
  'how can i help',
  'speaking',
  "this is",
  "i'm",
  'sure',
  'okay',
  'alright',
  'um',
  'uh',
  'well',
  'let me',
  'i think',
  'we are',
  "we're",
  'actually',
  'right now',
  'busy',
  'call back',
  'email',
  'send',
  'interested',
  'not interested',
  'company',
  'business',
];

function isLikelyHumanResponse(text: string): boolean {
  const lower = text.toLowerCase();

  // If it matches IVR patterns, it's not human
  for (const pattern of IVR_PATTERNS) {
    if (lower.includes(pattern)) return false;
  }

  // If it contains human conversation indicators, likely human
  for (const indicator of HUMAN_INDICATORS) {
    if (lower.includes(indicator)) return true;
  }

  // Short responses without IVR patterns are likely human
  if (text.length  lower.includes(p))) {
    return true;
  }

  return false;
}

function extractUserResponses(transcript: string): string[] {
  const lines = transcript.split('\n');
  const userResponses: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('user:')) {
      const response = trimmed.replace(/^user:\s*/i, '').trim();
      if (response.length > 0) {
        userResponses.push(response);
      }
    }
  }

  return userResponses;
}

function countHumanResponses(transcript: string): { total: number; humanLikely: number; ivrLikely: number; responses: string[] } {
  const userResponses = extractUserResponses(transcript);
  let humanLikely = 0;
  let ivrLikely = 0;

  for (const response of userResponses) {
    if (isLikelyHumanResponse(response)) {
      humanLikely++;
    } else {
      ivrLikely++;
    }
  }

  return {
    total: userResponses.length,
    humanLikely,
    ivrLikely,
    responses: userResponses.slice(0, 5) // First 5 responses
  };
}

async function findRealConversations() {
  console.log('========================================');
  console.log('FINDING REAL HUMAN CONVERSATIONS');
  console.log('Since January 15, 2026');
  console.log('========================================\n');

  // Find all calls with duration > 90 seconds since Jan 15 with transcripts
  const calls = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.campaign_id,
      dca.call_duration_seconds,
      dca.notes,
      dca.disposition,
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

  console.log(`Analyzing ${calls.rows.length} calls...\n`);

  interface ConversationAnalysis {
    id: string;
    contactName: string;
    company: string;
    email: string | null;
    phone: string;
    duration: number;
    humanResponses: number;
    ivrResponses: number;
    totalResponses: number;
    sampleResponses: string[];
    transcript: string;
    createdAt: string;
    campaignId: string;
    queueItemId: string | null;
    contactId: string;
  }

  const realConversations: ConversationAnalysis[] = [];
  const ivrOnlyCalls: ConversationAnalysis[] = [];
  const noResponseCalls: ConversationAnalysis[] = [];

  for (const row of calls.rows) {
    const r = row as any;
    const contactName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown';

    let transcript = r.notes || '';
    if (transcript.startsWith('[Transcript]')) {
      transcript = transcript.replace('[Transcript]', '').trim();
    }

    const analysis = countHumanResponses(transcript);

    const callAnalysis: ConversationAnalysis = {
      id: r.id,
      contactName,
      company: r.company_name || 'Unknown Company',
      email: r.email,
      phone: r.phone_dialed,
      duration: r.call_duration_seconds,
      humanResponses: analysis.humanLikely,
      ivrResponses: analysis.ivrLikely,
      totalResponses: analysis.total,
      sampleResponses: analysis.responses,
      transcript,
      createdAt: r.created_at,
      campaignId: r.campaign_id,
      queueItemId: r.queue_item_id,
      contactId: r.contact_id,
    };

    if (analysis.total === 0) {
      noResponseCalls.push(callAnalysis);
    } else if (analysis.humanLikely > 0 && analysis.humanLikely >= analysis.ivrLikely) {
      realConversations.push(callAnalysis);
    } else {
      ivrOnlyCalls.push(callAnalysis);
    }
  }

  // Sort real conversations by human responses descending
  realConversations.sort((a, b) => b.humanResponses - a.humanResponses);

  console.log('========================================');
  console.log('ANALYSIS RESULTS');
  console.log('========================================\n');

  console.log(`Total calls analyzed: ${calls.rows.length}`);
  console.log(`Real conversations (human detected): ${realConversations.length}`);
  console.log(`IVR-only calls: ${ivrOnlyCalls.length}`);
  console.log(`No response detected: ${noResponseCalls.length}`);

  if (realConversations.length > 0) {
    console.log('\n========================================');
    console.log('REAL HUMAN CONVERSATIONS FOUND');
    console.log('========================================\n');

    for (let i = 0; i  100 ? '...' : ''}"`);
      }
      console.log('\nFULL TRANSCRIPT:');
      console.log('-'.repeat(50));
      console.log(conv.transcript);
      console.log('-'.repeat(50));
    }
  }

  // Save results
  const outputData = {
    summary: {
      totalCalls: calls.rows.length,
      realConversations: realConversations.length,
      ivrOnlyCalls: ivrOnlyCalls.length,
      noResponseCalls: noResponseCalls.length,
    },
    realConversations: realConversations,
    ivrOnlyCalls: ivrOnlyCalls.slice(0, 10), // Save first 10
    noResponseCalls: noResponseCalls.slice(0, 10), // Save first 10
  };

  fs.writeFileSync('real-conversations-analysis.json', JSON.stringify(outputData, null, 2));
  console.log('\n\nFull analysis saved to: real-conversations-analysis.json');

  // Create CSV of real conversations
  if (realConversations.length > 0) {
    const csvLines = ['ID,Contact,Company,Email,Phone,Duration,HumanResponses,TotalResponses'];
    for (const conv of realConversations) {
      csvLines.push(`"${conv.id}","${conv.contactName}","${conv.company}","${conv.email || ''}","${conv.phone}",${conv.duration},${conv.humanResponses},${conv.totalResponses}`);
    }
    fs.writeFileSync('real-conversations.csv', csvLines.join('\n'));
    console.log('Real conversations CSV saved to: real-conversations.csv');
  }

  process.exit(0);
}

findRealConversations().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});