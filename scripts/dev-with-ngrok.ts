import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Helper to parse .env file simple
function parseEnv(filePath: string) {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf-8');
    const env: Record<string, string> = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
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

// Load envs to sync with server
const envLocal = parseEnv(path.join(process.cwd(), '.env.local'));
const envDefault = parseEnv(path.join(process.cwd(), '.env'));
const mergedEnv = { ...envDefault, ...envLocal };

function resolveEnv(key: string): string | undefined {
    return process.env[key] || envLocal[key] || envDefault[key];
}

// Determine PORT: process.env > .env.local > .env > 5000
const PORT_STR = resolveEnv('PORT') || '5000';
const PORT = parseInt(PORT_STR, 10);
console.log(`ℹ️  Resolved PORT to ${PORT}`);

// Check if ngrok is installed
try {
  execSync('ngrok --version', { stdio: 'ignore' });
} catch (e) {
  console.error('❌ ngrok is not installed or not in PATH.');
  console.error('Please install ngrok to use the development tunnel.');
  process.exit(1);
}

// Global cleanup of ngrok
try {
    if (process.platform === 'win32') {
       execSync('taskkill /F /IM ngrok.exe', { stdio: 'ignore' });
    } else {
       execSync('pkill ngrok', { stdio: 'ignore' });
    }
} catch(e) {} 


// Helper to kill port
try {
  if (process.platform === 'win32') {
    try {
        const cmd = `for /f "tokens=5" %a in ('netstat -aon ^| find ":${PORT}" ^| find "LISTENING"') do taskkill /f /pid %a`;
        execSync(cmd, { stdio: 'ignore', shell: 'cmd.exe' });
        console.log(`🧹 Freed port ${PORT}`);
    } catch(e) {
        // Ignore if no process found
    }
  } else {
    try {
        execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: 'ignore' });
        console.log(`🧹 Freed port ${PORT}`);
    } catch(e) {
        // Ignore if no process found
    }
  }
} catch (e) {
  // Ignore errors
}

console.log(`🚀 Starting ngrok tunnel on port ${PORT}...`);

