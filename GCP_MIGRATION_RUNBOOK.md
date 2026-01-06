# GCP Migration Complete Runbook

## 🎯 Quick Navigation

This is your complete guide to migrating **Pivotal CRM from Replit to Google Cloud Platform**.

### 📚 Key Documents
1. **[README_GCP_MIGRATION.md](README_GCP_MIGRATION.md)** — Start here for quick overview
2. **[GCP_SECRETS_INVENTORY.md](GCP_SECRETS_INVENTORY.md)** — All secrets and environment variables
3. **[GCP_DATABASE_MIGRATION.md](GCP_DATABASE_MIGRATION.md)** — Database and Redis setup
4. **[GCP_NETWORKING_SECURITY.md](GCP_NETWORKING_SECURITY.md)** — Custom domains and IAM
5. **[GCP_MONITORING_ALERTS.md](GCP_MONITORING_ALERTS.md)** — Observability and alerting

### 🚀 Key Scripts
- **`scripts/migrate-secrets-to-gcp.sh`** — Automate Secret Manager setup
- **`scripts/deploy-to-cloud-run.sh`** — Deploy to Cloud Run with all configs
- **`scripts/gcp-deploy.sh`** — Simple one-line deploy
- **`.github/workflows/deploy-gcp.yml`** — GitHub Actions CI/CD

### 📦 Key Files Updated
- **`Dockerfile`** — Multi-stage production build
- **`cloudbuild.yaml`** — Cloud Build pipeline config
- **`.gcloudignore`** — Files to ignore during deployment
- **`gcp/README.md`** — Quick GCP setup notes

---

## 🚀 PHASE 1: INITIAL SETUP (5-10 mins)

### Step 1: Prerequisites
Ensure you have:
- GCP account with `pivotalcrm-2026` project
- `gcloud` CLI installed and authenticated
- GitHub account with this repo access
- Collect all secrets from Replit

### Step 2: Authenticate to GCP
```bash
gcloud auth login
gcloud config set project pivotalcrm-2026
```

### Step 3: Enable Required APIs
```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  compute.googleapis.com
```

### Step 4: Create Artifact Registry Repository
```bash
gcloud artifacts repositories create pivotal-artifacts \
  --repository-format=docker \
  --location=us-central1 \
  --description="Docker images for Pivotal CRM"
```

---

## 🔐 PHASE 2: SECRETS MIGRATION (10-15 mins)

### Step 1: Collect Secrets from Replit
From **Replit → Settings → Secrets**, document all values for:
- `JWT_SECRET`
- `SESSION_SECRET`
- `EMAIL_LIST_VERIFY_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `TELNYX_API_KEY`, `TELNYX_SIP_CONNECTION_ID`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`
- Any other API keys or database URLs

### Step 2: Create `.env` File Locally
```bash
cp .env.example .env

# Edit and fill in all secrets with values from Replit
nano .env
```

### Step 3: Migrate Secrets to Secret Manager
```bash
# Make script executable
chmod +x scripts/migrate-secrets-to-gcp.sh

# Run migration
./scripts/migrate-secrets-to-gcp.sh
```

### Step 4: Verify Secrets
```bash
gcloud secrets list --project=pivotalcrm-2026
```

✅ **All secrets should appear in the list.**

---

## 📊 PHASE 3: DATABASE & CACHE SETUP (15-30 mins)

Choose one option:

### Option A: Cloud SQL (Recommended for production)
See [GCP_DATABASE_MIGRATION.md](GCP_DATABASE_MIGRATION.md) — Option 1A

```bash
PROJECT_ID="pivotalcrm-2026"
REGION="us-central1"
INSTANCE_NAME="pivotal-postgres"

# Create Cloud SQL instance
gcloud sql instances create $INSTANCE_NAME \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=$REGION

# Create database and user, then import data
# (See full guide for detailed steps)
```

### Option B: Keep Using Neon (Faster setup, lower cost)
No action needed — your existing `DATABASE_URL` will continue to work.

---

### Redis Setup

Choose one option:

### Option A: Cloud Memorystore (Recommended)
See [GCP_DATABASE_MIGRATION.md](GCP_DATABASE_MIGRATION.md) — Option 1

