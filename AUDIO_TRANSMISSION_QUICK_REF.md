# Audio Transmission Quick Reference

## Real-Time Audio Transmission Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPENAI REALTIME CALL FLOW                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Call Connected                                              │
│     ├─ Telnyx WebSocket: ws ──────────────┐                   │
│     ├─ OpenAI WebSocket: wss://api.openai ├─ Session created  │
│     └─ Both Connected ─────────────────────┘                   │
│                                                                 │
│  2. Audio Transmission (Bidirectional)                          │
│     ┌─────────────────────────────────────┐                   │
│     │  Caller's Voice (Telnyx → OpenAI)   │                   │
│     │  ├─ Incoming media events           │                   │
│     │  ├─ handleTelnyxMedia()             │                   │
│     │  └─ Forward to OpenAI WebSocket     │                   │
│     └─────────────────────────────────────┘                   │
│                           ↕                                     │
│     ┌─────────────────────────────────────┐                   │
│     │ AI Agent's Voice (OpenAI → Telnyx)  │ ← FOCUS AREA      │
│     │ ├─ response.audio.delta messages    │                   │
│     │ ├─ handleOpenAIMessage()            │                   │
│     │ ├─ Decode base64 audio             │                   │
│     │ ├─ Buffer frames                    │                   │
│     │ ├─ Send to Telnyx WebSocket         │ ← CRITICAL        │
│     │ └─ Track transmission metrics       │                   │
│     └─────────────────────────────────────┘                   │
│                                                                 │
│  3. Audio Health Monitoring                                     │
│     ├─ Frame count tracking                                   │
│     ├─ Bytes transmitted monitoring                           │
│     ├─ Connection status checks                               │
│     ├─ Gap detection (>15 seconds)                            │
│     └─ Frame rate analysis (target: 20-30 fps)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Log Pattern Recognition

### ✅ Healthy Call Indicators

Look for these patterns in server logs:

```
[OpenAI-Realtime-Dialer] ✅ OpenAI Realtime connected for call: call-xyz
[OpenAI-Realtime-Dialer] ✅ First audio frame sent to Telnyx (4096 bytes)
[OpenAI-Realtime-Dialer] 🔊 Audio frames received: 10, bytes: 40960
[OpenAI-Realtime-Dialer] 🔊 Audio frames received: 20, bytes: 81920
[OpenAI-Realtime-Dialer] 🔊 Audio frames received: 30, bytes: 122880
[OpenAI-Realtime-Dialer] 📊 Audio Health Check [call-xyz]:
  - Elapsed: 30s
  - Audio Frames: 300
  - Bytes Transmitted: 1200000
  - Last Audio: 1s ago
  - OpenAI Status: ✅ Connected
  - Telnyx Status: ✅ Connected
  - Buffered Frames: 0
```

**What this means:**
- Audio flowing consistently (300 frames in 30 seconds = 10 fps ✓)
- No buffering needed (0 buffered frames)
- Both WebSocket connections stable
- Caller should hear clear AI agent voice

### ⚠️ Warning Signs (Degraded Performance)

```
[OpenAI-Realtime-Dialer] ⚠️ Telnyx WebSocket not open, buffering audio frame (total buffered: 1)
[OpenAI-Realtime-Dialer] 🔊 Audio frames received: 10, bytes: 40960
[OpenAI-Realtime-Dialer] ⚠️ Low audio frame rate: 8.2 fps on call [...]
[OpenAI-Realtime-Dialer] 📊 Audio Health Check [call-xyz]:
  - Audio Frames: 150
  - Bytes Transmitted: 600000
  - Last Audio: 8s ago
  - Buffered Frames: 3
```

**What to do:**
1. Monitor if frames start flowing again
2. Check Telnyx connection health
3. Verify network latency to Telnyx
4. If persists >1 minute, terminate and retry

### ❌ Critical Issues (No Audio)

```
[OpenAI-Realtime-Dialer] ❌ Failed to send audio frame to Telnyx: Error: [...]
[OpenAI-Realtime-Dialer] ⚠️ No audio received for 15s on call [...]
[OpenAI-Realtime-Dialer] 📊 Audio Health Check [call-xyz]:
  - Audio Frames: 25 (not increasing)
  - Last Audio: 45s ago
  - OpenAI Status: ✅ Connected
  - Telnyx Status: ❌ Disconnected
```

**What to do:**
1. **IMMEDIATE:** Call likely has no audio
2. End call gracefully
3. Check Telnyx service status
4. Verify webhook and streaming endpoints
5. Retry with new call

## Metrics Dashboard

### Per-Call Monitoring

