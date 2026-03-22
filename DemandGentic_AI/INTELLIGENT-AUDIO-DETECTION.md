# Intelligent Audio Detection System

## Overview

This system makes the AI agent intelligent enough to distinguish between:
1. **Human speech** - Real person talking
2. **IVR systems** - Automated menu systems ("Press 1 for sales")
3. **Hold music** - Music playing while on hold
4. **Voicemail** - Answering machine or voicemail system

The AI agent will **ONLY** engage in conversation when it confirms a real human is speaking.

## What Has Been Implemented (Partially)

### 1. Audio Detection State Tracking

Added to `OpenAIRealtimeSession` interface (lines 182-194):

```typescript
audioDetection: {
  hasGreetingSent: boolean;        // Track if AI has sent its opening greeting
  humanDetected: boolean;          // True once we confirm human speech
  humanDetectedAt: Date | null;
  audioPatterns: Array;
  lastTranscriptCheckTime: Date | null;
}
```

### 2. Intelligent Detection Functions

**`detectAudioType()`** - (lines 2543-2644)
Analyzes transcribed audio to determine type:

**IVR Detection Patterns:**
- "Press 1", "Press 2 for sales"
- "Please hold"
- "Your call is important to us"
- "For sales press 1"
- "Thank you for calling"
- "All agents are busy"
- "Leave a message after the beep"
- "This call may be recorded"

**Music/Hold Detection Patterns:**
- Repeated syllables (la la la, na na na)
- Very short repeated sounds
- Gibberish transcriptions (garbled audio)
- Long strings without vowels

**Human Speech Detection Patterns:**
- Greetings: "Hi", "Hello", "Hey", "Good morning"
- Questions: ending with "?"
- Natural pronouns: "I", "you", "we", "my"
- Emotional expressions: "thanks", "sorry", "excuse me"
- Identity phrases: "I'm", "this is", "my name"

**`shouldSendGreeting()`** - (lines 2646-2690)
Decides when to send AI's opening greeting:
- Waits for at least 2 human speech patterns
- Blocks if IVR or music detected
- Prevents greeting to automated systems

### 3. Transcript Processing Integration

Modified transcript handling (lines 2213-2238):
- Every transcript is analyzed for audio type
- Human speech → Added to transcripts, AI responds normally
- IVR/Music → Ignored, AI stays silent
- Patterns tracked for intelligent decision making

## What Has Been Completed

### 1. Greeting Logic Replacement ✅ COMPLETED

**Location:** `server/services/openai-realtime-dialer.ts` lines 1567-1620

**Previous behavior:**
- AI sent greeting immediately after 400ms delay
- No intelligence, just timing-based

**New behavior:**
- AI waits and listens before greeting
- Analyzes audio patterns using intelligent detection
- Only greets after detecting human speech
- 30-second safety timeout as fallback

**Need to replace with:**
```typescript
// INTELLIGENT GREETING SYSTEM
console.log(`${LOG_PREFIX} Intelligent greeting enabled - waiting for human speech detection...`);

const greetingCheckInterval = setInterval(() => {
  if (!session.isActive) {
    clearInterval(greetingCheckInterval);
    return;
  }

  // Check if we should send greeting based on intelligent audio detection
  if (shouldSendGreeting(session)) {
    clearInterval(greetingCheckInterval);
    console.log(`${LOG_PREFIX} Sending greeting after human detection`);
    session.audioDetection.hasGreetingSent = true;
    sendOpeningMessage(openaiWs, openingScript);
  }
}, 1000); // Check every second

// Safety timeout: Send greeting after 30s if no detection
setTimeout(() => {
  if (session.isActive && !session.audioDetection.hasGreetingSent) {
    console.warn(`${LOG_PREFIX} No human detected after 30s - sending greeting anyway (fallback)`);
    clearInterval(greetingCheckInterval);
    session.audioDetection.hasGreetingSent = true;
    sendOpeningMessage(openaiWs, openingScript);
  }
}, 30000);
```

