#!/bin/bash
# =============================================================================
# DemandGentic.ai - Complete Production Reset Script
# =============================================================================
# This script will:
# 1. Delete the existing Cloud Run service
# 2. Update ALL secrets in GCP Secret Manager from env.yaml
# 3. Trigger a fresh deployment via Cloud Build
#
# IMPORTANT: Run this from the project root directory
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-pivotal-b2b}"
REGION="us-central1"
SERVICE_NAME="demandgentic-api"

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}   DemandGentic.ai Production Reset Script     ${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}ERROR: gcloud CLI is not installed${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${RED}ERROR: Not authenticated with gcloud${NC}"
    echo "Run: gcloud auth login"
    exit 1
fi

echo -e "${YELLOW}Project: $PROJECT_ID${NC}"
echo -e "${YELLOW}Region: $REGION${NC}"
echo -e "${YELLOW}Service: $SERVICE_NAME${NC}"
echo ""

# Confirm with user
read -p "This will DELETE the current deployment and redeploy fresh. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# =============================================================================
# STEP 1: Delete existing Cloud Run service
# =============================================================================
echo ""
echo -e "${BLUE}[Step 1/4] Deleting existing Cloud Run service...${NC}"

if gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID &> /dev/null; then
    gcloud run services delete $SERVICE_NAME \
        --region=$REGION \
        --project=$PROJECT_ID \
        --quiet
    echo -e "${GREEN}✓ Service deleted${NC}"
else
    echo -e "${YELLOW}⚠ Service doesn't exist, skipping deletion${NC}"
fi

# =============================================================================
# STEP 2: Update ALL secrets in GCP Secret Manager
# =============================================================================
echo ""
echo -e "${BLUE}[Step 2/4] Updating secrets in GCP Secret Manager...${NC}"

# Function to update or create a secret
update_secret() {
    local secret_name=$1
    local secret_value=$2

    # Check if secret exists
    if gcloud secrets describe $secret_name --project=$PROJECT_ID &> /dev/null; then
        # Add new version
        echo -n "$secret_value" | gcloud secrets versions add $secret_name \
            --project=$PROJECT_ID \
            --data-file=-
        echo -e "  ${GREEN}✓ Updated: $secret_name${NC}"
    else
        # Create new secret
        echo -n "$secret_value" | gcloud secrets create $secret_name \
            --project=$PROJECT_ID \
            --replication-policy="automatic" \
            --data-file=-
        echo -e "  ${GREEN}✓ Created: $secret_name${NC}"
    fi
}

# Critical Telnyx/Call Control secrets - THESE ARE THE ONES CAUSING YOUR ISSUE
echo -e "${YELLOW}Updating Telnyx call control secrets...${NC}"
update_secret "TELNYX_API_KEY" "KEY019B9E220AD4E7C897383A1910A6F795_RQx78cB0g22pI48lGY0uu2"
update_secret "TELNYX_CALL_CONTROL_APP_ID" "2853482451592807572"
update_secret "TELNYX_FROM_NUMBER" "+13023601514"
update_secret "TELNYX_WEBHOOK_URL" "https://demandgentic.ai/"
update_secret "PUBLIC_WEBSOCKET_URL" "wss://demandgentic.ai/openai-realtime-dialer"
update_secret "TELNYX_SIP_CONNECTION_ID" "2845920641004078445"
update_secret "TELNYX_SIP_USERNAME" "usermercury63270"
update_secret "TELNYX_SIP_PASSWORD" "Z0lra,7%r4Wn"

# Redis - CRITICAL for call session persistence
echo -e "${YELLOW}Updating Redis secrets...${NC}"
update_secret "REDIS_URL" "redis://10.181.0.35:6379"

# Database
echo -e "${YELLOW}Updating database secrets...${NC}"
update_secret "DATABASE_URL" "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Auth & Security
echo -e "${YELLOW}Updating auth secrets...${NC}"
update_secret "JWT_SECRET" "c7f8e2d9b4a1e6f3c0d5b8a2e9f4c1d7b3a6e0f5c2d8b4a1e7f3c9d6b0a5e2f8"
update_secret "SESSION_SECRET" "M4QVxs7zYnYVgcC2C4yZ/BQPFhhNtz0RCM24yX0IcEIFT7ED1jpo+PW8/l6UMKm/z0RpB/vJ3a/6XA0q/963YQ=="

# AI/OpenAI
echo -e "${YELLOW}Updating AI integration secrets...${NC}"
update_secret "OPENAI_API_KEY" "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"
update_secret "AI_INTEGRATIONS_OPENAI_API_KEY" "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"
update_secret "AI_INTEGRATIONS_OPENAI_BASE_URL" "https://api.openai.com/v1"
update_secret "AI_INTEGRATIONS_ANTHROPIC_API_KEY" "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"
update_secret "AI_INTEGRATIONS_GEMINI_API_KEY" "AQ.Ab8RN6K1oAE_NMvFs5uY_WQiKnKgdMAfO1IrGn_i1AOeEq2sbg"
update_secret "AI_INTEGRATIONS_GEMINI_BASE_URL" "https://generativelanguage.googleapis.com"
update_secret "GEMINI_API_KEY" "AIzaSyB5Teiib8c_o2rzrRK_6oA4gM_NTzLTmjY"
update_secret "DEEPSEEK_API_KEY" "sk-c91fdfca02014defaf5e228537003685"

# ElevenLabs
echo -e "${YELLOW}Updating ElevenLabs secrets...${NC}"
update_secret "ELEVENLABS_API_KEY" "sk_34c843c66b432b5ab3211f8a942f008bf0a83942007aedca"
update_secret "ELEVENLABS_WEBHOOK_SECRET" "wsec_3924622cd8da4adcc9eaea5b8f8e4c198162d0abd0ac85a3252a1920c4d5e9da"

# Google/Microsoft
echo -e "${YELLOW}Updating Google/Microsoft secrets...${NC}"
update_secret "GOOGLE_AUTH_CLIENT_ID" "157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com"
update_secret "GOOGLE_CLIENT_SECRET" "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"
update_secret "GOOGLE_SEARCH_API_KEY" "AIzaSyD9VVc0D53e2wY24fvjgWWGC8f4j9kCFnA"
update_secret "GOOGLE_SEARCH_ENGINE_ID" "b2c57fdae0c544746"
update_secret "PSE_GOOGLE" "AIzaSyDs1dOvN8G9owfCQZ9Ypu33ZekxDPDzoCw"
update_secret "MICROSOFT_CLIENT_ID" "0b5fe2fe-a906-4a1a-87e9-68ed877bad71"
update_secret "MICROSOFT_CLIENT_SECRET" "scz8Q~9Zm-IGf51D0QYa58X5X3kz_xZGnBk4idgk"
update_secret "MICROSOFT_TENANT_ID" "pivotal-b2b.com"

# Other services
echo -e "${YELLOW}Updating other service secrets...${NC}"
update_secret "BRAVE_SEARCH_API_KEY" "BSAYSfZDinu67gjfYb5QXPBUq6ovkcl"
update_secret "EMAIL_LIST_VERIFY_API_KEY" "uPZwYkD6wm0ZVuY6P8TILGXysc0io016"
update_secret "COMPANIES_HOUSE_API_KEY" "59f2a5c7-dbfc-402f-8d3c-ad740a978de0"
update_secret "MAILGUN_API_KEY" "86ffcbdf6ba18d2c58c85a651c9ee46e-ac8ca900-abca8a21"
update_secret "MAILGUN_DOMAIN" "mail.pivotal-b2b.info"

# Org Intelligence models
echo -e "${YELLOW}Updating model configuration secrets...${NC}"
update_secret "ORG_INTELLIGENCE_OPENAI_MODEL" "gpt-4o-mini"
update_secret "ORG_INTELLIGENCE_GEMINI_MODEL" "gemini-1.5-pro"
update_secret "ORG_INTELLIGENCE_CLAUDE_MODEL" "claude-3-5-sonnet-20241022"
update_secret "ORG_INTELLIGENCE_SYNTH_PROVIDER" "openai"
update_secret "ORG_INTELLIGENCE_SYNTH_MODEL" "gpt-4o-mini"
update_secret "ORG_INTELLIGENCE_OPENAI_MAX_TOKENS" "8192"
update_secret "ORG_INTELLIGENCE_GEMINI_MAX_OUTPUT_TOKENS" "8192"
update_secret "ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS" "8192"

echo -e "${GREEN}✓ All secrets updated${NC}"

# =============================================================================
# STEP 3: Trigger Cloud Build
# =============================================================================
echo ""
echo -e "${BLUE}[Step 3/4] Triggering fresh deployment via Cloud Build...${NC}"

gcloud builds submit \
    --project=$PROJECT_ID \
    --config=cloudbuild.yaml \
    .

echo -e "${GREEN}✓ Deployment submitted${NC}"

# =============================================================================
# STEP 4: Wait for deployment and verify
# =============================================================================
echo ""
echo -e "${BLUE}[Step 4/4] Waiting for deployment to complete...${NC}"

# Wait for service to be ready
sleep 10

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(status.url)' 2>/dev/null || echo "")

if [ -z "$SERVICE_URL" ]; then
    echo -e "${YELLOW}⚠ Waiting for service to become available...${NC}"
    sleep 30
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)' 2>/dev/null || echo "")
fi

if [ -n "$SERVICE_URL" ]; then
    echo -e "${GREEN}✓ Service deployed at: $SERVICE_URL${NC}"

    # Test health endpoint
    echo ""
    echo -e "${BLUE}Testing health endpoints...${NC}"

    echo -e "\n${YELLOW}Basic health check:${NC}"
    curl -s "$SERVICE_URL/api/health" | head -20

    echo -e "\n\n${YELLOW}Call orchestration health check:${NC}"
    curl -s "$SERVICE_URL/api/health/call-orchestration" | head -40

    echo ""
else
    echo -e "${RED}⚠ Could not get service URL. Check Cloud Console for status.${NC}"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${GREEN}   Deployment Complete!                      ${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""
echo -e "Next steps:"
echo -e "1. Verify the health endpoint: ${YELLOW}curl $SERVICE_URL/api/health/call-orchestration${NC}"
echo -e "2. Make a test call to verify Telnyx integration"
echo -e "3. Check Redis connection in the health response"
echo ""
echo -e "${YELLOW}If you see 'backend: redis' in the health check, call sessions will persist correctly!${NC}"
