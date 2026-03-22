# AI Agent Opening Fix (Transcription Disruption)

## Problem
Calls were failing early (12s duration) with 'not_interested' or empty dispositions because the agent's opening greeting was being interrupted by transcription errors or line noise immediately upon connection.

**Symptoms:**
- Agent starts call -> immediate interruption.
- Agent stops speaking "Hi, this is..." to respond to noise.
- User hears silence or "I'm sorry, I didn't catch that".
- User hangs up or gets confused.

## Root Cause
The `openai-realtime-dialer` service was piping audio from Telnyx to OpenAI immediately upon WebSocket connection.
- 800ms delay exists before sending the Greeting instruction.
- Any noise or user speech ("Hello?") during this window or the first ~1s of the greeting was treated by OpenAI as a "User Turn", cancelling the Greeting output.

## Solution
Implemented a "Protection Window" of **2.5 seconds** at the start of the call in `server/services/voice-dialer.ts` (for Gemini) and `server/services/openai-realtime-dialer.ts` (for OpenAI).

### Changes
In `handleTelnyxMedia` (for both services):
- Calculate `timeSinceStart = Date.now() - session.startTime`.
- If `timeSinceStart < 2500ms`, discard inbound audio frames sent to the LLM.
- This ensures the Agent's Greeting (which starts ~800ms in) has at least 1.7s of uninterrupted playback time to establish context before barge-in is allowed.

This forces the Agent to "take the floor" firmly at the start of the outbound call.