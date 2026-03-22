# 🚀 Execute GCP Migration - One Command

This guide shows you how to run the **fully automated** migration to Google Cloud Platform.

---

## ⚡ Quick Execution (30 minutes)

### Prerequisites

1. ✅ GCP account with billing enabled
2. ✅ Project `pivotalcrm-2026` created
3. ✅ `gcloud` CLI installed ([Download](https://cloud.google.com/sdk/docs/install))
4. ✅ `.env` file with all your credentials (already done ✓)

### Execute Migration

Open your terminal and run:

```bash
# Navigate to project directory
cd "c:\Users\Zahid\Downloads\PivotalMarketingPaltform (2)\PivotalMarketingPaltform"

# Make execution script executable
chmod +x scripts/execute-migration.sh

# Run the automated migration
./scripts/execute-migration.sh
```

**That's it!** The script will:
- ✅ Authenticate with GCP
- ✅ Enable all required APIs
- ✅ Migrate secrets to Secret Manager
- ✅ Create Artifact Registry
- ✅ Build Docker image
- ✅ Deploy to Cloud Run
- ✅ Verify deployment
- ✅ Output your service URL

---

## 📊 What the Script Does

### Step 1: Pre-flight Checks (1 min)
- Verifies `gcloud` CLI is installed
- Checks `.env` file exists
- Counts secrets to migrate

### Step 2: Authentication (2 min)
- Sets GCP project
- Authenticates user account
- Sets application default credentials

### Step 3: Enable APIs (3 min)
- Cloud Run
- Cloud Build
- Artifact Registry
- Secret Manager
- Compute Engine
- Logging & Monitoring

### Step 4: Migrate Secrets (5 min)
- Reads `.env` file
- Creates secrets in Secret Manager
- Grants IAM permissions

### Step 5: Create Artifact Registry (1 min)
- Creates Docker repository
- Configures permissions

### Step 6: Configure IAM (2 min)
- Grants Cloud Build permissions
- Sets up service accounts

### Step 7: Build & Deploy (15 min)
- Builds Docker image
- Pushes to Artifact Registry
- Deploys to Cloud Run
- Configures environment variables

### Step 8: Verify (3 min)
- Tests health endpoint
- Checks logs
- Verifies all services

### Step 9: Summary
- Outputs service URL
- Provides next steps
- Shows useful commands

---

## 🎯 After Migration

Once the script completes, you'll see:

```
╔════════════════════════════════════════════════════════════╗
║              🎉 MIGRATION COMPLETED! 🎉                    ║
╚════════════════════════════════════════════════════════════╝

Service Details:
  • Service Name:    pivotalcrm-service
  • Project ID:      pivotalcrm-2026
  • Region:          us-central1
  • Service URL:     https://pivotalcrm-service-xxx-uc.a.run.app
  • Secrets Migrated: 35
```

### Test Your Application

```bash
# Open in browser
start https://pivotalcrm-service-xxx-uc.a.run.app

# Test API endpoints
curl https://pivotalcrm-service-xxx-uc.a.run.app/health
curl https://pivotalcrm-service-xxx-uc.a.run.app/api/status
```

### View Logs

```bash
# Tail logs in real-time
gcloud run logs tail pivotalcrm-service --region=us-central1

# Read recent logs
gcloud run logs read pivotalcrm-service --region=us-central1 --limit=100
```

---

## ⚠️ If Something Goes Wrong

The script exits on any error. If it fails:

### Check Authentication
```bash
gcloud auth list
gcloud config get-value project
```

### Check Logs
```bash
gcloud run logs read pivotalcrm-service --region=us-central1 --limit=50
```

### Verify Secrets
```bash
gcloud secrets list --project=pivotalcrm-2026
```

### Re-run Migration
```bash
# The script is idempotent - safe to re-run
./scripts/execute-migration.sh
```

### Manual Rollback
```bash
# List revisions
gcloud run revisions list --service=pivotalcrm-service --region=us-central1

# Rollback to previous
gcloud run services update-traffic pivotalcrm-service \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

---

## 📋 Post-Migration Checklist

- [ ] Service URL is accessible
- [ ] Health check responds
- [ ] Login works (Google/Microsoft OAuth)
- [ ] Database queries work
- [ ] Telnyx telephony works
- [ ] ElevenLabs voice AI works
- [ ] All API endpoints respond
- [ ] No errors in logs
- [ ] Set up custom domain (optional)
- [ ] Configure monitoring alerts
- [ ] Update DNS records
- [ ] Notify team of new URL

---

## 💰 Cost Estimate

Based on your configuration:

| Service | Monthly Cost |
|---------|--------------|
| Cloud Run | $10-25 |
| Secret Manager | $2 |
| Artifact Registry | $5 |
| Logging | $5-10 |
| **Total** | **$22-42/month** |

**vs Replit**: ~$300+/month
**Savings**: ~85% 💰

---

## 🎓 Learn More

- [GCP Migration Runbook](GCP_MIGRATION_RUNBOOK.md) - Detailed guide
- [Secrets Inventory](GCP_SECRETS_INVENTORY.md) - All secrets reference
- [Monitoring Setup](GCP_MONITORING_ALERTS.md) - Alerts and dashboards
- [Database Migration](GCP_DATABASE_MIGRATION.md) - Cloud SQL setup

---

## ✅ Success Criteria

Your migration is successful when:

✅ Script completes without errors  
✅ Service URL is accessible  
✅ Health check returns 200 OK  
✅ Application logs show no critical errors  
✅ Database connections work  
✅ All integrations functional  

---

**Ready?** Run: `./scripts/execute-migration.sh` 🚀