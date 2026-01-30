import {
  cli,
  defineAgent,
  voice,
  JobContext,
  JobProcess,
  ServerOptions,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as silero from '@livekit/agents-plugin-silero';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Load environment variables
config();

/**
 * LiveKit Agent for Gemini Multimodal
 *
 * This agent uses the Google Gemini 2.0 Flash Multimodal (Realtime) API
 * via the LiveKit Agents framework. It handles audio in/out natively,
 * providing the lowest latency and best natural conversation flow.
 */
export default defineAgent({
  // Prewarm: Load VAD model once per worker process (expensive operation)
  prewarm: async (proc: JobProcess) => {
    console.log('[LiveKit Agent] Prewarming: Loading Silero VAD model...');
    proc.userData.vad = await silero.VAD.load();
    console.log('[LiveKit Agent] Prewarm complete: VAD model loaded');
  },

  entry: async (ctx: JobContext) => {
    console.log('[LiveKit Agent] Starting session for room:', ctx.room.name);

    await ctx.connect();
    console.log('[LiveKit Agent] Connected to LiveKit');

    const participant = await ctx.waitForParticipant();
    console.log('[LiveKit Agent] Participant identified:', participant.identity);

    // Get pre-loaded VAD from prewarm
    const vad = ctx.proc.userData.vad as silero.VAD;

    // System instructions for the agent
    const instructions =
      'You are a helpful AI assistant for a phone call. Keep responses short and concise.';

    // Initialize the Gemini Multimodal (Realtime) model
    const model = new google.beta.realtime.RealtimeModel({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-2.0-flash-exp',
      instructions: instructions,
      voice: 'Puck',
    });

    // Create the Voice Agent
    const agent = new voice.Agent({
      vad: vad,
      llm: model,
      instructions: instructions,
    });

    // Create the Agent Session with voice options
    const session = new voice.AgentSession({
      vad: vad,
      llm: model,
      voiceOptions: {
        allowInterruptions: true,
      },
    });

    // Listen for state change events using the enum
    session.on(
      voice.AgentSessionEventTypes.UserStateChanged,
      (ev: voice.UserStateChangedEvent) => {
        console.log(`[LiveKit Agent] User state: ${ev.oldState} -> ${ev.newState}`);
      }
    );

    session.on(
      voice.AgentSessionEventTypes.AgentStateChanged,
      (ev: voice.AgentStateChangedEvent) => {
        console.log(`[LiveKit Agent] Agent state: ${ev.oldState} -> ${ev.newState}`);
      }
    );

    session.on(
      voice.AgentSessionEventTypes.UserInputTranscribed,
      (ev: voice.UserInputTranscribedEvent) => {
        if (ev.isFinal) {
          console.log(`[LiveKit Agent] User said: ${ev.transcript}`);
        }
      }
    );

    session.on(voice.AgentSessionEventTypes.Error, (ev: voice.ErrorEvent) => {
      console.error('[LiveKit Agent] Error:', ev.error);
    });

    session.on(voice.AgentSessionEventTypes.Close, (ev: voice.CloseEvent) => {
      console.log('[LiveKit Agent] Session closed:', ev.reason);
    });

    // Start the session with the agent and room
    await session.start({
      agent: agent,
      room: ctx.room,
    });

    console.log('[LiveKit Agent] Session active');
  },
});

// Run the worker if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
      wsURL: process.env.LIVEKIT_URL,
    })
  );
}
