# RTP Media Handling - Testing & Validation Guide

## Overview

This guide provides step-by-step instructions to test and validate the complete RTP media handling implementation for SIP-to-Gemini Live bridging.

## Pre-Test Checklist

Before running any tests, ensure:

- [ ] Drachtio daemon is installed and running
- [ ] Node.js and npm are installed
- [ ] All dependencies installed: `npm install`
- [ ] Environment variables configured in `.env`
- [ ] Gemini API key is valid and has sufficient quotas
- [ ] Public IP is reachable and firewall allows UDP 5060 (SIP) and RTP ports
- [ ] Git repository is clean (optional but recommended)

## Test Categories

### ⚪ Level 1: Compilation & Type Safety

**Goal:** Verify TypeScript compilation and no import/export errors

**Steps:**

1. Clean build directory:
```bash
npm run build
```

2. Check for TypeScript errors:
```bash
npx tsc --noEmit
```

3. Verify no missing exports:
```bash
grep "export.*GeminiLiveSIPProvider" server/services/gemini-live-sip-provider.ts
grep "export.*getAudioEndpoint" server/services/sip/sdp-parser.ts
```

**Success Criteria:**
- ✅ Build completes with exit code 0
- ✅ No TypeScript errors reported
- ✅ Both classes exported correctly

---

### 🟡 Level 2: Server Startup & Initialization

**Goal:** Verify server starts and connects to Drachtio daemon

**Prerequisites:**
- Drachtio daemon running on configured host:port
- `.env` file with DRACHTIO_HOST, DRACHTIO_PORT, DRACHTIO_SECRET

**Steps:**

1. Start the server with detailed logging:
```bash
npm run dev
```

2. Watch logs for connection messages:
```
[Drachtio SIP] Connected and authenticated to Drachtio daemon
[Drachtio SIP] Drachtio SIP Server initialized successfully
```

3. Verify server is listening on ports:
```bash
# Check SIP port
netstat -ano | findstr :5060

# Check RTP port range
netstat -ano | findstr LISTENING | findstr "1000[0-9]"
```

4. Test SIP OPTIONS keep-alive:
```bash
# From another machine or SIP client
# Send OPTIONS request to your public IP:5060
nslookup <your-public-ip>
```

**Success Criteria:**
- ✅ Server starts without errors
- ✅ Drachtio daemon connection established
- ✅ Server listening on SIP port
- ✅ Logs show "initialized successfully"

---

### 🟠 Level 3: SDP Parsing & RTP Port Allocation

**Goal:** Verify SDP parsing works correctly and RTP ports allocate properly

**Setup:**

Create a test script `test-sdp-parser.ts`:
```typescript
import { getAudioEndpoint, parseSDP } from './server/services/sip/sdp-parser';

// Test SDP from actual Telnyx call
const testSDP = `v=0
o=- 123456789 1 IN IP4 203.0.113.100
s=TestSession
c=IN IP4 203.0.113.100
t=0 0
m=audio 5000 RTP/AVP 0 8
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000`;

console.log('Testing SDP Parser...');
const endpoint = getAudioEndpoint(testSDP);
console.log('Parsed endpoint:', endpoint);

if (endpoint?.address === '203.0.113.100' && endpoint?.port === 5000) {
  console.log('✅ SDP parsing test PASSED');
} else {
  console.log('❌ SDP parsing test FAILED');
  process.exit(1);
}
```

**Steps:**

1. Run the test script:
```bash
npx ts-node test-sdp-parser.ts
```

2. Test RTP port manager (manually in server code):
```typescript
const manager = new RTPPortManager();
const port1 = manager.allocate();
const port2 = manager.allocate();
console.log(`Allocated ports: ${port1}, ${port2}`);
manager.release(port1);
```

**Success Criteria:**
- ✅ SDP parser correctly extracts endpoint
- ✅ RTP ports allocated in configured range
- ✅ No port conflicts on repeated allocation
- ✅ Released ports can be reallocated

---

### 🟠 Level 4: Media Provider Instantiation

**Goal:** Verify GeminiLiveSIPProvider can be created and basic operations work

**Setup:**

Create test script `test-media-provider.ts`:
```typescript
import { GeminiLiveSIPProvider } from './server/services/gemini-live-sip-provider';

const testConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || 'test-key',
  model: 'models/gemini-2.5-flash-native-audio-preview',
  voiceName: 'Puck',
  systemPrompt: 'Test prompt'
};

try {
  const provider = new GeminiLiveSIPProvider(
    'test-call-id',
    10001,
    '127.0.0.1',
    5000,
    testConfig,
    '+12125551234'
  );
  
  console.log('✅ Provider instantiated successfully');
} catch (error) {
  console.error('❌ Provider instantiation failed:', error);
  process.exit(1);
}
```

**Steps:**

1. Run test script:
```bash
npx ts-node test-media-provider.ts
```

2. Monitor logs for provider creation message

**Success Criteria:**
- ✅ Provider instantiates without errors
- ✅ Port assignment correct
- ✅ Log message shows created provider

