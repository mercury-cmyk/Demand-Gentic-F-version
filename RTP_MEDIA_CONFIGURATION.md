# RTP Media Handling - Configuration Guide

## Environment Variables Setup

### Quick Start Template

Create or update your `.env` file with the following variables:

```bash
# ============================================================================
# GEMINI LIVE API CONFIGURATION
# ============================================================================

# Required: Your Gemini API key from Google Cloud
# Generate at: https://aistudio.google.com/app/apikeys
GEMINI_API_KEY=your-gemini-api-key-here

# Optional: Gemini model to use
# Default: models/gemini-2.5-flash-native-audio-preview
GEMINI_MODEL=models/gemini-2.5-flash-native-audio-preview

# Optional: Voice name for Gemini responses
# Supported voices: Puck (default), Charon, Kore, Fenrir, Aoede
GEMINI_VOICE_NAME=Puck

# Required: System prompt for Gemini behavior
# This controls how the AI agent behaves in calls
GEMINI_SYSTEM_PROMPT=You are a helpful and professional sales representative. Your goal is to understand the customer's needs and provide appropriate solutions. Be concise, friendly, and professional. Ask clarifying questions when needed and maintain a natural conversational flow.

# ============================================================================
# DRACHTIO SIP SERVER CONFIGURATION
# ============================================================================

# Drachtio daemon connection
# Default: localhost
DRACHTIO_HOST=localhost

# Drachtio daemon port
# Default: 9022
DRACHTIO_PORT=9022

# Drachtio daemon authentication secret
# Default: cymru
DRACHTIO_SECRET=cymru

# SIP signaling bind address
# Default: 0.0.0.0 (all interfaces)
SIP_LISTEN_HOST=0.0.0.0

# SIP signaling listen port
# Default: 5060
SIP_LISTEN_PORT=5060

# CRITICAL: Public IP for SDP
# This IP must be reachable from SIP caller
# Required for production deployments
# Example: 203.0.113.42
PUBLIC_IP=

# ============================================================================
# RTP MEDIA PORT CONFIGURATION
# ============================================================================

# Minimum RTP port
# Default: 10000
RTP_PORT_MIN=10000

# Maximum RTP port
# Default: 20000
RTP_PORT_MAX=20000

# Notes:
# - Ports are allocated in pairs (RTP + RTCP)
# - Range size should be at least 100 pairs (for concurrent calls)
# - Current range (10000-20000) supports ~5000 concurrent calls
# - Adjust based on expected concurrent call volume

# ============================================================================
# NAT TRAVERSAL (Optional)
# ============================================================================

# STUN servers for NAT traversal discovery
# CSV list of stun: URIs
# Default: Google STUN servers
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302

# TURN servers with credentials
# JSON array of TURN server configs
# Default: empty (no TURN)
#
# Example:
# [{"urls": ["turn:turn.example.com:3478"], "username": "user", "credential": "pass"}]
TURN_SERVERS=[]

# ============================================================================
# DEBUGGING & MONITORING (Optional)
# ============================================================================

# Log level for RTP/media operations
# Options: debug, info, warn, error
# Default: info
LOG_LEVEL=info

# Enable detailed RTP packet logging
# WARNING: Very verbose! Only enable for debugging
# Default: false
DEBUG_RTP_PACKETS=false

# Enable detailed Gemini WebSocket logging
# WARNING: Very verbose! Only enable for debugging
# Default: false
DEBUG_GEMINI_WEBSOCKET=false

# Maximum concurrent calls (for planning)
# Used for monitoring, informational only
# Default: 100
MAX_CONCURRENT_CALLS=100

# ============================================================================
# OPTIONAL: CAMPAIGN CONTEXT (For AI Customization)
# ============================================================================

# Default campaign name (if not provided by caller)
DEFAULT_CAMPAIGN_NAME=Default Campaign

# Default business context for Gemini
# Influences agent behavior and responses
DEFAULT_BUSINESS_CONTEXT=Sales and customer support

# ============================================================================
# PRODUCTION RECOMMENDATIONS
# ============================================================================

# For production deployments, ensure:
# 1. PUBLIC_IP is set to your actual public IP
# 2. SIP_LISTEN_HOST is bound to specific interface (not 0.0.0.0)
# 3. Firewall rules allow UDP 5060 (SIP) and RTP_PORT_MIN-RTP_PORT_MAX
# 4. GEMINI_API_KEY is secure (use secrets management)
# 5. DRACHTIO_SECRET matches drachtio daemon config
# 6. Sufficient RTP ports allocated for expected call volume
# 7. STUN/TURN servers configured for complex NAT scenarios

# ============================================================================
# DEVELOPMENT/TESTING TEMPLATE
# ============================================================================

# Copy this template for local development:
#
# GEMINI_API_KEY=dev-key-here
# GEMINI_VOICE_NAME=Puck
# GEMINI_SYSTEM_PROMPT=You are a helpful sales assistant. Be brief and professional.
#
# DRACHTIO_HOST=localhost
# DRACHTIO_PORT=9022
# DRACHTIO_SECRET=cymru
# SIP_LISTEN_HOST=127.0.0.1
# SIP_LISTEN_PORT=5060
# PUBLIC_IP=127.0.0.1
#
# RTP_PORT_MIN=10000
# RTP_PORT_MAX=20000
#
# LOG_LEVEL=debug
```

