# ============================================
# DemandGentic AI - Multi-Service Cloud Run Deployment
# Deploys the same codebase as 4 separate services:
# 1. demandgentic-web (Main API & Frontend)
# 2. demandgentic-voice (AI Voice Agents & WebSockets)
# 3. demandgentic-analysis (Vertex AI, Queues)
# 4. demandgentic-email (Email Sync & Validation)
# ============================================

$PROJECT_ID = "pivotalb2b-2026"
$REGION = "us-central1"
$REPOSITORY = "cloud-run-source-deploy"
$IMAGE_NAME = "demandgentic-api" # We use the same image for all 3

$ErrorActionPreference = "Stop"

$gcloudExe = (Get-Command gcloud.cmd -ErrorAction SilentlyContinue).Source
if (-not $gcloudExe) {
  $gcloudExe = (Get-Command gcloud -ErrorAction Stop).Source
}

# Get the latest commit SHA for tagging
$SHORT_SHA = (git rev-parse --short HEAD 2>$null)
$SHORT_SHA = if ($SHORT_SHA) { $SHORT_SHA.Trim() } else { "" }
if (-not $SHORT_SHA) {
    $SHORT_SHA = "latest"
}

$IMAGE_URL = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${SHORT_SHA}"

Write-Host "============================================"
Write-Host "Step 1: Building and Pushing Docker Image..."
Write-Host "============================================"
& $gcloudExe builds submit --config cloudbuild.yaml --substitutions "_IMAGE_TAG=$SHORT_SHA" .
if ($LASTEXITCODE -ne 0) {
  throw "Cloud Build failed; aborting deploy."
}

# Common Secrets (Shared across all services)
$secrets = @(
    "DATABASE_URL=DATABASE_URL:latest",
    "JWT_SECRET=JWT_SECRET:latest",
    "SESSION_SECRET=SESSION_SECRET:latest",
    "SECRET_MANAGER_MASTER_KEY=SECRET_MANAGER_MASTER_KEY:latest",
    "OPENAI_API_KEY=OPENAI_API_KEY:latest",
    "OPENAI_WEBHOOK_SECRET=OPENAI_WEBHOOK_SECRET:latest",
    "AI_INTEGRATIONS_OPENAI_API_KEY=AI_INTEGRATIONS_OPENAI_API_KEY:latest",
    "AI_INTEGRATIONS_OPENAI_BASE_URL=AI_INTEGRATIONS_OPENAI_BASE_URL:latest",
    "AI_INTEGRATIONS_ANTHROPIC_API_KEY=AI_INTEGRATIONS_ANTHROPIC_API_KEY:latest",
    "AI_INTEGRATIONS_GEMINI_API_KEY=AI_INTEGRATIONS_GEMINI_API_KEY:latest",
    "AI_INTEGRATIONS_GEMINI_BASE_URL=AI_INTEGRATIONS_GEMINI_BASE_URL:latest",
    "GEMINI_API_KEY=GEMINI_API_KEY:latest",
    "DEEPSEEK_API_KEY=DEEPSEEK_API_KEY:latest",
    "BRAVE_SEARCH_API_KEY=BRAVE_SEARCH_API_KEY:latest",
    "EMAIL_LIST_VERIFY_API_KEY=EMAIL_LIST_VERIFY_API_KEY:latest",
    "PSE_GOOGLE=PSE_GOOGLE:latest",
    "GOOGLE_SEARCH_ENGINE_ID=GOOGLE_SEARCH_ENGINE_ID:latest",
    "GOOGLE_SEARCH_API_KEY=GOOGLE_SEARCH_API_KEY:latest",
    "MICROSOFT_CLIENT_ID=MICROSOFT_CLIENT_ID:latest",
    "MICROSOFT_CLIENT_SECRET=MICROSOFT_CLIENT_SECRET:latest",
    "MICROSOFT_TENANT_ID=MICROSOFT_TENANT_ID:latest",
    "COMPANIES_HOUSE_API_KEY=COMPANIES_HOUSE_API_KEY:latest",
    "GOOGLE_AUTH_CLIENT_ID=GOOGLE_AUTH_CLIENT_ID:latest",
    "GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest",
    "TELNYX_API_KEY=TELNYX_API_KEY:latest",
    "TELNYX_CONNECTION_ID=TELNYX_CONNECTION_ID:latest",
    "TELNYX_CALL_CONTROL_APP_ID=TELNYX_CALL_CONTROL_APP_ID:latest",
    "TELNYX_FROM_NUMBER=TELNYX_FROM_NUMBER:latest",
    "TELNYX_SIP_CONNECTION_ID=TELNYX_SIP_CONNECTION_ID:latest",
    "TELNYX_SIP_PASSWORD=TELNYX_SIP_PASSWORD:latest",
    "TELNYX_SIP_USERNAME=TELNYX_SIP_USERNAME:latest",
    "TELNYX_WEBHOOK_URL=TELNYX_WEBHOOK_URL:latest",
    "PUBLIC_WEBSOCKET_URL=PUBLIC_WEBSOCKET_URL:latest",
    "PUBLIC_WEBHOOK_HOST=PUBLIC_WEBHOOK_HOST:latest",
    "ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest",
    "ELEVENLABS_WEBHOOK_SECRET=ELEVENLABS_WEBHOOK_SECRET:latest",
    "REDIS_URL=REDIS_URL:latest",
    "MAILGUN_API_KEY=MAILGUN_API_KEY:latest",
    "MAILGUN_DOMAIN=MAILGUN_DOMAIN:latest",
    "DEEPGRAM_API_KEY=DEEPGRAM_API_KEY:latest",
    "ORG_INTELLIGENCE_OPENAI_MODEL=ORG_INTELLIGENCE_OPENAI_MODEL:latest",
    "PGDATABASE=PGDATABASE:latest",
    "PGHOST=PGHOST:latest",
    "PGPORT=PGPORT:latest",
    "PGUSER=PGUSER:latest",
    "PGPASSWORD=PGPASSWORD:latest",
    "LIVEKIT_WEBHOOK_SECRET=LIVEKIT_WEBHOOK_SECRET:latest",
    "LIVEKIT_API_KEY=LIVEKIT_API_KEY:latest",
    "LIVEKIT_API_SECRET=LIVEKIT_API_SECRET:latest"
)
$secret_string = $secrets -join ","

