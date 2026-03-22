# Audio Transmission Diagnostics - January 23, 2026

## Issue Report
**Problem**: No outbound voice on both Agent Console human calls and AI caller calls
- Person on phone can be heard
- Agent/AI voice cannot be heard by person

## Root Cause Analysis

### 1. Agent Console Human Calls (WebRTC)
**Issue**: Telnyx WebRTC client not transmitting microphone audio

**Fixes Applied**:
1. Added explicit `getUserMedia()` call before making calls to request microphone permission
2. Verify audio track is enabled, not muted, and in 'live' state
3. Added audio track monitoring after call connects
4. Enhanced logging to show local audio track status

**Files Modified**:
- `client/src/hooks/useTelnyxWebRTC.ts`

**Verification**:
Look for these log messages in browser console:
```
[AUDIO-TX] Requesting microphone access...
[AUDIO-TX] ✅ Microphone access granted: { tracks: 1, enabled: true, muted: false, readyState: 'live' }
[AUDIO-TX] Local audio track status: { enabled: true, muted: false, readyState: 'live', label: 'Microphone' }
[AUDIO-TX] ✅ Audio transmission active
```

### 2. AI Caller Calls (TeXML + Bidirectional RTP)
**Issue**: AI audio not being sent back to Telnyx via WebSocket

**Critical Requirements**:
1. `stream_id` MUST be received from Telnyx `streaming_event`
2. Audio frames MUST include `stream_id` in payload
3. WebSocket MUST be in OPEN state

**Fixes Applied**:
1. Added verification that `stream_id` is set before sending audio
2. Enhanced logging when first audio frame is sent
3. Added warnings when `stream_id` is missing
4. Better error handling for WebSocket send failures

**Files Modified**:
- `server/services/ai-media-streaming.ts`
- `server/services/voice-dialer.ts`

**Verification**:
Look for these log messages in server console:
```
[AiMediaStreaming] ✅ stream_id confirmed: 
[AiMediaStreaming] ✅ FIRST OUTBOUND AUDIO FRAME SENT to Telnyx! call= stream_id=
[Voice-Dialer] ✅ FIRST OUTBOUND AUDIO FRAME SENT to Telnyx! call= stream_id=
[Voice-Dialer] ✅ Bidirectional audio now enabled - can send audio back to caller
```

**Warning Messages to Watch For**:
```
[AiMediaStreaming] ⚠️ Cannot send audio - WebSocket not open
[AiMediaStreaming] ⚠️ Cannot send audio - no stream_id
[Voice-Dialer] ⚠️ Sending audio WITHOUT stream_id - this may fail!
[Voice-Dialer] ⚠️ No stream_id received yet for call - Audio cannot be sent until stream_id arrives
```

## Testing Procedure

### 1. Test Agent Console Human Call
1. Open Agent Console in browser
2. Open browser DevTools Console (F12)
3. Make a call to your phone
4. Check console for `[AUDIO-TX]` messages
5. Verify microphone permission granted
6. Verify local audio track is enabled
7. Answer call and speak - verify you can be heard

### 2. Test AI Caller Call
1. Initiate an AI call through the system
2. Monitor server logs for:
   - Stream connection established
   - `stream_id` received from Telnyx
   - First audio frame sent confirmation
3. Answer the call
4. Listen for AI voice
5. If no voice, check for warning messages about missing `stream_id`

## Common Issues and Solutions

### Issue: Microphone permission denied
**Solution**: Grant microphone permission in browser settings
- Chrome: chrome://settings/content/microphone
- Edge: edge://settings/content/microphone

### Issue: No stream_id received from Telnyx
**Solution**: 
1. Verify `PUBLIC_WEBSOCKET_URL` is set correctly and publicly accessible
2. Check ngrok tunnel is running: `.\\setup-ngrok-tunnel.ps1`
3. Verify TeXML endpoint is returning correct WebSocket URL
4. Check Telnyx can reach your WebSocket endpoint

### Issue: WebSocket not OPEN when sending audio
**Solution**:
1. Check network connectivity
2. Verify WebSocket upgrade succeeded
3. Check for connection timeouts
4. Review server WebSocket handler logs

### Issue: Audio sent but still not heard
**Solution**:
1. Verify audio format is g711_ulaw (Telnyx native)
2. Check audio payload is base64 encoded
3. Verify frame size is 160 bytes (20ms at 8kHz)
4. Check for Telnyx API errors in webhook responses

## Next Steps if Issues Persist

1. **Capture WebSocket traffic**: Use browser DevTools Network tab (WS filter)
2. **Check Telnyx Dashboard**: Look for call detail records and errors
3. **Enable Telnyx debug mode**: Add `debug: true` to Telnyx client config
4. **Test with simple echo**: Create minimal test that echoes audio back

## Environment Variables to Verify

```bash
# Required for public WebSocket access
PUBLIC_WEBSOCKET_URL=wss:///voice-dialer

# Telnyx credentials
TELNYX_API_KEY=
TELNYX_TEXML_APP_ID=
TELNYX_CALL_CONTROL_APP_ID=
TELNYX_FROM_NUMBER=

# OpenAI for AI calls
OPENAI_API_KEY=
```

## Code References

### Key Functions:
1. **makeCall** in `client/src/hooks/useTelnyxWebRTC.ts` - Initiates human calls
2. **sendAudioToTelnyx** in `server/services/ai-media-streaming.ts` - Sends AI audio
3. **telnyxOutboundPacer** in `server/services/voice-dialer.ts` - Paces audio frames

### Critical State Variables:
- `session.streamSid` - Telnyx stream ID for bidirectional RTP
- `session.telnyxWs.readyState` - WebSocket connection state
- `audioTrack.enabled` - Local microphone enabled state

## Expected Behavior After Fix

### Agent Console Calls:
1. Microphone permission prompt appears (first time only)
2. Console shows microphone access granted
3. Call connects
4. Local audio track status shows enabled/live
5. Person on phone can hear agent speaking

### AI Calls:
1. Call initiated via TeXML
2. WebSocket connects to voice-dialer
3. Telnyx sends `streaming_event` with `stream_id`
4. AI generates audio response
5. First frame sent with success confirmation
6. Person on phone hears AI voice clearly

## Monitoring Commands

```powershell
# Check if ngrok tunnel is running
Get-Process ngrok

# Check PUBLIC_WEBSOCKET_URL
$env:PUBLIC_WEBSOCKET_URL

# Tail server logs for audio transmission
# (Watch for [AUDIO-TX], [AiMediaStreaming], [Voice-Dialer] messages)
```

---

**Status**: Fixes applied, pending testing
**Updated**: 2026-01-23
**Priority**: CRITICAL - Blocking all voice communication