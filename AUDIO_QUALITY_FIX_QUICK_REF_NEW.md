# Audio Quality Fix - Quick Reference

## What Changed?

Added **gain normalization** to the audio transcoding pipeline to prevent clipping and distortion.

## Modified Functions

| Function | Changes | Impact |
|----------|---------|--------|
| `pcm24kToG711()` | Before/after normalization | ✅ Better Gemini output quality |
| `pcm16kToG711()` | Before/after normalization | ✅ Better alternative output path |
| `g711ToPcm16k()` | Before/after normalization | ✅ Better Telnyx input quality |
| `normalizeAudio()` | **NEW** | Peak detection + adaptive scaling |

## How It Works

```
┌─────────────────┐
│ Input Audio     │ (could be quiet or loud)
└────────┬────────┘
         │
         ▼
    ┌─────────────┐
    │ Find Peak   │ Find maximum amplitude
    └────┬────────┘
         │
         ▼
    ┌──────────────────┐
    │ Calculate Scale  │ How much to boost/reduce
    └────┬─────────────┘
         │
         ▼
    ┌──────────────────┐
    │ Apply Scaling    │ Multiply all samples by scale
    │ (Prevent Clip)   │ Target: 90% of full scale
    └────┬─────────────┘
         │
         ▼
  ┌───────────────────┐
  │ Normalized Audio  │ (consistent, optimal level)
  └───────────────────┘
```

## Benefits

- ✅ No more clipped audio
- ✅ Consistent volume levels
- ✅ Better G.711 compression quality
- ✅ Clearer speech in calls
- ✅ Fewer audio artifacts

## Testing

**Expected in logs:**
```
📊 Audio: 1440B PCM→180B G.711 (800.0% compression, avg chunk 180B)
```

**What it means:**
- Input PCM audio is 1440 bytes
- Output G.711 is 180 bytes
- Compression ratio is expected (8:1)

## If Audio Still Has Issues

1. Check `normalizeAudio()` is being called
2. Verify target level (0.9 = 90% of full scale)
3. Look for peak detection errors
4. Monitor G.711 encoding in logs

## Architecture

```
Telnyx (G.711 8kHz)
       ↓ [g711ToPcm16k - normalize before/after]
Gemini Input (PCM 16kHz)

Gemini Output (PCM 24kHz)
       ↓ [pcm24kToG711 - normalize before/after]
Telnyx (G.711 8kHz)
```

Each path has independent normalization to prevent cascading distortion.

## Files Changed

1. `server/services/voice-providers/audio-transcoder.ts`
   - Added `normalizeAudio()` function
   - Updated 3 transcoding functions

2. `server/services/voice-providers/gemini-live-provider.ts`
   - Enhanced logging with compression metrics

## Commit Info

**What:** Audio quality fix - normalization & gain control  
**Why:** Prevent clipping and distortion in audio transcoding  
**Impact:** Better audio quality in all Gemini Live calls  
**Rollback:** Revert audio-transcoder.ts and gemini-live-provider.ts

---

For detailed technical info, see: `AUDIO_QUALITY_FIX_NORMALIZATION.md`