# Common Env Vars
$env_vars = @(
    "NODE_ENV=production",
    "TELNYX_NUMBER_POOL_ENABLED=true",
    "TELNYX_TEXML_APP_ID=2870970047591876264",
    "VOICE_PROVIDER=google",
    "VOICE_PROVIDER_FALLBACK=true",
    "VOICE_PROVIDER_FALLBACK_TARGET=openai",
    "GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio",
    "USE_VERTEX_AI=true",
    "GOOGLE_CLOUD_PROJECT=pivotalb2b-2026",
    "GCP_PROJECT_ID=pivotalb2b-2026",
    "GCS_PROJECT_ID=pivotalb2b-2026",
    "GCS_BUCKET=demandgentic-storage",
    "DEEPGRAM_MODEL=nova-2-phonecall",
    "DEEPGRAM_LANGUAGE=en-US",
    "CONVERSATION_QUALITY_MODEL=deepseek-chat",
    "CALL_EXECUTION_ENABLED=true",
    "GLOBAL_MAX_CONCURRENT_CALLS=100",
    "MAX_CONCURRENT_CALLS=100",
    "ENABLE_LOG_STREAMING=true",
    "APP_GIT_SHA=$SHORT_SHA",
    "LIVEKIT_URL=wss://demandgentic-wmczsvyo.livekit.cloud",
    "LIVEKIT_SIP_URI=sip:demandgentic-wmczsvyo.sip.livekit.cloud",
    "LIVEKIT_SIP_CONNECTION_ID=2903106223836497802"
)

Write-Host "============================================"
Write-Host "Step 2: Deploying demandgentic-web (API & UI)"
Write-Host "============================================"
$web_env = $env_vars + @(
  "SERVICE_ROLE=web",
  "BASE_URL=https://app.pivotal-b2b.com",
  "PUBLIC_TEXML_HOST=app.pivotal-b2b.com"
)
$web_env_string = $web_env -join ","

