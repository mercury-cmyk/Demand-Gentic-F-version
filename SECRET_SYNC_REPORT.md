# Environment & Secrets Synchronization Report
Generated: January 16, 2026

## 1. Local Development Configuration ✅

### Status
- **Dev Server**: Running on port 5000 (HTTP 200)
- **Health Check**: Passing at http://localhost:5000/health
- **Configuration File**: `.env.local` present and valid

### Local URLs (ngrok)
```
BASE_URL=https://steve-unbalking-guessingly.ngrok-free.dev
TELNYX_WEBHOOK_URL=https://steve-unbalking-guessingly.ngrok-free.dev/
PUBLIC_WEBSOCKET_URL=wss://steve-unbalking-guessingly.ngrok-free.dev
PUBLIC_WEBHOOK_HOST=steve-unbalking-guessingly.ngrok-free.dev
```

---

## 2. Secrets Inventory (Local → Cloud Sync Required)

### Core Database Credentials
- `PGDATABASE` = neondb
- `PGHOST` = ep-fancy-firefly-ad2awc8l.c-2.us-east-1.aws.neon.tech
- `PGPORT` = 5432
- `PGUSER` = neondb_owner
- `PGPASSWORD` = npg_C6fqpmSFxvl7 ⚠️
- `DATABASE_URL` = postgresql://neondb_owner:npg_C6fqpmSFxvl7@ep-mute-sky-ahoyd10z-pooler...

### Authentication & Session
- `SESSION_SECRET` = M4QVxs7zYnYVgcC2C4yZ/BQPFhhNtz0RCM24yX0IcEIFT7ED1jpo+PW8/l6UMKm/...
- `JWT_SECRET` = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" ⚠️ (needs evaluation)