---

### 🟢 Level 5: Full End-to-End SIP Call

**Goal:** Test complete SIP call flow with media handling

**Prerequisites:**
- SIP client installed (Zoiper, Jami, or similar)
- Server running with `npm run dev`
- Drachtio daemon running
- Network connectivity to server

**Step-by-Step:**

1. **Start Server:**
```bash
npm run dev
```

2. **Configure SIP Client:**
   - Set server: your-public-ip:5060
   - Set username/password: any value
   - Protocol: UDP (SIP)
   - Set audio codec: PCMU (G.711 ulaw)

3. **Make Test Call:**
   - In SIP client, dial: `sip:+19175556789@your-public-ip:5060`
   - Wait for 180 Ringing
   - Client should connect

4. **Monitor Server Logs:**
   ```
   [Drachtio SIP] INVITE received from...
   [Drachtio SIP] Setting up media handlers for call
   [Drachtio SIP] Remote RTP endpoint: X.X.X.X:5000
   [Gemini Live SIP Provider] Provider created: ... (RTP: 10001, Remote: X.X.X.X:5000)
   [Gemini Live SIP Provider] Starting media bridge...
   [Gemini Live SIP Provider] ✓ Gemini Live WebSocket connected
   [Drachtio SIP] ✓ Media handlers initialized
   ```

5. **Test Audio:**
   - Speak into microphone
   - Should hear Gemini response
   - Verify bidirectional audio

6. **Monitor Media Stats:**
   - RTP packets sent/received visible in logs
   - Latency should be <500ms
   - No packet loss

7. **Hangup:**
   - Click hangup in SIP client or press BYE
   - Watch logs for cleanup:
   ```
   [Drachtio SIP] BYE received for call
   [Gemini Live SIP Provider] Stopping media bridge...
   [Drachtio SIP] Media provider stopped and removed
   ```

**Success Criteria:**
- ✅ Call connects (180 Ringing → 200 OK)
- ✅ Media provider initializes
- ✅ Gemini WebSocket connects
- ✅ Audio flows bidirectionally
- ✅ Call terminates cleanly
- ✅ Resources released properly

---

### 🔴 Level 6: Error Scenarios

**Goal:** Test error handling and recovery

#### Test 6.1: Invalid GEMINI_API_KEY

1. Set invalid API key:
```bash
export GEMINI_API_KEY=invalid-key-12345
npm run dev
```

2. Make SIP call

3. **Expected Result:**
   - Call connects (SIP OK)
   - Media provider setup fails
   - Log shows: "Failed to connect to Gemini Live"
   - Call continues without Gemini responses

#### Test 6.2: Drachtio Daemon Disconnect

1. Start server (server connected to daemon)
2. Stop drachtio daemon
3. Wait 30 seconds
4. Observe in logs:
```
[Drachtio SIP] Drachtio connection closed
[Drachtio SIP] isConnected: false
```

#### Test 6.3: RTP Port Exhaustion

1. Set small RTP port range:
```bash
RTP_PORT_MIN=10000
RTP_PORT_MAX=10005  # Only 3 concurrent calls possible
```

2. Make 4 concurrent SIP calls

3. **Expected Result:**
   - First 3 calls succeed
   - 4th call fails with "No available RTP ports"

#### Test 6.4: Network Failure During Call

1. Make SIP call
2. While call active, block network:
```bash
netsh advfirewall firewall add rule name="BlockRTP" dir=out action=block protocol=UDP localport=10000-20000
```

3. **Expected Result:**
   - RTP packets cannot be sent
   - Logs show UDP send errors
   - Call continues signaling but no audio

4. **Cleanup:**
```bash
netsh advfirewall firewall delete rule name="BlockRTP"
```

---

### 🔴 Level 7: Concurrent Call Load Testing

**Goal:** Verify system handles multiple simultaneous calls

**Setup:**

Create load test script `test-concurrent-calls.sh`:
```bash
#!/bin/bash

# Configuration
SIP_SERVER="your-public-ip"
NUM_CALLS=5
CALL_DURATION=30

# Function to make a single call
make_call() {
  local call_num=$1
  echo "Starting call $call_num..."
  
  # Use SIP client or tool (example with sipp)
  # sipp -sf callscenario.xml -d $CALL_DURATION $SIP_SERVER:5060
  
  echo "Completed call $call_num"
}

# Make concurrent calls
for i in $(seq 1 $NUM_CALLS); do
  make_call $i &
done

# Wait for all calls to complete
wait

echo "All $NUM_CALLS calls completed"
```

**Alternative: Use AWS SQS or Google Cloud Tasks for distributed testing**

**Success Criteria:**
- ✅ 5+ concurrent calls establish simultaneously
- ✅ Each call has unique RTP port
- ✅ No port conflicts
- ✅ All calls handle audio independently
- ✅ Media providers track each call
- ✅ Memory usage stays reasonable
- ✅ CPU usage proportional to call count

---

## Monitoring & Diagnostics

### Real-Time Monitoring

