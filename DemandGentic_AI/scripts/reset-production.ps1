# =============================================================================
# DemandGentic.ai By Pivotal B2B - Complete Production Reset Script (Windows PowerShell)
# =============================================================================
# This script will:
# 1. Delete the existing Cloud Run service
# 2. Update ALL secrets in GCP Secret Manager from env.yaml
# 3. Trigger a fresh deployment via Cloud Build
#
# IMPORTANT: Run this from the project root directory
# Usage: .\scripts\reset-production.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

# Configuration
$PROJECT_ID = if ($env:GCP_PROJECT_ID) { $env:GCP_PROJECT_ID } else { "pivotal-b2b" }
$REGION = "us-central1"
$SERVICE_NAME = "demandgentic-api"

Write-Host "=============================================" -ForegroundColor Blue
Write-Host "   DemandGentic.ai By Pivotal B2B Production Reset Script     " -ForegroundColor Blue
Write-Host "=============================================" -ForegroundColor Blue
Write-Host ""

# Check if gcloud is installed
try {
    $null = Get-Command gcloud -ErrorAction Stop
} catch {
    Write-Host "ERROR: gcloud CLI is not installed" -ForegroundColor Red
    Write-Host "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
}

Write-Host "Project: $PROJECT_ID" -ForegroundColor Yellow
Write-Host "Region: $REGION" -ForegroundColor Yellow
Write-Host "Service: $SERVICE_NAME" -ForegroundColor Yellow
Write-Host ""

# Confirm with user
$confirm = Read-Host "This will DELETE the current deployment and redeploy fresh. Continue? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Aborted."
    exit 0
}

# Function to update or create a secret
function Update-Secret {
    param (
        [string]$SecretName,
        [string]$SecretValue
    )

    # Check if secret exists (sets $LASTEXITCODE)
    gcloud secrets describe $SecretName --project=$PROJECT_ID 2>$null | Out-Null

    if ($LASTEXITCODE -eq 0) {
        # Add new version
        $SecretValue | gcloud secrets versions add $SecretName --project=$PROJECT_ID --data-file=-
        Write-Host "  Updated: $SecretName" -ForegroundColor Green
    } else {
        # Create new secret
        $SecretValue | gcloud secrets create $SecretName --project=$PROJECT_ID --replication-policy="automatic" --data-file=-
        Write-Host "  Created: $SecretName" -ForegroundColor Green
    }
}

# =============================================================================
# STEP 1: Delete existing Cloud Run service
# =============================================================================
Write-Host ""
Write-Host "[Step 1/4] Deleting existing Cloud Run service..." -ForegroundColor Blue

gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    gcloud run services delete $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --quiet
    Write-Host "Service deleted" -ForegroundColor Green
} else {
    Write-Host "Service doesn't exist, skipping deletion" -ForegroundColor Yellow
}

# =============================================================================
# STEP 2: Update ALL secrets in GCP Secret Manager
# =============================================================================
Write-Host ""
Write-Host "[Step 2/4] Updating secrets in GCP Secret Manager..." -ForegroundColor Blue

# CRITICAL TELNYX SECRETS - These fix the "invalid call control" error
Write-Host "Updating Telnyx call control secrets..." -ForegroundColor Yellow
Update-Secret "TELNYX_API_KEY" "KEY019B9E220AD4E7C897383A1910A6F795_RQx78cB0g22pI48lGY0uu2"
Update-Secret "TELNYX_CALL_CONTROL_APP_ID" "2853482451592807572"
Update-Secret "TELNYX_FROM_NUMBER" "+13023601514"
Update-Secret "TELNYX_WEBHOOK_URL" "https://demandgentic.ai/"
Update-Secret "PUBLIC_WEBSOCKET_URL" "wss://demandgentic.ai/openai-realtime-dialer"
Update-Secret "TELNYX_SIP_CONNECTION_ID" "2845920641004078445"
Update-Secret "TELNYX_SIP_USERNAME" "usermercury63270"
Update-Secret "TELNYX_SIP_PASSWORD" "Z0lra,7%r4Wn"

