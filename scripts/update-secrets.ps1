# PowerShell script to update Cloud Run service with all secrets from Secret Manager
$ProjectId = "pivotalcrm-2026"
$ServiceName = "pivotalcrm-service"
$Region = "us-central1"

Write-Host "Updating Cloud Run service with secrets..."
Write-Host "Service: $ServiceName"
Write-Host "Region: $Region"
Write-Host ""

# List of all secrets to add
$secrets = @(
    "SESSION_SECRET",
    "DATABASE_URL",
    "PGDATABASE",
    "PGHOST",
    "PGPORT",
    "PGUSER",
    "PGPASSWORD",
    "BRAVE_SEARCH_API_KEY",
    "EMAIL_LIST_VERIFY_API_KEY",
    "PSE_GOOGLE",
    "GOOGLE_SEARCH_ENGINE_ID",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_TENANT_ID",
    "COMPANIES_HOUSE_API_KEY",
    "GOOGLE_AUTH_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "S3_REGION",
    "GOOGLE_SEARCH_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "TELNYX_SIP_CONNECTION_ID",
    "TELNYX_SIP_PASSWORD",
    "TELNYX_SIP_USERNAME",
    "TELNYX_API_KEY",
    "TELNYX_CALL_CONTROL_APP_ID",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_WEBHOOK_SECRET"
)

# Build the --set-secrets parameter
$existing = (& gcloud secrets list --project $ProjectId --format "value(name)") | ForEach-Object { ($_ -split "/")[-1] }
$selected = @()
foreach ($s in $secrets) {
    if ($existing -contains $s) { $selected += $s }
    else { Write-Host "Skipping missing secret: $s" }
}
$secretsParam = ($selected | ForEach-Object { "{0}={0}:latest" -f $_ }) -join ","

Write-Host "Updating service with $($selected.Count) secrets..."
Write-Host ""
Write-Host "set-secrets: $secretsParam"
Write-Host ""

# Update the service
gcloud run services update $ServiceName --region=$Region --project=$ProjectId --set-secrets=$secretsParam

if ($LASTEXITCODE -eq 0) {
    Write-Host "Service updated successfully!"
    Write-Host "Get your service URL: gcloud run services describe $ServiceName --region=$Region --format='value(status.url)'"
} else {
    Write-Host "Failed to update service"
    exit 1
}
