#!/bin/bash
# Update all secrets in Google Cloud Secret Manager
# Run this from Cloud Shell or local machine with gcloud authenticated
# Usage: bash update-secrets.sh

set -e

PROJECT_ID="demandgentic"
echo "Updating secrets in project: $PROJECT_ID"

# Function to create or update a secret
update_secret() {
    local name=$1
    local value=$2
    
    # Check if secret exists
    if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
        # Secret exists, add new version
        echo "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID"
        echo "✅ Updated: $name"
    else
        # Secret doesn't exist, create it
        echo "$value" | gcloud secrets create "$name" --data-file=- --replication-policy="automatic" --project="$PROJECT_ID"
        echo "✅ Created: $name"
    fi
}

echo ""
echo "=== Database Secrets ==="
update_secret "SESSION_SECRET" "M4QVxs7zYnYVgcC2C4yZ/BQPFhhNtz0RCM24yX0IcEIFT7ED1jpo+PW8/l6UMKm/z0RpB/vJ3a/6XA0q/963YQ=="
update_secret "JWT_SECRET" "c7f8e2d9b4a1e6f3c0d5b8a2e9f4c1d7b3a6e0f5c2d8b4a1e7f3c9d6b0a5e2f8"
update_secret "PGDATABASE" "neondb"
update_secret "PGHOST" "ep-fancy-firefly-ad2awc8l.c-2.us-east-1.aws.neon.tech"
update_secret "PGPORT" "5432"
update_secret "PGUSER" "neondb_owner"
update_secret "PGPASSWORD" "npg_C6fqpmSFxvl7"
update_secret "DATABASE_URL" "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

echo ""
echo "=== AI Provider Keys ==="
update_secret "AI_INTEGRATIONS_OPENAI_API_KEY" "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"
update_secret "OPENAI_API_KEY" "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"
update_secret "OPENAI_WEBHOOK_SECRET" "whsec_oJNXLtoOVllf8PB0HAS35nh/WyUVHeOB6h3sBFv41A0="
update_secret "AI_INTEGRATIONS_GEMINI_API_KEY" "AIzaSyDUR_YL9JpSeuOroMhC1kFh7dK9g9gOubA"
update_secret "GEMINI_API_KEY" "AIzaSyDUR_YL9JpSeuOroMhC1kFh7dK9g9gOubA"
update_secret "AI_INTEGRATIONS_ANTHROPIC_API_KEY" "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"
update_secret "DEEPSEEK_API_KEY" "sk-53a80ac4e13c4795971024963551c71e"

echo ""
echo "=== Search APIs ==="
update_secret "BRAVE_SEARCH_API_KEY" "BSAYSfZDinu67gjfYb5QXPBUq6ovkcl"
update_secret "EMAIL_LIST_VERIFY_API_KEY" "uPZwYkD6wm0ZVuY6P8TILGXysc0io016"
update_secret "PSE_GOOGLE" "AIzaSyAB5HitEJckXN6ywjMpYJPa1xcOzodq63E"
update_secret "GOOGLE_SEARCH_ENGINE_ID" "b2c57fdae0c544746"
update_secret "GOOGLE_SEARCH_API_KEY" "AIzaSyAB5HitEJckXN6ywjMpYJPa1xcOzodq63E"

echo ""
echo "=== Model Configuration ==="
update_secret "ORG_INTELLIGENCE_OPENAI_MODEL" "gpt-4o"
update_secret "ORG_INTELLIGENCE_GEMINI_MODEL" "gemini-2.5-pro"
update_secret "ORG_INTELLIGENCE_CLAUDE_MODEL" "claude-3-5-sonnet-20241022"
update_secret "CONVERSATION_QUALITY_MODEL" "deepseek-chat"

echo ""
echo "=== Microsoft Auth ==="
update_secret "MICROSOFT_CLIENT_ID" "0b5fe2fe-a906-4a1a-87e9-68ed877bad71"
update_secret "MICROSOFT_CLIENT_SECRET" "scz8Q~9Zm-IGf51D0QYa58X5X3kz_xZGnBk4idgk"
update_secret "MICROSOFT_TENANT_ID" "pivotal-b2b.com"

echo ""
echo "=== Third Party APIs ==="
update_secret "COMPANIES_HOUSE_API_KEY" "59f2a5c7-dbfc-402f-8d3c-ad740a978de0"
update_secret "GOOGLE_AUTH_CLIENT_ID" "984477708301-dd2gp639f161j45fh95tefjcq8pqplkt.apps.googleusercontent.com"
update_secret "GOOGLE_CLIENT_SECRET" "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"

echo ""
echo "=== Telnyx Configuration ==="
update_secret "TELNYX_API_KEY" "KEY019CE8BEAAE6526C12370014D9A52AD2_MswSKK8vQA8K1dhEfRMZpy"
update_secret "TELNYX_CONNECTION_ID" "2845920641004078445"
update_secret "TELNYX_FROM_NUMBER" "+12094571966"
update_secret "TELNYX_WEBRTC_USERNAME" "gencred20sqoiCiQfm8IGokqswphdv6arwUzyfvhTpwd898ze"
update_secret "TELNYX_WEBRTC_PASSWORD" "b7b521510b9c4b6685e8d20dd4107cdf"
update_secret "TELNYX_CALL_CONTROL_APP_ID" "2853482451592807572"
update_secret "TELNYX_TEXML_APP_ID" "2870970047591876264"

echo ""
echo "=== Voice Provider Configuration ==="
update_secret "VOICE_PROVIDER" "google"
update_secret "GEMINI_LIVE_MODEL" "gemini-live-2.5-flash-native-audio"

echo ""
echo "=== Redis ==="
update_secret "REDIS_URL" "redis://default:ttVaOhNjFsLxPOheFUkbFgyad1DLlhdt@redis-11546.fcrce171.ap-south-1-1.ec2.redns.redis-cloud.com:11546"

echo ""
echo "=== URLs ==="
update_secret "BASE_URL" "https://demandgentic.ai"
update_secret "TELNYX_WEBHOOK_URL" "https://demandgentic.ai/api/webhooks/telnyx"
update_secret "PUBLIC_WEBSOCKET_URL" "wss://demandgentic.ai/openai-realtime-dialer"
update_secret "PUBLIC_WEBHOOK_HOST" "https://demandgentic.ai"

echo ""
echo "=== Email ==="
update_secret "MAILGUN_API_KEY" "86ffcbdf6ba18d2c58c85a651c9ee46e-ac8ca900-abca8a21"
update_secret "MAILGUN_DOMAIN" "mail.pivotal-b2b.info"

echo ""
echo "=== Google Cloud Configuration ==="
update_secret "GCS_BUCKET" "demandgentic-prod-storage-2026"
update_secret "S3_REGION" "ap-south-1"

echo ""
echo "========================================"
echo "✅ All secrets updated successfully!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Grant Cloud Run service account access to secrets:"
echo "   gcloud secrets add-iam-policy-binding SECRET_NAME \\"
echo "     --member='serviceAccount:823201449858-compute@developer.gserviceaccount.com' \\"
echo "     --role='roles/secretmanager.secretAccessor'"
echo ""
echo "2. Deploy to Cloud Run with secrets:"
echo "   gcloud run services replace cloud-run-service-with-secrets.yaml --region=us-central1"