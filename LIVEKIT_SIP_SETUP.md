# Modern Stack Setup: Telnyx + LiveKit + Gemini

This guide explains how to set up the recommended "Modern Stack" for AI voice agents.

## Architecture
**Telnyx (SIP)** $\rightarrow$ **LiveKit (SIP Bridge)** $\rightarrow$ **Gemini API**

This setup is recommended because LiveKit handles complex telephony tasks like jitter buffers, transcoding, and echo cancellation automatically.

## Prerequisites
1.  **LiveKit Cloud Account**: Create a project at [LiveKit Cloud](https://cloud.livekit.io).
2.  **Telnyx Account**: Create a SIP connection in the [Telnyx Portal](https://portal.telnyx.com).
3.  **Google Gemini API Key**: Obtain a key for Gemini 2.0 Flash from [Google AI Studio](https://aistudio.google.com).

## 1. Configure LiveKit SIP Ingress
1.  In the LiveKit Cloud dashboard, go to **SIP**.
2.  Create a new **SIP Ingress**.
3.  Note the **SIP URI**, **Username**, and **Password** provided by LiveKit.

## 2. Configure Telnyx SIP Connection
1.  In the Telnyx Portal, create or edit a **SIP Connection**.
2.  Set the **SIP Transport Protocol** to **TCP** or **TLS**.
3.  Set the **Connection Type** to **FQDN** or **IP Address** and point it to the LiveKit SIP URI.
4.  Configure **Outbound Voice**: Set the credentials to match the LiveKit SIP Ingress username/password.

## 3. Environment Variables
Add the following to your `.env` file:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
GEMINI_API_KEY=your_gemini_api_key
```

## 4. Run the AI Agent
Start the LiveKit Agent worker:

```bash
npm run start:livekit-agent
```

## Why this is better
- **Lower Latency**: Uses Gemini 2.0 Flash Multimodal (Realtime) API for native audio-to-audio processing.
- **Improved Interruptions**: LiveKit Agents framework handles VAD and interruption logic more robustly than manual WebSocket relays.
- **Telephony Complexity**: No need to manually handle PCMU to PCM transcoding or 8kHz to 24kHz upsampling.
- **Scalability**: LiveKit handles the load balancing and room management for multiple simultaneous calls.
