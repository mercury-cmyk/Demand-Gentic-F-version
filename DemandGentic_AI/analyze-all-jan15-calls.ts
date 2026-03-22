import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * Comprehensive Analysis of ALL January 15 Calls
 * Including calls >= 20 seconds to understand:
 * - Voicemail detection accuracy
 * - Disposition patterns
 * - System performance
 * - Call duration distribution
 * - Transcription coverage
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

async function analyzeAllJan15Calls() {
  console.log('========================================');
  console.log('COMPREHENSIVE JANUARY 15 ANALYSIS');
  console.log('ALL CALLS >= 20 SECONDS');
  console.log('========================================\n');

  // Fetch ALL calls from Jan 15 (>= 20 seconds)
  const result = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.disposition,
      dca.connected,
      dca.voicemail_detected,
      dca.notes,
      dca.recording_url,
      dca.created_at,
      dca.call_started_at,
      dca.call_ended_at,
      c.first_name,
      c.last_name,
      c.email,
      c.direct_phone,
      a.name as account_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.call_duration_seconds >= 20
    ORDER BY dca.call_duration_seconds DESC
  `);

  const allCalls = result.rows.map((row: any) => ({
    id: row.id,
    duration: row.call_duration_seconds || 0,
    disposition: row.disposition,
    connected: row.connected,
    voicemailDetected: row.voicemail_detected,
    hasTranscript: row.notes && row.notes.includes(TRANSCRIPT_MARKER),
    hasRecording: !!row.recording_url,
    name: `${row.first_name || 'Unknown'} ${row.last_name || ''}`.trim(),
    company: row.account_name,
    createdAt: row.created_at,
  }));

  console.log(`Total calls analyzed: ${allCalls.length}\n`);

  // ===== DURATION ANALYSIS =====
  console.log('========================================');
  console.log('DURATION DISTRIBUTION');
  console.log('========================================\n');

  const durationBuckets = {
    '20-30s': allCalls.filter(c => c.duration >= 20 && c.duration  c.duration >= 30 && c.duration  c.duration >= 60 && c.duration  c.duration >= 90 && c.duration  c.duration >= 120 && c.duration  c.duration >= 180).length,
  };

  Object.entries(durationBuckets).forEach(([bucket, count]) => {
    const percentage = ((count / allCalls.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(count / 10));
    console.log(`${bucket.padEnd(12)} ${count.toString().padStart(4)} calls (${percentage.padStart(5)}%)  ${bar}`);
  });

  const avgDuration = allCalls.reduce((sum, c) => sum + c.duration, 0) / allCalls.length;
  const maxDuration = Math.max(...allCalls.map(c => c.duration));
  const minDuration = Math.min(...allCalls.map(c => c.duration));

  console.log(`\nAverage Duration: ${avgDuration.toFixed(1)}s`);
  console.log(`Min Duration: ${minDuration}s`);
  console.log(`Max Duration: ${maxDuration}s\n`);

  // ===== DISPOSITION ANALYSIS =====
  console.log('========================================');
  console.log('DISPOSITION BREAKDOWN');
  console.log('========================================\n');

  const dispositions: { [key: string]: number } = {};
  allCalls.forEach(call => {
    const disp = call.disposition || 'NO_DISPOSITION';
    dispositions[disp] = (dispositions[disp] || 0) + 1;
  });

  const sortedDispositions = Object.entries(dispositions)
    .sort((a, b) => b[1] - a[1]);

  sortedDispositions.forEach(([disp, count]) => {
    const percentage = ((count / allCalls.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(count / 20));
    console.log(`${disp.padEnd(20)} ${count.toString().padStart(4)} (${percentage.padStart(5)}%)  ${bar}`);
  });

  // ===== VOICEMAIL ANALYSIS =====
  console.log('\n========================================');
  console.log('VOICEMAIL DETECTION ANALYSIS');
  console.log('========================================\n');

  const voicemailCalls = allCalls.filter(c => c.voicemailDetected);
  const noVoicemail = allCalls.filter(c => !c.voicemailDetected);

  console.log(`Voicemail Detected: ${voicemailCalls.length} (${((voicemailCalls.length / allCalls.length) * 100).toFixed(1)}%)`);
  console.log(`No Voicemail: ${noVoicemail.length} (${((noVoicemail.length / allCalls.length) * 100).toFixed(1)}%)\n`);

  // Voicemail by disposition
  console.log('Voicemail Detection by Disposition:');
  sortedDispositions.forEach(([disp]) => {
    const dispCalls = allCalls.filter(c => (c.disposition || 'NO_DISPOSITION') === disp);
    const vmCount = dispCalls.filter(c => c.voicemailDetected).length;
    const vmPercentage = dispCalls.length > 0 ? ((vmCount / dispCalls.length) * 100).toFixed(1) : '0.0';
    console.log(`  ${disp.padEnd(20)} ${vmCount.toString().padStart(3)}/${dispCalls.length.toString().padStart(3)} (${vmPercentage.padStart(5)}%)`);
  });

  // Average duration for voicemail vs non-voicemail
  const avgVmDuration = voicemailCalls.length > 0
    ? voicemailCalls.reduce((sum, c) => sum + c.duration, 0) / voicemailCalls.length
    : 0;
  const avgNonVmDuration = noVoicemail.length > 0
    ? noVoicemail.reduce((sum, c) => sum + c.duration, 0) / noVoicemail.length
    : 0;

  console.log(`\nAverage Duration:`);
  console.log(`  With Voicemail: ${avgVmDuration.toFixed(1)}s`);
  console.log(`  Without Voicemail: ${avgNonVmDuration.toFixed(1)}s`);

  // ===== TRANSCRIPTION COVERAGE =====
  console.log('\n========================================');
  console.log('TRANSCRIPTION COVERAGE');
  console.log('========================================\n');

  const transcribedCalls = allCalls.filter(c => c.hasTranscript);
  const withRecording = allCalls.filter(c => c.hasRecording);

  console.log(`Total Calls: ${allCalls.length}`);
  console.log(`With Recording URL: ${withRecording.length} (${((withRecording.length / allCalls.length) * 100).toFixed(1)}%)`);
  console.log(`Transcribed: ${transcribedCalls.length} (${((transcribedCalls.length / allCalls.length) * 100).toFixed(1)}%)`);
  console.log(`Not Transcribed: ${allCalls.length - transcribedCalls.length}\n`);

  // Transcription coverage by duration
  console.log('Transcription Coverage by Duration:');
  Object.entries(durationBuckets).forEach(([bucket]) => {
    const [min, max] = bucket.split('-').map(s => parseInt(s) || 9999);
    const bucketCalls = allCalls.filter(c => c.duration >= min && c.duration  c.hasTranscript).length;
    const percentage = bucketCalls.length > 0 ? ((transcribed / bucketCalls.length) * 100).toFixed(1) : '0.0';
    console.log(`  ${bucket.padEnd(12)} ${transcribed.toString().padStart(3)}/${bucketCalls.length.toString().padStart(3)} (${percentage.padStart(5)}%)`);
  });

  // ===== CONNECTION STATUS =====
  console.log('\n========================================');
  console.log('CONNECTION STATUS');
  console.log('========================================\n');

  const connected = allCalls.filter(c => c.connected);
  const notConnected = allCalls.filter(c => !c.connected);

  console.log(`Connected: ${connected.length} (${((connected.length / allCalls.length) * 100).toFixed(1)}%)`);
  console.log(`Not Connected: ${notConnected.length} (${((notConnected.length / allCalls.length) * 100).toFixed(1)}%)\n`);

  // Connection by disposition
  console.log('Connection Rate by Disposition:');
  sortedDispositions.forEach(([disp]) => {
    const dispCalls = allCalls.filter(c => (c.disposition || 'NO_DISPOSITION') === disp);
    const connectedCount = dispCalls.filter(c => c.connected).length;
    const connPercentage = dispCalls.length > 0 ? ((connectedCount / dispCalls.length) * 100).toFixed(1) : '0.0';
    console.log(`  ${disp.padEnd(20)} ${connectedCount.toString().padStart(3)}/${dispCalls.length.toString().padStart(3)} (${connPercentage.padStart(5)}%)`);
  });

  // ===== VOICEMAIL BEHAVIOR INSIGHTS =====
  console.log('\n========================================');
  console.log('VOICEMAIL BEHAVIOR INSIGHTS');
  console.log('========================================\n');

  // Calls that are voicemail but disposition is not voicemail
  const vmWithOtherDisp = voicemailCalls.filter(c => c.disposition !== 'voicemail');
  console.log(`Voicemail Detected but disposition ≠ 'voicemail': ${vmWithOtherDisp.length}`);
  if (vmWithOtherDisp.length > 0) {
    const dispBreakdown: { [key: string]: number } = {};
    vmWithOtherDisp.forEach(c => {
      const disp = c.disposition || 'NO_DISPOSITION';
      dispBreakdown[disp] = (dispBreakdown[disp] || 0) + 1;
    });
    Object.entries(dispBreakdown).forEach(([disp, count]) => {
      console.log(`  ${disp}: ${count} calls`);
    });
  }

  // Disposition = voicemail but detection = false
  const vmDispNoDetection = allCalls.filter(c => c.disposition === 'voicemail' && !c.voicemailDetected);
  console.log(`\nDisposition = 'voicemail' but not detected: ${vmDispNoDetection.length}`);

  // Duration analysis for voicemail
  const vmDurations = voicemailCalls.map(c => c.duration).sort((a, b) => a - b);
  if (vmDurations.length > 0) {
    const vmMedian = vmDurations[Math.floor(vmDurations.length / 2)];
    const vmMin = vmDurations[0];
    const vmMax = vmDurations[vmDurations.length - 1];
    console.log(`\nVoicemail Duration Stats:`);
    console.log(`  Min: ${vmMin}s`);
    console.log(`  Median: ${vmMedian}s`);
    console.log(`  Max: ${vmMax}s`);
    console.log(`  Average: ${avgVmDuration.toFixed(1)}s`);
  }

  // ===== SYSTEM PERFORMANCE =====
  console.log('\n========================================');
  console.log('SYSTEM PERFORMANCE');
  console.log('========================================\n');

  console.log('Call Outcomes:');
  console.log(`  Connected (human answered): ${connected.length} (${((connected.length / allCalls.length) * 100).toFixed(1)}%)`);
  console.log(`  Voicemail: ${voicemailCalls.length} (${((voicemailCalls.length / allCalls.length) * 100).toFixed(1)}%)`);
  console.log(`  No Answer: ${notConnected.filter(c => !c.voicemailDetected).length} (${((notConnected.filter(c => !c.voicemailDetected).length / allCalls.length) * 100).toFixed(1)}%)\n`);

  // Calls per hour distribution
  const callsByHour: { [key: number]: number } = {};
  allCalls.forEach(call => {
    const hour = new Date(call.createdAt).getHours();
    callsByHour[hour] = (callsByHour[hour] || 0) + 1;
  });

  console.log('Calls by Hour (UTC):');
  Object.entries(callsByHour)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .forEach(([hour, count]) => {
      const bar = '█'.repeat(Math.floor(count / 10));
      console.log(`  ${hour.padStart(2)}:00  ${count.toString().padStart(3)} calls  ${bar}`);
    });

  // ===== RECOMMENDATIONS =====
  console.log('\n========================================');
  console.log('RECOMMENDATIONS');
  console.log('========================================\n');

  const transcriptionGap = allCalls.length - transcribedCalls.length;
  const transcriptionRate = (transcribedCalls.length / allCalls.length) * 100;

  console.log('1. Transcription:');
  if (transcriptionRate  c.disposition === 'voicemail').length / Math.max(voicemailCalls.length, 1) * 100;
  if (vmAccuracy  c.duration  allCalls.length * 0.5) {
    console.log(`   ⚠️  ${((shortCalls / allCalls.length) * 100).toFixed(1)}% of calls are very short (=20s): ${allCalls.length}`);
  console.log(`  Transcribed: ${transcribedCalls.length} (${transcriptionRate.toFixed(1)}%)`);
  console.log(`  Connected: ${connected.length} (${connectionRate.toFixed(1)}%)`);
  console.log(`  Voicemail: ${voicemailCalls.length} (${((voicemailCalls.length / allCalls.length) * 100).toFixed(1)}%)`);
  console.log(`  Average Duration: ${avgDuration.toFixed(1)}s`);
  console.log(`  Top Disposition: ${sortedDispositions[0][0]} (${sortedDispositions[0][1]} calls)\n`);

  console.log('Next Actions:');
  console.log('  1. Review untranscribed calls and set up auto-transcription');
  console.log('  2. Analyze voicemail detection accuracy');
  console.log('  3. Optimize calling times based on hour distribution');
  console.log('  4. Review short call patterns for script improvements');

  process.exit(0);
}

analyzeAllJan15Calls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});