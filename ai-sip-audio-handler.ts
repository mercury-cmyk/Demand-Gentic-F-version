import { WebSocketServer, WebSocket } from 'ws';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { PassThrough } from 'stream';
import { SpeechClient } from '@google-cloud/speech';

// Load environment variables from .env file
config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const speechClient = new SpeechClient();

const wss = new WebSocketServer({ port: 8080 });

console.log('WebSocket server started on port 8080');

wss.on('connection', (ws) => {
  console.log('[AI Agent] Client connected');

  let recognizeStream: any = null;
  let isAgentSpeaking = false;

  const startGoogleStream = () => {
    console.log('[AI Agent] Starting Google Cloud Speech-to-Text stream...');
    recognizeStream = speechClient
      .streamingRecognize({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          interimResults: true,
        },
        interimResults: true,
      })
      .on('error', (error) => {
        console.error('[AI Agent] Google Speech-to-Text stream error:', error);
      })
      .on('data', async (data) => {
        const transcription = data.results[0]?.alternatives[0]?.transcript;
        if (data.results[0]?.isFinal && transcription) {
          console.log(`[AI Agent] Final transcription: ${transcription}`);
          await getGptResponse(transcription);
        }
      });
  };

  const getGptResponse = async (inputText: string) => {
    try {
      isAgentSpeaking = true;
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
        await streamTtsToClient(responseText);
      } else {
        console.log('[AI Agent] No response text from GPT.');
      }
    } catch (error) {
      console.error('[AI Agent] Error getting GPT response:', error);
    } finally {
      isAgentSpeaking = false;
    }
  };

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

      for await (const chunk of audioStream) {
        ws.send(chunk);
      }
      console.log('[AI Agent] Finished streaming TTS audio.');
    } catch (error) {
      console.error('[AI Agent] Error streaming TTS audio:', error);
    }
  };

  ws.on('message', (message: Buffer) => {
    if (isAgentSpeaking) {
      // Ignore audio while the agent is speaking to prevent feedback
      return;
    }

    if (recognizeStream) {
      recognizeStream.write(message);
    }
  });

  ws.on('close', () => {
    console.log('[AI Agent] Client disconnected');
    if (recognizeStream) {
      recognizeStream.destroy();
    }
  });

  ws.on('error', (error) => {
    console.error('[AI Agent] WebSocket error:', error);
    if (recognizeStream) {
      recognizeStream.destroy();
    }
  });

  startGoogleStream();
});