### 2. Voicemail Detection Enhancement

**Current status:** Voicemail detection exists but you mentioned "those are not detected properly"

**Location to check:** Search for "voicemail" in openai-realtime-dialer.ts

**Voicemail patterns to add to `detectAudioType()`:**
```typescript
const voicemailPatterns = [
  /leave\s+(a\s+)?message/i,
  /after\s+the\s+(beep|tone)/i,
  /not\s+(available|able\s+to\s+answer)/i,
  /please\s+call\s+back/i,
  /mailbox\s+(is\s+)?full/i,
  /(?:cannot|can't)\s+(?:take|answer)\s+(?:your\s+)?call/i,
  /at\s+the\s+sound\s+of\s+the\s+beep/i,
  /record\s+your\s+message/i,
];
```

**Need to add:** Return type 'voicemail' and handle it separately:
```typescript
if (audioType.type === 'voicemail') {
  console.log(`${LOG_PREFIX} VOICEMAIL DETECTED - Hanging up`);
  await endCall(session.callId, 'voicemail');
  break;
}
```

### 3. Response Blocking During IVR/Music

**Location:** Around line 2258 (speech_stopped event)

**Add check before AI responds:**
```typescript
case "input_audio_buffer.speech_stopped":
  console.log(`${LOG_PREFIX} Speech ended on call: ${session.callId}`);
  session.lastUserSpeechTime = new Date();

  // BLOCK AI RESPONSE if recent audio was IVR or music
  const recentPattern = session.audioDetection.audioPatterns.slice(-1)[0];
  if (recentPattern && (recentPattern.type === 'ivr' || recentPattern.type === 'music')) {
    console.log(`${LOG_PREFIX} Blocking AI response - ${recentPattern.type} detected`);
    // Clear audio buffer to prevent response generation
    clearInputAudioBuffer(session);
    break;
  }

  // With semantic_vad enabled, OpenAI will automatically commit and create response
  break;
```

### 4. Google Gemini Support

**Location:** `initializeGoogleSession()` around line 1812

Similar intelligent greeting logic needs to be added for Google Gemini provider.

## Testing the System

### Test Scenario 1: IVR Detection
1. Call a number with IVR menu ("Press 1 for sales...")
2. **Expected:** AI stays silent, logs show "IVR DETECTED"
3. **Expected:** No greeting sent
4. **Expected:** AI ignores IVR prompts

### Test Scenario 2: Hold Music Detection
1. Call gets put on hold with music
2. **Expected:** AI stays silent, logs show "MUSIC/HOLD DETECTED"
3. **Expected:** No response to music
4. When human picks up: AI greets immediately

### Test Scenario 3: Human Answers
1. Human answers: "Hello?"
2. **Expected:** Logs show "HUMAN SPEECH DETECTED"
3. **Expected:** After 2 human patterns, AI sends greeting
4. **Expected:** Normal conversation proceeds

### Test Scenario 4: Voicemail
1. Call goes to voicemail: "Please leave a message after the beep"
2. **Expected:** AI detects voicemail, hangs up immediately
3. **Expected:** Call marked as 'voicemail' disposition

## Log Messages to Watch For

### Good Signs (Working)
```
[OpenAI-Realtime-Dialer] Intelligent greeting enabled - waiting for human speech detection...
[OpenAI-Realtime-Dialer] 👤 HUMAN SPEECH DETECTED: "hello" (confidence: 0.85)
[OpenAI-Realtime-Dialer] ✅ Ready to greet - 2 human speech patterns detected
[OpenAI-Realtime-Dialer] Sending greeting after human detection: "Hello, may I speak with..."
```

### IVR Detected (Working)
```
[OpenAI-Realtime-Dialer] 🤖 IVR DETECTED: "press 1 for sales"
[OpenAI-Realtime-Dialer] 🚫 Ignoring non-human audio: ivr (confidence: 0.95)
[OpenAI-Realtime-Dialer] 🚫 Not greeting - IVR/music detected (1 patterns)
```

