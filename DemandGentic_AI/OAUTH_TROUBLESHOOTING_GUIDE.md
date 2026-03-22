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
  --data-file=- 10 min timeout) |

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