# REDIS - Critical for call session persistence across instances
Write-Host "Updating Redis secrets..." -ForegroundColor Yellow
Update-Secret "REDIS_URL" "redis://10.181.0.35:6379"

# Database
Write-Host "Updating database secrets..." -ForegroundColor Yellow
Update-Secret "DATABASE_URL" "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Auth & Security
Write-Host "Updating auth secrets..." -ForegroundColor Yellow
Update-Secret "JWT_SECRET" "c7f8e2d9b4a1e6f3c0d5b8a2e9f4c1d7b3a6e0f5c2d8b4a1e7f3c9d6b0a5e2f8"
Update-Secret "SESSION_SECRET" "M4QVxs7zYnYVgcC2C4yZ/BQPFhhNtz0RCM24yX0IcEIFT7ED1jpo+PW8/l6UMKm/z0RpB/vJ3a/6XA0q/963YQ=="

# AI/OpenAI
Write-Host "Updating AI integration secrets..." -ForegroundColor Yellow
Update-Secret "OPENAI_API_KEY" "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"
Update-Secret "AI_INTEGRATIONS_OPENAI_API_KEY" "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"
Update-Secret "AI_INTEGRATIONS_OPENAI_BASE_URL" "https://api.openai.com/v1"
Update-Secret "AI_INTEGRATIONS_ANTHROPIC_API_KEY" "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"
Update-Secret "AI_INTEGRATIONS_GEMINI_API_KEY" "AQ.Ab8RN6K1oAE_NMvFs5uY_WQiKnKgdMAfO1IrGn_i1AOeEq2sbg"
Update-Secret "AI_INTEGRATIONS_GEMINI_BASE_URL" "https://generativelanguage.googleapis.com"
Update-Secret "GEMINI_API_KEY" "AIzaSyB5Teiib8c_o2rzrRK_6oA4gM_NTzLTmjY"
Update-Secret "DEEPSEEK_API_KEY" "sk-c91fdfca02014defaf5e228537003685"
Update-Secret "DEEPGRAM_API_KEY" "43b56ac08b7da33bc845cc6c04a73605156e7011"

# ElevenLabs
Write-Host "Updating ElevenLabs secrets..." -ForegroundColor Yellow
Update-Secret "ELEVENLABS_API_KEY" "sk_34c843c66b432b5ab3211f8a942f008bf0a83942007aedca"
Update-Secret "ELEVENLABS_WEBHOOK_SECRET" "wsec_3924622cd8da4adcc9eaea5b8f8e4c198162d0abd0ac85a3252a1920c4d5e9da"

# Google/Microsoft
Write-Host "Updating Google/Microsoft secrets..." -ForegroundColor Yellow
Update-Secret "GOOGLE_AUTH_CLIENT_ID" "157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com"
Update-Secret "GOOGLE_CLIENT_SECRET" "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"
Update-Secret "GOOGLE_SEARCH_API_KEY" "AIzaSyD9VVc0D53e2wY24fvjgWWGC8f4j9kCFnA"
Update-Secret "GOOGLE_SEARCH_ENGINE_ID" "b2c57fdae0c544746"
Update-Secret "PSE_GOOGLE" "AIzaSyDs1dOvN8G9owfCQZ9Ypu33ZekxDPDzoCw"
Update-Secret "MICROSOFT_CLIENT_ID" "0b5fe2fe-a906-4a1a-87e9-68ed877bad71"
Update-Secret "MICROSOFT_CLIENT_SECRET" "scz8Q~9Zm-IGf51D0QYa58X5X3kz_xZGnBk4idgk"
Update-Secret "MICROSOFT_TENANT_ID" "pivotal-b2b.com"

