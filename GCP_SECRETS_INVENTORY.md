# Secrets Inventory for GCP Secret Manager
# 
# This checklist maps all environment variables and secrets from the Replit deployment
# to GCP Secret Manager for secure storage and Cloud Run injection.
#
# Status: Configure before Cloud Run deployment
# Reference: .env.example, .replit, server code

## 🔐 CRITICAL SECRETS (Required for operation)

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| JWT_SECRET | .env.example | Secret | JWT signing key (min 32 chars) | JWT_SECRET |
| SESSION_SECRET | .env.example | Secret | Session encryption key (min 32 chars) | SESSION_SECRET |
| EMAIL_LIST_VERIFY_API_KEY | .env.example | Secret | Email validation API key | EMAIL_LIST_VERIFY_API_KEY |
| BRAVE_SEARCH_API_KEY | .env.example | Secret | Brave Search API key | BRAVE_SEARCH_API_KEY |

## 🔌 DATABASE & REDIS

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| DATABASE_URL | .replit | Secret | Full Postgres connection string | DATABASE_URL |
| REDIS_URL | .replit | Secret | Redis connection URL | REDIS_URL |

## 📞 TELEPHONY INTEGRATION (Telnyx)

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| TELNYX_API_KEY | .env.example | Secret | Telnyx API key for call management | TELNYX_API_KEY |
| TELNYX_SIP_CONNECTION_ID | .env.example | Secret | Telnyx SIP trunk connection ID | TELNYX_SIP_CONNECTION_ID |
| TELNYX_FROM_NUMBER | .replit | Config | Default phone number for outbound calls | TELNYX_FROM_NUMBER |
| TELNYX_WEBHOOK_URL | .replit | Config | Webhook URL (will be updated to GCP URL) | TELNYX_WEBHOOK_URL |
| TELNYX_SIP_USERNAME | server/routes.ts | Secret | SIP trunk username | TELNYX_SIP_USERNAME |
| TELNYX_SIP_PASSWORD | server/routes.ts | Secret | SIP trunk password | TELNYX_SIP_PASSWORD |

## 🤖 AI SERVICES

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| OPENAI_API_KEY | .env.example | Secret | OpenAI API key | OPENAI_API_KEY |
| AI_INTEGRATIONS_OPENAI_BASE_URL | server code | Config | OpenAI custom base URL (Replit AI) | AI_INTEGRATIONS_OPENAI_BASE_URL |
| AI_INTEGRATIONS_OPENAI_API_KEY | server code | Secret | OpenAI integration key | AI_INTEGRATIONS_OPENAI_API_KEY |
| ASSEMBLYAI_API_KEY | .env.example | Secret | AssemblyAI speech-to-text key | ASSEMBLYAI_API_KEY |
| ELEVENLABS_API_KEY | test-elevenlabs-call.ts | Secret | ElevenLabs Conversational AI key | ELEVENLABS_API_KEY |
| ELEVENLABS_AGENT_ID | .replit | Config | ElevenLabs agent ID (fixed) | ELEVENLABS_AGENT_ID |
| ELEVENLABS_PHONE_NUMBER_ID | .replit | Config | ElevenLabs phone number ID (fixed) | ELEVENLABS_PHONE_NUMBER_ID |
| ELEVENLABS_WEBHOOK_SECRET | .replit | Secret | ElevenLabs webhook signature verification | ELEVENLABS_WEBHOOK_SECRET |

## 📧 EMAIL SERVICE PROVIDERS

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| SENDGRID_API_KEY | .env.example | Secret | SendGrid email API key | SENDGRID_API_KEY |
| AWS_SES_ACCESS_KEY | .env.example | Secret | AWS SES access key | AWS_SES_ACCESS_KEY |
| AWS_SES_SECRET_KEY | .env.example | Secret | AWS SES secret key | AWS_SES_SECRET_KEY |
| AWS_SES_REGION | .env.example | Config | AWS SES region (default: us-east-1) | AWS_SES_REGION |
| MAILGUN_API_KEY | .env.example | Secret | Mailgun email API key | MAILGUN_API_KEY |
| MAILGUN_DOMAIN | .env.example | Config | Mailgun domain name | MAILGUN_DOMAIN |

## 📁 FILE STORAGE (S3)

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| S3_ACCESS_KEY_ID | server/lib/s3.ts | Secret | S3 access key (AWS or compatible) | S3_ACCESS_KEY_ID |
| S3_SECRET_ACCESS_KEY | server/lib/s3.ts | Secret | S3 secret key | S3_SECRET_ACCESS_KEY |
| S3_REGION | server/lib/s3.ts | Config | S3 region (default: us-east-1) | S3_REGION |
| S3_ENDPOINT | server/lib/s3.ts | Config | Custom S3 endpoint (R2, Wasabi, MinIO) | S3_ENDPOINT |
| S3_BUCKET | server/lib/s3.ts | Config | S3 bucket name | S3_BUCKET |
| S3_PUBLIC_BASE | server/lib/s3.ts | Config | CDN public base URL (optional) | S3_PUBLIC_BASE |

