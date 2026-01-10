
import { WebSocketServer, WebSocket } from 'ws';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { PassThrough } from 'stream';

// Load environment variables from .env file
config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const wss = new WebSocketServer({ port: 8080 });

console.log('WebSocket server started on port 8080');

wss.on('connection', (ws) => {
  console.log('[AI Agent] Client connected');

  // This stream will be used to pipe audio data from the WebSocket to OpenAI's Whisper API
  const whisperStream = new PassThrough();

  // Enhanced: Log when agent is initialized
  console.log('[AI Agent] Initializing agent and audio stream');

  // A function to start the transcription process
  const startTranscription = async () => {
    try {
      console.log('[AI Agent] Starting OpenAI transcription...');
      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: whisperStream as any, // We pipe the audio stream directly
      });

      console.log(`[AI Agent] Transcription received: ${transcription.text}`);

      // Once we have the transcription, get a response from GPT
      getGptResponse(transcription.text);

    } catch (error) {
      console.error('[AI Agent] Error during transcription:', error);
    }
  };

  // A function to get a response from GPT-4
  const getGptResponse = async (inputText: string) => {
    try {
      console.log('[AI Agent] Getting GPT response for:', inputText);
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant on a phone call.' },
          { role: 'user', content: inputText },
        ],
      });

      const responseText = completion.choices[0].message?.content;
      if (responseText) {
        console.log(`[AI Agent] GPT response: ${responseText}`);
        // Convert the text response to speech
        await streamTtsToClient(responseText);
      } else {
        console.log('[AI Agent] No response text from GPT.');
      }
    } catch (error) {
      console.error('[AI Agent] Error getting GPT response:', error);
    }
  };

  // A function to stream OpenAI's TTS audio back to the client
  const streamTtsToClient = async (text: string) => {
    try {
      console.log('[AI Agent] Streaming TTS audio to client... Text:', text);
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        response_format: 'mp3',
      });

      const audioStream = response.body;

      // Stream the audio data back to the WebSocket client
      let chunkCount = 0;
      for await (const chunk of audioStream) {
        ws.send(chunk);
        chunkCount++;
      }
      console.log(`[AI Agent] Finished streaming TTS audio. Chunks sent: ${chunkCount}`);
    } catch (error) {
      console.error('[AI Agent] Error streaming TTS audio:', error);
    }
  };

  // When a message is received from the WebSocket client (the media server)
  ws.on('message', (message: Buffer) => {
    // Enhanced: Log message receipt and size
    console.log(`[AI Agent] Received audio message. Size: ${message.length} bytes`);
    whisperStream.write(message);
  });

  ws.on('close', () => {
    console.log('[AI Agent] Client disconnected');
    whisperStream.end(); // End the stream when the client disconnects
  });

  ws.on('error', (error) => {
    console.error('[AI Agent] WebSocket error:', error);
    whisperStream.end();
  });

  // Start the transcription process once the connection is established.
  // In a real application, you might wait for a specific event.
  startTranscription();
});
