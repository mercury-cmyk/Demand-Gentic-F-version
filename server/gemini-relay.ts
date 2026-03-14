
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { config } from 'dotenv';
import { ulawToLinear, linearToUlaw, upsample8kTo16k, downsample24kTo8k } from './lib/audio-utils';

config();

const PORT = 8082;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL || "models/gemini-2.5-flash-native-audio-latest";

if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is missing in environment variables.");
  process.exit(1);
}

const server = createServer();
const wss = new WebSocketServer({ server });

console.log(`Gemini Live Relay listening on port ${PORT}`);

// Gemini Bidi Endpoint
const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

wss.on('connection', (ws: WebSocket, req) => {
  console.log('[Relay] Client connected');
  
  // State for this connection
  let streamId: string | null = null;
  let geminiWs: WebSocket | null = null;
  let isGeminiReady = false;

  const connectToGemini = () => {
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) return;

    console.log('[Relay] Connecting to Gemini Live...');
    geminiWs = new WebSocket(GEMINI_URL);

    geminiWs.on('open', () => {
      console.log('[Relay] Gemini Live Connected');
      isGeminiReady = true;

      // Send Setup Message
      const setupMsg = {
        setup: {
          model: GEMINI_MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Puck" // Options: Puck, Charon, Kore, Fenrir, Aoede
                }
              }
            }
          }
        }
      };
      geminiWs?.send(JSON.stringify(setupMsg));
    });

    geminiWs.on('message', (data) => {
      try {
        const response: any = JSON.parse(data.toString());
        
        // Handle ServerContent (Audio)
        if (response.serverContent?.modelTurn?.parts) {
          for (const part of response.serverContent.modelTurn.parts) {
             if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                // Incoming Audio is 24kHz PCM
                const base64Audio = part.inlineData.data;
                const pcm24k = Buffer.from(base64Audio, 'base64');
                
                // Convert to Int16Array
                const pcm16Int = new Int16Array(pcm24k.buffer, pcm24k.byteOffset, pcm24k.length / 2); // Little Endian assumed

                // Downsample 24k -> 8k
                const pcm8k = downsample24kTo8k(pcm16Int);

                // Encode to PCMU (u-law)
                const ulawBuffer = linearToUlaw(pcm8k);
                const ulawBase64 = ulawBuffer.toString('base64');

                // Send to Telnyx
                if (ws.readyState === WebSocket.OPEN) {
                    const mediaMsg = {
                        event: "media",
                        stream_id: streamId,
                        media: {
                            payload: ulawBase64
                        }
                    };
                    ws.send(JSON.stringify(mediaMsg));
                }
             }
          }
        }

        // Handle TurnComplete or other metadata if needed
        if (response.serverContent?.turnComplete) {
            // End of turn (optional handling)
        }

      } catch (err) {
        console.error('[Relay] Error parsing Gemini message:', err);
      }
    });

    geminiWs.on('error', (err) => {
      console.error('[Relay] Gemini Connection Error:', err);
      isGeminiReady = false;
    });

    geminiWs.on('close', () => {
      console.log('[Relay] Gemini Connection Closed');
      isGeminiReady = false;
    });
  };

  ws.on('message', async (message: Buffer) => {
    try {
      const msgStr = message.toString();
      const msg = JSON.parse(msgStr);

      if (msg.event === 'start') {
        console.log(`[Relay] Stream started: stream_id=${msg.start.stream_id}`);
        streamId = msg.start.stream_id;
        connectToGemini();
      } else if (msg.event === 'media') {
        if (!isGeminiReady || !geminiWs) {
             // Maybe connect if not connected?
             connectToGemini();
             return; 
        }

        // Incoming Audio from Telnyx: 8kHz PCMU (base64)
        const payload = msg.media.payload;
        if (payload) {
            const ulawBuffer = Buffer.from(payload, 'base64');
            const pcm8k = ulawToLinear(ulawBuffer);
            
            // Upsample 8k -> 16k
            const pcm16k = upsample8kTo16k(pcm8k);

            // Convert to Base64 for Gemini
            // Int16Array to Buffer
            const pcm16kBuffer = Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength);
            const base64Lin = pcm16kBuffer.toString('base64');

            // Send to Gemini
            const audioMsg = {
                realtimeInput: {
                    mediaChunks: [{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Lin
                    }]
                }
            };
            geminiWs.send(JSON.stringify(audioMsg));
        }

      } else if (msg.event === 'stop') {
        console.log('[Relay] Stream stopped');
        if (geminiWs) geminiWs.close();
      }
    } catch (error) {
       console.error('[Relay] Error processing Telnyx message:', error);
    }
  });

  ws.on('close', () => {
      console.log('[Relay] Client disconnected');
      if (geminiWs) geminiWs.close();
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
