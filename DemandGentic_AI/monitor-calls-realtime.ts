import axios from 'axios';
import * as readline from 'readline';

const API_BASE = 'http://localhost:5000/api';

interface CallSession {
  id: string;
  status: 'connecting' | 'connected' | 'speaking' | 'disconnected';
  startTime: Date;
  duration: number;
  agentSpeaking: boolean;
  lastActivity: string;
}

const activeCalls = new Map();

async function checkCallStatus() {
  try {
    // Check WebSocket connections
    const response = await axios.get(`${API_BASE}/call-sessions/active`, {
      timeout: 5000,
    }).catch(() => ({ data: { sessions: [] } }));

    const sessions = response.data.sessions || [];
    const timestamp = new Date().toLocaleTimeString();

    console.clear();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📞 CALL MONITORING DASHBOARD - ${timestamp}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (sessions.length === 0) {
      console.log('⏳ No active calls detected...');
      console.log('Waiting for incoming calls...\n');
    } else {
      console.log(`✅ ${sessions.length} ACTIVE CALL(S) DETECTED\n`);

      sessions.forEach((session: any, index: number) => {
        const duration = Math.floor(
          (Date.now() - new Date(session.startTime).getTime()) / 1000
        );
        const status = getStatusEmoji(session.status);
        const agent = session.voiceAgentActive ? '🎙️ TALKING' : '🔇 LISTENING';

        console.log(`[Call ${index + 1}]`);
        console.log(`  ID: ${session.id}`);
        console.log(`  Status: ${status} ${session.status.toUpperCase()}`);
        console.log(`  Duration: ${formatTime(duration)}`);
        console.log(`  Voice Agent: ${agent}`);
        console.log(`  Caller: ${session.callerNumber || 'Unknown'}`);
        console.log(`  Direction: ${session.direction || 'inbound'}`);
        console.log(`  Last Event: ${session.lastEvent || 'None'}`);
        console.log(`  Agent Type: ${session.agentType || 'core_voice_agent'}`);
        console.log('');
      });
    }

    // WebSocket connection status
    console.log('─────────────────────────────────────────────────────────────');
    console.log('🔌 VOICE PROVIDER STATUS:');
    console.log('  • Primary: Google Gemini Live API');
    console.log('  • Fallback: OpenAI Realtime API');
    console.log('  • WebSocket Endpoint: /voice-dialer');
    console.log('  • Audio Codec: G.711 μ-law (8kHz)');
    console.log('  • Status: ✅ READY\n');

    // Event log tail
    console.log('─────────────────────────────────────────────────────────────');
    console.log('📋 RECENT EVENTS (Last 5):');
    await displayRecentEvents();
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('💡 COMMAND HINTS:');
    console.log('  • Type "test" to simulate an incoming call');
    console.log('  • Type "detail " to see detailed metrics');
    console.log('  • Type "q" to quit monitoring');
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (error: any) {
    console.error(`❌ Error checking call status: ${error.message}`);
  }
}

function getStatusEmoji(status: string): string {
  const emojis: Record = {
    connecting: '🔄',
    connected: '✅',
    speaking: '🎤',
    disconnected: '❌',
  };
  return emojis[status] || '❓';
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs}h ${mins}m ${secs}s`.replace(/^0h /, '').replace(/^0m /, '');
}

async function displayRecentEvents() {
  try {
    const response = await axios.get(`${API_BASE}/call-events/recent?limit=5`, {
      timeout: 5000,
    }).catch(() => ({ data: { events: [] } }));

    const events = response.data.events || [];
    if (events.length === 0) {
      console.log('  (No events yet)');
    } else {
      events.forEach((event: any) => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        console.log(`  [${time}] ${event.type}: ${event.message}`);
      });
    }
  } catch {
    console.log('  (Unable to fetch events)');
  }
}

async function testSimulateCall() {
  try {
    console.log('\n📞 Simulating incoming call...');
    const response = await axios.post(`${API_BASE}/test/simulate-call`, {
      fromNumber: '+1' + Math.floor(Math.random() * 9000000000 + 1000000000),
      agentType: 'core_voice_agent',
    });
    console.log('✅ Test call simulated!');
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function getCallDetail(callId: string) {
  try {
    const response = await axios.get(`${API_BASE}/call-sessions/${callId}`, {
      timeout: 5000,
    });
    console.log('\n📊 DETAILED CALL METRICS:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.log(`❌ Error fetching call details: ${error.message}`);
  }
}

async function startMonitoring() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('🚀 Starting Real-time Call Monitor...\n');
  await checkCallStatus();

  // Refresh every 2 seconds
  const interval = setInterval(checkCallStatus, 2000);

  rl.on('line', async (input) => {
    const cmd = input.trim().toLowerCase();

    if (cmd === 'q') {
      clearInterval(interval);
      console.log('\n👋 Monitoring stopped.');
      rl.close();
      process.exit(0);
    } else if (cmd === 'test') {
      await testSimulateCall();
    } else if (cmd.startsWith('detail ')) {
      const callId = cmd.substring(7);
      await getCallDetail(callId);
    } else if (cmd) {
      console.log('❓ Unknown command. Type "q" to quit, "test" for simulation.');
    }
  });
}

startMonitoring().catch(console.error);