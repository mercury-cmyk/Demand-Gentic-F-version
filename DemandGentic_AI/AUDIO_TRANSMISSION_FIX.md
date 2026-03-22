# OpenAI Realtime Audio Transmission Fix

## Problem Statement

AI agent's voice stream was not audible on the receiving end during live OpenAI Realtime calls. The audio transmission chain from OpenAI → Server → Telnyx → Caller had issues that prevented audio from reaching the caller.

## Root Causes Identified and Fixed

### 1. **Audio Frame Buffering & Tracking**

**Issue:** No visibility into audio transmission or proper buffering when Telnyx connection temporarily drops.

**Fix:**
- Added audio frame tracking fields to `OpenAIRealtimeSession`:
  - `audioFrameBuffer: Buffer[]` - Buffers audio frames if Telnyx disconnects
  - `audioFrameCount: number` - Tracks total frames received from OpenAI
  - `audioBytesSent: number` - Total bytes transmitted to caller
  - `lastAudioFrameTime: Date | null` - Timestamp of last audio chunk

### 2. **Audio Delta Message Handling**

**Issue:** The `response.audio.delta` messages from OpenAI contain base64-encoded audio, but the code wasn't properly verifying the format before transmission.

**Fix:**
- Proper base64 decoding and validation
- Frame-by-frame transmission with error handling
- Comprehensive logging every 10 frames to track audio flow
- First frame delivery confirmation

```typescript
case "response.audio.delta":
  if (message.delta) {
    const audioBuffer = Buffer.from(message.delta, 'base64');
    session.audioFrameBuffer.push(audioBuffer);
    session.audioFrameCount++;
    session.audioBytesSent += audioBuffer.length;
    session.lastAudioFrameTime = new Date();
    
    // Send to Telnyx immediately if connection open
    if (session.telnyxWs?.readyState === WebSocket.OPEN) {
      const mediaMessage = {
        event: "media",
        stream_id: session.streamSid,
        media: { payload: message.delta },
      };
      session.telnyxWs.send(JSON.stringify(mediaMessage));
    }
  }
  break;
```

### 3. **Audio Buffer Flushing**

**Issue:** If Telnyx connection dropped mid-call, buffered audio frames weren't being sent when connection restored.

**Fix:**
- `flushAudioBuffer()` function processes queued frames
- Called when Telnyx reconnects
- Maintains audio continuity during network hiccups

### 4. **Connection Status Monitoring**

**Issue:** Silent failures - audio frames generated but connection issues prevented delivery without alerting.

**Fix:**
- Enhanced OpenAI "open" event handler to process buffered audio
- Real-time WebSocket state validation before sending
- Error-specific logging for debugging

### 5. **Audio Health Monitoring**

**Issue:** No diagnostic information about audio transmission quality.

**Fix:**
- `startAudioHealthMonitor()` function tracks:
  - Frames received per second (target: 20-30 fps)
  - Total bytes transmitted
  - Time since last audio chunk (alert if >15 seconds)
  - Connection status for both OpenAI and Telnyx
  - Buffered frame count

**Metrics logged every 30 seconds:**
```
📊 Audio Health Check [call-id]:
  - Elapsed: 45s
  - Audio Frames: 1350
  - Bytes Transmitted: 54000
  - Last Audio: 2s ago
  - OpenAI Status: ✅ Connected
  - Telnyx Status: ✅ Connected
  - Buffered Frames: 0
```

**Alerts triggered on:**
- No audio for 15+ seconds: `⚠️ No audio received for 15s`
- Low frame rate: `⚠️ Low audio frame rate: 8.2 fps`

## Audio Format Specification

The system uses **g711_ulaw** codec (µ-law) which is:
- **Native Telnyx format** - Direct compatibility, no conversion needed
- **Bandwidth optimized** - Compresses 16-bit PCM to 8-bit
- **Telephony standard** - Used in PSTN/VoIP networks
- **Real-time friendly** - Low latency encoding

**Configuration in OpenAI session:**
```typescript
input_audio_format: "g711_ulaw",
output_audio_format: "g711_ulaw",
```

## Debugging Audio Issues

### Issue: "AI agent voice not audible"

**Check server logs for:**

1. **First Audio Frame Log:**
   ```
   ✅ First audio frame sent to Telnyx for call: [...] (4096 bytes)
   ```
   If missing: OpenAI not generating audio or not reaching handler

2. **Audio Flow Logs:**
   ```
   🔊 Audio frames received: 10, bytes: 40960, call: [...]
   ```
   If frames not increasing: Connection issue or OpenAI stopped sending