### AI Provider APIs
- `AI_INTEGRATIONS_OPENAI_API_KEY` = sk-proj-nlW0Xt_NhzT4KC5fSyGV5-OmWYWJ...
- `OPENAI_API_KEY` = sk-proj-nlW0Xt_NhzT4KC5fSyGV5-OmWYWJ... (same as above)
- `OPENAI_WEBHOOK_SECRET` = whsec_oJNXLtoOVllf8PB0HAS35nh/WyUVHeOB6h3sBFv41A0=
- `AI_INTEGRATIONS_GEMINI_API_KEY` = AQ.Ab8RN6K1oAE_NMvFs5uY_WQiKnKgdMAfO1IrGn_i1AOeEq2sbg
- `GEMINI_API_KEY` = AIzaSyB7lfEUp1qMRhAoKtXgsuNUux5qSut8iLM
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` = sk-ant-api03-BUlHCjfQ94rfvyui_bafPoQOA93Yr_i...
- `DEEPSEEK_API_KEY` = sk-c91fdfca02014defaf5e228537003685

### Telephony (Telnyx)
- `TELNYX_API_KEY` = KEY019BAF87FBC50E72BA2631B8EFEEE182_hXPCwJyx4zFUeNxXG3bCSn
- `TELNYX_CONNECTION_ID` = 2845920641004078445
- `TELNYX_FROM_NUMBER` = +12094571966
- `TELNYX_WEBRTC_USERNAME` = gencred20sqoiCiQfm8IGokqswphdv6arwUzyfvhTpwd898ze
- `TELNYX_WEBRTC_PASSWORD` = b7b521510b9c4b6685e8d20dd4107cdf
- `TELNYX_CALL_CONTROL_APP_ID` = 2853482451592807572
- `TELNYX_TEXML_APP_ID` = 2870970047591876264

### Search & Intelligence APIs
- `BRAVE_SEARCH_API_KEY` = BSAYSfZDinu67gjfYb5QXPBUq6ovkcl
- `GOOGLE_SEARCH_API_KEY` = AIzaSyAB5HitEJckXN6ywjMpYJPa1xcOzodq63E
- `PSE_GOOGLE` = AIzaSyAB5HitEJckXN6ywjMpYJPa1xcOzodq63E (same as above)
- `GOOGLE_SEARCH_ENGINE_ID` = b2c57fdae0c544746
- `EMAIL_LIST_VERIFY_API_KEY` = uPZwYkD6wm0ZVuY6P8TILGXysc0io016
- `EMAIL_LIST_VERIFY_KEY` = uPZwYkD6wm0ZVuY6P8TILGXysc0io016 (duplicate)
- `COMPANIES_HOUSE_API_KEY` = 59f2a5c7-dbfc-402f-8d3c-ad740a978de0

### OAuth & Social
- `GOOGLE_AUTH_CLIENT_ID` = 157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com
- `GOOGLE_CLIENT_SECRET` = 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
- `MICROSOFT_CLIENT_ID` = 0b5fe2fe-a906-4a1a-87e9-68ed877bad71
- `MICROSOFT_CLIENT_SECRET` = scz8Q~9Zm-IGf51D0QYa58X5X3kz_xZGnBk4idgk
- `MICROSOFT_TENANT_ID` = pivotal-b2b.com

### Email & Messaging
- `MAILGUN_API_KEY` = 86ffcbdf6ba18d2c58c85a651c9ee46e-ac8ca900-abca8a21
- `MAILGUN_DOMAIN` = mail.pivotal-b2b.info

### Infrastructure
- `REDIS_URL` = redis://default:ttVaOhNjFsLxPOheFUkbFgyad1DLlhdt@redis-11546.fcrce171...
- `GCS_BUCKET` = demandgentic-storage

### Configuration Values
- `PORT` = 5000
- `S3_REGION` = ap-south-1
- `VOICE_PROVIDER` = openai
- `VOICE_PROVIDER_FALLBACK` = true
- `VOICE_PROVIDER_FALLBACK_TARGET` = google
- `GEMINI_LIVE_MODEL` = gemini-2.0-flash-exp
- `ORG_INTELLIGENCE_OPENAI_MODEL` = gpt-4o
- `ORG_INTELLIGENCE_GEMINI_MODEL` = gemini-2.5-pro
- `ORG_INTELLIGENCE_CLAUDE_MODEL` = claude-3-5-sonnet-20241022
- `ORG_INTELLIGENCE_SYNTH_PROVIDER` = gemini
- `ORG_INTELLIGENCE_SYNTH_MODEL` = gemini-2.5-pro

---

## 3. URL Migration Required (Cloud Only)

### Current (ngrok - Local Dev)
```
https://steve-unbalking-guessingly.ngrok-free.dev
```

### Target (Production)
```
https://demandgentic.ai
```

### Variables Requiring Update in Cloud Secrets ONLY
1. `BASE_URL`
2. `TELNYX_WEBHOOK_URL`
3. `PUBLIC_WEBSOCKET_URL`
4. `PUBLIC_WEBHOOK_HOST`

⚠️ **DO NOT change these in `.env.local`** - ngrok must remain for local dev

---

## 4. Current Cloud Configuration Status

### From `env.yaml` (GCP Environment Config)
Production URLs are already correctly configured:
```yaml
TELNYX_WEBHOOK_URL: "https://demandgentic.ai/api/webhooks/telnyx"
PUBLIC_WEBSOCKET_URL: "wss://demandgentic.ai/openai-realtime-dialer"
NODE_ENV: "production"
```

### From `cloud-run-service-with-secrets.yaml`
Static environment variables are set in Cloud Run service spec:
```yaml
- name: TELNYX_WEBHOOK_URL
  value: "https://demandgentic.ai/api/webhooks/telnyx"
- name: PUBLIC_WEBSOCKET_URL
  value: "wss://demandgentic.ai/openai-realtime-dialer"
- name: PUBLIC_WEBHOOK_HOST
  value: "demandgentic.ai"
- name: BASE_URL
  value: "https://demandgentic.ai"
