GCP migration notes — pivotalcrm-2026

Quick start
1. Enable required APIs:
   gcloud services enable cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com sqladmin.googleapis.com redis.googleapis.com

2. Create Artifact Registry (Docker repo):
   gcloud artifacts repositories create pivotal-artifacts --repository-format=docker --location=us-central1 --description="Docker images for pivotalcrm"

3. Grant Cloud Build access to push to Artifact Registry and deploy to Cloud Run:
   gcloud projects add-iam-policy-binding pivotalcrm-2026 --member=serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com --role=roles/artifactregistry.writer
   gcloud projects add-iam-policy-binding pivotalcrm-2026 --member=serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com --role=roles/run.admin

4. Create Cloud SQL instance (Postgres) or plan migration from existing DB. Use import/export SQL dumps.

5. Create Redis (Cloud Memorystore) or keep current provider and update REDIS_URL secret.

6. Add secrets to Secret Manager, then reference them in Cloud Run via the UI or `gcloud run services update`.

7. Deploy to Cloud Run (local test):
   ./scripts/gcp-deploy.sh

Notes and next steps
- Replace placeholders for service account and project number when executing commands.
- After successful staging deployment, create Cloud Build triggers for GitHub push to main.
- Add Cloud Scheduler jobs if you have cron tasks (map to Cloud Run endpoints).

Google-native AI notes
- Gemini is supported via `AI_INTEGRATIONS_GEMINI_API_KEY` for prompt optimization and campaign-learning summaries.
- Set `ORG_LEARNING_PROVIDER=gemini` to force Gemini-generated insights; `auto` uses Gemini when configured.
