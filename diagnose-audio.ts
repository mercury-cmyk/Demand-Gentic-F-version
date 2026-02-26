#!/usr/bin/env node

/**
 * Comprehensive Audio Transmission Diagnostic
 * 
 * This script checks:
 * 1. Server is running and healthy
 * 2. Telnyx credentials configured
 * 3. OpenAI API key configured
 * 4. WebSocket URL configuration (localhost vs public)
 * 5. ngrok tunnel status (if in use)
 * 6. Test audio transmission with detailed logging
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Helper to parse .env file simple
function parseEnv(filePath: string) {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf-8');
    const env: Record<string, string> = {};
    content.split('\n').forEach(line => {
        const cleanLine = line.replace(/\r$/, ''); // Strip Windows line endings
        const match = cleanLine.match(/^([^=]+)=(.*)$/);
        if (match) {
            let value = match[2].trim();
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            env[match[1].trim()] = value;
        }
    });
    return env;
}

// Load envs with explicit development precedence:
// .env -> .env.development -> .env.local -> .env.development.local
const envDefault = parseEnv(path.join(process.cwd(), '.env'));
const envDevelopment = parseEnv(path.join(process.cwd(), '.env.development'));
const envLocal = parseEnv(path.join(process.cwd(), '.env.local'));
const envDevLocal = parseEnv(path.join(process.cwd(), '.env.development.local'));

function resolveEnv(key: string): string | undefined {
    return process.env[key] || envDevLocal[key] || envLocal[key] || envDevelopment[key] || envDefault[key];
}

const BASE_URL = 'http://localhost:5000';
const TESTS = {
  server: '✅ Server Health',
  config: '✅ Configuration',
  websocket: '✅ WebSocket URL',
  ngrok: '✅ ngrok Tunnel',
  audioTest: '✅ Audio Transmission Test'
};

let results = {};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(level, msg) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    'INFO': `${colors.cyan}[${timestamp}]${colors.reset}`,
    'PASS': `${colors.green}[✓]${colors.reset}`,
    'FAIL': `${colors.red}[✗]${colors.reset}`,
    'WARN': `${colors.yellow}[!]${colors.reset}`,
    'TEST': `${colors.bright}[TEST]${colors.reset}`
  };
  console.log(`${prefix[level] || ''} ${msg}`);
}

async function checkServer() {
  log('TEST', 'Checking server health...');
  try {
    const response = await axios.get(`${BASE_URL}/api/health`, { timeout: 5000 });
    log('PASS', 'Server is running on http://localhost:5000');
    results.server = { status: 'pass', details: response.data };
    return true;
  } catch (err) {
    log('FAIL', `Server is not responding: ${err.message}`);
    log('WARN', 'Make sure to run: npm run dev');
    results.server = { status: 'fail', error: err.message };
    return false;
  }
}

async function checkConfiguration() {
  log('TEST', 'Checking configuration...');
  
  const required = {
    'TELNYX_API_KEY': resolveEnv('TELNYX_API_KEY') ? 'SET' : 'MISSING',
    'OPENAI_API_KEY': resolveEnv('OPENAI_API_KEY') ? 'SET' : 'MISSING',
    'DATABASE_URL': resolveEnv('DATABASE_URL') ? 'SET' : 'MISSING',
  };
  
  const optional = {
    'TELNYX_PUBLIC_KEY': resolveEnv('TELNYX_PUBLIC_KEY') ? 'SET' : 'MISSING',
    'PUBLIC_WEBSOCKET_URL': resolveEnv('PUBLIC_WEBSOCKET_URL') || 'NOT SET (will use request host)',
    'VOICE_PROVIDER': resolveEnv('VOICE_PROVIDER') || 'openai_realtime (default)',
  };

  let missing = [];
  for (const [key, value] of Object.entries(required)) {
    if (value === 'MISSING') {
      log('FAIL', `Required: ${key} = ${colors.red}${value}${colors.reset}`);
      missing.push(key);
    } else {
      log('PASS', `Required: ${key} = ${colors.green}${value}${colors.reset}`);
    }
  }

  for (const [key, value] of Object.entries(optional)) {
    log('INFO', `Optional: ${key} = ${value}`);
  }

  results.config = { status: missing.length === 0 ? 'pass' : 'fail', missing };
  return missing.length === 0;
}

async function checkWebSocketURL() {
  log('TEST', 'Checking WebSocket URL configuration...');
  
  if (resolveEnv('PUBLIC_WEBSOCKET_URL')) {
    log('PASS', `PUBLIC_WEBSOCKET_URL is set: ${resolveEnv('PUBLIC_WEBSOCKET_URL')}`);
    results.websocket = { status: 'pass', url: resolveEnv('PUBLIC_WEBSOCKET_URL') };
  } else {
    log('WARN', 'PUBLIC_WEBSOCKET_URL not set - will use request host header');
    log('WARN', 'This means WebSocket URL = ws://localhost:5000/openai-realtime-dialer');
    log('FAIL', `${colors.red}Telnyx CANNOT reach localhost!${colors.reset}`);
    log('INFO', 'Set PUBLIC_WEBSOCKET_URL to your ngrok URL:');
    log('INFO', '  1. Start ngrok: ngrok http 5000');
    log('INFO', '  2. Set: PUBLIC_WEBSOCKET_URL=wss://<ngrok-url>/openai-realtime-dialer');
    results.websocket = { status: 'fail', reason: 'localhost_not_reachable' };
  }
}

async function checkNgrokTunnel() {
  log('TEST', 'Checking ngrok tunnel status...');
  
  try {
    const response = await axios.get('http://127.0.0.1:4040/api/tunnels', { timeout: 2000 });
    const tunnels = response.data.tunnels;
    
    if (tunnels && tunnels.length > 0) {
      const publicUrl = tunnels[0].public_url;
      const wssUrl = publicUrl.replace('https://', 'wss://');
      log('PASS', `ngrok tunnel is active: ${publicUrl}`);
      log('INFO', `WebSocket URL: ${wssUrl}/openai-realtime-dialer`);
      log('INFO', `Set PUBLIC_WEBSOCKET_URL=${wssUrl}/openai-realtime-dialer`);
      results.ngrok = { status: 'pass', tunnel_url: publicUrl, wss_url: wssUrl };
    } else {
      log('FAIL', 'ngrok tunnel found but no active tunnels');
      results.ngrok = { status: 'fail', reason: 'no_active_tunnels' };
    }
  } catch (err) {
    log('WARN', `ngrok tunnel not detected: ${err.message}`);
    log('INFO', 'Start ngrok tunnel: ngrok http 5000');
    results.ngrok = { status: 'not_running', error: err.message };
  }
}

async function testAudioTransmission() {
  log('TEST', 'Testing audio transmission...');
  
  if (!results.server || results.server.status !== 'pass') {
    log('FAIL', 'Cannot test audio - server not running');
    results.audioTest = { status: 'skip', reason: 'server_not_running' };
    return;
  }

  try {
    // POST to test endpoint
    const response = await axios.post(
      `${BASE_URL}/api/ai-calls/test-openai-realtime`,
      {
        phoneNumber: '+1234567890',
        virtualAgentId: 'test-agent'
      },
      {
        headers: {
          'Authorization': `Bearer ${resolveEnv('AUTH_TOKEN') || 'test-token'}`,
          'X-Public-Host': resolveEnv('PUBLIC_WEBSOCKET_URL') ? 
            new URL(resolveEnv('PUBLIC_WEBSOCKET_URL')).host : 
            'localhost:5000'
        },
        timeout: 10000
      }
    );
    
    log('PASS', `Audio test initiated: ${response.data.message || 'OK'}`);
    log('INFO', `Call ID: ${response.data.callId || 'N/A'}`);
    log('INFO', 'Watch server logs for:');
    log('INFO', '  - 🔗 Telnyx streaming_event received (indicates media started)');
    log('INFO', '  - 🎙️ First inbound audio frame (audio from caller)');
    log('INFO', '  - ✅ First audio frame sent to Telnyx (AI response sent)');
    log('INFO', '  - 📊 Audio health check (frame counts every 15s)');
    
    results.audioTest = { status: 'pass', callId: response.data.callId };
  } catch (err) {
    log('FAIL', `Audio test failed: ${err.message}`);
    if (err.response?.data) {
      log('INFO', `Response: ${JSON.stringify(err.response.data)}`);
    }
    results.audioTest = { status: 'fail', error: err.message };
  }
}

async function runAllDiagnostics() {
  console.log(`\n${colors.bright}${colors.cyan}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🔍 Audio Transmission Diagnostic');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`${colors.reset}\n`);

  // Run checks
  await checkServer();
  console.log('');
  await checkConfiguration();
  console.log('');
  await checkWebSocketURL();
  console.log('');
  await checkNgrokTunnel();
  console.log('');
  await testAudioTransmission();

  // Summary
  console.log(`\n${colors.bright}${colors.cyan}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📊 Diagnostic Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`${colors.reset}\n`);

  const summary = {
    'Server Health': results.server?.status === 'pass' ? '✅ PASS' : '❌ FAIL',
    'Configuration': results.config?.status === 'pass' ? '✅ PASS' : '⚠️  CHECK',
    'WebSocket URL': results.websocket?.status === 'pass' ? '✅ PASS' : '⚠️  WARN',
    'ngrok Tunnel': results.ngrok?.status === 'pass' ? '✅ ACTIVE' : (results.ngrok?.status === 'not_running' ? '⚠️  NOT RUNNING' : '❌ CHECK'),
    'Audio Test': results.audioTest?.status === 'pass' ? '✅ INITIATED' : '⚠️  PENDING'
  };

  for (const [check, status] of Object.entries(summary)) {
    console.log(`  ${check.padEnd(20)} ${status}`);
  }

  console.log(`\n${colors.bright}${colors.cyan}Troubleshooting:${colors.reset}\n`);
  
  if (results.websocket?.status !== 'pass') {
    console.log(`  ${colors.yellow}⚠️  WebSocket URL Issue Detected:${colors.reset}`);
    console.log('     1. Make sure ngrok is running: ngrok http 5000');
    console.log('     2. Set PUBLIC_WEBSOCKET_URL to your ngrok wss:// URL');
    console.log('     3. Update Telnyx Call Control App stream_url');
    console.log('     4. Restart server: npm run dev\n');
  }

  if (results.server?.status !== 'pass') {
    console.log(`  ${colors.yellow}⚠️  Server Not Running:${colors.reset}`);
    console.log('     Run: npm run dev\n');
  }

  if (results.config?.missing?.length > 0) {
    console.log(`  ${colors.yellow}⚠️  Missing Configuration:${colors.reset}`);
    results.config.missing.forEach(key => {
      console.log(`     Set ${key} environment variable`);
    });
    console.log('');
  }

  console.log(`  ${colors.green}Next Steps:${colors.reset}`);
  console.log('     1. Fix any issues above');
  console.log('     2. Run this diagnostic again');
  console.log('     3. Watch server logs during test');
  console.log('     4. Verify audio on incoming call\n');
}

// Run diagnostics
runAllDiagnostics().catch(err => {
  log('FAIL', `Diagnostic failed: ${err.message}`);
  console.error(err);
  process.exit(1);
});
