import { db } from './server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

/**
 * Generate Report of All 77 Real Conversations
 * Creates CSV and detailed Markdown report
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

function isRealConversation(transcript: string): {
  isReal: boolean;
  score: number;
  prospectResponses: string[];
} {
  const prospectResponses: string[] = [];
  let score = 0;

  const vmPatterns = [
    { pattern: /leave a message/i, penalty: -50 },
    { pattern: /after the tone/i, penalty: -50 },
    { pattern: /press.*for/i, penalty: -40 },
    { pattern: /mailbox is full/i, penalty: -100 },
    { pattern: /not available/i, penalty: -30 },
  ];

  const conversationPatterns = [
    { pattern: /\b(who is this|who are you)\b/i, points: 50 },
    { pattern: /\b(why.*calling|stop calling|quit calling)\b/i, points: 60 },
    { pattern: /\b(yes|yeah|yep|sure|okay)\b.*\b(interested|send|email|tell me)\b/i, points: 100 },
    { pattern: /\b(no thanks|not interested|remove.*list)\b/i, points: 40 },
    { pattern: /\b(i'?m|we'?re).*\b(busy|meeting|call back)\b/i, points: 70 },
    { pattern: /\bwhat.*about\b/i, points: 60 },
    { pattern: /\bhello\?+\b/i, points: 30 },
  ];

  vmPatterns.forEach(({ pattern, penalty }) => {
    if (pattern.test(transcript)) score += penalty;
  });

  conversationPatterns.forEach(({ pattern, points }) => {
    const match = transcript.match(pattern);
    if (match) {
      score += points;
      prospectResponses.push(match[0]);
    }
  });

  const lines = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  if (lines.length > 5) {
    const firstLine = lines[0];
    const repetitions = lines.filter(l => l === firstLine).length;
    if (repetitions > lines.length * 0.4) score -= 60;
  }

  const words = transcript.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const uniqueRatio = uniqueWords.size / Math.max(words.length, 1);
  if (uniqueRatio < 0.25) score -= 40;
  else if (uniqueRatio > 0.6) score += 30;

  const isReal = score > 0;
  return { isReal, score, prospectResponses };
}

async function generateReport() {
  console.log('========================================');
  console.log('GENERATE 77 CONVERSATIONS REPORT');
  console.log('========================================\n');

  const result = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.disposition,
      dca.connected,
      dca.voicemail_detected,
      dca.notes,
      dca.recording_url,
      dca.telnyx_call_id,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email,
      c.direct_phone,
      c.job_title,
      a.name as account_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.call_duration_seconds >= 30
      AND dca.notes LIKE '%[Call Transcript]%'
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Analyzing ${result.rows.length} calls...\n`);

  const conversations: any[] = [];

  result.rows.forEach((row: any) => {
    const transcript = extractTranscript(row.notes);
    if (!transcript) return;

    const analysis = isRealConversation(transcript);

    if (analysis.isReal) {
      conversations.push({
        id: row.id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        email: row.email,
        phone: row.direct_phone,
        jobTitle: row.job_title,
        company: row.account_name,
        duration: row.call_duration_seconds,
        disposition: row.disposition,
        connected: row.connected,
        voicemailDetected: row.voicemail_detected,
        score: analysis.score,
        prospectResponses: analysis.prospectResponses,
        transcript: transcript,
        recordingUrl: row.recording_url,
        telnyxCallId: row.telnyx_call_id,
        createdAt: row.created_at,
      });
    }
  });

  conversations.sort((a, b) => b.score - a.score);

  console.log(`✅ Found ${conversations.length} real conversations\n`);

  // Categorize
  const positive = conversations.filter(c => c.prospectResponses.some((r: string) =>
    /interested|send|email|tell me|yes|sure|okay/i.test(r)
  ));
  const negative = conversations.filter(c => c.prospectResponses.some((r: string) =>
    /stop|quit|not interested|remove|no thanks/i.test(r)
  ));
  const neutral = conversations.filter(c =>
    !positive.includes(c) && !negative.includes(c)
  );

  console.log('Categorization:');
  console.log(`  Positive/Interested: ${positive.length}`);
  console.log(`  Negative/Not Interested: ${negative.length}`);
  console.log(`  Neutral: ${neutral.length}\n`);

  // Generate CSV
  console.log('Generating CSV report...');

  const csvHeaders = 'Name,Email,Phone,Title,Company,Duration,Score,Category,Disposition,Prospect Responses,Call ID,Recording URL';
  const csvRows = conversations.map(c => {
    const category = positive.includes(c) ? 'Positive' : (negative.includes(c) ? 'Negative' : 'Neutral');
    return [
      `"${c.name}"`,
      `"${c.email || ''}"`,
      `"${c.phone || ''}"`,
      `"${c.jobTitle || ''}"`,
      `"${c.company || ''}"`,
      c.duration,
      c.score,
      category,
      c.disposition,
      `"${c.prospectResponses.join('; ')}"`,
      c.id,
      `"${c.recordingUrl || ''}"`,
    ].join(',');
  });

  const csv = [csvHeaders, ...csvRows].join('\n');
  fs.writeFileSync('./jan15-77-conversations.csv', csv);
  console.log('✅ Saved: jan15-77-conversations.csv\n');

  // Generate Markdown Report
  console.log('Generating Markdown report...');

  const markdown = `# January 15, 2026 - Real Conversations Report

## Summary

**Total Real Conversations**: ${conversations.length} out of ${result.rows.length} transcribed calls (${(conversations.length/result.rows.length*100).toFixed(1)}%)

### Categorization

- **Positive/Interested**: ${positive.length} leads
- **Negative/Not Interested**: ${negative.length} leads
- **Neutral**: ${neutral.length} leads

---

## 🎯 Positive/Interested Conversations (${positive.length})

These prospects showed actual interest and should be prioritized for follow-up.

${positive.map((c, i) => `
### ${i + 1}. ${c.name} @ ${c.company || 'N/A'}

**Contact Information:**
- Email: ${c.email || 'N/A'}
- Phone: ${c.phone || 'N/A'}
- Title: ${c.jobTitle || 'N/A'}

**Call Details:**
- Duration: ${c.duration}s
- Score: ${c.score}/100
- Disposition: ${c.disposition}
- Connected: ${c.connected}
- Voicemail Detected: ${c.voicemailDetected}

**Prospect Responses:**
${c.prospectResponses.map((r: string) => `- "${r}"`).join('\n')}

**Transcript (First 500 chars):**
\`\`\`
${c.transcript.substring(0, 500)}...
\`\`\`

**Recording:**
- URL: ${c.recordingUrl || 'N/A'} *(Expired)*
- Telnyx ID: ${c.telnyxCallId || 'N/A'}
- Call ID: ${c.id}

---
`).join('\n')}

## ❌ Negative/Not Interested (${negative.length})

These prospects explicitly declined interest.

${negative.map((c, i) => `
### ${i + 1}. ${c.name} @ ${c.company || 'N/A'}

- Email: ${c.email || 'N/A'}
- Response: ${c.prospectResponses.join(', ')}
- Duration: ${c.duration}s

---
`).join('\n')}

## 🤝 Neutral Conversations (${neutral.length})

These prospects answered but didn't express clear interest or rejection. May require nurturing.

${neutral.slice(0, 10).map((c, i) => `
### ${i + 1}. ${c.name} @ ${c.company || 'N/A'}

- Email: ${c.email || 'N/A'}
- Title: ${c.jobTitle || 'N/A'}
- Company: ${c.company || 'N/A'}
- Duration: ${c.duration}s
- Score: ${c.score}

---
`).join('\n')}

${neutral.length > 10 ? `\n... and ${neutral.length - 10} more neutral conversations (see CSV for full list)\n` : ''}

---

## System Issues Found

### Connected Flag
- **Should be marked**: ${conversations.length} calls
- **Actually marked**: ${conversations.filter(c => c.connected).length} calls
- **Accuracy**: ${(conversations.filter(c => c.connected).length / conversations.length * 100).toFixed(1)}%

### Voicemail Detection
- **Voicemails (estimated)**: ~${result.rows.length - conversations.length}
- **Detected by system**: ${result.rows.filter((r: any) => r.voicemail_detected).length}
- **Accuracy**: ${(result.rows.filter((r: any) => r.voicemail_detected).length / (result.rows.length - conversations.length) * 100).toFixed(1)}%

### Disposition Tracking
- **Calls marked "no_answer"**: ${conversations.filter(c => c.disposition === 'no_answer').length}/${conversations.length} real conversations
- **Should be**: "answered" or specific dispositions

---

## Recommendations

### Immediate Actions

1. **Follow up with ${positive.length} positive leads** within 24 hours
2. **Fix system flags** using \`fix-system-flags-jan15.ts --execute\`
3. **Review neutral leads** for potential nurture campaigns

### System Improvements

1. **Fix \`connected\` flag logic** - Currently 0% accuracy
2. **Fix \`voicemail_detected\` logic** - Currently 0% accuracy
3. **Update disposition logic** - Most calls incorrectly marked "no_answer"
4. **Improve call classification** - Automatically categorize conversations vs voicemails

### Campaign Optimization

1. **Call timing**: Analyze when most conversations happened
2. **Script improvements**: Review successful engagements
3. **Target list quality**: ${(conversations.length/result.rows.length*100).toFixed(1)}% connection rate is ${(conversations.length/result.rows.length*100) < 10 ? 'low' : 'acceptable'}

---

## Files Generated

- \`jan15-77-conversations.csv\` - Full list with contact details
- \`JAN15-77-CONVERSATIONS-REPORT.md\` - This detailed report

---

## Next Steps

1. Import CSV to CRM for systematic follow-up
2. Run \`npx tsx create-3-qualified-leads.ts\` to add top 3 to leads table
3. Run \`npx tsx fix-system-flags-jan15.ts --execute\` to correct system flags
4. Schedule follow-ups with positive leads

---

*Report generated: ${new Date().toISOString()}*
`;

  fs.writeFileSync('./JAN15-77-CONVERSATIONS-REPORT.md', markdown);
  console.log('✅ Saved: JAN15-77-CONVERSATIONS-REPORT.md\n');

  console.log('========================================');
  console.log('REPORT COMPLETE');
  console.log('========================================\n');

  console.log('Files created:');
  console.log('  1. jan15-77-conversations.csv - Import to CRM');
  console.log('  2. JAN15-77-CONVERSATIONS-REPORT.md - Detailed analysis\n');

  console.log('Summary:');
  console.log(`  Total conversations: ${conversations.length}`);
  console.log(`  Positive (follow up now): ${positive.length}`);
  console.log(`  Negative (do not contact): ${negative.length}`);
  console.log(`  Neutral (nurture campaign): ${neutral.length}\n`);

  console.log('Next commands:');
  console.log('  npx tsx create-3-qualified-leads.ts        # Add top 3 to leads table');
  console.log('  npx tsx fix-system-flags-jan15.ts          # Preview flag fixes');
  console.log('  npx tsx fix-system-flags-jan15.ts --execute # Apply flag fixes\n');

  process.exit(0);
}

generateReport().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
