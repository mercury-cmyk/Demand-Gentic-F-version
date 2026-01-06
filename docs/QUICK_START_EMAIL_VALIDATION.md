# Quick Start: Testing Email Validation

This is a quick guide to test the API-free email validation system.

## ⚡ Quick Setup (2 minutes)

### 1. Enable SMTP Validation

Add this to your `.env` file or Replit Secrets:

```bash
SKIP_SMTP_VALIDATION=false
```

**Why?** This enables the most accurate validation by actually checking if the mail server accepts the email address.

### 2. Restart the Application

If you changed the `.env` file, restart the server:
- In Replit: Click "Stop" then "Run" 
- Locally: `npm run dev`

## 🧪 Run Quick Tests

### Option A: Using the Node.js Script (Easiest)

```bash
# 1. Get your JWT token from browser
#    Open DevTools (F12) -> Console -> Run:
#    localStorage.getItem('token')

# 2. Export your token
export AUTH_TOKEN='your-jwt-token-here'

# 3. Run the test script
node scripts/test-email-validation.js
```

### Option B: Using Bash/curl

```bash
# Set your token
export AUTH_TOKEN='your-jwt-token-here'

# Run the tests
./scripts/test-email-validation.sh
```

### Option C: Using the Web Interface

1. Log in as an **admin** user
2. Use your browser's developer tools or a REST client (like Postman)
3. Make requests to the test endpoints (see examples below)

## 📡 API Examples

### Check System Status

```bash
GET /api/test/email-validation/status
Authorization: Bearer YOUR_TOKEN
```

**What it tells you:**
- Whether SMTP validation is enabled
- DNS/SMTP timeout settings
- Domain cache statistics (how many domains are cached)

### Test a Single Email

```bash
POST /api/test/email-validation/single
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "email": "test@example.com",
  "skipCache": false
}
```

**Response:**
```json
{
  "email": "test@example.com",
  "duration": "1247ms",
  "result": {
    "status": "ok",           // ok | invalid | risky | disposable | unknown
    "confidence": 95,          // 0-100
    "summary": {
      "syntaxValid": true,     // Passed syntax check
      "hasMx": true,           // Has MX records
      "hasSmtp": true,         // SMTP server responded
      "smtpAccepted": true,    // Server accepted the address
      "isRole": false,         // Is it a role account (admin, info, etc)
      "isFree": false,         // Is it a free provider (gmail, yahoo, etc)
      "isDisposable": false    // Is it a disposable/temp email
    },
    "trace": {
      // Detailed information about each validation stage
      "syntax": { "ok": true },
      "dns": { "hasMX": true, "mxHosts": ["mx.example.com"] },
      "smtp": { "code": 250, "rcptOk": true },
      "risk": { "isRole": false, "isFree": false }
    }
  }
}
```

### Test Multiple Emails

```bash
POST /api/test/email-validation/batch
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "emails": [
    "valid@company.com",
    "invalid@fake-domain.com",
    "admin@gmail.com"
  ],
  "skipCache": false
}
```

## 📊 Understanding Results

### Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `ok` | Valid and deliverable | ✅ Safe to use |
| `risky` | Valid but has risk factors (role account, free provider) | ⚠️ Use with caution |
| `invalid` | Failed validation (bad syntax or no MX records) | ❌ Don't use |
| `disposable` | Temporary/throwaway email service | ❌ Don't use |
| `accept_all` | Server accepts everything (catch-all) | ⚠️ May or may not deliver |
| `unknown` | Validation incomplete (timeout, error) | ⚠️ Retry later |

### Confidence Scores

- **85-100**: High confidence - email is deliverable
- **70-84**: Medium-high - likely deliverable (catch-all servers)
- **40-69**: Medium - has risk factors but may work
- **0-39**: Low - likely invalid or disposable

## 🔍 Test Different Email Types

Try these test cases:

```javascript
// Valid corporate email
{ "email": "contact@microsoft.com" }         // Expected: status "ok"

// Invalid syntax
{ "email": "not-an-email" }                  // Expected: status "invalid"

// Non-existent domain
{ "email": "user@fake-domain-xyz.com" }      // Expected: status "invalid"

// Disposable email
{ "email": "temp@mailinator.com" }           // Expected: status "disposable"

// Role account (risky)
{ "email": "admin@company.com" }             // Expected: status "risky"

// Free provider
{ "email": "person@gmail.com" }              // Expected: status "ok" or "risky"
```

## ⚙️ Tuning for Accuracy vs Speed

### Maximum Accuracy (Slower)

```bash
SKIP_SMTP_VALIDATION=false
SMTP_CONNECT_TIMEOUT_MS=10000
DNS_TIMEOUT_MS=5000
```

**Result:** ~90% accuracy, ~2-3 seconds per email

### Balanced (Default)

```bash
SKIP_SMTP_VALIDATION=false
SMTP_CONNECT_TIMEOUT_MS=10000
DNS_TIMEOUT_MS=3000
```

**Result:** ~85% accuracy, ~1-2 seconds per email

### Maximum Speed (Less Accurate)

```bash
SKIP_SMTP_VALIDATION=true
DNS_TIMEOUT_MS=2000
```

**Result:** ~70% accuracy, ~0.1-0.5 seconds per email

## 🐛 Troubleshooting

### All emails return "unknown" status

**Cause:** SMTP connections are timing out or being blocked

**Fix:**
1. Check firewall settings (port 25 must be open)
2. Increase `SMTP_CONNECT_TIMEOUT_MS` to 15000
3. Or set `SKIP_SMTP_VALIDATION=true` to use DNS-only validation

### Very slow validation

**Cause:** DNS lookups are slow or SMTP probes are timing out

**Fix:**
1. Reduce `SMTP_CONNECT_TIMEOUT_MS` to 5000
2. Reduce `DNS_TIMEOUT_MS` to 2000
3. Check domain cache hit rate - should improve after first run

### "Rate limit" or "Blocked" errors

**Cause:** Email servers are blocking validation attempts

**Fix:**
1. Add delays between validations (already built-in for batch)
2. Set `SKIP_SMTP_VALIDATION=true` to avoid SMTP probing
3. Use external validation service for high-volume

## 📚 Next Steps

- Read the full guide: `docs/EMAIL_VALIDATION_TESTING.md`
- Test with real verification campaigns
- Compare results with external validators (EmailListVerify, ZeroBounce)
- Monitor domain cache performance
- Set up automated validation workflows

## 💡 Tips

1. **Domain caching** - First validation of a domain is slower (DNS lookup). Subsequent validations for the same domain are faster (cached).

2. **Batch processing** - Always use the batch endpoint for multiple emails - it's more efficient than looping single validations.

3. **Test environment** - In development/staging, some corporate firewalls may block outbound SMTP connections on port 25. This is normal.

4. **Production** - In production with proper network setup, SMTP validation should work reliably for most domains.
