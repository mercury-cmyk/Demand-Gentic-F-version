# ============================================
# DemandGentic AI - Multi-Service Cloud Run Deployment
# Deploys the same codebase as 3 separate services:
# 1. demandgentic-voice (AI Voice Agents & WebSockets)
# 2. demandgentic-analysis (Vertex AI, Queues)
# 3. demandgentic-email (Email Sync & Validation)
# ============================================

$PROJECT_ID = $env:GCP_PROJECT_ID
if ([string]::IsNullOrWhiteSpace($PROJECT_ID)) {
  $PROJECT_ID = (gcloud config get-value project 2>$null).Trim()
}
if ([string]::IsNullOrWhiteSpace($PROJECT_ID)) {
  throw "No GCP project configured. Set GCP_PROJECT_ID or run 'gcloud config set project <PROJECT_ID>'."
}

$REGION = if ([string]::IsNullOrWhiteSpace($env:GCP_REGION)) { "us-central1" } else { $env:GCP_REGION }
$REPOSITORY = if ([string]::IsNullOrWhiteSpace($env:ARTIFACT_REPOSITORY)) { "cloud-run-source-deploy" } else { $env:ARTIFACT_REPOSITORY }
$IMAGE_NAME = if ([string]::IsNullOrWhiteSpace($env:IMAGE_NAME)) { "demandgentic-api" } else { $env:IMAGE_NAME } # same image for all 3
$VPC_CONNECTOR = if ([string]::IsNullOrWhiteSpace($env:GCP_VPC_CONNECTOR)) { "" } else { $env:GCP_VPC_CONNECTOR }
$GCS_BUCKET = if ([string]::IsNullOrWhiteSpace($env:GCS_BUCKET)) { "demandgentic-ai-storage" } else { $env:GCS_BUCKET }
$RUNTIME_SERVICE_ACCOUNT = if ([string]::IsNullOrWhiteSpace($env:CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT)) { "" } else { $env:CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT }
$ALLOW_UNAUTHENTICATED = -not [string]::IsNullOrWhiteSpace($env:CLOUD_RUN_ALLOW_UNAUTHENTICATED) -and @("1", "true", "yes") -contains $env:CLOUD_RUN_ALLOW_UNAUTHENTICATED.ToLowerInvariant()
$SKIP_IMAGE_BUILD = -not [string]::IsNullOrWhiteSpace($env:SKIP_IMAGE_BUILD) -and @("1", "true", "yes") -contains $env:SKIP_IMAGE_BUILD.ToLowerInvariant()

$VOICE_BASE_URL = if ([string]::IsNullOrWhiteSpace($env:VOICE_BASE_URL)) { "https://demandgentic.ai" } else { $env:VOICE_BASE_URL }
$VOICE_PUBLIC_HOST = if ([string]::IsNullOrWhiteSpace($env:VOICE_PUBLIC_TEXML_HOST)) { "demandgentic.ai" } else { $env:VOICE_PUBLIC_TEXML_HOST }
$ANALYSIS_BASE_URL = if ([string]::IsNullOrWhiteSpace($env:ANALYSIS_BASE_URL)) { "https://pivotal-b2b.com" } else { $env:ANALYSIS_BASE_URL }
$ANALYSIS_PUBLIC_HOST = if ([string]::IsNullOrWhiteSpace($env:ANALYSIS_PUBLIC_TEXML_HOST)) { "pivotal-b2b.com" } else { $env:ANALYSIS_PUBLIC_TEXML_HOST }
$EMAIL_BASE_URL = if ([string]::IsNullOrWhiteSpace($env:EMAIL_BASE_URL)) { "https://pivotal-b2b.com" } else { $env:EMAIL_BASE_URL }
$EMAIL_PUBLIC_HOST = if ([string]::IsNullOrWhiteSpace($env:EMAIL_PUBLIC_TEXML_HOST)) { "pivotal-b2b.com" } else { $env:EMAIL_PUBLIC_TEXML_HOST }

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
$authArg = if ($ALLOW_UNAUTHENTICATED) { "--allow-unauthenticated" } else { "--no-allow-unauthenticated" }

Write-Host "============================================"
Write-Host "Step 1: Building and Pushing Docker Image..."
Write-Host "============================================"
if ($SKIP_IMAGE_BUILD) {
  Write-Host "Skipping image build (SKIP_IMAGE_BUILD=true). Using image: $IMAGE_URL"
} else {
  & $gcloudExe builds submit --project $PROJECT_ID --tag $IMAGE_URL .
  if ($LASTEXITCODE -ne 0) {
    throw "Cloud Build failed; aborting deploy."
  }
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
    "LIVEKIT_API_SECRET=LIVEKIT_API_SECRET:latest",
    "CLIENT_PORTAL_BASE_URL=CLIENT_PORTAL_BASE_URL:latest"
)
$secret_string = $secrets -join ","