---

## Configuration Details by Component

### Gemini API Configuration

#### `GEMINI_API_KEY`
- **Type:** String
- **Required:** Yes
- **Description:** API key for accessing Google Gemini Live
- **How to Get:**
  1. Go to https://aistudio.google.com/app/apikeys
  2. Sign in with your Google account
  3. Create a new API key
  4. Copy the key value
- **Security Note:** Never commit to git; use environment variables or secrets management

#### `GEMINI_MODEL`
- **Type:** String
- **Default:** `models/gemini-2.5-flash-native-audio-preview`
- **Description:** Model identifier for Gemini API
- **Options:**
  - `models/gemini-2.5-flash-native-audio-preview` (Recommended, latest)
  - `models/gemini-2.0-flash-native-audio` (Older but stable)
  - Others as released by Google

#### `GEMINI_VOICE_NAME`
- **Type:** String
- **Default:** `Puck`
- **Description:** Voice persona for Gemini responses
- **Available Voices:**
  - `Puck` - Friendly, enthusiastic male
  - `Charon` - Deep, mature male
  - `Kore` - Professional female
  - `Fenrir` - Bold, confident
  - `Aoede` - Warm, empathetic
- **Note:** Not all voices available on all models

#### `GEMINI_SYSTEM_PROMPT`
- **Type:** String
- **Required:** Yes
- **Description:** System instructions defining AI agent behavior
- **Best Practices:**
  - Keep under 500 characters for best performance
  - Be specific about role and goals
  - Include tone/style guidelines
  - Mention call context if available
  - Test different prompts for different campaigns
- **Examples:**
  ```
  # Sales-focused
  "You are a professional sales representative. Your goal is to understand customer needs and offer relevant solutions. Be warm, professional, and concise."
  
  # Support-focused
  "You are a helpful customer support agent. Listen carefully to customer issues and provide clear solutions. Be empathetic and patient."
  
  # Lead qualification
  "You are a lead qualification specialist. Ask about company size, industry, and current solutions to understand if this is a good fit."
  ```

### Drachtio SIP Server Configuration

#### `DRACHTIO_HOST`
- **Type:** String
- **Default:** `localhost`
- **Description:** Hostname or IP of drachtio daemon
- **Examples:**
  - Local: `localhost` or `127.0.0.1`
  - Remote: `192.168.1.50`
  - Production: `drachtio.example.com`

#### `DRACHTIO_PORT`
- **Type:** Integer
- **Default:** `9022`
- **Description:** Port for drachtio daemon command port
- **Note:** Standard drachtio command port is 9022

#### `DRACHTIO_SECRET`
- **Type:** String
- **Default:** `cymru`
- **Required:** Yes (must match daemon config)
- **Description:** Authentication secret for drachtio connection
- **Security Note:** Change from default in production

#### `SIP_LISTEN_HOST`
- **Type:** String
- **Default:** `0.0.0.0`
- **Description:** Bind address for SIP signaling
- **Options:**
  - `0.0.0.0` - All interfaces (development)
  - `127.0.0.1` - Loopback only (testing)
  - `192.168.1.50` - Specific interface (production)
- **Note:** For production, bind to specific interface, not 0.0.0.0

#### `SIP_LISTEN_PORT`
- **Type:** Integer
- **Default:** `5060`
- **Description:** Port for SIP signaling
- **Note:** Requires root on Linux to use ports <1024

#### `PUBLIC_IP`
- **Type:** String
- **Required:** Yes (for all except localhost testing)
- **Description:** Public IP address accessible from SIP callers
- **Critical:** Must be reachable from the SIP network
- **Examples:**
  - AWS EC2: Elastic IP (e.g., `203.0.113.42`)
  - GCP: External IP (e.g., `34.56.78.90`)
  - On-prem: Public IP (e.g., `203.0.113.50`)
- **Note:** This IP goes into SDP, so callers send RTP to this address

### RTP Media Configuration

#### `RTP_PORT_MIN` & `RTP_PORT_MAX`
- **Type:** Integer
- **Defaults:** `10000`, `20000`
- **Description:** Port range for RTP/RTCP media
- **Calculation:**
  - Total available ports: MAX - MIN + 1 = 10001
  - As pairs (RTP + RTCP): ~5000 concurrent calls
  - Each call uses 2 ports
