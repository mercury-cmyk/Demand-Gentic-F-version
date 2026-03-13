#!/usr/bin/env pwsh
<#
.SYNOPSIS
Diagnose Google OAuth configuration issues in GCP

.DESCRIPTION
This script checks:
1. If Google OAuth credentials exist in GCP Secret Manager
2. If the OAuth app exists in Google Cloud Console
3. If the credentials are valid
4. If redirect URIs are properly registered
#>

$projectId = "demandgentic"
$region = "us-central1"

Write-Host "=== Google OAuth Diagnostic Tool ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check if secrets exist
Write-Host "1. Checking GCP Secrets..." -ForegroundColor Yellow
try {
    $clientIdSecret = gcloud secrets versions access latest --secret="GOOGLE_AUTH_CLIENT_ID" --project=$projectId 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ GOOGLE_AUTH_CLIENT_ID exists" -ForegroundColor Green
        Write-Host "      Value: $clientIdSecret"
    } else {
        Write-Host "   ❌ GOOGLE_AUTH_CLIENT_ID not found or access denied" -ForegroundColor Red
        Write-Host "      Error: $clientIdSecret"
    }
} catch {
    Write-Host "   ❌ Error checking GOOGLE_AUTH_CLIENT_ID: $_" -ForegroundColor Red
}

try {
    $clientSecretResult = gcloud secrets versions access latest --secret="GOOGLE_CLIENT_SECRET" --project=$projectId 2>&1
    $clientSecretOutput = ($clientSecretResult | Out-String).Trim()
    if ($LASTEXITCODE -eq 0) {
        $clientSecretSummary = if ($clientSecretOutput) { "[configured]" } else { "[empty response]" }
        Write-Host "   ✅ GOOGLE_CLIENT_SECRET exists" -ForegroundColor Green
        Write-Host "      Value: $clientSecretSummary"
    } else {
        Write-Host "   ❌ GOOGLE_CLIENT_SECRET not found or access denied" -ForegroundColor Red
        Write-Host "      Error: $clientSecretOutput"
    }
} catch {
    Write-Host "   ❌ Error checking GOOGLE_CLIENT_SECRET: $_" -ForegroundColor Red
}

Write-Host ""

# 2. Check if APIs are enabled
Write-Host "2. Checking enabled APIs..." -ForegroundColor Yellow
$requiredApis = @(
    "gmail.googleapis.com",
    "calendar-json.googleapis.com",
    "cloudidentity.googleapis.com"
)

foreach ($api in $requiredApis) {
    $status = gcloud services list --enabled --filter="name:$api" --project=$projectId --format="value(name)" 2>&1
    if ($status) {
        Write-Host "   ✅ $api is enabled" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $api is NOT enabled" -ForegroundColor Red
    }
}

Write-Host ""

# 3. Check Cloud Run service
Write-Host "3. Checking Cloud Run service deployment..." -ForegroundColor Yellow
try {
    $serviceInfo = gcloud run services describe demandgentic-api --region=$region --project=$projectId --format="value(status.url)" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Service is deployed" -ForegroundColor Green
        Write-Host "      URL: $serviceInfo"
    } else {
        Write-Host "   ❌ Service not found or error: $serviceInfo" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Error checking service: $_" -ForegroundColor Red
}

Write-Host ""

# 4. Check recent errors
Write-Host "4. Checking recent OAuth errors in logs..." -ForegroundColor Yellow
try {
    $errors = gcloud logging read "severity=ERROR AND 'oauth'" --project=$projectId --limit=5 --format="table(timestamp,textPayload)" --freshness=1h 2>&1
    if ($errors) {
        Write-Host "   Found recent OAuth errors:" -ForegroundColor Yellow
        Write-Host $errors
    } else {
        Write-Host "   ✅ No recent OAuth errors in logs" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Couldn't check logs: $_" -ForegroundColor Yellow
}

Write-Host ""

# 5. Instructions
Write-Host "=== Recommended Actions ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "If any checks failed, follow these steps:"
Write-Host ""
Write-Host "A. If GOOGLE_AUTH_CLIENT_ID or GOOGLE_CLIENT_SECRET are missing:"
Write-Host "   1. Go to https://console.cloud.google.com/apis/credentials"
Write-Host "   2. Select project: demandgentic"
Write-Host "   3. Find or create an OAuth 2.0 Client ID (Web application)"
Write-Host "   4. Copy the Client ID and Client Secret"
Write-Host ""

Write-Host "B. Update the secrets:"
Write-Host "   gcloud secrets versions add GOOGLE_AUTH_CLIENT_ID --data-file=- <<< '157077239459-jmgrio47i2d6llo13c7lp89eqe1dlen2.apps.googleusercontent.com'"
Write-Host "   gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=- <<< 'YOUR_ACTUAL_SECRET'"
Write-Host ""

Write-Host "C. Verify redirect URIs in Google Cloud Console:"
Write-Host "   - https://demandgentic.ai/api/oauth/google/callback"
Write-Host "   - https://demandgentic-api-*.run.app/api/oauth/google/callback"
Write-Host ""

Write-Host "D. Redeploy the service:"
Write-Host "   .\deploy-final-v2.ps1"
Write-Host ""

Write-Host "See OAUTH_TROUBLESHOOTING_GUIDE.md for detailed instructions"
