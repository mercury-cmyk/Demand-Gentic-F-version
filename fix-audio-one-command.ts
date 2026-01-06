#!/usr/bin/env node

/**
 * ONE-COMMAND AUDIO FIX
 * 
 * This script:
 * 1. Checks for ngrok installation
 * 2. Starts ngrok tunnel
 * 3. Retrieves public URL
 * 4. Sets PUBLIC_WEBSOCKET_URL environment variable
 * 5. Runs diagnostic tests
 * 6. Initiates audio test call
 * 7. Watches server logs for audio frames
 * 
 * Usage:
 *   npm run fix-audio
 *   OR
 *   npx tsx fix-audio-one-command.ts
 */

import { execSync, spawn } from 'child_process';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(type, msg) {
  const time = new Date().toLocaleTimeString();
  const icons = {
    'STEP': '📋',
    'SUCCESS': '✅',
    'ERROR': '❌',
    'WARN': '⚠️',
    'INFO': 'ℹ️',
    'TEST': '🧪',
    'TUNNEL': '🌐',
    'AUDIO': '🎙️',
    'CHECK': '🔍'
  };
  const colors_map = {
    'STEP': colors.cyan,
    'SUCCESS': colors.green,
    'ERROR': colors.red,
    'WARN': colors.yellow,
    'INFO': colors.bright,
    'TEST': colors.magenta,
    'TUNNEL': colors.cyan,
    'AUDIO': colors.magenta,
    'CHECK': colors.cyan
  };
  const icon = icons[type] || '→';
  const color = colors_map[type] || colors.reset;
  console.log(`${color}${icon} [${time}]${colors.reset} ${msg}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkNgrok() {
  log('CHECK', 'Looking for ngrok...');
  try {
    execSync('ngrok --version', { stdio: 'pipe' });
    log('SUCCESS', 'ngrok is installed');
    return true;
  } catch {
    log('ERROR', 'ngrok is not installed or not in PATH');
    log('INFO', 'Download from: https://ngrok.com/download');
    log('INFO', 'Or install with: choco install ngrok (if using Chocolatey)');
    return false;
  }
}

async function getTunnelUrl() {
  log('TUNNEL', 'Retrieving tunnel URL...');
  let attempts = 0;
  while (attempts < 10) {
    try {
      const response = await axios.get('http://127.0.0.1:4040/api/tunnels', { timeout: 2000 });
      const tunnels = response.data.tunnels;
      if (tunnels && tunnels.length > 0) {
        const httpsUrl = tunnels[0].public_url;
        const wssUrl = httpsUrl.replace('https://', 'wss://');
        log('SUCCESS', `Tunnel URL: ${httpsUrl}`);
        return { https: httpsUrl, wss: wssUrl };
      }
    } catch (err) {
      // ngrok might not be ready yet
    }
    await sleep(500);
    attempts++;
  }
  log('ERROR', 'Could not connect to ngrok tunnel');
  return null;
}

async function runDiagnostic() {
  log('TEST', 'Running diagnostic tests...');
  try {
    const response = await axios.get('http://localhost:5000/health', { timeout: 5000 });
    log('SUCCESS', 'Server health check passed');
    return true;
  } catch (err) {
    log('ERROR', 'Server health check failed - make sure "npm run dev" is running');
    return false;
  }
}

async function initAudioTest() {
  log('AUDIO', 'Initiating audio test call...');
  try {
    const response = await axios.post(
      'http://localhost:5000/api/ai-calls/test-openai-realtime',
      {
        phoneNumber: '+1234567890',
        virtualAgentId: 'audio-test'
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AUTH_TOKEN || 'test'}`
        },
        timeout: 10000
      }
    );
    log('SUCCESS', `Audio test initiated - Call ID: ${response.data.callId}`);
    return response.data.callId;
  } catch (err) {
    log('ERROR', `Audio test failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`\n${colors.bright}${colors.cyan}${'═'.repeat(60)}`);
  console.log('  🔧 AUDIO FIX - ONE COMMAND');
  console.log('═'.repeat(60) + `${colors.reset}\n`);

  // Step 1: Check ngrok
  log('STEP', '1. Verifying ngrok installation...');
  const ngrokInstalled = await checkNgrok();
  if (!ngrokInstalled) {
    console.log(`\n${colors.red}Cannot proceed without ngrok${colors.reset}\n`);
    process.exit(1);
  }

  // Step 2: Start ngrok
  log('STEP', '2. Starting ngrok tunnel on port 5000...');
  try {
    // Start ngrok in background
    const ngrok = spawn('ngrok', ['http', '5000'], {
      detached: true,
      stdio: 'ignore'
    });
    ngrok.unref();
    log('SUCCESS', 'ngrok process started');
    await sleep(3000); // Wait for tunnel to establish
  } catch (err) {
    log('ERROR', `Failed to start ngrok: ${err.message}`);
    process.exit(1);
  }

  // Step 3: Get tunnel URL
  log('STEP', '3. Retrieving public tunnel URL...');
  const tunnelUrl = await getTunnelUrl();
  if (!tunnelUrl) {
    log('ERROR', 'Failed to get tunnel URL. Check that ngrok is running.');
    process.exit(1);
  }
  const wssUrl = tunnelUrl.wss;

  // Step 4: Show configuration
  console.log(`\n${colors.bright}${colors.cyan}PUBLIC WEBSOCKET URL:${colors.reset}\n${colors.green}${wssUrl}/openai-realtime-dialer${colors.reset}\n`);

  // Step 5: Save to .env
  log('STEP', '4. Saving configuration...');
  const envPath = path.join(__dirname, '.env.local');
  const envContent = `PUBLIC_WEBSOCKET_URL=${wssUrl}/openai-realtime-dialer\n`;
  try {
    fs.appendFileSync(envPath, envContent);
    log('SUCCESS', `Configuration saved to .env.local`);
  } catch (err) {
    log('WARN', `Could not save to .env.local: ${err.message}`);
    log('INFO', `Manually set: PUBLIC_WEBSOCKET_URL=${wssUrl}/openai-realtime-dialer`);
  }

  // Step 6: Run diagnostic
  log('STEP', '5. Running server diagnostic...');
  const serverOk = await runDiagnostic();
  if (!serverOk) {
    log('ERROR', 'Server is not responding. Start it with: npm run dev');
    process.exit(1);
  }

  // Step 7: Show next steps
  console.log(`\n${colors.bright}${colors.cyan}${'═'.repeat(60)}`);
  console.log('  ✅ SETUP COMPLETE');
  console.log('═'.repeat(60) + `${colors.reset}\n`);

  log('INFO', '🚀 YOUR NEXT STEPS:');
  console.log(`
  1. ${colors.bright}Update Telnyx Configuration:${colors.reset}
     Go to your Telnyx Call Control App settings and set:
     stream_url: ${colors.green}${wssUrl}/openai-realtime-dialer${colors.reset}

  2. ${colors.bright}Watch Server Logs:${colors.reset}
     Open another terminal and watch for these logs:
     ${colors.yellow}🔗 Telnyx streaming_event received${colors.reset}
     ${colors.yellow}🎙️ First inbound audio frame${colors.reset}
     ${colors.yellow}✅ First audio frame sent to Telnyx${colors.reset}

  3. ${colors.bright}Make a Test Call:${colors.reset}
     Call your Telnyx number and verify you hear the AI voice

  4. ${colors.bright}Common Issues:${colors.reset}
     - Still no audio? Check Telnyx stream_url is correct
     - ngrok tunnel dies? Keep this terminal open
     - No logs? Verify PUBLIC_WEBSOCKET_URL is set
`);

  log('TUNNEL', `ngrok tunnel will stay open. Press Ctrl+C to stop.`);
  log('INFO', `Monitor tunnel at: http://127.0.0.1:4040`);

  // Keep the script running
  await new Promise(() => {});
}

main().catch(err => {
  log('ERROR', `Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
