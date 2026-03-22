#!/bin/bash
# Cloud Run deployment — only bootstrap secrets from GCP Secret Manager.
# All API keys are loaded from the DB Secret Manager at startup.
gcloud.cmd run deploy demandgentic-api \
  --image gcr.io/demandgentic/demandgentic-api:latest \
  --region us-central1 \
  --project demandgentic \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 \
  --min-instances 1 --max-instances 10 \
  --port 8080 \
  --vpc-connector pivotal-connector \
  --vpc-egress private-ranges-only \
  --set-env-vars "NODE_ENV=production,ENABLE_LOG_STREAMING=true,GLOBAL_MAX_CONCURRENT_CALLS=100,MAX_CONCURRENT_CALLS=100,TELNYX_NUMBER_POOL_ENABLED=true,GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio,GOOGLE_CLOUD_PROJECT=demandgentic,GCP_PROJECT_ID=demandgentic,GCS_PROJECT_ID=demandgentic,GCS_BUCKET=demandgentic-prod-storage-2026,USE_VERTEX_AI=true,VOICE_PROVIDER=google,VOICE_PROVIDER_FALLBACK=true,VOICE_PROVIDER_FALLBACK_TARGET=openai,CONVERSATION_QUALITY_MODEL=deepseek-chat,DEEPGRAM_MODEL=nova-2-phonecall,DEEPGRAM_LANGUAGE=en-US,PUBLIC_TEXML_HOST=demandgentic.ai,APP_BASE_URL=https://demandgentic.ai,BASE_URL=https://demandgentic.ai,TELNYX_TEXML_APP_ID=2870970047591876264" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,SESSION_SECRET=SESSION_SECRET:latest,SECRET_MANAGER_MASTER_KEY=SECRET_MANAGER_MASTER_KEY:latest,REDIS_URL=REDIS_URL:latest"