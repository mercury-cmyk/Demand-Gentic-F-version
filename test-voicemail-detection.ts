/**
 * Test the voicemail detection patterns against real transcripts from Jan 15
 */

const voicemailPatterns = [
  /leave\s+(a\s+)?message/i,
  /leave\s+your\s+message/i,
  /after\s+the\s+(beep|tone)/i,
  /at\s+the\s+(beep|tone)/i,
  /not\s+(available|able)\s+to/i,
  /can(')?t\s+(take|answer)/i,
  /unable\s+to\s+(answer|take|come)/i,
  /voicemail/i,
  /voice\s+mail/i,
  /mailbox/i,
  /please\s+record/i,
  /record\s+(a|your)\s+message/i,
  /press\s+(pound|#|star|\*)\s+when/i,
  /no\s+one\s+is\s+available/i,
  /reached\s+the\s+(voicemail|mailbox)/i,
  /sorry\s+(i|we)\s+(missed|can't)/i,
  /call\s+you\s+(back|later)/i,
  /beep/i,
];

// Real transcripts from Jan 15 calls
const testCases = [
  {
    name: "Heidi Burns",
    transcript: "This message hasn't been saved. Recording now. Press hash when you're done.",
    expected: false, // This is not voicemail, it's voicemail RECORDING options
  },
  {
    name: "Graham Dallas",
    transcript: "After the tone.",
    expected: true,
  },
  {
    name: "Gandharv Verma",
    transcript: "Off to the tone.",
    expected: false, // Transcription error, but might match
  },
  {
    name: "Peter Clarke",
    transcript: "Over the tone.",
    expected: false, // Transcription error
  },
  {
    name: "Michael Metson",
    transcript: "After the tone.",
    expected: true,
  },
  {
    name: "Press 1 to re-record",
    transcript: "To listen to your message, press 1. To re-record your message, press 2. To continue recording your message, press 3. If you are happy with your message, press 4. To specify a number for your message recipient to call you back on that is different to the number you're calling from, press 5.",
    expected: true, // Contains "message" and "re-record your message"
  },
  {
    name: "Gray Bekurs (SUCCESS)",
    transcript: "[AI Call Summary] Summary: Gray Bekurs confirmed identity and engaged in a thoughtful conversation...",
    expected: false,
  },
];

function testVoicemailDetection(transcript: string): boolean {
  const normalized = transcript.toLowerCase().trim();
  for (const pattern of voicemailPatterns) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  return false;
}

console.log('========================================');
console.log('VOICEMAIL DETECTION PATTERN TESTING');
console.log('========================================\n');

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = testVoicemailDetection(test.transcript);
  const status = result === test.expected ? '✅ PASS' : '❌ FAIL';

  if (result === test.expected) {
    passed++;
  } else {
    failed++;
  }

  console.log(`${status} - ${test.name}`);
  console.log(`  Expected: ${test.expected}, Got: ${result}`);
  console.log(`  Transcript: "${test.transcript.substring(0, 80)}${test.transcript.length > 80 ? '...' : ''}"`);
  console.log('');
}

console.log('========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('========================================');

// Additional patterns we should add
console.log('\n\nSUGGESTED ADDITIONAL PATTERNS:');
console.log('------------------------------');
console.log('1. "to listen to your message"');
console.log('2. "press \\d to re-?record"');
console.log('3. "recording now"');
console.log('4. "your message" (when combined with press options)');
console.log('5. "press hash when"');
console.log('6. "press pound when"');

process.exit(0);
