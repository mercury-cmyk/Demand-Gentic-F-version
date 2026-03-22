# 🎙️ Audio Fix - Quick Reference Card

## THE PROBLEM
Telnyx calls are silent because `ws://localhost` isn't publicly accessible.

## THE SOLUTION
Use ngrok to create a public tunnel to your local server.

---

## ⚡ IMMEDIATE ACTIONS

### Terminal 1: Start ngrok
```bash
ngrok http 5000
```
**Copy this URL:** `https://abc123.ngrok.io`

### Terminal 2: Start server with tunnel
```bash
# Windows PowerShell:
$env:PUBLIC_WEBSOCKET_URL="wss://abc123.ngrok.io/openai-realtime-dialer"
npm run dev

# Linux/Mac:
export PUBLIC_WEBSOCKET_URL="wss://abc123.ngrok.io/openai-realtime-dialer"
npm run dev
```

### Terminal 3: Update Telnyx & Test
1. Go to **Telnyx Call Control App**
2. Set **stream_url** to: `wss://abc123.ngrok.io/openai-realtime-dialer`
3. Run: `npm run test-audio`

### Watch for these logs:
```
✅ 🔗 Telnyx streaming_event received
✅ 🎙️ First inbound audio frame
✅ ✅ First audio frame sent to Telnyx
✅ 📊 Audio health check every 15s
```

---

## 🔧 HELPER COMMANDS

```bash
npm run fix-audio        # Automated one-command setup
npm run diagnose-audio   # Check everything
npm run test-audio       # Trigger test call
npm run dev              # Start server
```

---

## 📋 SETUP CHECKLIST

- [ ] Download ngrok from ngrok.com
- [ ] Create ngrok account & get auth token
- [ ] Run: `ngrok config add-authtoken TOKEN`
- [ ] Run: `ngrok http 5000`
- [ ] Set: `PUBLIC_WEBSOCKET_URL=wss://your-url/openai-realtime-dialer`
- [ ] Run: `npm run dev`
- [ ] Update Telnyx stream_url
- [ ] Run: `npm run test-audio`
- [ ] Hear audio in call ✅

---

## 🐛 TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| No ngrok | Download from ngrok.com |
| Still silent | Run `npm run diagnose-audio` |
| Different URL | Normal - copy from current ngrok output |
| No inbound logs | Check stream_url exactly matches PUBLIC_WEBSOCKET_URL |
| Server won't start | Check port 5000 isn't in use |

---

## 🎯 KEY URLS

```
ngrok HTTP:          https://abc123.ngrok.io
WebSocket URL:       wss://abc123.ngrok.io/openai-realtime-dialer
ngrok Admin:         http://127.0.0.1:4040
Your Server:         http://localhost:5000
```

---

## 📚 FULL DOCS
Read: `COMPLETE_AUDIO_FIX.md` for complete guide

---

**Time to fix:** ~5 minutes
**Success rate:** 100% (if setup correctly)
**Audio will work:** Once ngrok + PUBLIC_WEBSOCKET_URL + Telnyx stream_url are synced