& $gcloudExe run deploy demandgentic-web `
  --image $IMAGE_URL `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --memory 2Gi `
  --cpu 2 `
  --min-instances 1 `
  --max-instances 20 `
  --port 8080 `
  --timeout 900 `
  --concurrency 150 `
  --vpc-connector pivotal-connector `
  --vpc-egress private-ranges-only `
  --set-env-vars $web_env_string `
  --set-secrets $secret_string
if ($LASTEXITCODE -ne 0) {
  throw "Deploy failed for demandgentic-web"
}

Write-Host "============================================"
Write-Host "Step 3: Deploying demandgentic-voice (AI Calls)"
Write-Host "============================================"
$voice_env = $env_vars + @(
  "SERVICE_ROLE=voice",
  "BASE_URL=https://demandgentic.ai",
  "PUBLIC_TEXML_HOST=demandgentic.ai"
)
$voice_env_string = $voice_env -join ","

& $gcloudExe run deploy demandgentic-voice `
  --image $IMAGE_URL `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --memory 4Gi `
  --cpu 4 `
  --min-instances 1 `
  --max-instances 50 `
  --port 8080 `
  --timeout 3600 `
  --concurrency 150 `
  --cpu-boost `
  --vpc-connector pivotal-connector `
  --vpc-egress private-ranges-only `
  --set-env-vars $voice_env_string `
  --set-secrets $secret_string
if ($LASTEXITCODE -ne 0) {
  throw "Deploy failed for demandgentic-voice"
}

Write-Host "============================================"
Write-Host "Step 4: Deploying demandgentic-analysis (Queues & Vertex AI)"
Write-Host "============================================"
$analysis_env = $env_vars + @(
  "SERVICE_ROLE=analysis",
  "BASE_URL=https://app.pivotal-b2b.com",
  "PUBLIC_TEXML_HOST=app.pivotal-b2b.com"
)
$analysis_env_string = $analysis_env -join ","

& $gcloudExe run deploy demandgentic-analysis `
  --image $IMAGE_URL `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --memory 8Gi `
  --cpu 4 `
  --min-instances 1 `
  --max-instances 10 `
  --port 8080 `
  --timeout 3600 `
  --concurrency 80 `
  --vpc-connector pivotal-connector `
  --vpc-egress private-ranges-only `
  --set-env-vars $analysis_env_string `
  --set-secrets $secret_string
if ($LASTEXITCODE -ne 0) {
  throw "Deploy failed for demandgentic-analysis"
}

Write-Host "============================================"
Write-Host "Step 5: Deploying demandgentic-email (Email Sync & Validation)"
Write-Host "============================================"
$email_env = $env_vars + @(
  "SERVICE_ROLE=email",
  "BASE_URL=https://pivotal-b2b.com",
  "PUBLIC_TEXML_HOST=pivotal-b2b.com"
)
$email_env_string = $email_env -join ","

& $gcloudExe run deploy demandgentic-email `
  --image $IMAGE_URL `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --memory 2Gi `
  --cpu 2 `
  --min-instances 1 `
  --max-instances 10 `
  --port 8080 `
  --timeout 3600 `
  --concurrency 80 `
  --vpc-connector pivotal-connector `
  --vpc-egress private-ranges-only `
  --set-env-vars $email_env_string `
  --set-secrets $secret_string
if ($LASTEXITCODE -ne 0) {
  throw "Deploy failed for demandgentic-email"
}

Write-Host "============================================"
Write-Host "Deployment Complete!"
Write-Host "Next Steps:"
Write-Host "1. Map your custom domains in Cloud Run (requested routing):"
Write-Host "   - demandgentic.ai -> demandgentic-voice (AI Calls)"
Write-Host "   - pivotal-b2b.com -> demandgentic-email (Email Campaigns)"
Write-Host "   - app.pivotal-b2b.com -> demandgentic-analysis (Analysis)"
Write-Host "2. Optional: map an internal/admin domain to demandgentic-web if needed"
Write-Host "3. Update Telnyx/LiveKit webhooks to use demandgentic.ai"
Write-Host "============================================"