| Metric | Check Every | Threshold | Action |
|--------|------------|-----------|--------|
| Audio Frames | 10 seconds | Should increase by 100-300 | Restart if static >20s |
| Bytes Transmitted | 10 seconds | Should increase by 400K-1.2M | Check connection |
| Frame Rate | 30 seconds | Should be 10-30 fps | Warn if <5 fps |
| Last Audio Time | 30 seconds | Should be <1 second | Alert if >15 seconds |
| Buffered Frames | 30 seconds | Should be 0-2 | Indicates lag |
| Connection Status | Continuous | Both must be ✅ Connected | Fail immediately if dropped |

### Real-Time Alerts

The system automatically alerts on:

1. **Connection Loss:** Within 5 seconds of Telnyx disconnect
2. **Audio Stall:** After 15 seconds without frames
3. **Low Frame Rate:** When drops below 5 fps
4. **Transmission Failure:** On send errors with specific error code

## Troubleshooting Decision Tree

```
Is AI agent voice audible on call?
│
├─ YES: ✅ Audio transmission working
│       └─ Monitor for consistency
│
└─ NO: Check server logs for...
    │
    ├─ "Telnyx WebSocket not open" errors?
    │   └─ ACTION: Verify Telnyx streaming endpoint
    │           Check webhook URL and certificate
    │           Test connectivity from server to Telnyx
    │
    ├─ "No audio received for 15s" warnings?
    │   └─ ACTION: OpenAI not generating audio
    │           Check OpenAI API status
    │           Verify API key and rate limits
    │           Test with different campaign script
    │
    ├─ "Failed to send audio frame" errors?
    │   └─ ACTION: Network issue or payload corruption
    │           Check network path to Telnyx
    │           Verify base64 encoding is working
    │           Test with simplified audio
    │
    ├─ No audio logs at all?
    │   └─ ACTION: Audio handler not receiving frames
    │           Check handleOpenAIMessage is called
    │           Verify response.audio.delta messages exist
    │           Test OpenAI Realtime API directly
    │
    └─ Frame count static for 30+ seconds?
        └─ ACTION: One-way audio to Telnyx
                Check media stream configuration
                Verify stream_track: "both_tracks"
                Test Telnyx media playback
```

## Production Monitoring Setup

### Essential Alerts

```bash
# Alert on failed audio transmission
Error: /Failed to send audio frame/

# Alert on connection issues
Warning: /Telnyx WebSocket not open/

# Alert on audio stalls
Warning: /No audio received for/

# Alert on low frame rates
Warning: /Low audio frame rate/
```

### Logging Best Practices

1. **Enable audio metrics in production:**
   - Frame counting: ✅ (minimal overhead)
   - Byte tracking: ✅ (minimal overhead)
   - Health checks: ✅ (every 30 seconds)
   - Detailed frame logs: ⚠️ (only on demand for debugging)

2. **Log aggregation:**
   - Send audio health metrics to monitoring system
   - Create dashboards for frame rate, bytes, connection status
   - Set up alerts for threshold violations

3. **Performance considerations:**
   - Audio logging adds <1% CPU overhead
   - WebSocket.send() is the critical path
   - Optimize logging in high-volume scenarios

## Performance Targets

For production deployment:

| Metric | Target | Acceptable Range |
|--------|--------|------------------|
| Time to First Audio | <2 seconds | <5 seconds |
| Audio Frame Rate | 20-30 fps | 10-40 fps |
| Audio Latency | <200ms | <500ms |
| Frame Transmission Error Rate | 0% | <1% |
| Connection Stability | 100% | >99% |
| Call Success Rate | 95%+ | >90% |

## Testing Commands

### Test Audio with Diagnostics

```bash
# Start dev server
npm run dev

# In another terminal, run diagnostic test
npx tsx test-audio-transmission.ts

# Monitor logs in real-time
tail -f server.log | grep -E "Audio|🔊|⚠️|❌|✅"
```

### Stress Test Audio (Multiple Calls)

```bash
# Simulate 5 concurrent calls
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/ai/test-openai-realtime \
    -H "Content-Type: application/json" \
    -d '{"phoneNumber": "'"$(printf '+14170000%03d' $i)"'"}' &
done

# Monitor health
watch -n 2 'curl http://localhost:5000/api/dialer-runs/openai-realtime/status'
```

## Next Generation Improvements

Potential enhancements for future releases:

1. **Adaptive Bitrate Audio** - Automatically adjust quality based on network
2. **Audio Quality Metrics** - MOS scoring, packet loss detection
3. **Automatic Recovery** - Reconnect and resume audio seamlessly
4. **ML-Based Anomaly Detection** - Detect audio issues before user notices
5. **Audio Recording** - Capture both sides for quality review
6. **Real-time Dashboard** - Visual representation of audio metrics
