# Cloud SQL & Redis Migration Guide

This document outlines the steps to migrate your database and cache layer from Replit to GCP.

## 📊 Current Setup (Replit)
- **Database**: Neon (hosted PostgreSQL) or Replit Postgres
- **Redis**: Redis Cloud (external)
- **Connection strings**: Stored in `.replit` and environment variables

## 🎯 Target Setup (GCP)

### Option 1: Cloud SQL for PostgreSQL (Recommended)
**Pros**: Fully managed, automatic backups, VPC integration, easy scaling  
**Cons**: Additional cost (~$15-50/month for small instances)  
**Estimated setup time**: 15-30 minutes

### Option 2: Keep Neon (Cost-optimized)
**Pros**: Lower cost, already configured, no migration needed  
**Cons**: External dependency, latency across clouds  
**Estimated setup time**: 5 minutes (update connection string)

---

## 📋 DATABASE MIGRATION

### Option 1A: Create Cloud SQL Instance

```bash
# Set variables
PROJECT_ID="pivotalcrm-2026"
REGION="us-central1"
INSTANCE_NAME="pivotal-postgres"
DB_NAME="pivotal_crm"
DB_USER="pivotal_user"
DB_PASSWORD=$(openssl rand -base64 32)

# Create Cloud SQL instance
gcloud sql instances create $INSTANCE_NAME \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=$REGION \
  --project=$PROJECT_ID

# Create database
gcloud sql databases create $DB_NAME \
  --instance=$INSTANCE_NAME \
  --project=$PROJECT_ID

# Create user
gcloud sql users create $DB_USER \
  --instance=$INSTANCE_NAME \
  --password="$DB_PASSWORD" \
  --project=$PROJECT_ID

# Authorize Cloud Run to connect
gcloud sql instances patch $INSTANCE_NAME \
  --require-ssl=false \
  --project=$PROJECT_ID

# Get connection string
CLOUDSQL_CONNECTION_NAME=$(gcloud sql instances describe $INSTANCE_NAME \
  --format='value(connectionName)' \
  --project=$PROJECT_ID)

echo "Connection name: $CLOUDSQL_CONNECTION_NAME"
echo "Store this in Secret Manager as CLOUDSQL_CONNECTION_NAME"
```

### Option 1B: Export from Current Database and Import to Cloud SQL

```bash
# Step 1: Export from Replit/Neon
pg_dump -h <neon-host> -U <user> -d pivotal_crm > backup.sql

# Step 2: Create proxy to Cloud SQL
# In one terminal:
cloud_sql_proxy -instances=$CLOUDSQL_CONNECTION_NAME=tcp:5432

# Step 3: Import (in another terminal)
psql -h localhost -U $DB_USER -d $DB_NAME < backup.sql
```

### Option 1C: Use Cloud SQL Auth Proxy in Cloud Run

Update your connection string to use the Cloud SQL Auth Proxy:

```env
# Original (direct connection, requires public IP)
DATABASE_URL=postgresql://user:password@cloudsql-host:5432/pivotal_crm

# With Auth Proxy (recommended)
DATABASE_URL=postgresql://pivotal_user:$DB_PASSWORD@127.0.0.1:5432/pivotal_crm
```

Configure Cloud Run with Cloud SQL socket:

```bash
gcloud run services update $SERVICE \
  --add-cloudsql-instances=$CLOUDSQL_CONNECTION_NAME \
  --region=$REGION \
  --project=$PROJECT_ID
```

### Option 2: Keep Using Neon

No migration needed. Update your secret:

```bash
# Store existing Neon connection string in Secret Manager
gcloud secrets create DATABASE_URL --data-file=- <<< "$NEON_CONNECTION_STRING"
```

---

## 💾 REDIS MIGRATION

### Option 1: Cloud Memorystore for Redis (Recommended)

```bash
PROJECT_ID="pivotalcrm-2026"
REGION="us-central1"
REDIS_INSTANCE="pivotal-redis"
REDIS_TIER="basic"
REDIS_SIZE_GB=1

# Create Memorystore instance
gcloud redis instances create $REDIS_INSTANCE \
  --size=$REDIS_SIZE_GB \
  --region=$REGION \
  --redis-version=7.0 \
  --tier=$REDIS_TIER \
  --project=$PROJECT_ID

# Get connection details
REDIS_HOST=$(gcloud redis instances describe $REDIS_INSTANCE \
  --region=$REGION \
  --format='value(host)' \
  --project=$PROJECT_ID)

REDIS_PORT=$(gcloud redis instances describe $REDIS_INSTANCE \
  --region=$REGION \
  --format='value(port)' \
  --project=$PROJECT_ID)

echo "REDIS_URL=redis://$REDIS_HOST:$REDIS_PORT"
```

