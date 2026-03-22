# OpenAI SIP Setup Guide - Complete Configuration

## Your Project Information

**Project ID:** `proj_OiE21emk2lHIPaaAOKmvgBLe`

**SIP Endpoint:** `sip:proj_OiE21emk2lHIPaaAOKmvgBLe@sip.api.openai.com;transport=tls`

---

## ✅ Setup Checklist

### 1. OpenAI Platform Configuration

#### Get Your Webhook Secret

1. Go to [OpenAI Platform → Settings → Webhooks](https://platform.openai.com/settings/organization/webhooks)
2. Click **Add webhook endpoint**
3. Enter your webhook URL: `https://demangent.ai/api/openai/sip/webhook`
4. Select event: `realtime.call.incoming`
5. Copy the **Webhook Secret** (starts with `whsec_`)

#### Verify API Key

- Ensure you have your API key from [OpenAI Platform → API Keys](https://platform.openai.com/api-keys)
- Format: `sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxx`

---

### 2. Environment Variables Configuration

Add these to your `.env` file:

```bash
# ========================================
# OpenAI Realtime SIP Configuration
# ========================================

# Required - Authentication
OPENAI_API_KEY=sk-proj-YOUR_API_KEY_HERE
OPENAI_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Required - Model Configuration
OPENAI_SIP_MODEL=gpt-realtime

# Recommended - Agent Configuration
OPENAI_SIP_INSTRUCTIONS=You are a professional voice assistant representing your company.
OPENAI_SIP_VOICE=marin
OPENAI_SIP_GREETING=Hello! How can I help you today?

# Optional - Security & Cost Control
OPENAI_SIP_ALLOWED_TO=+18005551212,+14155550123
OPENAI_SIP_MAX_OUTPUT_TOKENS=512

# Optional - Sideband Control (Recommended defaults)
OPENAI_SIP_SIDEBAND=true
OPENAI_SIP_SIDEBAND_UPDATE=true
OPENAI_SIP_TOOL_CHOICE=auto
OPENAI_SIP_LOG_EVENTS=false
OPENAI_SIP_SESSION_TIMEOUT_SECONDS=900

# Optional - Virtual Agent
# OPENAI_SIP_VIRTUAL_AGENT_ID=your_agent_id_from_database
```

---

### 3. SIP Trunk Provider Configuration

Choose your provider and configure the SIP endpoint:

#### Option A: Twilio Configuration

**Using Twilio Console:**
1. Go to [Twilio Console → Elastic SIP Trunking](https://console.twilio.com/us1/develop/sip-trunking)
2. Select your SIP Trunk or create a new one
3. Go to **Termination** tab
4. Add Termination URI: `sip:proj_OiE21emk2lHIPaaAOKmvgBLe@sip.api.openai.com;transport=tls`
5. Click **Save**

**Using Twilio CLI:**
```bash
twilio api:core:sip-trunks:origination-urls:create \
  --trunk-sid YOUR_TRUNK_SID \
  --sip-url "sip:proj_OiE21emk2lHIPaaAOKmvgBLe@sip.api.openai.com;transport=tls" \
  --priority 10 \
  --weight 10 \
  --enabled true
```

#### Option B: Telnyx Configuration

1. Go to [Telnyx Portal → Voice → Connections](https://portal.telnyx.com/#/app/connections)
2. Select your SIP Connection or create a new one
3. Under **Inbound Settings**:
   - **Webhook URL:** Leave as your current webhook
4. Under **Outbound Settings**:
   - **Outbound Voice Profile:** Create new or edit existing
   - **Tech Prefix:** Leave blank
   - **Destination:** `sip.api.openai.com`
   - **Port:** `5061`
   - **Transport:** `TLS`
   - **User Portion:** `proj_OiE21emk2lHIPaaAOKmvgBLe`

**Or use Telnyx CLI:**
```bash
telnyx outbound-voice-profiles create \
  --name "OpenAI Realtime" \
  --service-address "sip:proj_OiE21emk2lHIPaaAOKmvgBLe@sip.api.openai.com:5061;transport=tls"
```

#### Option C: Bandwidth Configuration

1. Go to [Bandwidth Dashboard → Voice & Messaging → Locations](https://dashboard.bandwidth.com/)
2. Select your location
3. Under **Peer Configuration**:
   - **Host:** `sip.api.openai.com`
   - **Port:** `5061`
   - **Protocol:** `TLS`
   - **Username:** `proj_OiE21emk2lHIPaaAOKmvgBLe`
4. Save configuration

---

### 4. Webhook Registration

Your webhook endpoint is already implemented at:

**Webhook URL:** `https://demangent.ai/api/openai/sip/webhook`

**What it handles:**
- ✅ Receives `realtime.call.incoming` events
- ✅ Verifies webhook signatures with `OPENAI_WEBHOOK_SECRET`
- ✅ Accepts/rejects calls based on allowed numbers
- ✅ Opens sideband connection for server-side control
- ✅ Configures session with your instructions and voice
- ✅ Handles function calls from the agent

---

## 🧪 Testing Your Setup

### Test 1: Verify Webhook Receipt

1. Make a test call to your SIP trunk number
2. Check your server logs:

```bash
# Look for these log messages
grep "OpenAI SIP" logs/app.log

# Expected output:
# [OpenAI SIP] Webhook received from call: rtc_xxxxx
# [OpenAI SIP] Accepted call rtc_xxxxx from +1234567890
# [OpenAI SIP] Sideband connection established for call rtc_xxxxx
# [OpenAI SIP] Sent session.update for call rtc_xxxxx
# [OpenAI SIP] Sent greeting for call rtc_xxxxx
```

### Test 2: Verify Voice Agent Response

1. Call your number
2. You should hear your configured greeting
3. Try having a conversation
4. The agent should respond with the configured voice (marin)

### Test 3: Check Sideband Events

Enable event logging temporarily:

```bash
# In .env
OPENAI_SIP_LOG_EVENTS=true
```

Restart your server and make a call. You should see:
```
[OpenAI SIP] Event from rtc_xxxxx: session.created
[OpenAI SIP] Event from rtc_xxxxx: session.updated
[OpenAI SIP] Event from rtc_xxxxx: conversation.item.created
[OpenAI SIP] Event from rtc_xxxxx: response.created
[OpenAI SIP] Event from rtc_xxxxx: response.audio.delta
```

---

## 📊 Monitoring & Debugging

### Check OpenAI Usage

1. Go to [OpenAI Platform → Usage](https://platform.openai.com/usage)
2. Filter by **Realtime API**
3. You should see:
   - Audio input/output minutes
   - Text tokens used
   - Total costs per call

### Debug Webhook Issues

If webhooks aren't being received:

```bash
# Test webhook endpoint directly
curl -X POST https://demangent.ai/api/openai/sip/webhook \
  -H "Content-Type: application/json" \
  -H "webhook-id: test_123" \
  -H "webhook-timestamp: $(date +%s)" \
  -d '{
    "type": "realtime.call.incoming",
    "data": {
      "call_id": "test_call_id",
      "sip_headers": [
        {"name": "From", "value": "sip:+15551234567@sip.example.com"},
        {"name": "To", "value": "sip:+18005551212@sip.example.com"}
      ]
    }
  }'

# Expected: 400 error (signature invalid) but confirms endpoint is reachable
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "OpenAI API key not configured" | Set `OPENAI_API_KEY` in .env |
| "Invalid webhook signature" | Set `OPENAI_WEBHOOK_SECRET` in .env |
| No audio/silent call | Check SIP trunk is forwarding to correct endpoint |
| Agent not responding | Check `OPENAI_SIP_INSTRUCTIONS` and model |
| Webhook not received | Verify webhook URL in OpenAI Platform |

---

## 🔧 Advanced Configuration

### Custom Virtual Agent

To use a database-configured virtual agent:

1. Create a virtual agent in your database
2. Set its system prompt, voice, and first message
3. Add to .env: `OPENAI_SIP_VIRTUAL_AGENT_ID=your_agent_id`

### Call Filtering

Restrict incoming calls to specific numbers:

```bash
# Only accept calls to these numbers
OPENAI_SIP_ALLOWED_TO=+18005551212,+14155550123,+14155559999
```

Any calls to other numbers will be automatically rejected with status code 603.

### Function Calling

Your implementation already supports function calls! To add custom functions:

1. Edit the sideband handler in [openai-sip.ts:207-227](server/routes/openai-sip.ts#L207-L227)
2. Implement your business logic
3. Return results to the agent

Example:
```typescript
if (eventType === "response.function_call_arguments.done") {
  const functionName = payload?.name;
  const args = JSON.parse(payload?.arguments || '{}');

  // Your business logic
  let result;
  if (functionName === "check_order_status") {
    result = await checkOrderStatus(args.order_id);
  }

  // Send result back to agent
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: payload?.call_id,
      output: JSON.stringify(result)
    }
  }));
  ws.send(JSON.stringify({ type: "response.create" }));
}
```

---

## 📋 Quick Reference

### Your Credentials
```
Project ID:    proj_OiE21emk2lHIPaaAOKmvgBLe
SIP Endpoint:  sip:proj_OiE21emk2lHIPaaAOKmvgBLe@sip.api.openai.com;transport=tls
Webhook URL:   https://demangent.ai/api/openai/sip/webhook
```

### Environment Variables Checklist
- [ ] `OPENAI_API_KEY` - Your API key
- [ ] `OPENAI_WEBHOOK_SECRET` - From OpenAI Platform
- [ ] `OPENAI_SIP_MODEL` - Set to `gpt-realtime`
- [ ] `OPENAI_SIP_INSTRUCTIONS` - Your agent prompt
- [ ] `OPENAI_SIP_VOICE` - Set to `marin` (recommended)

### SIP Provider Checklist
- [ ] Termination URI configured with your Project ID
- [ ] Transport set to TLS
- [ ] Port 5061 (or 5060 for some providers)
- [ ] Test call successful

---

## 🚀 You're Ready!

Once you've:
1. ✅ Set `OPENAI_WEBHOOK_SECRET` in your .env
2. ✅ Configured your SIP trunk with the endpoint above
3. ✅ Restarted your server

You should be able to make calls and have the OpenAI voice agent handle them!

Need help? Check the logs at `/var/log/your-app.log` or enable `OPENAI_SIP_LOG_EVENTS=true` for detailed debugging.