GCP Migration Checklist (short)

1) Prereqs
   - Ensure you have gcloud installed and are authenticated: gcloud auth login
   - Set project: gcloud config set project pivotalcrm-2026

2) Create Artifact Registry
   - gcloud artifacts repositories create pivotal-artifacts --repository-format=docker --location=us-central1 --description="Docker images for pivotalcrm"

3) Enable APIs
   - gcloud services enable cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com sqladmin.googleapis.com redis.googleapis.com

4) Secrets
   - Migrate values from .env or Replit into Secret Manager:
     gcloud secrets create JWT_SECRET --data-file=- <<< "$JWT_SECRET"

5) Deploy
   - ./scripts/gcp-deploy.sh

6) Post deployment
   - Configure Cloud SQL or external DB connection, update secrets
   - Configure Cloud Memorystore or external Redis, update REDIS_URL
   - Set up monitoring and alerts