**Important**: Cloud Memorystore requires a VPC connector:

```bash
# Create VPC connector
gcloud compute networks vpc-access connectors create pivotal-connector \
  --region=$REGION \
  --subnet=default \
  --project=$PROJECT_ID

# Update Cloud Run to use VPC connector
gcloud run services update $SERVICE \
  --vpc-connector=pivotal-connector \
  --vpc-egress=private-ranges-only \
  --region=$REGION \
  --project=$PROJECT_ID
```

### Option 2: Keep Using Redis Cloud

No migration needed. Update your secret:

```bash
# Store existing Redis Cloud connection string
gcloud secrets create REDIS_URL --data-file=- <<< "redis://default:password@redis-host:port"
```

---

## 🔄 MIGRATION WORKFLOW

### Step 1: Prepare
```bash
# Backup current database (always good practice!)
pg_dump -h <current-host> -U <user> -d pivotal_crm > backup_$(date +%Y%m%d).sql

# Test connection
psql -h <current-host> -U <user> -d pivotal_crm -c "SELECT COUNT(*) FROM users;"
```

### Step 2: Create Cloud SQL Instance (if using Cloud SQL)
```bash
# Run the commands from Option 1A above
```

### Step 3: Create Cloud Memorystore (if using Memorystore)
```bash
# Run the commands from Option 1 above
```

### Step 4: Update Secrets in Secret Manager
```bash
# Update DATABASE_URL
gcloud secrets versions add DATABASE_URL --data-file=- <<< "$NEW_DB_URL"

# Update REDIS_URL
gcloud secrets versions add REDIS_URL --data-file=- <<< "$NEW_REDIS_URL"
```

### Step 5: Import Data (if using Cloud SQL)
```bash
# Export from source
pg_dump <source-connection-string> > data_backup.sql

# Connect to Cloud SQL
cloud_sql_proxy -instances=<connection-name>=tcp:5432 &

# Import
psql -h 127.0.0.1 -U pivotal_user -d pivotal_crm < data_backup.sql
```

### Step 6: Test Connection
```bash
# Deploy test service to verify connectivity
npm run build
docker build -t test-image .

# Push and deploy manually to test
```

### Step 7: Update Application Config
```bash
gcloud run services update $SERVICE \
  --set-env-vars DATABASE_URL="$NEW_DB_URL" \
  --set-env-vars REDIS_URL="$NEW_REDIS_URL" \
  --region=$REGION \
  --project=$PROJECT_ID
```

---

## 🧪 VERIFICATION

After migration, verify:

```bash
# Check Cloud SQL instance status
gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID

# Check Redis instance status
gcloud redis instances describe $REDIS_INSTANCE --region=$REGION --project=$PROJECT_ID

# Check Cloud Run logs for connection errors
gcloud run logs read $SERVICE --region=$REGION --limit=50

# Test API health endpoint
curl https://<service-url>/api/health
```

---

## 💰 COST ESTIMATION (Monthly)

| Component | Option | Estimated Cost |
|---|---|---|
| Database | Cloud SQL (db-f1-micro) | $15-20 |
| Database | Neon (free-ish) | $0-10 |
| Redis | Cloud Memorystore (1GB) | $40-50 |
| Redis | Redis Cloud (1GB) | $15-30 |
| **Total** | Cloud SQL + Memorystore | ~$60-70 |
| **Total** | Neon + Redis Cloud | ~$15-40 |

---

## ⚠️ TROUBLESHOOTING

### Connection Timeout
- Ensure VPC connector is created (for Memorystore)
- Check firewall rules and IP whitelisting
- Verify credentials in Secret Manager

### High Latency
- Use private connection (VPC connector) for Memorystore
- Use Cloud SQL with Cloud Run in same region
- Consider using Cloud SQL Proxy

### Data Loss During Migration
- Always create backups before migration
- Test import/export process first
- Use pg_dump with `--format=directory` for large databases