```bash
# Create Memorystore instance
gcloud redis instances create pivotal-redis \
  --size=1 \
  --region=$REGION \
  --redis-version=7.0 \
  --tier=basic
```

**Important**: Requires VPC connector setup (see Networking Phase)

### Option B: Keep Using Redis Cloud (Faster setup)
No action needed — your existing `REDIS_URL` will continue to work.

---

## 🌐 PHASE 4: NETWORKING & DOMAINS (10-20 mins)

See [GCP_NETWORKING_SECURITY.md](GCP_NETWORKING_SECURITY.md)

### Step 1: Create VPC Connector (if using Memorystore)
```bash
gcloud compute networks vpc-access connectors create pivotal-connector \
  --region=us-central1 \
  --subnet=default \
  --min-instances=2
```

### Step 2: Map Custom Domain
```bash
DOMAIN="crm.yourdomain.com"
SERVICE="pivotalcrm-service"

gcloud run domain-mappings create \
  --service=$SERVICE \
  --domain=$DOMAIN \
  --region=us-central1
```

### Step 3: Update DNS Records
Get the Cloud Run DNS name:
```bash
gcloud run domain-mappings describe $DOMAIN \
  --format='value(status.resourceRecords)'
```

Add CNAME record at your domain registrar:
- `crm.yourdomain.com` → `ghs.googlehosted.com` (or provided DNS name)

**Wait 15-60 minutes for DNS propagation.**

### Step 4: Update Application Base URL
After domain is live:
```bash
gcloud secrets versions add APP_BASE_URL \
  --data-file=- <<< "https://crm.yourdomain.com"

gcloud secrets versions add TELNYX_WEBHOOK_URL \
  --data-file=- <<< "https://crm.yourdomain.com/webhooks/telnyx"
```

---

## 🚀 PHASE 5: DEPLOYMENT (10-15 mins)

### Step 1: Deploy to Cloud Run (Manual)
```bash
chmod +x scripts/deploy-to-cloud-run.sh
./scripts/deploy-to-cloud-run.sh
```

This will:
- ✅ Enable APIs
- ✅ Create Artifact Registry
- ✅ Grant Cloud Build permissions
- ✅ Build Docker image
- ✅ Push to Artifact Registry
- ✅ Deploy to Cloud Run
- ✅ Output service URL

### Step 2: Test the Deployment
```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe pivotalcrm-service \
  --region=us-central1 \
  --format='value(status.url)')

# Test health endpoint
curl $SERVICE_URL/api/health

# Test API
curl $SERVICE_URL/api/status
```

✅ **You should see JSON responses from the API.**

### Step 3: Check Logs
```bash
gcloud run logs read pivotalcrm-service --region=us-central1 --limit=50
```

If you see errors, check [GCP_MONITORING_ALERTS.md](GCP_MONITORING_ALERTS.md) for troubleshooting.

---

## ⚙️ PHASE 6: CI/CD SETUP (GitHub Actions)

See `.github/workflows/deploy-gcp.yml`

### Step 1: Create GitHub Secrets
In your GitHub repo, add these secrets (Settings → Secrets → Actions):

```bash
GCP_WORKLOAD_IDENTITY_PROVIDER: <your-workload-identity-provider>
GCP_SERVICE_ACCOUNT: <your-service-account>
```

To get these values:
```bash
# Create service account for GitHub
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Deployer"

# Get email
SA_EMAIL=$(gcloud iam service-accounts describe github-deployer \
  --format='value(email)')

# Set up Workload Identity (requires configuration beyond this scope)
# See: https://github.com/google-github-actions/auth
```

### Step 2: Push to GitHub
```bash
git add .
git commit -m "Migrate to GCP Cloud Run"
git push origin main
```

This triggers the GitHub Actions workflow which will:
- Build Docker image
- Push to Artifact Registry
- Deploy to Cloud Run
- Run smoke tests

---

## 📊 PHASE 7: MONITORING & ALERTS (10 mins)

See [GCP_MONITORING_ALERTS.md](GCP_MONITORING_ALERTS.md)

### Step 1: Create Monitoring Dashboard
```bash
# View logs
gcloud run logs read pivotalcrm-service --region=us-central1 --follow
```

### Step 2: Create Alert Policies
In **Cloud Console** → **Monitoring** → **Alerting** → **Create Policy**:

