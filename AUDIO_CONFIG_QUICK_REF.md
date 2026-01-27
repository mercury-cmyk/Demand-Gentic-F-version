# Audio Configuration Quick Reference

## 🎯 Single Source of Truth

All audio settings now come from: **`server/services/audio-configuration.ts`**

```typescript
// The unified configuration applied to ALL call types
const UNIFIED_AUDIO_CONFIG = {
  telnyxFormat: 'g711_ulaw',
  telnyxSampleRate: 8000,
  
  geminiInputFormat: 'pcm_8k',
  geminiOutputFormat: 'pcm_24k',
  geminiOutputSampleRate: 24000,
  
  openaiFormat: 'pcm_16k',
  openaiSampleRate: 16000,
  
  normalization: {
    targetLevelTelnyx: 0.9,      // 90% of max
    targetLevelGemini: 0.95,     // 95% of max
    enableAGC: true,
  },
};
```

## 🔄 How It Works

```
Test Call Path      Campaign Test Path      Production Path
      ↓                    ↓                       ↓
    ai-calls.ts    campaign-test-calls.ts    voice-dialer.ts
      ↓                    ↓                       ↓
     All call resolveAudioConfiguration()
           ↓ ↓ ↓
      UNIFIED_AUDIO_CONFIG
           ↓ ↓ ↓
      audio-transcoder.ts
      normalizeAudio(buffer, 0.9)
           ↓ ↓ ↓
   All outputs identical ✅
```

## 📝 When You Want to Change Audio Settings

### Example: Reduce Normalization to Prevent Distortion

**File**: `server/services/audio-configuration.ts`

```typescript
// BEFORE
targetLevelTelnyx: 0.9,

// AFTER  
targetLevelTelnyx: 0.85,  // ← Change here
```

**Result**: 
- Next test call → uses 0.85 ✅
- Next campaign test → uses 0.85 ✅
- Next production call → uses 0.85 ✅

Just restart: `npm run dev`

## ✅ Verification

On server startup, look for:

```
✅ Audio Configuration Valid:
   Telnyx: g711_ulaw @ 8000kHz
   Gemini: pcm_24k @ 24000kHz
   OpenAI: pcm_16k @ 16000kHz
   Normalization: Enabled (target=0.9)
```

If you see ❌ instead, configuration needs fixing.

## 🔍 Test vs Production Parity

| Setting | Test Calls | Production Calls |
|---------|-----------|-----------------|
| Format | g711_ulaw | g711_ulaw |
| Sample Rate | 8000 Hz | 8000 Hz |
| Normalization | 0.9 target | 0.9 target |
| Compression | 8:1 ratio | 8:1 ratio |
| Enabled | YES | YES |

✅ **Identical across all call types**

## 🎯 All Call Paths Using Same Config

1. ✅ **Test AI Call** - `/test-call` endpoint
2. ✅ **Campaign Test Call** - `/api/campaigns/:id/test-call` endpoint
3. ✅ **Gemini Live Test** - `/test-gemini-live` endpoint
4. ✅ **OpenAI Realtime Test** - `/test-openai-realtime` endpoint
5. ✅ **Production Campaign** - WebSocket `/voice-dialer`
6. ✅ **Gemini AI Agent Campaign** - WebSocket `/gemini-live-dialer`
7. ✅ **Preview Studio** - Agent voice preview tests

## 🚀 Implementation Status

- ✅ Unified config created
- ✅ Server initialization updated
- ✅ Audio transcoder linked to unified config
- ✅ Build verified (0 errors)
- ✅ Server running successfully

## 📚 Reference Docs

- **Full Guide**: [AUDIO_CONFIGURATION_PARITY.md](./AUDIO_CONFIGURATION_PARITY.md)
- **Implementation Details**: [AUDIO_CONFIG_IMPLEMENTATION_COMPLETE.md](./AUDIO_CONFIG_IMPLEMENTATION_COMPLETE.md)
- **Config Source**: [server/services/audio-configuration.ts](./server/services/audio-configuration.ts)

## 💡 Key Principle

**When test endpoints are updated, production campaigns automatically get the same improvements.**

No separate configurations. No duplicated settings. Single source of truth.
