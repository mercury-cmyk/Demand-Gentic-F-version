
import { WebSocketServer, WebSocket } from 'ws';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { PassThrough } from 'stream';
import { submitTranscription } from './server/services/assemblyai-transcription';

// Load environment variables from .env file
config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const wss = new WebSocketServer({ port: 8080 });

console.log('WebSocket server started on port 8080');

wss.on('connection', (ws) => {
  console.log('[AI Agent] Client connected');

  // This stream will be used to collect audio data for Google Cloud Speech-to-Text
  const audioChunks: Buffer[] = [];

  // Enhanced: Log when agent is initialized
  console.log('[AI Agent] Initializing agent and audio stream');

  // A function to start the transcription process
  const startTranscription = async () => {
    try {
      console.log('[AI Agent] Starting Google Cloud Speech-to-Text transcription...');
      
      // Combine audio chunks into a single buffer
      const audioBuffer = Buffer.concat(audioChunks);
      
      // Create a data URL for the audio
      const audioDataUrl = `data:audio/wav;base64,${audioBuffer.toString('base64')}`;
      
      // For now, we need to save to a temp file or upload to a URL that submitTranscription can access
      // Since submitTranscription expects a URL, we'll need to modify this approach
      // For production, upload the audio buffer to GCS or similar first
      console.log('[AI Agent] Audio collected, preparing for transcription...');
      
      // Convert buffer to base64 and send to Google Cloud Speech API directly
      const { SpeechClient } = await import('@google-cloud/speech');
      const speechClient = new SpeechClient();
      
      const request = {
        audio: {
          content: audioBuffer.toString('base64'),
        },
        config: {
          encoding: 1, // LINEAR16
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          model: 'default',
        },
      };
      
      const [response] = await speechClient.recognize(request);
      const transcription = response.results?.map(result =>
        result.alternatives?.[0]?.transcript || ''
      ).join(' ') || '';

      console.log(`[AI Agent] Transcription received: ${transcription}`);

      // Once we have the transcription, get a response from GPT
      getGptResponse(transcription);

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