# Other services
Write-Host "Updating other service secrets..." -ForegroundColor Yellow
Update-Secret "BRAVE_SEARCH_API_KEY" "BSAYSfZDinu67gjfYb5QXPBUq6ovkcl"
Update-Secret "EMAIL_LIST_VERIFY_API_KEY" "uPZwYkD6wm0ZVuY6P8TILGXysc0io016"
Update-Secret "COMPANIES_HOUSE_API_KEY" "59f2a5c7-dbfc-402f-8d3c-ad740a978de0"
Update-Secret "MAILGUN_API_KEY" "86ffcbdf6ba18d2c58c85a651c9ee46e-ac8ca900-abca8a21"
Update-Secret "MAILGUN_DOMAIN" "mail.pivotal-b2b.info"

# Org Intelligence
Write-Host "Updating model configuration secrets..." -ForegroundColor Yellow
Update-Secret "ORG_INTELLIGENCE_OPENAI_MODEL" "gpt-4o-mini"
Update-Secret "ORG_INTELLIGENCE_GEMINI_MODEL" "gemini-1.5-pro"
Update-Secret "ORG_INTELLIGENCE_CLAUDE_MODEL" "claude-3-5-sonnet-20241022"
Update-Secret "ORG_INTELLIGENCE_SYNTH_PROVIDER" "openai"
Update-Secret "ORG_INTELLIGENCE_SYNTH_MODEL" "gpt-4o-mini"
Update-Secret "ORG_INTELLIGENCE_OPENAI_MAX_TOKENS" "8192"
Update-Secret "ORG_INTELLIGENCE_GEMINI_MAX_OUTPUT_TOKENS" "8192"
Update-Secret "ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS" "8192"

Write-Host "All secrets updated" -ForegroundColor Green

# =============================================================================
# STEP 3: Trigger Cloud Build
# =============================================================================
Write-Host ""
Write-Host "[Step 3/4] Triggering fresh deployment via Cloud Build..." -ForegroundColor Blue

gcloud builds submit --project=$PROJECT_ID --config=cloudbuild.yaml .

Write-Host "Deployment submitted" -ForegroundColor Green

# =============================================================================
# STEP 4: Wait for deployment and verify
# =============================================================================
Write-Host ""
Write-Host "[Step 4/4] Waiting for deployment to complete..." -ForegroundColor Blue

Start-Sleep -Seconds 15

# Get service URL
$SERVICE_URL = gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format='value(status.url)' 2>$null

if (-not $SERVICE_URL) {
    Write-Host "Waiting for service to become available..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    $SERVICE_URL = gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format='value(status.url)' 2>$null
}

if ($SERVICE_URL) {
    Write-Host "Service deployed at: $SERVICE_URL" -ForegroundColor Green

    Write-Host ""
    Write-Host "Testing health endpoints..." -ForegroundColor Blue

    Write-Host "`nBasic health check:" -ForegroundColor Yellow
    Invoke-RestMethod -Uri "$SERVICE_URL/api/health" -Method Get | ConvertTo-Json -Depth 3

    Write-Host "`nCall orchestration health check:" -ForegroundColor Yellow
    Invoke-RestMethod -Uri "$SERVICE_URL/api/health/call-orchestration" -Method Get | ConvertTo-Json -Depth 5
} else {
    Write-Host "Could not get service URL. Check Cloud Console for status." -ForegroundColor Red
}

# =============================================================================
# Summary
# =============================================================================
Write-Host ""
Write-Host "=============================================" -ForegroundColor Blue
Write-Host "   Deployment Complete!                      " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Verify: curl $SERVICE_URL/api/health/call-orchestration" -ForegroundColor Yellow
Write-Host "2. Make a test call to verify Telnyx integration"
Write-Host "3. Check Redis connection in the health response"
Write-Host ""
Write-Host "If you see 'backend: redis' in the health check, call sessions will persist correctly!" -ForegroundColor Yellow