**Watch server logs:**
```bash
npm run dev 2>&1 | tee server.log
```

**Monitor network traffic:**
```bash
# SIP traffic
tcpdump -i any -A 'udp port 5060' | head -100

# RTP traffic
tcpdump -i any -A 'udp port 10000:20000' | head -100

# All traffic
tcpdump -i any -A host your-public-ip
```

### Performance Metrics

**To track during calls:**
- **RTP packet rate:** ~50 packets/sec per direction
- **RTT to Gemini:** ~100-200ms
- **Total latency:** ~200-300ms (should be <500ms for good UX)
- **CPU per call:** ~5-10% single core
- **Memory per call:** ~2-5 MB

**Measure latency:**
```javascript
// In provider logs, measure time from
// RTP receive -> Gemini send -> RTP send
```

---

## Test Report Template

Use this template for documenting test results:

```markdown
## Test Execution Report

**Date:** YYYY-MM-DD HH:MM
**Tester:** [Name]
**Environment:** [Production/Staging/Dev]
**Build:** [Commit Hash]

### Compilation & Types
- [ ] TypeScript compilation: PASS/FAIL
- [ ] No import errors: PASS/FAIL
- [ ] All exports present: PASS/FAIL

### Server Startup
- [ ] Server starts without errors: PASS/FAIL
- [ ] Drachtio connection established: PASS/FAIL
- [ ] Listening on SIP port: PASS/FAIL

### SDP & RTP
- [ ] SDP parser extracts endpoints: PASS/FAIL
- [ ] RTP port allocation works: PASS/FAIL
- [ ] No port conflicts: PASS/FAIL

### Media Provider
- [ ] Provider instantiates: PASS/FAIL
- [ ] RTP socket binds: PASS/FAIL
- [ ] Gemini WebSocket connects: PASS/FAIL

### End-to-End Call
- [ ] SIP call connects: PASS/FAIL
- [ ] Media setup succeeds: PASS/FAIL
- [ ] Bidirectional audio works: PASS/FAIL
- [ ] Call completes cleanly: PASS/FAIL
- [ ] Resources released: PASS/FAIL

### Error Scenarios
- [ ] Invalid API key handled: PASS/FAIL
- [ ] Drachtio disconnect handled: PASS/FAIL
- [ ] Port exhaustion handled: PASS/FAIL
- [ ] Network failures handled: PASS/FAIL

### Load Testing
- [ ] 5 concurrent calls stable: PASS/FAIL
- [ ] No port conflicts under load: PASS/FAIL
- [ ] Memory usage reasonable: PASS/FAIL
- [ ] CPU usage acceptable: PASS/FAIL

### Observations & Issues
- [List any issues found]

### Fixes Needed
- [ ] Issue 1: [Description] → [Fix]
- [ ] Issue 2: [Description] → [Fix]

### Sign-Off
- [ ] All critical tests passed
- [ ] All blocking issues resolved
- [ ] Ready for deployment
```

---

## Automated Testing (Future)

### Jest Unit Tests
```typescript
describe('GeminiLiveSIPProvider', () => {
  it('should instantiate with valid config', () => {
    const provider = new GeminiLiveSIPProvider(...);
    expect(provider).toBeDefined();
  });

  it('should parse RTP packets correctly', () => {
    const rtpPacket = Buffer.from([...]);
    const payload = provider.parseRtpPacket(rtpPacket);
    expect(payload).toBeDefined();
  });

  it('should transcode G.711 to PCM', () => {
    const g711Data = Buffer.from([...]);
    const pcm = provider.transcodeG711ToPcm(g711Data);
    expect(pcm.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests with Docker
```dockerfile
FROM ubuntu:22.04

# Install Drachtio
RUN apt-get install -y drachtio-server

# Copy app code
COPY . /app

# Start Drachtio and app
CMD ["sh", "start-test.sh"]
```

---

## Known Issues & Workarounds

### Issue: "RTP packets not being received"

**Cause:** Firewall blocking UDP ports
**Workaround:**
```bash
# Windows
netsh advfirewall firewall add rule name="AllowRTP" dir=in action=allow protocol=UDP localport=10000-20000

# Linux
ufw allow 10000:20000/udp

# Check with netstat
netstat -ano | findstr LISTENING
```

### Issue: "Gemini WebSocket times out"

**Cause:** Network latency or API overload
**Workaround:**
- Increase timeout in provider (default 5s)
- Retry with exponential backoff (already implemented)
- Check Gemini API status page

### Issue: "G.711 transcoding errors"

**Cause:** Invalid audio format or corrupted packets
**Workaround:**
- Validate codec in SDP
- Add packet loss concealment
- Log problematic packets for analysis

---

## Next Steps After Testing

1. **Deploy to Staging:** Run full production-like load tests
2. **Monitor in Production:** Watch logs, metrics, and error rates
3. **Gather Real-World Data:** Analyze call quality, latency, errors
4. **Optimize:** Fine-tune configuration based on findings
5. **Document:** Update this guide with findings

