# Upload all .env secrets to Google Cloud Secret Manager
# Run this script once to populate all secrets

$ErrorActionPreference = "Continue"

Write-Host "Uploading secrets to Google Cloud Secret Manager..." -ForegroundColor Cyan

# Read .env file
$envContent = Get-Content .env

$secrets = @{}
foreach ($line in $envContent) {
    if ($line -match '^([A-Z_]+)=(.+)$') {
        $key = $matches[1]
        $value = $matches[2].Trim('"')
        $secrets[$key] = $value
    }
}

# List of secrets to upload (excluding DATABASE_URL, JWT_SECRET, OPENAI_API_KEY which are already handled)
$secretsToUpload = @(
    "SESSION_SECRET",
    "AI_INTEGRATIONS_OPENAI_BASE_URL",
    "AI_INTEGRATIONS_OPENAI_API_KEY",
    "BRAVE_SEARCH_API_KEY",
    "EMAIL_LIST_VERIFY_API_KEY",
    "PSE_GOOGLE",
    "GOOGLE_SEARCH_ENGINE_ID",
    "ORG_INTELLIGENCE_OPENAI_MODEL",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_TENANT_ID",
    "COMPANIES_HOUSE_API_KEY",
    "GOOGLE_AUTH_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "AI_INTEGRATIONS_GEMINI_BASE_URL",
    "AI_INTEGRATIONS_GEMINI_API_KEY",
    "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
    "S3_REGION",
    "GOOGLE_SEARCH_API_KEY",
    "GEMINI_API_KEY",
    "TELNYX_SIP_CONNECTION_ID",
    "TELNYX_SIP_PASSWORD",
    "TELNYX_SIP_USERNAME",
    "TELNYX_API_KEY",
    "TELNYX_CALL_CONTROL_APP_ID",
    "TELNYX_FROM_NUMBER",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_WEBHOOK_SECRET",
    "REDIS_URL",
    "TELNYX_WEBHOOK_URL",
    "PUBLIC_WEBSOCKET_URL",
    "MAILGUN_API_KEY",
    "MAILGUN_DOMAIN",
    "DEEPSEEK_API_KEY"
)

foreach ($secretName in $secretsToUpload) {
    if ($secrets.ContainsKey($secretName)) {
        $secretValue = $secrets[$secretName]
        
        Write-Host "Uploading $secretName..." -NoNewline
        
        # Check if secret already exists
        gcloud secrets describe $secretName --quiet 2>$null
        
        if ($LASTEXITCODE -eq 0) {
            # Secret exists, add new version
            $secretValue | gcloud secrets versions add $secretName --data-file=- 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " Updated" -ForegroundColor Green
            } else {
                Write-Host " Failed to update" -ForegroundColor Yellow
            }
        } else {
            # Secret doesn't exist, create it
            $secretValue | gcloud secrets create $secretName --data-file=- --replication-policy=automatic 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " Created" -ForegroundColor Green
            } else {
                Write-Host " Failed to create" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "WARNING: $secretName not found in .env" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Secret upload complete!" -ForegroundColor Green
Write-Host "To verify, run: gcloud secrets list" -ForegroundColor Cyan