# Voice Activity Detection (VAD) Optimization Guide

## What Was Optimized

Voice Activity Detection (VAD) controls how the AI agent detects when a user has finished speaking and when it should respond. The OpenAI Realtime API provides built-in VAD with configurable parameters.

## Changes Made

### 1. Reduced Initial Greeting Delay
**File**: [server/services/openai-realtime-dialer.ts:1567](server/services/openai-realtime-dialer.ts#L1567)

**Before**: 800ms delay before sending opening message
**After**: 400ms delay

This makes the AI agent start speaking **twice as fast** after call connection.

### 2. Optimized Silence Duration (server_vad)
**File**: [server/services/openai-realtime-dialer.ts:1029-1036](server/services/openai-realtime-dialer.ts#L1029-L1036)

**Before**: 2500ms (2.5 seconds) silence before AI responds
**After**: 800ms (0.8 seconds) silence before AI responds

**Impact**:
- Agent responds **3x faster** after user stops speaking
- More natural conversation flow
- Reduces awkward pauses
- User doesn't have to wait as long for responses

### 3. Increased Eagerness Level
**File**: [server/services/openai-realtime-dialer.ts:1008-1010](server/services/openai-realtime-dialer.ts#L1008-L1010)

**Before**: `'low'` eagerness (very patient, slow to respond)
**After**: `'normal'` eagerness (medium responsiveness)

**Impact**:
- AI detects end of user's turn more naturally
- Doesn't wait excessively long for user to finish
- Better balance between not interrupting and responding promptly

### 4. Aligned Google Gemini VAD Settings
**File**: [server/services/openai-realtime-dialer.ts:1758](server/services/openai-realtime-dialer.ts#L1758)

**Before**: 700ms silence duration
**After**: 800ms silence duration

Keeps both OpenAI and Google providers consistent for predictable behavior.

## How VAD Works

### Server VAD (`server_vad`)
The most common mode, uses audio level analysis to detect speech:

```typescript
{
  type: "server_vad",
  threshold: 0.5,              // Audio level threshold (0.0-1.0)
  prefix_padding_ms: 300,      // Includes 300ms before detected speech
  silence_duration_ms: 800,    // Wait 800ms of silence before responding
}
```

**How it works**:
1. Listens to incoming audio stream
2. Detects when audio level drops below threshold
3. Waits `silence_duration_ms` milliseconds
4. If still silent, considers the user finished speaking
5. AI generates and sends response

### Semantic VAD (`semantic_vad`)
More advanced, understands context and speech patterns:

```typescript
{
  type: "semantic_vad",
  eagerness: "normal",  // 'low', 'normal', or 'high'
}
```

**Eagerness levels**:
- **Low**: Very patient, waits longer, less likely to interrupt
- **Normal**: Balanced, natural conversation pace (RECOMMENDED)
- **High**: More aggressive, responds quickly, may interrupt

## Testing Your Changes

After restarting your dev server, test the following scenarios:

### 1. Initial Greeting Speed
**Before optimization**: ~800ms delay after connection
**After optimization**: ~400ms delay after connection

**How to test**:
- Make a test call
- Time from "ringing" to hearing the AI's greeting
- Should feel noticeably faster

### 2. Turn-Taking Speed
**Before optimization**: 2.5 second pause after you stop speaking
**After optimization**: 0.8 second pause after you stop speaking

**How to test**:
- Answer the AI's greeting: "Yes, this is [name]"
- Stop speaking and count
- AI should respond in less than 1 second
- Should feel much more natural and conversational

### 3. No Interruptions
**Verify**: AI doesn't interrupt you mid-sentence

**How to test**:
- Speak a longer response with natural pauses
- Example: "Yes... this is John... from Acme Corp..."
- AI should wait until you're completely done
- If AI interrupts during pauses, increase `silence_duration_ms`

### 4. No Excessive Waiting
**Verify**: You don't have to wait forever for AI to respond

**How to test**:
- Give short, clear responses: "Yes", "No", "Go ahead"
- AI should respond within 1 second
- Should feel like talking to a human, not a laggy robot

## Fine-Tuning (Optional)

If you need to adjust the behavior further:

### Make AI Respond Even Faster
Reduce `silence_duration_ms` in [openai-realtime-dialer.ts:1029](server/services/openai-realtime-dialer.ts#L1029):

```typescript
const silenceDurationMs = settings.silenceDurationMs || 600; // Even more aggressive
```

**Risk**: May interrupt during natural pauses

### Make AI More Patient
Increase `silence_duration_ms`:

```typescript
const silenceDurationMs = settings.silenceDurationMs || 1200; // More conservative
```

**Risk**: Conversation may feel slow or awkward

### Use Semantic VAD Instead
For even more natural detection, switch to semantic VAD:

```typescript
const turnDetectionType = configOverride?.turn_detection || 'semantic';
```

**Benefits**:
- Context-aware turn detection
- Better at understanding natural speech patterns
- Less reliant on silence duration

**Requirements**: Requires newer OpenAI API features

## Configuration Per Agent

You can override these settings per virtual agent using the `agentSettingsOverride`:

```typescript
agentSettingsOverride: {
  advanced: {
    conversational: {
      silenceDurationMs: 1000,  // Custom value per agent
      eagerness: 'high',        // Custom eagerness per agent
    }
  }
}
```

## Monitoring VAD Performance

Watch your server logs for these indicators:

### Good Signs
```
[Turn Detection] Using server_vad with silence_duration_ms: 800
[OpenAI-Realtime-Dialer] 🎙️  Sending greeting: "Hello, may I speak with..."
[OpenAI-Realtime-Dialer] Speech ended on call: ...
[OpenAI-Realtime-Dialer] Speech started on call: ...
```

### Warning Signs
```
⚠️ User interruption detected - cancelling AI response
⚠️ Speech ended too quickly (may need higher threshold)
```

If you see frequent interruptions, the AI is being too aggressive. Increase `silence_duration_ms`.

If users complain about slow responses, the AI is being too patient. Decrease `silence_duration_ms`.

## Best Practices

1. **Start with these optimized defaults** (800ms silence, normal eagerness)
2. **Test with real calls** - different users have different speaking patterns
3. **Monitor for interruptions** - if AI cuts people off, increase silence duration
4. **Monitor for lag** - if responses feel slow, decrease silence duration
5. **Consider use case**:
   - **Sales calls**: Use `normal` or `high` eagerness for energetic pace
   - **Support calls**: Use `normal` eagerness for professional balance
   - **Compliance calls**: Use `low` eagerness to ensure proper verification

## Comparison: Before vs After

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial greeting delay | 800ms | 400ms | **2x faster** |
| Turn-taking delay | 2500ms | 800ms | **3x faster** |
| Eagerness | Low | Normal | More natural |
| Conversation feel | Robotic, slow | Human-like | Much better |

## Troubleshooting

### Problem: AI interrupts me during pauses
**Solution**: Increase `silence_duration_ms` to 1000-1200ms

### Problem: AI takes forever to respond
**Solution**: Decrease `silence_duration_ms` to 600-700ms

### Problem: AI seems to "guess" my response
**Solution**: Lower eagerness to `'low'` for that agent

### Problem: Greeting still feels slow
**Solution**: Reduce initial delay further to 200-300ms (line 1567)

### Problem: Beginning of greeting is cut off
**Solution**: Increase initial delay to 500-600ms (ensures stream is ready)

## Deployment

Changes are in [server/services/openai-realtime-dialer.ts](server/services/openai-realtime-dialer.ts).

**For local/dev (ngrok)**:
```bash
# Restart your dev server
npm run dev
```

**For production (Google Cloud Run)**:
```bash
git add server/services/openai-realtime-dialer.ts VAD-OPTIMIZATION-GUIDE.md
git commit -m "feat: optimize VAD for faster, more natural conversation flow"
git push
# Deploy triggers automatically via Cloud Build
```

## Related Files

- [server/services/openai-realtime-dialer.ts](server/services/openai-realtime-dialer.ts) - Main VAD configuration
- [shared/schema.ts](shared/schema.ts) - Virtual agent settings schema
- [FIX-QUEUE-LOCKING-RACE-CONDITION.md](FIX-QUEUE-LOCKING-RACE-CONDITION.md) - Previous fix documentation

## Additional Resources

- [OpenAI Realtime API Docs - Turn Detection](https://platform.openai.com/docs/guides/realtime#turn-detection)
- [Voice Activity Detection (Wikipedia)](https://en.wikipedia.org/wiki/Voice_activity_detection)