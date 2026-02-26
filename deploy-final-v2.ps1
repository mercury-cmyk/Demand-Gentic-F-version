# ============================================
# DemandGentic AI - Cloud Run Deployment Script
# Syncs ALL .env secrets and env vars to production
# ============================================

# Step 1: Remove old secret bindings that are now plain env vars
# Cloud Run doesn't allow changing a var from secret to env var in one step
Write-Host "============================================"
Write-Host "Step 1: Clearing old secret bindings..."
Write-Host "============================================"

# These vars were previously set as --set-secrets but should be plain env vars now
$old_secret_vars = @(
    "GCS_BUCKET",
    "S3_REGION",
    "VOICE_PROVIDER",
    "GEMINI_LIVE_MODEL",
    "BASE_URL",
    "TELNYX_WEBHOOK_URL",
    "TELNYX_TEXML_APP_ID",
    "GOOGLE_CLOUD_PROJECT",
    "GCP_PROJECT_ID",
    "GCS_PROJECT_ID",
    "USE_VERTEX_AI",
    "TELNYX_NUMBER_POOL_ENABLED",
    "VOICE_PROVIDER_FALLBACK",
    "DEEPGRAM_MODEL",
    "DEEPGRAM_LANGUAGE",
    "CONVERSATION_QUALITY_MODEL",
    "VOICE_PROVIDER_FALLBACK_TARGET",
    "PUBLIC_TEXML_HOST"
)

$remove_secrets = ($old_secret_vars | ForEach-Object { $_ }) -join ","

gcloud run services update demandgentic-api `
  --region us-central1 `
  --remove-secrets=$remove_secrets 2>$null

Write-Host "Old secret bindings cleared (or already absent).`n"

# Step 2: Deploy with correct configuration
# Secrets from GCP Secret Manager (sensitive values)
$secrets = @(
    # Auth & Session
    "SESSION_SECRET=SESSION_SECRET:latest",
    "JWT_SECRET=JWT_SECRET:latest",
    "SECRET_MANAGER_MASTER_KEY=SECRET_MANAGER_MASTER_KEY:latest",

    # Database
    "PGDATABASE=PGDATABASE:latest",
    "PGHOST=PGHOST:latest",
    "PGPORT=PGPORT:latest",
    "PGUSER=PGUSER:latest",
    "PGPASSWORD=PGPASSWORD:latest",
    "DATABASE_URL=DATABASE_URL:latest",

    # AI Providers
    "AI_INTEGRATIONS_OPENAI_API_KEY=AI_INTEGRATIONS_OPENAI_API_KEY:latest",
    "AI_INTEGRATIONS_OPENAI_BASE_URL=AI_INTEGRATIONS_OPENAI_BASE_URL:latest",
    "OPENAI_API_KEY=OPENAI_API_KEY:latest",
    "OPENAI_WEBHOOK_SECRET=OPENAI_WEBHOOK_SECRET:latest",
    "AI_INTEGRATIONS_GEMINI_API_KEY=AI_INTEGRATIONS_GEMINI_API_KEY:latest",
    "AI_INTEGRATIONS_GEMINI_BASE_URL=AI_INTEGRATIONS_GEMINI_BASE_URL:latest",
    "GEMINI_API_KEY=GEMINI_API_KEY:latest",
    "AI_INTEGRATIONS_ANTHROPIC_API_KEY=AI_INTEGRATIONS_ANTHROPIC_API_KEY:latest",
    "DEEPSEEK_API_KEY=DEEPSEEK_API_KEY:latest",

    # Telnyx Telephony
    "TELNYX_API_KEY=TELNYX_API_KEY:latest",
    "TELNYX_CONNECTION_ID=TELNYX_CONNECTION_ID:latest",
    "TELNYX_FROM_NUMBER=TELNYX_FROM_NUMBER:latest",
    "TELNYX_CALL_CONTROL_APP_ID=TELNYX_CALL_CONTROL_APP_ID:latest",
    "TELNYX_SIP_USERNAME=TELNYX_SIP_USERNAME:latest",
    "TELNYX_SIP_PASSWORD=TELNYX_SIP_PASSWORD:latest",
    "TELNYX_SIP_CONNECTION_ID=TELNYX_SIP_CONNECTION_ID:latest",
    "TELNYX_WEBRTC_USERNAME=TELNYX_WEBRTC_USERNAME:latest",
    "TELNYX_WEBRTC_PASSWORD=TELNYX_WEBRTC_PASSWORD:latest",

    # Search & Intelligence
    "BRAVE_SEARCH_API_KEY=BRAVE_SEARCH_API_KEY:latest",
    "GOOGLE_SEARCH_API_KEY=GOOGLE_SEARCH_API_KEY:latest",
    "GOOGLE_SEARCH_ENGINE_ID=GOOGLE_SEARCH_ENGINE_ID:latest",
    "PSE_GOOGLE=PSE_GOOGLE:latest",
    "EMAIL_LIST_VERIFY_API_KEY=EMAIL_LIST_VERIFY_API_KEY:latest",
    "COMPANIES_HOUSE_API_KEY=COMPANIES_HOUSE_API_KEY:latest",

    # OAuth
    "GOOGLE_AUTH_CLIENT_ID=GOOGLE_AUTH_CLIENT_ID:latest",
    "GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest",
    "MICROSOFT_CLIENT_ID=MICROSOFT_CLIENT_ID:latest",
    "MICROSOFT_CLIENT_SECRET=MICROSOFT_CLIENT_SECRET:latest",
    "MICROSOFT_TENANT_ID=MICROSOFT_TENANT_ID:latest",

    # Email
    "MAILGUN_API_KEY=MAILGUN_API_KEY:latest",
    "MAILGUN_DOMAIN=MAILGUN_DOMAIN:latest",

    # LiveKit Webhooks
    "LIVEKIT_WEBHOOK_SECRET=LIVEKIT_WEBHOOK_SECRET:latest",

    # Infrastructure
    "REDIS_URL=REDIS_URL:latest",

    # Transcription
    "DEEPGRAM_API_KEY=DEEPGRAM_API_KEY:latest",

    # Production URLs (from Secrets)
    "PUBLIC_WEBSOCKET_URL=PUBLIC_WEBSOCKET_URL:latest",
    "PUBLIC_WEBHOOK_HOST=PUBLIC_WEBHOOK_HOST:latest",

    # Org Intelligence Models (stored as secrets for flexibility)
    "ORG_INTELLIGENCE_OPENAI_MODEL=ORG_INTELLIGENCE_OPENAI_MODEL:latest",
    "ORG_INTELLIGENCE_GEMINI_MODEL=ORG_INTELLIGENCE_GEMINI_MODEL:latest",
    "ORG_INTELLIGENCE_CLAUDE_MODEL=ORG_INTELLIGENCE_CLAUDE_MODEL:latest",
    "ORG_INTELLIGENCE_SYNTH_PROVIDER=ORG_INTELLIGENCE_SYNTH_PROVIDER:latest",
    "ORG_INTELLIGENCE_SYNTH_MODEL=ORG_INTELLIGENCE_SYNTH_MODEL:latest",
    "ORG_INTELLIGENCE_OPENAI_MAX_TOKENS=ORG_INTELLIGENCE_OPENAI_MAX_TOKENS:latest",
    "ORG_INTELLIGENCE_GEMINI_MAX_OUTPUT_TOKENS=ORG_INTELLIGENCE_GEMINI_MAX_OUTPUT_TOKENS:latest",
    "ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS=ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS:latest"
) -join ","

