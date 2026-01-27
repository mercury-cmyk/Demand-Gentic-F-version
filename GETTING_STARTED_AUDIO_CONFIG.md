# Getting Started with Unified Audio Configuration

## 🎯 What You Have

A unified audio configuration system where **test and production calls use identical audio settings**.

- **Single Configuration File**: `server/services/audio-configuration.ts`
- **Server Integration**: Automatic initialization on startup
- **All Call Types**: Test, campaign test, production all use same settings
- **Build Status**: ✅ Verified (0 errors)

---

## 🚀 Using the System

### 1. Verify It's Working

Start the server:
```bash
npm run dev
```

On startup, you should see:
```
✅ Audio Configuration Valid:
   Telnyx: g711_ulaw @ 8000kHz
   Gemini: pcm_24k @ 24000kHz
   OpenAI: pcm_16k @ 16000kHz
   Normalization: Enabled (target=0.9)
```

✅ Your configuration is active.

---

### 2. Change Audio Settings

**When you need to adjust audio quality**, edit the unified configuration:

**File**: `server/services/audio-configuration.ts`

**Location**: Lines 53-98 (the `UNIFIED_AUDIO_CONFIG` object)

**Example: Reduce distortion**
```typescript
// BEFORE
normalization: {
  targetLevelTelnyx: 0.9,  // 90% of max

// AFTER  
normalization: {
  targetLevelTelnyx: 0.85,  // 85% of max
```

**Then restart**:
```bash
npm run dev
```

**Result**: 
- Next test call: Uses 0.85 ✅
- Next campaign test: Uses 0.85 ✅
- Next production call: Uses 0.85 ✅

**That's it. No other changes needed.**

---

### 3. Verify Test & Production Parity

All these calls now use **identical audio settings**:

1. ✅ Test AI Call (`/test-call`)
2. ✅ Campaign Test (`/campaigns/:id/test-call`)
3. ✅ Gemini Test (`/test-gemini-live`)
4. ✅ OpenAI Test (`/test-openai-realtime`)
5. ✅ Production Campaign (WebSocket `/voice-dialer`)
6. ✅ Gemini Campaign (WebSocket `/gemini-live-dialer`)
7. ✅ Preview Studio (`/preview-studio`)

Same compression ratio (8:1). Same normalization target (0.9 or your custom value). Same quality.

---

## 📚 Documentation

### For Quick Answers
→ [AUDIO_CONFIG_QUICK_REF.md](./AUDIO_CONFIG_QUICK_REF.md)

**Use when**: You want to quickly change a setting or verify the config

### For Complete Details
→ [AUDIO_CONFIGURATION_PARITY.md](./AUDIO_CONFIGURATION_PARITY.md)

**Use when**: You want to understand how all 7 call paths work

### For Implementation Details
→ [AUDIO_CONFIG_IMPLEMENTATION_COMPLETE.md](./AUDIO_CONFIG_IMPLEMENTATION_COMPLETE.md)

**Use when**: You want to know what was changed and why

### For Code Locations
→ [CODE_CHANGES_INDEX.md](./CODE_CHANGES_INDEX.md)

**Use when**: You need to find specific code changes

### For Executive Overview
→ [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)

**Use when**: You want the big picture summary

---

## 🔧 Common Tasks

### I want to reduce audio clipping
Edit `UNIFIED_AUDIO_CONFIG.normalization.targetLevelTelnyx` to a lower value:
```typescript
targetLevelTelnyx: 0.80,  // More headroom, less clipping
```
Restart: `npm run dev`

### I want to increase volume
Edit `UNIFIED_AUDIO_CONFIG.normalization.targetLevelTelnyx` to a higher value:
```typescript
targetLevelTelnyx: 0.95,  // More volume, less headroom
```
Restart: `npm run dev`

### I want to disable normalization (not recommended)
Edit:
```typescript
enableAGC: false,  // Disable automatic gain control
```
Restart: `npm run dev`

### I want to verify what settings are in use
Look at server logs on startup. Should show:
```
✅ Audio Configuration Valid:
   Normalization: Enabled (target=0.9)
```

---

## 🎯 The Principle

**Single Configuration = Unified Behavior**

```
You edit UNIFIED_AUDIO_CONFIG
           ↓
        Server restarts
           ↓
   All calls use new setting
   (test + production)
           ↓
Identical audio quality everywhere
```

No duplicated settings. No separate configs for test vs production. One place to change. Everywhere applies.

---

## ✅ Verification

### ✅ Is the system working?

On server startup, you see:
```
✅ Audio Configuration Valid
```

### ✅ Are test and production using the same settings?

Yes. They both reference `UNIFIED_AUDIO_CONFIG`.

### ✅ Will my changes apply to production?

Yes. When you restart the server after editing `UNIFIED_AUDIO_CONFIG`, the next production call uses the new setting.

### ✅ Do I need to update multiple files?

No. Just edit the one `UNIFIED_AUDIO_CONFIG` object. That's it.

---

## 📍 Files You Might Edit

**Most Common**:
- `server/services/audio-configuration.ts` - UNIFIED_AUDIO_CONFIG object (lines 53-98)

**Rarely**:
- Test endpoint files (if you want debug logging showing config source)
- Production files (if you want debug logging showing config source)

**Never**:
- audio-transcoder.ts (it just references the config)
- voice-dialer.ts (it just imports the config)

---

## 🚨 If Something Goes Wrong

### Build fails
```bash
npm run build
```
Should show: "Done in 851ms" with 0 errors

If errors, most likely:
- Typo in `UNIFIED_AUDIO_CONFIG`
- Missing import statement

### Server won't start
Check logs for:
```
❌ Audio configuration
```
This means the config validation failed. Check `UNIFIED_AUDIO_CONFIG` for:
- Invalid audio format
- Sample rate outside reasonable range
- targetLevel < 0.5 or > 1.0

### Audio quality didn't change after restart
Verify:
1. You edited `UNIFIED_AUDIO_CONFIG` (not a backup file)
2. You restarted the server (`npm run dev`)
3. You see `✅ Audio Configuration Valid` in logs

---

## 💡 You Now Have

✅ **Single Source of Truth**
- All audio settings in one place
- No duplication
- Easy to maintain

✅ **Automatic Test→Production Consistency**
- Edit test setting
- Automatically applies to production
- No manual sync needed

✅ **Easy to Adjust**
- Change normalization target
- Restart server
- All calls get the improvement

✅ **Complete Documentation**
- Quick reference guide
- Detailed implementation docs
- Code change index

---

## 🎉 Ready To Use

The system is fully operational and ready for production. 

When you need to adjust audio quality:
1. Edit `UNIFIED_AUDIO_CONFIG`
2. Restart the server
3. Done ✅

All call paths (test, campaign test, production) automatically get the improvement.
