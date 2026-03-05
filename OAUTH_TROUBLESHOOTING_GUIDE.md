# OAuth "invalid_client" Troubleshooting Guide

## Error Details
- **Error**: "OAuth client was not found"
- **HTTP Status**: 401
- **Error Code**: `invalid_client`
- **User Email**: zahid.m@pivotal-b2b.com

## What This Means
Google OAuth server is rejecting the client credentials (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) sent during token exchange. This happens at step 2:
1. ✅ User gives consent at `accounts.google.com` (works)
2. ❌ App exchanges code for tokens (fails with `invalid_client`)

## Root Causes & Fixes

### 1. **Missing or Invalid Environment Variables**

**Check if variables are set:**
```bash
# On the server/container:
echo "GOOGLE_CLIENT_ID: $GOOGLE_CLIENT_ID"
echo "GOOGLE_CLIENT_SECRET: $GOOGLE_CLIENT_SECRET"
```

**If empty or wrong, update in GCP Secret Manager:**
```bash
projectId="gen-lang-client-0789558283"
region="us-central1"

# Update the secret
gcloud secrets versions add GOOGLE_AUTH_CLIENT_ID \
  --data-file=- <<< "YOUR_ACTUAL_CLIENT_ID"
  
gcloud secrets versions add GOOGLE_CLIENT_SECRET \
  --data-file=- <<< "YOUR_ACTUAL_CLIENT_SECRET"

# Redeploy to Cloud Run so it pulls new secrets
gcloud run deploy demandgentic-api \
  --project $projectId \
  --region $region \
  --set-secrets "GOOGLE_AUTH_CLIENT_ID=GOOGLE_AUTH_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest"
```

### 2. **Credentials Revoked or Project Deleted**

**Verify the Google Cloud Project still exists:**
```bash
# List your OAuth clients
gcloud iam oauth-clients list --project=gen-lang-client-0789558283

# Check if the client ID exists
# Expected: 157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com
```

**If missing, recreate the OAuth client:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project: `gen-lang-client-0789558283`
3. Navigate to: **APIs & Services** → **Credentials**
4. Click **+ Create Credentials** → **OAuth 2.0 Client ID**
5. Choose: **Web application**
6. Add Authorized redirect URIs:
   - `https://demandgentic.ai/api/oauth/google/callback`
   - `https://demandgentic-api-*.run.app/api/oauth/google/callback` (for Cloud Run)
   - `http://localhost:8080/api/oauth/google/callback` (for local dev)
7. **Download** the credentials as JSON
8. Extract `client_id` and `client_secret`

### 3. **Redirect URI Mismatch**

**Current registered redirect URI in routing:**
```typescript
// server/routes.ts line ~340
const GOOGLE_REDIRECT_URI = 
  process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 
  `${APP_BASE_URL.replace(/\/$/, "")}/api/oauth/google/callback`;
```

**Verify it matches Google Cloud Console:**
1. Go to **APIs & Services** → **Credentials**
2. Click your OAuth 2.0 Client ID
3. Check **Authorized redirect URIs** section
4. Ensure these are registered:
   - Production: `https://demandgentic.ai/api/oauth/google/callback`
   - Cloud Run: `https://demandgentic-api-XXXXX.run.app/api/oauth/google/callback`

**If not, add them:**
- Click **Edit** on the OAuth client
- Add the URIs to the **Authorized redirect URIs** list
- Click **Save**

### 4. **Required Scopes Not Enabled**

**Ensure these APIs are enabled in Google Cloud Console:**
1. **Gmail API** (for email sync)
2. **Google Calendar API** (for calendar integration)
3. **Google Drive API** (optional, for attachments)

**Enable them:**
```bash
gcloud services enable \
  gmail.googleapis.com \
  calendar-json.googleapis.com \
  --project=gen-lang-client-0789558283
```

### 5. **Secret Sync Issue (Cloud Run Only)**

**Force sync of secrets to Cloud Run:**
```bash
# Check current secret version
gcloud secrets versions list GOOGLE_AUTH_CLIENT_ID \
  --project=gen-lang-client-0789558283

# Redeploy Cloud Run to pick up latest secret versions
gcloud run deploy demandgentic-api \
  --project=gen-lang-client-0789558283 \
  --set-secrets="GOOGLE_AUTH_CLIENT_ID=GOOGLE_AUTH_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest" \
  --region=us-central1
```

## Step-by-Step Fix (Most Common)

1. **Go to Google Cloud Console**
   ```
   https://console.cloud.google.com/apis/credentials/oauthclient
   ```

2. **Click on your OAuth 2.0 Client ID** (`157077239459-...`)

3. **Copy the values:**
   - Client ID: `157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com`
   - Client Secret: (copy from page)

4. **Update GCP Secrets:**
   ```bash
   gcloud secrets versions add GOOGLE_AUTH_CLIENT_ID \
     --data-file=- <<< "157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com"

   gcloud secrets versions add GOOGLE_CLIENT_SECRET \
     --data-file=- <<< "ACTUAL_SECRET_VALUE"
   ```

5. **Redeploy your service:**
   ```bash
   ./deploy-final-v2.ps1  # or your deployment script
   ```

6. **Clear browser cache** and try again

## Verification Commands

```bash
# Test if environment variables are correct by checking the running service
gcloud run exec demandgentic-api \
  --project=gen-lang-client-0789558283 \
  -- printenv | grep GOOGLE

# Check recent errors in logs
gcloud logging read \
  "resource.type=cloud_run_revision AND 'Google OAuth' AND 'invalid_client'" \
  --project=gen-lang-client-0789558283 \
  --limit=10 \
  --format=json
```

## Common Errors & Solutions

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_client` | Bad credentials | Regenerate OAuth client in Google Cloud |
| `redirect_uri_mismatch` | Registered URI doesn't match | Add URI to authorized list in Google Cloud |
| `invalid_scope` | Scope not enabled | Enable Gmail/Calendar APIs |
| `access_denied` | User declined consent | None - user action needed |
| `invalid_grant` | Authorization code expired | User must re-authorize (>10 min timeout) |

## Code Reference

**Request being sent (from `server/routes.ts:607`):**
```typescript
async function exchangeGoogleAuthorizationCodeForTokens(code: string, codeVerifier: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,           // Must be valid
    client_secret: GOOGLE_CLIENT_SECRET,   // Must be valid
    code,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: params.toString(),
  });
}
```

If `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` are empty or wrong, Google returns 401 `invalid_client`.

## Need More Help?

1. Check Google Cloud Console logs: **Cloud Logging**
2. Enable detailed OAuth logging by setting:
   ```bash
   LOGLEVEL=debug
   ```
3. Contact Google Cloud Support for credential issues