- **Adjustment for Concurrency:**
  - 10 calls: 10000-10020 (20 ports)
  - 100 calls: 10000-10200 (200 ports)
  - 1000 calls: 10000-12000 (2000 ports)
- **Firewall:** Most important - UDP ports must be open

---

## Validation Checklist

Before deploying to production:

- [ ] `GEMINI_API_KEY` is valid and has quotas remaining
- [ ] `GEMINI_SYSTEM_PROMPT` is relevant to your use case
- [ ] `DRACHTIO_HOST` and `DRACHTIO_PORT` match your drachtio daemon
- [ ] `DRACHTIO_SECRET` matches daemon configuration
- [ ] `PUBLIC_IP` is correctly set and reachable
- [ ] Firewall allows UDP 5060 (SIP)
- [ ] Firewall allows UDP ports RTP_PORT_MIN:RTP_PORT_MAX
- [ ] Sufficient RTP ports for expected call volume
- [ ] All sensitive values (API keys, secrets) are not in version control
- [ ] `.env` file is in `.gitignore`
- [ ] Environment variables tested in staging first

---

## Common Issues & Solutions

### Issue: "Could not parse audio endpoint from remote SDP"
**Probable Cause:** Remote SDP malformed or missing audio section
**Solution:** 
- Verify SIP client is sending valid SDP
- Check SDP has `m=audio` line with valid IP and port
- Enable debug logging to inspect SDP

### Issue: "GEMINI_API_KEY environment variable not set"
**Solution:**
- Verify `.env` file exists with `GEMINI_API_KEY=<key>`
- Check variable is exported: `export GEMINI_API_KEY=...`
- Restart server after setting variable

### Issue: "No available RTP ports"
**Solution:**
- Increase `RTP_PORT_MAX` if concurrent calls expected to grow
- Check if old TCP connections blocking ports
- Verify firewall allows the port range
- Restart server to flush port state

### Issue: "DRACHTIO_HOST connection refused"
**Solution:**
- Verify drachtio daemon is running
- Check `DRACHTIO_HOST` and `DRACHTIO_PORT` are correct
- Ensure network connectivity to drachtio machine
- Check drachtio CLI logs: `dctl status`

### Issue: "No RTP packets received"
**Solution:**
- Verify `PUBLIC_IP` is correct and reachable
- Check firewall allows inbound UDP on `PUBLIC_IP:RTP_PORT`
- Verify SDP has correct IP and port
- Use tcpdump to inspect traffic: `sudo tcpdump -i any udp port 10000`

---

## Performance Tuning

### For Low Call Volume (<10 concurrent calls)
```bash
RTP_PORT_MIN=10000
RTP_PORT_MAX=10100
MAX_CONCURRENT_CALLS=10
```

### For Medium Call Volume (10-100 concurrent calls)
```bash
RTP_PORT_MIN=10000
RTP_PORT_MAX=10500
MAX_CONCURRENT_CALLS=100
```

### For High Call Volume (100+ concurrent calls)
```bash
RTP_PORT_MIN=10000
RTP_PORT_MAX=20000
MAX_CONCURRENT_CALLS=1000
```

---

## Example Production Configuration

```bash
# .env.production

# Gemini
GEMINI_API_KEY=AIzaSyDxxx...
GEMINI_MODEL=models/gemini-2.5-flash-native-audio-preview
GEMINI_VOICE_NAME=Puck
GEMINI_SYSTEM_PROMPT=You are a professional sales representative for DemandGentic. Help potential customers understand our AI lead qualification solution. Be professional, concise, and focus on their needs.

# Drachtio
DRACHTIO_HOST=drachtio-prod.example.com
DRACHTIO_PORT=9022
DRACHTIO_SECRET=<random-secure-secret>
SIP_LISTEN_HOST=10.0.0.20
SIP_LISTEN_PORT=5060
PUBLIC_IP=203.0.113.42

# RTP
RTP_PORT_MIN=10000
RTP_PORT_MAX=20000

# Monitoring
LOG_LEVEL=info
MAX_CONCURRENT_CALLS=500
```

---

## Environment Variable Resolution Order

The system resolves variables in this order:

1. Process environment variables (from system or .env)
2. `.env` file (if it exists and was loaded)
3. Hardcoded defaults (as shown in configuration)

Example resolution:
```bash
# System variable (highest priority)
export GEMINI_API_KEY=production-key

# .env file (next priority, if exists)
GEMINI_API_KEY=staging-key

# Code default (lowest priority)
const geminiApiKey = process.env.GEMINI_API_KEY || 'key-from-code'

# Result: production-key (from system env wins)
```

