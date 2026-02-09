# Fix Cloud Run conflicts by removing secrets that should be environment variables

$conflicts = @(
    "GCS_BUCKET",
    "BASE_URL", 
    "TELNYX_TEXML_APP_ID",
    "VOICE_PROVIDER",
    "GEMINI_LIVE_MODEL",
    "TELNYX_WEBHOOK_URL",
    "PUBLIC_WEBSOCKET_URL", 
    "PUBLIC_WEBHOOK_HOST",
    "PUBLIC_TEXML_HOST",
    "GOOGLE_CLOUD_PROJECT",
    "GCP_PROJECT_ID",
    "GCS_PROJECT_ID",
    "USE_VERTEX_AI",
    "TELNYX_NUMBER_POOL_ENABLED",
    "VOICE_PROVIDER_FALLBACK",
    "VOICE_PROVIDER_FALLBACK_TARGET",
    "DEEPGRAM_MODEL",
    "DEEPGRAM_LANGUAGE",
    "CONVERSATION_QUALITY_MODEL",
    "OPENAI_SIP_MODEL",
    "OPENAI_SIP_VOICE",
    "OPENAI_SIP_INSTRUCTIONS",
    "OPENAI_SIP_SIDEBAND",
    "OPENAI_SIP_SIDEBAND_UPDATE",
    "OPENAI_SIP_LOG_EVENTS",
    "NODE_ENV",
    "ENABLE_LOG_STREAMING"
)

$remove_secrets = $conflicts -join ","

Write-Host " Removing conflicting secret bindings for: $remove_secrets"
Write-Host "This allows these values to be set as plain environment variables."

gcloud run services update demandgentic-api `
  --region us-central1 `
  --remove-secrets=$remove_secrets

Write-Host " Secrets removed. You can now run deploy-final-v2.ps1"