1. **High Error Rate Alert**
   - Condition: Error rate > 5%
   - Duration: 5 minutes
   - Notification: Email

2. **High Latency Alert**
   - Condition: Request latency (p95) > 2000ms
   - Duration: 5 minutes
   - Notification: Email

---

## ✅ PHASE 8: VALIDATION & CLEANUP (10 mins)

### Step 1: Smoke Tests
```bash
# Login page loads
curl -s $SERVICE_URL | grep -q "login" && echo "✓ Login page works"

# API endpoints respond
curl -s $SERVICE_URL/api/health | jq '.' && echo "✓ Health check works"

# Database connected
# (Check logs for "Database connected" messages)
```

### Step 2: Test Core Features
1. ✅ Login with test account
2. ✅ Create contact
3. ✅ Run campaign
4. ✅ Send email/call
5. ✅ Check dashboard

### Step 3: Performance Check
```bash
# Expected response time: < 1000ms
curl -w "@curl-format.txt" -o /dev/null -s https://$SERVICE_URL/api/health
```

### Step 4: Cost Check
```bash
# View Cloud Run pricing
# Estimated: ~$0.15-0.50 per month for Cloud Run + resources
# See: https://cloud.google.com/run/pricing
```

### Step 5: Remove Replit-Specific Files
```bash
# Delete Replit files
rm -f .replit replit.nix
rm -rf .config/replit

# Update .gitignore
echo ".replit" >> .gitignore
echo "replit.nix" >> .gitignore

# Commit cleanup
git add .
git commit -m "Remove Replit-specific files"
git push origin main
```

---

## 🔄 ROLLBACK PROCEDURE

If something goes wrong, rollback is simple:

```bash
# Identify previous image
gcloud run revisions list --region=us-central1 --service=pivotalcrm-service

# Deploy previous revision
gcloud run deploy pivotalcrm-service \
  --image=<previous-image-url> \
  --region=us-central1
```

Or disable the current revision:
```bash
gcloud run services update-traffic pivotalcrm-service \
  --to-revisions=LATEST=0 \
  --region=us-central1
```

---

## 📞 TROUBLESHOOTING

| Issue | Solution |
|---|---|
| Build fails | Check `gcloud builds log <build-id>` |
| Deployment fails | Check logs: `gcloud run logs read pivotalcrm-service` |
| Health check 503 | Database/Redis not connected; check secrets |
| High latency | Increase memory/CPU; check external API timeouts |
| DNS not resolving | Wait 15-60 mins for DNS propagation; check registrar |
| Secrets not injected | Verify IAM permissions with `gcloud iam service-accounts describe` |

See full troubleshooting in [GCP_MONITORING_ALERTS.md](GCP_MONITORING_ALERTS.md#-incident-response-runbook)

---

## 📈 COST ESTIMATION (Monthly)

| Service | Estimate |
|---|---|
| Cloud Run (compute) | ~$10-30 |
| Cloud SQL (db-f1-micro) | ~$15-20 |
| Cloud Memorystore (1GB) | ~$40-50 |
| Secret Manager | ~$0.50 |
| Cloud Build (750 mins free) | ~$0 |
| Cloud Logging | ~$2-5 |
| **Total** | **~$70-110** |

*Or ~$15-40/month if using Neon + Redis Cloud*

---

## 🎓 NEXT STEPS

1. ✅ Follow all phases above
2. ✅ Run smoke tests and validate
3. ✅ Monitor dashboard for 24-48 hours
4. ✅ Gather team feedback
5. ✅ Decommission Replit deployment
6. ✅ Update documentation and team runbooks
7. ✅ Plan capacity scaling if needed

---

## 📚 Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Cloud Memorystore Documentation](https://cloud.google.com/memorystore/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Cloud Monitoring Documentation](https://cloud.google.com/monitoring/docs)

---

## ❓ Support

If you encounter issues:
1. Check the relevant guide document for your phase
2. Review Cloud Logging: `gcloud run logs read pivotalcrm-service`
3. Check Cloud Monitoring dashboard for errors/latency
4. Review the troubleshooting section above
5. Contact GCP Support (if on support plan)

**Good luck with your migration! 🚀**

