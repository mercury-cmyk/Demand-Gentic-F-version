#!/bin/bash
# Google Cloud Run Deployment Script

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="demangent-api"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying DemanGent.ai to Google Cloud Run"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    echo "   Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Authenticate (if not already)
echo "📝 Checking authentication..."
gcloud auth print-access-token > /dev/null 2>&1 || gcloud auth login

# Set project
echo "📁 Setting project..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    secretmanager.googleapis.com \
    --quiet

# Create secrets if they don't exist
echo "🔐 Setting up secrets..."
if ! gcloud secrets describe DATABASE_URL --quiet 2>/dev/null; then
    echo "Creating DATABASE_URL secret..."
    echo -n "Enter your DATABASE_URL: "
    read -s DATABASE_URL
    echo
    echo -n "${DATABASE_URL}" | gcloud secrets create DATABASE_URL --data-file=-
fi

if ! gcloud secrets describe JWT_SECRET --quiet 2>/dev/null; then
    echo "Creating JWT_SECRET secret..."
    JWT_SECRET=$(openssl rand -base64 32)
    echo -n "${JWT_SECRET}" | gcloud secrets create JWT_SECRET --data-file=-
    echo "JWT_SECRET generated and stored."
fi

if ! gcloud secrets describe OPENAI_API_KEY --quiet 2>/dev/null; then
    echo "Creating OPENAI_API_KEY secret..."
    echo -n "Enter your OPENAI_API_KEY: "
    read -s OPENAI_API_KEY
    echo
    echo -n "${OPENAI_API_KEY}" | gcloud secrets create OPENAI_API_KEY --data-file=-
fi

# Build the image
echo "🏗️  Building Docker image..."
gcloud builds submit --tag ${IMAGE_NAME}:latest .

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME}:latest \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --port 8080 \
    --set-env-vars "NODE_ENV=production" \
    --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,SESSION_SECRET=SESSION_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,AI_INTEGRATIONS_OPENAI_API_KEY=AI_INTEGRATIONS_OPENAI_API_KEY:latest,AI_INTEGRATIONS_OPENAI_BASE_URL=AI_INTEGRATIONS_OPENAI_BASE_URL:latest,AI_INTEGRATIONS_ANTHROPIC_API_KEY=AI_INTEGRATIONS_ANTHROPIC_API_KEY:latest,AI_INTEGRATIONS_GEMINI_API_KEY=AI_INTEGRATIONS_GEMINI_API_KEY:latest,AI_INTEGRATIONS_GEMINI_BASE_URL=AI_INTEGRATIONS_GEMINI_BASE_URL:latest,BRAVE_SEARCH_API_KEY=BRAVE_SEARCH_API_KEY:latest,EMAIL_LIST_VERIFY_API_KEY=EMAIL_LIST_VERIFY_API_KEY:latest,PSE_GOOGLE=PSE_GOOGLE:latest,GOOGLE_SEARCH_ENGINE_ID=GOOGLE_SEARCH_ENGINE_ID:latest,GOOGLE_SEARCH_API_KEY=GOOGLE_SEARCH_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,MICROSOFT_CLIENT_ID=MICROSOFT_CLIENT_ID:latest,MICROSOFT_CLIENT_SECRET=MICROSOFT_CLIENT_SECRET:latest,MICROSOFT_TENANT_ID=MICROSOFT_TENANT_ID:latest,COMPANIES_HOUSE_API_KEY=COMPANIES_HOUSE_API_KEY:latest,GOOGLE_AUTH_CLIENT_ID=GOOGLE_AUTH_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,TELNYX_SIP_CONNECTION_ID=TELNYX_SIP_CONNECTION_ID:latest,TELNYX_SIP_PASSWORD=TELNYX_SIP_PASSWORD:latest,TELNYX_SIP_USERNAME=TELNYX_SIP_USERNAME:latest,TELNYX_API_KEY=TELNYX_API_KEY:latest,TELNYX_CALL_CONTROL_APP_ID=TELNYX_CALL_CONTROL_APP_ID:latest,TELNYX_FROM_NUMBER=TELNYX_FROM_NUMBER:latest,TELNYX_WEBHOOK_URL=TELNYX_WEBHOOK_URL:latest,PUBLIC_WEBSOCKET_URL=PUBLIC_WEBSOCKET_URL:latest,ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest,ELEVENLABS_WEBHOOK_SECRET=ELEVENLABS_WEBHOOK_SECRET:latest,REDIS_URL=REDIS_URL:latest,MAILGUN_API_KEY=MAILGUN_API_KEY:latest,MAILGUN_DOMAIN=MAILGUN_DOMAIN:latest,DEEPSEEK_API_KEY=DEEPSEEK_API_KEY:latest,ORG_INTELLIGENCE_OPENAI_MODEL=ORG_INTELLIGENCE_OPENAI_MODEL:latest"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo "✅ Deployment complete!"
echo "🌐 Service URL: ${SERVICE_URL}"
echo ""
echo "📋 Next steps:"
echo "   1. Update your DNS to point to this URL"
echo "   2. Set up a custom domain: gcloud run domain-mappings create --service ${SERVICE_NAME} --domain your-domain.com --region ${REGION}"
echo "   3. Configure additional environment variables as needed"