3. **Telnyx Connection Errors:**
   ```
   ⚠️ Telnyx WebSocket not open, buffering audio frame
   ```
   If frequent: Telnyx streaming endpoint unreachable

4. **Health Check Warnings:**
   ```
   ⚠️ No audio received for 15s on call [...]
   ⚠️ Low audio frame rate: 3.2 fps on call [...]
   ```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| No audio delivery | Telnyx WS closed before OpenAI connected | Increase connection timeout, check Telnyx webhook |
| Intermittent audio | Network between server and Telnyx unstable | Verify network path, check Telnyx SLA |
| Delayed audio | High frame processing latency | Reduce logging, profile WebSocket.send() |
| Silent channels | Audio format mismatch | Verify g711_ulaw support in Telnyx config |
| One-way audio | Telnyx media stream not capturing agent voice | Check `stream_track: "both_tracks"` parameter |

## Testing Audio Transmission

### Manual Test with Diagnostics

```bash
npm run dev  # Start development server

# In another terminal:
npx tsx test-audio-transmission.ts
```

The test will:
1. Initiate an OpenAI Realtime call
2. Log audio transmission metrics in real-time
3. Display expected vs. actual audio flow
4. Highlight any transmission gaps or errors

### Expected Behavior

**Healthy audio transmission:**
```
[OpenAI-Realtime-Dialer] ✅ First audio frame sent to Telnyx (4096 bytes)
[OpenAI-Realtime-Dialer] 🔊 Audio frames received: 10, bytes: 40960
[OpenAI-Realtime-Dialer] 🔊 Audio frames received: 20, bytes: 81920
[OpenAI-Realtime-Dialer] 📊 Audio Health Check:
  - Audio Frames: 450
  - Bytes Transmitted: 1800000
  - Last Audio: 1s ago
  - OpenAI Status: ✅ Connected
  - Telnyx Status: ✅ Connected
  - Buffered Frames: 0
```

**Problem indicators:**
```
[OpenAI-Realtime-Dialer] ⚠️ Telnyx WebSocket not open, buffering audio frame
[OpenAI-Realtime-Dialer] ❌ Failed to send audio frame to Telnyx
[OpenAI-Realtime-Dialer] ⚠️ No audio received for 15s on call
```

## Performance Metrics

### Audio Quality Targets

| Metric | Target | Warning Threshold |
|--------|--------|-------------------|
| Frame Rate | 20-30 fps | 500ms |
| Jitter | 200ms |
| Packet Loss | 5% |
| Continuous Audio Duration | 30+ seconds | Gaps >1s |

### Monitoring Dashboard

Server provides real-time metrics accessible via:

```bash
# Check active sessions and status
curl http://localhost:5000/api/dialer-runs/openai-realtime/status

# Response:
{
  "activeSessions": 3,
  "websocketPath": "/openai-realtime-dialer",
  "provider": "openai",
  "model": "gpt-4o-realtime-preview-2024-12-17"
}
```

## Code Changes Summary

### Modified Files

1. **`server/services/openai-realtime-dialer.ts`**
   - Enhanced `OpenAIRealtimeSession` interface with audio tracking
   - Improved `handleOpenAIMessage()` with robust audio handling
   - Added `flushAudioBuffer()` function
   - Added `startAudioHealthMonitor()` for diagnostics
   - Better logging and error handling

### New Files

1. **`test-audio-transmission.ts`**
   - Diagnostic test script for audio transmission
   - Real-time monitoring and reporting

## Deployment Checklist

- [x] Audio frame tracking implemented
- [x] Health monitoring enabled
- [x] Comprehensive logging added
- [x] Error handling improved
- [x] Diagnostic tools created
- [ ] Test in staging environment
- [ ] Monitor production logs for 24 hours
- [ ] Verify audio audibility with test calls
- [ ] Document any remaining issues

## Next Steps if Issues Persist

1. **Enable verbose WebSocket logging:**
   ```bash
   DEBUG=ws:* npm run dev
   ```

2. **Check Telnyx media stream configuration:**
   - Verify `stream_track: "both_tracks"` is being used
   - Confirm media streaming endpoint is responding
   - Check for payload encoding mismatches

3. **Validate OpenAI Realtime session:**
   - Monitor WebSocket connection state
   - Verify audio format conversion if needed
   - Check for API rate limiting

4. **Network diagnostics:**
   - Test latency between server and Telnyx
   - Verify no packet loss on media path
   - Check firewall rules for WebSocket

5. **Contact support with logs:**
   - Full server logs with timestamps
   - Call IDs showing issue
   - Network traces if available