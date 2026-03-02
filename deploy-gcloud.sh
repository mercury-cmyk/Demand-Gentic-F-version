#!/bin/bash
# Direct Google Cloud Run Deployment (bypasses GitHub Actions)
# Usage: bash deploy-gcloud.sh

set -e

# Configuration
PROJECT_ID="gen-lang-client-0789558283"
REGION="us-central1"
SERVICE_NAME="demandgentic-api"
REPOSITORY="pivotalcrm-repo"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")

echo "=========================================="
echo " Deploying DemandGentic.ai to Cloud Run"
echo "=========================================="
echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Service:  ${SERVICE_NAME}"
echo "Image:    ${IMAGE}:${TAG}"
echo "=========================================="

# Check gcloud
if ! command -v gcloud &> /dev/null; then
    echo "ERROR: gcloud CLI not installed. Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
gcloud config set project ${PROJECT_ID} --quiet

# Configure Docker auth for Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Build and push via Cloud Build (uses E2_HIGHCPU_8 machine)
echo ""
echo "[1/3] Building Docker image via Cloud Build..."
gcloud builds submit \
    --tag "${IMAGE}:${TAG}" \
    --machine-type=e2-highcpu-8 \
    --timeout=1200s \
    .

# Also tag as latest
echo ""
echo "[2/3] Tagging as latest..."
gcloud artifacts docker tags add "${IMAGE}:${TAG}" "${IMAGE}:latest" 2>/dev/null || true