### Music Detected (Working)
```
[OpenAI-Realtime-Dialer] 🎵 MUSIC/HOLD DETECTED: "la la la na na na..."
[OpenAI-Realtime-Dialer] 🚫 Ignoring non-human audio: music (confidence: 0.85)
```

### Fallback Safety (Working)
```
[OpenAI-Realtime-Dialer] ⚠️ No human detected after 30s - sending greeting anyway (fallback)
```

## Configuration Options

### Adjust Sensitivity

**Make detection more aggressive (faster but more false positives):**
```typescript
// In shouldSendGreeting()
if (humanCount >= 1) {  // Changed from 2 to 1
  return true;
}
```

**Make detection more conservative (slower but more accurate):**
```typescript
// In shouldSendGreeting()
if (humanCount >= 3) {  // Changed from 2 to 3
  return true;
}
```

### Adjust Safety Timeout

**Faster fallback (less waiting if detection fails):**
```typescript
}, 15000); // Changed from 30000 (15 seconds instead of 30)
```

**More patient (gives more time for human detection):**
```typescript
}, 45000); // Changed from 30000 (45 seconds instead of 30)
```

## Voicemail Detection Issue

You mentioned: "How voice Mails are being detected? I see those are not detected properly"

### Current Voicemail Detection Issues

1. **Voicemail patterns might be too generic**
2. **Detection happens too late** (after beep, agent already talking)
3. **False positives** (human speech mistaken for voicemail)

### Improved Voicemail Detection Strategy

Add voicemail as a separate detection type in `detectAudioType()`:

```typescript
// Voicemail Detection Patterns (add after IVR patterns)
const voicemailPatterns = [
  /leave\s+(a\s+)?message\s+after\s+the\s+beep/i,
  /not\s+available\s+to\s+(take|answer)\s+your\s+call/i,
  /at\s+the\s+(tone|beep)/i,
  /unable\s+to\s+come\s+to\s+the\s+phone/i,
  /record\s+your\s+message/i,
  /mailbox\s+(of|for)/i,
  /you\s+have\s+reached\s+the\s+voicemail/i,
];

for (const pattern of voicemailPatterns) {
  if (pattern.test(normalizedText)) {
    console.log(`${LOG_PREFIX} 📞 VOICEMAIL DETECTED: "${normalizedText.substring(0, 50)}..."`);
    return { type: 'voicemail', confidence: 0.90 };
  }
}
```

Then handle voicemail detection in transcript processing:

```typescript
// In transcript processing (around line 2234)
if (audioType.type === 'voicemail') {
  console.log(`${LOG_PREFIX} 📞 VOICEMAIL DETECTED - Ending call`);
  // Immediately hang up and mark as voicemail
  await endCall(session.callId, 'voicemail');
  break;
}
```

## Next Steps

1. **Complete greeting logic replacement** (highest priority)
2. **Add voicemail as separate type** (addresses your concern)
3. **Add response blocking during IVR/music**
4. **Test with real calls**
5. **Fine-tune patterns based on real data**

## Files Modified

- `server/services/openai-realtime-dialer.ts` - Main intelligent detection implementation

## Related Documentation

- [VAD-OPTIMIZATION-GUIDE.md](VAD-OPTIMIZATION-GUIDE.md) - Voice Activity Detection optimization
- [FIX-QUEUE-LOCKING-RACE-CONDITION.md](FIX-QUEUE-LOCKING-RACE-CONDITION.md) - Queue locking fix
- [PHONE-NUMBER-CLEANUP-GUIDE.md](PHONE-NUMBER-CLEANUP-GUIDE.md) - Phone validation

## Support

The intelligent audio detection system is designed to prevent these problems:

❌ AI talking to IVR menus
❌ AI responding to hold music
❌ AI leaving messages on voicemail
❌ AI getting confused by automated systems

✅ AI only talks to real humans
✅ AI waits patiently through IVR/hold
✅ AI hangs up on voicemail
✅ Natural, human-like behavior