$serviceAccountArgs = @()
if (-not [string]::IsNullOrWhiteSpace($RUNTIME_SERVICE_ACCOUNT)) {
  $serviceAccountArgs = @("--service-account", $RUNTIME_SERVICE_ACCOUNT)
  Write-Host "Using runtime service account: $RUNTIME_SERVICE_ACCOUNT"
}

$vpcArgs = @()
if (-not [string]::IsNullOrWhiteSpace($VPC_CONNECTOR)) {
  $vpcArgs = @("--vpc-connector", $VPC_CONNECTOR, "--vpc-egress", "private-ranges-only")
  Write-Host "Using VPC connector: $VPC_CONNECTOR"
} else {
  $vpcArgs = @("--clear-vpc-connector")
  Write-Host "No VPC connector configured. Clearing any existing VPC connector on services."
}

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
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID",
    "GCP_PROJECT_ID=$PROJECT_ID",
    "GCS_PROJECT_ID=$PROJECT_ID",
    "GCS_BUCKET=$GCS_BUCKET",
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
Write-Host "Step 2: Deploying demandgentic-voice (AI Calls)"
Write-Host "============================================"
$voice_env = $env_vars + @(
  "SERVICE_ROLE=voice",
  "BASE_URL=$VOICE_BASE_URL",
  "PUBLIC_TEXML_HOST=$VOICE_PUBLIC_HOST"
)
$voice_env_string = $voice_env -join ","

& $gcloudExe run deploy demandgentic-voice `
  --project $PROJECT_ID `
  --image $IMAGE_URL `
  --region $REGION `
  --platform managed `
  $authArg `
  --memory 4Gi `
  --cpu 4 `
  --min-instances 1 `
  --max-instances 50 `
  --port 8080 `
  --timeout 3600 `
  --concurrency 150 `
  --cpu-boost `
  @vpcArgs `
  @serviceAccountArgs `
  --set-env-vars $voice_env_string `
  --set-secrets $secret_string
if ($LASTEXITCODE -ne 0) {
  throw "Deploy failed for demandgentic-voice"
}

Write-Host "============================================"
Write-Host "Step 3: Deploying demandgentic-analysis (Queues & Vertex AI)"
Write-Host "============================================"
$analysis_env = $env_vars + @(
  "SERVICE_ROLE=analysis",
  "BASE_URL=$ANALYSIS_BASE_URL",
  "PUBLIC_TEXML_HOST=$ANALYSIS_PUBLIC_HOST"
)
$analysis_env_string = $analysis_env -join ","

& $gcloudExe run deploy demandgentic-analysis `
  --project $PROJECT_ID `
  --image $IMAGE_URL `
  --region $REGION `
  --platform managed `
  $authArg `
  --memory 8Gi `
  --cpu 4 `
  --min-instances 1 `
  --max-instances 10 `
  --port 8080 `
  --timeout 3600 `
  --concurrency 80 `
  @vpcArgs `
  @serviceAccountArgs `
  --set-env-vars $analysis_env_string `
  --set-secrets $secret_string
if ($LASTEXITCODE -ne 0) {
  throw "Deploy failed for demandgentic-analysis"
}

Write-Host "============================================"
Write-Host "Step 4: Deploying demandgentic-email (Email Sync & Validation)"
Write-Host "============================================"
$email_env = $env_vars + @(
  "SERVICE_ROLE=email",
  "BASE_URL=$EMAIL_BASE_URL",
  "PUBLIC_TEXML_HOST=$EMAIL_PUBLIC_HOST"
)
$email_env_string = $email_env -join ","

& $gcloudExe run deploy demandgentic-email `
  --project $PROJECT_ID `
  --image $IMAGE_URL `
  --region $REGION `
  --platform managed `
  $authArg `
  --memory 2Gi `
  --cpu 2 `
  --min-instances 1 `
  --max-instances 10 `
  --port 8080 `
  --timeout 3600 `
  --concurrency 80 `
  @vpcArgs `
  @serviceAccountArgs `
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
Write-Host "   - pivotal-b2b.com -> demandgentic-analysis (Analysis)"
Write-Host "2. Update Telnyx/LiveKit webhooks to use demandgentic.ai"
Write-Host "============================================"
