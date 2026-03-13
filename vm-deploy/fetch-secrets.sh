#!/bin/bash
# ============================================================
# Fetch secrets from Google Secret Manager and write .env file
# Uses the Compute Engine metadata server for authentication.
# ============================================================

set -euo pipefail

ENV_FILE="vm-deploy/.env"
PROJECT="demandgentic"

echo "Fetching OAuth token from metadata server..."
TOKEN=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    -H "Metadata-Flavor: Google" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

fetch_secret() {
    local name="$1"
    local val
    val=$(curl -sf "https://secretmanager.googleapis.com/v1/projects/$PROJECT/secrets/$name/versions/latest:access" \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null | \
        python3 -c "import sys,json,base64; d=json.load(sys.stdin); print(base64.b64decode(d['payload']['data']).decode().strip())" 2>/dev/null) || true
    echo "$val"
}

echo "Fetching secrets..."

cat > "$ENV_FILE" << 'STATIC'
# ============================================================
# DemandGentic AI — Production Environment
# Auto-generated from Google Secret Manager
# DO NOT commit this file to git
# ============================================================

# App
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
SERVICE_ROLE=all
CALL_EXECUTION_ENABLED=true
USE_SIP_CALLING=true
ENABLE_LOG_STREAMING=true
ENABLE_M365_SYNC=false
ENABLE_GMAIL_SYNC=false

# URLs
BASE_URL=https://demandgentic.ai
APP_BASE_URL=https://demandgentic.ai
VM_OPS_AGENT_URL=http://127.0.0.1:8383
OPS_HUB_DEPLOY_TARGET=vm
PUBLIC_TEXML_HOST=demandgentic.ai
PUBLIC_WEBHOOK_HOST=demandgentic.ai
PUBLIC_WEBSOCKET_URL=wss://demandgentic.ai/voice-dialer
TELNYX_WEBHOOK_URL=https://demandgentic.ai/api/webhooks/telnyx

# SIP / Media Bridge (local)
MEDIA_BRIDGE_HOST=127.0.0.1
MEDIA_BRIDGE_PORT=8090
MEDIA_BRIDGE_SECRET=bridge-secret
DRACHTIO_HOST=127.0.0.1
DRACHTIO_PORT=9022
DRACHTIO_SECRET=cymru
PUBLIC_IP=136.116.91.227

# Google Cloud
GOOGLE_CLOUD_PROJECT=demandgentic
GCP_PROJECT_ID=demandgentic
GCS_PROJECT_ID=demandgentic
GCS_BUCKET=demandgentic-prod-storage-2026
USE_VERTEX_AI=true

# Voice
VOICE_PROVIDER=openai
VOICE_PROVIDER_FALLBACK=true
VOICE_PROVIDER_FALLBACK_TARGET=google
GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio

# Telnyx
TELNYX_NUMBER_POOL_ENABLED=true
TELNYX_TEXML_APP_ID=2870970047591876264
TELNYX_SIP_CONNECTION_ID=2903106223836497802
LIVEKIT_SIP_CONNECTION_ID=2903106223836497802

# Call limits
GLOBAL_MAX_CONCURRENT_CALLS=50
MAX_CONCURRENT_CALLS=50

# Deepgram
DEEPGRAM_MODEL=nova-2-phonecall
DEEPGRAM_LANGUAGE=en-US

# AI Models
CONVERSATION_QUALITY_MODEL=deepseek-chat

# LiveKit
LIVEKIT_URL=wss://demandgentic-wmczsvyo.livekit.cloud
LIVEKIT_SIP_URI=sip:demandgentic-wmczsvyo.sip.livekit.cloud
STATIC

# Now append secrets
SECRETS=(
    DATABASE_URL JWT_SECRET SESSION_SECRET SECRET_MANAGER_MASTER_KEY
    OPENAI_API_KEY OPENAI_WEBHOOK_SECRET
    AI_INTEGRATIONS_OPENAI_API_KEY AI_INTEGRATIONS_OPENAI_BASE_URL
    AI_INTEGRATIONS_ANTHROPIC_API_KEY
    AI_INTEGRATIONS_GEMINI_API_KEY AI_INTEGRATIONS_GEMINI_BASE_URL
    GEMINI_API_KEY DEEPSEEK_API_KEY
    BRAVE_SEARCH_API_KEY EMAIL_LIST_VERIFY_API_KEY
    PSE_GOOGLE GOOGLE_SEARCH_ENGINE_ID GOOGLE_SEARCH_API_KEY
    MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET MICROSOFT_TENANT_ID
    COMPANIES_HOUSE_API_KEY
    GOOGLE_AUTH_CLIENT_ID GOOGLE_CLIENT_SECRET
    TELNYX_API_KEY TELNYX_CONNECTION_ID TELNYX_CALL_CONTROL_APP_ID
    TELNYX_FROM_NUMBER TELNYX_SIP_PASSWORD TELNYX_SIP_USERNAME
    ELEVENLABS_API_KEY ELEVENLABS_WEBHOOK_SECRET
    REDIS_URL
    MAILGUN_API_KEY MAILGUN_DOMAIN
    DEEPGRAM_API_KEY
    ORG_INTELLIGENCE_OPENAI_MODEL
    PGDATABASE PGHOST PGPORT PGUSER PGPASSWORD
    LIVEKIT_WEBHOOK_SECRET LIVEKIT_API_KEY LIVEKIT_API_SECRET
    OPS_AGENT_TOKEN
    KIMI_API_KEY KIMI_BASE_URL
)

echo "" >> "$ENV_FILE"
echo "# Secrets (from Google Secret Manager)" >> "$ENV_FILE"

for secret in "${SECRETS[@]}"; do
    val=$(fetch_secret "$secret")
    if [ -n "$val" ] && [ "$val" != "null" ]; then
        echo "$secret=$val" >> "$ENV_FILE"
        echo "  + $secret"
    else
        echo "  - $secret (not found, skipping)"
    fi
done

if ! grep -q '^OPS_AGENT_TOKEN=' "$ENV_FILE"; then
    if command -v openssl >/dev/null 2>&1; then
        GENERATED_TOKEN=$(openssl rand -hex 24)
    else
        GENERATED_TOKEN=$(python3 - <<'PY'
import secrets
print(secrets.token_hex(24))
PY
)
    fi
    echo "OPS_AGENT_TOKEN=$GENERATED_TOKEN" >> "$ENV_FILE"
    echo "  + OPS_AGENT_TOKEN (generated locally)"
fi

chmod 600 "$ENV_FILE"
echo ""
echo "Wrote $ENV_FILE ($(wc -l < "$ENV_FILE") lines)"