// Start ngrok
// FORCE 127.0.0.1 to avoid IPv6 [::1] issues on Windows
const ngrokProcess = spawn('ngrok', ['http', `127.0.0.1:${PORT}`, '--log=stdout'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

// Stream ngrok output to console for debugging
ngrokProcess.stdout.on('data', (data) => {
    // Filter out some noise, but keep connection errors
    const msg = data.toString();
    if (msg.includes('lvl=eror') || msg.includes('lvl=warn') || msg.includes('502 Bad Gateway') || msg.includes('503 Service Unavailable')) {
        process.stderr.write(`[ngrok] ${msg}`);
    }
});
ngrokProcess.stderr.on('data', (data) => {
    process.stderr.write(`[ngrok err] ${data.toString()}`);
});

let tunnelUrl: string | null = null;
let devProcess: any = null;

// Helper to fetch tunnel URL
function getTunnels() : Promise<string | null> {
    return new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:4040/api/tunnels', { timeout: 1000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const tunnel = json.tunnels.find((t: any) => t.proto === 'https');
                    if (tunnel) {
                        resolve(tunnel.public_url.replace('https://', 'wss://'));
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });
        
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

// Poll for tunnel
let attempts = 0;
const maxAttempts = 20; // 10 seconds

const pollInterval = setInterval(async () => {
    attempts++;
    process.stdout.write('.');
    
    tunnelUrl = await getTunnels();
    
    if (tunnelUrl) {
        clearInterval(pollInterval);
        console.log('\n');
        startDevServer();
    } else if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        console.warn('\n⚠️  Failed to obtain ngrok URL after 10 seconds.');
        console.warn('Starting dev server without ngrok tunnel...');
        console.warn('Local development server: http://localhost:' + PORT);
        startDevServer();
    }
}, 500);

function startDevServer() {
  const envPublicWsUrl = resolveEnv('PUBLIC_WEBSOCKET_URL');

  // ALWAYS use ngrok URL when tunnel is available - ignore placeholder env values
  // This ensures Telnyx can reach our WebSocket endpoint
  const isPlaceholderUrl = envPublicWsUrl && (
    envPublicWsUrl.includes('<your-ngrok-host>') ||
    envPublicWsUrl.includes('placeholder') ||
    envPublicWsUrl.includes('localhost')
  );

  const publicWsUrl = tunnelUrl
    ? `${tunnelUrl}/voice-dialer`  // Always use ngrok URL when available
    : (isPlaceholderUrl ? `http://localhost:${PORT}` : (envPublicWsUrl || `http://localhost:${PORT}`));

  // Extract the hostname from the ngrok tunnel URL for webhooks
  // tunnelUrl is in format: wss://xxxx.ngrok.io -> need https://xxxx.ngrok.io for webhooks
  let publicWebhookHost = `localhost:${PORT}`;
  let telnyxWebhookUrl = `http://localhost:${PORT}/`;

  if (tunnelUrl) {
    // tunnelUrl is like "wss://xxxx.ngrok-free.app" - convert to https host
    publicWebhookHost = tunnelUrl.replace('wss://', '').replace('ws://', '');
    telnyxWebhookUrl = `https://${publicWebhookHost}/`;
    console.log(`✅ Tunnel established: ${tunnelUrl}`);
    console.log(`🔗 PUBLIC_WEBHOOK_HOST=${publicWebhookHost}`);
    console.log(`🔗 TELNYX_WEBHOOK_URL=${telnyxWebhookUrl}`);
  }
  if (tunnelUrl) {
      console.log(`✅ Using ngrok tunnel for PUBLIC_WEBSOCKET_URL (ignoring env placeholder)`);
  } else if (envPublicWsUrl && !isPlaceholderUrl) {
      console.log(`ℹ️  Using PUBLIC_WEBSOCKET_URL from .env.local/.env`);
  } else {
      console.log(`⚠️  No ngrok tunnel - using localhost`);
  }
  console.log(`🔗 PUBLIC_WEBSOCKET_URL=${publicWsUrl}`);
  console.log('---------------------------------------------------');

  // Start the dev server
  console.log('🚀 Starting Express + Vite dev server...');

  // Use NODE_OPTIONS to preload warning suppression script before anything else
  const preloadPath = path.resolve(process.cwd(), 'server/preload-suppress.cjs');
  const existingNodeOptions = process.env.NODE_OPTIONS || '';

  // Escape backslashes for Windows paths in NODE_OPTIONS
  const escapedPreloadPath = preloadPath.replace(/\\/g, '\\\\');

  const env = {
      ...process.env,
      ...mergedEnv,
      PUBLIC_WEBSOCKET_URL: publicWsUrl,
      PUBLIC_WEBHOOK_HOST: publicWebhookHost,
      TELNYX_WEBHOOK_URL: telnyxWebhookUrl,
      NODE_ENV: 'development',
      PORT: PORT.toString(),
      NODE_OPTIONS: `--require "${escapedPreloadPath}" ${existingNodeOptions}`.trim()
  };

  // We run 'tsx server/index.ts' directly as in the original dev script
  // Original: "cross-env NODE_ENV=development tsx server/index.ts"

  devProcess = spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: 'inherit',
    env: env,
    shell: true
  });

  devProcess.on('close', (code: number) => {
    if (code !== 0) {
        console.error(`❌ Dev server exited with code ${code}. Check logs above for errors.`);
    }
    cleanup();
    process.exit(code || 0);
  });
}

function cleanup() {
  if (devProcess) {
    try {
        // Look for the node process. On windows spawn shell:true might make the pid the shell's usage.
        // We rely on standard process killing.
        // On Windows sometimes we need taskkill for tree.
        if (process.platform === 'win32') {
             execSync(`taskkill /pid ${devProcess.pid} /T /F`, { stdio: 'ignore' });
        } else {
             devProcess.kill();
        }
    } catch (e) {}
  }
  
  if (ngrokProcess) {
    console.log('\n🛑 Stopping ngrok...');
    try {
        ngrokProcess.kill();
    } catch (e) {}
  }
}

// Handle exit signals
process.on('SIGINT', () => {
    cleanup();
    process.exit();
});
process.on('SIGTERM', () => {
    cleanup();
    process.exit();
});
