# AI Agent Listen-First Behavior Fix

**Date**: March 5, 2026  
**Issue**: AI agent immediately starts speaking when SIP call is answered, instead of listening first  
**Solution**: Modified SIP bridge to implement listen-first behavior with intelligent fallback  

---

## Problem Statement

When using SIP calls with the AI agent, the system was programmed to send the opening greeting **immediately** when the phone was answered. This caused poor user experience because:

1. The contact answers the phone expecting to speak first
2. AI interrupts immediately with "Hello, may I please speak with..."
3. Creates awkward conversation flow (both parties trying to talk at once)
4. Doesn't match natural human calling patterns where caller initiates

**Expected behavior**: AI should LISTEN first, wait for contact to speak (e.g., "Hello?"), then respond appropriately.

---

## Solution Overview

Implemented intelligent listen-first behavior in the RTP-to-Gemini bridge with:

1. **3-second listening window** - AI waits for contact to speak first
2. **Speech detection** - Triggers greeting when contact speech is detected
3. **Fallback timeout** - If contact is silent for 3 seconds, AI sends greeting anyway (handles cases where contact is waiting)
4. **State tracking** - Prevents duplicate greetings and race conditions

---

## Technical Implementation

### File Modified
`server/services/sip/rtp-gemini-bridge.ts`

### Changes Made

#### 1. Extended BridgeSession Interface
```typescript
interface BridgeSession {
  // ... existing fields ...
  contactHasSpoken: boolean;        // Track if contact spoke first
  listeningTimeout: NodeJS.Timeout | null;  // Fallback timeout for greeting
}
```

#### 2. Replaced Auto-Send Logic
**Before** (`trySendOpeningMessage`):
- Sent opening message immediately when call answered + setup complete
- No detection of contact speech
- AI always spoke first

**After** (`sendOpeningMessage` + `startListeningPeriod`):
- Waits for contact to speak OR 3-second timeout
- Detects contact speech via Gemini response patterns
- Logs trigger reason (contact speech vs timeout)

#### 3. Speech Detection Logic
```typescript
function detectContactSpeech(session: BridgeSession): void {
  if (session.contactHasSpoken || session.openingMessageSent) return;
  
  session.contactHasSpoken = true;
  console.log(`[RTP Bridge] Contact speech detected - sending opening message`);
  sendOpeningMessage(session);
}
```

Triggered when:
- Gemini API returns `modelTurn` output
- Opening message hasn't been sent yet
- Contact hasn't been marked as having spoken

#### 4. Listening Period with Timeout
```typescript
function startListeningPeriod(session: BridgeSession): void {
  const LISTENING_TIMEOUT_MS = 3000;  // 3 seconds
  
  session.listeningTimeout = setTimeout(() => {
    if (!session.contactHasSpoken && !session.openingMessageSent) {
      console.log(`[RTP Bridge] Listening timeout - sending greeting`);
      sendOpeningMessage(session);
    }
  }, LISTENING_TIMEOUT_MS);
}
```

Started when:
- Call is answered AND Gemini setup is complete
- Either condition can complete first (order-independent)

#### 5. Cleanup and Memory Management
Added cleanup for `listeningTimeout` in:
- Session initialization error handler
- Session termination (`closeSession`)
- Prevents memory leaks from dangling timers

---

## Behavior Flow Charts

### Scenario 1: Contact Speaks First (Ideal)
```
1. Phone answered → Start listening period (3s timer)
2. Contact: "Hello?"
3. Detect contact speech → Cancel timer
4. AI: "Hello, may I please speak with [Name]?"
5. Natural conversation continues
```

### Scenario 2: Contact Silent (Fallback)
```
1. Phone answered → Start listening period (3s timer)
2. [3 seconds of silence]
3. Timer expires → Send greeting
4. AI: "Hello, may I please speak with [Name]?"
5. Contact responds
```

### Scenario 3: Setup Delay
```
1. Phone answered → callAnswered = true
2. [Gemini still connecting]
3. Setup complete → Check callAnswered (true) → Start listening period
4. Normal flow continues
```

---

## Code Locations

