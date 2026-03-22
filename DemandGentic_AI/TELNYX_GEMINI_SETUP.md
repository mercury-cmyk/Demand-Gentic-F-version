# Telnyx + Gemini Live Setup Guide

## 1. Start the Relay Server
Run the following command to start the audio processing middleware:
```bash
npm run start:gemini-relay
```
This listens on **Port 8082**.

## 2. Expose via Ngrok
You need to expose port 8082 to the internet (WSS).
```bash
ngrok http 8082
```
Copy the forwarding URL (e.g., `https://abcdef.ngrok-free.app`).

## 3. Telnyx Call Control Configuration
When initiating a call or transferring media, use the following JSON payload.
Replace `wss://your-server.com` with your Ngrok WebSocket URL (use `wss://`, not `https://`).

### Streaming Start Command
```json
{
  "command": "streaming_start",
  "stream_url": "wss://abcdef.ngrok-free.app", 
  "stream_bidirectional_mode": "rtp",
  "format": "pcm", 
  "stream_codec": "PCMU",
  "stream_bidirectional_codec": "PCMU",
  "stream_bidirectional_sampling_rate": 8000,
  "stream_track": "inbound_track",
  "client_state": "encoded_metadata_if_needed"
}
```

## 4. TeXML  Example
If using TeXML:
```xml

  
    
       
       
       
    
  

```

## Architecture Notes
- **Middleware**: `server/gemini-relay.ts`
- **Audio Processing**: `server/lib/audio-utils.ts`
- **Port**: 8082
- **Env Var**: `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` must be set.