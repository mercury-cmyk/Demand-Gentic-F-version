# OpenAI Realtime Silent Audio Checklist

Silent or "no voice" in OpenAI Realtime almost always falls into one of three buckets:

1) Client is not receiving/playing remote audio (WebRTC, output device, autoplay policies).
2) Session is not configured to output audio (modalities/voice/output format mismatch).
3) SIP/RTP media negotiation issue (codec mismatch, RTP not flowing, trunk settings).

If Preview Studio is silent, that strongly points to bucket #1 or #2.

---

## Step-by-step checklist (debug in this order)

### 1) Confirm the session actually outputs audio
Your Realtime session must explicitly include audio output.

Minimum session configuration:
```json
{
  "modalities": ["audio", "text"],
  "voice": "marin",
  "output_audio_format": "pcm16"
}
```

Signals:
- If you see text responses but no `response.audio.delta` events, your session is not producing audio.
- In WebRTC, audio arrives as a remote media stream.

---

### 2) If Preview Studio is silent, check browser sound + autoplay
This is the most common root cause when Preview Studio is silent too.

Checklist:
- Try Chrome Incognito (no extensions).
- Disable ad blockers/privacy extensions.
- Make sure the tab is not muted.
- Browser site settings: Sound = Allow.
- Allow Microphone (some WebRTC flows require permissions even for output).
- Confirm OS output device (Bluetooth headsets often "steal" output).
- Try a different device and a different browser.

Autoplay policies often block audio without a user gesture.

---

### 3) WebRTC: attach and play the remote audio track
You must bind the remote stream and call play().

```js
pc.ontrack = (event) => {
  const audioEl = document.querySelector("#remoteAudio");
  audioEl.srcObject = event.streams[0];
  audioEl.play();
};
```

Also ensure:
```html
<audio id="remoteAudio" autoplay></audio>
```

If autoplay is blocked, call `audioEl.play()` after a user click.

---

### 4) WebSocket: decode and play audio deltas
When using WebSocket mode, audio arrives as:
- `response.audio.delta` (base64 chunk)
- `response.audio.done`

You must decode, buffer, and play the audio via WebAudio (sample rate must match).

Common failure: requesting `pcm16` but playing at the wrong sample rate.

---

### 5) Input audio format must match the model expectations
For realtime input, supported formats include:
- `audio/pcm` = 24 kHz mono PCM
- `audio/pcmu` = G.711 u-law
- `audio/pcma` = G.711 A-law

If you send 48 kHz while claiming 24 kHz, VAD can fail and the model never speaks.

---

### 6) SIP: confirm RTP is flowing both ways
Silence often means RTP is not flowing.

Check:
- Firewall/NAT blocks UDP RTP ports
- Trunk misconfigured for media
- Wrong SIP URI or region
- `realtime.call.accept` never sent

---

### 7) SIP codec mismatch
Most carriers default to:
- PCMU (u-law, 8 kHz)
- PCMA (A-law, 8 kHz)

Set your trunk to PCMU/PCMA or enable transcoding if it defaults to Opus.

---

### 8) SIP webhook reachability
Your webhook must be public HTTPS and respond quickly.

Checklist:
- Verify `realtime.call.incoming` arrives
- Respond with `call.accept` and session config immediately
- Log all events (if you never receive events, the call will never connect)

---

### 9) Known-issue possibility (rare)
There have been rare periods where SIP audio output was disrupted.
If Preview Studio is also silent, focus on browser/audio/session config first.

---

### 10) Fastest pinpoint test
Run a known-good reference demo.

- If the demo works, your wiring is the problem.
- If the demo is silent, your browser/system/WebRTC or SIP environment is the issue.

---

## Quick fix checklist (highest-probability first)

### A) Preview Studio silent
- Chrome Incognito
- Sound permission enabled
- Different output device
- Disable extensions
- Ensure the tab is not muted
- Try another browser

### B) Realtime session config
- `modalities` includes "audio"
- `voice` set before the model speaks
- You see `response.audio.delta` events

### C) SIP
- Trunk codec = PCMU or PCMA
- Webhook receives `realtime.call.incoming`
- Call is accepted and logged
- RTP ports are not blocked