```

⚠️ **Note**: Service YAML shows secrets section is incomplete (file cut off at line 51)

---

## 5. Discrepancies Detected

### Database Credentials Mismatch
**Local (.env.local)**:
- `PGPASSWORD` = npg_C6fqpmSFxvl7
- `DATABASE_URL` host = ep-mute-sky-ahoyd10z-pooler (pooled connection)

**Cloud (env.yaml)**:
- `PGPASSWORD` = npg_7sYERC3kqXcd ⚠️ DIFFERENT
- `DATABASE_URL` host = ep-mute-sky-ahoyd10z-pooler (same pooler)

**Impact**: Cloud may be using stale/different database credentials

### Telnyx Phone Number Discrepancy
**Local (.env.local)**:
- `TELNYX_FROM_NUMBER` = +12094571966

**Cloud (env.yaml)**:
- `TELNYX_FROM_NUMBER` = +13023601514 ⚠️ DIFFERENT

**Impact**: Cloud and local environments using different outbound phone numbers

### API Keys Potential Drift
**Gemini API Key**:
- Local: AIzaSyB7lfEUp1qMRhAoKtXgsuNUux5qSut8iLM
- Cloud: AIzaSyB5Teiib8c_o2rzrRK_6oA4gM_NTzLTmjY ⚠️ DIFFERENT

### JWT Secret Issue
Local has: `JWT_SECRET="node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""`
This is a **command string**, not an actual secret. Cloud has proper hash.

---

## 6. Recommended Actions

### Critical (Before Cloud Sync)
1. ❌ **Resolve Database Credential Conflict**
   - Determine which password is correct (local vs cloud)
   - Test connectivity with both credentials
   - Standardize across environments

2. ❌ **Clarify Phone Number Strategy**
   - Verify which Telnyx number should be production default
   - Update configuration accordingly

3. ❌ **Generate Actual JWT Secret Locally**
   - Execute the command to get real secret value
   - Update `.env.local` with generated hash

### Secret Manager Updates Required
Once conflicts resolved, sync these to GCP Secret Manager:

**High Priority** (Production-Critical):
- ✅ All Telnyx credentials (API key, connection ID, app IDs, WebRTC creds)
- ✅ OpenAI API key & webhook secret
- ✅ Database credentials (resolved version)
- ✅ Redis URL
- ✅ Session & JWT secrets

**Medium Priority** (Feature-Dependent):
- ✅ Gemini, Anthropic, DeepSeek API keys
- ✅ Google OAuth & Search API keys
- ✅ Mailgun credentials
- ✅ Microsoft OAuth credentials

**Lower Priority** (Optional Features):
- ✅ Brave Search API
- ✅ Email verification API
- ✅ Companies House API

### URL Updates (Cloud Secrets Only)
- `BASE_URL`: https://demandgentic.ai
- `TELNYX_WEBHOOK_URL`: https://demandgentic.ai/api/webhooks/telnyx
- `PUBLIC_WEBSOCKET_URL`: wss://demandgentic.ai/openai-realtime-dialer
- `PUBLIC_WEBHOOK_HOST`: demandgentic.ai

---

## 7. Next Steps (Requires Approval)

**SAFETY_MEMBRANE**: The following operations require explicit approval:

### Step A: Update Google Cloud Secret Manager
- Create/update ~40 secrets with values from `.env.local`
- Replace ngrok URLs with `demandgentic.ai` in cloud secrets only
- Verify IAM permissions for service account

### Step B: Deploy to Cloud Run
- Trigger deployment with updated secrets
- Verify new secret versions are mounted
- Monitor startup logs for secret loading errors

### Step C: Post-Deployment Validation
- Test webhook delivery at https://demandgentic.ai
- Validate AI call functionality
- Verify database connectivity from cloud

---

## 8. Rollback Strategy

### Secret Manager
- Keep previous secret versions enabled but inactive
- Single-command rollback: `gcloud secrets versions enable [VERSION]`

### Cloud Run
- Previous revision remains available
- Instant rollback via: `gcloud run services update-traffic --to-revisions=[PREVIOUS]=100`

---

**Status**: Validation complete. Awaiting approval for cloud operations.
