# Voicemail Detection Fix

## Problem

The AI agent greets immediately after call connects (400ms delay), which means:
1. AI doesn't have time to listen and detect voicemail
2. AI starts talking → voicemail system records it
3. Even though detection functions exist, they never get a chance to run before greeting

## Root Cause

**Location**: `server/services/openai-realtime-dialer.ts` line 1567-1595

The greeting logic uses `setTimeout(() => { sendOpeningMessage(...) }, 400)` which sends greeting immediately.

## Solution

Replace immediate greeting with **intelligent polling** that:
1. Waits and listens for audio
2. Analyzes incoming transcripts using `detectAudioType()`
3. Only greets once `shouldSendGreeting()` returns true (after detecting human speech)
4. Has 30-second safety timeout to greet anyway if detection fails

## Code to Replace

### OLD CODE (lines 1567-1595):
```typescript
      // Wait longer before sending greeting to ensure Telnyx stream is fully established
      // This prevents audio being generated before the stream is ready
      setTimeout(() => {
        if (!session.isActive) {
          console.log(`${LOG_PREFIX} Session no longer active, skipping greeting`);
          return;
        }

        if (openaiWs.readyState !== WebSocket.OPEN) {
          console.warn(`${LOG_PREFIX} OpenAI WebSocket closed before greeting sent`);
          return;
        }

        if (session.telnyxWs?.readyState !== WebSocket.OPEN) {
          console.warn(`${LOG_PREFIX} Telnyx WebSocket not ready, delaying greeting...`);
          // Retry after another delay
          setTimeout(() => {
            if (session.isActive && openaiWs.readyState === WebSocket.OPEN && session.telnyxWs?.readyState === WebSocket.OPEN) {
              console.log(`${LOG_PREFIX} Sending greeting (delayed): "${openingScript.substring(0, 50)}..."`);
              sendOpeningMessage(openaiWs, openingScript);
            } else {
              console.error(`${LOG_PREFIX} Stream still not ready after delay, greeting aborted`);
            }
          }, 1000);
        } else {
          console.log(`${LOG_PREFIX} Sending greeting: "${openingScript.substring(0, 50)}..."`);
          sendOpeningMessage(openaiWs, openingScript);
        }
      }, 400); // Optimized from 1500ms -> 800ms -> 400ms for faster caller experience
```

### NEW CODE:
```typescript
      // INTELLIGENT GREETING SYSTEM
      // Wait for human speech detection before greeting to avoid talking to voicemail/IVR
      console.log(`${LOG_PREFIX} Intelligent greeting enabled - waiting for human speech detection...`);

      let greetingCheckInterval: NodeJS.Timeout | null = null;
      let safetyTimeout: NodeJS.Timeout | null = null;

      const sendGreetingNow = () => {
        if (greetingCheckInterval) clearInterval(greetingCheckInterval);
        if (safetyTimeout) clearTimeout(safetyTimeout);

        if (!session.isActive) {
          console.log(`${LOG_PREFIX} Session no longer active, skipping greeting`);
          return;
        }

        if (openaiWs.readyState !== WebSocket.OPEN) {
          console.warn(`${LOG_PREFIX} OpenAI WebSocket closed before greeting sent`);
          return;
        }

        if (session.telnyxWs?.readyState !== WebSocket.OPEN) {
          console.warn(`${LOG_PREFIX} Telnyx WebSocket not ready for greeting`);
          return;
        }

        console.log(`${LOG_PREFIX} Sending greeting: "${openingScript.substring(0, 50)}..."`);
        session.audioDetection.hasGreetingSent = true;
        sendOpeningMessage(openaiWs, openingScript);
      };

      greetingCheckInterval = setInterval(() => {
        if (!session.isActive) {
          if (greetingCheckInterval) clearInterval(greetingCheckInterval);
          if (safetyTimeout) clearTimeout(safetyTimeout);
          return;
        }

        // Check if we should send greeting based on intelligent audio detection
        if (shouldSendGreeting(session)) {
          console.log(`${LOG_PREFIX} Human detected - sending greeting after ${session.audioDetection.audioPatterns.length} audio patterns analyzed`);
          sendGreetingNow();
        }
      }, 1000); // Check every second

      // Safety timeout: Send greeting after 30s if no detection
      safetyTimeout = setTimeout(() => {
        if (session.isActive && !session.audioDetection.hasGreetingSent) {
          console.warn(`${LOG_PREFIX} No human detected after 30s - sending greeting anyway (fallback)`);
          sendGreetingNow();
        }
      }, 30000);
```

## How It Works

1. **Polling Loop** (every 1 second):
   - Checks if `shouldSendGreeting(session)` returns true
   - `shouldSendGreeting()` analyzes recent audio patterns
   - Only returns true after detecting 2+ human speech patterns
   - Returns false if IVR/music detected

2. **Safety Timeout** (30 seconds):
   - If no human detected after 30s, greets anyway
   - Prevents infinite waiting if detection fails
   - Matches AMD timeout for consistency

3. **Clean Teardown**:
   - Clears intervals when session ends
   - Prevents memory leaks
   - Stops checking once greeting sent

## Expected Behavior After Fix

### Test 1: Human Answers
```
[OpenAI-Realtime-Dialer] Intelligent greeting enabled - waiting for human speech detection...
[OpenAI-Realtime-Dialer] HUMAN SPEECH DETECTED: "hello" (confidence: 0.85)
[OpenAI-Realtime-Dialer] Ready to greet - 2 human speech patterns detected
[OpenAI-Realtime-Dialer] Human detected - sending greeting after 2 audio patterns analyzed
[OpenAI-Realtime-Dialer] Sending greeting: "Hello, may I speak with..."
```

### Test 2: Voicemail
```
[OpenAI-Realtime-Dialer] Intelligent greeting enabled - waiting for human speech detection...
[OpenAI-Realtime-Dialer] IVR DETECTED: "leave a message after the beep" (confidence: 0.95)
[OpenAI-Realtime-Dialer] VOICEMAIL DETECTED - Ending call
[Call ended - no greeting sent]
```

### Test 3: IVR Menu
```
[OpenAI-Realtime-Dialer] Intelligent greeting enabled - waiting for human speech detection...
[OpenAI-Realtime-Dialer] IVR DETECTED: "press 1 for sales" (confidence: 0.90)
[OpenAI-Realtime-Dialer] Not greeting - IVR/music detected
[AI stays silent, waits for human]
```

### Test 4: Detection Fails (Fallback)
```
[OpenAI-Realtime-Dialer] Intelligent greeting enabled - waiting for human speech detection...
[30 seconds pass with no clear detection]
[OpenAI-Realtime-Dialer] No human detected after 30s - sending greeting anyway (fallback)
[OpenAI-Realtime-Dialer] Sending greeting: "Hello, may I speak with..."
```

## Files to Modify

1. `server/services/openai-realtime-dialer.ts` - Replace lines 1567-1595 with intelligent greeting logic

## Testing Steps

1. Restart dev server: `npm run dev`
2. Make test call to voicemail number
3. Watch logs for "Intelligent greeting enabled"
4. Verify AI stays silent until human detected OR voicemail triggers hangup
5. Confirm no voicemail messages left by AI

## Related Functions

- `detectAudioType()` - Lines 2584-2644 - Analyzes transcript to classify audio
- `shouldSendGreeting()` - Lines 2650-2690 - Decides when to greet based on patterns
- Transcript processing - Lines 2217-2238 - Feeds transcripts into detection
- Voicemail hangup - Lines 2261-2286 - Ends call when voicemail detected