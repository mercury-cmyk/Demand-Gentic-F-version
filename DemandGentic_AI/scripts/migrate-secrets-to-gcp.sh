#!/usr/bin/env bash
set -euo pipefail

# GCP Secret Manager Migration Script
# Automates creation of all application secrets in GCP Secret Manager
# Usage: ./scripts/migrate-secrets-to-gcp.sh [--project PROJECT_ID] [--delete]

PROJECT_ID=${1:-pivotalcrm-2026}
REGION=${2:-us-central1}
DELETE_EXISTING=${3:-false}

echo "🔐 GCP Secret Manager Migration Script"
echo "======================================"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 0: Relogin to Google Cloud
echo "🔑 Step 0: Google Cloud Authentication"
echo "---------------------------------------"
read -p "Do you want to relogin to Google Cloud? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  gcloud auth login
  gcloud auth application-default login
  echo -e "${GREEN}✓${NC} Successfully authenticated with Google Cloud"
fi

echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Helper function to create or update a secret
create_or_update_secret() {
  local secret_name=$1
  local secret_value=$2
  
  if [ -z "$secret_value" ]; then
    echo -e "${YELLOW}⚠️  Skipping $secret_name: empty value${NC}"
    return
  fi
  
  # Check if secret exists
  if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
    # Update existing secret
    echo "$secret_value" | gcloud secrets versions add "$secret_name" --data-file=- --project="$PROJECT_ID" 2>/dev/null
    echo -e "${GREEN}✓${NC} Updated secret: $secret_name"
  else
    # Create new secret
    echo "$secret_value" | gcloud secrets create "$secret_name" --data-file=- --project="$PROJECT_ID" 2>/dev/null
    echo -e "${GREEN}✓${NC} Created secret: $secret_name"
  fi
}

# Set GCP project
gcloud config set project "$PROJECT_ID"

echo ""
echo "📝 Step 1: Reading values from environment and .env file"
echo "---------------------------------------------------------"

# Load .env if it exists (but don't export, just source for reading)
if [ -f ".env" ]; then
  echo "Loading secrets from .env..."
  set -a
  source .env
  set +a
fi

# Also check for .env.production or .env.local
if [ -f ".env.production" ]; then
  set -a
  source .env.production
  set +a
fi

echo ""
echo "🔐 Step 2: Creating/Updating secrets in Secret Manager"
echo "-------------------------------------------------------"

# Critical secrets
create_or_update_secret "JWT_SECRET" "${JWT_SECRET:-}"
create_or_update_secret "SESSION_SECRET" "${SESSION_SECRET:-}"
create_or_update_secret "EMAIL_LIST_VERIFY_API_KEY" "${EMAIL_LIST_VERIFY_API_KEY:-}"
create_or_update_secret "BRAVE_SEARCH_API_KEY" "${BRAVE_SEARCH_API_KEY:-}"

# Database & Redis
create_or_update_secret "DATABASE_URL" "${DATABASE_URL:-}"
create_or_update_secret "REDIS_URL" "${REDIS_URL:-}"

# Telephony (Telnyx)
create_or_update_secret "TELNYX_API_KEY" "${TELNYX_API_KEY:-}"
create_or_update_secret "TELNYX_SIP_CONNECTION_ID" "${TELNYX_SIP_CONNECTION_ID:-}"
create_or_update_secret "TELNYX_FROM_NUMBER" "${TELNYX_FROM_NUMBER:-}"
create_or_update_secret "TELNYX_WEBHOOK_URL" "${TELNYX_WEBHOOK_URL:-}"
create_or_update_secret "TELNYX_SIP_USERNAME" "${TELNYX_SIP_USERNAME:-}"
create_or_update_secret "TELNYX_SIP_PASSWORD" "${TELNYX_SIP_PASSWORD:-}"

