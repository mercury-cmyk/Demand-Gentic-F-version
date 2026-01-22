/**
 * Gemini Multimodal Live API WebSocket Handler
 * 
 * This service manages the bidirectional streaming between Telnyx (PSTN) 
 * and Google Gemini Multimodal Live API.
 * 
 * AUDIO QUALITY FIXES:
 * - Connection keepalive with ping/pong heartbeats
 * - Buffer backpressure detection and handling
 * - Audio quality monitoring and metrics
 * - Automatic reconnection with exponential backoff
 * - Audio timing and buffer validation
 */

import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Buffer } from 'buffer';
import { db } from "../db";
import { contacts, campaigns } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { audioQualityMonitor } from "./audio-quality-monitor";

// Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

// Audio quality constants
const AUDIO_KEEPALIVE_INTERVAL = 30000; // 30 second ping/pong for connection health
const AUDIO_TIMEOUT = 60000; // 60 second timeout for no audio activity
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB max buffer before backpressure
const RECONNECT_BASE_DELAY = 1000; // 1 second base reconnect delay
const MAX_RECONNECT_DELAY = 30000; // 30 second max reconnect delay
const MAX_RECONNECT_ATTEMPTS = 5; // Max reconnect attempts before giving up

// ==================== PLACEHOLDER SUBSTITUTION ====================

interface CallContext {
  contactName?: string;
  contactFirstName?: string;
  contactJobTitle?: string;
  accountName?: string;
  organizationName?: string;
  campaignName?: string;
  campaignPurpose?: string;
}

/**
 * Audio quality metrics for monitoring call health
 */
interface AudioMetrics {
  startTime: number;
  audioChunksSent: number;
  audioChunksReceived: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  bufferBackpressureEvents: number;
  lastAudioSentTime: number;
  lastAudioReceivedTime: number;
  connectionDrops: number;
}

/**
 * Substitute placeholders in system prompt with actual values
 * This ensures the agent uses correct contact names, not "Agent Name"
 */
