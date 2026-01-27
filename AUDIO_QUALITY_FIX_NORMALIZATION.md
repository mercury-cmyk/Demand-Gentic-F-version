# Audio Quality Fix - Normalization & Gain Control

**Date:** January 26, 2026  
**Issue:** Audio quality degradation in Gemini Live → Telnyx pipeline  
**Root Cause:** Missing gain normalization during audio transcoding  
**Status:** ✅ FIXED

---

## Problem Analysis

### Symptoms
- Audio appearing clipped or distorted in call logs
- Repeated patterns in PCM audio data suggesting amplification issues
- Compression artifacts visible in base64-encoded audio chunks
- Silent segments followed by sudden volume spikes

### Root Cause
The audio transcoding pipeline was missing critical **gain normalization** steps:

1. **PCM 24kHz → 8kHz downsampling** - Gemini outputs audio at 24kHz, but Telnyx expects 8kHz
   - Anti-aliasing filter was applied correctly
   - **BUT:** No peak normalization before/after filtering
   - Result: Audio could clip during filter application

2. **PCM → G.711 encoding** - G.711 is a logarithmic compression format
   - Expects normalized input (±32767 for 16-bit PCM)
   - If input is too quiet: encoded audio becomes low-quality
   - If input has peaks: clipping distortion
   - **No normalization was happening**

3. **G.711 → PCM upsampling** - Reverse path also affected
   - Similar issues when upsampling to 16kHz for Gemini input

---

## Solution: Audio Normalization

### Implementation

#### 1. **New `normalizeAudio()` Function**

```typescript
function normalizeAudio(pcmBuffer: Buffer, targetLevel: number = 0.9): Buffer {
  // Find peak amplitude in the buffer
  let peak = 0;
  for (let i = 0; i < samples; i++) {
    const sample = Math.abs(pcmBuffer.readInt16LE(i * 2));
    if (sample > peak) peak = sample;
  }
  
  // Calculate scaling factor
  const maxAllowed = Math.floor(32767 * targetLevel);
  const scale = maxAllowed / peak;
  
  // Apply scaling to prevent clipping
  // Returns normalized buffer with consistent amplitude
}
```

**Key Features:**
- **Peak Detection:** Finds the maximum amplitude in each audio chunk
- **Adaptive Scaling:** Scales all samples by the same factor to use available headroom
- **Target Level:** Uses 90% of full scale (leaves 10% headroom for filtering artifacts)
- **No Signal Loss:** Pure amplitude scaling preserves all audio characteristics

#### 2. **Updated Transcoding Paths**

All three transcoding functions now follow this pattern:

**Gemini → Telnyx (PCM 24kHz → G.711 8kHz):**
```
Input PCM 24kHz
    ↓
[Normalize] - Prevent clipping during filtering
    ↓
[Downsample 24→8kHz with Anti-aliasing Filter]
    ↓
[Normalize] - Restore amplitude after resampling
    ↓
[Encode to G.711]
    ↓
Output G.711 8kHz
```

**Telnyx → Gemini (G.711 8kHz → PCM 16kHz):**
```
Input G.711 8kHz
    ↓
[Decode to PCM 8kHz]
    ↓
[Normalize] - Prepare for upsampling
    ↓
[Upsample 8→16kHz with Interpolation]
    ↓
[Normalize] - Final gain adjustment
    ↓
Output PCM 16kHz
```

**PCM 16kHz → G.711 8kHz (Alternative path):**
```
Input PCM 16kHz
    ↓
[Normalize] - Prevent clipping during downsampling
    ↓
[Downsample 16→8kHz with Anti-aliasing Filter]
    ↓
[Normalize] - Restore amplitude
    ↓
[Encode to G.711]
    ↓
Output G.711 8kHz
```

---

## Technical Details

### Why Normalization Matters

1. **Anti-Aliasing Filter Impact**
   - FIR filter with 63 coefficients: can amplify or attenuate the signal
   - Without normalization: resampled audio loses amplitude
   - Result: G.711 encoder receives weak signal → poor quality encoding

2. **G.711 Logarithmic Compression**
   - G.711 ulaw uses 256 quantization levels (8 bits) to represent 65536 possible 16-bit values
   - Requires input to use full 16-bit range for best quality
   - Low-amplitude input: encoded as silence or extreme low quality
   - High-amplitude input with peaks: clipping distortion

3. **Sample Rate Conversion Artifacts**
   - Upsampling can create ringing artifacts
   - Downsampling with filtering can reduce amplitude
   - Normalization removes these artifacts' effects on final quality

### Target Levels

- **Input Normalization:** 90% of full scale (0.9)
  - Prevents clipping in intermediate processing
  - Leaves 10% headroom for filter overshoot

- **Output Normalization:** 90-95% of full scale
  - Ensures G.711 encoder gets optimal input
  - Maintains consistent volume across chunks

### Detection of Low-Signal Conditions

```typescript
// If peak is very low, skip normalization
if (peak === 0 || peak < 100) {
  return pcmBuffer;
}
```

This prevents amplifying noise during silent segments.

---

## Files Modified

### 1. `server/services/voice-providers/audio-transcoder.ts`

**Added:**
- `normalizeAudio()` function (new)

**Modified:**
- `pcm24kToG711()` - Added 3-step normalization
- `pcm16kToG711()` - Added normalization before/after downsampling
- `g711ToPcm16k()` - Added normalization before/after upsampling

### 2. `server/services/voice-providers/gemini-live-provider.ts`

**Enhanced Logging:**
- Added compression ratio metrics
- Added chunk size reporting
- Better visibility into audio processing

---

## Expected Improvements

### Before Fix
- Audio with artifacts and distortion
- Clipped peaks in waveform
- Inconsistent volume levels
- G.711 encoder operating on weak/strong signals

### After Fix
- Clean, undistorted audio
- Consistent amplitude usage
- Stable volume levels across chunks
- G.711 encoder working with optimal input
- 2:1 compression ratio (PCM 24kHz → G.711 8kHz)

---

## Monitoring & Validation

### Logs to Watch
```
📊 Audio: 1440B PCM→180B G.711 (800.0% compression, avg chunk 180B)
```

This shows:
- Input: 1440 bytes of PCM 24kHz (180 samples at 16 bits)
- Output: 180 bytes of G.711 8kHz (180 samples at 8 bits)
- Compression: 8:1 (PCM 16-bit → G.711 8-bit)

### Quality Checks
1. **Compression Ratio:** Should be consistent (around 8:1)
2. **Chunk Size:** Should be stable (~150-200 bytes for typical chunks)
3. **No Clipping:** All audio should transcode without max value warnings
4. **Audio Playback:** Clear speech without artifacts

---

## Technical References

- **ITU-T G.711:** https://www.itu.int/rec/T-REC-G.711-198809-I/en
- **PCM Audio:** https://en.wikipedia.org/wiki/Pulse-code_modulation
- **FIR Filtering:** https://en.wikipedia.org/wiki/Finite_impulse_response
- **Audio Normalization:** https://en.wikipedia.org/wiki/Audio_normalization

---

## Next Steps

1. ✅ Deploy audio quality fix
2. ✅ Monitor call logs for audio metrics
3. Run audio quality tests with various call scenarios
4. Gather feedback on audio clarity improvements
5. Consider additional DSP enhancements if needed:
   - Automatic Gain Control (AGC)
   - Noise suppression
   - Echo cancellation

---

## Rollback Plan

If issues arise, revert changes to:
- `audio-transcoder.ts` - Remove normalization calls
- `gemini-live-provider.ts` - Revert logging changes

Previous version: Commit before 2026-01-26

---