# Deploy to Cloud Run
echo ""
echo "[3/3] Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image "${IMAGE}:${TAG}" \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --memory 4Gi \
    --cpu 4 \
    --min-instances 1 \
    --max-instances 50 \
    --port 8080 \
    --timeout 900 \
    --concurrency 150 \
    --cpu-boost \
    --vpc-connector pivotal-connector \
    --vpc-egress private-ranges-only \
    --set-env-vars "NODE_ENV=production,TELNYX_NUMBER_POOL_ENABLED=true,TELNYX_TEXML_APP_ID=2870970047591876264,VOICE_PROVIDER=google,VOICE_PROVIDER_FALLBACK=true,VOICE_PROVIDER_FALLBACK_TARGET=openai,GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio,USE_VERTEX_AI=true,GOOGLE_CLOUD_PROJECT=gen-lang-client-0789558283,GCP_PROJECT_ID=gen-lang-client-0789558283,GCS_PROJECT_ID=gen-lang-client-0789558283,GCS_BUCKET=demandgentic-ai-storage,BASE_URL=https://demandgentic.ai,APP_BASE_URL=https://demandgentic.ai,PUBLIC_TEXML_HOST=demandgentic.ai,DEEPGRAM_MODEL=nova-2-phonecall,DEEPGRAM_LANGUAGE=en-US,CONVERSATION_QUALITY_MODEL=deepseek-chat,CALL_EXECUTION_ENABLED=true,GLOBAL_MAX_CONCURRENT_CALLS=100,MAX_CONCURRENT_CALLS=100,ENABLE_LOG_STREAMING=true,APP_GIT_SHA=${TAG},LIVEKIT_URL=wss://demandgentic-wmczsvyo.livekit.cloud,LIVEKIT_SIP_URI=sip:demandgentic-wmczsvyo.sip.livekit.cloud,LIVEKIT_SIP_CONNECTION_ID=2903106223836497802" \
    --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,SESSION_SECRET=SESSION_SECRET:latest,SECRET_MANAGER_MASTER_KEY=SECRET_MANAGER_MASTER_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,OPENAI_WEBHOOK_SECRET=OPENAI_WEBHOOK_SECRET:latest,AI_INTEGRATIONS_OPENAI_API_KEY=AI_INTEGRATIONS_OPENAI_API_KEY:latest,AI_INTEGRATIONS_OPENAI_BASE_URL=AI_INTEGRATIONS_OPENAI_BASE_URL:latest,AI_INTEGRATIONS_ANTHROPIC_API_KEY=AI_INTEGRATIONS_ANTHROPIC_API_KEY:latest,AI_INTEGRATIONS_GEMINI_API_KEY=AI_INTEGRATIONS_GEMINI_API_KEY:latest,AI_INTEGRATIONS_GEMINI_BASE_URL=AI_INTEGRATIONS_GEMINI_BASE_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,DEEPSEEK_API_KEY=DEEPSEEK_API_KEY:latest,BRAVE_SEARCH_API_KEY=BRAVE_SEARCH_API_KEY:latest,EMAIL_LIST_VERIFY_API_KEY=EMAIL_LIST_VERIFY_API_KEY:latest,PSE_GOOGLE=PSE_GOOGLE:latest,GOOGLE_SEARCH_ENGINE_ID=GOOGLE_SEARCH_ENGINE_ID:latest,GOOGLE_SEARCH_API_KEY=GOOGLE_SEARCH_API_KEY:latest,MICROSOFT_CLIENT_ID=MICROSOFT_CLIENT_ID:latest,MICROSOFT_CLIENT_SECRET=MICROSOFT_CLIENT_SECRET:latest,MICROSOFT_TENANT_ID=MICROSOFT_TENANT_ID:latest,COMPANIES_HOUSE_API_KEY=COMPANIES_HOUSE_API_KEY:latest,GOOGLE_AUTH_CLIENT_ID=GOOGLE_AUTH_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,TELNYX_API_KEY=TELNYX_API_KEY:latest,TELNYX_CONNECTION_ID=TELNYX_CONNECTION_ID:latest,TELNYX_CALL_CONTROL_APP_ID=TELNYX_CALL_CONTROL_APP_ID:latest,TELNYX_FROM_NUMBER=TELNYX_FROM_NUMBER:latest,TELNYX_SIP_CONNECTION_ID=TELNYX_SIP_CONNECTION_ID:latest,TELNYX_SIP_PASSWORD=TELNYX_SIP_PASSWORD:latest,TELNYX_SIP_USERNAME=TELNYX_SIP_USERNAME:latest,TELNYX_WEBHOOK_URL=TELNYX_WEBHOOK_URL:latest,PUBLIC_WEBSOCKET_URL=PUBLIC_WEBSOCKET_URL:latest,PUBLIC_WEBHOOK_HOST=PUBLIC_WEBHOOK_HOST:latest,ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest,ELEVENLABS_WEBHOOK_SECRET=ELEVENLABS_WEBHOOK_SECRET:latest,REDIS_URL=REDIS_URL:latest,MAILGUN_API_KEY=MAILGUN_API_KEY:latest,MAILGUN_DOMAIN=MAILGUN_DOMAIN:latest,DEEPGRAM_API_KEY=DEEPGRAM_API_KEY:latest,ORG_INTELLIGENCE_OPENAI_MODEL=ORG_INTELLIGENCE_OPENAI_MODEL:latest,PGDATABASE=PGDATABASE:latest,PGHOST=PGHOST:latest,PGPORT=PGPORT:latest,PGUSER=PGUSER:latest,PGPASSWORD=PGPASSWORD:latest,LIVEKIT_WEBHOOK_SECRET=LIVEKIT_WEBHOOK_SECRET:latest,LIVEKIT_API_KEY=LIVEKIT_API_KEY:latest,LIVEKIT_API_SECRET=LIVEKIT_API_SECRET:latest,LIVEKIT_SIP_USERNAME=LIVEKIT_SIP_USERNAME:latest,LIVEKIT_SIP_PASSWORD=LIVEKIT_SIP_PASSWORD:latest"

# Verify
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo "=========================================="
echo " Deployment complete!"
echo "=========================================="
echo "Service URL: ${SERVICE_URL}"
echo ""
echo "Health check:"
echo "  curl -s ${SERVICE_URL}/api/health | head -c 200"
echo ""