# Environment variables (non-secret configuration)
$env_vars = @(
    # Core
    "NODE_ENV=production",
    "ENABLE_LOG_STREAMING=true",
    "CALL_EXECUTION_ENABLED=true",
    "GLOBAL_MAX_CONCURRENT_CALLS=50",
    "MAX_CONCURRENT_CALLS=50",

    # Feature Flags
    "FEATURE_FLAGS=argyle_event_drafts",

    # Google Cloud
    "GOOGLE_CLOUD_PROJECT=pivotalb2b-2026",
    "GCP_PROJECT_ID=pivotalb2b-2026",
    "GCS_PROJECT_ID=pivotalb2b-2026",
    "GCS_BUCKET=demandgentic-storage",
    "USE_VERTEX_AI=true",

    # Telnyx App IDs (non-secret)
    "TELNYX_TEXML_APP_ID=2870970047591876264",
    "TELNYX_NUMBER_POOL_ENABLED=true",

    # Voice Provider Configuration
    "VOICE_PROVIDER=google",
    "VOICE_PROVIDER_FALLBACK=true",
    "VOICE_PROVIDER_FALLBACK_TARGET=openai",
    "GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio",

    # Deepgram Transcription
    "DEEPGRAM_MODEL=nova-2-phonecall",
    "DEEPGRAM_LANGUAGE=en-US",

    # AI Quality (now using Vertex AI Gemini natively)
    "CONVERSATION_QUALITY_MODEL=vertex-ai-gemini",

    # Vertex AI Model Overrides
    "VERTEX_REASONING_MODEL=gemini-3-pro-preview",

    # Production URLs
    "BASE_URL=https://demandgentic.ai",
    "PUBLIC_TEXML_HOST=demandgentic.ai",
    # "TELNYX_WEBHOOK_URL=https://demandgentic.ai/api/webhooks/telnyx",

    # OpenAI SIP Configuration
    "OPENAI_SIP_MODEL=gpt-realtime",
    "OPENAI_SIP_VOICE=marin",
    "OPENAI_SIP_INSTRUCTIONS=You are a professional voice assistant.",
    "OPENAI_SIP_SIDEBAND=true",
    "OPENAI_SIP_SIDEBAND_UPDATE=true",
    "OPENAI_SIP_LOG_EVENTS=false",

    # LiveKit Configuration
    "LIVEKIT_URL=wss://demandgentic-wmczsvyo.livekit.cloud",
    "LIVEKIT_API_KEY=APIrrxH8abxypDR",
    "LIVEKIT_API_SECRET=IcnJqDNrrl74YSb1Kwrfl0r5L0sfhfeFbdtxtAFYq7TA",
    "LIVEKIT_SIP_URI=sip:demandgentic-wmczsvyo.sip.livekit.cloud",
    "LIVEKIT_SIP_CONNECTION_ID=2903106223836497802",
    "LIVEKIT_SIP_USERNAME=dglivekitsip",
    "LIVEKIT_SIP_PASSWORD=LKsip2026DmndG99"
) -join ","

Write-Host "============================================"
Write-Host "Step 2: Deploying to Cloud Run"
Write-Host "============================================"
Write-Host ""
Write-Host "Secrets: $($secrets.Split(',').Count) from GCP Secret Manager"
Write-Host "Env vars: $($env_vars.Split(',').Count) non-secret config"
Write-Host ""

gcloud run deploy demandgentic-api `
  --source . `
  --region us-central1 `
  --allow-unauthenticated `
  --clear-base-image `
  --vpc-connector pivotal-connector `
  --vpc-egress private-ranges-only `
  --min-instances 1 `
  --max-instances 50 `
  --cpu 4 `
  --memory 4Gi `
  --concurrency 20 `
  --timeout 900 `
  --set-secrets=$secrets `
  --set-env-vars=$env_vars
