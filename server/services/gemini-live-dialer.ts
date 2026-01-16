/**
 * Gemini Multimodal Live API WebSocket Handler
 * 
 * This service manages the bidirectional streaming between Telnyx (PSTN) 
 * and Google Gemini Multimodal Live API.
 */

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Buffer } from 'buffer';
import { db } from "../db";
import { contacts } from "@shared/schema";
import { eq, or } from "drizzle-orm";

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL || "models/gemini-2.0-flash";
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

/**
 * Handles the WebSocket connection from Telnyx.
 * Path: /gemini-live-dialer
 */
export async function handleGeminiLiveConnection(ws: WebSocket, req: IncomingMessage) {
  console.log('[Gemini Live] 📞 New incoming call stream connection');

  if (!GEMINI_API_KEY) {
    console.error('[Gemini Live] ❌ GEMINI_API_KEY is not configured');
    ws.close(1011, 'Gemini API Key missing');
    return;
  }

  let geminiWs: WebSocket | null = null;
  let streamSid: string | null = null;
  let callControlId: string | null = null;
  let callId: string | null = null;
  
  // Default configuration
  let voiceName: string = 'Pumice'; 
  let systemPrompt: string = 'You are a helpful AI assistant.';
  let aiTranscript: string = "";

  // 1. Handle messages from Telnyx (Inbound from PSTN)
  ws.on('message', (data: any) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'start':
          streamSid = msg.stream_id || msg.start?.stream_id;
          callId = msg.start?.call_id;
          callControlId = msg.start?.call_control_id;
          
          // Extract dynamic configuration from client_state
          const clientStateB64 = msg.start?.custom_parameters?.client_state;
          if (clientStateB64) {
            try {
              const config = JSON.parse(Buffer.from(clientStateB64, 'base64').toString());
              // AUTOMATIC SYNCHRONIZATION: We use the voice name string directly from config.
              // This ensures that as soon as Google releases a new voice (e.g., "Jade"), 
              // you can use it by simply updating your Virtual Agent settings without code changes.
              voiceName = config.voice || voiceName;
              systemPrompt = config.system_prompt || systemPrompt;
              console.log(`[Gemini Live] Call ${config.call_id} started. Voice: ${voiceName}`);
            } catch (e) {
              console.error('[Gemini Live] Failed to parse client_state', e);
            }
          }

          // Initialize connection to Google
          connectToGemini();
          break;

        case 'media':
          if (geminiWs?.readyState === WebSocket.OPEN) {
            // Telnyx sends G.711 PCMU (8kHz). 
            // Gemini Multimodal Live API can handle various formats if specified in the mime_type.
            geminiWs.send(JSON.stringify({
              realtime_input: {
                media_chunks: [{
                  data: msg.media.payload,
                  mime_type: 'audio/pcm;rate=8000' 
                }]
              }
            }));
          }
          break;

        case 'stop':
          console.log('[Gemini Live] ⏹️ Telnyx stream stopped');
          geminiWs?.close();
          break;
      }
    } catch (err) {
      console.error('[Gemini Live] Error processing Telnyx message:', err);
    }
  });

  // 2. Connect to Gemini Multimodal Live API
  function connectToGemini() {
    geminiWs = new WebSocket(GEMINI_WS_URL);

    geminiWs.on('open', () => {
      console.log('[Gemini Live] ✅ Connected to Google Gemini API');
      
      // Send Setup Message
      const setupMessage = {
        setup: {
          model: GEMINI_MODEL,
          tools: [
            {
              function_declarations: [
                {
                  name: "book_appointment",
                  description: "Books an appointment or meeting for the user. Call this when the user confirms a date and time.",
                  parameters: {
                    type: "object",
                    properties: {
                      date: { type: "string", description: "The date of the appointment (YYYY-MM-DD)" },
                      time: { type: "string", description: "The time of the appointment (HH:mm)" },
                      notes: { type: "string", description: "Any additional notes or context for the meeting" }
                    },
                    required: ["date", "time"]
                  }
                },
                {
                  name: "lookup_lead_info",
                  description: "Looks up information about a lead or contact from the database using their email or phone number.",
                  parameters: {
                    type: "object",
                    properties: {
                      email: { type: "string", description: "The email address of the contact to look up." },
                      phone: { type: "string", description: "The phone number of the contact to look up." }
                    }
                  }
                }
              ]
            }
          ],
          generation_config: {
            response_modalities: ["audio", "text"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: voiceName 
                }
              }
            }
          },
          system_instruction: {
            parts: [{ text: systemPrompt }]
          }
        }
      };
      geminiWs?.send(JSON.stringify(setupMessage));
    });

    geminiWs.on('message', async (data: any) => {
      try {
        const response = JSON.parse(data.toString());
        console.log('[Gemini Live] 📥 Message received:', JSON.stringify(response).substring(0, 200));

        // Handle Audio Output from Gemini
        if (response.serverContent?.modelTurn?.parts) {
          for (const part of response.serverContent.modelTurn.parts) {
            if (part.text) {
              aiTranscript += part.text;
            }

            if (part.inlineData?.data) {
              // Send audio back to Telnyx
              ws.send(JSON.stringify({
                event: 'media',
                stream_id: streamSid,
                media: {
                  payload: part.inlineData.data
                }
              }));
            }
          }
        }

        // Handle Tool Calls (Agentic Functionality)
        const toolCall = response.toolCall || response.tool_call;
        if (toolCall?.function_calls) {
          for (const call of toolCall.function_calls) {
            console.log(`[Gemini Live] 🛠️ Executing tool: ${call.name}`, JSON.stringify(call.args));

            if (call.name === 'book_appointment') {
              const { date, time, notes } = call.args;
              
              // Logic to save to your CRM/Database
              // Example: await storage.createAppointment({ callId, date, time, notes });
              
              console.log(`[Gemini Live] ✅ Appointment booked for ${date} at ${time}`);

              // Send the response back to Gemini so it can confirm to the user
              const toolResponse = {
                tool_response: {
                  function_responses: [
                    {
                      name: call.name,
                      id: call.id,
                      response: {
                        output: `Success: Appointment confirmed for ${date} at ${time}.`
                      }
                    }
                  ]
                }
              };
              
              if (geminiWs?.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify(toolResponse));
              }
            }

            if (call.name === 'lookup_lead_info') {
              const { email, phone } = call.args;
              console.log(`[Gemini Live] 🔍 Looking up lead info for: ${email || phone}`);

              let leadInfo = null;
              try {
                const conditions = [];
                if (email) conditions.push(eq(contacts.email, email));
                if (phone) conditions.push(eq(contacts.directPhone, phone));

                const results = conditions.length > 0 
                  ? await db.select().from(contacts).where(or(...conditions)).limit(1)
                  : [];

                if (results.length > 0) {
                  const contact = results[0];
                  leadInfo = {
                    found: true,
                    name: `${contact.firstName} ${contact.lastName}`,
                    email: contact.email,
                    phone: contact.directPhone,
                    jobTitle: (contact as any).jobTitle || (contact as any).title,
                    company: (contact as any).companyName
                  };
                } else {
                  leadInfo = { found: false, message: "No contact found with provided details." };
                }
              } catch (dbError: any) {
                console.error('[Gemini Live] Database error during lookup:', dbError);
                leadInfo = { found: false, error: "Internal database error during lookup." };
              }

              const toolResponse = {
                tool_response: {
                  function_responses: [
                    {
                      name: call.name,
                      id: call.id,
                      response: { output: leadInfo }
                    }
                  ]
                }
              };
              
              if (geminiWs?.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify(toolResponse));
              }
            }
          }
        }

        // Handle Turn Completion (AI finished speaking/generating)
        // This acts as the 'audio:done' signal for the AI's response turn.
        if (response.serverContent?.turnComplete) {
          const text = aiTranscript.toLowerCase();
          const goodbyeKeywords = ['goodbye', 'bye bye', 'have a great day', 'have a nice day', 'talk soon'];
          const saidGoodbye = goodbyeKeywords.some(keyword => text.includes(keyword));

          if (saidGoodbye && callControlId) {
            console.log(`[Gemini Live] 👋 Goodbye detected in transcript: "${aiTranscript}". Hanging up...`);
            
            try {
              await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
                  'Content-Type': 'application/json'
                }
              });
            } catch (error) {
              console.error('[Gemini Live] Failed to execute Telnyx hangup:', error);
            }
          } else {
            console.log('[Gemini Live] ✨ AI turn complete');
          }

          // Reset transcript for the next turn
          aiTranscript = "";
        }

        // Handle Interruptions
        if (response.serverContent?.interrupted) {
          console.log('[Gemini Live] ✋ Model interrupted by user');
          aiTranscript = ""; // Clear transcript on interruption
          // Send clear event to Telnyx to stop playback of buffered audio immediately
          if (streamSid && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              event: 'clear',
              stream_id: streamSid
            }));
          }
        }

      } catch (err) {
        console.error('[Gemini Live] Error processing Gemini response:', err);
      }
    });

    geminiWs.on('close', () => {
      console.log('[Gemini Live] 🔌 Gemini connection closed');
      ws.close();
    });

    geminiWs.on('error', (err) => {
      console.error('[Gemini Live] ❌ Gemini WebSocket error:', err);
    });
  }

  ws.on('close', () => {
    console.log('[Gemini Live] 🔌 Telnyx connection closed');
    geminiWs?.close();
  });
}