import WebSocket, { WebSocketServer } from "ws";
import { Server } from "http";

interface ElevenLabsSession {
  callId: string;
  telnyxWs: WebSocket;
  elevenLabsWs: WebSocket | null;
  isConnected: boolean;
  streamSid: string | null;
}

const activeSessions: Map = new Map();

export function initializeElevenLabsMediaBridge(server: Server): void {
  const wss = new WebSocketServer({ 
    server, 
    path: "/elevenlabs-media",
  });

  console.log("[ElevenLabsMediaBridge] WebSocket server initialized on /elevenlabs-media");

  wss.on("connection", async (telnyxWs: WebSocket, req) => {
    let callId: string | null = null;
    const urlParams = new URLSearchParams(req.url?.split("?")[1] || "");
    callId = urlParams.get("call_id") || null;
    
    console.log(`[ElevenLabsMediaBridge] Telnyx connected, call_id from URL: ${callId}`);

    let session: ElevenLabsSession | null = null;

    telnyxWs.on("message", async (data: Buffer | string) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.event === "start") {
          callId = message.start?.custom_parameters?.call_id || message.stream_id || callId || `call-${Date.now()}`;
          console.log(`[ElevenLabsMediaBridge] Stream started for call: ${callId}`);
          
          session = {
            callId: callId!,
            telnyxWs,
            elevenLabsWs: null,
            isConnected: false,
            streamSid: message.stream_id || null,
          };
          activeSessions.set(callId!, session);
          
          await connectToElevenLabs(session);
        } else if (session) {
          handleTelnyxMessage(session, data);
        }
      } catch (error) {
        console.error(`[ElevenLabsMediaBridge] Error handling message:`, error);
      }
    });

    telnyxWs.on("close", () => {
      console.log(`[ElevenLabsMediaBridge] Telnyx disconnected for call: ${callId}`);
      if (session?.elevenLabsWs) {
        session.elevenLabsWs.close();
      }
      if (callId) {
        activeSessions.delete(callId);
      }
    });

    telnyxWs.on("error", (error) => {
      console.error(`[ElevenLabsMediaBridge] Telnyx error for ${callId}:`, error);
    });
  });
}

async function connectToElevenLabs(session: ElevenLabsSession): Promise {
  const elevenLabsAgentId = process.env.ELEVENLABS_AGENT_ID;
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

  if (!elevenLabsAgentId || !elevenLabsApiKey) {
    console.error("[ElevenLabsMediaBridge] Missing ElevenLabs credentials");
    return;
  }

  try {
    const elevenLabsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${elevenLabsAgentId}`;
    
    session.elevenLabsWs = new WebSocket(elevenLabsUrl, {
      headers: {
        "xi-api-key": elevenLabsApiKey,
      },
    });

    session.elevenLabsWs.on("open", () => {
      console.log(`[ElevenLabsMediaBridge] ElevenLabs connected for call: ${session.callId}`);
      session.isConnected = true;

      const initConfig = {
        type: "conversation_initiation_client_data",
        conversation_config_override: {
          agent: {
            tts: {
              output_format: "ulaw_8000",
            },
          },
        },
      };
      session.elevenLabsWs!.send(JSON.stringify(initConfig));
    });

    session.elevenLabsWs.on("message", (data: Buffer | string) => {
      handleElevenLabsMessage(session, data);
    });

    session.elevenLabsWs.on("error", (error) => {
      console.error(`[ElevenLabsMediaBridge] ElevenLabs error for ${session.callId}:`, error);
    });

    session.elevenLabsWs.on("close", () => {
      console.log(`[ElevenLabsMediaBridge] ElevenLabs disconnected for ${session.callId}`);
      session.isConnected = false;
    });

  } catch (error) {
    console.error(`[ElevenLabsMediaBridge] Failed to connect to ElevenLabs:`, error);
  }
}

function handleTelnyxMessage(session: ElevenLabsSession, data: Buffer | string): void {
  try {
    const message = JSON.parse(data.toString());
    
    switch (message.event) {
      case "media":
        if (session.elevenLabsWs && session.isConnected && message.media?.payload) {
          const audioMessage = {
            type: "audio",
            audio: {
              chunk: message.media.payload,
            },
          };
          session.elevenLabsWs.send(JSON.stringify(audioMessage));
        }
        break;

      case "stop":
        console.log(`[ElevenLabsMediaBridge] Telnyx stream stopped: ${session.callId}`);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error(`[ElevenLabsMediaBridge] Error parsing Telnyx message:`, error);
  }
}

function handleElevenLabsMessage(session: ElevenLabsSession, data: Buffer | string): void {
  try {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case "conversation_initiation_metadata":
        console.log(`[ElevenLabsMediaBridge] Conversation started: ${message.conversation_id}`);
        break;

      case "audio":
        if (session.telnyxWs && message.audio?.chunk) {
          const mediaMessage = {
            event: "media",
            streamSid: session.streamSid,
            media: {
              payload: message.audio.chunk,
            },
          };
          session.telnyxWs.send(JSON.stringify(mediaMessage));
        }
        break;

      case "agent_response":
        console.log(`[ElevenLabsMediaBridge] Agent: ${message.text?.substring(0, 100)}...`);
        break;

      case "user_transcript":
        console.log(`[ElevenLabsMediaBridge] User: ${message.transcript}`);
        break;

      case "interruption":
        console.log(`[ElevenLabsMediaBridge] User interrupted`);
        if (session.telnyxWs && session.streamSid) {
          const clearMessage = {
            event: "clear",
            streamSid: session.streamSid,
          };
          session.telnyxWs.send(JSON.stringify(clearMessage));
        }
        break;

      case "ping":
        if (session.elevenLabsWs && session.isConnected) {
          session.elevenLabsWs.send(JSON.stringify({ type: "pong" }));
        }
        break;

      case "error":
        console.error(`[ElevenLabsMediaBridge] ElevenLabs error:`, message);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error(`[ElevenLabsMediaBridge] Error parsing ElevenLabs message:`, error);
  }
}

export function getActiveSession(callId: string): ElevenLabsSession | undefined {
  return activeSessions.get(callId);
}