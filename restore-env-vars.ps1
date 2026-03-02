# Restore missing environment variables that were stripped from secrets but not re-added
# This updates the existing revision or creates a new one with the correct env vars

$env_vars = @(
    "TELNYX_TEXML_APP_ID=2870970047591876264",
    "BASE_URL=https://demandgentic.ai",
    "PUBLIC_TEXML_HOST=demandgentic.ai",
    "TELNYX_WEBHOOK_URL=https://demandgentic.ai/api/webhooks/telnyx",
    "PUBLIC_WEBSOCKET_URL=wss://demandgentic.ai/voice-dialer",
    "PUBLIC_WEBHOOK_HOST=demandgentic.ai",
    "GCS_BUCKET=demandgentic-ai-storage",
    "S3_REGION=ap-south-1",
    "VOICE_PROVIDER=google",
    "GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio",
    "VOICE_PROVIDER_FALLBACK=true",
    "VOICE_PROVIDER_FALLBACK_TARGET=openai",
    "DEEPGRAM_MODEL=nova-2-phonecall",
    "DEEPGRAM_LANGUAGE=en-US",
    "CONVERSATION_QUALITY_MODEL=deepseek-chat",
    "NODE_ENV=production",
    "ENABLE_LOG_STREAMING=true",
    "GOOGLE_CLOUD_PROJECT=pivotalb2b-2026",
    "GCP_PROJECT_ID=pivotalb2b-2026",
    "GCS_PROJECT_ID=pivotalb2b-2026",
    "USE_VERTEX_AI=true",
    "TELNYX_NUMBER_POOL_ENABLED=true"
) -join ","

Write-Host "Restoring missing environment variables..."
gcloud run services update demandgentic-api `
  --region us-central1 `
  --set-env-vars=$env_vars

Write-Host "Environment variables updated."
