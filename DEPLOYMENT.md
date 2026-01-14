# Deploying DemandGentic.ai to Google Cloud Run

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed and authenticated
3. **PostgreSQL Database** (Cloud SQL recommended, or Neon, Supabase, etc.)
4. **Redis** (optional, for background jobs - use Upstash or Memorystore)

## Quick Deploy

### Option 1: Using the deployment script

```bash
# Set your project ID
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1

# Run the deployment script
chmod +x deploy-gcloud.sh
./deploy-gcloud.sh
```

### Option 2: Manual deployment

1. **Authenticate with Google Cloud:**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Enable required APIs:**
   ```bash
   gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com secretmanager.googleapis.com
   ```

3. **Create secrets:**
   ```bash
   # Database URL (get from your PostgreSQL provider)
   echo -n "postgresql://user:pass@host:5432/db" | gcloud secrets create DATABASE_URL --data-file=-
   
   # JWT Secret
   echo -n "$(openssl rand -base64 32)" | gcloud secrets create JWT_SECRET --data-file=-
   ```

4. **Build and deploy:**
   ```bash
   # Build image
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/demandgentic-api
   
   # Deploy
   gcloud run deploy demandgentic-api \
     --image gcr.io/YOUR_PROJECT_ID/demandgentic-api \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --memory 1Gi \
     --set-env-vars "NODE_ENV=production" \
     --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest"
   ```

## Database Setup

### Option A: Cloud SQL (Recommended for production)

1. Create a Cloud SQL PostgreSQL instance:
   ```bash
   gcloud sql instances create demandgentic-db \
     --database-version=POSTGRES_16 \
     --tier=db-f1-micro \
     --region=us-central1
   ```

2. Create database and user:
   ```bash
   gcloud sql databases create pivotal_crm --instance=demandgentic-db
   gcloud sql users create appuser --instance=demandgentic-db --password=YOUR_PASSWORD
   ```

3. Connect Cloud Run to Cloud SQL using the Cloud SQL Proxy (automatic with proper IAM).

### Option B: External PostgreSQL (Neon, Supabase, etc.)

Simply use the connection string from your provider as the `DATABASE_URL` secret.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT token signing |
| `NODE_ENV` | Yes | Set to `production` |
| `REDIS_URL` | No | Redis connection for background jobs |
| `OPENAI_API_KEY` | No | For AI features |
| `TELNYX_API_KEY` | No | For telephony features |

## CI/CD with Cloud Build

The `cloudbuild.yaml` file is configured for automatic deployments:

1. Push to your repository
2. Connect Cloud Build to your repo
3. Create a trigger for the main branch
4. Deployments happen automatically on push

## Custom Domain

```bash
# Map a custom domain
gcloud run domain-mappings create \
  --service demandgentic-api \
  --domain your-domain.com \
  --region us-central1
```

## Monitoring

- **Cloud Run Console**: https://console.cloud.google.com/run
- **Logs**: https://console.cloud.google.com/logs
- **Error Reporting**: https://console.cloud.google.com/errors

## Estimated Costs

- **Cloud Run**: ~$0-50/month (pay per use, includes free tier)
- **Cloud SQL**: ~$10-50/month (depends on instance size)
- **Cloud Build**: ~$0/month (120 free build-minutes/day)
- **Container Registry**: ~$0-5/month (storage costs)

## Troubleshooting

### Container fails to start
- Check logs: `gcloud run logs read demandgentic-api --region us-central1`
- Verify DATABASE_URL is correct
- Ensure database is accessible from Cloud Run

### Database connection issues
- For Cloud SQL: Ensure Cloud SQL Admin API is enabled
- For external DB: Ensure firewall allows Cloud Run IP ranges

### Build failures
- Check Cloud Build logs in console
- Verify Dockerfile and .dockerignore are correct
