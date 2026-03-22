/**
 * Diagnostic script to identify why voice agent is silent
 * Checks audio flow from Gemini -> Provider -> Telnyx
 */

import fs from 'fs';
import path from 'path';

const DIAGNOSTICS = {
  issues: [] as string[],
  checks: [] as { name: string; status: boolean; details: string }[],
};

function addIssue(issue: string) {
  DIAGNOSTICS.issues.push(issue);
}

function addCheck(name: string, status: boolean, details: string) {
  DIAGNOSTICS.checks.push({ name, status, details });
}

// Check 1: Verify audio:delta event is being emitted
console.log('\n🔍 Checking Gemini Provider Audio Event Flow...');
const geminiProviderPath = './server/services/voice-providers/gemini-live-provider.ts';
const geminiContent = fs.readFileSync(geminiProviderPath, 'utf-8');

if (geminiContent.includes("emit('audio:delta'")) {
  addCheck('Gemini audio:delta emission', true, 'Event is being emitted in handleAudioOutput');
} else {
  addCheck('Gemini audio:delta emission', false, 'NOT FOUND - agent cannot send audio');
  addIssue('🔴 CRITICAL: Gemini provider is not emitting audio:delta events');
}

// Check 2: Verify audio handler in voice-dialer
console.log('🔍 Checking Voice-Dialer Audio Handler...');
const voiceDialerPath = './server/services/voice-dialer.ts';
const voiceDialerContent = fs.readFileSync(voiceDialerPath, 'utf-8');

if (voiceDialerContent.includes("provider.on('audio:delta'")) {
  addCheck('Voice-dialer audio:delta listener', true, 'Event listener is configured');
} else {
  addCheck('Voice-dialer audio:delta listener', false, 'NOT FOUND');
  addIssue('🔴 CRITICAL: Voice-dialer is not listening for audio:delta events');
}

if (voiceDialerContent.includes('enqueueTelnyxOutboundAudio')) {
  addCheck('Telnyx outbound audio queueing', true, 'Audio queueing function exists');
} else {
  addCheck('Telnyx outbound audio queueing', false, 'NOT FOUND');
  addIssue('🔴 CRITICAL: Audio is not being queued for Telnyx transmission');
}

// Check 3: Verify Gemini WebSocket connection setup
console.log('🔍 Checking Gemini WebSocket Setup...');
if (geminiContent.includes('response_modalities: ["AUDIO"]')) {
  addCheck('Gemini audio modality', true, 'Audio response modality is enabled');
} else if (geminiContent.includes("response_modalities: ['AUDIO']")) {
  addCheck('Gemini audio modality', true, 'Audio response modality is enabled');
} else {
  addCheck('Gemini audio modality', false, 'NOT FOUND');
  addIssue('⚠️  WARNING: Gemini might not be configured to return audio');
}

// Check 4: Verify audio transcoding
console.log('🔍 Checking Audio Transcoding...');
if (geminiContent.includes('this.transcoder.geminiToTelnyx')) {
  addCheck('Audio transcoding G.711', true, 'PCM24k → G.711 transcoding is implemented');
} else {
  addCheck('Audio transcoding G.711', false, 'NOT FOUND');
  addIssue('🔴 CRITICAL: Gemini audio (PCM24k) is not being transcoded to G.711 for Telnyx');
}

// Check 5: Verify opening message sends correctly
console.log('🔍 Checking Opening Message Configuration...');
if (geminiContent.includes('sendOpeningMessage')) {
  addCheck('Opening message function', true, 'Function exists');
  if (geminiContent.includes('turn_complete')) {
    addCheck('Opening turn_complete signal', true, 'turn_complete is sent with opening message');
  } else {
    addCheck('Opening turn_complete signal', false, 'NOT FOUND');
    addIssue('⚠️  WARNING: Opening message might not trigger Gemini response generation');
  }
} else {
  addCheck('Opening message function', false, 'NOT FOUND');
  addIssue('🔴 CRITICAL: Agent cannot send opening message');
}

// Check 6: Verify server_content message parsing
console.log('🔍 Checking Gemini Message Parsing...');
if (geminiContent.includes('isServerContent') && geminiContent.includes('handleServerContent')) {
  addCheck('Server content parsing', true, 'Message routing is implemented');
  if (geminiContent.includes('model_turn?.parts') || geminiContent.includes('modelTurn?.parts')) {
    addCheck('Model turn parts extraction', true, 'Parts are being extracted from model responses');
  } else {
    addCheck('Model turn parts extraction', false, 'NOT FOUND');
    addIssue('🔴 CRITICAL: Gemini audio parts are not being extracted');
  }
} else {
  addCheck('Server content parsing', false, 'NOT FOUND');
  addIssue('🔴 CRITICAL: Server messages are not being parsed');
}

// Report
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('📊 VOICE AGENT SILENCE DIAGNOSTIC REPORT');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('✅ CHECKS PASSED:');
DIAGNOSTICS.checks.filter(c => c.status).forEach(check => {
  console.log(`   ✓ ${check.name}`);
  console.log(`     → ${check.details}`);
});

console.log('\n❌ CHECKS FAILED:');
DIAGNOSTICS.checks.filter(c => !c.status).forEach(check => {
  console.log(`   ✗ ${check.name}`);
  console.log(`     → ${check.details}`);
});

if (DIAGNOSTICS.issues.length > 0) {
  console.log('\n🚨 IDENTIFIED ISSUES:');
  DIAGNOSTICS.issues.forEach((issue, idx) => {
    console.log(`   ${idx + 1}. ${issue}`);
  });
}

console.log('\n═══════════════════════════════════════════════════════════════');

if (DIAGNOSTICS.issues.length === 0) {
  console.log('✅ NO CRITICAL ISSUES FOUND');
  console.log('\nLikely causes of silence:');
  console.log('   1. Gemini API not returning audio chunks');
  console.log('   2. Audio buffer not being sent to Telnyx due to connection issue');
  console.log('   3. Audio format mismatch (expected G.711 μ-law)');
  console.log('   4. Telnyx WebSocket connection not established');
} else {
  console.log(`❌ ${DIAGNOSTICS.issues.length} CRITICAL ISSUES FOUND - Please fix above!`);
}

console.log('═══════════════════════════════════════════════════════════════\n');