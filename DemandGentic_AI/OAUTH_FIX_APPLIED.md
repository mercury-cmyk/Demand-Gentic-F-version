# OAuth "invalid_client" - FIX APPLIED ✅

## What Was Wrong

The OAuth error occurred because the credentials in GCP Secret Manager **didn't match any registered Google OAuth app**:

```
❌ Old (Broken) Credentials:
└─ Client ID: 823201449858-hg97q2ja40qifdj4260c602579drth59.apps.googleusercontent.com (Not properly configured)
└─ Client Secret: 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

✅ Current (Fixed) Credentials:
└─ Client ID: 157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com (Documented)
└─ Client Secret: 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 (Documented)
```

## What Was Fixed

1. ✅ Updated `GOOGLE_AUTH_CLIENT_ID` in GCP Secret Manager (version 2)
2. ✅ Updated `GOOGLE_CLIENT_SECRET` in GCP Secret Manager (version 2)

## Next Steps

### Step 1: Verify the OAuth App is Configured Correctly

Go to Google Cloud Console and verify the redirect URIs:

1. **URL**: https://console.cloud.google.com/apis/credentials
2. **Project**: `gen-lang-client-0789558283`
3. **OAuth Client**: `157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com`
4. **Check Authorized redirect URIs includes**:
   - ✅ `https://demandgentic.ai/api/oauth/google/callback`
   - ✅ `http://localhost:8080/api/oauth/google/callback` (for local dev)

**If any are missing**, click **Edit** and add them, then **Save**.

### Step 2: Redeploy the Service

The Cloud Run service needs to be redeployed to pick up the new secrets:

```bash
# Option A: Use your deployment script
.\deploy-final-v2.ps1

# Option B: Manual redeploy
gcloud run deploy demandgentic-api \
  --project=gen-lang-client-0789558283 \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/gen-lang-client-0789558283/cloud-run-source-deploy/demandgentic-api:latest \
  --set-secrets="GOOGLE_AUTH_CLIENT_ID=GOOGLE_AUTH_CLIENT_ID:2,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:2"
```

### Step 3: Test the Fix

1. **Clear your browser cache** (Ctrl+Shift+Delete or Cmd+Shift+Delete)
2. **Refresh the app**: https://demandgentic.ai
3. **Try connecting Google account again**
4. If successful, you should see a Google consent screen with the correct app name

## Verify Credentials in GCP

```bash
# Verify current secrets (post-update)
gcloud secrets versions access latest --secret="GOOGLE_AUTH_CLIENT_ID" --project=gen-lang-client-0789558283
# Expected output: 157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com

gcloud secrets versions access latest --secret="GOOGLE_CLIENT_SECRET" --project=gen-lang-client-0789558283
# Expected output: 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
```

## If it Still Doesn't Work

### Check Recent Logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND 'oauth'" \
  --project=gen-lang-client-0789558283 \
  --limit=10 \
  --format="table(timestamp,textPayload)" \
  --freshness=1h
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Still getting `invalid_client` after redeploy | 1. Clear browser cache2. Wait 5-10 mins for Cloud Run to fully redeploy3. Check that redirect URIs are registered in Google Cloud Console |
| `redirect_uri_mismatch` error | The registered redirect URI doesn't match. Check Google Cloud Console credentials and ensure all URIs are registered |
| Blank OAuth consent screen | The Google OAuth app may not have an application name set. Go to Google Cloud Console and set "App name" in the OAuth consent screen |
| 401 error immediately | GOOGLE_CLIENT_ID might be empty. Verify the secret was updated: `gcloud secrets versions access latest --secret=GOOGLE_AUTH_CLIENT_ID --project=gen-lang-client-0789558283` |

## Code Reference

The app uses these environment variables (set from GCP Secrets):

```typescript
// server/routes.ts (line ~340)
const GOOGLE_CLIENT_ID = 
  process.env.GOOGLE_CLIENT_ID ?? 
  process.env.GOOGLE_AUTH_CLIENT_ID ?? 
  process.env.GMAIL_CLIENT_ID ?? "";

const GOOGLE_CLIENT_SECRET = 
  process.env.GOOGLE_CLIENT_SECRET ?? 
  process.env.GMAIL_CLIENT_SECRET ?? "";

const GOOGLE_REDIRECT_URI = 
  process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 
  `${APP_BASE_URL.replace(/\/$/, "")}/api/oauth/google/callback`;
```

During token exchange (line ~607):
```typescript
async function exchangeGoogleAuthorizationCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: params.toString(),
  });
  // If client_id or client_secret are wrong, Google returns 401 invalid_client
}
```

## Summary

**Root Cause**: OAuth credentials in GCP didn't match any valid Google OAuth app  
**Fix Applied**: Updated secrets to use the documented credentials  
**Action Required**: Redeploy the service and verify redirect URIs in Google Cloud Console  
**Expected Outcome**: `zahid.m@pivotal-b2b.com` will be able to connect Google account without "invalid_client" error