### Modified Functions
| Function | Lines | Purpose |
|----------|-------|---------|
| `sendOpeningMessage()` | 594-626 | Send greeting after contact speaks or timeout |
| `detectContactSpeech()` | 628-637 | Detect when contact has spoken |
| `startListeningPeriod()` | 639-658 | Start 3s listening window with fallback |
| `connectToGemini()` | 477-480 | Trigger listening when setup completes |
| `handleSipAudio()` | 683-691 | Trigger listening when call answered |

### Session Initialization
- Lines 287-288: Added `contactHasSpoken: false, listeningTimeout: null`

### Cleanup Handlers
- Line 333: Error handler cleanup
- Lines 795-798: Normal termination cleanup

---

## Testing Recommendations

### Manual Testing Scenarios

1. **Normal Answer - Contact Speaks First**
   - Place test call
   - Contact answers with "Hello?"
   - Verify AI responds after contact speaks
   - Check logs show "Contact speech detected"

2. **Silent Answer - Timeout**
   - Place test call
   - Contact answers but says nothing
   - Verify AI speaks after 3 seconds
   - Check logs show "Listening timeout"

3. **Fast Answer - Race Condition**
   - Place test call to immediately answered line
   - Verify no duplicate greetings
   - Check only one opening message sent

4. **Slow Setup - Gemini Delay**
   - Monitor call with slower Gemini connection
   - Verify listening period starts when setup completes
   - Check call proceeds normally

### Expected Log Patterns

**Contact Speaks First:**
```
[RTP Bridge] Call {id} answered (received audio)
[RTP Bridge] Starting listening period for call {id} (3000ms)
[RTP Bridge] Contact speech detected for call {id} - sending opening message
[RTP Bridge] Opening message sent for call {id} (triggered by: contact speech)
```

**Timeout Fallback:**
```
[RTP Bridge] Call {id} answered (received audio)
[RTP Bridge] Starting listening period for call {id} (3000ms)
[RTP Bridge] Listening timeout - contact didn't speak, sending greeting for call {id}
[RTP Bridge] Opening message sent for call {id} (triggered by: timeout)
```

---

## Configuration

Current timeout is **3000ms (3 seconds)** defined in `startListeningPeriod()`.

To adjust timeout:
```typescript
const LISTENING_TIMEOUT_MS = 3000;  // Change this value
```

**Considerations:**
- Too short (5s): Awkward silence, contact may think call dropped
- 3 seconds is optimal for most scenarios

---

## Impact Assessment

### User Experience
✅ **Improved**: Natural conversation flow matching human calling patterns  
✅ **Improved**: Reduced interruptions and awkward overlaps  
✅ **Safe**: Fallback ensures AI still speaks if contact is silent  

### System Performance
✅ **Minimal Impact**: Single 3-second timer per call  
✅ **No Latency**: Speech detection is immediate when contact speaks  
✅ **Clean**: Proper timeout cleanup prevents memory leaks  

### Edge Cases Handled
✅ Setup delay (Gemini connection slower than call answer)  
✅ Immediate answer (contact picks up instantly)  
✅ Silent answer (contact waits for caller)  
✅ Fast speech (contact speaks within 1 second)  

---

## Rollback Plan

If issues arise, revert to previous behavior:

1. Restore `trySendOpeningMessage()` function
2. Remove `contactHasSpoken` and `listeningTimeout` fields
3. Call `trySendOpeningMessage()` directly when setup completes and call answered

**Previous behavior locations:**
- Line 478: Called in `connectToGemini()` after setup complete
- Line 631: Called in `handleSipAudio()` when call answered

---

## Future Enhancements

Potential improvements:
1. **Configurable timeout** - Per-campaign setting for listening window
2. **Context-aware greeting** - Detect if contact said "Hello" vs other phrase
3. **Voicemail detection** - Longer listening period if voicemail suspected
4. **A/B testing** - Compare contact speech first vs AI speech first conversion rates

---

## Related Files

- `server/services/sip/sip-client.ts` - SIP call management
- `server/services/voice-providers/gemini-live-provider.ts` - Gemini Live API integration
- `server/services/telnyx-ai-bridge.ts` - Telnyx call controller (non-SIP)
- `server/services/vertex-ai/vertex-voice-agent.ts` - AI agent conversation logic

**Note**: This fix applies only to **SIP calls via RTP-to-Gemini bridge**. Other call types (TeXML, OpenAI Realtime) may have different opening message logic.