## 🔑 M365 / MICROSOFT OAUTH

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| MICROSOFT_CLIENT_ID | server/routes.ts | Secret | Microsoft OAuth app client ID | MICROSOFT_CLIENT_ID |
| MICROSOFT_CLIENT_SECRET | server/routes.ts | Secret | Microsoft OAuth app secret | MICROSOFT_CLIENT_SECRET |
| MICROSOFT_TENANT_ID | server/routes.ts | Config | Microsoft tenant (default: common) | MICROSOFT_TENANT_ID |
| APP_BASE_URL | server/routes.ts | Config | App base URL (update to GCP domain) | APP_BASE_URL |

## 📍 RESOURCES CENTRE INTEGRATION

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| RESOURCES_CENTRE_URL | server/services/resourcesCentreSync.ts | Config | Resources Centre API base URL | RESOURCES_CENTRE_URL |
| RESOURCES_CENTRE_API_KEY | server/services/resourcesCentreSync.ts | Secret | Resources Centre API key | RESOURCES_CENTRE_API_KEY |

## ⚙️ APPLICATION CONFIGURATION

| Secret Name | Source | Type | Description | GCP Secret ID |
|---|---|---|---|---|
| NODE_ENV | Various | Config | Runtime mode (production for GCP) | NODE_ENV |
| PORT | .replit | Config | Application port (always 5000 for Cloud Run) | PORT |
| DB_PASSWORD | .env.example | Secret | Database password (prefer DATABASE_URL) | DB_PASSWORD |
| DB_PORT | .env.example | Config | Database port (default: 5432) | DB_PORT |
| REDIS_PORT | .env.example | Config | Redis port (default: 6379) | REDIS_PORT |
| PGADMIN_PASSWORD | .env.example | Secret | PgAdmin console password (dev only) | PGADMIN_PASSWORD |
| PGADMIN_PORT | .env.example | Config | PgAdmin port (dev only) | PGADMIN_PORT |

---

## 📋 MIGRATION STEPS

### 1. Collect Current Values
From your Replit environment (Settings → Secrets):
```bash
# Export .replit secrets
grep -E "^[A-Z_]+=" .replit | grep -v "^modules\|^run\|^hidden\|^nix\|^deployment\|^env\|^workflows\|^agent\|^ports\|^userenv"
```

### 2. Create Secrets in GCP Secret Manager
Run the automated script:
```bash
./scripts/migrate-secrets-to-gcp.sh
```

### 3. Verify Secrets Created
```bash
gcloud secrets list --project=pivotalcrm-2026
```

### 4. Update Cloud Run to Reference Secrets
The deploy process will inject these as environment variables into Cloud Run.

---

## ⚠️ IMPORTANT NOTES

1. **Sensitive Values**: Some secrets like API keys are shown in Replit's UI. Document which secrets you MUST update:
   - `DATABASE_URL` — likely needs updating if migrating from Neon to Cloud SQL
   - `REDIS_URL` — update to Cloud Memorystore connection string
   - `TELNYX_WEBHOOK_URL` — update to your GCP Cloud Run domain
   - `APP_BASE_URL` — update to your GCP Cloud Run domain

2. **Non-Secret Configs**: Config values (port, region, etc.) are typically not stored in Secret Manager; use Cloud Run environment variables or `.env` in the image.

3. **Replit-Specific Cleanup**:
   - Remove `ELEVENLABS_WEBHOOK_SECRET`, `TELNYX_WEBHOOK_URL` after validating new GCP endpoints
   - Update any hardcoded Replit URLs

---

## ✅ CHECKLIST BEFORE DEPLOYING

- [ ] Collect all secrets from Replit and local .env
- [ ] Run Secret Manager migration script
- [ ] Verify secrets are created in GCP Secret Manager
- [ ] Update `DATABASE_URL` if using Cloud SQL (or keep Neon)
- [ ] Update `REDIS_URL` if using Cloud Memorystore (or keep current)
- [ ] Update `TELNYX_WEBHOOK_URL` to GCP domain (after first deployment)
- [ ] Update `APP_BASE_URL` to GCP domain
- [ ] Test Cloud Run deployment with secrets injected
- [ ] Verify application can access all external services
- [ ] Remove `.replit` and Replit-specific configs from repo