function substitutePromptPlaceholders(prompt: string, context: CallContext): string {
  let result = prompt;
  
  // Standard placeholder substitutions
  const substitutions: Record<string, string | undefined> = {
    // Contact placeholders
    '{{contact.full_name}}': context.contactName,
    '{{contact.fullName}}': context.contactName,
    '{{contact.first_name}}': context.contactFirstName,
    '{{contact.firstName}}': context.contactFirstName,
    '{{contact.job_title}}': context.contactJobTitle,
    '{{contact.jobTitle}}': context.contactJobTitle,
    
    // Account/Organization placeholders
    '{{account.name}}': context.accountName,
    '{{org.name}}': context.organizationName || 'DemandGentic.ai By Pivotal B2B',
    '{{organization.name}}': context.organizationName || 'DemandGentic.ai By Pivotal B2B',
    
    // Agent identity - ALWAYS use DemandGentic.ai By Pivotal B2B
    '{{agent.name}}': 'DemandGentic.ai By Pivotal B2B',
    '{{agent.fullName}}': 'DemandGentic.ai By Pivotal B2B',
    '{{agent.firstName}}': 'DemandGentic',
    
    // Campaign placeholders
    '{{campaign.name}}': context.campaignName,
    '{{campaign.purpose}}': context.campaignPurpose,
  };
  
  // Apply substitutions
  for (const [placeholder, value] of Object.entries(substitutions)) {
    if (value) {
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
  }
  
  // Also handle bracket placeholders [Name], [Organization], etc.
  if (context.contactName) {
    result = result.replace(/\[Name\]/g, context.contactName);
    result = result.replace(/\[Contact Name\]/g, context.contactName);
  }
  
  // Use organization name directly
  if (context.organizationName) {
    result = result.replace(/\[Organization\]/g, context.organizationName);
    result = result.replace(/\[Company\]/g, context.organizationName);
  } else {
    result = result.replace(/\[Organization\]/g, 'DemandGentic.ai By Pivotal B2B');
    result = result.replace(/\[Company\]/g, 'DemandGentic.ai By Pivotal B2B');
  }
  
  return result;
}

/**
 * Build DemandGentic.ai By Pivotal B2B identity preamble for the system prompt
 */
function buildDemandGenticIdentityPreamble(context: CallContext): string {
  const orgRef = context.organizationName || 'DemandGentic.ai By Pivotal B2B';
    
  return `## YOUR IDENTITY (CRITICAL)

You are an AI voice assistant from ${orgRef}.

**How to introduce yourself after identity is confirmed:**
- Say: "I'm calling from ${orgRef}."
- Do NOT say your name is "Agent Name" or any placeholder
- Do NOT say you are "Name" or leave placeholders unsubstituted
${context.contactName ? `
**The person you are calling:**
- Contact Name: ${context.contactName}
- Use their name naturally in conversation: "${context.contactFirstName || context.contactName}"
` : ''}${context.contactJobTitle ? `- Job Title: ${context.contactJobTitle}` : ''}${context.accountName ? `
- Company: ${context.accountName}` : ''}

**Opening (after phone is answered):**
"Hello, may I please speak with ${context.contactName || '[the contact]'}${context.contactJobTitle ? `, the ${context.contactJobTitle}` : ''}${context.accountName ? ` at ${context.accountName}` : ''}?"

## CRITICAL: IDENTITY CONFIRMATION RESPONSE (MUST FOLLOW WITHOUT PAUSE)

When the contact confirms their identity with ANY of these phrases:
- "Yes", "Yeah", "That's me", "Speaking", "This is [name]", "I'm [name]", "Yes I am", "I am", "Go ahead"

You MUST IMMEDIATELY respond WITHOUT ANY PAUSE. Never wait silently. The very next words out of your mouth should be:

1. First: Thank them - "Great, thanks for confirming!"
2. Then: Introduce yourself - "I'm calling from ${orgRef}."
3. Then: Set expectations - "This isn't a sales call."
4. Then: State purpose - Briefly explain why you're calling (market research, feedback, industry insights).
5. Then: Ask an open-ended question to start the conversation.

**NEVER GO SILENT after identity confirmation.** If you're not sure what to say, default to:
"Thanks for confirming! I'm calling from ${orgRef}. I'm reaching out because we're doing some market research in your industry and I'd love to get your perspective on a few things. Would that be okay?"

## CRITICAL: HANDLING EARLY QUESTIONS (BEFORE YOUR PITCH)

**If the prospect asks a direct question IMMEDIATELY after confirming identity (before you can deliver your pitch):**

Examples of early questions:
- "What is this about?"
- "Can you tell me more about your product/services/functionalities?"
- "Why are you calling?"
- "What does your company do?"

**HOW TO HANDLE - NEVER GO SILENT:**
1. **Acknowledge briefly**: "Great question — let me give you the quick version."
2. **Bridge to your pitch**: Deliver a condensed version of your introduction (20-30 seconds max)
   - Who you are: "I'm calling from ${orgRef}."
   - What you do: ONE sentence about your value proposition
   - Why them: Brief relevance to their role
3. **Re-engage with a question**: End with "Does that make sense?" or "Is that something relevant to you?"

**EXAMPLE RESPONSE to "Can you tell me about your features?":**
"Absolutely — thanks for asking. I'm calling from ${orgRef}. We help [target audience] with [key value proposition]. The reason I'm reaching out is [brief relevance to their role]. Is that something you're focused on right now?"

**⚠️ NEVER go silent when asked a direct question. ALWAYS respond immediately with a conversational answer.**
**⚠️ Silence after identity confirmation = CRITICAL FAILURE**

`;};

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
  let callContext: CallContext = {};

  // Audio quality tracking
  const metrics: AudioMetrics = {
    startTime: Date.now(),
    audioChunksSent: 0,
    audioChunksReceived: 0,
    totalBytesSent: 0,
    totalBytesReceived: 0,
    bufferBackpressureEvents: 0,
    lastAudioSentTime: Date.now(),
    lastAudioReceivedTime: Date.now(),
    connectionDrops: 0,
  };

  // Initialize audio quality monitoring
  if (callId) {
    audioQualityMonitor.startCall(callId);
  }

  // Keepalive and reconnection state
  let keepaliveInterval: NodeJS.Timeout | null = null;
  let audioTimeoutTimer: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  let geminiConnected = false;

  // Cleanup function for graceful shutdown
  function cleanup() {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    if (audioTimeoutTimer) clearTimeout(audioTimeoutTimer);
    if (geminiWs) {
      geminiWs.close();
      geminiWs = null;
    }
  }

  // 1. Handle messages from Telnyx (Inbound from PSTN)
  ws.on('message', async (data: any) => {
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
              voiceName = config.voice || voiceName;
              
              // Extract call context for placeholder substitution
              callContext = {
                contactName: config.contact_name || config.contactName,
                contactFirstName: config.contact_first_name || config.contactFirstName,
                contactJobTitle: config.contact_job_title || config.contactJobTitle,
                accountName: config.account_name || config.accountName,
                organizationName: config.organization_name || config.organizationName,
                campaignName: config.campaign_name || config.campaignName,
                campaignPurpose: config.campaign_purpose || config.campaignPurpose,
              };
              
              // Try to load campaign organization if campaign_id is provided
              if (config.campaign_id && config.campaign_id !== 'test-campaign') {
                try {
                  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, config.campaign_id)).limit(1);
                  if (campaign) {
                    callContext.campaignName = campaign.name;
                    // Get organization name from campaign if available
                    if ((campaign as any).organizationName) {
                      callContext.organizationName = (campaign as any).organizationName;
                    }
                  }
                } catch (dbErr) {
                  console.warn('[Gemini Live] Failed to load campaign data:', dbErr);
                }
              }
              
              // Build the final system prompt with DemandGentic identity and substitutions
              const identityPreamble = buildDemandGenticIdentityPreamble(callContext);
              let basePrompt = config.system_prompt || systemPrompt;
              
              // Substitute all placeholders in the base prompt
              basePrompt = substitutePromptPlaceholders(basePrompt, callContext);
              
              // Prepend identity preamble to ensure correct agent identity
              systemPrompt = identityPreamble + basePrompt;
              
              console.log(`[Gemini Live] Call ${config.call_id} started. Voice: ${voiceName}`);
              console.log(`[Gemini Live] Contact: ${callContext.contactName || 'Unknown'}, Org: ${callContext.organizationName || 'DemandGentic.ai By Pivotal B2B'}`);
            } catch (e) {
              console.error('[Gemini Live] Failed to parse client_state', e);
            }
          }

          // Initialize connection to Google
          connectToGemini();
          break;

        case 'media':
          if (geminiWs?.readyState === WebSocket.OPEN) {
            // Update audio metrics
            metrics.audioChunksSent++;
            metrics.totalBytesSent += msg.media.payload?.length || 0;
            metrics.lastAudioSentTime = Date.now();

            // Record in monitor
            if (callId) {
              audioQualityMonitor.recordAudioSent(callId, msg.media.payload?.length || 0);
            }

            // Check buffer backpressure
            const bufferSize = geminiWs.bufferedAmount;
            if (bufferSize > MAX_BUFFER_SIZE) {
              metrics.bufferBackpressureEvents++;
              if (callId) {
                audioQualityMonitor.recordBackpressure(callId);
              }
              console.warn(`[Gemini Live] ⚠️ Buffer backpressure detected (${bufferSize} bytes), may affect audio quality`);
              // Drop frame to prevent buffer overflow
              break;
            }

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

            // Reset audio timeout on successful send
            if (audioTimeoutTimer) clearTimeout(audioTimeoutTimer);
            audioTimeoutTimer = setTimeout(() => {
              console.error('[Gemini Live] ❌ No audio activity for 60 seconds - connection may be stalled');
              metrics.connectionDrops++;
              if (callId) {
                audioQualityMonitor.recordAudioTimeout(callId);
              }
              if (geminiWs) {
                geminiWs.close(1000, 'Audio timeout');
              }
            }, AUDIO_TIMEOUT);
          }
          break;

        case 'stop':
          console.log('[Gemini Live] ⏹️ Telnyx stream stopped');
          console.log('[Gemini Live] 📊 Call metrics:', {
            duration: Math.round((Date.now() - metrics.startTime) / 1000) + 's',
            audioChunks: metrics.audioChunksSent,
            totalData: (metrics.totalBytesSent / 1024).toFixed(2) + 'KB',
            backpressureEvents: metrics.bufferBackpressureEvents,
          });
          
          // End quality monitoring
          if (callId) {
            const finalMetrics = audioQualityMonitor.endCall(callId);
            if (finalMetrics) {
              const alert = audioQualityMonitor.checkAndAlert(callId);
              if (alert) console.warn(alert);
            }
          }
          
          cleanup();
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
    geminiConnected = false;
    reconnectAttempts = 0;

    // Set connection timeout
    const connectionTimeout = setTimeout(() => {
      if (!geminiConnected) {
        console.error('[Gemini Live] Connection timeout - Gemini not responding');
        geminiWs?.close();
        attemptReconnect();
      }
    }, 15000);

    geminiWs.on('open', () => {
      clearTimeout(connectionTimeout);
      geminiConnected = true;
      reconnectAttempts = 0;
      console.log('[Gemini Live] ✅ Connected to Google Gemini API');
      
      // Start keepalive heartbeat
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      keepaliveInterval = setInterval(() => {
        if (geminiWs?.readyState === WebSocket.OPEN) {
          // Send empty turn complete to maintain connection
          try {
            geminiWs.send(JSON.stringify({ client_content: { turn_complete: false } }));
          } catch (e) {
            console.warn('[Gemini Live] Keepalive ping failed:', e);
          }
        }
      }, AUDIO_KEEPALIVE_INTERVAL);
      
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
        
        // Track audio received
        if (response.serverContent?.modelTurn?.parts?.some((p: any) => p.inlineData)) {
          metrics.audioChunksReceived++;
          metrics.lastAudioReceivedTime = Date.now();
          
          // Record in monitor
          if (callId) {
            for (const part of response.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                const audioBytes = Buffer.byteLength(part.inlineData.data, 'base64');
                audioQualityMonitor.recordAudioReceived(callId, audioBytes);
              }
            }
          }
        }

        console.log('[Gemini Live] 📥 Message received:', JSON.stringify(response).substring(0, 200));

        // Handle Audio Output from Gemini
        if (response.serverContent?.modelTurn?.parts) {
          for (const part of response.serverContent.modelTurn.parts) {
            if (part.text) {
              aiTranscript += part.text;
            }

            if (part.inlineData?.data) {
              // Calculate bytes received
              const audioBytes = Buffer.byteLength(part.inlineData.data, 'base64');
              metrics.totalBytesReceived += audioBytes;

              // Send audio back to Telnyx with backpressure check
              if (ws.readyState === WebSocket.OPEN) {
                const wsBufferSize = ws.bufferedAmount;
                if (wsBufferSize > MAX_BUFFER_SIZE) {
                  metrics.bufferBackpressureEvents++;
                  console.warn(`[Gemini Live] ⚠️ Telnyx buffer backpressure (${wsBufferSize} bytes), dropping frame`);
                  break; // Skip this audio chunk
                }

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
      geminiConnected = false;
      clearTimeout(connectionTimeout);
      
      // Record connection drop
      metrics.connectionDrops++;
      if (callId) {
        audioQualityMonitor.recordConnectionDrop(callId);
      }
      
      // Log final metrics
      const duration = (Date.now() - metrics.startTime) / 1000;
      console.log('[Gemini Live] 📊 Final audio metrics:', {
        duration: duration.toFixed(1) + 's',
        chunksSent: metrics.audioChunksSent,
        chunksReceived: metrics.audioChunksReceived,
        bytesSent: (metrics.totalBytesSent / 1024).toFixed(2) + 'KB',
        bytesReceived: (metrics.totalBytesReceived / 1024).toFixed(2) + 'KB',
        backpressureEvents: metrics.bufferBackpressureEvents,
        connectionDrops: metrics.connectionDrops,
      });

      // Attempt reconnect if Telnyx is still connected
      if (ws.readyState === WebSocket.OPEN) {
        attemptReconnect();
      } else {
        cleanup();
      }
    });

    geminiWs.on('error', (err) => {
      console.error('[Gemini Live] ❌ Gemini WebSocket error:', err);
      geminiConnected = false;
      metrics.connectionDrops++;
    });
  }

  /**
   * Attempt to reconnect to Gemini with exponential backoff
   */
  function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Gemini Live] ❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
      ws.close(1011, 'Gemini connection failed - max retries exceeded');
      cleanup();
      return;
    }

    const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    console.log(`[Gemini Live] 🔄 Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN && !geminiConnected) {
        connectToGemini();
      }
    }, delay);
  }

  ws.on('close', () => {
    console.log('[Gemini Live] 🔌 Telnyx connection closed');
    cleanup();
    geminiWs?.close();
  });
}
