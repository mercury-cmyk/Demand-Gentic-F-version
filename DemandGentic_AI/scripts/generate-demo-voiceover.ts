import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define the script for your demo here
const DEMO_SCRIPT_TEXT = `
Welcome to the DemandGenetic AI Client Portal, your command center for automated growth.
The Overview Dashboard gives you an immediate pulse on your campaigns, displaying real-time metrics on active leads, opportunities, and agent performance.
Navigate to the Campaigns tab to monitor your AI workforce. Here, you can track call volumes, connect rates, and qualified transfers across all your active markets.
The Leads section is where the magic happens. Our system automatically qualifies prospects based on your custom criteria, filtering out noise and delivering high-intent opportunities directly to your pipeline.
Dive deeper with our Analytics and Reports. View comprehensive breakdowns of call sentiment, objection handling, and conversion rates to continuously optimize your strategy.
Our Account Intelligence features leverage advanced algorithms to identify your Ideal Customer Profile and tailor messaging that resonates with decision-makers.
Finally, managing your account is effortless with self-service tools for email templates and campaign configuration.
With DemandGenetic AI, you're not just getting leads; you're getting a fully autonomous revenue engine.
`;

const OUTPUT_DIR = path.join(process.cwd(), 'demo_assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'demo_voiceover.mp3');

async function generateVoiceover() {
    console.log('[DemoGen] Starting voiceover generation...');
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    try {
        const client = new TextToSpeechClient();

        const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
            input: { text: DEMO_SCRIPT_TEXT },
            // Select the voice (en-US-Journey-F is a high quality "Journey" voice if available, else standard)
            voice: { languageCode: 'en-US', name: 'en-US-Journey-F' }, 
            audioConfig: { audioEncoding: 'MP3' },
        };

        // Fallback to standard voice if Journey is not accessible in this project quota
        try {
            console.log('[DemoGen] Attempting to use Journey voice (en-US-Journey-F)...');
            const [response] = await client.synthesizeSpeech(request);
            await writeFile(response.audioContent);
        } catch (error: any) {
            console.warn('[DemoGen] Journey voice failed, falling back to Studio voice (en-US-Studio-O)...');
             request.voice = { languageCode: 'en-US', name: 'en-US-Studio-O' };
             const [response] = await client.synthesizeSpeech(request);
             await writeFile(response.audioContent);
        }

    } catch (error) {
        console.error('[DemoGen] Fatal error generating voiceover:', error);
        process.exit(1);
    }
}

async function writeFile(content: string | Uint8Array | null | undefined) {
    if (!content) {
        throw new Error('No content returned from TTS API');
    }
    await fs.promises.writeFile(OUTPUT_FILE, content, 'binary');
    console.log(`[DemoGen] Success! Voiceover saved to: ${OUTPUT_FILE}`);
    console.log('[DemoGen] Next Step: Run the screen recorder script to capture video synchronized with this audio.');
}

generateVoiceover();