# AI Services
create_or_update_secret "OPENAI_API_KEY" "${OPENAI_API_KEY:-}"
create_or_update_secret "AI_INTEGRATIONS_OPENAI_BASE_URL" "${AI_INTEGRATIONS_OPENAI_BASE_URL:-}"
create_or_update_secret "AI_INTEGRATIONS_OPENAI_API_KEY" "${AI_INTEGRATIONS_OPENAI_API_KEY:-}"
create_or_update_secret "ELEVENLABS_API_KEY" "${ELEVENLABS_API_KEY:-}"
create_or_update_secret "ELEVENLABS_AGENT_ID" "${ELEVENLABS_AGENT_ID:-}"
create_or_update_secret "ELEVENLABS_PHONE_NUMBER_ID" "${ELEVENLABS_PHONE_NUMBER_ID:-}"
create_or_update_secret "ELEVENLABS_WEBHOOK_SECRET" "${ELEVENLABS_WEBHOOK_SECRET:-}"

# Email Service Providers
create_or_update_secret "SENDGRID_API_KEY" "${SENDGRID_API_KEY:-}"
create_or_update_secret "AWS_SES_ACCESS_KEY" "${AWS_SES_ACCESS_KEY:-}"
create_or_update_secret "AWS_SES_SECRET_KEY" "${AWS_SES_SECRET_KEY:-}"
create_or_update_secret "AWS_SES_REGION" "${AWS_SES_REGION:-us-east-1}"
create_or_update_secret "MAILGUN_API_KEY" "${MAILGUN_API_KEY:-}"
create_or_update_secret "MAILGUN_DOMAIN" "${MAILGUN_DOMAIN:-}"

# File Storage (S3)
create_or_update_secret "S3_ACCESS_KEY_ID" "${S3_ACCESS_KEY_ID:-}"
create_or_update_secret "S3_SECRET_ACCESS_KEY" "${S3_SECRET_ACCESS_KEY:-}"
create_or_update_secret "S3_REGION" "${S3_REGION:-us-east-1}"
create_or_update_secret "S3_ENDPOINT" "${S3_ENDPOINT:-}"
create_or_update_secret "S3_BUCKET" "${S3_BUCKET:-pivotal-crm-dev}"
create_or_update_secret "S3_PUBLIC_BASE" "${S3_PUBLIC_BASE:-}"

# Microsoft OAuth
create_or_update_secret "MICROSOFT_CLIENT_ID" "${MICROSOFT_CLIENT_ID:-}"
create_or_update_secret "MICROSOFT_CLIENT_SECRET" "${MICROSOFT_CLIENT_SECRET:-}"
create_or_update_secret "MICROSOFT_TENANT_ID" "${MICROSOFT_TENANT_ID:-common}"
create_or_update_secret "APP_BASE_URL" "${APP_BASE_URL:-}"

# Resources Centre
create_or_update_secret "RESOURCES_CENTRE_URL" "${RESOURCES_CENTRE_URL:-}"
create_or_update_secret "RESOURCES_CENTRE_API_KEY" "${RESOURCES_CENTRE_API_KEY:-}"

# App Config
create_or_update_secret "NODE_ENV" "production"
create_or_update_secret "PORT" "5000"
create_or_update_secret "DB_PASSWORD" "${DB_PASSWORD:-}"
create_or_update_secret "REDIS_PORT" "${REDIS_PORT:-6379}"

echo ""
echo "✅ Step 3: Verifying secret creation"
echo "-------------------------------------"
echo ""
echo "Created/Updated secrets in $PROJECT_ID:"
gcloud secrets list --project="$PROJECT_ID" --format="table(name,created,updated)"

echo ""
echo "🎉 Secret migration complete!"
echo ""
echo "Next steps:"
echo "  1. Verify all secrets were created: gcloud secrets list --project=$PROJECT_ID"
echo "  2. Grant Cloud Run service account access to secrets:"
echo "     gcloud projects add-iam-policy-binding $PROJECT_ID \\"
echo "       --member=serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com \\"
echo "       --role=roles/secretmanager.secretAccessor"
echo "  3. Deploy to Cloud Run with secrets injected"
echo ""